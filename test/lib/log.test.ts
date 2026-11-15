import { afterEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.js";

afterEach(() => {
  vi.useRealTimers();
});

it("prefixes the message with an ISO timestamp and the component", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-04T12:34:56.789Z"));
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

  log("data", "fetched 3 entries");

  expect(consoleLog).toHaveBeenCalledExactlyOnceWith(
    "2026-05-04T12:34:56.789Z [data] fetched 3 entries",
  );
});
