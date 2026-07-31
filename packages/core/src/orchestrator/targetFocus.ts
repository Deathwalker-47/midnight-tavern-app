/**
 * Derive the only target local classifier recovery may reuse for continuation wording.
 * The source is committed engine evidence, not narrator prose or roster order.
 */
import type { CharacterRecord, Store } from "../store/index.js";

const TARGETED_RULING_KINDS = ["roll", "automatic"] as const;

export async function deriveRecentPlayerTargetId(
  store: Store,
  storyId: string,
  presentCharacters: readonly CharacterRecord[],
  recentMessageIds: ReadonlySet<string>
): Promise<string | undefined> {
  const players = presentCharacters.filter(
    (character) => character.isPlayer && character.hard.alive
  );
  if (players.length !== 1 || recentMessageIds.size === 0) return undefined;

  const playerId = players[0]!.id;
  const events = await store.events.listByStory(storyId, {
    actorId: playerId,
    kinds: TARGETED_RULING_KINDS,
    limit: 100,
  });
  const targeted = events.flatMap((event) => {
    if (!event.messageId || !recentMessageIds.has(event.messageId)) return [];
    const value = event.payload["ruling"];
    if (!value || typeof value !== "object") return [];
    const ruling = value as Record<string, unknown>;
    const gate = ruling["gate"] as Record<string, unknown> | undefined;
    const actorId = ruling["actorId"];
    const targetId = ruling["targetId"];
    if (actorId !== playerId || gate?.["allowed"] !== true || typeof targetId !== "string") {
      return [];
    }
    return [{ turnIndex: event.turnIndex, targetId }];
  });
  if (targeted.length === 0) return undefined;

  const newestTurn = Math.max(...targeted.map((event) => event.turnIndex));
  const newestTargets = new Set(
    targeted.filter((event) => event.turnIndex === newestTurn).map((event) => event.targetId)
  );
  if (newestTargets.size !== 1) return undefined;

  const targetId = [...newestTargets][0]!;
  const target = presentCharacters.find(
    (character) =>
      character.id === targetId && !character.isPlayer && character.hard.alive
  );
  return target?.id;
}
