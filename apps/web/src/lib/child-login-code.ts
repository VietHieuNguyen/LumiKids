/** Same alphabet as the API (no I, L, O, 0, 1): easy to read aloud and to type on a tablet. */
export const LOGIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LOGIN_CODE_LENGTH = 8;

/**
 * Formats what a child (or an adult helping) types into "XXXX-XXXX". Lower case is accepted; spaces, dashes
 * and characters outside the alphabet (I, L, O, 0, 1, punctuation) are dropped instead of guessed.
 */
export function formatLoginCodeInput(raw: string): string {
  const symbols = [...raw.toUpperCase()]
    .filter((character) => LOGIN_CODE_ALPHABET.includes(character))
    .slice(0, LOGIN_CODE_LENGTH)
    .join("");
  return symbols.length > 4 ? `${symbols.slice(0, 4)}-${symbols.slice(4)}` : symbols;
}

export function isCompleteLoginCode(formatted: string): boolean {
  return formatted.replace("-", "").length === LOGIN_CODE_LENGTH;
}
