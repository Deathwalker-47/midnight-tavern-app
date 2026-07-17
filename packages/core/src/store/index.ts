/**
 * Store barrel (low-level-plan §3, M1).
 *
 * `openStore` opens the (migrated) database and constructs every repository over it,
 * returning a single `Store` handle. `store.transaction(fn)` runs work across multiple
 * repositories atomically — the mechanism behind the per-turn "ruling + ledger + message
 * commit together or not at all" policy (§6).
 *
 * This barrel and the repositories are the only code that touches SQL; everything above
 * the store speaks in typed records.
 */
import { openDb, type Db } from "./db.js";
import { makeStoryRepo, type StoryRepo } from "./repositories/stories.js";
import { makeCharacterRepo, type CharacterRepo } from "./repositories/characters.js";
import { makeMessageRepo, type MessageRepo } from "./repositories/messages.js";
import { makeRulingRepo, type RulingRepo } from "./repositories/rulings.js";
import { makeChapterRepo, type ChapterRepo } from "./repositories/chapters.js";
import { makeArcRepo, type ArcRepo } from "./repositories/arcs.js";
import { makeWorldSoftRepo, type WorldSoftRepo } from "./repositories/worldSoft.js";
import { makeLorebookRepo, type LorebookRepo } from "./repositories/lorebook.js";
import { makePersonaRepo, type PersonaRepo } from "./repositories/personas.js";
import { makeSettingsRepo, type SettingsRepo } from "./repositories/settings.js";

export { openDb, type Db, type Sqlite } from "./db.js";
export type { StoryRepo } from "./repositories/stories.js";
export type { CharacterRepo, CharacterRecord } from "./repositories/characters.js";
export type { MessageRepo } from "./repositories/messages.js";
export type { RulingRepo, RulingRecord } from "./repositories/rulings.js";
export type { ChapterRepo } from "./repositories/chapters.js";
export type { ArcRepo } from "./repositories/arcs.js";
export type { WorldSoftRepo } from "./repositories/worldSoft.js";
export type { LorebookRepo } from "./repositories/lorebook.js";
export type { PersonaRepo } from "./repositories/personas.js";
export type { SettingsRepo } from "./repositories/settings.js";

/** The full persistence surface: one migrated DB plus a typed repository per table. */
export interface Store {
  readonly db: Db;
  readonly stories: StoryRepo;
  readonly characters: CharacterRepo;
  readonly messages: MessageRepo;
  readonly rulings: RulingRepo;
  readonly chapters: ChapterRepo;
  readonly arcs: ArcRepo;
  readonly worldSoft: WorldSoftRepo;
  readonly lorebook: LorebookRepo;
  readonly personas: PersonaRepo;
  readonly settings: SettingsRepo;
  /** Run `fn` across repositories atomically (commit on return, roll back on throw). */
  transaction<T>(fn: () => T): T;
  close(): void;
}

/**
 * Open the store at `path` (`:memory:` for tests). The database is fully migrated before
 * this returns.
 */
export function openStore(path: string): Store {
  const db = openDb(path);
  return {
    db,
    stories: makeStoryRepo(db),
    characters: makeCharacterRepo(db),
    messages: makeMessageRepo(db),
    rulings: makeRulingRepo(db),
    chapters: makeChapterRepo(db),
    arcs: makeArcRepo(db),
    worldSoft: makeWorldSoftRepo(db),
    lorebook: makeLorebookRepo(db),
    personas: makePersonaRepo(db),
    settings: makeSettingsRepo(db),
    transaction: db.transaction,
    close: db.close,
  };
}
