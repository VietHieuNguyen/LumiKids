import { z } from "zod";
import {
  gameTypeSchema,
  countingContentV2StructureSchema,
  matchingContentStructureSchema,
  classificationContentV2StructureSchema,
} from "@lumikids/shared";
import type { GameType } from "@lumikids/shared";

export const generateGameSchema = z.strictObject({
  gameType: gameTypeSchema,
  prompt: z.string().trim().min(1).max(2000),
});
export type GenerateGameInput = z.infer<typeof generateGameSchema>;
export const candidateAssetSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().max(200),
  objectType: z.string().max(40),
  tags: z.array(z.string().max(80)).max(20),
  attributes: z.record(
    z.string().max(50),
    z.union([
      z.string().max(200),
      z.number().finite(),
      z.boolean(),
      z.array(z.string().min(1).max(40)).max(12),
    ]),
  ),
});
export type CandidateAsset = z.infer<typeof candidateAssetSchema>;
export const aiRequestSchema = generateGameSchema.extend({
  requestId: z.uuid(),
  candidates: z.array(candidateAssetSchema).min(1).max(40),
  responseSchema: z.record(z.string(), z.unknown()),
  attempt: z.number().int().min(1).max(2),
  validationErrors: z.array(z.string().regex(/^[A-Z_]{1,80}$/)).max(10),
});
export type AiGenerationRequest = z.infer<typeof aiRequestSchema>;
export const aiErrorCodes = [
  "AI_NOT_CONFIGURED",
  "AI_SERVICE_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_PROVIDER_AUTH_ERROR",
  "AI_QUOTA_EXCEEDED",
  "AI_PROVIDER_ERROR",
  "AI_PROVIDER_CONFIG_ERROR",
  "AI_OUTPUT_INVALID",
  "AI_OUTPUT_BLOCKED",
  "AI_OUTPUT_TRUNCATED",
  "AI_CONTRACT_INVALID",
] as const;
export type AiErrorCode = (typeof aiErrorCodes)[number];
const successSchema = z.strictObject({
  requestId: z.uuid(),
  gameContent: z.record(z.string(), z.unknown()),
  model: z.string().min(1).max(100),
});
const diagnosticSchema = z.strictObject({
  providerStatus: z.number().int().min(100).max(599),
  category: z.enum([
    "INVALID_API_KEY",
    "MODEL_OR_ENDPOINT_UNAVAILABLE",
    "STRUCTURED_OUTPUT_SCHEMA_REJECTED",
    "API_NOT_ENABLED",
    "BILLING_CONFIGURATION",
    "PROVIDER_REQUEST_REJECTED",
    "INTERNAL_TOKEN_REJECTED",
    "PROVIDER_PRECONDITION_FAILED",
    "REGION_UNSUPPORTED",
  ]),
});
export type AiDiagnostic = z.infer<typeof diagnosticSchema>;
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(aiErrorCodes),
    retryable: z.boolean(),
    diagnostic: diagnosticSchema.optional(),
  }),
});
export type AiGenerationResponse = z.infer<typeof successSchema>;

const structures = {
  COUNTING: countingContentV2StructureSchema,
  MATCHING: matchingContentStructureSchema,
  CLASSIFICATION: classificationContentV2StructureSchema,
};
// Generated from the actual shared Zod structures; cross-field refinements stay in NestJS.
export function gameResponseSchema(
  gameType: GameType,
  assetIds: string[],
): Record<string, unknown> {
  const schema = z.toJSONSchema(structures[gameType], { target: "draft-7" });
  const visit = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (value === null || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(value)) {
      // Nested bounded arrays multiply provider decoding states. Nest still enforces
      // every bound using the original full shared schema after generation.
      if (
        [
          "$schema",
          "format",
          "pattern",
          "minLength",
          "maxLength",
          "minItems",
          "maxItems",
          "minimum",
          "maximum",
        ].includes(name)
      )
        continue;
      if (name === "const") output.enum = [entry];
      else output[name] = visit(entry, name);
    }
    if (key === "assetId") output.enum = [...new Set(assetIds)];
    return output;
  };
  return visit(schema) as Record<string, unknown>;
}

export class AiClientError extends Error {
  readonly retryable: boolean;
  constructor(
    public readonly code: AiErrorCode,
    retryable: boolean,
    public readonly diagnostic?: AiDiagnostic,
  ) {
    super(code);
    this.name = "AiClientError";
    this.retryable =
      retryable &&
      [
        "AI_TIMEOUT",
        "AI_SERVICE_UNAVAILABLE",
        "AI_PROVIDER_ERROR",
        "AI_OUTPUT_INVALID",
      ].includes(code);
  }
}
export interface AiClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}
export class AiClient {
  constructor(private readonly options: AiClientOptions) {}
  async generate(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    const input = aiRequestSchema.parse(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const fetcher = this.options.fetcher ?? globalThis.fetch;
      const response = await fetcher.call(
        globalThis,
        new URL("/v1/game-generation", this.options.baseUrl),
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.token}`,
          },
          body: JSON.stringify(input),
        },
      );
      // Stream with a hard bound, including responses without Content-Length.
      const reader = response.body?.getReader();
      if (!reader) throw new AiClientError("AI_CONTRACT_INVALID", false);
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 262144) {
            await reader.cancel();
            throw new AiClientError("AI_CONTRACT_INVALID", false);
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        reader.releaseLock();
      }
      body += decoder.decode();
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        throw new AiClientError("AI_CONTRACT_INVALID", false);
      }
      if (!response.ok) {
        if ([401, 403].includes(response.status))
          throw new AiClientError("AI_PROVIDER_CONFIG_ERROR", false, {
            providerStatus: response.status,
            category: "INTERNAL_TOKEN_REJECTED",
          });
        const failure = errorSchema.safeParse(json);
        if (failure.success)
          throw new AiClientError(
            failure.data.error.code,
            failure.data.error.retryable,
            failure.data.error.diagnostic,
          );
        throw new AiClientError(
          "AI_SERVICE_UNAVAILABLE",
          response.status >= 500,
        );
      }
      const parsed = successSchema.safeParse(json);
      if (!parsed.success || parsed.data.requestId !== input.requestId)
        throw new AiClientError("AI_CONTRACT_INVALID", false);
      return parsed.data;
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (controller.signal.aborted)
        throw new AiClientError("AI_TIMEOUT", true);
      throw new AiClientError("AI_SERVICE_UNAVAILABLE", true);
    } finally {
      clearTimeout(timer);
    }
  }
}
