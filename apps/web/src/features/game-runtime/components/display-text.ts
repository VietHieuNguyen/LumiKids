const brokenEncoding = /[\u00c2\u00c3\u00c4\u00c6]|\u00e1[\u00ba\u00bb]/g;
let windowsBytes: Map<string, number> | undefined;

/** Repair reversible UTF-8/Windows-1252 mojibake for display only, never IDs or answers. */
export function readableGameText(value: string): string {
  let result = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const before = result.match(brokenEncoding)?.length ?? 0;
    if (!before) break;
    if (!windowsBytes) {
      const decoder = new TextDecoder("windows-1252");
      windowsBytes = new Map();
      for (let byte = 0; byte < 256; byte += 1) {
        windowsBytes.set(decoder.decode(new Uint8Array([byte])), byte);
      }
    }
    const bytes: number[] = [];
    for (const character of result) {
      const byte = windowsBytes.get(character);
      if (byte === undefined) return result.normalize("NFC");
      bytes.push(byte);
    }
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(bytes),
      );
      if ((decoded.match(brokenEncoding)?.length ?? 0) >= before) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result.normalize("NFC");
}
