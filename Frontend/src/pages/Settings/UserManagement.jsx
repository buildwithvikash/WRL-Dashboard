/**
 * UserManagement.jsx — Settings > User Management (Super Admin only).
 * Create / edit users, plus who is logged in (IP / host / browser), account
 * activate–deactivate, lock, force logout, password reset, and the login /
 * admin-action activity log.
 */

import { useState, useMemo, Fragment } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  Users,
  Wifi,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  LogOut,
  KeyRound,
  History,
  Search,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Monitor,
  UserPlus,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { ROLES } from "../../config/routes.config.js";
import {
  useGetUserAccessUsersQuery,
  useGetUserAccessRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useGetUserAccessSessionsQuery,
  useGetUserAccessAuditQuery,
  useSetUserAccountStatusMutation,
  useSetUserLockedMutation,
  useForceLogoutUserMutation,
  useResetUserPasswordMutation,
  useForceLogoutSessionMutation,
  useForceLogoutAllSessionsMutation,
} from "../../redux/api/settingsApi.js";

const SUPER_ADMIN_ROLE = ROLES.SUPER_ADMIN;
const PAGE_SIZE = 25;
const POLL_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ago = (sec) => {
  if (sec == null) return "—";
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

const fmtTime = (iso) => (iso ? iso.replace("T", " ").replace("Z", "").slice(0, 19) : "—");

const browserOf = (ua) => {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
};

const EVENT_META = {
  LOGIN_SUCCESS: { label: "Login", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  LOGIN_FAILED: { label: "Login failed", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  LOGOUT: { label: "Logout", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  FORCE_LOGOUT: { label: "Force logout", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  FORCE_LOGOUT_ALL: { label: "Force logout all", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  USER_CREATED: { label: "User created", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  USER_UPDATED: { label: "User edited", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  USER_ACTIVATED: { label: "Activated", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  USER_DEACTIVATED: { label: "Deactivated", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  USER_LOCKED: { label: "Locked", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  USER_UNLOCKED: { label: "Unlocked", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PASSWORD_RESET: { label: "Password reset", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  PASSWORD_CHANGED: { label: "Password changed", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "multiple", label: "Multiple logins" },
  { key: "deactivated", label: "Deactivated" },
  { key: "pending", label: "Pending approval" },
  { key: "locked", label: "Locked" },
];

const FILTER_FN = {
  all: () => true,
  online: (u) => u.isOnline,
  multiple: (u) => u.activeSessions > 1,
  deactivated: (u) => u.status === "deactivated",
  pending: (u) => u.status === "pending",
  locked: (u) => u.locked,
};

// ── Small UI pieces ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, accent, sub }) => (
  <div
    className="relative bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-hidden"
    style={{ borderLeft: `4px solid ${accent}` }}
  >
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
    <p className="text-3xl font-black" style={{ color: accent }}>
      {value ?? "—"}
    </p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    <div
      className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full opacity-10"
      style={{ background: accent }}
    />
  </div>
);

const Badge = ({ cls, children }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${cls}`}
  >
    {children}
  </span>
);

const AccountBadges = ({ user }) => (
  <div className="flex flex-wrap gap-1">
    {user.status === "active" && (
      <Badge cls="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
    )}
    {user.status === "deactivated" && (
      <Badge cls="bg-slate-100 text-slate-600 border-slate-200">Deactivated</Badge>
    )}
    {user.status === "pending" && (
      <Badge cls="bg-amber-50 text-amber-700 border-amber-200">Pending approval</Badge>
    )}
    {user.status === "unknown" && (
      <Badge cls="bg-slate-100 text-slate-500 border-slate-200">Status {user.statusCode}</Badge>
    )}
    {user.locked && (
      <Badge cls="bg-rose-50 text-rose-700 border-rose-200">
        <Lock className="w-2.5 h-2.5" /> Locked
      </Badge>
    )}
    {user.isSystemUser && <Badge cls="bg-indigo-50 text-indigo-700 border-indigo-200">System</Badge>}
  </div>
);

const Presence = ({ user }) => {
  if (user.isOnline)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Online
      </span>
    );
  if (user.activeSessions > 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Idle · {ago(user.lastSeenAgoSec)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
      <span className="h-2 w-2 rounded-full bg-gray-300" />
      Offline
    </span>
  );
};

const TONES = {
  green: "text-emerald-600 hover:bg-emerald-50",
  red: "text-rose-600 hover:bg-rose-50",
  amber: "text-amber-600 hover:bg-amber-50",
  indigo: "text-indigo-600 hover:bg-indigo-50",
  slate: "text-slate-500 hover:bg-slate-100",
};

const IconBtn = ({ icon, title, onClick, disabled, tone = "slate" }) => {
  const Icon = icon;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg transition ${TONES[tone]} disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};

const Th = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap bg-slate-50 sticky top-0 z-10">
    {children}
  </th>
);

const Td = ({ children, className = "" }) => (
  <td className={`px-3 py-2.5 text-xs text-gray-700 align-middle ${className}`}>{children}</td>
);

const EmptyRow = ({ cols, text }) => (
  <tr>
    <td colSpan={cols} className="py-16 text-center text-sm text-gray-400">
      {text}
    </td>
  </tr>
);

const Dash = () => <span className="text-gray-300">—</span>;

const Modal = ({ children, onClose, width = "max-w-md" }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className={`w-full ${width} bg-white rounded-2xl shadow-xl border border-gray-200 p-5`}>{children}</div>
  </div>
);

const ConfirmModal = ({ confirm, busy, onCancel }) => {
  if (!confirm) return null;
  const danger = confirm.tone !== "amber";
  return (
    <Modal onClose={onCancel}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl ${danger ? "bg-rose-50" : "bg-amber-50"}`}>
          <AlertTriangle className={`w-5 h-5 ${danger ? "text-rose-600" : "text-amber-600"}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{confirm.title}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{confirm.message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm.onConfirm}
          disabled={busy}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60 ${
            danger ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {confirm.confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

const TempPasswordBox = ({ password }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-xl px-3 py-2.5">
      <code className="flex-1 text-base font-bold tracking-wider text-gray-900 select-all">{password}</code>
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

const PASSWORD_OPTIONS = [
  { key: "generate", title: "Generate a temporary password", sub: "Recommended — a random 10-character password" },
  { key: "custom", title: "Set a specific password", sub: "6–30 characters" },
];

const PasswordModeFields = ({ mode, setMode, custom, setCustom }) => (
  <>
    {PASSWORD_OPTIONS.map((o) => (
      <label
        key={o.key}
        className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
          mode === o.key ? "border-indigo-200 bg-indigo-50" : "border-gray-100 hover:border-gray-200"
        }`}
      >
        <input
          type="radio"
          name="password-mode"
          checked={mode === o.key}
          onChange={() => setMode(o.key)}
          className="mt-0.5 accent-indigo-600"
        />
        <div>
          <p className="text-xs font-bold text-gray-800">{o.title}</p>
          <p className="text-[11px] text-gray-400">{o.sub}</p>
        </div>
      </label>
    ))}
    {mode === "custom" && (
      <input
        type="text"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        maxLength={30}
        placeholder="Password"
        autoComplete="off"
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
      />
    )}
  </>
);

const ResetPasswordModal = ({ target, onClose, onReset, busy }) => {
  const [mode, setMode] = useState("generate");
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (mode === "custom" && (custom.length < 6 || custom.length > 30)) {
      toast.error("Password must be 6–30 characters.");
      return;
    }
    const res = await onReset(mode === "custom" ? custom : undefined);
    if (res) setResult(res);
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50">
            <KeyRound className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Reset password</h3>
            <p className="text-xs text-gray-400">
              {target.userName} · {target.userId}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {result ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {result.temporaryPassword
              ? "Give this temporary password to the user — it is shown only once. They can change it from the profile menu after logging in."
              : "The new password has been set."}
          </p>
          {result.temporaryPassword && <TempPasswordBox password={result.temporaryPassword} />}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <PasswordModeFields mode={mode} setMode={setMode} custom={custom} setCustom={setCustom} />
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            The user will be logged out of every session and must sign in with the new password.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reset password
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const fieldCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400";

const FormField = ({ label, hint, children }) => (
  <div>
    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-gray-400 leading-snug">{hint}</p>}
  </div>
);

const ID_RE = /^[A-Za-z0-9._-]{2,50}$/;

// One form for both flows: `target` absent = create, present = edit.
const UserFormModal = ({ target, roles, isSelf, busy, onClose, onSubmit }) => {
  const editing = Boolean(target);
  const [userId, setUserId] = useState(target?.userId ?? "");
  const [userName, setUserName] = useState(target?.userName ?? "");
  const [roleCode, setRoleCode] = useState(target ? String(target.roleCode) : "");
  const [mode, setMode] = useState("generate");
  const [custom, setCustom] = useState("");
  const [created, setCreated] = useState(null);

  const id = userId.trim();
  const name = userName.trim().replace(/\s+/g, " ");
  const idChanged = editing && id !== target.userId;
  const nameChanged = editing && name !== target.userName;
  const roleChanged = editing && roleCode !== String(target.roleCode);
  const dirty = !editing || idChanged || nameChanged || roleChanged;
  const picked = roles.find((r) => String(r.roleCode) === roleCode);
  const isSuperRole = picked?.roleName?.toLowerCase() === "super admin";

  const submit = async () => {
    if (!ID_RE.test(id)) {
      toast.error("Employee ID must be 2–50 characters: letters, numbers, dot, dash or underscore.");
      return;
    }
    if (name.length < 2) {
      toast.error("Please enter the user's name.");
      return;
    }
    if (!roleCode) {
      toast.error("Please choose a role.");
      return;
    }
    if (!editing && mode === "custom" && (custom.length < 6 || custom.length > 30)) {
      toast.error("Password must be 6–30 characters.");
      return;
    }

    if (editing) {
      const body = {};
      if (nameChanged) body.userName = name;
      if (roleChanged) body.roleCode = Number(roleCode);
      if (idChanged) body.userId = id;
      if (await onSubmit(body)) onClose();
    } else {
      const res = await onSubmit({
        userId: id,
        userName: name,
        roleCode: Number(roleCode),
        ...(mode === "custom" ? { password: custom } : {}),
      });
      if (res) setCreated(res);
    }
  };

  return (
    <Modal onClose={onClose} width="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50">
            {editing ? <Pencil className="w-4 h-4 text-indigo-600" /> : <UserPlus className="w-4 h-4 text-indigo-600" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">{editing ? "Edit user" : "Add user"}</h3>
            <p className="text-xs text-gray-400">
              {editing ? `${target.userName} · ${target.userId}` : "The account is active immediately"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {created ? (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-800">
            <span className="font-bold">{name}</span> can now sign in with Employee ID{" "}
            <code className="font-bold">{created.userId}</code>.
          </div>
          {created.temporaryPassword ? (
            <>
              <p className="text-xs text-gray-500">
                Give them this temporary password — it is shown only once. They can change it from the profile menu
                after logging in.
              </p>
              <TempPasswordBox password={created.temporaryPassword} />
            </>
          ) : (
            <p className="text-xs text-gray-500">They can sign in with the password you set.</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Employee ID"
              hint={isSelf ? "You can't change your own employee ID." : "The login ID — must be unique."}
            >
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={isSelf}
                maxLength={50}
                autoComplete="off"
                placeholder="e.g. GR1234"
                className={fieldCls}
              />
            </FormField>
            <FormField label="Full name">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={150}
                autoComplete="off"
                placeholder="e.g. Rahul Sharma"
                className={fieldCls}
              />
            </FormField>
          </div>

          <FormField label="Role" hint={isSelf ? "You can't change your own role." : undefined}>
            <select
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              disabled={isSelf}
              className={fieldCls}
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.roleCode} value={r.roleCode}>
                  {r.roleName}
                </option>
              ))}
            </select>
          </FormField>

          {isSuperRole && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              Super Admin can manage users, permissions and settings for everyone. Assign it only when needed.
            </p>
          )}

          {!editing && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Initial password</p>
              <PasswordModeFields mode={mode} setMode={setMode} custom={custom} setCustom={setCustom} />
            </div>
          )}

          {editing && (roleChanged || idChanged) && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Changing the role or employee ID logs the user out of every session so the change takes effect.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !dirty}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editing ? "Save changes" : "Create user"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const Pager = ({ page, pages, total, onChange }) =>
  pages > 1 ? (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
      <span>
        {total} users · page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  ) : null;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user: me } = useSelector((store) => store.auth);
  const isSuperAdmin = (me?.roleName?.toLowerCase?.() ?? "") === SUPER_ADMIN_ROLE;

  const [tab, setTab] = useState("users");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  // null = closed · { user: null } = create · { user } = edit
  const [form, setForm] = useState(null);
  const [expanded, setExpanded] = useState({}); // userId -> session list open
  const [multiOnly, setMultiOnly] = useState(false); // Sessions tab: only users with 2+ sessions
  const [auditFilter, setAuditFilter] = useState({ userId: "", eventType: "" });

  const queryOpts = { skip: !isSuperAdmin, pollingInterval: POLL_MS };
  const usersQ = useGetUserAccessUsersQuery(undefined, queryOpts);
  const sessionsQ = useGetUserAccessSessionsQuery(undefined, queryOpts);
  const rolesQ = useGetUserAccessRolesQuery(undefined, { skip: !isSuperAdmin });
  const auditQ = useGetUserAccessAuditQuery(
    {
      limit: 300,
      ...(auditFilter.userId && { userId: auditFilter.userId }),
      ...(auditFilter.eventType && { eventType: auditFilter.eventType }),
    },
    { skip: !isSuperAdmin || tab !== "audit", refetchOnMountOrArgChange: true },
  );

  const [setStatus, { isLoading: settingStatus }] = useSetUserAccountStatusMutation();
  const [setLocked, { isLoading: settingLock }] = useSetUserLockedMutation();
  const [forceLogoutUser, { isLoading: loggingOutUser }] = useForceLogoutUserMutation();
  const [resetPassword, { isLoading: resetting }] = useResetUserPasswordMutation();
  const [createUser, { isLoading: creating }] = useCreateUserMutation();
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();
  const [forceLogoutSession, { isLoading: loggingOutSession }] = useForceLogoutSessionMutation();
  const [forceLogoutAll, { isLoading: loggingOutAll }] = useForceLogoutAllSessionsMutation();

  const busy = settingStatus || settingLock || loggingOutUser || loggingOutSession || loggingOutAll;

  const summary = usersQ.data?.summary;
  const allUsers = usersQ.data?.data;
  const sessions = sessionsQ.data?.data ?? [];

  // A user can be signed in from several PCs / browsers at once — group the live
  // sessions by user so each row can show and expand all of them.
  const sessionsByUser = useMemo(() => {
    const map = new Map();
    (sessionsQ.data?.data ?? []).forEach((s) => {
      if (!map.has(s.userId)) map.set(s.userId, []);
      map.get(s.userId).push(s);
    });
    return map;
  }, [sessionsQ.data]);

  const visibleSessions = useMemo(() => {
    const all = sessionsQ.data?.data ?? [];
    if (!multiOnly) return all;
    return all
      .filter((s) => (sessionsByUser.get(s.userId)?.length ?? 0) > 1)
      .sort((a, b) => a.userName.localeCompare(b.userName) || a.lastSeenAgoSec - b.lastSeenAgoSec);
  }, [sessionsQ.data, sessionsByUser, multiOnly]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (allUsers ?? [])
      .filter(FILTER_FN[filter])
      .filter(
        (u) =>
          !q ||
          [u.userName, u.userId, u.roleName, u.lastIp, u.lastHost].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          b.activeSessions - a.activeSessions ||
          (a.lastLoginAgoSec ?? Infinity) - (b.lastLoginAgoSec ?? Infinity) ||
          a.userName.localeCompare(b.userName),
      );
  }, [allUsers, filter, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!isSuperAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-400">Only Super Admin can manage users.</p>
        </div>
      </div>
    );
  }

  // Runs a mutation, toasting the server's message either way.
  const act = async (run) => {
    try {
      const res = await run().unwrap();
      toast.success(res?.message || "Done.");
      return res;
    } catch (err) {
      toast.error(err?.data?.message || "Action failed.");
      return null;
    }
  };

  const ask = (title, message, confirmLabel, run, tone = "red") =>
    setConfirm({
      title,
      message,
      confirmLabel,
      tone,
      onConfirm: async () => {
        await act(run);
        setConfirm(null);
      },
    });

  const refresh = () => {
    usersQ.refetch();
    sessionsQ.refetch();
    if (tab === "audit") auditQ.refetch();
  };

  const showHistory = (u) => {
    setAuditFilter({ userId: u.userId, eventType: "" });
    setTab("audit");
  };

  const fetching = usersQ.isFetching || sessionsQ.isFetching;

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-none">User Management</h1>
          <p className="text-xs text-gray-400">
            Create &amp; edit users, logins, sessions, account status &amp; password resets · Super Admin Only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] text-gray-400">Auto-refreshes every 30 s</span>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Users" value={summary?.total} accent="#6366f1" />
          <StatCard label="Online Now" value={summary?.online} accent="#22c55e" sub="seen in last 5 min" />
          <StatCard label="Active Sessions" value={summary?.activeSessions} accent="#0ea5e9" />
          <StatCard label="Deactivated" value={summary?.deactivated} accent="#94a3b8" />
          <StatCard label="Pending Approval" value={summary?.pending} accent="#f97316" sub="new signups" />
          <StatCard label="Locked" value={summary?.locked} accent="#ef4444" />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-gray-100">
            {[
              { key: "users", label: "Users", icon: Users, count: summary?.total },
              { key: "sessions", label: "Active Sessions", icon: Wifi, count: sessions.length },
              { key: "audit", label: "Activity Log", icon: History },
            ].map((t) => {
              const TabIcon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 -mb-px transition ${
                    tab === t.key
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" /> {t.label}
                  {t.count != null && (
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px]">{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Users tab ─────────────────────────────────────────────────── */}
          {tab === "users" && (
            <>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-lg px-3 py-1.5 w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search name, ID, role, IP, host…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="bg-transparent text-xs outline-none w-full text-gray-600 placeholder-gray-400"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => {
                    const n = (allUsers ?? []).filter(FILTER_FN[f.key]).length;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          setFilter(f.key);
                          setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                          filter === f.key
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {f.label} <span className="opacity-70">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ user: null })}
                  className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add user
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <Th>User</Th>
                      <Th>Role</Th>
                      <Th>Account</Th>
                      <Th>Presence</Th>
                      <Th>Last login</Th>
                      <Th>IP address</Th>
                      <Th>Host name</Th>
                      <Th>Sessions</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usersQ.isLoading ? (
                      <EmptyRow cols={9} text="Loading users…" />
                    ) : usersQ.isError ? (
                      <EmptyRow cols={9} text="Couldn't load users." />
                    ) : pageRows.length === 0 ? (
                      <EmptyRow cols={9} text="No users match this filter." />
                    ) : (
                      pageRows.map((u) => {
                        const isSelf = u.userId === me?.id;
                        const protectedAcct = isSelf || u.isSystemUser;
                        const userSessions = sessionsByUser.get(u.userId) ?? [];
                        const ips = [...new Set(userSessions.map((s) => s.ipAddress).filter(Boolean))];
                        const hosts = [...new Set(userSessions.map((s) => s.hostName).filter(Boolean))];
                        const isOpen = Boolean(expanded[u.userId]);
                        return (
                          <Fragment key={u.userCode}>
                          <tr className={`hover:bg-slate-50/70 ${u.activeSessions > 1 ? "bg-amber-50/30" : ""}`}>
                            <Td>
                              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                                {u.userName}
                                {isSelf && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                    YOU
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-gray-400 font-mono">{u.userId}</p>
                            </Td>
                            <Td className="capitalize">{u.roleName.toLowerCase()}</Td>
                            <Td>
                              <AccountBadges user={u} />
                            </Td>
                            <Td>
                              <Presence user={u} />
                            </Td>
                            <Td className="whitespace-nowrap">{u.lastLoginAgoSec == null ? <Dash /> : ago(u.lastLoginAgoSec)}</Td>
                            <Td className="font-mono">
                              {ips.length > 0 ? (
                                ips.map((ip) => <span key={ip} className="block">{ip}</span>)
                              ) : u.lastIp ? (
                                <span className="text-gray-400" title="IP of their last login">{u.lastIp}</span>
                              ) : (
                                <Dash />
                              )}
                            </Td>
                            <Td>
                              {hosts.length > 0 ? (
                                hosts.map((h) => <span key={h} className="block">{h}</span>)
                              ) : u.lastHost ? (
                                <span className="text-gray-400" title="Host of their last login">{u.lastHost}</span>
                              ) : (
                                <Dash />
                              )}
                            </Td>
                            <Td>
                              {u.activeSessions > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setExpanded((e) => ({ ...e, [u.userId]: !e[u.userId] }))}
                                  title={isOpen ? "Hide sessions" : "Show every session for this user"}
                                  className="flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg hover:bg-gray-100 transition"
                                >
                                  <span className="font-bold">{u.activeSessions}</span>
                                  {ips.length > 1 && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap">
                                      {ips.length} IPs
                                    </span>
                                  )}
                                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </button>
                              ) : (
                                <Dash />
                              )}
                            </Td>
                            <Td>
                              <div className="flex items-center gap-0.5">
                                <IconBtn
                                  icon={Pencil}
                                  tone="indigo"
                                  title={u.isSystemUser ? "System accounts can't be edited" : "Edit user"}
                                  disabled={busy || u.isSystemUser}
                                  onClick={() => setForm({ user: u })}
                                />
                                {u.status !== "active" ? (
                                  <IconBtn
                                    icon={UserCheck}
                                    tone="green"
                                    title={u.status === "pending" ? "Approve signup" : "Activate account"}
                                    disabled={busy}
                                    onClick={() => act(() => setStatus({ userCode: u.userCode, action: "activate" }))}
                                  />
                                ) : (
                                  <IconBtn
                                    icon={UserX}
                                    tone="red"
                                    title={protectedAcct ? "Can't deactivate this account" : "Deactivate account"}
                                    disabled={busy || protectedAcct}
                                    onClick={() =>
                                      ask(
                                        `Deactivate ${u.userName}?`,
                                        "They will be logged out immediately and won't be able to sign in until re-activated.",
                                        "Deactivate",
                                        () => setStatus({ userCode: u.userCode, action: "deactivate" }),
                                      )
                                    }
                                  />
                                )}
                                {u.locked ? (
                                  <IconBtn
                                    icon={Unlock}
                                    tone="green"
                                    title="Unlock account"
                                    disabled={busy}
                                    onClick={() => act(() => setLocked({ userCode: u.userCode, locked: false }))}
                                  />
                                ) : (
                                  <IconBtn
                                    icon={Lock}
                                    tone="amber"
                                    title={protectedAcct ? "Can't lock this account" : "Lock account"}
                                    disabled={busy || protectedAcct}
                                    onClick={() =>
                                      ask(
                                        `Lock ${u.userName}?`,
                                        "They will be logged out immediately and blocked from signing in until unlocked.",
                                        "Lock account",
                                        () => setLocked({ userCode: u.userCode, locked: true }),
                                        "amber",
                                      )
                                    }
                                  />
                                )}
                                <IconBtn
                                  icon={LogOut}
                                  tone="amber"
                                  title={
                                    isSelf
                                      ? "Use Logout for your own session"
                                      : u.activeSessions
                                        ? "Force logout"
                                        : "No active session"
                                  }
                                  disabled={busy || isSelf || !u.activeSessions}
                                  onClick={() =>
                                    ask(
                                      `Force logout ${u.userName}?`,
                                      `This ends ${u.activeSessions} active session(s). They can sign back in straight away.`,
                                      "Force logout",
                                      () => forceLogoutUser(u.userCode),
                                      "amber",
                                    )
                                  }
                                />
                                <IconBtn
                                  icon={KeyRound}
                                  tone="indigo"
                                  title={protectedAcct ? "Can't reset this account's password here" : "Reset password"}
                                  disabled={busy || protectedAcct}
                                  onClick={() => setResetTarget(u)}
                                />
                                <IconBtn icon={History} title="Login history" onClick={() => showHistory(u)} />
                              </div>
                            </Td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={9} className="px-6 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                  {u.userName} · {userSessions.length} active session{userSessions.length === 1 ? "" : "s"}
                                </p>
                                {userSessions.length === 0 ? (
                                  <p className="text-xs text-gray-400">Loading sessions…</p>
                                ) : (
                                  <table className="min-w-full bg-white rounded-xl border border-gray-100 overflow-hidden">
                                    <thead>
                                      <tr>
                                        <Th>IP address</Th>
                                        <Th>Host name</Th>
                                        <Th>Browser</Th>
                                        <Th>Logged in</Th>
                                        <Th>Last seen</Th>
                                        <Th>Status</Th>
                                        <Th>Action</Th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {userSessions.map((s) => (
                                        <tr key={s.sessionId}>
                                          <Td className="font-mono">
                                            {s.ipAddress || <Dash />}
                                            {s.isCurrent && (
                                              <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                                THIS SESSION
                                              </span>
                                            )}
                                          </Td>
                                          <Td>{s.hostName || <Dash />}</Td>
                                          <Td>
                                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                              <Monitor className="w-3 h-3 text-gray-300" /> {browserOf(s.userAgent)}
                                            </span>
                                          </Td>
                                          <Td className="whitespace-nowrap">{ago(s.loginAgoSec)}</Td>
                                          <Td className="whitespace-nowrap">{ago(s.lastSeenAgoSec)}</Td>
                                          <Td>
                                            <Presence
                                              user={{ isOnline: s.isOnline, activeSessions: 1, lastSeenAgoSec: s.lastSeenAgoSec }}
                                            />
                                          </Td>
                                          <Td>
                                            <IconBtn
                                              icon={LogOut}
                                              tone="amber"
                                              title={s.isCurrent ? "Use Logout for your own session" : "Force logout this session"}
                                              disabled={busy || s.isCurrent}
                                              onClick={() =>
                                                ask(
                                                  `End ${s.userName}'s session?`,
                                                  `The session from ${s.ipAddress || "an unknown IP"} will be logged out. Their other sessions stay active.`,
                                                  "End session",
                                                  () => forceLogoutSession(s.sessionId),
                                                  "amber",
                                                )
                                              }
                                            />
                                          </Td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={currentPage} pages={pages} total={rows.length} onChange={setPage} />
            </>
          )}

          {/* ── Sessions tab ──────────────────────────────────────────────── */}
          {tab === "sessions" && (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-gray-500">
                    Every login that hasn&apos;t logged out or expired. A user can have several (different PCs / browsers).
                  </p>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={multiOnly}
                      onChange={(e) => setMultiOnly(e.target.checked)}
                      className="accent-indigo-600"
                    />
                    Only users signed in more than once
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy || sessions.every((s) => s.isCurrent || s.userId === me?.id)}
                  onClick={() =>
                    ask(
                      "Force logout everyone else?",
                      "Every other user's session will be ended. Your own session is kept. Use this only when you really need everybody to sign in again.",
                      "Log everyone out",
                      () => forceLogoutAll(),
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <LogOut className="w-3.5 h-3.5" /> Force logout all others
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <Th>User</Th>
                      <Th>Role</Th>
                      <Th>Presence</Th>
                      <Th>IP address</Th>
                      <Th>Host name</Th>
                      <Th>Browser</Th>
                      <Th>Logged in</Th>
                      <Th>Last seen</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessionsQ.isLoading ? (
                      <EmptyRow cols={9} text="Loading sessions…" />
                    ) : visibleSessions.length === 0 ? (
                      <EmptyRow
                        cols={9}
                        text={multiOnly ? "No user is signed in more than once right now." : "No active sessions."}
                      />
                    ) : (
                      visibleSessions.map((s) => (
                        <tr key={s.sessionId} className="hover:bg-slate-50/70">
                          <Td>
                            <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                              {s.userName}
                              {(sessionsByUser.get(s.userId)?.length ?? 0) > 1 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                  ×{sessionsByUser.get(s.userId).length}
                                </span>
                              )}
                              {s.isCurrent && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                  THIS SESSION
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400 font-mono">{s.userId}</p>
                          </Td>
                          <Td className="capitalize">{s.roleName?.toLowerCase() || <Dash />}</Td>
                          <Td>
                            <Presence
                              user={{ isOnline: s.isOnline, activeSessions: 1, lastSeenAgoSec: s.lastSeenAgoSec }}
                            />
                          </Td>
                          <Td className="font-mono">{s.ipAddress || <Dash />}</Td>
                          <Td>{s.hostName || <Dash />}</Td>
                          <Td>
                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                              <Monitor className="w-3 h-3 text-gray-300" /> {browserOf(s.userAgent)}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap">{ago(s.loginAgoSec)}</Td>
                          <Td className="whitespace-nowrap">{ago(s.lastSeenAgoSec)}</Td>
                          <Td>
                            <IconBtn
                              icon={LogOut}
                              tone="amber"
                              title={s.isCurrent ? "Use Logout for your own session" : "Force logout this session"}
                              disabled={busy || s.isCurrent}
                              onClick={() =>
                                ask(
                                  `End ${s.userName}'s session?`,
                                  `The session from ${s.ipAddress || "an unknown IP"} will be logged out. Their other sessions (if any) stay active.`,
                                  "End session",
                                  () => forceLogoutSession(s.sessionId),
                                  "amber",
                                )
                              }
                            />
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Activity log tab ──────────────────────────────────────────── */}
          {tab === "audit" && (
            <>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
                <select
                  value={auditFilter.eventType}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, eventType: e.target.value }))}
                  className="text-xs rounded-lg border border-gray-200 px-3 py-1.5 bg-white text-gray-600 outline-none focus:border-indigo-400"
                >
                  <option value="">All events</option>
                  {Object.entries(EVENT_META).map(([key, m]) => (
                    <option key={key} value={key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-lg px-3 py-1.5 w-56">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filter by user ID (exact)…"
                    value={auditFilter.userId}
                    onChange={(e) => setAuditFilter((f) => ({ ...f, userId: e.target.value }))}
                    className="bg-transparent text-xs outline-none w-full text-gray-600 placeholder-gray-400"
                  />
                  {auditFilter.userId && (
                    <button type="button" onClick={() => setAuditFilter((f) => ({ ...f, userId: "" }))}>
                      <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-gray-400">Latest 300 events · failed logins are recorded with the IP they came from</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <Th>Time</Th>
                      <Th>Event</Th>
                      <Th>User</Th>
                      <Th>Done by</Th>
                      <Th>IP address</Th>
                      <Th>Host name</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {auditQ.isLoading || auditQ.isFetching ? (
                      <EmptyRow cols={7} text="Loading activity…" />
                    ) : (auditQ.data?.data ?? []).length === 0 ? (
                      <EmptyRow cols={7} text="No activity recorded yet." />
                    ) : (
                      auditQ.data.data.map((e) => {
                        const meta = EVENT_META[e.EventType] || {
                          label: e.EventType,
                          cls: "bg-slate-100 text-slate-600 border-slate-200",
                        };
                        return (
                          <tr key={e.Id} className="hover:bg-slate-50/70">
                            <Td className="font-mono whitespace-nowrap">{fmtTime(e.CreatedAt)}</Td>
                            <Td>
                              <Badge cls={meta.cls}>{meta.label}</Badge>
                            </Td>
                            <Td>
                              {e.UserID ? (
                                <>
                                  <p className="font-semibold text-gray-800">{e.UserName || e.UserID}</p>
                                  {e.UserName && <p className="text-[11px] text-gray-400 font-mono">{e.UserID}</p>}
                                </>
                              ) : (
                                <Dash />
                              )}
                            </Td>
                            <Td>{e.ActorName || e.ActorUserID || <Dash />}</Td>
                            <Td className="font-mono">{e.IpAddress || <Dash />}</Td>
                            <Td>{e.HostName || <Dash />}</Td>
                            <Td className="text-gray-500 max-w-[320px]">{e.Detail || <Dash />}</Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal confirm={confirm} busy={busy} onCancel={() => setConfirm(null)} />
      {form && (
        <UserFormModal
          key={form.user?.userCode ?? "new"}
          target={form.user}
          roles={rolesQ.data ?? []}
          isSelf={form.user?.userId === me?.id}
          busy={creating || updating}
          onClose={() => setForm(null)}
          onSubmit={(body) =>
            form.user
              ? act(() => updateUser({ userCode: form.user.userCode, ...body }))
              : act(() => createUser(body))
          }
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          key={resetTarget.userCode}
          target={resetTarget}
          busy={resetting}
          onClose={() => setResetTarget(null)}
          onReset={(newPassword) =>
            act(() => resetPassword({ userCode: resetTarget.userCode, newPassword }))
          }
        />
      )}
    </div>
  );
}
