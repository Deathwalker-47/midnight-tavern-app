import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { CharacterRecord } from "../store/index.js";
import type { StorySchema } from "../types/index.js";
import { instantiateFromTemplate, instantiateGeneric } from "../bootstrap/instantiate.js";

export interface NpcIntroductionProposal {
  operation: "introduce" | "enter" | "leave";
  characterId?: string;
  name: string;
  templateId?: string;
  skillIds?: string[];
  grounding: string;
}

export interface ApprovedNpcTransition {
  character: CharacterRecord;
  operation: "introduce" | "enter" | "leave" | "update";
}

/** Engine-owned disposition fact. Models and narrator prose may provide evidence, never authority. */
export const NPC_HOSTILE_TO_PLAYER_FLAG = "npc_hostile_to_player";

export interface NpcIntroductionInput {
  storyId: string;
  schema: StorySchema;
  playerText: string;
  recentNarration: readonly string[];
  roster: readonly CharacterRecord[];
}

const ProposalSchema = z.object({
  operation: z.enum(["introduce", "enter", "leave"]),
  characterId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  templateId: z.string().trim().min(1).optional(),
  skillIds: z.array(z.string().trim().min(1)).max(3).optional(),
  grounding: z.string().trim().min(1).max(500),
});

const ProposalResponseSchema = z.object({
  transitions: z.array(ProposalSchema).max(8),
});

const AMBIENT_DEPICTION =
  /\b(mural|painting|painted|portrait|statue|carving|sculpture|depiction|image|reflection|shadow cast|crowd|scenery)\b/i;
