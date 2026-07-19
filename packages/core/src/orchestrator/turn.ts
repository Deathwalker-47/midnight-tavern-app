/**
 * Turn orchestrator (low-level-plan §7 — the exact per-turn pipeline).
 *
 * `submitTurn` is the app's heartbeat. It runs the plan's sequence verbatim:
 *   1. persist the player message
 *   2. classify the turn (always)
 *   3. for each intent: ensure the actor has hard state, then resolve → stage a ruling
 *      (NOT committed yet)
 *   4. assemble the narrator context with the rulings inline as authoritative facts
 *   5. stream the narrator prose
 *   6. in ONE transaction: persist the narrator message, then commit every ruling to the
 *      ledger and persist it
 *   7. fire-and-forget: analyzer patch + chapter/arc summarization
 *   8. return { prose, rulings } so the UI can render dice toasts
 *
 * The ordering is load-bearing: rulings are computed before the narrator writes (so prose
 * renders decided truth) but committed after (so a narrator crash never leaves state mutated
 * with no prose). Prose never feeds the ledger.
 */
import { randomUUID } from "../util/uuid.js";
import type { Router } from "../router/index.js";
import type { Store, CharacterRecord } from "../store/index.js";
import { classify } from "../classifier/index.js";
import { resolve, commit } from "../engine/index.js";
import { cryptoRng, type Rng } from "../engine/dice.js";
import { runAnalyzer } from "../memory/index.js";
import { maybeSummarizeChapter, maybeSummarizeArc } from "../summarizer/index.js";
import { instantiateFromTemplate, instantiateGeneric } from "../bootstrap/instantiate.js";
import { assembleContext } from "./context.js";
import type {
  CharacterHardState,
  MechanicalIntent,
  Ruling,
  StorySchema,
  StoryRecord,
} from "../types/index.js";

export interface SubmitTurnOptions {
  /** Injectable RNG for deterministic tests (defaults to crypto-backed). */
  rng?: Rng;
  signal?: AbortSignal;
  /** Streaming sink for narrator deltas (UI live-render); optional. */
  onDelta?: (delta: string) => void;
  /** Player persona + protagonist essentials block (§7.3 item 4). */
  personaBlock?: string;
  /** Called (never throwing) if async post-processing fails; for logging/telemetry. */
  onBackgroundError?: (err: unknown) => void;
}

export interface SubmitTurnResult {
  /** The narrator's prose for this turn. */
  prose: string;
  /** The committed rulings, in resolution order (UI renders dice toasts). */
  rulings: Ruling[];
  /** idx of the persisted narrator message. */
  narratorIdx: number;
  /** Resolves once background post-processing (analyzer + summaries) settles. */
  background: Promise<void>;
}

/** Fetch the story or throw — every turn needs its frozen schema. */
async function requireStory(store: Store, storyId: string): Promise<StoryRecord> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`submitTurn: unknown story ${storyId}`);
  return story;
}

/** True when a hard-state shell actually carries engine state (not an analyzer stub). */
function hasHardState(hard: CharacterHardState): boolean {
  return (
    Object.keys(hard.resources).length > 0 || hard.skills.length > 0 || hard.inventory.length > 0
  );
}

/** Best-matching NPC template by explicit hint or case-insensitive name, else undefined. */
function pickTemplate(schema: StorySchema, hint?: string, name?: string) {
  const needle = (hint ?? name ?? "").trim().toLowerCase();
  if (!needle) return undefined;
  return (
    schema.npcTemplates.find((t) => t.templateId.toLowerCase() === needle) ??
    schema.npcTemplates.find((t) => t.name.toLowerCase() === needle) ??
    schema.npcTemplates.find(
      (t) => t.name.toLowerCase().includes(needle) || needle.includes(t.name.toLowerCase())
    )
  );
}

/**
 * Ensure a character has hard state before the engine rolls for it (§5 step 3). A character
 * already carrying hard state (player, prior combatant, template-instantiated NPC) is
 * returned as-is. A soft-only or unknown id is instantiated from the best-matching template
 * (by `templateHint`/name) or a generic template, and persisted.
 */
export async function ensureHardState(
  store: Store,
  schema: StorySchema,
  storyId: string,
  characterId: string,
  templateHint?: string
): Promise<CharacterHardState> {
  const existing = await store.characters.get(characterId);
  if (existing && (existing.isPlayer || hasHardState(existing.hard))) {
    return existing.hard;
  }

  const template = pickTemplate(schema, templateHint, existing?.name);
  const hard = template
    ? instantiateFromTemplate(schema, characterId, template)
    : instantiateGeneric(schema, characterId);

  if (existing) {
    await store.characters.updateHard(characterId, hard);
  } else {
    const record: CharacterRecord = {
      id: characterId,
      storyId,
      name: templateHint ?? characterId,
      isPlayer: false,
      hard,
    };
    await store.characters.insert(record);
  }
  return hard;
}

/**
 * Run one full turn. See the module header for the sequence; the numbered comments below map
 * to §7 steps exactly.
 */
