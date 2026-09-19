import toast from "react-hot-toast";
import { logoutUser } from "../redux/slices/authSlice.js";

// Shared by both fetch paths in this app — the RTK Query middleware (store.js)
// for API-slice calls, and the axios interceptor (main.jsx) for the many
// pages that still call the backend directly. A stale Redux-persisted login
// (cookie expired/cleared but redux-persist still has a cached user) used to
// fail silently per-request; this makes it log the user out and bounce them
// to /login (via ProtectedRoute's existing redirect-on-no-user check) the
// moment ANY request comes back 401, instead of leaving broken pages/consoles
// full of errors.
let toastShownAt = 0;
const TOAST_COOLDOWN_MS = 5000; // several requests can 401 in the same burst — one toast, not five

// When an admin ends a session or disables the account, the server's 401 body
// carries a `code` + human message — show that instead of the generic
// "session expired" text so the user knows it wasn't a timeout.
const ADMIN_REVOKE_CODES = ["SESSION_REVOKED", "ACCOUNT_DISABLED"];

export const handleSessionExpired = (dispatch, responseBody) => {
  dispatch(logoutUser());

  const now = Date.now();
  if (now - toastShownAt > TOAST_COOLDOWN_MS) {
    toastShownAt = now;
    const revoked = ADMIN_REVOKE_CODES.includes(responseBody?.code);
    toast.error(
      revoked && responseBody?.message
        ? responseBody.message
        : "Your session has expired. Please log in again.",
      { duration: revoked ? 8000 : 4000 },
    );
  }
};
