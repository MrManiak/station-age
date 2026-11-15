const BARE_ID = /^\d{6,}$/;
const LINK_ID = /showinfo:\d+\/\/(\d+)/;

export function parseStationId(input: string): bigint | null {
  const trimmed = input.trim();
  if (BARE_ID.test(trimmed)) {
    return BigInt(trimmed);
  }
  const match = trimmed.match(LINK_ID);
  if (match) {
    return BigInt(match[1]);
  }
  return null;
}
