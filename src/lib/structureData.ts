import { log } from "./log.js";

export type StructureEntry = {
  id: bigint;
  // Empty when the dataset has no name / type for the structure.
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
// Structure_ID, Type_ID, Type_Name, SolarSystem_ID, Region_ID, Structure_Name,
// Owner_ID, Owner_Name, Is_Freeport, First_Seen, Last_Seen.
const FIELD_COUNT = 11;

let cache: CacheSnapshot | null = null;
let inFlight: Promise<CacheSnapshot> | null = null;

// The dataset writes an empty field as two tabs, so a row gains one column per
// missing value. Undo that so fields can be read by position. A row that
// already has FIELD_COUNT columns has nothing to undo.
function splitFields(line: string): string[] {
  const cols = line.split("\t");
  if (cols.length === FIELD_COUNT) return cols;
  const fields: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    fields.push(cols[i]);
    if (cols[i] === "" && cols[i + 1] === "") i++;
  }
  return fields;
}

function parseDataset(text: string): StructureEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: StructureEntry[] = [];
  // Skip header row at index 0.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const fields = splitFields(line);
    const idStr = fields[0];
    // An estimate only needs the ID and First_Seen. First_Seen is always
    // second to last, so a row whose other fields don't line up is still
    // usable; it just has no name or type to show.
    const firstSeenStr = fields.at(-2) ?? "";
    const aligned = fields.length === FIELD_COUNT;
    const typeName = aligned ? fields[2] : "";
    const name = aligned ? fields[5] : "";
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
