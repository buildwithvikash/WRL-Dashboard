import sql from "mssql";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";
import { getClientIp } from "../../utils/clientInfo.js";
import { generateUserCode } from "../../utils/userCode.js";
import {
  ONLINE_WINDOW_SECONDS,
  revokeSessions,
  invalidateUserCache,
  logAuthEventWithHost,
} from "../../utils/sessionStore.js";

// Settings > User Access. Super Admin only (enforced in the route). Reads the
// account list from GARUDA's Users table (pool1) and merges it with live
// session data from UserSessions (pool3) in JS — they're different databases.

const BCRYPT_SALT_ROUNDS = 10;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 30; // Users.Password is NVARCHAR(30)
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Users.Status values seen in the data: 1 = active, 0 = de-active, 200 = signed
// up and awaiting admin approval (login only accepts 1).
const ACCOUNT_STATUS = { ACTIVE: 1, DEACTIVATED: 0 };
const accountStatusLabel = (s) =>
  s === 1 ? "active" : s === 0 ? "deactivated" : s === 200 ? "pending" : `unknown`;

const actorOf = (req) => ({ id: req.user.id, name: req.user.name });

const audit = (req, type, target, detail) =>
  logAuthEventWithHost({
    type,
    userId: target?.UserID,
    userName: target?.UserName,
    actor: actorOf(req),
    ip: getClientIp(req),
    detail,
  });

const loadTarget = async (userCodeParam) => {
  const userCode = Number(userCodeParam);
  if (!Number.isInteger(userCode)) throw new AppError("Invalid user code.", 400);

  const r = await global.pool1
    .request()
    .input("userCode", sql.Int, userCode)
    .query(`SELECT UserCode, UserID, UserName, UserRole, Status, Locked, SystemUser FROM Users WHERE UserCode = @userCode`);

  const target = r.recordset[0];
  if (!target) throw new AppError("User not found.", 404);
  return target;
};

const assertNotSelf = (req, target, what) => {
  if (target.UserID === req.user.id) {
    throw new AppError(`You can't ${what} your own account.`, 400);
  }
};

const assertNotSystemUser = (target, what) => {
  if (target.SystemUser) {
    throw new AppError(`"${target.UserName}" is a system account and can't be ${what}.`, 400);
  }
};

const USER_ID_RE = /^[A-Za-z0-9._-]{2,50}$/;

const cleanName = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

const validateUserId = (userId) => {
  if (!USER_ID_RE.test(userId)) {
    throw new AppError("Employee ID must be 2–50 characters: letters, numbers, dot, dash or underscore.", 400);
  }
};

const validateUserName = (userName) => {
  if (userName.length < 2 || userName.length > 150) {
    throw new AppError("Name must be 2–150 characters.", 400);
  }
};

const loadRole = async (roleCode) => {
  const code = Number(roleCode);
  if (!Number.isInteger(code)) throw new AppError("Please choose a role.", 400);
  const r = await global.pool1
    .request()
    .input("code", sql.Int, code)
    .query(`SELECT RoleCode, RoleName FROM UserRoles WHERE RoleCode = @code`);
  if (!r.recordset[0]) throw new AppError("That role doesn't exist.", 400);
  return r.recordset[0];
};

