import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const put = vi.fn();
  const restInstances: FakeREST[] = [];

  class FakeREST {
    token: string | undefined;
    put = put;

    constructor(public options: unknown) {
      restInstances.push(this);
    }

    setToken(token: string) {
      this.token = token;
      return this;
    }
  }

  return { FakeREST, restInstances, put };
});

vi.mock("discord.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("discord.js")>()),
  REST: mocks.FakeREST,
}));

class ExitCalled extends Error {}

function spyOnExit() {
  return vi.spyOn(process, "exit").mockImplementation(() => {
    throw new ExitCalled();
  });
}

const deploy = () => import("../src/deployCommands.js");

beforeEach(() => {
  vi.resetModules();
  mocks.restInstances.length = 0;
  mocks.put.mockReset();
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("DISCORD_CLIENT_ID", "1234567890");
});

it.each(["DISCORD_TOKEN", "DISCORD_CLIENT_ID"])(
  "exits with an error when %s is not set",
  async (name) => {
    vi.stubEnv(name, undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = spyOnExit();

    await expect(deploy()).rejects.toBeInstanceOf(ExitCalled);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "DISCORD_TOKEN and DISCORD_CLIENT_ID must both be set in .env.",
    );
    expect(mocks.put).not.toHaveBeenCalled();
  },
);

it("registers /stationage as a global command for the application", async () => {
  mocks.put.mockResolvedValue([{ id: "1" }]);
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

  await deploy();

  expect(mocks.restInstances).toHaveLength(1);
  expect(mocks.restInstances[0].options).toEqual({ version: "10" });
  expect(mocks.restInstances[0].token).toBe("test-token");
  expect(mocks.put).toHaveBeenCalledExactlyOnceWith("/applications/1234567890/commands", {
    body: [expect.objectContaining({ name: "stationage" })],
  });
  expect(consoleLog.mock.calls).toEqual([
    ["Registering 1 application command(s)..."],
    ["Successfully registered 1 application command(s)."],
  ]);
});

it("exits with an error when Discord rejects the registration", async () => {
  const failure = new Error("401: Unauthorized");
  mocks.put.mockRejectedValue(failure);
  vi.spyOn(console, "log").mockImplementation(() => {});
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = spyOnExit();

  await expect(deploy()).rejects.toBeInstanceOf(ExitCalled);

  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    "Failed to register application commands:",
    failure,
  );
});
