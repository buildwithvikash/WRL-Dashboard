# Audit Module Review (2026-10-13)

Review only. No code changed. DB figures come from **read-only** queries against the database configured in `Backend/.env`.

## 0. Scope

| Layer | Files | Lines |
|---|---|---|
| Backend controllers | `controllers/auditReport/{audit,template,image}.controller.js` | 2,427 |
| Backend utils | `utils/auditImageProcessor.js`, `utils/storage/*`, `utils/diff/templateDiff.js`, `utils/validation/templateSchema.js`, `utils/generateCode.js` | ~1,270 |
| Routes | `routes/auditReport.route.js` (25 endpoints, all behind `authenticate`) | 73 |
| Frontend pages | `pages/AuditReport/**` (38 files) | 15,449 |
| Frontend utils | `hooks/useAuditData.js`, `utils/generateAudit{PDF,Excel}.js`, `utils/audit*.js` | ~1,500 |

**Method.** I read every backend file listed in full. In the frontend I read the data hook and the save/submit/approve paths of `AuditEntry`, `AuditList`, `AuditApproval`, `AuditView`, `TemplateApproval` and `useDashboardData`. The rendering-heavy pages (`TemplateBuilder`, `TemplateList`, `TemplateView`, PDF/Excel exporters) were swept by pattern and lint, not read line by line. I didn't click through the UI in a browser.

**Live data snapshot (read-only):**

| Metric | Value |
|---|---|
| Audits | 66 total, **49 live** (14 approved, 30 draft, 2 rejected, 2 rework, 1 submitted) |
| Templates | 38 (36 active) |
| `AuditHistory` | **221.7 MB**, 1,576 "updated" rows. One audit has 332 history rows. |
| `Audits` table | 4.4 MB |

