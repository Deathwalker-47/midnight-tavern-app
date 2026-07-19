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
import { openDb, openDbWith, type Db, type SqlDriver } from "./db.js";
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

export { openDb, openDbWith, type Db, type SqlDriver, type SqlParam, type RunResult } from "./db.js";
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
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Assemble a {@link Store} over a migrated {@link Db} handle. */
function makeStore(db: Db): Store {
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
    transaction: (fn) => db.transaction(fn),
    close: () => db.close(),
  };
}

/**
 * Open the store at `path` (`:memory:` for tests) over the better-sqlite3 driver. The database is
 * fully migrated before this resolves. Node + tests only — the packaged app uses {@link openStoreWith}.
 */
export async function openStore(path: string): Promise<Store> {
  return makeStore(await openDb(path));
}

/**
 * Open the store over an already-constructed driver (the seam the UI façade uses to inject the
 * Tauri command driver). The database is fully migrated before this resolves.
 */
export async function openStoreWith(driver: SqlDriver): Promise<Store> {
  return makeStore(await openDbWith(driver));
}
