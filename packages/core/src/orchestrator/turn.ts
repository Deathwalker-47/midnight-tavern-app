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
import type {
  Store,
  CharacterRecord,
  TurnOperation,
  TurnOperationState,
} from "../store/index.js";
import {
  classify,
  classifyWithRecovery,
  type ClassifierRecoveryMetadata,
} from "../classifier/index.js";
import { resolve, commit, enforceActionBudget } from "../engine/index.js";
import { cryptoRng, type Rng } from "../engine/dice.js";
import { runAnalyzer } from "../memory/index.js";
import { maybeSummarizeChapter, maybeSummarizeArc } from "../summarizer/index.js";
import { instantiateFromTemplate, instantiateGeneric } from "../bootstrap/instantiate.js";
import { blueprintToStyleInputs, STANDARD_DIFFICULTY } from "../types/index.js";
import { assembleContext } from "./context.js";
import { capture } from "./checkpoint.js";
import { generateGuardedNarration } from "./authorityGuard.js";
import { planNpcReactions } from "./npcAgency.js";
import { discoverNarratedSceneEntities } from "./sceneEntityPromotion.js";
import { determineLootAwards, type PendingLootAward } from "./loot.js";
import {
  determineAttributeAdvancements,
  recordAttributeAdvancementDecision,
} from "./attributeAdvancement.js";
import type {
  AttributeAdvancementDecision,
  ClassifiedTurn,
  CharacterHardState,
  MechanicalIntent,
  MessageRecord,
  Ruling,
  StorySchema,
  StoryRecord,
  DifficultyConfig,
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
  /** Observable, persisted turn phase for the play-screen operation indicator. */
  onPhase?: (phase: TurnOperationState) => void;
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
  /** True when malformed/empty classifier output was safely demoted to narration-only. */
  classifierRecovered: boolean;
  /** Structured recovery details for UI error/recovery states. */
  classifierRecovery?: ClassifierRecoveryMetadata;
  /** Number of player actions visibly refused because they exceeded this story's turn budget. */
  refusedActionCount: number;
  /** Whether narrator generation used the deterministic ruling-summary fallback. */
  usedNarratorFallback: boolean;
  /** Deterministic app verdicts for any DM-proposed attribute changes this turn. */
  attributeAdvancements: AttributeAdvancementDecision[];
}

/** Fetch the story or throw — every turn needs its frozen schema. Shared with history ops (§6). */
export async function requireStory(store: Store, storyId: string): Promise<StoryRecord> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`requireStory: unknown story ${storyId}`);
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
      present: true,
      hard,
    };
    await store.characters.insert(record);
  }
  return hard;
}

function operationErrorState(error: unknown, signal?: AbortSignal): TurnOperationState {
  if (signal?.aborted) return "cancelled";
  if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
    return "timed_out";
  }
  return "error";
}

function operationErrorKind(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : "UnknownError";
}

function budgetRefusalRuling(
  schema: StorySchema,
  intent: MechanicalIntent,
  reason: string,
  difficulty: DifficultyConfig
): Ruling {
  const action = schema.actions.find((candidate) => candidate.id === intent.actionId);
  return {
    turnId: `${intent.actorId}:${intent.actionId}:budget`,
    actorId: intent.actorId,
    actionId: intent.actionId,
    ...(action ? { actionLabel: action.label } : {}),
    ...(intent.targetId ? { targetId: intent.targetId } : {}),
    gate: { allowed: false, reason },
    effectsApplied: null,
    difficulty,
  };
}

