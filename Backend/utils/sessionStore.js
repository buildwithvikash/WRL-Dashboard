import sql from "mssql";
import { resolveHostName } from "./clientInfo.js";

// Server-side session tracking on top of the stateless JWT cookie. Sessions
// live in pool3's UserSessions table; account state (Status/Locked) is read
// from pool1's Users table. Both are cached briefly so authenticate() doesn't
// add two DB round trips to every API call — admin actions invalidate the
// cache immediately, so a force logout / deactivation still takes effect on
// the very next request served by this process.

const CACHE_TTL_MS = 10_000;
const TOUCH_INTERVAL_MS = 60_000;
const MAX_CACHE_ENTRIES = 5000;

// A session counts as "online" if it was seen within this window.
export const ONLINE_WINDOW_SECONDS = 5 * 60;

const sessionCache = new Map(); // sid -> { at, verdict }
const userCache = new Map(); // UserID -> { at, verdict }
const lastTouch = new Map(); // sid -> ms

const OK = { ok: true };

const remember = (map, key, verdict) => {
  if (map.size > MAX_CACHE_ENTRIES) map.clear();
  map.set(key, { at: Date.now(), verdict });
};

const revokedMessage = (reason) => {
  switch (reason) {
    case "forced":
      return "You were logged out by an administrator. Please log in again.";
    case "deactivated":
      return "Your account has been deactivated by an administrator.";
    case "locked":
      return "Your account has been locked by an administrator.";
    case "password_reset":
      return "Your password was reset by an administrator. Please log in with the new password.";
    case "role_changed":
      return "Your role was changed by an administrator. Please log in again.";
    case "account_changed":
      return "Your account details were changed by an administrator. Please log in again.";
    case "user":
      return "You have been logged out. Please log in again.";
    default:
      return "Your session is no longer valid. Please log in again.";
  }
};

const accountVerdict = (row) => {
  if (!row) return { ok: false, code: "ACCOUNT_DISABLED", message: "Your account no longer exists." };
  if (row.Status !== 1)
    return { ok: false, code: "ACCOUNT_DISABLED", message: "Your account has been deactivated by an administrator." };
  if (row.Locked)
    return { ok: false, code: "ACCOUNT_DISABLED", message: "Your account has been locked by an administrator." };
  return OK;
};

const touch = (sid) => {
  const now = Date.now();
  if (now - (lastTouch.get(sid) || 0) < TOUCH_INTERVAL_MS) return;
  if (lastTouch.size > MAX_CACHE_ENTRIES) lastTouch.clear();
  lastTouch.set(sid, now);
  global.pool3
    .request()
    .input("sid", sql.UniqueIdentifier, sid)
    .query(`UPDATE UserSessions SET LastSeenAt = GETDATE() WHERE SessionId = @sid AND LogoutAt IS NULL`)
    .catch((err) => console.error("[Session] touch failed:", err.message));
};

// Called by authenticate() with the already-verified JWT payload. Tokens issued
// before sessions existed carry no sid: they skip the session check (and so
// can't be force-logged-out) but are still blocked if the account is disabled.
export const checkSession = async (decoded) => {
  const now = Date.now();

  if (decoded.id && global.pool1) {
    let entry = userCache.get(decoded.id);
    if (!entry || now - entry.at > CACHE_TTL_MS) {
      const r = await global.pool1
        .request()
        .input("id", sql.NVarChar(50), decoded.id)
        .query(`SELECT Status, Locked FROM Users WHERE UserID = @id`);
      remember(userCache, decoded.id, accountVerdict(r.recordset[0]));
      entry = userCache.get(decoded.id);
    }
    if (!entry.verdict.ok) return entry.verdict;
  }

  if (decoded.sid && global.pool3) {
    let entry = sessionCache.get(decoded.sid);
    if (!entry || now - entry.at > CACHE_TTL_MS) {
      const r = await global.pool3
        .request()
        .input("sid", sql.UniqueIdentifier, decoded.sid)
        .query(`SELECT LogoutAt, LogoutReason FROM UserSessions WHERE SessionId = @sid`);
      const row = r.recordset[0];
      const verdict =
        row && !row.LogoutAt
          ? OK
          : { ok: false, code: "SESSION_REVOKED", message: revokedMessage(row?.LogoutReason) };
      remember(sessionCache, decoded.sid, verdict);
      entry = sessionCache.get(decoded.sid);
    }
    if (!entry.verdict.ok) return entry.verdict;
    touch(decoded.sid);
  }

  return OK;
};

