import express from "express";
import {
  getMailServerConfig,
  updateMailServerConfig,
  resetMailServerConfig,
  testMailServerConfig,
} from "../controllers/settings/mailServer.controller.js";
import {
  getUsers,
  getRoles,
  createUser,
  updateUser,
  getSessions,
  getAuditLog,
  setAccountStatus,
  setLocked,
  forceLogoutUser,
  resetPassword,
  forceLogoutSession,
  forceLogoutAll,
} from "../controllers/settings/userAccess.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/roleGuard.js";

const router = express.Router();

// SMTP / outgoing-mail-server settings — Super Admin only, backed by the
// AppSettings table (falls back to .env when unset).
router.get("/mail-server", authenticate, requireSuperAdmin, getMailServerConfig);
router.put("/mail-server", authenticate, requireSuperAdmin, updateMailServerConfig);
router.delete("/mail-server", authenticate, requireSuperAdmin, resetMailServerConfig);
router.post("/mail-server/test", authenticate, requireSuperAdmin, testMailServerConfig);

// User access control — who's logged in (IP/host), activate/deactivate, lock,
// force logout, password reset, and the login/admin-action audit log.
router.get("/user-access/users", authenticate, requireSuperAdmin, getUsers);
router.get("/user-access/roles", authenticate, requireSuperAdmin, getRoles);
router.post("/user-access/users", authenticate, requireSuperAdmin, createUser);
router.put("/user-access/users/:userCode", authenticate, requireSuperAdmin, updateUser);
router.get("/user-access/sessions", authenticate, requireSuperAdmin, getSessions);
router.get("/user-access/audit", authenticate, requireSuperAdmin, getAuditLog);
router.post("/user-access/users/:userCode/status", authenticate, requireSuperAdmin, setAccountStatus);
router.post("/user-access/users/:userCode/lock", authenticate, requireSuperAdmin, setLocked);
router.post("/user-access/users/:userCode/force-logout", authenticate, requireSuperAdmin, forceLogoutUser);
router.post("/user-access/users/:userCode/reset-password", authenticate, requireSuperAdmin, resetPassword);
router.post("/user-access/sessions/force-logout-all", authenticate, requireSuperAdmin, forceLogoutAll);
router.post("/user-access/sessions/:sessionId/force-logout", authenticate, requireSuperAdmin, forceLogoutSession);

export default router;
