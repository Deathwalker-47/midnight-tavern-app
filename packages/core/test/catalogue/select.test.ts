import { describe, expect, it } from "vitest";
import {
  buildPoolSelectionUser,
  POOL_SECTION_SYSTEM,
  SECTION_PICKS,
  SECTION_STAGE_THRESHOLD,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  type PoolCatalogue,
  inferSettingFits,
  poolCandidates,
  POOL_SELECTION_TARGET,
  rankCandidates,
  selectPoolEntries,
  type ChatResponse,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StorySchema,
} from "../../src/index.js";
import { makeStory } from "../fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const story = (premise: string): StorySchema =>
  makeStory({
    premise,
    schemaVersion: 3,
    attributes: [
      { id: "str", name: "Strength", abbrev: "STR", description: "Force.", defaultScore: 10 },
      { id: "dex", name: "Dexterity", abbrev: "DEX", description: "Agility.", defaultScore: 10 },
      { id: "cha", name: "Charisma", abbrev: "CHA", description: "Presence.", defaultScore: 10 },
    ],
    resources: [
      pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
      pool({ id: "stamina", label: "Stamina", role: "stamina" }),
      pool({ id: "mana", label: "Mana", role: "mana" }),
    ],
    tiers: [
      { id: "common", label: "Common", minProgress: 0 },
      { id: "uncommon", label: "Uncommon", minProgress: 10 },
    ],
  });
const fantasy = story("A knight and a wizard defend a besieged castle in a fading kingdom.");

/** A router whose bootstrapper answers the selection call with `reply` (or throws / hangs). */
function selectingRouter(reply: unknown | Error | "hang"): Router & { prompts: RolePrompt[] } {
  const prompts: RolePrompt[] = [];
  return {
    prompts,
    bindingFor(_role: Role): RoleBinding {
      return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
    },
    async complete(_role: Role, prompt: RolePrompt, options): Promise<ChatResponse> {
      prompts.push(prompt);
      if (reply === "hang") {
        return new Promise((_, reject) =>
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        );
      }
      if (reply instanceof Error) throw reply;
      return { content: JSON.stringify(reply) };
    },
    async stream(): Promise<ChatResponse> {
      return { content: "" };
    },
  } as Router & { prompts: RolePrompt[] };
}

describe("setting inference", () => {
  it("reads the premise's genre cues and always allows setting-agnostic entries", () => {
    expect(inferSettingFits("A quiet village.")).toEqual(["any"]);
    expect(inferSettingFits(fantasy.premise)).toEqual(["any", "fantasy"]);
    expect(inferSettingFits("A detective hunts a killer through the city with a smartphone.")).toEqual(["any", "modern"]);
    expect(inferSettingFits("Survivors scavenge the wasteland after the collapse.")).toEqual(["any", "post_apocalyptic"]);
    expect(inferSettingFits("A haunted starship drifts past a dead planet.")).toEqual(["any", "scifi", "horror"]);
    expect(inferSettingFits("A samurai in the sixteenth century.")).toEqual(["any", "historical"]);
  });
});

describe("candidates", () => {
  it("fit the setting, are expressible here, and are not already present", () => {
    const ids = (schema: StorySchema, settings = inferSettingFits(schema.premise)) =>
      poolCandidates(schema, settings).map((entry) => entry.id);
    expect(ids(fantasy)).not.toContain("uni.tech.technology.hack_a_terminal");
    expect(ids(fantasy)).not.toContain("uni.social.pressure.compel_obedience");
    expect(ids(fantasy, ["any", "modern"])).toContain("uni.tech.technology.hack_a_terminal");
    const withPersuade = { ...fantasy, actions: [...fantasy.actions, { ...fantasy.actions[0]!, id: "uni.social.persuasion.persuade" }] };
    expect(ids(withPersuade)).not.toContain("uni.social.persuasion.persuade");
    const noStamina = { ...fantasy, resources: fantasy.resources.filter((def) => def.role !== "stamina") };
    expect(ids(noStamina)).not.toContain("uni.physical.athletics.climb");
    expect(ids(noStamina)).toContain("uni.social.persuasion.persuade");
  });

  it("are ranked by premise relevance, ties in pool order", () => {
    const candidates = poolCandidates(fantasy, ["any", "fantasy"]);
    const ranked = rankCandidates(candidates, "We must haggle and bargain with the merchant, and trade goods.");
    expect(ranked.slice(0, 2).map((entry) => entry.name)).toEqual(["Haggle", "Trade Goods"]);
    expect(rankCandidates(candidates, "zzzz")).toEqual(candidates);
  });

  it("are offered as a compact index split by kind", () => {
    const user = buildPoolSelectionUser("A premise.", poolCandidates(fantasy, ["any"]));
    expect(user).toMatch(/UNIVERSAL POOL INDEX — ACTIONS:\n- uni\.social\.conversation\.strike_up_a_conversation · Strike Up a Conversation · /);
    expect(user).toMatch(/UNIVERSAL POOL INDEX — SKILLS:\n- uni\./);
  });
});

