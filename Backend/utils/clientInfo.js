import dns from "node:dns";
import { execFile } from "node:child_process";

const HOST_CACHE_TTL_MS = 60 * 60 * 1000;
const REVERSE_DNS_TIMEOUT_MS = 1500;
const NBTSTAT_TIMEOUT_MS = 2500;

const hostCache = new Map(); // ip -> { host, at }

const stripV6Mapping = (ip) => (ip?.startsWith("::ffff:") ? ip.slice(7) : ip);

export const isLoopback = (ip) => ip === "::1" || ip === "127.0.0.1";

// X-Forwarded-For is only honoured when the direct peer is loopback (a reverse
// proxy on this box, e.g. the Vite dev proxy) or TRUST_PROXY=true is set —
// otherwise any LAN client could spoof its own IP in the audit trail.
export const getClientIp = (req) => {
  const peer = stripV6Mapping(req.socket?.remoteAddress || req.ip || "");
  const xff = req.headers["x-forwarded-for"];
  const trustProxy = process.env.TRUST_PROXY === "true" || isLoopback(peer);
  if (trustProxy && xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return stripV6Mapping(first);
  }
  return peer || null;
};

const reverseDns = async (ip) => {
  let timer;
  try {
    const names = await Promise.race([
      dns.promises.reverse(ip),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), REVERSE_DNS_TIMEOUT_MS);
      }),
    ]);
    return names?.[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Windows PCs on a LAN often have no PTR record but do answer NetBIOS name
// queries; only tried for IPv4 on a Windows server.
const netbiosName = (ip) =>
  new Promise((resolve) => {
    if (process.platform !== "win32" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return resolve(null);
    execFile("nbtstat", ["-A", ip], { timeout: NBTSTAT_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const m = /^\s*(\S+)\s+<00>\s+UNIQUE/m.exec(stdout);
      resolve(m ? m[1] : null);
    });
  });

// Best-effort and cached — a browser can't report its own hostname, so this is
// reverse DNS first, then NetBIOS. Returns null when neither knows the machine.
export const resolveHostName = async (ip) => {
  if (!ip) return null;
  if (isLoopback(ip)) return "localhost";

  const cached = hostCache.get(ip);
  if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS) return cached.host;

  const host = (await reverseDns(ip)) || (await netbiosName(ip));
  hostCache.set(ip, { host, at: Date.now() });
  return host;
};