**What's done well**
- **Template versioning.** New versions are always inserted rather than overwritten. Each is written in a transaction and protected by a `UNIQUE (TemplateId, Version)` constraint, with an optimistic `basedOnVersion` conflict check (409).
- **Template validation.** `validateTemplatePayload` checks ids, blank names and duplicate names at every level before any write.
- **Image serving.** The `/audit-report/images/:filename` route rejects `..`, `/` and `\`.
- **Autosave ordering.** Saves are queued through `saveQueueRef` to avoid duplicate creates, with comments explaining why.
- **Version diff.** It compares by id (`templateDiff.js`), so a renamed checkpoint isn't reported as a delete plus an add.

---

## 1. Findings

Legend: **VERIFIED** = reproduced or traced end to end. **RISK** = plausible, depends on conditions.

### Critical

#### A1. Any user can approve their own audit or template by API, and approval status can be set on creation (VERIFIED)
- **Audits.** `createAudit` and `updateAudit` take `status` straight from `req.body` with no allow-list ([audit.controller.js:251](Backend/controllers/auditReport/audit.controller.js:251), [:487](Backend/controllers/auditReport/audit.controller.js:487)).
  - `POST /audits {status:"approved"}` creates an already-approved audit with no approver.
  - `PUT` on any draft, rework or rejected audit with `{status:"approved"}` approves it.
- **Approve/reject endpoints.** No role check, and `approverName` comes from the body. `AuditView.jsx:804` even shows a free-text "Approver name" box.
- **Templates.**
  - `createTemplate` and `createTemplateVersion` accept `approvalStatus` from the client.
  - `updateTemplate` accepts `approvalStatus`, `approvedBy` and `approvedAt` from the client ([template.controller.js:708-710](Backend/controllers/auditReport/template.controller.js:708)).
  - Any logged-in user can mark any template approved, under any name and date.
- **The "only approved templates" rule is frontend-only.** It lives in `AuditEntry.jsx:886`; `createAudit` never checks it.
- **Impact.** The quality sign-off trail can be forged or skipped entirely. No forged rows exist today (0 audits where approver = submitter, 0 audits on unapproved templates), so this is exposure, not a past incident.
- **Fix.**
  - Server-side status machine:
    - Create and update accept only `draft` or `submitted`.
    - `approved`, `rejected` and `rework` are reachable only through the approve/reject endpoints.
    - Approve/reject require the LQE (audits) or Quality Manager (templates) role.
    - Approver identity comes from `req.user.name`, never the body.
    - Reject self-approval (approver = submitter).
    - Reject audits whose template isn't approved.
  - Drop the approver-name textbox in `AuditView`.
- **Effort.** S–M (roughly half a day), one file per controller. **Risk:** low. All three UI approval screens already send the logged-in name.

#### A2. Arbitrary file delete through audit JSON (VERIFIED)
- `deleteImage(fileName)` does `path.join(IMAGE_DIR, fileName)` with no check that the result stays inside the folder ([imageStorage.js:285](Backend/utils/storage/imageStorage.js:285)).
- Its input is every checkpoint string field ending in `.jpg`, `.jpeg` or `.png` in the stored audit JSON, and that JSON is supplied by the client.
- Verified: `getImageFilePath('../BISSignatures/a.png')` resolves to `uploads\BISSignatures\a.png`.
- Delete the audit, or remove the field in an edit, and the server unlinks that file. That covers any `.jpg`/`.png` the process can reach: BIS signatures, machine images, other audits' evidence.
- **Fix.** In `deleteImage`, require `path.basename(f) === f` and that the resolved path starts with `IMAGE_DIR`. Also only treat fields as images if they match the server's own naming pattern (`^[A-Za-z0-9_-]+_\d+_[0-9a-f]{16}\.(jpg|jpeg|png)$`).
- **Effort:** XS.

#### A3. Uploaded "image" can be saved as `.html`, then served without login (VERIFIED)
- `generateImageFileName` takes the extension from the client-supplied name. Only the data-URL MIME prefix is validated.
- Verified: client name `x.html` saves as `AUD2026_…_….html`.
- `uploads/` is served by `express.static` with no auth (finding C4 of the main review), and it serves `.html` as `text/html`.
- A crafted audit therefore plants a page on the backend origin. That's stored XSS on the API's own origin, enough to make authenticated API calls as whoever opens the link.
- **Fix.** Derive the extension from the validated MIME type (`image/png` → `.png`), and check the file's magic bytes. **Effort:** XS.

### High

#### A4. Every autosave stores two full copies of the audit in history: 221 MB already (VERIFIED)
- The frontend autosaves 1.2 s after every change ([AuditEntry.jsx:1348](Frontend/src/pages/AuditReport/Audit/AuditEntry.jsx:1348)).
- Each `updateAudit` inserts an `AuditHistory` row with `PreviousData` and `NewData` holding the **entire** audit JSON both times ([audit.controller.js:526](Backend/controllers/auditReport/audit.controller.js:526)).
- Measured:
  - `AuditHistory` is 221.7 MB versus 4.4 MB of audits.
  - About 24 history rows per audit on average; the worst audit has 332.
  - That's roughly 3.4 MB of history per audit. At 20 audits per day it's about 25 GB per year, plus backup and I/O cost.
- **Fix.**
  - Write history only on state transitions (created, submitted, approved, rejected, rework, deleted), not on draft autosaves.
  - Or write a compact diff (`templateDiff.js` shows the pattern).
  - Optionally purge existing draft-autosave rows, after sign-off.
- **Effort:** S. **Risk:** lose step-by-step history of draft edits, which nobody reads today (`getAuditHistory` doesn't even return the payload columns).

#### A5. Audit List silently shows only the 50 newest audits; you're at 49 (VERIFIED)
- `AuditList` calls `loadAudits()` with no params, so the server's default `limit=50` applies.
- Search, status tabs, KPI counts, CSV selection and pagination all run client-side on those 50 rows.
- The 51st audit makes the oldest one unreachable from the list and search, and the counts become wrong.
- Same pattern elsewhere:
  - `AuditApproval` caps pending audits at 100.
  - The dashboard aggregates checkpoints over 200 audits.
  - Template lists cap at 50 (38 today).
- **Fix.** Server-side pagination and filtering (the endpoint already supports `page`, `limit`, `status`, `search` and dates). Have the list send them, add a `/audits/counts` aggregate for the tabs, and compute checkpoint aggregates in SQL. Short-term stopgap: pass `limit: 1000`.
- **Effort:** M for the proper fix, XS for the stopgap. **Expected benefit:** the list stays correct as volume grows, and payloads shrink.

#### A6. Ctrl+Enter can submit stale data over newer edits (VERIFIED by code trace)
- The keyboard handler's effect depends only on `[imagePreview]` ([AuditEntry.jsx:486-502](Frontend/src/pages/AuditReport/Audit/AuditEntry.jsx:486)). It keeps calling the `handleSubmit` and `persistAudit` from the last render where the preview changed.
- **Trigger:** the auditor opens or closes an image preview, keeps filling checkpoints, then presses Ctrl+Enter.
- **Result:** the submit payload uses the old `sections`, so later answers are overwritten and the audit is locked as submitted. Right after mount, Ctrl+Enter also shows "Serial Number is required" even when a serial is filled.
- **Fix.** Keep `handleSubmit` in a ref (`submitRef.current = handleSubmit` each render) and call `submitRef.current()` in the handler. **Effort:** XS.

#### A7. Image save failures are silent (VERIFIED)
- `processCheckpoint` catches save errors (over 10 MB, wrong MIME type, disk error), logs them, and sets the field to `null` ([auditImageProcessor.js:46](Backend/utils/auditImageProcessor.js:46)).
- The request still succeeds and the evidence photo is quietly dropped.
- **Fix.** Collect failures and return them (`imageErrors: [...]`) so the UI can flag the checkpoint, or fail the save. **Effort:** S.

#### A8. Files are deleted before the database write commits (VERIFIED)
- **`updateAudit`.** It deletes "removed" images (`cleanupRemovedImages`) **before** the `UPDATE`. If the update fails, the DB still points at files that are gone.
- **`deleteAudit`.** It hard-deletes all images before a *soft* delete, so a "deleted" audit can't be restored with its evidence.
- **Fix.** Run file cleanup after the DB commit. For soft delete, keep files, or move them to a trash folder. **Effort:** XS.

### Medium

| # | Finding | Evidence | Fix |
|---|---|---|---|
| A9 | **No server-side audit validation.** Submit accepts audits with every checkpoint "pending", missing required images, or blank required info fields. The frontend only checks serial, model and report name before submit ([AuditEntry.jsx:1386](Frontend/src/pages/AuditReport/Audit/AuditEntry.jsx:1386)). | VERIFIED | On `submitted`, validate against the template: no pending required checkpoints, required images present, required info fields filled. S |
| A10 | **Editing a rework audit silently turns it into a draft.** Autosave always sends `status:"draft"`, so a `rework` audit drops out of the rework queue on the first keystroke and loses its "returned for rework" marker. | VERIFIED (code) | Autosave should keep the current status (only explicit Submit changes it). XS |
| A11 | **Anyone can delete or edit anyone's audit.** There's no ownership check server-side; `isAuditOwner` exists only in `AuditList`. | VERIFIED | Restrict edit/delete to the creator or admin. S (fits with A1) |
| A12 | **Inconsistent "who did it".** Audits record the user's **name**, while template version/update/delete records numeric **usercode** (`req.user?.usercode \|\| name`), and create uses `req.user?.userCode` (wrong case, always undefined). Approvals store body name in `ApprovedBy` but usercode in `UpdatedBy`. | VERIFIED | One `actorOf(req)` helper → name everywhere. XS |
| A13 | **Audit and history writes aren't atomic.** Template writes use transactions; audit create/update/approve do two separate writes. | VERIFIED | Wrap in `sql.Transaction`. S |
| A14 | **Connection leak and per-request pools.** `generateAuditCode`/`generateTemplateCode` never close their pool (one leak per audit/template create). The other ~30 handlers open and close a fresh pool per request. | VERIFIED | Use `global.pool3`. S |
| A15 | **Lists ship full audit JSON.** `getAllAudits` returns `Sections`, `InfoData`, `Columns`, `HeaderConfig` and so on for every row (the dashboard pulls 200 full audits just to sum `Summary`), and `limit` is unbounded. | VERIFIED | List endpoint returns header fields plus `Summary` only; cap `limit`. S |
| A16 | **Model summary metric is simplistic.** "Audit Required" is hard-coded to 1 per model per period, matching is by model *name string*, and drafts and rejected audits count as "done". | VERIFIED | Confirm the business rule; count only submitted/approved. XS–S |
| A17 | **Template rename skips the uniqueness check.** `updateTemplate` can rename to an existing active name; create/duplicate check it, but there's no DB constraint. | VERIFIED | Same check in `updateTemplate` + filtered unique index on `(Name) WHERE IsActive=1 AND IsDeleted=0`. XS |
| A18 | **Any text ending in `.png`/`.jpg` counts as an image.** A remark like "refer drawing rev2.png" is collected for deletion (verified). Harmless today unless it collides with a real filename, but it's the same root cause as A2. | VERIFIED | Fixed by A2's strict pattern. |

### Low

- **Abandoned drafts pile up.** 30 of 49 live audits are drafts. Autosave creates an audit on the first edit, so abandoned sessions leave drafts behind. Consider a "My drafts" cleanup or an expiry.
- **Dead code.** `getTemplateCategories` has no route. The `corrected` history action (25 rows, 2.7 MB) is written by nothing in the current code; it's legacy.
- **History parsing.** `getTemplateHistory` uses a bare `JSON.parse`, so one bad row returns a 500. Use the existing `safeJsonParse`.
- **Lint.** 11 errors and 9 warnings in the module.
  - The 10 `'Icon' is defined but never used` errors are **false positives**: the ESLint config lacks JSX-variable usage detection.
  - Real ones: A6, plus missing-dependency warnings in `TemplateCompare`, `TemplateView`, `SerialScan` and `AuditApproval`. Same stale-closure risk class as A6; each needs a look.
- **Component size.** `AuditEntry.jsx` is 3,206 lines with 26 `useState`. `AuditView` is 1,864 and `TemplateBuilder` 1,833. Extract the save/autosave logic into a `useAuditPersistence` hook, and the checkpoint grid into a component, the next time they're touched.
- **Three approval UIs.** `AuditApproval`, `AuditEntry`'s approval modal and `AuditView` approve the same audit three different ways, and one asks for a typed name. Keep one shared approve/reject component.
- **Template draft storage.** `TemplateBuilder` saves drafts to localStorage under `template_draft_new`, shared across users of the same browser (shop-floor PCs). Key it by user id.

---

## 2. Recommended order

| Phase | Items | Effort |
|---|---|---|
| **Now (security)** | A2 file-delete containment, A3 extension from MIME, A1 server-side status machine and approver identity | ~1 day |
| **This week (data integrity)** | A6 Ctrl+Enter stale submit, A8 file cleanup after commit, A10 rework → draft, A7 surface image failures, A5 stopgap `limit` | ~1 day |
| **Next (growth)** | A4 stop full-snapshot history on autosave (+ purge plan), A5 real server pagination, A15 slim list payload, A9 server-side submit validation | 2–3 days |
| **Then (cleanup)** | A11–A14, A16–A17, approval-UI consolidation, `AuditEntry` split | ongoing |

## 3. Questions that change the fixes

1. **Approver rule.** Who may approve audits? Only "line quality engineer", or also super admin? Must the approver differ from the submitter?
2. **History.** Is draft-autosave history needed for anything? If not, can the 1,576 "updated" rows (~180 MB) be purged after the fix?
3. **Model summary.** What should "Audit Required" be: 1 per model per day, per shift, or per N units produced?
4. **Rework.** Should a reworked audit keep its `rework` status until it's resubmitted?
