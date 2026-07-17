-- Migration 001 — initial schema (low-level-plan §3).
--
-- One DB file per install; stories are rows, not files. Every *_json / *_TEXT column
-- that carries structured data holds a Zod-validated payload (validation lives in the
-- repositories, never here). Column shapes match §3 verbatim; NOT NULL / FK / index
-- constraints are added here as the concrete realization of that schema.

CREATE TABLE stories (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,     -- epoch ms
  schema_json TEXT NOT NULL,        -- StorySchema (frozen)
  locked      INTEGER NOT NULL      -- 0/1, mirrors schema.locked for cheap querying
);

CREATE TABLE characters (
  id         TEXT PRIMARY KEY,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_player  INTEGER NOT NULL,      -- 0/1
  hard_json  TEXT NOT NULL,         -- CharacterHardState (sole writer: engine)
  soft_json  TEXT,                  -- CharacterSoftState (sole writer: analyzer); NULL until analyzed
  soft_tier  TEXT                   -- 'primary' | 'secondary'
);
CREATE INDEX idx_characters_story ON characters(story_id);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,      -- per-story monotonic turn index
  role       TEXT NOT NULL,         -- 'player' | 'narrator' | 'system'
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- epoch ms
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_messages_story ON messages(story_id, idx);

CREATE TABLE rulings (
  id          TEXT PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  ruling_json TEXT NOT NULL         -- Ruling (engine output)
);
CREATE INDEX idx_rulings_story ON rulings(story_id);
CREATE INDEX idx_rulings_message ON rulings(message_id);

CREATE TABLE chapters (
  id       TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx      INTEGER NOT NULL,        -- per-story monotonic chapter index
  msg_from INTEGER NOT NULL,        -- inclusive message idx range
  msg_to   INTEGER NOT NULL,
  title    TEXT NOT NULL,
  summary  TEXT NOT NULL,
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_chapters_story ON chapters(story_id, idx);

CREATE TABLE arcs (
  id           TEXT PRIMARY KEY,
  story_id     TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,    -- per-story monotonic arc index
  chapter_from INTEGER NOT NULL,    -- inclusive chapter idx range
  chapter_to   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  doc_json     TEXT NOT NULL,       -- ArcDoc (structured arc extraction)
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_arcs_story ON arcs(story_id, idx);

CREATE TABLE world_soft (
  story_id  TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  soft_json TEXT NOT NULL           -- WorldSoftState
);

CREATE TABLE lorebook (
  id       TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  keys     TEXT NOT NULL,           -- JSON string[] of trigger phrases
  content  TEXT NOT NULL,
  enabled  INTEGER NOT NULL         -- 0/1
);
CREATE INDEX idx_lorebook_story ON lorebook(story_id);

CREATE TABLE personas (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  is_default  INTEGER NOT NULL      -- 0/1
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL               -- providers, role→model map, budgets, license
);
