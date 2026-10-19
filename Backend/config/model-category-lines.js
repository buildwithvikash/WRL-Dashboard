/**
 * Which brazing line each model category (MaterialCategory.Name) runs on.
 * Category names are the exact DB values (including odd spacing/spelling).
 *
 * Verified against brazing inspections for the last 30 days (2026-09-25):
 *   freezer -> Freezer, DUAL, FOW MODELS, COOLER, EUTECTIC, COOLER AND FREEZER,
 *              Upright Glass Door Freezer, ICE LINE REFRIGRTATOR, CHEST COOLER
 *   sus     -> 1/2/3 DOOR UNDERCOUNTER REFRIGERATOR, Storage Water Cooler, Compact
 *   visi    -> VISI COOLER
 * Categories with no brazing activity in that window are placed by the
 * groupings already used in rework.controller.js; "Choc Cooler" and
 * "4 DOOR  REFRIGERATOR" had no data and are left unassigned (null).
 */

export const LINES = {
  freezer: "Freezer Brazing",
  sus: "SUS Brazing",
  visi: "VISI Brazing",
};

export const CATEGORY_LINE = {
  // Freezer Brazing
  "Freezer": "freezer",
  "DUAL": "freezer",
  "FOW MODELS": "freezer",
  "EUTECTIC FOW FREEZER": "freezer",
  "COOLER": "freezer",
  "EUTECTIC": "freezer",
  "COOLER AND FREEZER": "freezer",
  "Upright Glass Door Freezer": "freezer",
  "ICE LINE REFRIGRTATOR": "freezer",
  "ILR": "freezer",
  "CHEST COOLER": "freezer",
  "MEDICAL": "freezer",
  "VACCINE FREEZER": "freezer",

  // SUS Brazing
  "1  DOOR UNDERCOUNTER REFRIGERATOR": "sus",
  "2 DOOR UNDERCOUNTER REFRIGERATOR": "sus",
  "2 GLASS DOOR UNDERCOUNTER REFRIGERATOR": "sus",
  "3 DOOR UNDERCOUNTER REFRIGERATOR": "sus",
  "Storage Water Cooler": "sus",
  "Compact": "sus",

  // VISI Brazing
  "VISI COOLER": "visi",

  // No brazing data yet — assign once known
  "Choc Cooler": null,
  "4 DOOR  REFRIGERATOR": null,
};

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const NORMALISED = Object.fromEntries(
  Object.entries(CATEGORY_LINE).map(([cat, line]) => [norm(cat), line]),
);

/** Line key ("freezer" | "sus" | "visi") for a category name, or null if unknown. */
export const lineForCategory = (categoryName) => NORMALISED[norm(categoryName)] ?? null;

/** Display label for a category's line, e.g. "SUS Brazing", or null. */
export const lineLabelForCategory = (categoryName) => {
  const key = lineForCategory(categoryName);
  return key ? LINES[key] : null;
};

/** All category names belonging to a line key. */
export const categoriesForLine = (lineKey) =>
  Object.entries(CATEGORY_LINE)
    .filter(([, line]) => line === lineKey)
    .map(([cat]) => cat);
