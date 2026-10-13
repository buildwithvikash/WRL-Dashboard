# WRL Dashboard — Codebase Review (2026-10-07)

Review only. No source code was changed. Secrets in `.env` were checked for *key names* only; no values are reproduced here.

## 0. Scope, method and limits

**What was examined**
- Backend (Node/Express 5, `mssql`, ESM): `server.js`, all of `config/`, `middlewares/`, `utils/`, `routes/` (23 route files, ~470 endpoints), `cron/`, `services/`, and targeted reads of the controllers (90 files, ~28k LOC) chosen by pattern sweeps (connection handling, SQL construction, file I/O, auth, approvals).
- Frontend (React 19 + Vite 6 + Tailwind 4 + Redux Toolkit/RTK Query): `main.jsx`, `App.jsx`, store, API slices, auth/permission hooks, routing, and size/pattern sweeps across 252 files (~116k LOC).
- Tooling evidence: `eslint .` (frontend), `vite build`, `npm audit --omit=dev` on both packages, test/CI discovery.

**Limits — please read**
- Controllers were reviewed by systematic grep sweeps plus targeted reading, not line-by-line for all 28k lines. Large UI pages (e.g. the 6k-line `Multidaypivotview.jsx`) were sized and sampled, not fully read.
- No live DB was queried: stored procedures, indexes and execution plans were **not** reviewed. Index/plan recommendations below need `sys.dm_exec_query_stats` / actual plans to confirm.
- The production `.env`, reverse proxy and server timezone are unknown; findings that depend on them are marked **[needs prod check]**.
- No load testing was done; capacity statements are reasoned, not measured.

**Legend:** `VERIFIED` = confirmed by reading the code path end-to-end. `RISK` = plausible, depends on runtime conditions. `BEST PRACTICE` = recommendation, not a defect.

---

## 1. Architecture at a glance

```
Browser (React SPA, Vite)                    Shop-floor TVs (/display/:slug, no login)
   │ axios (87 files) + RTK Query (32 files)        │ polls every 30s
   ▼                                                ▼
Express API  /api/v1/*  ── authenticate (JWT cookie + UserSessions check)
   │  23 routers → 90 controllers (SQL inline in controllers)
   │  6 node-cron jobs (gated by ENABLE_CRON)
   ├── pool1  GARUDA / MES      (production, quality, users)
   ├── pool2  WWMS              (dispatch)
   ├── pool3  app DB            (audit, gatepass, settings, sessions)
   └── pool4  CLMS              (attendance, employee photos)
Files: Backend/uploads/* served statically at /uploads
```

**What is working well**
- **Parameterised SQL is the norm.** The few places that interpolate into SQL use whitelists (`chemReports` group, `estReport` column map, `productionPlaning` fixed filters, numeric station codes from server-side maps) or strict date normalisation (`safeDatetime` for OPENQUERY). I found no exploitable SQL injection.
- **Session layer is thoughtful**: server-side session table, force-logout, revocation codes surfaced to the UI, short-TTL caches with explicit invalidation, auth audit log, bcrypt migration with transparent backfill (`sessionStore.js`, `auth.controller.js`).
- **Cron safety gate** (`ENABLE_CRON`) and an overlap guard in `factoryOsSync.cron.js`.
- **Global 401 handling** for both axios and RTK Query funnels into one `handleSessionExpired`.
- **Route-level code splitting** (`lazy()`), so most pages ship as separate chunks.
- Comments explain *why* (DNS workaround, timezone handling, public endpoints) — unusually good institutional memory.

---

## 2. Prioritised findings

### CRITICAL

#### C1. Path traversal → arbitrary file read (incl. `.env`) — `VERIFIED`
- **Location:** `Backend/controllers/quality/UploadBISReport.controller.js:173-208` (`downloadBisPdfFile`), route `GET /api/v1/quality/download-bis-file/:srNo?filename=…`
- **Evidence:** `const filePath = path.join(uploadDir, filename)` with `filename` taken straight from `req.query`. The DB check only confirms that `SrNo` exists; it never compares the row's `FileName` to the requested `filename`. `?filename=../../.env` resolves to `Backend/.env`.
- **Impact:** Any logged-in user can download the server's `.env` (DB credentials for 4 servers, `JWT_SECRET`, SMTP password). With `JWT_SECRET` they can mint a Super Admin token.
- **Fix:** Ignore the client filename; stream the `FileName` stored on the `BISUpload` row, and additionally assert `path.resolve(filePath).startsWith(uploadDir + path.sep)`. Apply the same containment helper to every `createReadStream`/`sendFile` site (4 found).
- **Effort:** S (≈1 hr). **Risk:** None for legitimate use — the UI already passes the stored filename.
- **Follow-up:** Because exposure can't be ruled out, **rotate `JWT_SECRET` and DB/SMTP passwords** after the fix.

