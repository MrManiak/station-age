import { Events, GatewayIntentBits } from "discord.js";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => unknown;

  class FakeClient {
    handlers = new Map<string, Handler>();
    login = vi.fn();

    constructor(public options: unknown) {
      clients.push(this);
    }

    once(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return this;
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return this;
    }
  }

  const clients: FakeClient[] = [];
  return { FakeClient, clients, execute: vi.fn() };
});

vi.mock("discord.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("discord.js")>()),
  Client: mocks.FakeClient,
}));

vi.mock("../src/commands/stationAge.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/commands/stationAge.js")>()),
  execute: mocks.execute,
}));

class ExitCalled extends Error {}

async function startBot() {
  await import("../src/index.js");
  expect(mocks.clients).toHaveLength(1);
  const client = mocks.clients[0];
  const emit = (event: string, ...args: unknown[]) => {
    const handler = client.handlers.get(event);
    if (!handler) throw new Error(`No handler registered for ${event}`);
    return handler(...args);
  };
  return { client, emit };
}

beforeEach(() => {
  vi.resetModules();
  mocks.clients.length = 0;
  mocks.execute.mockReset();
  vi.stubEnv("DISCORD_TOKEN", "test-token");
});

it("exits with an error when DISCORD_TOKEN is not set", async () => {
  vi.stubEnv("DISCORD_TOKEN", undefined);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new ExitCalled();
  });

  await expect(import("../src/index.js")).rejects.toBeInstanceOf(ExitCalled);

  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    "DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.",
  );
  expect(mocks.clients).toHaveLength(0);
});

it("logs in with the token, requesting only the Guilds intent", async () => {
  const { client } = await startBot();

  expect(client.options).toEqual({ intents: [GatewayIntentBits.Guilds] });
  expect(client.login).toHaveBeenCalledExactlyOnceWith("test-token");
});

it("announces the bot's tag once it is ready", async () => {
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const { emit } = await startBot();

  emit(Events.ClientReady, { user: { tag: "station-age#1234" } });

  expect(consoleLog).toHaveBeenCalledExactlyOnceWith("Logged in as station-age#1234");
});

it("runs the command for a /stationage interaction", async () => {
  const { emit } = await startBot();
  const interaction = { isChatInputCommand: () => true, commandName: "stationage" };

  await emit(Events.InteractionCreate, interaction);

  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(interaction);
});

it("ignores interactions that are not slash commands", async () => {
  const { emit } = await startBot();
  const interaction = { isChatInputCommand: () => false, commandName: "stationage" };

  await emit(Events.InteractionCreate, interaction);

  expect(mocks.execute).not.toHaveBeenCalled();
});

it("ignores other slash commands", async () => {
  const { emit } = await startBot();
  const interaction = { isChatInputCommand: () => true, commandName: "ping" };

  await emit(Events.InteractionCreate, interaction);

  expect(mocks.execute).not.toHaveBeenCalled();
});
