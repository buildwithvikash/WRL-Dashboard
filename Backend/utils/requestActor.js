// Who performed an action, as stored in CreatedBy/UpdatedBy/ApprovedBy/ActionBy
// columns and shown to other users. Always the logged-in user's display name
// from the session — never a name sent in the request body.
export const actorOf = (req) =>
  String(req.user?.name || req.user?.usercode || req.user?.id || "").trim() || "SYSTEM";