async function recordRulingEvents(
  store: Store,
  story: StoryRecord,
  messageId: string,
  turnIndex: number,
  ruling: Ruling,
  playerText: string
): Promise<void> {
  const common = {
    storyId: story.id,
    messageId,
    turnIndex,
    actorId: ruling.actorId,
    rulebookVersion: story.rulebookVersion ?? 1,
    createdAt: Date.now(),
  };
  await store.events.insert({
    ...common,
    id: randomUUID(),
    kind: ruling.turnId.endsWith(":budget")
      ? "action_budget_exceeded"
      : ruling.roll
        ? "roll"
        : ruling.gate.allowed
          ? "automatic"
          : "denied",
    // Keep the originating player action beside the ruling so multi-turn
    // training/transformation evidence can be reconstructed deterministically.
    payload: { ruling, playerText },
  });
  if (ruling.xpAward) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "xp",
      payload: { award: ruling.xpAward },
    });
    if (ruling.xpAward.rankAfter !== ruling.xpAward.rankBefore) {
      await store.events.insert({
        ...common,
        id: randomUUID(),
        kind: "rank_up",
        payload: { award: ruling.xpAward },
      });
    }
  }
  if (ruling.masteryAdvance && ruling.masteryAdvance.fromRank === "untrained") {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "skill_unlocked",
      payload: { advance: ruling.masteryAdvance },
    });
  }
  for (const [attributeId, delta] of Object.entries(
    ruling.effectsApplied?.attributeDeltaSelf ?? {}
  )) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "attribute_changed",
      payload: { characterId: ruling.actorId, attributeId, delta },
    });
  }
  for (const [attributeId, delta] of Object.entries(
    ruling.effectsApplied?.attributeDeltaTarget ?? {}
  )) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "attribute_changed",
      payload: { characterId: ruling.targetId, attributeId, delta },
    });
  }
  if (ruling.effectsApplied?.grantItem) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "item_gained",
      payload: {
        characterId: ruling.actorId,
        itemId: ruling.effectsApplied.grantItem.itemId,
        quantity: ruling.effectsApplied.grantItem.qty,
      },
    });
  }
  for (const item of ruling.costsPaid?.items ?? []) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "item_lost",
      payload: { characterId: ruling.actorId, itemId: item.itemId, quantity: item.qty },
    });
  }
  for (const characterId of ruling.causedDeathOf ?? []) {
    await store.events.insert({
      ...common,
      id: randomUUID(),
      kind: "death",
      actorId: characterId,
      payload: { characterId, causeTurnId: ruling.turnId },
    });
  }
}

/**
 * Run one full turn. See the module header for the sequence; the numbered comments below map
 * to §7 steps exactly.
 */