const NON_CHARACTER_NAME =
  /^(?:any|every|no|some)?(?:body|one|thing)$|^(?:crowd|nothing|something|someone|shadow|darkness)$/i;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value: string): string {
  return normalize(value).replace(/['’]/g, "").replace(/\s+/g, "-");
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actorAliases(name: string): string[] {
  const normalized = normalize(name);
  const shortened = normalized.replace(/\s+(?:entity|creature|monster|beast)$/, "");
  return shortened.length >= 3 && shortened !== normalized
    ? [normalized, shortened]
    : [normalized];
}

function explicitlyAttacksPlayer(
  character: CharacterRecord,
  playerNames: readonly string[],
  recentNarration: readonly string[],
  aliases: readonly string[]
): boolean {
  const targets = ["you", ...playerNames.map(normalize)].filter(Boolean).map(regexEscape);
  if (targets.length === 0) return false;
  const targetPattern = `(?:${targets.join("|")})`;
  const attackPattern =
    "(?:attacks?|strikes?|lunges? at|charges?|bites?|claws? at|swings? at|turns? on|tries? to kill|threatens?)";

  for (const rawSentence of recentNarration.join("\n").split(/[.!?;\n]+/)) {
    const sentence = normalize(rawSentence);
    for (const alias of aliases) {
      if (!alias) continue;
      const direct = new RegExp(
        `\\b${regexEscape(alias)}\\b(?<between>.{0,80}?)\\b${attackPattern}\\b(?<after>.{0,80}?)\\b${targetPattern}\\b`,
        "i"
      ).exec(sentence);
      if (!direct) continue;
      const between = direct.groups?.between ?? "";
      if (/\b(?:not|never|no longer|does not|doesnt|refuses? to)\b/i.test(between)) continue;
      return true;
    }
  }
  return false;
}

function grounded(proposal: NpcIntroductionProposal, corpus: string): boolean {
  const evidence = normalize(proposal.grounding);
  const normalizedCorpus = normalize(corpus);
  return (
    evidence.length >= 3 &&
    normalizedCorpus.includes(evidence) &&
    normalizedCorpus.includes(normalize(proposal.name)) &&
    !AMBIENT_DEPICTION.test(proposal.grounding)
  );
}

function groundedExistingTransition(
  proposal: NpcIntroductionProposal,
  corpus: string
): boolean {
  const evidence = normalize(proposal.grounding);
  const name = normalize(proposal.name);
  if (evidence.length < 3 || !name || AMBIENT_DEPICTION.test(proposal.grounding)) return false;
  return corpus.split(/[.!?;\n]+/).some((rawSentence) => {
    const sentence = normalize(rawSentence);
    return sentence.includes(evidence) && sentence.includes(name);
  });
}

/**
 * A leave transition may omit the NPC's name only when it quotes an unambiguous, already-committed
 * scene-roster statement. The intentionally narrow grammar avoids treating dramatic uses of
 * "alone" or a character's mere omission as authority to remove anyone from the scene.
 */
function groundedCommittedIsolation(
  proposal: NpcIntroductionProposal,
  recentNarration: readonly string[]
): boolean {
  const evidence = normalize(proposal.grounding);
  const quotesCommittedSentence = recentNarration.some((line) =>
    line.split(/[.!?;\n]+/).some((candidate) => normalize(candidate) === evidence)
  );
  if (!evidence || !quotesCommittedSentence) {
    return false;
  }
  return /^(?:you are|you're|you stand|you remain|you find yourself) (?:now )?(?:completely )?alone(?: here| now)?$|^no one else (?:is here|remains|is present)$|^you are the only (?:one|person|living soul) (?:here|present|remaining)$/i.test(
    evidence
  );
}

function promptFor(input: NpcIntroductionInput) {
  return {
    system: [
      "You are the NPC presence registrar for an interactive roleplay engine.",
      "Propose only identity and scene-presence transitions: introduce, enter, or leave.",
      "Include people, creatures, monsters, speaking intelligences, and other consequential actors.",
      "Do not propose scenery, corpses with no agency, murals, statues, paintings, crowds, shadows, or vague pronouns.",
      "Use an existing characterId/name whenever the registry already contains that actor.",
      "For a new actor, quote a short grounding excerpt from the player action or recent narration.",
      "Never infer leave from omission. A leave must name the actor in its grounding, except when committed recent narration exactly says the player is alone/no one else remains; then propose leave for each present non-player actor using that exact roster statement.",
      "Use a sealed templateId only when it exactly identifies the actor. Never invent mechanics.",
      "For a new actor without a template, select at most three sealed skill ids that fit its portrayed capabilities.",
      "Never provide skillIds for an existing or template-backed actor. Never invent skill ids or ranks.",
      "Return { transitions: [...] }. Return an empty array when no presence changes are grounded.",
    ].join("\n"),
    user: [
      `PLAYER ACTION:\n${input.playerText}`,
      `RECENT NARRATION:\n${input.recentNarration.slice(-4).join("\n") || "(none)"}`,
      `REGISTRY:\n${
        input.roster
          .map((character) =>
            JSON.stringify({
              id: character.id,
              name: character.name,
              present: character.present,
              isPlayer: character.isPlayer,
            })
          )
          .join("\n") || "(empty)"
      }`,
      `SEALED NPC TEMPLATES:\n${
        input.schema.npcTemplates
          .map((template) => JSON.stringify({ templateId: template.templateId, name: template.name }))
          .join("\n") || "(none)"
      }`,
      `SEALED STORY SKILLS (new non-template actors only):\n${
        input.schema.skills
          .map((skill) =>
            JSON.stringify({ id: skill.id, name: skill.name, description: skill.description })
          )
          .join("\n") || "(none)"
      }`,
    ].join("\n\n"),
  };
}

export async function planNpcTransitions(
  router: Router,
  input: NpcIntroductionInput,
  signal?: AbortSignal
): Promise<ApprovedNpcTransition[]> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Cancelled", "AbortError");
  }

  let proposals: NpcIntroductionProposal[];
  try {
    const response = await callStructured(
      router,
      "classifier",
      promptFor(input),
      ProposalResponseSchema,
      { maxRepairs: 0, maxTokens: 1_200, ...(signal ? { signal } : {}) }
    );
    proposals = response.transitions;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    proposals = [];
  }

  const corpus = [input.playerText, ...input.recentNarration].join("\n");
  const byId = new Map(input.roster.map((character) => [character.id, character]));
  const byName = new Map(
    input.roster.map((character) => [normalize(character.name), character])
  );
  const approved: ApprovedNpcTransition[] = [];
  const transitioned = new Set<string>();

  for (const proposal of proposals) {
    const nameKey = normalize(proposal.name);
    if (!nameKey || NON_CHARACTER_NAME.test(nameKey)) continue;

    const byProposedId = proposal.characterId ? byId.get(proposal.characterId) : undefined;
    const existing = byProposedId ?? byName.get(nameKey);
    if (
      (proposal.characterId && !byProposedId) ||
      (byProposedId && normalize(byProposedId.name) !== nameKey) ||
      existing?.isPlayer
    ) {
      continue;
    }

    if (existing) {
      const isGrounded =
        groundedExistingTransition(proposal, corpus) ||
        (proposal.operation === "leave" &&
          groundedCommittedIsolation(proposal, input.recentNarration));
      if (!isGrounded || transitioned.has(existing.id)) continue;
      const operation = proposal.operation === "leave" ? "leave" : "enter";
      approved.push({
        operation,
        character: { ...existing, present: operation === "enter" },
      });
      transitioned.add(existing.id);
      continue;
    }

    if (proposal.operation !== "introduce") continue;
    const template = proposal.templateId
      ? input.schema.npcTemplates.find(
          (candidate) =>
            normalize(candidate.templateId) === normalize(proposal.templateId!) &&
            normalize(candidate.name) === nameKey
        )
      : undefined;
    if (proposal.templateId && !template) continue;
    if (!template && !grounded(proposal, corpus)) continue;

    const id = `${input.storyId}:scene:${slug(template?.templateId ?? proposal.name)}`;
    if (!slug(proposal.name) || byId.has(id) || transitioned.has(id)) continue;
    const character: CharacterRecord = {
      id,
      storyId: input.storyId,
      name: template?.name ?? proposal.name.trim(),
      isPlayer: false,
      present: true,
      hard: template
        ? instantiateFromTemplate(input.schema, id, template)
        : instantiateGeneric(input.schema, id, proposal.skillIds),
    };
    approved.push({ operation: "introduce", character });
    transitioned.add(id);
  }

  const playerNames = input.roster
    .filter((character) => character.isPlayer)
    .map((character) => character.name);
  const approvedIndexById = new Map(
    approved.map((transition, index) => [transition.character.id, index])
  );
  const dispositionCandidates = new Map(
    [...input.roster, ...approved.map((transition) => transition.character)]
      .filter((character) => !character.isPlayer && character.present && character.hard.alive)
      .map((character) => [character.id, character])
  );
  const aliasOwners = new Map<string, Set<string>>();
  for (const character of dispositionCandidates.values()) {
    for (const alias of actorAliases(character.name)) {
      const owners = aliasOwners.get(alias) ?? new Set<string>();
      owners.add(character.id);
      aliasOwners.set(alias, owners);
    }
  }
  for (const character of dispositionCandidates.values()) {
    if (character.hard.flags[NPC_HOSTILE_TO_PLAYER_FLAG]) continue;
    const uniqueAliases = actorAliases(character.name).filter(
      (alias) => aliasOwners.get(alias)?.size === 1
    );
    if (!explicitlyAttacksPlayer(character, playerNames, input.recentNarration, uniqueAliases)) {
      continue;
    }
    const updated: CharacterRecord = {
      ...character,
      hard: {
        ...character.hard,
        flags: { ...character.hard.flags, [NPC_HOSTILE_TO_PLAYER_FLAG]: true },
      },
    };
    const approvedIndex = approvedIndexById.get(character.id);
    if (approvedIndex === undefined) {
      approved.push({ operation: "update", character: updated });
      approvedIndexById.set(character.id, approved.length - 1);
    } else {
      approved[approvedIndex] = { ...approved[approvedIndex]!, character: updated };
    }
  }

  return approved;
}
