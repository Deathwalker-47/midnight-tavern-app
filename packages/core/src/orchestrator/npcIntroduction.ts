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
  grounding: string;
}

export interface ApprovedNpcTransition {
  character: CharacterRecord;
  operation: "introduce" | "enter" | "leave";
}

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

function promptFor(input: NpcIntroductionInput) {
  return {
    system: [
      "You are the NPC presence registrar for an interactive roleplay engine.",
      "Propose only identity and scene-presence transitions: introduce, enter, or leave.",
      "Include people, creatures, monsters, speaking intelligences, and other consequential actors.",
      "Do not propose scenery, corpses with no agency, murals, statues, paintings, crowds, shadows, or vague pronouns.",
      "Use an existing characterId/name whenever the registry already contains that actor.",
      "For a new actor, quote a short grounding excerpt from the player action or recent narration.",
      "Use a sealed templateId only when it exactly identifies the actor. Never invent mechanics.",
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
    return [];
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
      if (!grounded(proposal, corpus) || transitioned.has(existing.id)) continue;
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
        : instantiateGeneric(input.schema, id),
    };
    approved.push({ operation: "introduce", character });
    transitioned.add(id);
  }

  return approved;
}
