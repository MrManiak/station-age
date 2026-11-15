import type { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { data, execute } from "../../src/commands/stationAge.js";
import { getStructureData, type StructureEntry } from "../../src/lib/structureData.js";

vi.mock("../../src/lib/structureData.js");

const NOW = new Date("2025-07-01T00:00:00Z");
const FETCHED_AT = new Date("2025-06-30T21:00:00Z").getTime();
const FOOTER =
  "Source: https://static.adam4eve.eu/IDs/playerStructure_extended.txt • cached 2025-06-30T21:00:00.000Z";

function entry(id: bigint, name: string, firstSeen: string, monotonic = firstSeen): StructureEntry {
  return {
    id,
    name,
    typeName: "Fortizar",
    firstSeen: new Date(`${firstSeen}T00:00:00Z`),
    monotonicFirstSeen: new Date(`${monotonic}T00:00:00Z`),
  };
}

const ENTRIES = [
  entry(1000000n, "Jita - First", "2024-01-01"),
  entry(2000000n, "Amarr - Second", "2025-06-01", "2024-01-11"),
  entry(3000000n, "Dodixie - Third", "2025-01-01"),
];

function fakeInteraction(input: string, guildId: string | null = "111222333") {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const getString = vi.fn().mockReturnValue(input);
  const interaction = {
    deferReply,
    editReply,
    options: { getString },
    user: { tag: "pilot#0001" },
    guildId,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, deferReply, editReply, getString };
}

function repliedEmbed(editReply: ReturnType<typeof vi.fn>) {
  expect(editReply).toHaveBeenCalledTimes(1);
  const [{ embeds }] = editReply.mock.calls[0] as [{ embeds: EmbedBuilder[] }];
  expect(embeds).toHaveLength(1);
  return embeds[0].toJSON();
}

let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(getStructureData).mockResolvedValue({ entries: ENTRIES, fetchedAt: FETCHED_AT });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("command definition", () => {
  it("registers /stationage with one required string option", () => {
    expect(data.toJSON()).toMatchObject({
      name: "stationage",
      description: "Estimate the in-game age of an Eve Online structure from its ID.",
      options: [{ name: "input", required: true, type: 3 }],
    });
  });
});

describe("execute", () => {
  it("defers the reply before doing any work", async () => {
    const { interaction, deferReply, getString } = fakeInteraction("1000000");

    await execute(interaction);

    expect(deferReply).toHaveBeenCalledTimes(1);
    expect(deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getStructureData).mock.invocationCallOrder[0],
    );
    expect(getString).toHaveBeenCalledWith("input", true);
  });

  it("explains the accepted formats when the input has no structure ID", async () => {
    const { interaction, editReply } = fakeInteraction("my fortizar");

    await execute(interaction);

    expect(editReply).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Couldn't find a structure ID in that input."),
    );
    expect(getStructureData).not.toHaveBeenCalled();
  });

  it("reports the first-seen date and age for an exact match", async () => {
    const { interaction, editReply } = fakeInteraction("2000000");

    await execute(interaction);

    expect(repliedEmbed(editReply)).toEqual({
      title: "Station age estimate",
      fields: [
        { name: "Structure ID", value: "2000000", inline: false },
        { name: "Estimated first seen", value: "2025-06-01", inline: true },
        { name: "Age", value: "≈ 1 month", inline: true },
        { name: "Method", value: "Exact match: Amarr - Second (Fortizar)", inline: false },
      ],
      footer: { text: FOOTER },
    });
  });

  it("accepts an in-game link as input", async () => {
    const { interaction, editReply } = fakeInteraction(
      "<url=showinfo:35833//2000000>Amarr - Second</url>",
    );

    await execute(interaction);

    expect(repliedEmbed(editReply).fields?.[0]).toEqual({
      name: "Structure ID",
      value: "2000000",
      inline: false,
    });
  });

  it("interpolates between neighbours and names them, using their corrected dates", async () => {
    const { interaction, editReply } = fakeInteraction("1500000");

    await execute(interaction);

    // Halfway between 2024-01-01 and the corrected 2024-01-11.
    expect(repliedEmbed(editReply)).toEqual({
      title: "Station age estimate",
      fields: [
        { name: "Structure ID", value: "1500000", inline: false },
        { name: "Estimated first seen", value: "2024-01-06", inline: true },
        { name: "Age", value: "≈ 1 year 5 months", inline: true },
        {
          name: "Method",
          value: "Interpolated between `1000000` (2024-01-01) and `2000000` (2024-01-11)",
          inline: false,
        },
      ],
      footer: { text: FOOTER },
    });
  });

  it("says 'before' when the ID is below the known range", async () => {
    const { interaction, editReply } = fakeInteraction("999999");

    await execute(interaction);

    expect(repliedEmbed(editReply)).toEqual({
      title: "Station age estimate",
      fields: [
        { name: "Structure ID", value: "999999", inline: false },
        { name: "Estimated first seen", value: "before 2024-01-01", inline: true },
        {
          name: "Method",
          value:
            "Extrapolated — the target ID lies before the known dataset range. Boundary: `1000000` (Jita - First).",
          inline: false,
        },
      ],
      footer: { text: FOOTER },
    });
  });

  it("says 'after' when the ID is above the known range", async () => {
    const { interaction, editReply } = fakeInteraction("3000001");

    await execute(interaction);

    expect(repliedEmbed(editReply)).toEqual({
      title: "Station age estimate",
      fields: [
        { name: "Structure ID", value: "3000001", inline: false },
        { name: "Estimated first seen", value: "after 2025-01-01", inline: true },
        {
          name: "Method",
          value:
            "Extrapolated — the target ID lies after the known dataset range. Boundary: `3000000` (Dodixie - Third).",
          inline: false,
        },
      ],
      footer: { text: FOOTER },
    });
  });

  it("apologises and logs the error when the dataset cannot be loaded", async () => {
    const failure = new Error("network down");
    vi.mocked(getStructureData).mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { interaction, editReply } = fakeInteraction("2000000");

    await execute(interaction);

    expect(editReply).toHaveBeenCalledExactlyOnceWith(
      "Something went wrong while estimating that station's age. Please try again shortly.",
    );
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("stationage command failed:", failure);
  });

  it("logs who ran the command, with the guild when there is one", async () => {
    const { interaction } = fakeInteraction("2000000", "111222333");

    await execute(interaction);

    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('[cmd] /stationage from pilot#0001@111222333 input="2000000"'),
    );
  });

  it("logs just the user for a command run outside a guild", async () => {
    const { interaction } = fakeInteraction("nonsense", null);

    await execute(interaction);

    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('[cmd] /stationage from pilot#0001 input="nonsense"'),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("[cmd] parse failed for input from pilot#0001"),
    );
  });
});