#### C2. Business endpoints have authentication but no authorization — `VERIFIED`
- **Location:** All routers except `permission.route.js` and `settings.route.js` (which use `requireSuperAdmin`). `dispatch.route.js` has 2 role guards; the other ~400 endpoints check only "is logged in".
- **Evidence:** Page permissions (`/permission/me`) are enforced only by the React router (`useRoleAccess` → `accessibleRoutes`). The API does not consult them. Examples:
  - `PUT /gatepass/:id/:stage` (`decideGatePass`) — any user can approve as Dept Head or HR, and the approver **name comes from the request body**.
  - `POST /audit-report/audits/:id/approve` — `approverName` from body.
  - `DELETE /audit-report/templates/:id`, all `/master-config/*` CRUD, `/gatepass/hr-config`, `/gatepass/dept-config/*`, dispatch hold/error removal.
- **Impact:** Any account, including a newly self-registered one once activated, can perform admin and approval actions with `curl`. Approval trails can be forged.
- **Fix:** Add a `requirePermission(sectionKey, path)` middleware that reuses the same role→page map `/permission/me` already returns (cache it per role, ~60s). Apply it per router to mirror the frontend's page permissions. For approvals, derive the approver from `req.user` and check that the user is the configured approver for that stage/department; drop `name`/`approverName` from the body.
- **Effort:** M (2–4 days incl. mapping endpoints to pages). **Risk:** Medium — mis-mapping can lock users out; roll out in log-only mode for a week first (log would-be denials, don't block).

#### C3. Gate-pass e-mail tokens are accepted as login sessions — `VERIFIED`
- **Location:** `gatepass.controller.js:31-32` signs `{passId, stage, approverName, purpose}` with **the same `JWT_SECRET`**; `middlewares/auth.js` + `sessionStore.checkSession` accept any validly signed token and skip both checks when `id`/`sid` are absent.
- **Impact:** Anyone holding an approval link (forwarded e-mail, mail logs, proxy logs) can put the token in a `token` cookie and call every authenticated API for 5 days. Combined with C2 that means full app access.
- **Fix:** (a) In `authenticate`, reject tokens without `id` and with any `purpose` claim; (b) sign e-mail tokens with a separate secret (`EMAIL_ACTION_SECRET`) and an `aud` claim. Also make the action a confirm page + POST: e-mail security scanners (Outlook Safe Links, AV) pre-fetch GET links and can auto-approve passes.
- **Effort:** S. **Risk:** Low; outstanding e-mail links keep working if you leave a short dual-verify window for the old secret.

#### C4. Uploaded files are publicly readable, and some are committed to git — `VERIFIED`
- **Location:** `server.js:39` `app.use("/uploads", express.static(...))` with no `authenticate`; `git ls-files Backend/uploads` lists 19 files incl. **BIS signature images**, a BIS report PDF, audit images and template backups.
- **Impact:** Signatures, calibration certificates and audit evidence are readable by anyone on the network without login; signatures are also in git history (anyone with repo access has them).
- **Fix:** Put `authenticate` in front of `/uploads` (the audit-image route already shows the pattern), add `Backend/uploads/` to `.gitignore`, `git rm --cached` the files, and consider purging history if the repo is shared outside the team.
- **Effort:** S (+ M if rewriting history). **Risk:** The public TV display must not depend on `/uploads` — confirm (machine images?) before gating.

### HIGH

#### H1. Shared global pool is closed by request handlers — `VERIFIED` (race)
- **Location:** `compliance/calibiration.controller.js` (7 handlers) and `quality/beeCalculation.controller.js` (4) call `sql.connect(dbConfig3)` — the **process-wide singleton** — then `await pool.close()`. `services/escalation.service.js` and `cron/manpower.cron.js` use the same singleton.
- **Impact:** Two overlapping calibration/BEE requests (or one request during the 09:00 escalation cron) → the first to finish closes the pool under the other → intermittent `ConnectionError: Connection is closed`.
- **Fix:** Use `global.pool3` and never close it in a handler.
- **Effort:** S. **Risk:** Very low.

#### H2. ~200 handlers create and tear down a fresh connection pool per request — `VERIFIED`
- **Location:** `new sql.ConnectionPool(dbConfigX).connect()` appears in 54 files (≈200 call sites; e.g. `gasCharging` 14, `estReport` 13, `template` 13, `consolidatedReport` 11, `audit` 11, `auth.controller` for every login). `display/monitoring.controller.js:withPool` does it for every public TV poll.
- **Impact:** Every API call pays TCP + TLS-less login handshake + pool warm-up (pool `min: 2`), then closes. This is the dominant avoidable latency in the backend, and under bursts it multiplies open connections on SQL Server (no pool cap applies across throw-away pools).
- **Leaks (`VERIFIED`):** `utils/generateCode.js` (`generateTemplateCode`, `generateAuditCode`) **never closes** its pool — one leaked pool per template/audit creation. Visitor controllers (`generatepass`, `inOut`, `history`, `reports`, `manageEmployee`, `dashboard`) close only on the happy path (no `finally`) — leaks on any error.
- **Fix:** One shared helper, e.g. `getPool("garuda" | "wwms" | "app" | "clms")`, backed by the `connectToDB` singleton already in `db.config.js`. Mechanically replace `new sql.ConnectionPool(...).connect()` + `close()`. There are currently **five** different `getPool` idioms in the codebase; collapse them into this one.
- **Effort:** M (mechanical, ~1–2 days, file by file). **Risk:** Low; the only behavioural difference is connections being reused. Do it one module at a time.
- **Expected benefit:** Tens to hundreds of ms off most requests; stable connection counts on SQL Server.

#### H3. Public TV endpoints are uncached and unthrottled — `VERIFIED` (design) / `RISK` (load)
- **Location:** `routes/display.route.js` (`/dashboard/production-display-1|2`, `/hourly`, `/quality`, `/loss`, `/configs`), `Display/Monitoring.jsx` (`AUTO_REFRESH_MS = 30_000`).
- **Impact:** Every TV runs the same heavy month-to-date aggregate every 30 s through a brand-new pool (H2). N screens × M widgets scale linearly on the MES DB. Because they are unauthenticated and the JSON body limit is 50 MB, they are also the easiest DoS target.
- **Fix:** In-memory TTL cache (15–30 s) keyed by `(configId, shiftDate, shift, endpoint)` with in-flight request de-duplication; per-IP rate limit on public routes; drop `express.json` limit to ~1 MB globally and raise it only on the routes that need it.
- **Effort:** S–M. **Risk:** Data up to one TTL stale — acceptable for a 30 s refresh.

#### H4. Plaintext password column is still written — `VERIFIED`
- **Location:** `auth.controller.js` `signup` (line 62) and `changePassword` (line 310) write `Users.Password` alongside `PasswordHash`; login falls back to plaintext comparison.
- **Impact:** Anyone with read access to `GARUDA.Users` (or via C1) gets every user's password, which are often reused.
- **Fix:** Confirm with the GARUDA owners which external system still reads `Users.Password`. If none: stop writing it, null it out after all users have a hash, remove the fallback. If one does: plan its migration — this should have a date.
- **Effort:** S code / M coordination. **Risk:** Breaking an unknown consumer — that is why discovery comes first.

#### H5. No brute-force or abuse protection on auth — `VERIFIED`
- **Location:** `/auth/login`, `/auth/signup` (public). `Users.WrongPw` exists but is never incremented. Login returns `404 User not found` vs `401 Invalid credentials` (user enumeration).
- **Fix:** Rate limit per IP + per account (e.g. `express-rate-limit`, small and justified), increment `WrongPw` and auto-lock at a threshold (the lock UI already exists), return one generic message. Also consider `helmet` for standard headers.
- **Effort:** S. **Risk:** Shared-PC shop floors share an IP — key the limiter on `empcod + IP`, not IP alone.

#### H6. Vulnerable dependencies — `VERIFIED` (`npm audit`)
- Backend: 39 (2 critical, 8 high). Direct: `nodemailer` (high), `xlsx` (high, **no fix upstream**). Critical transitive: `fast-xml-parser`, `proxy-addr`.
- Frontend: 21 (3 critical, 13 high); `xlsx` again.
- **Fix:** `npm audit fix` (non-breaking) first; upgrade `nodemailer`. Replace `xlsx` with `exceljs` (already a dependency of both packages) — it's used in the backend only by `scripts/importMaterials.js`.
- **Effort:** S–M. **Risk:** Test the SMTP send path after the nodemailer upgrade (note the custom DNS workaround in `email.config.js`).

#### H7. Frontend: Calibration "Update" always reports failure — `VERIFIED` (ESLint `no-undef`)
- **Location:** `Frontend/src/pages/Compliance/Calibration.jsx:190` calls `load()`, which doesn't exist (`loadAssets` does).
- **Impact:** The update succeeds on the server, then `ReferenceError` is caught and the user sees "Update failed ❌" and a stale list — users will retry and may create confusion in the audit trail.
- **Fix:** `load()` → `loadAssets()`. **Effort:** XS.

### MEDIUM

| # | Finding | Location | Status | Fix / Effort |
|---|---|---|---|---|
| M1 | Dead cron still started at boot: `startManpowerCron` queries `ManpowerRequests` and sends HR escalation mails for a module that was removed | `server.js:110`, `cron/manpower.cron.js` | VERIFIED | Remove the cron + `manpowerApproval.templete.js` after confirming the table is dead. XS |
| M2 | `cron/taskReminder.js` is dead and broken (imports `./sendTaskReminderEmail.js` and `../config/db.js`, neither exists); frontend `taskReminderApi` targets a non-existent `/task-reminders/` route and is persisted to localStorage | `cron/taskReminder.js`, `Frontend/src/redux/api/taskReminder.js`, `store.js` | VERIFIED | Delete both. XS |
| M3 | Legacy localStorage permission seeding still runs on every app load though permissions now come from the server | `App.jsx:21`, `utils/permissionStore.js` | VERIFIED | Remove. XS |
| M4 | Unused backend deps: `agenda`, `mysql`, `simple-statistics` (no imports found) | `Backend/package.json` | VERIFIED | Remove. XS |
| M5 | Frontend has `"backend": "file:.."` dependency (links the repo root into node_modules) | `Frontend/package.json` | VERIFIED | Remove. XS |
| M6 | Timezone handling relies on the server's local TZ being IST: `convertToIST` adds +330 min to `new Date(<string without TZ>)`, which is parsed in the server's local zone (31 controllers). Docker images default to UTC → every report would be shifted 5½ h. Some crons (`calibrationEscalation`, `chemBulkStorageReport`, `manpower`) also omit `timezone:` | `utils/convertToIST.js`, `cron/*.js` | RISK [needs prod check] | Set `TZ=Asia/Kolkata` in the Dockerfile/service now (zero-code); long-term parse dates explicitly as IST. XS / M |
| M7 | Docker deployment is broken as written: compose `context: ./backend`/`./frontend` vs real dirs `Backend`/`Frontend` (fails on Linux); compose sets `VITE_API_URL` but code reads `VITE_API_BASE_URL`, and Vite env is build-time anyway; nginx has no SPA fallback (deep links 404) and no `/api` proxy; CORS is hard-coded to `http://localhost:5173` | `docker-compose.yml`, `Frontend/Dockerfile`, `server.js:29-34` | VERIFIED | Fix or delete the Docker files so nobody relies on them; make CORS origin an env var. S |
| M8 | Gate-pass e-mail links default to `http://localhost:3000` when `BACKEND_URL` is unset (not set in local `.env`) | `gatepass.controller.js:29` | RISK [needs prod check] | Fail fast at startup if unset in production. XS |
| M9 | 86 handlers return raw `err.message` in 500 responses (leaks SQL text/table names) | e.g. `chemReports.controller.js:160` | VERIFIED | Throw, let `globalErrorHandler` sanitise. S |
| M10 | Upload path case mismatch: DB stores `/uploads/calibration/...` but multer writes to `uploads/Calibration` — works on Windows only | `calibiration.controller.js:11`, `uploadMiddleware.js:272` | VERIFIED | Align case. XS |
| M11 | Startup runs ~68 DDL migrations (`CREATE/ALTER TABLE`) on every boot with the app's DB login, which therefore needs DDL rights | `config/migrations.js`, `garudaMigrations.js` | BEST PRACTICE | Track applied migrations in a table; run DDL with a separate privileged login. M |
| M12 | `X-Forwarded-For` first hop is trusted from any loopback peer; the first hop is client-supplied, so audit-log IPs are spoofable through the proxy | `utils/clientInfo.js:18` | RISK | Use the right-most untrusted hop. XS |
| M13 | Server starts listening before DB pools exist; early requests hit `global.pool1` = `undefined` (TypeError → 500). Auth fails open on session-check errors (deliberate, documented) | `server.js:42-97`, `auth.js:146` | VERIFIED | `await` pools then `listen`; keep fail-open but alert on it. XS |
| M14 | No graceful shutdown, `unhandledRejection` handler, or health endpoint; fire-and-forget promises (`touch`, host lookup) | `server.js` | BEST PRACTICE | Add `/healthz` (pings pools), SIGTERM handler closing pools. S |
| M15 | Two data-fetching patterns: raw axios in 87 files vs RTK Query in 32; no request de-dup or caching on the axios side; RTK `commonApi` is persisted to localStorage (stale data across sessions) | frontend-wide, `store.js:55` | VERIFIED | New/edited pages use RTK Query only; blacklist `commonApi` from persist. Ongoing |

### LOW

- **Repo hygiene (VERIFIED):** `Backend/check_test_tmp.mjs` (one-off debug script against a live DB), `scripts/__pycache__/*.pyc`, `scripts/testSalaryEmail.js` committed; `eng.traineddata` (5 MB) correctly ignored. Stale `.env` keys from the removed AI feature (`AI_PROVIDER`, `OPENROUTER_*`) — remove and **revoke that API key** at the provider.
- **Lint debt (VERIFIED):** `eslint .` → 162 errors / 71 warnings: 144 unused vars, 40 `exhaustive-deps` (potential stale-closure bugs — each needs a look), 17 empty `catch {}` blocks that swallow errors, 1 `no-undef` (H7).
- **Bundle (VERIFIED):** `exceljs` chunk 939 kB, `xlsx` 430 kB, `jspdf-autotable` 419 kB, `recharts` 297 kB **and** `chart.js` — two chart libraries. Lazy-load export libraries on click; standardise on one chart library over time.
- **Naming:** `calibiration.controller.js`, `planing` route/folder, `manpowerApproval.templete.js`. Cosmetic; rename only when touching those files.
- **Logging:** ~270 `console.*` calls in controllers/services/cron, no levels or request IDs. A tiny logger wrapper (or `pino`) with request IDs would make incident triage far easier.

---

## 3. Architecture & maintainability

| Observation | Evidence | Recommendation |
|---|---|---|
| **No data-access layer.** SQL lives inline in controllers; connection handling, date conversion and shift maths are re-implemented per file. | 5 `getPool` idioms; `convertToIST` in 31 files; shift helpers in `utils/productionLogic.js` **and** `Frontend/src/utils/productionLogic.js`/`shiftUtils.js` | Introduce `db/` (pool access, `query(poolName, sql, params)`) and move shared business rules (shift bounds, station maps, OEE) into one backend module the frontend consumes via API rather than duplicating. Do it incrementally — no big-bang rewrite. |
| **Oversized components.** | `Multidaypivotview.jsx` 5,972 LOC, `PartProcess/Dashboard.jsx` 4,658, `AuditEntry.jsx` 3,206, `ReworkReport.jsx` 3,113; backend `monitoring.controller.js` 2,042 | Split only when you next change them: extract data hooks (`useXxxData`), presentational table/chart pieces, and pure calculators (testable). |
| **No shared table component.** 113 page files hand-roll `<table>` markup with their own sorting/pagination/export. | grep | A single `DataTable` (sort, sticky header, empty/loading state, export button) would remove thousands of lines and make every report behave the same. |
| **Zero automated tests, no CI.** | No `*.test.*`/`*.spec.*`, no `.github/` | See §5. |

Architectural changes I am **not** recommending: switching ORM, moving to TypeScript wholesale, microservices, or replacing Redux. The current stack is adequate; the problems are consistency and missing guardrails, not technology choice.

---

## 4. UI / UX observations

Based on code structure (I did not click through every page in a browser — a hands-on pass with real users is advised).

1. **Inconsistent report pages.** Each report implements its own filters, table and export. Standardise a *report shell*: filter bar (date range presets: Today / Current shift / Yesterday / MTD), a "Run" button, a `DataTable`, and an export menu. Users learn it once.
2. **Silent failures.** 17 empty `catch {}` blocks plus H7 mean users sometimes see wrong success/failure messages. Every catch should show a toast with the server message.
3. **Accessibility is minimal.** 13 `aria-label`s in ~116k lines; icon-only buttons are unlabeled; modals are custom (`PopupModal`) without focus trapping. Add labels to icon buttons, focus-trap modals, and ensure colour isn't the only status signal (red/green pass/fail badges) — relevant for TV displays viewed at a distance too.
4. **Heavy pages on shop-floor PCs.** Export libraries (~1.8 MB minified) should load only when the user clicks Export.
5. **Approval flows** (gate pass, audits) should show the *logged-in* approver rather than letting them type a name — fixes C2's spoofing and removes a field from the form.
6. **Native `alert`/`confirm`** in 6 places — replace with the existing modal/toast for consistency.

---

## 5. Testing strategy (practical, incremental)

1. **CI first (1 day):** GitHub Actions/whatever you use → `npm ci`, `eslint` (fail on errors, not warnings), `vite build`, `npm audit --audit-level=high` (report-only initially).
2. **Backend security regression tests (2–3 days):** `vitest` + `supertest` against the Express app with the pool helper mocked. First tests should lock in the fixes: path traversal rejected (C1), e-mail token rejected as session (C3), unauthorised role gets 403 on an admin route (C2), `/uploads` requires auth (C4).
3. **Pure-logic unit tests:** shift-bound resolution, IST conversion, OEE/break-time calculations, template diff (`utils/diff/templateDiff.js`) — these are pure functions and the highest-value targets for correctness.
4. **SQL smoke tests** against the local restored backups (you have all 4 DBs locally): run each report endpoint for a fixed historic date and snapshot row counts/totals to catch regressions.
5. **Later:** a handful of Playwright journeys (login → run a report → export; gate-pass create → approve).

---

## 6. Phased roadmap

**Phase 0 — This week (security hot-fixes, all small):**
C1 path traversal → rotate secrets → C3 token separation → C4 auth on `/uploads` + untrack files → H1 global pool close → H7 Calibration `load()` → M1/M2 dead crons → revoke the leftover AI provider key.

**Phase 1 — Next 2–4 weeks (stability & performance):**
H2 shared pool helper (module by module, starting with `monitoring`, `auth`, `gasCharging`, `estReport`, `audit/template`) → H3 TV caching + rate limit + body limit → H5 login throttling/lockout → H6 dependency upgrades / drop `xlsx` → M6 set `TZ` → M9 error sanitisation → M13/M14 startup order, health check → CI pipeline.

**Phase 2 — 1–2 months (authorization & quality):**
C2 backend permission middleware (log-only → enforce) and approver-identity checks → H4 plaintext password retirement (after consumer discovery) → backend test suite for security + pure logic → migration tracking (M11).

**Phase 3 — Ongoing (maintainability & UX):**
Data-access layer and shared business-rule module; `DataTable` + report shell; split the 3k+ line components when touched; lazy-load export libs; consolidate on RTK Query and one chart library; accessibility pass.

---

## 7. What I need from you to close the gaps

1. Does any system other than this app read `GARUDA.Users.Password`? (gates H4)
2. Production: server OS/timezone, how the frontend is served (IIS/nginx/Vite?), whether `BACKEND_URL`, `NODE_ENV`, `TRUST_PROXY` are set. (M6, M7, M8, M12)
3. Does the public TV display load anything from `/uploads`? (C4)
4. Approximate concurrent users and number of TV screens — to size H3's cache and the pool `max` (currently 10 per DB).
5. Access to slow-query stats / execution plans if you want the index review done properly.
