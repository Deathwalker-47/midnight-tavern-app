/**
 * Lorebook repository (tables `lorebooks`, `lorebook_entries`, `story_lorebooks`; low-level-plan-v2 §2).
 *
 * Lorebooks are first-class, story-independent entities linked to stories many-to-many. This
 * replaces the v1 per-story `lorebook` table. Three concerns live here:
 *   • lorebook CRUD + entry CRUD (the global library the Lorebook screen edits)
 *   • attach / detach / setAttachedEnabled (the m2m link a story owns)
 *   • the query context assembly consumes: every enabled entry across every enabled attachment,
 *     ordered by priority then insertion_order (§7.3).
 *
 * `keys` is a string[] stored as JSON. `enabled` exists at BOTH levels — link (story_lorebooks)
 * and entry (lorebook_entries) — and context assembly requires both to be true.
 */
import { z } from "zod";
import type { Db } from "../db.js";
import {
  LorebookSchema,
  LorebookEntrySchema,
  LorebookSourceSchema,
  type Lorebook,
  type LorebookEntry,
} from "../../types/index.js";
import { toBool, toInt } from "./codec.js";

const KeysSchema = z.array(z.string());

interface BookRow {
  id: string;
  name: string;
  description: string;
  created_at: number;
  source: string;
}

interface EntryRow {
  id: string;
  lorebook_id: string;
  keys: string;
  content: string;
  enabled: number;
  always_on: number;
  priority: number;
  insertion_order: number;
}

interface AttachRow extends BookRow {
  link_enabled: number;
}

function toBook(row: BookRow): Lorebook {
  return LorebookSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    source: LorebookSourceSchema.parse(row.source),
  });
}

function toEntry(row: EntryRow): LorebookEntry {
  return LorebookEntrySchema.parse({
    id: row.id,
    lorebookId: row.lorebook_id,
    keys: KeysSchema.parse(JSON.parse(row.keys)),
    content: row.content,
    enabled: toBool(row.enabled),
    alwaysOn: toBool(row.always_on),
    priority: row.priority,
    insertionOrder: row.insertion_order,
  });
}

/** A lorebook attached to a story, carrying the link-level enabled flag. */
export interface AttachedLorebook extends Lorebook {
  /** The story_lorebooks.enabled flag for THIS story's attachment. */
  linkEnabled: boolean;
}

export interface LorebookRepo {
  // — Lorebook CRUD —
  createLorebook(book: Lorebook): Promise<void>;
  getLorebook(id: string): Promise<Lorebook | undefined>;
  listLorebooks(): Promise<Lorebook[]>;
  renameLorebook(id: string, name: string, description?: string): Promise<void>;
  /** Delete a lorebook and (via cascade) its entries + attachments. */
  deleteLorebook(id: string): Promise<void>;
  /** Count of stories a lorebook is attached to (UI uses this to warn before delete). */
  attachmentCount(lorebookId: string): Promise<number>;