const generateTempPassword = () => {
  // No 0/O/1/l/I so it can be read out over the phone without mix-ups.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join("");
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /user-access/users — every account + its presence/last-login info
═══════════════════════════════════════════════════════════════════════ */
export const getUsers = tryCatch(async (req, res) => {
  const [usersR, presenceR, lastLoginR] = await Promise.all([
    global.pool1.request().query(`
      SELECT U.UserCode, U.UserID, U.UserName, U.Status, U.Locked, U.WrongPw,
             U.LastActivityOn, U.LastPwChOn, U.SystemUser, U.UserRole, R.RoleName
      FROM Users U
      LEFT JOIN UserRoles R ON R.RoleCode = U.UserRole
      ORDER BY U.UserName
    `),
    global.pool3.request().query(`
      SELECT UserID,
             COUNT(*) AS ActiveSessions,
             MIN(DATEDIFF(SECOND, LastSeenAt, GETDATE())) AS LastSeenAgoSec
      FROM UserSessions
      WHERE LogoutAt IS NULL AND ExpiresAt > GETDATE()
      GROUP BY UserID
    `),
    global.pool3.request().query(`
      SELECT UserID, IpAddress, HostName, UserAgent,
             DATEDIFF(SECOND, LoginAt, GETDATE()) AS LoginAgoSec
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY UserID ORDER BY LoginAt DESC) AS rn
        FROM UserSessions
      ) x
      WHERE rn = 1
    `),
  ]);

  const presence = new Map(presenceR.recordset.map((r) => [r.UserID, r]));
  const lastLogin = new Map(lastLoginR.recordset.map((r) => [r.UserID, r]));

  const users = usersR.recordset.map((u) => {
    const p = presence.get(u.UserID);
    const l = lastLogin.get(u.UserID);
    const activeSessions = p?.ActiveSessions || 0;
    return {
      userCode: u.UserCode,
      userId: u.UserID,
      userName: u.UserName,
      roleCode: u.UserRole,
      roleName: u.RoleName || "—",
      statusCode: u.Status,
      status: accountStatusLabel(u.Status),
      locked: !!u.Locked,
      wrongPasswordCount: u.WrongPw || 0,
      isSystemUser: !!u.SystemUser,
      lastActivityOn: u.LastActivityOn,
      activeSessions,
      isOnline: activeSessions > 0 && p.LastSeenAgoSec <= ONLINE_WINDOW_SECONDS,
      lastSeenAgoSec: activeSessions > 0 ? p.LastSeenAgoSec : null,
      lastLoginAgoSec: l?.LoginAgoSec ?? null,
      lastIp: l?.IpAddress || null,
      lastHost: l?.HostName || null,
      lastUserAgent: l?.UserAgent || null,
    };
  });

  const summary = {
    total: users.length,
    online: users.filter((u) => u.isOnline).length,
    activeSessions: users.reduce((a, u) => a + u.activeSessions, 0),
    active: users.filter((u) => u.status === "active" && !u.locked).length,
    deactivated: users.filter((u) => u.status === "deactivated").length,
    pending: users.filter((u) => u.status === "pending").length,
    locked: users.filter((u) => u.locked).length,
  };

  res.status(200).json({ success: true, data: users, summary, onlineWindowSeconds: ONLINE_WINDOW_SECONDS });
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /user-access/roles — role list for the create / edit dropdowns
═══════════════════════════════════════════════════════════════════════ */
export const getRoles = tryCatch(async (req, res) => {
  const r = await global.pool1.request().query(`SELECT RoleCode, RoleName FROM UserRoles ORDER BY RoleName`);
  res.status(200).json({
    success: true,
    data: r.recordset.map((x) => ({ roleCode: x.RoleCode, roleName: x.RoleName })),
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/users  { userId, userName, roleCode, password? }
   Admin-created accounts are active straight away (no approval step). Omit
   password to have a temporary one generated and returned once. Written the
   same way signup does — Password (legacy plaintext) + PasswordHash (bcrypt).
═══════════════════════════════════════════════════════════════════════ */
export const createUser = tryCatch(async (req, res) => {
  const userId = String(req.body.userId ?? "").trim();
  const userName = cleanName(req.body.userName);
  validateUserId(userId);
  validateUserName(userName);
  const role = await loadRole(req.body.roleCode);

  const supplied = req.body.password;
  const generated = !supplied;
  const password = generated ? generateTempPassword() : supplied;
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new AppError(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, 400);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const tx = global.pool1.transaction();
  await tx.begin();
  let userCode;
  try {
    const dup = await tx
      .request()
      .input("id", sql.NVarChar(50), userId)
      .query(`SELECT 1 FROM Users WHERE UserID = @id`);
    if (dup.recordset.length > 0) {
      throw new AppError(`Employee ID "${userId}" already exists.`, 409);
    }

    userCode = await generateUserCode(() => tx.request());

    await tx
      .request()
      .input("UserCode", sql.Int, Number(userCode))
      .input("UserID", sql.NVarChar(50), userId)
      .input("UserName", sql.NVarChar(150), userName)
      .input("Password", sql.NVarChar(PASSWORD_MAX), password)
      .input("PasswordHash", sql.NVarChar(255), passwordHash)
      .input("UserRole", sql.Int, role.RoleCode)
      .query(`
        INSERT INTO Users (
          UserCode, UserID, UserName, Password, PasswordHash, UserRole, Employee,
          LastActivityOn, LastPwChOn, WrongPw, Photo, Locked, DefaultForm, SystemUser, Status
        )
        VALUES (
          @UserCode, @UserID, @UserName, @Password, @PasswordHash, @UserRole, NULL,
          NULL, GETDATE(), 0, NULL, 0, 0, 0, 1
        )
      `);

    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }

  audit(req, "USER_CREATED", { UserID: userId, UserName: userName }, `Created as "${role.RoleName}"`);

  res.status(201).json({
    success: true,
    message: `${userName} was created.`,
    userCode: Number(userCode),
    userId,
    ...(generated ? { temporaryPassword: password } : {}),
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   PUT /user-access/users/:userCode  { userName?, roleCode?, userId? }
   Only fields that actually changed are written. A role or employee-ID change
   ends the user's sessions (their token carries the old role / ID); you can't
   change your own role or ID, and system accounts aren't editable.
═══════════════════════════════════════════════════════════════════════ */
export const updateUser = tryCatch(async (req, res) => {
  const target = await loadTarget(req.params.userCode);
  assertNotSystemUser(target, "edited");

  const isSelf = target.UserID === req.user.id;
  const changes = [];
  const sets = [];
  const rq = global.pool1.request().input("userCode", sql.Int, target.UserCode);

  let newName = target.UserName;
  if (req.body.userName !== undefined) {
    newName = cleanName(req.body.userName);
    validateUserName(newName);
  }
  if (newName !== target.UserName) {
    sets.push("UserName = @userName");
    rq.input("userName", sql.NVarChar(150), newName);
    changes.push(`Name: "${target.UserName}" → "${newName}"`);
  }

  let roleChanged = false;
  if (req.body.roleCode !== undefined && Number(req.body.roleCode) !== target.UserRole) {
    if (isSelf) throw new AppError("You can't change your own role.", 400);
    const newRole = await loadRole(req.body.roleCode);
    const oldRole = await global.pool1
      .request()
      .input("code", sql.Int, target.UserRole)
      .query(`SELECT RoleName FROM UserRoles WHERE RoleCode = @code`);
    sets.push("UserRole = @userRole");
    rq.input("userRole", sql.Int, newRole.RoleCode);
    changes.push(`Role: "${oldRole.recordset[0]?.RoleName ?? target.UserRole}" → "${newRole.RoleName}"`);
    roleChanged = true;
  }

  let idChanged = false;
  let newUserId = target.UserID;
  if (req.body.userId !== undefined) {
    newUserId = String(req.body.userId).trim();
    if (newUserId !== target.UserID) {
      if (isSelf) throw new AppError("You can't change your own employee ID.", 400);
      validateUserId(newUserId);
      const dup = await global.pool1
        .request()
        .input("id", sql.NVarChar(50), newUserId)
        .input("code", sql.Int, target.UserCode)
        .query(`SELECT 1 FROM Users WHERE UserID = @id AND UserCode <> @code`);
      if (dup.recordset.length > 0) throw new AppError(`Employee ID "${newUserId}" already exists.`, 409);
      sets.push("UserID = @newUserId");
      rq.input("newUserId", sql.NVarChar(50), newUserId);
      changes.push(`Employee ID: "${target.UserID}" → "${newUserId}"`);
      idChanged = true;
    }
  }

  if (sets.length === 0) throw new AppError("No changes to save.", 400);

  await rq.query(`UPDATE Users SET ${sets.join(", ")} WHERE UserCode = @userCode`);

  let loggedOut = 0;
  if (roleChanged || idChanged) {
    loggedOut = await revokeSessions({
      userId: target.UserID,
      reason: roleChanged ? "role_changed" : "account_changed",
      revokedBy: req.user.id,
    });
  }
  invalidateUserCache(target.UserID);
  invalidateUserCache(newUserId);

  audit(
    req,
    "USER_UPDATED",
    { UserID: newUserId, UserName: newName },
    `${changes.join("; ")}${loggedOut ? ` — ${loggedOut} session(s) ended` : ""}`,
  );

  res.status(200).json({
    success: true,
    message: `${newName} was updated${loggedOut ? " and logged out so the change takes effect" : ""}.`,
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /user-access/sessions — every live (not logged-out, not expired) session
═══════════════════════════════════════════════════════════════════════ */
export const getSessions = tryCatch(async (req, res) => {
  const r = await global.pool3.request().query(`
    SELECT SessionId, UserID, UserName, RoleName, IpAddress, HostName, UserAgent,
           DATEDIFF(SECOND, LoginAt, GETDATE())    AS LoginAgoSec,
           DATEDIFF(SECOND, LastSeenAt, GETDATE()) AS LastSeenAgoSec
    FROM UserSessions
    WHERE LogoutAt IS NULL AND ExpiresAt > GETDATE()
    ORDER BY LastSeenAt DESC
  `);

  const data = r.recordset.map((s) => ({
    sessionId: String(s.SessionId).toLowerCase(),
    userId: s.UserID,
    userName: s.UserName,
    roleName: s.RoleName,
    ipAddress: s.IpAddress,
    hostName: s.HostName,
    userAgent: s.UserAgent,
    loginAgoSec: s.LoginAgoSec,
    lastSeenAgoSec: s.LastSeenAgoSec,
    isOnline: s.LastSeenAgoSec <= ONLINE_WINDOW_SECONDS,
    isCurrent: String(s.SessionId).toLowerCase() === String(req.user.sid || "").toLowerCase(),
  }));

  res.status(200).json({ success: true, data, onlineWindowSeconds: ONLINE_WINDOW_SECONDS });
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /user-access/audit — login attempts + admin actions, newest first
═══════════════════════════════════════════════════════════════════════ */
export const getAuditLog = tryCatch(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 200, 1), 1000);
  const { userId, eventType } = req.query;

  const rq = global.pool3.request().input("limit", sql.Int, limit);
  let where = "1 = 1";
  if (userId) {
    rq.input("userId", sql.NVarChar(50), String(userId).trim());
    where += " AND (UserID = @userId OR ActorUserID = @userId)";
  }
  if (eventType) {
    rq.input("eventType", sql.NVarChar(40), String(eventType));
    where += " AND EventType = @eventType";
  }

  const r = await rq.query(`
    SELECT TOP (@limit) Id, EventType, UserID, UserName, ActorUserID, ActorName,
           IpAddress, HostName, Detail, CreatedAt
    FROM AuthAuditLog
    WHERE ${where}
    ORDER BY Id DESC
  `);

  res.status(200).json({ success: true, data: r.recordset });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/users/:userCode/status  { action: "activate" | "deactivate" }
   "activate" also approves a pending signup (Status 200 -> 1).
═══════════════════════════════════════════════════════════════════════ */
export const setAccountStatus = tryCatch(async (req, res) => {
  const { action } = req.body;
  if (!["activate", "deactivate"].includes(action)) {
    throw new AppError('action must be "activate" or "deactivate".', 400);
  }

  const target = await loadTarget(req.params.userCode);

  if (action === "deactivate") {
    assertNotSelf(req, target, "deactivate");
    assertNotSystemUser(target, "deactivated");
  }

  const newStatus = action === "activate" ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.DEACTIVATED;
  if (target.Status === newStatus) {
    throw new AppError(`Account is already ${accountStatusLabel(newStatus)}.`, 409);
  }

  await global.pool1
    .request()
    .input("userCode", sql.Int, target.UserCode)
    .input("status", sql.Int, newStatus)
    .query(`UPDATE Users SET Status = @status WHERE UserCode = @userCode`);

  let loggedOut = 0;
  if (action === "deactivate") {
    loggedOut = await revokeSessions({ userId: target.UserID, reason: "deactivated", revokedBy: req.user.id });
  }
  invalidateUserCache(target.UserID);

  const wasPending = target.Status === 200;
  audit(
    req,
    action === "activate" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    target,
    action === "activate"
      ? wasPending ? "Signup approved" : "Account re-activated"
      : `Account deactivated${loggedOut ? `, ${loggedOut} session(s) ended` : ""}`,
  );

  res.status(200).json({
    success: true,
    message:
      action === "activate"
        ? `${target.UserName} is now active.`
        : `${target.UserName} was deactivated${loggedOut ? ` and logged out of ${loggedOut} session(s)` : ""}.`,
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/users/:userCode/lock  { locked: boolean }
   Unlocking also clears the wrong-password counter.
═══════════════════════════════════════════════════════════════════════ */
export const setLocked = tryCatch(async (req, res) => {
  const { locked } = req.body;
  if (typeof locked !== "boolean") throw new AppError("locked must be true or false.", 400);

  const target = await loadTarget(req.params.userCode);

  if (locked) {
    assertNotSelf(req, target, "lock");
    assertNotSystemUser(target, "locked");
  }

  await global.pool1
    .request()
    .input("userCode", sql.Int, target.UserCode)
    .input("locked", sql.Bit, locked)
    .query(`
      UPDATE Users
      SET Locked = @locked${locked ? "" : ", WrongPw = 0"}
      WHERE UserCode = @userCode
    `);

  let loggedOut = 0;
  if (locked) {
    loggedOut = await revokeSessions({ userId: target.UserID, reason: "locked", revokedBy: req.user.id });
  }
  invalidateUserCache(target.UserID);

  audit(
    req,
    locked ? "USER_LOCKED" : "USER_UNLOCKED",
    target,
    locked ? `Account locked${loggedOut ? `, ${loggedOut} session(s) ended` : ""}` : "Account unlocked, wrong-password count reset",
  );

  res.status(200).json({
    success: true,
    message: locked ? `${target.UserName} was locked.` : `${target.UserName} was unlocked.`,
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/users/:userCode/force-logout — end every session of a user
═══════════════════════════════════════════════════════════════════════ */
export const forceLogoutUser = tryCatch(async (req, res) => {
  const target = await loadTarget(req.params.userCode);
  assertNotSelf(req, target, "force-logout");

  const ended = await revokeSessions({ userId: target.UserID, reason: "forced", revokedBy: req.user.id });
  audit(req, "FORCE_LOGOUT", target, `${ended} session(s) ended`);

  res.status(200).json({
    success: true,
    message: ended
      ? `${target.UserName} was logged out of ${ended} session(s).`
      : `${target.UserName} has no active session to end.`,
    ended,
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/users/:userCode/reset-password  { newPassword? }
   Omit newPassword to have a temporary one generated (returned once).
   Mirrors changePassword(): writes the legacy plaintext column and the bcrypt
   hash together. The user's sessions are ended so the old password is dead.
═══════════════════════════════════════════════════════════════════════ */
export const resetPassword = tryCatch(async (req, res) => {
  const supplied = req.body?.newPassword;
  const target = await loadTarget(req.params.userCode);

  assertNotSelf(req, target, "reset the password of"); // use Change Password for your own
  assertNotSystemUser(target, "password-reset here");

  let newPassword = supplied;
  const generated = !supplied;
  if (generated) {
    newPassword = generateTempPassword();
  } else if (
    typeof newPassword !== "string" ||
    newPassword.length < PASSWORD_MIN ||
    newPassword.length > PASSWORD_MAX
  ) {
    throw new AppError(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await global.pool1
    .request()
    .input("userCode", sql.Int, target.UserCode)
    .input("password", sql.NVarChar(PASSWORD_MAX), newPassword)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .query(`
      UPDATE Users
      SET Password = @password, PasswordHash = @passwordHash, LastPwChOn = GETDATE(), WrongPw = 0
      WHERE UserCode = @userCode
    `);

  const ended = await revokeSessions({ userId: target.UserID, reason: "password_reset", revokedBy: req.user.id });
  invalidateUserCache(target.UserID);

  audit(
    req,
    "PASSWORD_RESET",
    target,
    `${generated ? "Temporary password generated" : "New password set"} by admin${ended ? `, ${ended} session(s) ended` : ""}`,
  );

  res.status(200).json({
    success: true,
    message: `Password reset for ${target.UserName}.`,
    ...(generated ? { temporaryPassword: newPassword } : {}),
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/sessions/:sessionId/force-logout — end one session
═══════════════════════════════════════════════════════════════════════ */
export const forceLogoutSession = tryCatch(async (req, res) => {
  const { sessionId } = req.params;
  if (!GUID_RE.test(sessionId)) throw new AppError("Invalid session id.", 400);

  if (String(req.user.sid || "").toLowerCase() === sessionId.toLowerCase()) {
    throw new AppError("That's your current session — use Logout instead.", 400);
  }

  const found = await global.pool3
    .request()
    .input("sid", sql.UniqueIdentifier, sessionId)
    .query(`SELECT UserID, UserName, IpAddress FROM UserSessions WHERE SessionId = @sid AND LogoutAt IS NULL`);
  const session = found.recordset[0];
  if (!session) throw new AppError("Session not found or already ended.", 404);

  await revokeSessions({ sid: sessionId, reason: "forced", revokedBy: req.user.id });
  audit(req, "FORCE_LOGOUT", { UserID: session.UserID, UserName: session.UserName }, `Session from ${session.IpAddress || "unknown IP"} ended`);

  res.status(200).json({ success: true, message: `${session.UserName}'s session was ended.` });
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /user-access/sessions/force-logout-all — everyone except the caller
═══════════════════════════════════════════════════════════════════════ */
export const forceLogoutAll = tryCatch(async (req, res) => {
  const ended = await revokeSessions({ exceptUserId: req.user.id, reason: "forced", revokedBy: req.user.id });
  audit(req, "FORCE_LOGOUT_ALL", null, `${ended} session(s) ended for all other users`);

  res.status(200).json({ success: true, message: `${ended} session(s) ended.`, ended });
});
