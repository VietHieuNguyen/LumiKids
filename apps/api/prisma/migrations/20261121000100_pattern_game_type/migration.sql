-- PATTERN game type (Chỉ số 46). Additive enum values only.
ALTER TYPE "GameType" ADD VALUE 'PATTERN';
ALTER TYPE "CompletionRule" ADD VALUE 'ALL_SEQUENCES_COMPLETED';
ALTER TYPE "InteractionEventType" ADD VALUE 'FILL_PATTERN';
