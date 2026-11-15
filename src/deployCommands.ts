import { REST, Routes } from "discord.js";
import { data as stationAgeData } from "./commands/stationAge.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must both be set in .env.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

const body = [stationAgeData.toJSON()];

try {
  console.log(`Registering ${body.length} application command(s)...`);
  const result = (await rest.put(Routes.applicationCommands(clientId), { body })) as unknown[];
  console.log(`Successfully registered ${result.length} application command(s).`);
} catch (err) {
  console.error("Failed to register application commands:", err);
  process.exit(1);
}
