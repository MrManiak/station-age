import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DATASET_URL = "https://static.adam4eve.eu/IDs/playerStructure_extended.txt";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// The first three lines mirror the real file: a title, the column header and a ruler.
const PREAMBLE = [
  "### Player owned structures exposed by ranged market orders (extended infos) ###",
  "Structure_ID\tType_ID\tType_Name\tSolarSystem_ID\tRegion_ID\tStructure_Name\t\tOwner_ID\tOwner_Name\t\tIs_Freeport\tFirst_Seen\tLast_Seen",
  "-".repeat(40),
];

function row(
  id: string,
  firstSeen: string,
  name = "Emsar - Thyssen-Krupp II",
  typeName = "Astrahus",
): string {
  return [
    id,
    "35832",
    typeName,
    "30005202",
    "10000067",
    name,
    "98517834",
    "Middle Germany Mining Public Company",
    "1",
    firstSeen,
    "2019-03-29",
  ].join("\t");
}

function dataset(...rows: string[]): string {
  return [...PREAMBLE, ...rows, ""].join("\r\n");
}

function stubFetch(...bodies: string[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(body));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The module keeps its cache in module scope, so each test loads a fresh copy.
async function loadModule() {
  return import("../../src/lib/structureData.js");
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parsing", () => {
  it("fetches the Adam4EVE dataset and parses each row", async () => {
    const fetchMock = stubFetch(
      dataset(row("1021010094060", "2016-11-17", "Emsar - Thyssen-Krupp II", "Astrahus")),
    );
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(DATASET_URL);
    expect(entries).toEqual([
      {
        id: 1021010094060n,
        name: "Emsar - Thyssen-Krupp II",
        typeName: "Astrahus",
        firstSeen: utc("2016-11-17"),
        monotonicFirstSeen: utc("2016-11-17"),
      },
    ]);
  });

  it("accepts LF line endings as well as CRLF", async () => {
    stubFetch(["header", row("1000000", "2020-01-01"), row("2000000", "2020-02-01")].join("\n"));
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(entries.map((e) => e.id)).toEqual([1000000n, 2000000n]);
  });

  it("always skips the first line, even if it looks like data", async () => {
    stubFetch([row("1000000", "2020-01-01"), row("2000000", "2020-02-01")].join("\n"));
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(entries.map((e) => e.id)).toEqual([2000000n]);
  });

  it("skips rows it cannot use", async () => {
    stubFetch(
      dataset(
        row("1000000", "2020-01-01"),
        "",
        "1000001\t35832\tAstrahus\ttoo few columns",
        row("not-a-number", "2020-01-02"),
        row("1000003", "02/01/2020"),
        row("1000004", "2020-13-45"),
        row("2000000", "2020-02-01"),
      ),
    );
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(entries.map((e) => e.id)).toEqual([1000000n, 2000000n]);
  });

  it("sorts entries by ID", async () => {
    stubFetch(
      dataset(
        row("3000000", "2020-03-01"),
        row("1000000", "2020-01-01"),
        row("2000000", "2020-02-01"),
        row("2000000", "2020-02-01", "Duplicate ID"),
      ),
    );
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(entries.map((e) => e.id)).toEqual([1000000n, 2000000n, 2000000n, 3000000n]);
  });

  it("caps monotonicFirstSeen at the earliest date of any higher ID, leaving firstSeen alone", async () => {
    stubFetch(
      dataset(
        row("1000000", "2020-01-01"),
        row("2000000", "2023-06-01"), // seen late: must predate 3000000
        row("3000000", "2020-03-01"),
        row("4000000", "2022-01-01"), // seen late: must predate 5000000
        row("5000000", "2021-01-01"),
      ),
    );
    const { getStructureData } = await loadModule();

    const { entries } = await getStructureData();

    expect(entries.map((e) => e.firstSeen)).toEqual(
      ["2020-01-01", "2023-06-01", "2020-03-01", "2022-01-01", "2021-01-01"].map(utc),
    );
    expect(entries.map((e) => e.monotonicFirstSeen)).toEqual(
      ["2020-01-01", "2020-03-01", "2020-03-01", "2021-01-01", "2021-01-01"].map(utc),
    );
  });
});

describe("fetch failures", () => {
  it("rejects when the server responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("nope", { status: 503, statusText: "Service Unavailable" }),
      ),
    );
    const { getStructureData } = await loadModule();

    await expect(getStructureData()).rejects.toThrow(
      "Failed to fetch dataset: 503 Service Unavailable",
    );
  });

  it("rejects rather than caching a dataset with no usable rows", async () => {
    stubFetch(dataset());
    const { getStructureData } = await loadModule();

    await expect(getStructureData()).rejects.toThrow(
      "Dataset parsed to zero entries; refusing to cache.",
    );
  });

  it("retries on the next call after a failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(new Response(dataset(row("1000000", "2020-01-01"))));
    vi.stubGlobal("fetch", fetchMock);
    const { getStructureData } = await loadModule();

    await expect(getStructureData()).rejects.toThrow("network down");
    const { entries } = await getStructureData();

    expect(entries).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("caching", () => {
  const NOW = new Date("2026-05-04T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("records when the data was fetched", async () => {
    stubFetch(dataset(row("1000000", "2020-01-01")));
    const { getStructureData } = await loadModule();

    const { fetchedAt } = await getStructureData();

    expect(fetchedAt).toBe(NOW.getTime());
  });

  it("serves the cached snapshot for just under six hours", async () => {
    const fetchMock = stubFetch(dataset(row("1000000", "2020-01-01")));
    const { getStructureData } = await loadModule();

    const first = await getStructureData();
    vi.advanceTimersByTime(SIX_HOURS_MS - 1);
    const second = await getStructureData();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleLog).toHaveBeenLastCalledWith(
      expect.stringContaining(`cache hit (1 entries, age ${SIX_HOURS_MS - 1}ms)`),
    );
  });

  it("refetches once the snapshot is six hours old", async () => {
    const fetchMock = stubFetch(
      dataset(row("1000000", "2020-01-01")),
      dataset(row("1000000", "2020-01-01"), row("2000000", "2020-02-01")),
    );
    const { getStructureData } = await loadModule();

    await getStructureData();
    vi.advanceTimersByTime(SIX_HOURS_MS);
    const refreshed = await getStructureData();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.entries).toHaveLength(2);
    expect(refreshed.fetchedAt).toBe(NOW.getTime() + SIX_HOURS_MS);
  });

  it("shares one fetch between concurrent callers", async () => {
    let respond!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getStructureData } = await loadModule();

    const first = getStructureData();
    const second = getStructureData();
    respond(new Response(dataset(row("1000000", "2020-01-01"))));

    expect(await second).toBe(await first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("fetch already in flight, awaiting shared promise"),
    );
  });
});
