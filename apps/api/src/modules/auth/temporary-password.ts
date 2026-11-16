import { randomInt } from 'node:crypto';

/** No 0/O, 1/l/I: read aloud or copied from paper without mistakes. */
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 12 random characters (~68 bits) shown as xxxx-xxxx-xxxx. */
export function temporaryPassword(): string {
  let value = '';
  for (let index = 0; index < 12; index += 1) {
    if (index > 0 && index % 4 === 0) value += '-';
    value += alphabet[randomInt(alphabet.length)];
  }
  return value;
}
