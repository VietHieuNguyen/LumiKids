import { fileURLToPath } from 'node:url';

// src/common/config and dist/common/config have the same depth below apps/api.
export function apiEnvFiles(): string[] {
  const root = new URL('../../../', import.meta.url);
  return [
    fileURLToPath(
      new URL(`.env.${process.env.NODE_ENV || 'development'}`, root),
    ),
    fileURLToPath(new URL('.env', root)),
  ];
}