async function submitTurnLegacy(
  router: Router,
  store: Store,
  storyId: string,
  playerText: string,
  opts: SubmitTurnOptions = {}
) {
  const story = await requireStory(store, storyId);
  const schema = story.schema;
  if (schema.migrationPending) {
    throw new Error("This legacy Light Rules story needs a one-time stat-system choice before play can continue.");
  }
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

  const roster = await store.characters.listByStory(storyId);
  const presentRoster = await store.characters.listPresentByStory(storyId);
  const presentCharacters = presentRoster.map((c) => ({
    id: c.id,
    name: c.name,
    isPlayer: c.isPlayer,
  }));

  const rulings: Ruling[] = [];
  const staged: { ruling: Ruling; mutations: ReturnType<typeof resolve>["mutations"] }[] = [];
  if (schema.statMode === "full") {

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
  }

  // 4. Assemble the narrator context with the rulings inline as authoritative facts (§7.3).
  //    Blueprint style inputs (§3) are composed into the system frame ABOVE the authority clause;
  //    they are style-only and can never displace it.
  const presentIds = presentCharacters.map((c) => c.id);
  const styleInputs = blueprintToStyleInputs(story.blueprint);
  const context = await assembleContext(store, {
    storyId,
    schema,
    rulings,
    presentIds,
    playerText,
    styleInputs,
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
    // Snapshot the pre-turn state BEFORE any hard-state write, so swipe/delete/rewind can roll
    // back to exactly what existed before this turn (low-level-plan-v2 §6). Bound to this turn's
    // narrator message.
    const checkpoint = await capture(store, storyId, narratorMsgId, narratorIdx);

    await store.messages.insert({
      id: narratorMsgId,
      storyId,
      idx: narratorIdx,
      role: "narrator",
      content: prose,
      createdAt: Date.now(),
      variants: [prose],
      activeVariant: 0,
    });
    await store.checkpoints.insert(checkpoint);

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
        const died = commit(schema, s.mutations, charsById);
        s.ruling.messageId = narratorMsgId;
        if (died.length) s.ruling.causedDeathOf = died;
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
  const background = schema.statMode === "full"
    ? runBackground(router, store, {
        storyId,
        turnIdx: narratorIdx,
        playerText,
        narratorText: prose,
        ...(opts.onBackgroundError ? { onError: opts.onBackgroundError } : {}),
      })
    : Promise.resolve();

  // 8. Hand prose + rulings back for rendering (dice toasts).
  return { prose, rulings, narratorIdx, background };
}

/**
 * V7 turn pipeline. Unlike the legacy implementation above, this persists an explicit operation
 * state machine, recovers empty classifier output, enforces the sealed player-action budget,
 * resolves ordered actions against one in-memory ledger, and authority-checks narrator prose.
 */
interface ExistingTurnOperation {
  playerMessage: MessageRecord;
  operation: TurnOperation;
}

async function runTurnOperation(
  router: Router,
  store: Store,
  storyId: string,
  playerText: string,
  opts: SubmitTurnOptions,
  existing?: ExistingTurnOperation
): Promise<SubmitTurnResult> {
  const story = await requireStory(store, storyId);
  const schema = story.schema;
  if (schema.migrationPending) {
    throw new Error(
      "This legacy Light Rules story needs a one-time stat-system choice before play can continue."
    );
  }
  const rng = opts.rng ?? cryptoRng;
  const playerIdx = existing?.playerMessage.idx ?? (await store.messages.nextIdx(storyId));
  const playerMessageId = existing?.playerMessage.id ?? randomUUID();
  if (!existing) {
    await store.messages.insert({
      id: playerMessageId,
      storyId,
      idx: playerIdx,
      role: "player",
      content: playerText,
      createdAt: Date.now(),
    });
  }

  let operation: TurnOperation = existing
    ? {
        id: existing.operation.id,
        storyId,
        playerMessageId,
        state: "classifying",
        createdAt: existing.operation.createdAt,
        updatedAt: existing.operation.updatedAt,
      }
    : {
        id: randomUUID(),
        storyId,
        playerMessageId,
        state: "classifying",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
  const setPhase = async (
    state: TurnOperationState,
    patch: Partial<TurnOperation> = {}
  ): Promise<void> => {
    operation = { ...operation, ...patch, state, updatedAt: Date.now() };
    await store.turnOperations.upsert(operation);
    opts.onPhase?.(state);
  };
  await setPhase("classifying");

  try {
    let roster = await store.characters.listByStory(storyId);
    let presentRoster = await store.characters.listPresentByStory(storyId);
    let presentCharacters = presentRoster.map((character) => ({
      id: character.id,
      name: character.name,
      isPlayer: character.isPlayer,
    }));
    const rulings: Ruling[] = [];
    const staged: { ruling: Ruling; mutations: ReturnType<typeof resolve>["mutations"] }[] = [];
    const workingById = new Map<string, CharacterHardState>();
    const equipmentDefinitions = await store.runtimeItems.listDefinitions(storyId);
    const equipmentInstances: Awaited<
      ReturnType<typeof store.runtimeItems.listInventory>
    > = [];
    const priorRulings = await store.rulings.listByStory(storyId);
    let classified: ClassifiedTurn = { playerIntents: [], npcIntents: [], freeText: "" };
    let classifierRecovered = false;
    let classifierRecovery: ClassifierRecoveryMetadata | undefined;
    let refusedActionCount = 0;
    let lootAwards: PendingLootAward[] = [];
    let attributeAdvancements: AttributeAdvancementDecision[] = [];

    if (schema.statMode === "full") {
      const recentMessages = await store.messages.recent(storyId, 6);
      const recentNarration = recentMessages
        .filter((message) => message.role === "narrator")
        .map((message) => message.content);
      const sceneEntities = discoverNarratedSceneEntities({
        storyId,
        schema,
        recentNarration,
        roster,
      });
      for (const entity of sceneEntities) {
        await ensureHardState(store, schema, storyId, entity.id, entity.name);
      }
      if (sceneEntities.length > 0) {
        roster = await store.characters.listByStory(storyId);
        presentRoster = await store.characters.listPresentByStory(storyId);
        presentCharacters = presentRoster.map((character) => ({
          id: character.id,
          name: character.name,
          isPlayer: character.isPlayer,
        }));
      }
      const classifier = await classifyWithRecovery(
        router,
        schema,
        { playerMessage: playerText, presentCharacters, recentNarration },
        { signal: opts.signal }
      );
      classified = classifier.turn;
      classifierRecovered = classifier.recovered;
      classifierRecovery = classifier.recovery;

      if (classifierRecovered) {
        await setPhase("classifier_error", {
          classified,
          ...(classifierRecovery ? { classifierRecovery } : {}),
          ...(classifier.errorKind ? { errorKind: classifier.errorKind } : {}),
        });
        await store.events.insert({
          id: randomUUID(),
          storyId,
          messageId: playerMessageId,
          turnIndex: playerIdx,
          kind: "classifier_recovery",
          payload: {
            errorKind: classifier.errorKind ?? "ClassifierError",
            ...(classifierRecovery ? { recovery: classifierRecovery } : {}),
            policy: classifierRecovery?.policy ?? "narration_only",
          },
          rulebookVersion: story.rulebookVersion ?? 1,
          createdAt: Date.now(),
        });
      }

      await setPhase("ruling", { classified });
      const budget = enforceActionBudget(classified.playerIntents, story.actionBudget ?? 2);
      refusedActionCount = budget.refused.length;
      const nameById = new Map(roster.map((character) => [character.id, character.name]));

      const workingState = async (characterId: string): Promise<CharacterHardState> => {
        const cached = workingById.get(characterId);
        if (cached) return cached;
        const hard = await ensureHardState(
          store,
          schema,
          storyId,
          characterId,
          nameById.get(characterId)
        );
        const copy = structuredClone(hard);
        const [ownedInstances, assignments] = await Promise.all([
          store.runtimeItems.listInventory(characterId),
          store.runtimeItems.listLoadout(characterId),
        ]);
        equipmentInstances.push(...ownedInstances);
        copy.equipment = assignments;
        workingById.set(characterId, copy);
        return copy;
      };

      const intents: MechanicalIntent[] = [...budget.accepted, ...classified.npcIntents];
      for (const intent of intents) {
        const actorHard = await workingState(intent.actorId);
        const targetHard = intent.targetId ? await workingState(intent.targetId) : undefined;
        const recentSimilarUses = priorRulings
          .slice(-5)
          .filter(
            (record) =>
              record.ruling.actorId === intent.actorId &&
              record.ruling.actionId === intent.actionId &&
              record.ruling.targetId === intent.targetId
          ).length;
        const result = resolve(
          schema,
          actorHard,
          targetHard,
          intent,
          rng,
          {
            ...(story.difficulty ? { difficulty: story.difficulty } : {}),
            ...(equipmentDefinitions.length > 0
              ? {
                  equipment: {
                    definitions: equipmentDefinitions,
                    instances: equipmentInstances,
                  },
                }
              : {}),
            recentSimilarUses,
          }
        );
        const died = commit(schema, result.mutations, workingById);
        if (died.length) result.ruling.causedDeathOf = died;
        rulings.push(result.ruling);
        staged.push(result);
      }

      for (let index = 0; index < budget.refused.length; index++) {
        const refusal = budget.refused[index]!;
        const intent = classified.playerIntents[budget.accepted.length + index]!;
        const ruling = budgetRefusalRuling(
          schema,
          intent,
          refusal.reason,
          story.difficulty ?? STANDARD_DIFFICULTY
        );
        rulings.push(ruling);
        staged.push({ ruling, mutations: [] });
      }

      // Everything staged so far is the player's this turn. Loot and attribute advancement
      // are player-earned, so they read only this prefix; NPC reactions appended below feed
      // only the narrative contract, never the player's rewards.
      const playerRulingCount = rulings.length;

      // NPC same-turn agency (§7.5–6): a present, living NPC struck this turn answers with
      // its own engine ruling BEFORE narration. Deterministic reactions are planned once
      // over the player's rulings, then resolved with the same gate/dice authority against
      // the same working ledger. Their own encounter budget never touches the player's.
      const npcReactionIntents = planNpcReactions({
        schema,
        priorRulings: rulings.slice(0, playerRulingCount),
        workingById,
        present: new Map(presentRoster.map((character) => [character.id, character.isPlayer])),
      });
      for (const intent of npcReactionIntents) {
        const actorHard = await workingState(intent.actorId);
        const targetHard = intent.targetId ? await workingState(intent.targetId) : undefined;
        const result = resolve(schema, actorHard, targetHard, intent, rng, {
          ...(story.difficulty ? { difficulty: story.difficulty } : {}),
          ...(equipmentDefinitions.length > 0
            ? {
                equipment: {
                  definitions: equipmentDefinitions,
                  instances: equipmentInstances,
                },
              }
            : {}),
        });
        const died = commit(schema, result.mutations, workingById);
        if (died.length) result.ruling.causedDeathOf = died;
        rulings.push(result.ruling);
        staged.push(result);
      }

      await setPhase("generating_loot", { rulings, staged });
      const playerRulings = rulings.slice(0, playerRulingCount);
      lootAwards = await determineLootAwards(
        router,
        store,
        story,
        playerText,
        playerRulings,
        opts.signal
      );
      for (const award of lootAwards) {
        const ruling = rulings[award.rulingIndex];
        if (!ruling) continue;
        ruling.loot = [
          ...(ruling.loot ?? []),
          {
            itemInstanceId: award.instance.id,
            itemDefinitionId: award.definition.id,
            ownerCharacterId: award.instance.ownerCharacterId,
            name: award.definition.name,
            tier: award.definition.tier,
            quantity: award.instance.quantity,
            provenanceSummary: award.instance.provenance.eligibilityReasons.join("; "),
            description: award.definition.description,
            effects: award.definition.effects,
            eligibleSlots: award.definition.slotCompatibility,
            ...(award.definition.requiresSkill
              ? { requirement: `Requires ${award.definition.requiresSkill}` }
              : {}),
          },
        ];
      }

      const advancement = await determineAttributeAdvancements(router, store, {
        story,
        playerText,
        rulings: playerRulings,
        turnIndex: playerIdx + 1,
        hardStates: workingById,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      attributeAdvancements = advancement.decisions;
      for (const [characterId, hard] of advancement.hardStates) {
        workingById.set(characterId, hard);
      }
    }

    const presentIds = presentCharacters.map((character) => character.id);
    const styleInputs = blueprintToStyleInputs(story.blueprint);
    const context = await assembleContext(store, {
      storyId,
      schema,
      rulings,
      presentIds,
      playerText: classifierRecovered ? `${playerText}\n\n${classified.freeText}` : playerText,
      styleInputs,
      attributeAdvancements,
      ...(opts.personaBlock ? { personaBlock: opts.personaBlock } : {}),
    });

    await setPhase("thinking", { classified, rulings, staged });
    await setPhase("streaming");
    const narration = await generateGuardedNarration(
      router,
      { system: context.system, user: context.user },
      rulings,
      {
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.onDelta ? { onDelta: opts.onDelta } : {}),
        auditWithoutRulings: classifierRecovered,
      }
    );
    const prose = narration.prose;
    const narratorIdx = playerIdx + 1;
    const narratorMessageId = randomUUID();
    const introducedSceneEntities = discoverNarratedSceneEntities({
      storyId,
      schema,
      recentNarration: [prose],
      roster,
    });

    await setPhase("saving", { prose, narratorMessageId });
    await store.transaction(async () => {
      for (const entity of introducedSceneEntities) {
        await ensureHardState(store, schema, storyId, entity.id, entity.name);
      }
      const checkpoint = await capture(store, storyId, narratorMessageId, narratorIdx);
      await store.messages.insert({
        id: narratorMessageId,
        storyId,
        idx: narratorIdx,
        role: "narrator",
        content: prose,
        createdAt: Date.now(),
        variants: [prose],
        activeVariant: 0,
      });
      await store.checkpoints.insert(checkpoint);

      for (const stagedRuling of staged) {
        stagedRuling.ruling.messageId = narratorMessageId;
        await store.rulings.insert({
          id: randomUUID(),
          storyId,
          messageId: narratorMessageId,
          ruling: stagedRuling.ruling,
        });
        await recordRulingEvents(
          store,
          story,
          narratorMessageId,
          narratorIdx,
          stagedRuling.ruling,
          playerText
        );
      }
      for (const decision of attributeAdvancements) {
        await recordAttributeAdvancementDecision(
          store,
          story,
          narratorMessageId,
          narratorIdx,
          decision
        );
      }
      let milestoneLogged = false;
      for (const award of lootAwards) {
        await store.runtimeItems.insertDefinition(award.definition);
        await store.runtimeItems.insertInstance(award.instance);
        const eventCommon = {
          storyId,
          messageId: narratorMessageId,
          turnIndex: narratorIdx,
          actorId: award.instance.ownerCharacterId,
          rulebookVersion: story.rulebookVersion ?? 1,
          createdAt: Date.now(),
        };
        await store.events.insert({
          ...eventCommon,
          id: randomUUID(),
          kind: "item_created",
          payload: { definition: award.definition },
        });
        await store.events.insert({
          ...eventCommon,
          id: randomUUID(),
          kind: "item_gained",
          payload: { instance: award.instance },
        });
        if (
          !milestoneLogged &&
          (award.instance.provenance.sourceType === "milestone" ||
            award.instance.provenance.sourceType === "quest")
        ) {
          milestoneLogged = true;
          await store.events.insert({
            ...eventCommon,
            id: randomUUID(),
            kind: "milestone",
            payload: {
              sourceType: award.instance.provenance.sourceType,
              sourceLabel: award.instance.provenance.sourceLabel,
            },
          });
        }
      }
      for (const [characterId, hard] of workingById) {
        await store.characters.updateHard(characterId, hard);
      }
    });
    await setPhase("idle", {
      prose,
      narratorMessageId,
      rulings,
      staged: undefined,
      errorKind: undefined,
    });

    const background =
      schema.statMode === "full"
        ? runBackground(router, store, {
            storyId,
            turnIdx: narratorIdx,
            playerText,
            narratorText: prose,
            ...(opts.onBackgroundError ? { onError: opts.onBackgroundError } : {}),
          })
        : Promise.resolve();

    return {
      prose,
      rulings,
      narratorIdx,
      background,
      classifierRecovered,
      ...(classifierRecovery ? { classifierRecovery } : {}),
      refusedActionCount,
      usedNarratorFallback: narration.usedSafeFallback,
      attributeAdvancements,
    };
  } catch (error) {
    const state = operationErrorState(error, opts.signal);
    await setPhase(state, { errorKind: operationErrorKind(error) }).catch(() => {});
    throw error;
  }
}

/** Start a new turn by persisting exactly one player message and one operation record. */
export async function submitTurn(
  router: Router,
  store: Store,
  storyId: string,
  playerText: string,
  opts: SubmitTurnOptions = {}
): Promise<SubmitTurnResult> {
  return runTurnOperation(router, store, storyId, playerText, opts);
}

export const DEFAULT_TURN_OPERATION_STALE_MS = 120_000;

export type TurnOperationRecoveryReason =
  | "missing_player_message"
  | "player_message_mismatch"
  | "narrator_already_persisted"
  | "transcript_advanced"
  | "operation_active"
  | "retry_claim_lost";

export interface TurnOperationRecoveryInspection {
  operation: TurnOperation;
  /** Original text is returned so recovery UI never has to reconstruct or reinsert it. */
  playerText?: string;
  playerMessageIdx?: number;
  stale: boolean;
  recoverable: boolean;
  reason?: TurnOperationRecoveryReason;
}

export interface InspectTurnOperationOptions {
  staleAfterMs?: number;
  /** Injectable clock for deterministic consumers/tests. */
  now?: number;
}

export interface RetryTurnOperationOptions
  extends SubmitTurnOptions,
    InspectTurnOperationOptions {}

export class TurnOperationRecoveryError extends Error {
  constructor(readonly reason: TurnOperationRecoveryReason | "operation_not_found") {
    super(`Turn operation cannot be recovered: ${reason}.`);
    this.name = "TurnOperationRecoveryError";
  }
}

interface InspectedOperation {
  inspection: TurnOperationRecoveryInspection;
  playerMessage?: MessageRecord;
}

const IMMEDIATELY_RETRYABLE_STATES = new Set<TurnOperationState>([
  "error",
  "cancelled",
  "timed_out",
]);

async function inspectStoredOperation(
  store: Store,
  operation: TurnOperation,
  opts: InspectTurnOperationOptions
): Promise<InspectedOperation> {
  const now = opts.now ?? Date.now();
  const staleAfterMs = Math.max(0, opts.staleAfterMs ?? DEFAULT_TURN_OPERATION_STALE_MS);
  const stale = now - operation.updatedAt >= staleAfterMs;
  const playerMessage = await store.messages.get(operation.playerMessageId);
  const base = { operation, stale };

  if (!playerMessage) {
    return {
      inspection: {
        ...base,
        recoverable: false,
        reason: "missing_player_message",
      },
    };
  }
  if (playerMessage.storyId !== operation.storyId || playerMessage.role !== "player") {
    return {
      inspection: {
        ...base,
        playerText: playerMessage.content,
        playerMessageIdx: playerMessage.idx,
        recoverable: false,
        reason: "player_message_mismatch",
      },
      playerMessage,
    };
  }

  const narratorById = operation.narratorMessageId
    ? await store.messages.get(operation.narratorMessageId)
    : undefined;
  if (narratorById?.role === "narrator") {
    return {
      inspection: {
        ...base,
        playerText: playerMessage.content,
        playerMessageIdx: playerMessage.idx,
        recoverable: false,
        reason: "narrator_already_persisted",
      },
      playerMessage,
    };
  }

  const nextMessage = await store.messages.getByIndex(operation.storyId, playerMessage.idx + 1);
  if (nextMessage) {
    return {
      inspection: {
        ...base,
        playerText: playerMessage.content,
        playerMessageIdx: playerMessage.idx,
        recoverable: false,
        reason:
          nextMessage.role === "narrator"
            ? "narrator_already_persisted"
            : "transcript_advanced",
      },
      playerMessage,
    };
  }

  const recoverable = IMMEDIATELY_RETRYABLE_STATES.has(operation.state) || stale;
  return {
    inspection: {
      ...base,
      playerText: playerMessage.content,
      playerMessageIdx: playerMessage.idx,
      recoverable,
      ...(recoverable ? {} : { reason: "operation_active" as const }),
    },
    playerMessage,
  };
}

/**
 * Inspect the latest failed or non-terminal operation for a story. This is read-only and safe to
 * call on app startup. Fresh active work is reported but not recoverable until it becomes stale.
 */
export async function inspectTurnOperationRecovery(
  store: Store,
  storyId: string,
  opts: InspectTurnOperationOptions = {}
): Promise<TurnOperationRecoveryInspection | undefined> {
  const operation = await store.turnOperations.latestRecoverable(storyId);
  if (!operation) return undefined;
  return (await inspectStoredOperation(store, operation, opts)).inspection;
}

/**
 * Retry a failed/stale turn using its already-persisted player message. A compare-and-set claim
 * prevents two windows from retrying the same operation, and transcript checks prevent a second
 * narrator message after a prior save succeeded.
 */
export async function retryTurnOperation(
  router: Router,
  store: Store,
  operationId: string,
  opts: RetryTurnOperationOptions = {}
): Promise<SubmitTurnResult> {
  const operation = await store.turnOperations.get(operationId);
  if (!operation) throw new TurnOperationRecoveryError("operation_not_found");

  const { staleAfterMs, now, ...submitOpts } = opts;
  const inspected = await inspectStoredOperation(store, operation, {
    ...(staleAfterMs === undefined ? {} : { staleAfterMs }),
    ...(now === undefined ? {} : { now }),
  });
  if (!inspected.inspection.recoverable || !inspected.playerMessage) {
    throw new TurnOperationRecoveryError(
      inspected.inspection.reason ?? "operation_active"
    );
  }

  const claimedAt = Math.max(now ?? Date.now(), operation.updatedAt + 1);
  const claimed = await store.turnOperations.claimRetry(
    operation.id,
    operation.updatedAt,
    claimedAt
  );
  if (!claimed) throw new TurnOperationRecoveryError("retry_claim_lost");
  const claimedOperation = await store.turnOperations.get(operation.id);
  if (!claimedOperation) throw new TurnOperationRecoveryError("operation_not_found");

  return runTurnOperation(
    router,
    store,
    operation.storyId,
    inspected.playerMessage.content,
    submitOpts,
    {
      playerMessage: inspected.playerMessage,
      operation: claimedOperation,
    }
  );
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
    const roster = await store.characters.listPresentByStory(storyId);
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
    const story = await requireStory(store, storyId);
    const chapter = await maybeSummarizeChapter(
      router,
      store,
      storyId,
      onError ? { onError } : {}
    );
    if (chapter) {
      await store.events.insert({
        id: randomUUID(),
        storyId,
        turnIndex: chapter.msgFrom,
        chapterIndex: chapter.idx,
        kind: "chapter_started",
        payload: { chapterId: chapter.id, index: chapter.idx, title: chapter.title },
        rulebookVersion: story.rulebookVersion ?? 1,
        createdAt: Date.now(),
      });
    }
    const arc = await maybeSummarizeArc(router, store, storyId, onError ? { onError } : {});
    if (arc) {
      await store.events.insert({
        id: randomUUID(),
        storyId,
        turnIndex: chapter?.msgTo ?? args.turnIdx,
        chapterIndex: arc.chapterTo,
        kind: "arc_completed",
        payload: { arcId: arc.id, index: arc.idx, title: arc.title },
        rulebookVersion: story.rulebookVersion ?? 1,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    onError?.(err);
  }
}
