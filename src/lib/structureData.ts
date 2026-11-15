import { log } from "./log.js";

export type StructureEntry = {
  id: bigint;
  name: string;
  typeName: string;
  firstSeen: Date;
  // Tightest upper-bound on creation date that respects ID monotonicity.
  // Computed by walking right-to-left after sorting by id and taking the
  // running min of firstSeen, so a structure's date is never later than that
  // of any higher-ID structure. Used for interpolation to avoid scraper-lag
  // outliers; firstSeen is preserved for exact-match display.
  monotonicFirstSeen: Date;
};

export type CacheSnapshot = {
  entries: StructureEntry[];
  fetchedAt: number;
};

const DATASET_URL = "https://static.adam4eve.eu/IDs/playerStructure_extended.txt";
const TTL_MS = 6 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INT = /^\d+$/;

let cache: CacheSnapshot | null = null;
let inFlight: Promise<CacheSnapshot> | null = null;

function parseDataset(text: string): StructureEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: StructureEntry[] = [];
  // Skip header row at index 0.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 10) continue;
    const idStr = cols[0];
    const typeName = cols[2];
    const name = cols[5];
    const firstSeenStr = cols[9];
    if (!POSITIVE_INT.test(idStr)) continue;
    if (!ISO_DATE.test(firstSeenStr)) continue;
    const firstSeen = new Date(`${firstSeenStr}T00:00:00Z`);
    if (Number.isNaN(firstSeen.getTime())) continue;
    entries.push({
      id: BigInt(idStr),
      name,
      typeName,
      firstSeen,
      monotonicFirstSeen: firstSeen,
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Right-to-left running minimum: enforces firstSeen monotonicity in ID order
  // by pulling outlier (late-observed) entries down to the tightest valid
  // upper bound — a structure can't have been created after a higher-ID
  // structure was first observed.
  for (let i = entries.length - 2; i >= 0; i--) {
    const next = entries[i + 1].monotonicFirstSeen;
    if (next < entries[i].monotonicFirstSeen) {
      entries[i].monotonicFirstSeen = next;
    }
  }
  return entries;
}

async function refresh(): Promise<CacheSnapshot> {
  const start = Date.now();
  log("data", `fetching dataset from ${DATASET_URL}`);
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const entries = parseDataset(text);
  if (entries.length === 0) {
    throw new Error("Dataset parsed to zero entries; refusing to cache.");
  }
  const snapshot: CacheSnapshot = { entries, fetchedAt: Date.now() };
  cache = snapshot;
  log("data", `fetched ${entries.length} entries in ${Date.now() - start}ms`);
  return snapshot;
}

export async function getStructureData(): Promise<CacheSnapshot> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    log("data", `cache hit (${cache.entries.length} entries, age ${Date.now() - cache.fetchedAt}ms)`);
    return cache;
  }
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  } else {
    log("data", "fetch already in flight, awaiting shared promise");
  }
  return inFlight;
}
