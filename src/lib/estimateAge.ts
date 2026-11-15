import type { StructureEntry } from "./structureData.js";

export type EstimateResult =
  | { kind: "exact"; date: Date; match: StructureEntry }
  | { kind: "interpolated"; date: Date; lower: StructureEntry; upper: StructureEntry }
  | { kind: "extrapolated"; direction: "before" | "after"; boundary: StructureEntry };

export function estimateFirstSeen(targetId: bigint, entries: StructureEntry[]): EstimateResult {
  if (entries.length === 0) {
    throw new Error("No structure entries provided.");
  }

  // Binary search for exact match or insertion point.
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midId = entries[mid].id;
    if (midId === targetId) {
      return { kind: "exact", date: entries[mid].firstSeen, match: entries[mid] };
    }
    if (midId < targetId) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // After loop: lo is insertion index; entries[lo-1].id < targetId < entries[lo].id (when both sides exist).
  if (lo === 0) {
    return { kind: "extrapolated", direction: "before", boundary: entries[0] };
  }
  if (lo >= entries.length) {
    return { kind: "extrapolated", direction: "after", boundary: entries[entries.length - 1] };
  }
  const lower = entries[lo - 1];
  const upper = entries[lo];
  // Compute interpolation factor in Number after subtracting lower.id to keep precision.
  const span = Number(upper.id - lower.id);
  const offset = Number(targetId - lower.id);
  const t = span === 0 ? 0 : offset / span;
  // Use the monotonic-corrected dates for the math so scraper-lag outliers
  // can't produce a non-sensical (e.g. inverted) interpolation.
  const lowerMs = lower.monotonicFirstSeen.getTime();
  const upperMs = upper.monotonicFirstSeen.getTime();
  const estimatedMs = lowerMs + t * (upperMs - lowerMs);
  return { kind: "interpolated", date: new Date(estimatedMs), lower, upper };
}

export function humanizeAge(from: Date, to: Date = new Date()): string {
  let ms = to.getTime() - from.getTime();
  if (ms < 0) return "in the future";
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / dayMs);
  if (days < 1) return "less than a day";
  const years = Math.floor(days / 365);
  const remDays = days - years * 365;
  const months = Math.floor(remDays / 30);
  const restDays = remDays - months * 30;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (years === 0 && months === 0) parts.push(`${restDays} day${restDays === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}
