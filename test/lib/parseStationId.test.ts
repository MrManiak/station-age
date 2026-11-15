import { describe, expect, it } from "vitest";
import { parseStationId } from "../../src/lib/parseStationId.js";

describe("parseStationId", () => {
  it("parses a bare numeric ID", () => {
    expect(parseStationId("1049372805366")).toBe(1049372805366n);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseStationId("  1049372805366\n")).toBe(1049372805366n);
  });

  it("keeps full precision for IDs beyond Number.MAX_SAFE_INTEGER", () => {
    expect(parseStationId("9007199254740993")).toBe(9007199254740993n);
  });

  it("extracts the ID from an in-game showinfo link", () => {
    expect(parseStationId("<url=showinfo:35832//1049372805366>Jita - Some Fort</url>")).toBe(
      1049372805366n,
    );
  });

  it("extracts the ID from a link embedded in other text", () => {
    expect(parseStationId("check <url=showinfo:35834//1021008794949>this</url> out")).toBe(
      1021008794949n,
    );
  });

  it("rejects numbers shorter than six digits", () => {
    expect(parseStationId("12345")).toBeNull();
  });

  it("accepts a six-digit number", () => {
    expect(parseStationId("123456")).toBe(123456n);
  });

  it.each(["", "   ", "not an id", "1049372805366abc", "-1049372805366", "showinfo:35832"])(
    "returns null for %j",
    (input) => {
      expect(parseStationId(input)).toBeNull();
    },
  );
});