  // — Entry CRUD —
  insertEntry(entry: LorebookEntry): Promise<void>;
  getEntry(id: string): Promise<LorebookEntry | undefined>;
  listEntries(lorebookId: string): Promise<LorebookEntry[]>;
  updateEntry(entry: LorebookEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /** Next insertion_order for a lorebook (max+1, or 0). */
  nextInsertionOrder(lorebookId: string): Promise<number>;

  // — Attach / detach —
  attach(storyId: string, lorebookId: string, enabled?: boolean): Promise<void>;
  detach(storyId: string, lorebookId: string): Promise<void>;
  setAttachedEnabled(storyId: string, lorebookId: string, enabled: boolean): Promise<void>;
  /** Lorebooks attached to a story, each with its link-level enabled flag. */
  listAttached(storyId: string): Promise<AttachedLorebook[]>;

  /**
   * Every entry that context assembly should consider for a story: entries belonging to a lorebook
   * attached AND link-enabled, with the entry itself enabled. Ordered by priority then
   * insertion_order (§7.3). `alwaysOn`/`keys` filtering happens in the pipeline, not here.
   */
  listActiveEntries(storyId: string): Promise<LorebookEntry[]>;
}

export function makeLorebookRepo(db: Db): LorebookRepo {
  return {
  async createLorebook(book) {
    LorebookSchema.parse(book);
    await db.run(
      "INSERT INTO lorebooks (id, name, description, created_at, source) VALUES (?, ?, ?, ?, ?)",
      book.id,
      book.name,
      book.description,
      book.createdAt,
      book.source
    );
  },

  async getLorebook(id) {
    const row = await db.get<BookRow>("SELECT * FROM lorebooks WHERE id = ?", id);
    return row ? toBook(row) : undefined;
  },

  async listLorebooks() {
    const rows = await db.all<BookRow>("SELECT * FROM lorebooks ORDER BY created_at DESC");
    return rows.map(toBook);
  },

  async renameLorebook(id, name, description) {
    const info =
      description === undefined
        ? await db.run("UPDATE lorebooks SET name = ? WHERE id = ?", name, id)
        : await db.run(
            "UPDATE lorebooks SET name = ?, description = ? WHERE id = ?",
            name,
            description,
            id
          );
    if (info.changes === 0) throw new Error(`No lorebook with id "${id}" to rename.`);
  },

  async deleteLorebook(id) {
    // Entries + attachments cascade via FK ON DELETE CASCADE.
    await db.run("DELETE FROM lorebooks WHERE id = ?", id);
  },

  async attachmentCount(lorebookId) {
    const row = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM story_lorebooks WHERE lorebook_id = ?",
      lorebookId
    );
    return row?.n ?? 0;
  },

  async insertEntry(entry) {
    LorebookEntrySchema.parse(entry);
    await db.run(
      `INSERT INTO lorebook_entries
         (id, lorebook_id, keys, content, enabled, always_on, priority, insertion_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.lorebookId,
      JSON.stringify(entry.keys),
      entry.content,
      toInt(entry.enabled),
      toInt(entry.alwaysOn),
      entry.priority,
      entry.insertionOrder
    );
  },

  async getEntry(id) {
    const row = await db.get<EntryRow>("SELECT * FROM lorebook_entries WHERE id = ?", id);
    return row ? toEntry(row) : undefined;
  },

  async listEntries(lorebookId) {
    const rows = await db.all<EntryRow>(
      "SELECT * FROM lorebook_entries WHERE lorebook_id = ? ORDER BY priority DESC, insertion_order",
      lorebookId
    );
    return rows.map(toEntry);
  },

  async updateEntry(entry) {
    LorebookEntrySchema.parse(entry);
    const info = await db.run(
      `UPDATE lorebook_entries
         SET keys = ?, content = ?, enabled = ?, always_on = ?, priority = ?, insertion_order = ?
         WHERE id = ?`,
      JSON.stringify(entry.keys),
      entry.content,
      toInt(entry.enabled),
      toInt(entry.alwaysOn),
      entry.priority,
      entry.insertionOrder,
      entry.id
    );
    if (info.changes === 0) throw new Error(`No lorebook entry with id "${entry.id}" to update.`);
  },

  async deleteEntry(id) {
    await db.run("DELETE FROM lorebook_entries WHERE id = ?", id);
  },

  async nextInsertionOrder(lorebookId) {
    const row = await db.get<{ maxOrder: number | null }>(
      "SELECT MAX(insertion_order) AS maxOrder FROM lorebook_entries WHERE lorebook_id = ?",
      lorebookId
    );
    return !row || row.maxOrder === null ? 0 : row.maxOrder + 1;
  },

  async attach(storyId, lorebookId, enabled = true) {
    await db.run(
      `INSERT INTO story_lorebooks (story_id, lorebook_id, enabled) VALUES (?, ?, ?)
         ON CONFLICT(story_id, lorebook_id) DO UPDATE SET enabled = excluded.enabled`,
      storyId,
      lorebookId,
      toInt(enabled)
    );
  },

  async detach(storyId, lorebookId) {
    await db.run(
      "DELETE FROM story_lorebooks WHERE story_id = ? AND lorebook_id = ?",
      storyId,
      lorebookId
    );
  },

  async setAttachedEnabled(storyId, lorebookId, enabled) {
    const info = await db.run(
      "UPDATE story_lorebooks SET enabled = ? WHERE story_id = ? AND lorebook_id = ?",
      toInt(enabled),
      storyId,
      lorebookId
    );
    if (info.changes === 0) {
      throw new Error(`Lorebook "${lorebookId}" is not attached to story "${storyId}".`);
    }
  },

  async listAttached(storyId) {
    const rows = await db.all<AttachRow>(
      `SELECT lb.*, sl.enabled AS link_enabled
         FROM story_lorebooks sl
         JOIN lorebooks lb ON lb.id = sl.lorebook_id
         WHERE sl.story_id = ?
         ORDER BY lb.created_at DESC`,
      storyId
    );
    return rows.map((row) => ({ ...toBook(row), linkEnabled: toBool(row.link_enabled) }));
  },

  async listActiveEntries(storyId) {
    const rows = await db.all<EntryRow>(
      `SELECT e.*
         FROM lorebook_entries e
         JOIN story_lorebooks sl ON sl.lorebook_id = e.lorebook_id
         WHERE sl.story_id = ? AND sl.enabled = 1 AND e.enabled = 1
         ORDER BY e.priority DESC, e.insertion_order`,
      storyId
    );
    return rows.map(toEntry);
  },
  };
}
