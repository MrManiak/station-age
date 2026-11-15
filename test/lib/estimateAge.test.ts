import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateFirstSeen, formatDateUTC, humanizeAge } from "../../src/lib/estimateAge.js";
import type { StructureEntry } from "../../src/lib/structureData.js";

function entry(id: bigint, firstSeen: string, monotonicFirstSeen = firstSeen): StructureEntry {
  return {
    id,
    name: `Structure ${id}`,
    typeName: "Astrahus",
    firstSeen: new Date(`${firstSeen}T00:00:00Z`),
    monotonicFirstSeen: new Date(`${monotonicFirstSeen}T00:00:00Z`),
  };
}

describe("estimateFirstSeen", () => {
  const entries = [
    entry(1000n, "2020-01-01"),
    entry(2000n, "2020-01-11"),
    entry(3000n, "2020-03-01"),
    entry(4000n, "2021-01-01"),
  ];

  it("throws when there are no entries", () => {
    expect(() => estimateFirstSeen(1500n, [])).toThrow("No structure entries provided.");
  });

  it.each(entries)("returns an exact match for $id", (match) => {
    const result = estimateFirstSeen(match.id, entries);

    expect(result).toEqual({ kind: "exact", date: match.firstSeen, match });
  });

  it("reports the raw firstSeen for an exact match, not the monotonic-corrected date", () => {
    const corrected = entry(1000n, "2022-06-01", "2020-01-01");

    const result = estimateFirstSeen(1000n, [corrected, entry(2000n, "2020-01-01")]);

    expect(result).toMatchObject({ kind: "exact", date: new Date("2022-06-01T00:00:00Z") });
  });

  it("extrapolates before the dataset when the ID is below every entry", () => {
    expect(estimateFirstSeen(999n, entries)).toEqual({
      kind: "extrapolated",
      direction: "before",
      boundary: entries[0],
    });
  });

  it("extrapolates after the dataset when the ID is above every entry", () => {
    expect(estimateFirstSeen(4001n, entries)).toEqual({
      kind: "extrapolated",
      direction: "after",
      boundary: entries[3],
    });
  });

  it("extrapolates on either side of a single-entry dataset", () => {
    const only = [entry(1000n, "2020-01-01")];

    expect(estimateFirstSeen(1n, only)).toMatchObject({ direction: "before", boundary: only[0] });
    expect(estimateFirstSeen(2000n, only)).toMatchObject({ direction: "after", boundary: only[0] });
  });

  it("interpolates linearly between the two neighbouring entries", () => {
    // 1000 -> 2020-01-01, 2000 -> 2020-01-11: 30% of the way is three days in.
    const result = estimateFirstSeen(1300n, entries);

    expect(result).toEqual({
      kind: "interpolated",
      date: new Date("2020-01-04T00:00:00Z"),
      lower: entries[0],
      upper: entries[1],
    });
  });

  it("picks the correct neighbours for an ID in the upper half", () => {
    const result = estimateFirstSeen(3500n, entries);

    expect(result).toMatchObject({ kind: "interpolated", lower: entries[2], upper: entries[3] });
  });

  it("interpolates on the monotonic-corrected dates", () => {
    const lower = entry(1000n, "2023-01-01", "2020-01-01");
    const upper = entry(2000n, "2020-01-11");

    const result = estimateFirstSeen(1500n, [lower, upper]);

    expect(result).toMatchObject({ kind: "interpolated", date: new Date("2020-01-06T00:00:00Z") });
  });

  it("interpolates precisely between IDs beyond Number.MAX_SAFE_INTEGER", () => {
    const base = 9007199254740993n;
    const big = [entry(base, "2020-01-01"), entry(base + 10n, "2020-01-11")];

    const result = estimateFirstSeen(base + 5n, big);

    expect(result).toMatchObject({ kind: "interpolated", date: new Date("2020-01-06T00:00:00Z") });
  });
});

describe("humanizeAge", () => {
  const from = new Date("2020-01-01T00:00:00Z");
  const daysLater = (days: number) => new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says 'in the future' when the date is after the reference", () => {
    expect(humanizeAge(daysLater(1), from)).toBe("in the future");
  });

  it("says 'less than a day' for anything under 24 hours", () => {
    expect(humanizeAge(from, from)).toBe("less than a day");
    expect(humanizeAge(from, new Date(daysLater(1).getTime() - 1))).toBe("less than a day");
  });

  it.each([
    [1, "1 day"],
    [2, "2 days"],
    [29, "29 days"],
    [30, "1 month"],
    [45, "1 month"],
    [60, "2 months"],
    [364, "12 months"], // months are counted as 30 days, so a year has "12 months" and 5 days
    [365, "1 year"],
    [365 + 29, "1 year"],
    [365 + 30, "1 year 1 month"],
    [2 * 365, "2 years"],
    [2 * 365 + 95, "2 years 3 months"],
  ])("formats %d days as %j", (days, expected) => {
    expect(humanizeAge(from, daysLater(days))).toBe(expected);
  });

  it("measures against the current time by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(daysLater(400));

    expect(humanizeAge(from)).toBe("1 year 1 month");
  });
});

describe("formatDateUTC", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(formatDateUTC(new Date("2024-02-29T00:00:00Z"))).toBe("2024-02-29");
  });

  it("uses the UTC calendar day regardless of time of day", () => {
    expect(formatDateUTC(new Date("2024-12-31T23:59:59.999Z"))).toBe("2024-12-31");
  });
});
