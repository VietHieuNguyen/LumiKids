import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  AiClient,
  AiClientError,
  gameResponseSchema,
} from '@lumikids/ai-client';
import type { AiDiagnostic, GenerateGameInput } from '@lumikids/ai-client';
import {
  getGameContentAssetIds,
  getGameContentAssetIssues,
} from '@lumikids/shared';
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

@Injectable()
export class GameGenerationService {
  private readonly logger = new Logger(GameGenerationService.name);
  private readonly inFlight = new Set<string>();
  constructor(
    private readonly assets: GameAssetService,
    @Inject(aiConfig.KEY) private readonly config: ConfigType<typeof aiConfig>,
    private readonly ai: AiClient,
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
      while (attempts < 2) {
        attempts++;
        diagnostic = undefined;
        validationStage = undefined;
        try {
          const output = await this.ai.generate({
            ...input,
            requestId,
            candidates,
            responseSchema,
            attempt: attempts,
            validationErrors,
          });
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
          const ids = getGameContentAssetIds(validation.content);
          const current = await this.assets.generationAssets(user, ids);
          if (getGameContentAssetIssues(validation.content, current).length)
            throw new ApiProblem('ASSETS_CHANGED');
          // Validate again against current metadata to reject edits/deactivation during the model call.
          const final = validateGeneratedContent(
            validation.content,
            input.gameType,
            input.prompt,
            current.map(toCandidate),
          );
          if (final.errors.length) throw new ApiProblem('ASSETS_CHANGED');
          return {
            gameType: input.gameType,
            gameContent: validation.content,
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
}
