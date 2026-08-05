import { z } from "zod";
import type { Db } from "../db.js";
import type { ClassifierRecoveryMetadata } from "../../classifier/classify.js";

export const TurnOperationStateSchema = z.enum([
  "classifying",
  "classifier_error",
  "ruling",
  "generating_loot",
  "thinking",
  "streaming",
  "saving",
  "idle",
  "error",
  "cancelled",
  "timed_out",
]);
export type TurnOperationState = z.infer<typeof TurnOperationStateSchema>;

const StageMetricSchema = z
  .object({
    stage: z.enum([
      "classifier",
      "npc_introduction",
      "npc_planner",
      "narrator",
      "authority_audit",
    ]),
    startedAt: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    // "timeout" is accepted on READ only: rows written before the outcome/cause split used it as
    // an outcome. Normalised below. Nothing new ever writes it.
    outcome: z.enum(["ok", "fallback", "timeout", "cancelled", "error"]),
    cause: z.enum(["timeout", "error"]).optional(),
  })
  .transform((metric) =>
    metric.outcome === "timeout"
      ? { ...metric, outcome: "fallback" as const, cause: "timeout" as const }
      : metric
  );

export const TurnOperationSchema = z.object({
  id: z.string().min(1),
  storyId: z.string().min(1),
  playerMessageId: z.string().min(1),
  narratorMessageId: z.string().min(1).optional(),
  state: TurnOperationStateSchema,
  classified: z.unknown().optional(),
  classifierRecovery: z.unknown().optional(),
  rulings: z.unknown().optional(),
  staged: z.unknown().optional(),
  prose: z.string().optional(),
  errorKind: z.string().optional(),
  stageMetrics: z.array(StageMetricSchema).max(100).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
type ParsedTurnOperation = z.infer<typeof TurnOperationSchema>;
export type TurnOperation = Omit<ParsedTurnOperation, "classifierRecovery"> & {
  classifierRecovery?: ClassifierRecoveryMetadata;
};

interface Row {
  id: string;
  story_id: string;
  player_message_id: string;
  narrator_message_id: string | null;
  state: string;
  classified_json: string | null;
  rulings_json: string | null;
  staged_json: string | null;
  prose: string | null;
  error_kind: string | null;
  stage_metrics_json: string | null;
  created_at: number;
  updated_at: number;
}

function parseJson(value: string | null): unknown | undefined {
  return value == null ? undefined : (JSON.parse(value) as unknown);
}

const CLASSIFIED_ENVELOPE_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeClassified(value: unknown): {
  classified?: unknown;
  classifierRecovery?: ClassifierRecoveryMetadata;
} {
  if (
    isObject(value) &&
    value.__midnightTurnClassified === CLASSIFIED_ENVELOPE_VERSION
  ) {
    return {
      ...(value.classified === undefined ? {} : { classified: value.classified }),
      ...(value.classifierRecovery === undefined
        ? {}
        : { classifierRecovery: value.classifierRecovery as ClassifierRecoveryMetadata }),
    };
  }
  return value === undefined ? {} : { classified: value };
}

function toRecord(row: Row): TurnOperation {
  const decoded = decodeClassified(parseJson(row.classified_json));
  return TurnOperationSchema.parse({
    id: row.id,
    storyId: row.story_id,
    playerMessageId: row.player_message_id,
    ...(row.narrator_message_id ? { narratorMessageId: row.narrator_message_id } : {}),
    state: row.state,
    ...decoded,
    ...(row.rulings_json ? { rulings: parseJson(row.rulings_json) } : {}),
    ...(row.staged_json ? { staged: parseJson(row.staged_json) } : {}),
    ...(row.prose != null ? { prose: row.prose } : {}),
    ...(row.error_kind ? { errorKind: row.error_kind } : {}),
    ...(row.stage_metrics_json
      ? { stageMetrics: parseJson(row.stage_metrics_json) }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as TurnOperation;
}

export interface TurnOperationRepo {
  upsert(operation: TurnOperation): Promise<void>;
  get(id: string): Promise<TurnOperation | undefined>;
  getByPlayerMessage(playerMessageId: string): Promise<TurnOperation | undefined>;
  latestIncomplete(storyId: string): Promise<TurnOperation | undefined>;
  /** Latest failed or non-terminal operation that may need inspection/recovery. */
  latestRecoverable(storyId: string): Promise<TurnOperation | undefined>;
  /**
   * Compare-and-set claim for retry. Clears staged output while preserving the operation and
   * original player-message identity, so concurrent retry callers cannot both generate prose.
   */
  claimRetry(id: string, expectedUpdatedAt: number, updatedAt: number): Promise<boolean>;
  delete(id: string): Promise<void>;
  deleteByStory(storyId: string): Promise<void>;
}

export function makeTurnOperationRepo(db: Db): TurnOperationRepo {
  return {
    async upsert(operation) {
      const parsed = TurnOperationSchema.parse(operation) as TurnOperation;
      const classifiedJson =
        parsed.classifierRecovery === undefined
          ? parsed.classified
          : {
              __midnightTurnClassified: CLASSIFIED_ENVELOPE_VERSION,
              ...(parsed.classified === undefined ? {} : { classified: parsed.classified }),
              classifierRecovery: parsed.classifierRecovery,
            };
      await db.run(
        `INSERT INTO turn_operations
          (id, story_id, player_message_id, narrator_message_id, state, classified_json,
           rulings_json, staged_json, prose, error_kind, stage_metrics_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           narrator_message_id = excluded.narrator_message_id,
           state = excluded.state,
           classified_json = excluded.classified_json,
           rulings_json = excluded.rulings_json,
           staged_json = excluded.staged_json,
           prose = excluded.prose,
           error_kind = excluded.error_kind,
           stage_metrics_json = excluded.stage_metrics_json,
           updated_at = excluded.updated_at`,
        parsed.id,
        parsed.storyId,
        parsed.playerMessageId,
        parsed.narratorMessageId ?? null,
        parsed.state,
        classifiedJson === undefined ? null : JSON.stringify(classifiedJson),
        parsed.rulings === undefined ? null : JSON.stringify(parsed.rulings),
        parsed.staged === undefined ? null : JSON.stringify(parsed.staged),
        parsed.prose ?? null,
        parsed.errorKind ?? null,
        parsed.stageMetrics === undefined ? null : JSON.stringify(parsed.stageMetrics),
        parsed.createdAt,
        parsed.updatedAt
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM turn_operations WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async getByPlayerMessage(playerMessageId) {
      const row = await db.get<Row>(
        "SELECT * FROM turn_operations WHERE player_message_id = ?",
        playerMessageId
      );
      return row ? toRecord(row) : undefined;
    },

    async latestIncomplete(storyId) {
      const row = await db.get<Row>(
        `SELECT * FROM turn_operations
         WHERE story_id = ? AND state NOT IN ('idle','error','cancelled','timed_out')
         ORDER BY updated_at DESC LIMIT 1`,
        storyId
      );
      return row ? toRecord(row) : undefined;
    },

    async latestRecoverable(storyId) {
      const row = await db.get<Row>(
        `SELECT * FROM turn_operations
         WHERE story_id = ? AND state IN (
           'classifying','classifier_error','ruling','generating_loot','thinking',
           'streaming','saving','error','cancelled','timed_out'
         )
         ORDER BY updated_at DESC LIMIT 1`,
        storyId
      );
      return row ? toRecord(row) : undefined;
    },

    async claimRetry(id, expectedUpdatedAt, updatedAt) {
      const result = await db.run(
        `UPDATE turn_operations
         SET state = 'classifying',
             narrator_message_id = NULL,
             classified_json = NULL,
             rulings_json = NULL,
             staged_json = NULL,
             prose = NULL,
             error_kind = NULL,
             stage_metrics_json = NULL,
             updated_at = ?
         WHERE id = ? AND updated_at = ? AND state IN (
           'classifying','classifier_error','ruling','generating_loot','thinking',
           'streaming','saving','error','cancelled','timed_out'
         )`,
        updatedAt,
        id,
        expectedUpdatedAt
      );
      return result.changes === 1;
    },

    async delete(id) {
      await db.run("DELETE FROM turn_operations WHERE id = ?", id);
    },

    async deleteByStory(storyId) {
      await db.run("DELETE FROM turn_operations WHERE story_id = ?", storyId);
    },
  };
}
