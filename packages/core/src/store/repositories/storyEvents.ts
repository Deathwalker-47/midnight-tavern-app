import { z } from "zod";
import type { Db } from "../db.js";

export const StoryEventKindSchema = z.enum([
  "roll",
  "automatic",
  "denied",
  "action_budget_exceeded",
  "xp",
  "rank_up",
  "skill_unlocked",
  "item_created",
  "item_gained",
  "item_lost",
  "equipment_changed",
  "attribute_changed",
  "attribute_advanced",
  "attribute_advancement_denied",
  "death",
  "milestone",
  "chapter_started",
  "arc_completed",
  "difficulty_changed",
  "rulebook_regenerated",
  "stat_mode_changed",
  "classifier_recovery",
]);
export type StoryEventKind = z.infer<typeof StoryEventKindSchema>;

export const StoryEventSchema = z.object({
  id: z.string().min(1),
  storyId: z.string().min(1),
  messageId: z.string().min(1).optional(),
  turnIndex: z.number().int().nonnegative(),
  chapterIndex: z.number().int().nonnegative().optional(),
  actorId: z.string().min(1).optional(),
  kind: StoryEventKindSchema,
  payload: z.record(z.string(), z.unknown()),
  rulebookVersion: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
});
export type StoryEvent = z.infer<typeof StoryEventSchema>;

interface Row {
  id: string;
  story_id: string;
  message_id: string | null;
  turn_index: number;
  chapter_index: number | null;
  actor_id: string | null;
  kind: string;
  payload_json: string;
  rulebook_version: number;
  created_at: number;
}

function toRecord(row: Row): StoryEvent {
  return StoryEventSchema.parse({
    id: row.id,
    storyId: row.story_id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
    turnIndex: row.turn_index,
    ...(row.chapter_index != null ? { chapterIndex: row.chapter_index } : {}),
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    kind: row.kind,
    payload: JSON.parse(row.payload_json) as unknown,
    rulebookVersion: row.rulebook_version,
    createdAt: row.created_at,
  });
}

export interface StoryEventFilter {
  kinds?: readonly StoryEventKind[];
  actorId?: string;
  /**
   * Stable cursor for descending journal pagination. All three fields participate because a
   * single turn can emit several events at the same millisecond.
   */
  before?: StoryEventCursor;
  /** @deprecated Prefer {@link before}; retained for existing callers. */
  beforeTurn?: number;
  limit?: number;
}

export interface StoryEventCursor {
  turnIndex: number;
  createdAt: number;
  id: string;
}

export interface StoryEventRepo {
  insert(event: StoryEvent): Promise<void>;
  listByStory(storyId: string, filter?: StoryEventFilter): Promise<StoryEvent[]>;
  deleteByMessage(messageId: string): Promise<void>;
  deleteFromTurn(storyId: string, fromTurnIndex: number): Promise<void>;
  deleteMechanicalHistory(storyId: string): Promise<void>;
}

export function makeStoryEventRepo(db: Db): StoryEventRepo {
  return {
    async insert(event) {
      const parsed = StoryEventSchema.parse(event);
      await db.run(
        `INSERT INTO story_events
          (id, story_id, message_id, turn_index, chapter_index, actor_id, kind, payload_json,
           rulebook_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        parsed.id,
        parsed.storyId,
        parsed.messageId ?? null,
        parsed.turnIndex,
        parsed.chapterIndex ?? null,
        parsed.actorId ?? null,
        parsed.kind,
        JSON.stringify(parsed.payload),
        parsed.rulebookVersion,
        parsed.createdAt
      );
    },

    async listByStory(storyId, filter = {}) {
      const where = ["story_id = ?"];
      const params: Array<string | number> = [storyId];
      if (filter.kinds?.length) {
        where.push(`kind IN (${filter.kinds.map(() => "?").join(",")})`);
        params.push(...filter.kinds);
      }
      if (filter.actorId) {
        where.push("actor_id = ?");
        params.push(filter.actorId);
      }
      if (filter.before) {
        where.push(
          `(turn_index < ?
            OR (turn_index = ? AND created_at < ?)
            OR (turn_index = ? AND created_at = ? AND id < ?))`
        );
        params.push(
          filter.before.turnIndex,
          filter.before.turnIndex,
          filter.before.createdAt,
          filter.before.turnIndex,
          filter.before.createdAt,
          filter.before.id
        );
      } else if (filter.beforeTurn != null) {
        where.push("turn_index < ?");
        params.push(filter.beforeTurn);
      }
      const limit = Math.max(1, Math.min(500, filter.limit ?? 100));
      params.push(limit);
      const rows = await db.all<Row>(
        `SELECT * FROM story_events
         WHERE ${where.join(" AND ")}
         ORDER BY turn_index DESC, created_at DESC, id DESC
         LIMIT ?`,
        ...params
      );
      return rows.reverse().map(toRecord);
    },

    async deleteByMessage(messageId) {
      await db.run("DELETE FROM story_events WHERE message_id = ?", messageId);
    },

    async deleteFromTurn(storyId, fromTurnIndex) {
      await db.run(
        "DELETE FROM story_events WHERE story_id = ? AND turn_index >= ?",
        storyId,
        fromTurnIndex
      );
    },

    async deleteMechanicalHistory(storyId) {
      await db.run("DELETE FROM story_events WHERE story_id = ?", storyId);
    },
  };
}