describe("selecting pool entries for a sealed rulebook", () => {
  const kinds = new Map(poolCandidates(fantasy, ["any", "fantasy"]).map((entry) => [entry.id, entry.kind]));
  const count = (ids: string[], kind: "action" | "skill") => ids.filter((id) => kinds.get(id) === kind).length;

  it("uses the model's picks, trimmed to the caps and topped up to the minimums", async () => {
    const actions = poolCandidates(fantasy, ["any", "fantasy"]).filter((entry) => entry.kind === "action").map((entry) => entry.id);
    const router = selectingRouter({ actions: actions.slice(0, 40), skills: [] });
    const selection = await selectPoolEntries(router, fantasy);
    expect(selection.via).toBe("model");
    expect(selection.settings).toEqual(["any", "fantasy"]);
    expect(selection.ids.slice(0, POOL_SELECTION_TARGET.actions.max)).toEqual(actions.slice(0, POOL_SELECTION_TARGET.actions.max));
    expect(count(selection.ids, "action")).toBe(POOL_SELECTION_TARGET.actions.max);
    expect(count(selection.ids, "skill")).toBe(POOL_SELECTION_TARGET.skills.min);
    expect(router.prompts[0]!.system).toMatch(/POOL SELECTION/);

    const few = await selectPoolEntries(selectingRouter({ actions: [actions[5]], skills: [] }), fantasy);
    expect(few.ids[0]).toBe(actions[5]);
    expect(count(few.ids, "action")).toBe(POOL_SELECTION_TARGET.actions.min);
  });

  it("falls back to the deterministic ranking when the model fails or stalls", async () => {
    const failed = await selectPoolEntries(selectingRouter(new Error("provider down")), fantasy);
    expect(failed.via).toBe("fallback");
    expect(count(failed.ids, "action")).toBe(POOL_SELECTION_TARGET.actions.min);
    expect(count(failed.ids, "skill")).toBe(POOL_SELECTION_TARGET.skills.min);
    const invented = await selectPoolEntries(selectingRouter({ actions: ["uni.made.up.thing"], skills: [] }), fantasy);
    expect(invented.via).toBe("fallback");
    const stalled = await selectPoolEntries(selectingRouter("hang"), fantasy, { deadlineMs: 5 });
    expect(stalled.via).toBe("fallback");
  });

  it("stops when the caller cancels, and selects nothing when nothing fits", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(selectPoolEntries(selectingRouter(new Error("x")), fantasy, { signal: controller.signal })).rejects.toThrow();
    const bare = { ...fantasy, statMode: "none" as const };
    expect(await selectPoolEntries(selectingRouter({ actions: [], skills: [] }), bare)).toEqual({
      ids: [],
      via: "fallback",
      settings: ["any", "fantasy"],
    });
  });
});

describe("a pool too large for one call (plan 09 §5.3)", () => {
  // Four copies of every section and entry: well past the threshold for a fantasy premise.
  const copies = 4;
  const remap = (id: string, k: number) => {
    const [uni, domain, group, name] = id.split(".");
    return `${uni}.${domain}.${group}x${k}.${name}`;
  };
  const big: PoolCatalogue = {
    archetypes: UNIVERSAL_ARCHETYPES,
    pool: {
      version: 1,
      sections: Array.from({ length: copies }, (_, k) => UNIVERSAL_POOL.sections.map((section) => ({ ...section, id: `${section.id}_${k}` }))).flat(),
      entries: Array.from({ length: copies }, (_, k) =>
        UNIVERSAL_POOL.entries.map((entry) => ({
          ...entry,
          id: remap(entry.id, k),
          section: `${entry.section}_${k}`,
          ...(entry.requiresSkill ? { requiresSkill: remap(entry.requiresSkill, k) } : {}),
        }))
      ).flat(),
    },
  };
  const userOf = (router: { prompts: RolePrompt[] }, system: string) =>
    router.prompts.find((prompt) => prompt.system.includes(system))?.user ?? "";
  const listed = (user: string) => user.split("\n").filter((line) => line.startsWith("- uni."));

  it("picks sections first, then entries only from those sections, never listing more than the threshold", async () => {
    const router = selectingRouter("unused");
    let call = 0;
    router.complete = async (_role, prompt) => {
      router.prompts.push(prompt);
      call++;
      return {
        content: JSON.stringify(
          call === 1 ? { sections: ["persuasion_0", "lore_1", "persuasion_0"] } : { actions: ["uni.social.persuasionx0.persuade"], skills: [] }
        ),
      };
    };
    const selection = await selectPoolEntries(router, fantasy, { catalogue: big });
    expect(poolCandidates(fantasy, inferSettingFits(fantasy.premise), big).length).toBeGreaterThan(SECTION_STAGE_THRESHOLD);
    expect(router.prompts[0]!.system).toContain(POOL_SECTION_SYSTEM);
    expect(userOf(router, "POOL SECTION SELECTION")).toMatch(/- persuasion_0 · Persuasion & Negotiation · .*\(\d+\)/);
    const entryLines = listed(router.prompts[1]!.user);
    expect(entryLines.every((line) => /^- uni\.(social\.persuasionx0|knowledge\.lorex1)\./.test(line))).toBe(true);
    expect(selection.via).toBe("model");
    expect(selection.ids[0]).toBe("uni.social.persuasionx0.persuade");
  });

  it("falls back to the sections with the most relevant entries, and stays bounded", async () => {
    const router = selectingRouter("unused");
    router.complete = async (_role, prompt) => {
      router.prompts.push(prompt);
      if (prompt.system.includes("POOL SECTION SELECTION")) throw new Error("down");
      return { content: JSON.stringify({ actions: [], skills: [] }) };
    };
    const selection = await selectPoolEntries(router, fantasy, { catalogue: big });
    const lines = listed(router.prompts[1]!.user);
    expect(lines.length).toBeLessThanOrEqual(SECTION_STAGE_THRESHOLD);
    const sections = new Set(lines.map((line) => line.split(" ")[1]!.split(".").slice(1, 3).join(".")));
    expect(sections.size).toBeLessThanOrEqual(SECTION_PICKS);
    expect(selection.ids.length).toBeGreaterThanOrEqual(POOL_SELECTION_TARGET.actions.min);
  });
});

