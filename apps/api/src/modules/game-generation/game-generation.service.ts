import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  AiClient,
  AiClientError,
  gameResponseSchema,
} from '@lumikids/ai-client';
import type {
  AiDiagnostic,
  GenerateGameInput,
  AiGenerationRequest,
} from '@lumikids/ai-client';
import { TokenUsageService } from '../token-usage/token-usage.service.js';
import {
  buildPatternContent,
  gameContentSchema,
  getGameContentAssetIds,
  getGameContentAssetIssues,
  patternContentSchema,
  patternLetterCount,
} from '@lumikids/shared';
import type { PatternRule } from '@lumikids/shared';
import aiConfig from '../../common/config/ai.config.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import { buildAbility } from '../../common/security/ability.js';
import type { Principal } from '../../common/security/principal.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';
import {
  checkRequestedLimits,
  searchTerms,
  selectCandidates,
  toCandidate,
} from './asset-selection.js';
import { validateGeneratedContent } from './game-validation.js';
import { normalizeHabitatAnswers } from './habitat-validation.js';
import { pickPatternAssets } from './pattern-composition.js';
import { composeQuantity } from './quantity-composition.js';
import { prepareVoiceInstructions } from './voice-instruction.js';

@Injectable()
export class GameGenerationService {
  private readonly logger = new Logger(GameGenerationService.name);
  private readonly inFlight = new Set<string>();
  constructor(
    private readonly assets: GameAssetService,
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
    private readonly ai: AiClient,
    private readonly usage: TokenUsageService,
  ) {}

