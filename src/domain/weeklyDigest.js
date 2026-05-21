import { buildWeeklyReport } from "./weeklyReport.js";

export function buildWeeklyDigest(snapshots, tier, includeSymbolDetails) {
  return buildWeeklyReport(snapshots, { tier, includeSymbolDetails }).digestText;
}
