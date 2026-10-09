/**
 * User config overrides (plan 09 §4c): deep-merge by id over the shipped files, removal, new content,
 * and validation that skips what is broken with an error naming file, id and field — never a crash —
 * while balance findings are only warnings and open-ended numbers are clamped.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_FILES,
  CONFIG_README,
  configHash,
  resolveConfig,
  SHIPPED_CONFIG,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_ITEMS,
  UNIVERSAL_POOL,
  type ActionArchetype,
  type ConfigIssue,
} from "../../src/index.js";

const json = (value: unknown) => JSON.stringify(value);
const archetype = (config: ReturnType<typeof resolveConfig>, id: string) =>
  config.archetypes.archetypes.find((candidate) => candidate.id === id) as ActionArchetype | undefined;
const entry = (config: ReturnType<typeof resolveConfig>, id: string) => config.pool.entries.find((candidate) => candidate.id === id);
const errors = (issues: ConfigIssue[]) => issues.filter((issue) => issue.severity === "error");
const SWAY = "arch.social.sway";

describe("resolving overrides", () => {
  it("is the shipped config when there is nothing to override", () => {
    expect(resolveConfig({})).toBe(SHIPPED_CONFIG);
    expect(configHash({})).toBe("");
    expect(configHash({ pool: "{}" })).toMatch(/^[0-9a-f]{8}$/);
    expect(configHash({ pool: "{}" })).not.toBe(configHash({ items: "{}" }));
  });

  it("deep-merges an edit over the shipped element, with null clearing a field", () => {
    const config = resolveConfig({
      archetypes: json({
        archetypes: [
          { id: SWAY, dc: 15, effects: { success: { narrationHint: "they agree at last" } } },
          { id: "arch.combat.power_strike", cooldownTurns: null },
        ],
      }),
    });
    expect(archetype(config, SWAY)).toMatchObject({
      dc: 15,
      tier: "common",
      effects: { success: { narrationHint: "they agree at last" }, failure: { narrationHint: "they are unmoved" } },
    });
    expect(archetype(config, "arch.combat.power_strike")!.cooldownTurns).toBeUndefined();
    expect(errors(config.issues)).toEqual([]);
    expect(config.texts.archetypes).toContain(SWAY);
    expect(config.hash).not.toBe("");
  });

  it("removes ids, adds new content, and leaves out what would break the engine", () => {
    const config = resolveConfig({
      pool: json({
        sections: [{ id: "homebrew", title: "Homebrew", description: "Mine." }],
        entries: [
          { id: "uni.social.persuasion.persuade", remove: true },
          { id: "uni.nope.nope.nope", remove: true },
          {
            id: "uni.social.homebrew.sweet_talk",
            name: "Sweet Talk",
            kind: "action",
            archetypeId: SWAY,
            section: "homebrew",
            tags: ["social"],
            settingFit: ["any"],
            description: "Charm them.",
            aliases: ["sweet talk"],
          },
          {
            id: "uni.social.homebrew.ghost",
            name: "Ghost",
            kind: "action",
            archetypeId: "arch.social.nothing",
            section: "homebrew",
            tags: ["social"],
            settingFit: ["any"],
            description: "No archetype.",
            aliases: ["ghost"],
          },
          { id: "uni.social.leadership.command", remove: true },
        ],
      }),
    });
    expect(entry(config, "uni.social.persuasion.persuade")).toBeUndefined();
    expect(entry(config, "uni.social.homebrew.sweet_talk")).toMatchObject({ name: "Sweet Talk" });
    expect(config.pool.sections.some((section) => section.id === "homebrew")).toBe(true);
    expect(entry(config, "uni.social.homebrew.ghost")).toBeUndefined();
    // Removing Command strands the actions gated by it; they go too rather than break enabling.
    expect(entry(config, "uni.social.leadership.rally_the_group")).toBeUndefined();
    expect(config.issues).toEqual(
      expect.arrayContaining([
        { file: CONFIG_FILES.pool, severity: "warning", id: "uni.nope.nope.nope", message: "Nothing with this id to remove." },
        expect.objectContaining({ file: CONFIG_FILES.pool, severity: "error", id: "uni.social.homebrew.ghost" }),
        expect.objectContaining({ file: CONFIG_FILES.pool, severity: "error", id: "uni.social.leadership.rally_the_group" }),
      ])
    );
  });

  it("skips a broken element with an error naming file, id and field — keeping a shipped one", () => {
    const config = resolveConfig({
      archetypes: json({ archetypes: [{ id: SWAY, tier: "legendaryish" }] }),
      items: json({ archetypes: [{ id: "item.homebrew.broken", kind: "potion" }] }),
    });
    expect(archetype(config, SWAY)!.tier).toBe("common");
    expect(config.issues).toContainEqual(
      expect.objectContaining({ file: CONFIG_FILES.archetypes, severity: "error", id: SWAY, field: "tier" })
    );
    expect(config.items.archetypes.some((item) => item.id === "item.homebrew.broken")).toBe(false);
    expect(errors(config.issues).find((issue) => issue.file === CONFIG_FILES.items)?.message).toMatch(/left out/);
  });

  it("ignores a file it cannot read, or a list that is not a list, and never throws", () => {
    const config = resolveConfig({
      archetypes: "{ not json",
      pool: json(["a list"]),
      items: json({ archetypes: "everything", extra: 1 }),
    });
    expect(config.archetypes.archetypes).toHaveLength(UNIVERSAL_ARCHETYPES.archetypes.length);
    expect(config.pool.entries).toHaveLength(UNIVERSAL_POOL.entries.length);
    expect(config.items.archetypes).toHaveLength(UNIVERSAL_ITEMS.archetypes.length);
    expect(errors(config.issues).map((issue) => [issue.file, issue.message.split(" ")[0]])).toEqual([
      [CONFIG_FILES.archetypes, "Not"],
      [CONFIG_FILES.pool, "The"],
      [CONFIG_FILES.items, '"archetypes"'],
    ]);
    const anonymous = resolveConfig({ pool: json({ entries: [{ name: "No id" }] }) });
    expect(errors(anonymous.issues)).toEqual([
      expect.objectContaining({ field: "entries[0]", message: 'Every override needs a string "id"; it was ignored.' }),
    ]);
  });

  it("clamps open-ended numbers with a warning", () => {
    const config = resolveConfig({
      archetypes: json({ archetypes: [{ id: SWAY, dc: 50000 }, { id: "arch.combat.power_strike", costs: { stamina: 500 } }] }),
      items: json({
        archetypes: [
          { id: "item.melee.light_weapon", props: { damage: { mythical: 999 } } },
          { id: "item.potion.healing", restores: { health: { mythical: 999 } } },
        ],
      }),
    });
    expect(archetype(config, SWAY)!.dc).toBe(25);
    expect(archetype(config, "arch.combat.power_strike")!.costs).toEqual({ stamina: 40 });
    const item = (id: string) => config.items.archetypes.find((candidate) => candidate.id === id)!;
    expect(item("item.melee.light_weapon").props!["damage"]).toMatchObject({ common: 1, mythical: 20 });
    expect(item("item.potion.healing").restores!.health!.mythical).toBe(50);
    expect(config.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["dc", "costs.stamina", "props.damage.mythical", "restores.health.mythical"])
    );
  });

  it("reports balance findings as warnings and applies the edit anyway", () => {
    const config = resolveConfig({ archetypes: json({ archetypes: [{ id: SWAY, dc: 22 }] }) });
    expect(archetype(config, SWAY)!.dc).toBe(22);
    expect(config.issues).toContainEqual(expect.objectContaining({ severity: "warning", id: SWAY, file: CONFIG_FILES.archetypes }));
    expect(errors(config.issues)).toEqual([]);
  });

  it("keeps the shipped item archetypes when every one is removed", () => {
    const config = resolveConfig({
      items: json({ archetypes: UNIVERSAL_ITEMS.archetypes.map((item) => ({ id: item.id, remove: true })) }),
    });
    expect(config.items.archetypes).toHaveLength(UNIVERSAL_ITEMS.archetypes.length);
    expect(errors(config.issues)).toContainEqual(expect.objectContaining({ file: CONFIG_FILES.items }));
  });

  it("ships a README that explains merging, removal and the per-story lock", () => {
    expect(CONFIG_README).toMatch(/merged over them/);
    expect(CONFIG_README).toMatch(/"remove": true/);
    expect(CONFIG_README).toMatch(/follow my edits/);
  });
});
