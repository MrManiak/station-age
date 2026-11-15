import { Client, Events, GatewayIntentBits } from "discord.js";
import { data as stationAgeData, execute as stationAgeExecute } from "./commands/stationAge.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== stationAgeData.name) return;
  await stationAgeExecute(interaction);
});

client.login(token);