export const createSession = async ({ sid, user, ip, userAgent }) => {
  await global.pool3
    .request()
    .input("sid", sql.UniqueIdentifier, sid)
    .input("userCode", sql.Int, Number.isInteger(Number(user.UserCode)) ? Number(user.UserCode) : null)
    .input("userId", sql.NVarChar(50), user.UserID)
    .input("userName", sql.NVarChar(200), user.UserName)
    .input("roleName", sql.NVarChar(100), user.RoleName)
    .input("ip", sql.NVarChar(64), ip)
    .input("ua", sql.NVarChar(500), userAgent)
    .query(`
      INSERT INTO UserSessions (SessionId, UserCode, UserID, UserName, RoleName, IpAddress, UserAgent, ExpiresAt)
      VALUES (@sid, @userCode, @userId, @userName, @roleName, @ip, @ua, DATEADD(DAY, 1, GETDATE()))
    `);
};

// The host lookup can take a couple of seconds on a network with slow DNS, so
// it runs after the response has gone out and fills the row in afterwards.
export const attachHostToSession = async (sid, ip) => {
  const host = await resolveHostName(ip);
  if (host) {
    await global.pool3
      .request()
      .input("sid", sql.UniqueIdentifier, sid)
      .input("host", sql.NVarChar(255), host)
      .query(`UPDATE UserSessions SET HostName = @host WHERE SessionId = @sid`);
  }
  return host;
};

// Marks sessions as ended and drops the cached "still valid" verdicts so the
// next request from those sessions is rejected straight away.
export const revokeSessions = async ({ sid, userId, exceptUserId, reason, revokedBy }) => {
  const rq = global.pool3
    .request()
    .input("reason", sql.NVarChar(30), reason)
    .input("by", sql.NVarChar(100), revokedBy || null);

  let where = "LogoutAt IS NULL";
  if (sid) {
    rq.input("sid", sql.UniqueIdentifier, sid);
    where += " AND SessionId = @sid";
  }
  if (userId) {
    rq.input("userId", sql.NVarChar(50), userId);
    where += " AND UserID = @userId";
  }
  if (exceptUserId) {
    rq.input("exceptUserId", sql.NVarChar(50), exceptUserId);
    where += " AND UserID <> @exceptUserId";
  }

  const r = await rq.query(
    `UPDATE UserSessions SET LogoutAt = GETDATE(), LogoutReason = @reason, RevokedBy = @by WHERE ${where}`,
  );
  sessionCache.clear();
  return r.rowsAffected[0] || 0;
};

export const invalidateUserCache = (userId) => {
  if (userId) userCache.delete(userId);
  else userCache.clear();
};

// Never throws — an audit-log write failure must not break the action being logged.
export const logAuthEvent = async ({ type, userId, userName, actor, ip, host, detail }) => {
  try {
    await global.pool3
      .request()
      .input("type", sql.NVarChar(40), type)
      .input("userId", sql.NVarChar(50), userId ? String(userId).slice(0, 50) : null)
      .input("userName", sql.NVarChar(200), userName || null)
      .input("actorId", sql.NVarChar(50), actor?.id || null)
      .input("actorName", sql.NVarChar(200), actor?.name || null)
      .input("ip", sql.NVarChar(64), ip || null)
      .input("host", sql.NVarChar(255), host || null)
      .input("detail", sql.NVarChar(500), detail ? String(detail).slice(0, 500) : null)
      .query(`
        INSERT INTO AuthAuditLog (EventType, UserID, UserName, ActorUserID, ActorName, IpAddress, HostName, Detail)
        VALUES (@type, @userId, @userName, @actorId, @actorName, @ip, @host, @detail)
      `);
  } catch (err) {
    console.error("[AuthAudit] failed to write event:", type, err.message);
  }
};

// Login/logout audit rows want the host too, but must not delay the response.
export const logAuthEventWithHost = (event) => {
  resolveHostName(event.ip)
    .then((host) => logAuthEvent({ ...event, host }))
    .catch(() => logAuthEvent(event));
};
