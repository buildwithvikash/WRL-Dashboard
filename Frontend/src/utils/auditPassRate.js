// One definition of an audit's pass rate and its colour band, shared by the
// list, view and edit screens and the PDF/Excel exports — they used to differ
// (pass ÷ answered vs pass ÷ total; 90/70 vs 80/60 bands), so the same audit
// showed different numbers/colours depending on where it was looked at.
export const PASS_RATE_GOOD = 90; // >= green
export const PASS_RATE_FAIR = 70; // >= amber, below = red

export const passRateOf = (summary) =>
  summary?.total > 0 ? Math.round((summary.pass / summary.total) * 100) : 0;

/** "good" | "fair" | "poor" — each caller maps it to its own colours. */
export const passRateLevel = (rate) =>
  rate >= PASS_RATE_GOOD ? "good" : rate >= PASS_RATE_FAIR ? "fair" : "poor";
