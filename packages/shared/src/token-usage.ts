import { z } from "zod";

export const tokenUsageQuerySchema = z
  .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    userId: z.uuid().optional(),
    search: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine(
    (v) =>
      v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 365 * 86400000,
    "Chọn khoảng thời gian tối đa 366 ngày.",
  );
const totals = z.object({
  calls: z.number(),
  unknownCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  thoughtTokens: z.number(),
  cachedTokens: z.number(),
  totalTokens: z.number(),
});
/** Latency of calls that recorded a duration (NFR-2: p95 ≤ 30 s). Null when none in the range. */
const latency = z.object({
  measuredCalls: z.number(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  maxMs: z.number().nullable(),
  /** Calls that hit the 30-second deadline. */
  timeoutCalls: z.number(),
  overBudgetCalls: z.number(),
});
const account = z.object({
  userId: z.string(),
  fullName: z.string(),
  email: z.string(),
});
export const tokenUsageReportSchema = z.object({
  totals,
  latency,
  accounts: z.array(account.extend({ totals })),
  items: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      attempt: z.number(),
      gameType: z.string(),
      model: z.string().nullable(),
      status: z.string(),
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      thoughtTokens: z.number().nullable(),
      cachedTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      durationMs: z.number().nullable(),
      createdAt: z.string(),
      user: account,
    }),
  ),
  pagination: z.object({
    page: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
export type TokenUsageReport = z.infer<typeof tokenUsageReportSchema>;
export type TokenUsageQuery = z.infer<typeof tokenUsageQuerySchema>;