export async function submitTurn(
  router: Router,
  store: Store,
  storyId: string,
  playerText: string,
  opts: SubmitTurnOptions = {}
): Promise<SubmitTurnResult> {
  const story = await requireStory(store, storyId);
  const schema = story.schema;
  const rng = opts.rng ?? cryptoRng;

  // 1. Persist the player message at idx = n.
  const playerIdx = await store.messages.nextIdx(storyId);
  await store.messages.insert({
    id: randomUUID(),
    storyId,
    idx: playerIdx,
    role: "player",
    content: playerText,
    createdAt: Date.now(),
  });

  // Present roster: everyone with a row for this story (players + observed NPCs).
  const roster = await store.characters.listByStory(storyId);
  const presentCharacters = roster.map((c) => ({ id: c.id, name: c.name, isPlayer: c.isPlayer }));

  // 2. Classify (always). Recent narrator lines give the classifier scene context.
  const recentMsgs = await store.messages.recent(storyId, 6);
  const recentNarration = recentMsgs.filter((m) => m.role === "narrator").map((m) => m.content);
  const classified = await classify(
    router,
    schema,
    { playerMessage: playerText, presentCharacters, recentNarration },
    { signal: opts.signal }
  );

  // 3. Resolve every intent into a staged ruling. Nothing is committed yet; we collect the
  //    ledger mutations alongside so step 6 can commit atomically.
  const rulings: Ruling[] = [];
  const staged: { ruling: Ruling; mutations: ReturnType<typeof resolve>["mutations"] }[] = [];
  const intents: MechanicalIntent[] = [...classified.playerIntents, ...classified.npcIntents];

  // Template hint for a to-be-instantiated NPC is its roster display name (§5 step 3); the
  // classifier constrains actor/target ids to present characters, so the name is on hand.
  const nameById = new Map(roster.map((c) => [c.id, c.name]));

  for (const intent of intents) {
    const actorHard = await ensureHardState(
      store,
      schema,
      storyId,
      intent.actorId,
      nameById.get(intent.actorId)
    );
    const targetHard = intent.targetId
      ? await ensureHardState(store, schema, storyId, intent.targetId, nameById.get(intent.targetId))
      : undefined;
    const result = resolve(schema, actorHard, targetHard, intent, rng);
    rulings.push(result.ruling);
    staged.push({ ruling: result.ruling, mutations: result.mutations });
  }

  // 4. Assemble the narrator context with the rulings inline as authoritative facts (§7.3).
  const presentIds = presentCharacters.map((c) => c.id);
  const context = await assembleContext(store, {
    storyId,
    schema,
    rulings,
    presentIds,
    playerText,
    ...(opts.personaBlock ? { personaBlock: opts.personaBlock } : {}),
  });

  // 5. Stream the narrator prose. `stream` aggregates and returns the full text.
  const response = await router.stream(
    "narrator",
    { system: context.system, user: context.user },
    opts.onDelta ?? (() => {}),
    { ...(opts.signal ? { signal: opts.signal } : {}) }
  );
  const prose = response.content;

  // 6. Persist prose and commit rulings in ONE transaction (all-or-nothing).
  const narratorIdx = playerIdx + 1;
  const narratorMsgId = randomUUID();
  await store.transaction(async () => {
    await store.messages.insert({
      id: narratorMsgId,
      storyId,
      idx: narratorIdx,
      role: "narrator",
      content: prose,
      createdAt: Date.now(),
    });

    if (staged.length > 0) {
      // Commit mutates hard state in a map; write each touched character back.
      const charsById = new Map<string, CharacterHardState>();
      for (const s of staged) {
        for (const id of [s.ruling.actorId, s.ruling.targetId].filter(Boolean) as string[]) {
          if (!charsById.has(id)) {
            const hard = (await store.characters.get(id))?.hard;
            if (hard) charsById.set(id, structuredClone(hard));
          }
        }
      }
      for (const s of staged) {
        commit(schema, s.mutations, charsById);
        await store.rulings.insert({
          id: randomUUID(),
          storyId,
          messageId: narratorMsgId,
          ruling: s.ruling,
        });
      }
      for (const [id, hard] of charsById) await store.characters.updateHard(id, hard);
    }
  });

  // 7. Fire-and-forget: analyzer patch, then chapter/arc summaries. Never blocks the return
  //    and never throws into the caller.
  const background = runBackground(router, store, {
    storyId,
    turnIdx: narratorIdx,
    playerText,
    narratorText: prose,
    ...(opts.onBackgroundError ? { onError: opts.onBackgroundError } : {}),
  });

  // 8. Hand prose + rulings back for rendering (dice toasts).
  return { prose, rulings, narratorIdx, background };
}

interface BackgroundArgs {
  storyId: string;
  turnIdx: number;
  playerText: string;
  narratorText: string;
  onError?: (err: unknown) => void;
}

/**
 * Post-turn async work (§7 step 7). Runs the analyzer over the latest exchange (it applies
 * its own soft-state patch), then advances chapter/arc summaries if their thresholds are met.
 * Isolated so a failure here never corrupts the committed turn — each stage swallows its own
 * error via `onError`.
 */
async function runBackground(router: Router, store: Store, args: BackgroundArgs): Promise<void> {
  const { storyId, onError } = args;

  try {
    // Fetch the roster once and derive both the soft-state slice and a synchronous name lookup
    // from it — `nameFor` is consumed inside the analyzer's sync patch path, so it can't await.
    const roster = await store.characters.listByStory(storyId);
    const nameById = new Map(roster.map((c) => [c.id, c.name]));
    const nameFor = (id: string) => nameById.get(id);
    const presentSoft = roster
      .map((c) => c.soft)
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    await runAnalyzer(router, store, {
      storyId,
      turnIdx: args.turnIdx,
      playerText: args.playerText,
      narratorText: args.narratorText,
      presentSoft,
      nameFor,
      ...(onError ? { onError } : {}),
    });
  } catch (err) {
    onError?.(err);
  }

  // Summaries are independent; each swallows its own errors, but guard anyway.
  try {
    await maybeSummarizeChapter(router, store, storyId, onError ? { onError } : {});
    await maybeSummarizeArc(router, store, storyId, onError ? { onError } : {});
  } catch (err) {
    onError?.(err);
  }
}