  async generate(user: Principal, input: GenerateGameInput) {
    if (
      !buildAbility(user).can('GENERATE_GAME_CONTENT', 'GameContentGeneration')
    )
      throw new ForbiddenException();
    if (this.inFlight.has(user.userId)) throw new ApiProblem('GENERATION_BUSY');
    this.inFlight.add(user.userId);
    const requestId = randomUUID();
    const started = Date.now();
    let attempts = 0;
    let status = 'OK';
    let diagnostic: AiDiagnostic | undefined;
    let validationErrors: string[] = [];
    let validationStage: 'NEST' | 'AI_GATEWAY' | undefined;
    try {
      // PATTERN is composed deterministically from whitelisted pictures: no model call, no tokens.
      if (input.gameType === 'QUANTITY') {
        if (!input.quantity) throw new Error('Quantity options required');
        const candidates = (
          await this.assets.generationCandidates(
            user,
            searchTerms(
              [...input.quantity.fruits.map((f) => f.name), 'basket'].join(' '),
            ),
          )
        )
          .filter((a) => a.status === 'ACTIVE')
          .map(toCandidate);
        const content = composeQuantity(input.quantity, candidates);
        const current = await this.assets.generationAssets(
          user,
          getGameContentAssetIds(content),
        );
        if (getGameContentAssetIssues(content, current).length)
          throw new ApiProblem('ASSETS_CHANGED');
        return {
          gameType: input.gameType,
          gameContent: content,
          generation: {
            requestId,
            model: 'deterministic',
            attempts: 0,
            reviewRequired: true,
            warnings: [],
            validatedAt: new Date().toISOString(),
          },
        };
      }
      if (input.gameType === 'PATTERN')
        return await this.composePattern(user, input, requestId);
      if (!this.config.url || !this.config.token)
        throw new ApiProblem('AI_NOT_CONFIGURED');
      checkRequestedLimits(input.gameType, input.prompt);
      const candidates = selectCandidates(
        input.prompt,
        await this.assets.generationCandidates(user, searchTerms(input.prompt)),
        input.gameType,
      );
      checkRequestedLimits(input.gameType, input.prompt, candidates);
      const responseSchema = gameResponseSchema(
        input.gameType,
        candidates.map((asset) => asset.id),
      );
      const deadline = started + this.config.requestDeadlineMs;
      while (attempts < 2) {
        // A second attempt that cannot finish within the request deadline is not started.
        const remaining = deadline - Date.now();
        if (remaining < 1000) throw new ApiProblem('AI_TIMEOUT');
        attempts++;
        diagnostic = undefined;
        validationStage = undefined;
        try {
          const output = await this.generateTracked(
            user.userId,
            {
              ...input,
              requestId,
              candidates,
              responseSchema,
              attempt: attempts,
              validationErrors,
            },
            remaining,
          );
          const normalized = normalizeHabitatAnswers(
            output.gameContent,
            candidates,
          );
          const validation = validateGeneratedContent(
            normalized.value,
            input.gameType,
            input.prompt,
            candidates,
          );
          if (!validation.content || validation.errors.length) {
            validationErrors = validation.errors;
            validationStage = 'NEST';
            throw new AiClientError('AI_OUTPUT_INVALID', true);
          }
          const voiced = gameContentSchema.safeParse(
            prepareVoiceInstructions(validation.content),
          );
          if (!voiced.success) {
            validationErrors = ['VOICE_INSTRUCTION_INVALID'];
            validationStage = 'NEST';
            throw new AiClientError('AI_OUTPUT_INVALID', true);
          }
          const ids = getGameContentAssetIds(voiced.data);
          const current = await this.assets.generationAssets(user, ids);
          if (getGameContentAssetIssues(voiced.data, current).length)
            throw new ApiProblem('ASSETS_CHANGED');
          // Validate again against current metadata to reject edits/deactivation during the model call.
          const final = validateGeneratedContent(
            voiced.data,
            input.gameType,
            input.prompt,
            current.map(toCandidate),
          );
          if (final.errors.length) throw new ApiProblem('ASSETS_CHANGED');
          return {
            gameType: input.gameType,
            gameContent: voiced.data,
            generation: {
              requestId,
              model: output.model,
              attempts,
              reviewRequired: true,
              warnings: [
                ...new Set([...final.warnings, ...normalized.warnings]),
              ],
              validatedAt: new Date().toISOString(),
            },
          };
        } catch (error) {
          if (!(error instanceof AiClientError)) throw error;
          if (error.code === 'AI_OUTPUT_INVALID' && !validationStage)
            validationStage = 'AI_GATEWAY';
          diagnostic = error.diagnostic;
          if (!error.retryable || attempts === 2)
            throw new ApiProblem(error.code);
          // Small bounded backoff for transport/provider failures; no retry for quota/auth/config.
          if (error.code !== 'AI_OUTPUT_INVALID')
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      throw new ApiProblem('AI_OUTPUT_INVALID');
    } catch (error) {
      status =
        error instanceof ApiProblem ? error.publicCode : 'INTERNAL_ERROR';
      throw error;
    } finally {
      this.inFlight.delete(user.userId);
      const summary = JSON.stringify({
        requestId,
        gameType: input.gameType,
        durationMs: Date.now() - started,
        status,
        attempts,
        retries: Math.max(0, attempts - 1),
        ...diagnostic,
        ...(status === 'AI_OUTPUT_INVALID'
          ? {
              validationStage,
              validationErrors:
                validationStage === 'NEST'
                  ? validationErrors
                  : ['GATEWAY_OUTPUT_INVALID'],
            }
          : {}),
      });
      this.logger.log(summary);
      // Development diagnostics contain only the same fixed fields as the summary.
      // No user ID, prompt, assets, credentials or raw provider error is persisted.
      if (this.config.diagnosticLogFile) {
        try {
          await mkdir(dirname(this.config.diagnosticLogFile), {
            recursive: true,
          });
          await appendFile(
            this.config.diagnosticLogFile,
            `${summary}\n`,
            'utf8',
          );
        } catch {
          this.logger.warn(
            'Could not persist development generation diagnostic.',
          );
        }
      }
    }
  }

  private async composePattern(
    user: Principal,
    input: GenerateGameInput,
    requestId: string,
  ) {
    const rules: PatternRule[] = input.pattern?.rules ?? ['AB'];
    const sequenceCount = input.pattern?.sequenceCount ?? 5;
    const needed = Math.max(...rules.map(patternLetterCount));
    const wanted = rules.some((rule) => rule !== 'AB') ? 3 : 2;
    const active = (
      await this.assets.generationCandidates(user, searchTerms(input.prompt))
    )
      .filter((row) => row.status === 'ACTIVE')
      .map(toCandidate);
    const picked = pickPatternAssets(input.prompt, active, needed, wanted);
    // Seeded by the request itself so the same request previews the same sequences.
    const seed = createHash('sha256')
      .update(
        [input.prompt, rules.join(','), String(sequenceCount)]
          .concat(picked.map((asset) => asset.id))
          .join('|'),
      )
      .digest('hex');
    const content = patternContentSchema.parse(
      buildPatternContent({
        items: picked.map((asset, index) => ({
          id: `item-${index + 1}`,
          assetId: asset.id,
          label: asset.name.slice(0, 120),
        })),
        rules,
        sequenceCount,
        seed,
      }),
    );
    const current = await this.assets.generationAssets(
      user,
      picked.map((asset) => asset.id),
    );
    if (getGameContentAssetIssues(content, current).length)
      throw new ApiProblem('ASSETS_CHANGED');
    return {
      gameType: input.gameType,
      gameContent: content,
      generation: {
        requestId,
        model: 'deterministic',
        attempts: 0,
        reviewRequired: true,
        warnings: [] as string[],
        validatedAt: new Date().toISOString(),
      },
    };
  }

  private async generateTracked(
    userId: string,
    request: AiGenerationRequest,
    timeoutMs: number,
  ) {
    let output;
    const started = Date.now();
    try {
      output = await this.ai.generate(request, { timeoutMs });
    } catch (error) {
      await this.usage.record(
        userId,
        request,
        error instanceof AiClientError ? error.code : 'INTERNAL_ERROR',
        error instanceof AiClientError ? error.usage : undefined,
        undefined,
        Date.now() - started,
      );
      throw error;
    }
    await this.usage.record(
      userId,
      request,
      'OK',
      output.usage,
      output.model,
      Date.now() - started,
    );
    return output;
  }
}
