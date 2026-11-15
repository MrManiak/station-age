import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { estimateFirstSeen, formatDateUTC, humanizeAge } from "../lib/estimateAge.js";
import { log } from "../lib/log.js";
import { parseStationId } from "../lib/parseStationId.js";
import { getStructureData, type StructureEntry } from "../lib/structureData.js";

const DATASET_URL = "https://static.adam4eve.eu/IDs/playerStructure_extended.txt";

// The dataset doesn't always record a structure's name or type.
function describeStructure(entry: StructureEntry): string {
  if (entry.name && entry.typeName) return `${entry.name} (${entry.typeName})`;
  if (entry.name) return entry.name;
  if (entry.typeName) return `unnamed ${entry.typeName}`;
  return "unnamed structure";
}

export const data = new SlashCommandBuilder()
  .setName("stationage")
  .setDescription("Estimate the in-game age of an Eve Online structure from its ID.")
  .addStringOption((option) =>
    option
      .setName("input")
      .setDescription("Structure ID or in-game station link")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const raw = interaction.options.getString("input", true);
  const who = `${interaction.user.tag}${interaction.guildId ? `@${interaction.guildId}` : ""}`;
  log("cmd", `/stationage from ${who} input=${JSON.stringify(raw)}`);

  const id = parseStationId(raw);
  if (id === null) {
    log("cmd", `parse failed for input from ${who}`);
    await interaction.editReply(
      "Couldn't find a structure ID in that input. Paste a numeric ID or an in-game station link such as `<url=showinfo:35832//1049372805366>...</url>`.",
    );
    return;
  }

  try {
    const { entries, fetchedAt } = await getStructureData();
    log("search", `target=${id} over ${entries.length} entries`);
    const result = estimateFirstSeen(id, entries);
    const dateStr =
      result.kind === "extrapolated"
        ? `${result.direction} ${formatDateUTC(result.boundary.firstSeen)}`
        : formatDateUTC(result.date);
    log("search", `target=${id} result=${result.kind} date=${dateStr}`);

    const embed = new EmbedBuilder()
      .setTitle("Station age estimate")
      .addFields({ name: "Structure ID", value: id.toString(), inline: false });

    if (result.kind === "exact") {
      embed.addFields(
        { name: "Estimated first seen", value: formatDateUTC(result.date), inline: true },
        { name: "Age", value: `≈ ${humanizeAge(result.date)}`, inline: true },
        {
          name: "Method",
          value: `Exact match: ${describeStructure(result.match)}`,
          inline: false,
        },
      );
    } else if (result.kind === "interpolated") {
      embed.addFields(
        { name: "Estimated first seen", value: formatDateUTC(result.date), inline: true },
        { name: "Age", value: `≈ ${humanizeAge(result.date)}`, inline: true },
        {
          name: "Method",
          value:
            `Interpolated between ` +
            `\`${result.lower.id}\` (${formatDateUTC(result.lower.monotonicFirstSeen)}) and ` +
            `\`${result.upper.id}\` (${formatDateUTC(result.upper.monotonicFirstSeen)})`,
          inline: false,
        },
      );
    } else {
      const verb = result.direction === "before" ? "before" : "after";
      embed.addFields(
        {
          name: "Estimated first seen",
          value: `${verb} ${formatDateUTC(result.boundary.firstSeen)}`,
          inline: true,
        },
        {
          name: "Method",
          value:
            `Extrapolated — the target ID lies ${verb} the known dataset range. ` +
            `Boundary: \`${result.boundary.id}\` (${result.boundary.name || "unnamed structure"}).`,
          inline: false,
        },
      );
    }

    embed.setFooter({
      text: `Source: ${DATASET_URL} • cached ${new Date(fetchedAt).toISOString()}`,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("stationage command failed:", err);
    await interaction.editReply(
      "Something went wrong while estimating that station's age. Please try again shortly.",
    );
  }
}
