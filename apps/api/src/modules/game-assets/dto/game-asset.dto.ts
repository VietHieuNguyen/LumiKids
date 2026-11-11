import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../../../generated/prisma/client.js';

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 16384) return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isJson(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= 100 &&
      value.every((item: unknown) => isJson(item, depth + 1))
    );
  if (typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, item]) =>
        key.length <= 100 &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        isJson(item, depth + 1),
    )
  );
}

const attributes = z.preprocess(
  parseJson,
  z.custom<Prisma.InputJsonObject>((value) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !isJson(value)
    )
      return false;
    return Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16384;
  }),
);
const tags = z.preprocess(
  parseJson,
  z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(50)
        .transform((tag) => tag.toLowerCase()),
    )
    .max(30)
    .transform((values) => [...new Set(values)]),
);
const metadata = z
  .object({
    name: z.string().trim().min(1).max(200),
    objectType: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
    tags,
    attributes,
  })
  .strict();

export const createAssetSchema = metadata.extend({
  tags: tags.default([]),
  attributes: attributes.default({}),
});
export const updateAssetSchema = metadata
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export const statusSchema = z
  .object({ status: z.enum(['ACTIVE', 'INACTIVE']) })
  .strict();
export const listAssetsSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(200).optional(),
    objectType: metadata.shape.objectType.optional(),
    tags: tags.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    // Exact equality on top-level scalar keys; nested metadata remains extensible.
    attributes: z
      .preprocess(
        parseJson,
        z
          .record(
            z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/),
            z.union([z.string().max(200), z.number().finite(), z.boolean()]),
          )
          .refine((value) => Object.keys(value).length <= 10),
      )
      .optional(),
  })
  .strict();

export type CreateAssetInput = z.output<typeof createAssetSchema>;
export type UpdateAssetInput = z.output<typeof updateAssetSchema>;
export type ListAssetsInput = z.output<typeof listAssetsSchema>;
export type StatusInput = z.output<typeof statusSchema>;

@Injectable()
export class AssetValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Fixed messages identify the field without echoing input or Zod internals.
      const messages = {
        name: 'Invalid game asset name.',
        objectType: 'Invalid game asset object type.',
        tags: 'Invalid game asset tags.',
        attributes: 'Invalid game asset attributes.',
      };
      for (const field of [
        'name',
        'objectType',
        'tags',
        'attributes',
      ] as const) {
        if (result.error.issues.some((issue) => issue.path[0] === field))
          throw new BadRequestException(messages[field]);
      }
      throw new BadRequestException('Invalid game asset metadata or query.');
    }
    return result.data;
  }
}
