/**
 * RulebookCatalogue — what this story currently plays by (plan 09 §7 surface 1, design brief §5a):
 * the forged rulebook's actions and skills plus every enabled universal-pool entry, with provenance,
 * filters (kind · category · tier), search, and a detail view per entry (gate, costs, cooldown,
 * targeting, durations, outcome table). Read-only: enabling and disabling live in the pool browser.
 *
 * Defensive by design: older and partial rulebooks may omit optional fields, so every detail line
 * tolerates their absence instead of assuming the v3 shape.
 */
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ActionDef, PoolEnablementView, SkillDef, StoryRecord } from "../../bridge/core";

type Schema = StoryRecord["schema"];
type EffectSpec = ActionDef["effects"]["success"];
type StatusSpec = NonNullable<EffectSpec["statusSelf"]>;
type Bonus = NonNullable<SkillDef["passive"]>;

/** Where an entry came from: forged into the sealed rulebook, or enabled from the pool by whom. */
export type CatalogueOrigin = "forged" | PoolEnablementView["source"];

export type CatalogueEntry =
  | { kind: "action"; id: string; name: string; origin: CatalogueOrigin; action: ActionDef }
  | { kind: "skill"; id: string; name: string; origin: CatalogueOrigin; skill: SkillDef };

export const ORIGIN_LABEL: Readonly<Record<CatalogueOrigin, string>> = {
  forged: "written for this story",
  forge: "chosen at creation",
  player: "added by you",
  analyzer: "added by the story",
};

/** The effective rulebook as rows: frozen definitions win any id collision, as in core. */
export function catalogueEntries(schema: Schema, enablements: readonly PoolEnablementView[]): CatalogueEntry[] {
  const actions: CatalogueEntry[] = (schema.actions ?? []).map((action) => ({
    kind: "action",
    id: action.id,
    name: action.label,
    origin: "forged",
    action,
  }));
  const skills: CatalogueEntry[] = (schema.skills ?? []).map((skill) => ({
    kind: "skill",
    id: skill.id,
    name: skill.name,
    origin: "forged",
    skill,
  }));
  const taken = new Set([...actions, ...skills].map((entry) => `${entry.kind}:${entry.id}`));
  for (const enablement of enablements) {
    if (taken.has(`${enablement.kind}:${enablement.entryId}`)) continue;
    if (enablement.kind === "action") {
      actions.push({ kind: "action", id: enablement.entryId, name: enablement.name, origin: enablement.source, action: enablement.definition });
    } else {
      skills.push({ kind: "skill", id: enablement.entryId, name: enablement.name, origin: enablement.source, skill: enablement.definition });
    }
  }
  return [...skills, ...actions];
}

const OUTCOMES = [
  ["crit_success", "CRIT SUCCESS"],
  ["success", "SUCCESS"],
  ["failure", "FAILURE"],
  ["crit_failure", "CRIT FAILURE"],
] as const;

const SKILL_TYPE_LABEL: Readonly<Record<string, string>> = {
  active: "Active — unlocks and improves actions",
  passive: "Passive — always on once learned",
  toggle: "Toggle — switched on and off, with upkeep while on",
  reaction: "Reaction — fires by itself when its trigger happens",
};

function resourceLabel(schema: Schema, key: string): string {
  const resource =
    schema.resources?.find((candidate) => candidate.id === key) ??
    schema.resources?.find((candidate) => candidate.role === key);
  return resource?.label ?? key;
}

function attributeLabel(schema: Schema, id: string): string {
  return schema.attributes?.find((attribute) => attribute.id === id)?.abbrev ?? id;
}

function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function amounts(schema: Schema, deltas: Record<string, number> | undefined, label = resourceLabel): string[] {
  return Object.entries(deltas ?? {}).map(([key, amount]) => `${signed(amount)} ${label(schema, key)}`);
}

function statusText(schema: Schema, status: StatusSpec): string {
  const parts = [
    status.checkBonus ? `${signed(status.checkBonus)} to checks` : undefined,
    ...amounts(schema, status.attributeBonus, attributeLabel),
    ...amounts(schema, status.resourcePerTurn).map((part) => `${part} per turn`),
  ].filter(Boolean);
  const turns = `${status.durationTurns} turn${status.durationTurns === 1 ? "" : "s"}`;
  return `${status.label} for ${turns}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** One outcome's mechanical consequences in words; empty when the outcome changes nothing. */
export function effectParts(schema: Schema, effect: EffectSpec | undefined): string[] {
  if (!effect) return [];
  const target = [
    ...amounts(schema, effect.resourceDeltaTarget),
    ...amounts(schema, effect.attributeDeltaTarget, attributeLabel),
  ];
  const self = [
    ...amounts(schema, effect.resourceDeltaSelf),
    ...amounts(schema, effect.attributeDeltaSelf, attributeLabel),
  ];
  return [
    target.length ? `Target ${target.join(", ")}${effect.scaleByItemProp ? ` (scaled by item ${effect.scaleByItemProp})` : ""}` : undefined,
    self.length ? `Self ${self.join(", ")}` : undefined,
    effect.statusTarget ? `Target: ${statusText(schema, effect.statusTarget)}` : undefined,
    effect.statusSelf ? `Self: ${statusText(schema, effect.statusSelf)}` : undefined,
    effect.grantItem ? `Gains ${effect.grantItem.qty} × ${effect.grantItem.itemId}` : undefined,
    effect.setFlag ? `Sets ${effect.setFlag.flagId} ${effect.setFlag.value ? "on" : "off"}` : undefined,
  ].filter((part): part is string => Boolean(part));
}

function bonusText(schema: Schema, bonus: Bonus | undefined): string | undefined {
  if (!bonus) return undefined;
  const check = bonus.checkBonus
    ? `${signed(bonus.checkBonus.amount)} to ${bonus.checkBonus.categories?.length ? `${bonus.checkBonus.categories.join(" / ")} checks` : "every check"}`
    : undefined;
  const parts = [check, ...amounts(schema, bonus.attributeBonus, attributeLabel)].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function targetingText(action: ActionDef): string {
  const targeting = action.targeting;
  switch (targeting?.scope) {
    case "self":
      return "The actor only";
    case "multiple":
      return `Up to ${targeting.maxTargets ?? 3} named targets`;
    case "all_allies":
      return "Every ally present";
    case "all_enemies":
      return "Every foe present";
    case "area":
      return `Everyone present${targeting.maxTargets ? ` (up to ${targeting.maxTargets})` : ""}`;
    default:
      return "One target";
  }
}

function nameOf(entries: readonly CatalogueEntry[], kind: CatalogueEntry["kind"], id: string): string {
  return entries.find((entry) => entry.kind === kind && entry.id === id)?.name ?? id;
}

function ActionDetail(props: { schema: Schema; action: ActionDef; entries: readonly CatalogueEntry[] }): JSX.Element {
  const { schema, action, entries } = props;
  const governing = action.governingAttribute
    ? schema.attributes?.find((attribute) => attribute.id === action.governingAttribute)
    : undefined;
  const gates = [
    action.requiresSkill
      ? `Skill: ${nameOf(entries, "skill", action.requiresSkill)}${action.minRank ? ` (${action.minRank}+)` : ""}`
      : undefined,
    action.requiresItemKind ? `Item: a ${action.requiresItemKind.replace(/_/g, " ")}` : undefined,
    action.requiresEquipmentEnabler ? "Equipment that enables it" : undefined,
  ].filter(Boolean);
  const reaction = entries.find((entry) => entry.kind === "skill" && entry.skill.reaction?.actionId === action.id);
  const costs = [
    ...amounts(schema, action.costs?.resources).map((part) => part.replace(/^\+/, "")),
    ...(action.costs?.items ?? []).map((item) => `${item.qty} × ${item.itemId}`),
  ];
  const rows: [string, string][] = [
    ["ROLL", `${action.opposed ? "Opposed" : `DC ${action.dc}`}${governing ? ` · ${governing.abbrev} (${governing.name})` : " · flat"}`],
    ["REQUIRES", gates.length ? gates.join(" · ") : "Anyone may try"],
    ["COSTS", costs.length ? `${costs.join(", ")} per attempt` : "Free"],
    ["COOLDOWN", action.cooldownTurns ? `${action.cooldownTurns} turn${action.cooldownTurns === 1 ? "" : "s"}` : "None"],
    ["TARGETING", targetingText(action)],
    ...(reaction ? ([["FIRES AS", `${reaction.name}'s reaction — never at will`]] as [string, string][]) : []),
  ];
  return (
    <div data-testid={`catalogue-detail-${action.id}`} style={styles.detail}>
      {action.description ? <div style={styles.detailDesc}>{action.description}</div> : null}
      <dl style={styles.facts}>
        {rows.map(([key, value]) => (
          <div key={key} style={styles.factRow}>
            <dt className="mono" style={styles.factKey}>{key}</dt>
            <dd style={styles.factValue}>{value}</dd>
          </div>
        ))}
      </dl>
      <table style={styles.outcomes}>
        <caption className="mono" style={styles.outcomeCaption}>OUTCOME TABLE</caption>
        <tbody>
          {OUTCOMES.map(([outcome, label]) => {
            const effect = action.effects?.[outcome];
            const parts = effectParts(schema, effect);
            return (
              <tr key={outcome}>
                <th scope="row" className="mono" style={styles.outcomeKey}>{label}</th>
                <td style={styles.outcomeValue}>
                  {parts.length ? parts.join(" · ") : "No mechanical change"}
                  {effect?.narrationHint ? <div style={styles.hint}>“{effect.narrationHint}”</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkillDetail(props: { schema: Schema; skill: SkillDef; entries: readonly CatalogueEntry[] }): JSX.Element {
  const { schema, skill, entries } = props;
  const tier = schema.tiers?.find((candidate) => candidate.id === skill.tier);
  const unlocks = entries.filter((entry) => entry.kind === "action" && entry.action.requiresSkill === skill.id);
  const rows: [string, string][] = [
    ["TYPE", SKILL_TYPE_LABEL[skill.skillType ?? "active"] ?? skill.skillType ?? "Active"],
    ["TIER", tier?.label ?? skill.tier],
  ];
  const passive = bonusText(schema, skill.passive);
  if (passive) rows.push(["ALWAYS ON", passive]);
  if (skill.toggle) {
    const upkeep = amounts(schema, skill.toggle.upkeep).map((part) => part.replace(/^\+/, ""));
    rows.push(["WHILE ON", bonusText(schema, skill.toggle.bonus) ?? "No bonus"]);
    rows.push(["UPKEEP", upkeep.length ? `${upkeep.join(", ")} per turn` : "None"]);
  }
  if (skill.reaction) {
    rows.push([
      "REACTION",
      `When ${skill.reaction.trigger === "attacked" ? "attacked" : "damaged"}: ${nameOf(entries, "action", skill.reaction.actionId)}`,
    ]);
  }
  if (unlocks.length) rows.push(["UNLOCKS", unlocks.map((entry) => entry.name).join(", ")]);
  const paths = (skill.unlockPaths ?? []).map((path) => path.method);
  if (paths.length) rows.push(["LEARNED BY", [...new Set(paths)].join(", ")]);
  return (
    <div data-testid={`catalogue-detail-${skill.id}`} style={styles.detail}>
      {skill.description ? <div style={styles.detailDesc}>{skill.description}</div> : null}
      <dl style={styles.facts}>
        {rows.map(([key, value]) => (
          <div key={key} style={styles.factRow}>
            <dt className="mono" style={styles.factKey}>{key}</dt>
            <dd style={styles.factValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RulebookCatalogue(props: { schema: Schema; enablements: readonly PoolEnablementView[] }): JSX.Element {
  const { schema, enablements } = props;
  const entries = useMemo(() => catalogueEntries(schema, enablements), [schema, enablements]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | CatalogueEntry["kind"]>("all");
  const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all");
  const [openId, setOpenId] = useState<string>();

  const categories = [...new Set(entries.flatMap((entry) => (entry.kind === "action" ? [entry.action.category] : [])))];
  const tiers = (schema.tiers ?? []).filter((candidate) =>
    entries.some((entry) => entry.kind === "skill" && entry.skill.tier === candidate.id)
  );
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = entries.filter((entry) => {
    if (kind !== "all" && entry.kind !== kind) return false;
    // Category narrows to actions and tier to skills: each only describes its own kind.
    if (category !== "all" && (entry.kind !== "action" || entry.action.category !== category)) return false;
    if (tier !== "all" && (entry.kind !== "skill" || entry.skill.tier !== tier)) return false;
    const description = entry.kind === "action" ? entry.action.description : entry.skill.description;
    const words = `${entry.name} ${entry.id} ${description ?? ""}`.toLowerCase();
    return tokens.every((token) => words.includes(token));
  });
  const actionCount = entries.filter((entry) => entry.kind === "action").length;

  return (
    <div data-testid="rulebook-catalogue">
      <div style={styles.note}>
        Everything this story runs on: {entries.length - actionCount} skill{entries.length - actionCount === 1 ? "" : "s"} and{" "}
        {actionCount} action{actionCount === 1 ? "" : "s"}, forged with the story or enabled from the universal pool.
      </div>
      <div style={styles.filters}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search this story's actions and skills…"
          aria-label="Search the rulebook catalogue"
          style={styles.search}
        />
        <select aria-label="Filter by kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} style={styles.select}>
          <option value="all">All kinds</option>
          <option value="action">Actions</option>
          <option value="skill">Skills</option>
        </select>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} style={styles.select}>
          <option value="all">All categories</option>
          {categories.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
        <select aria-label="Filter by tier" value={tier} onChange={(event) => setTier(event.target.value)} style={styles.select}>
          <option value="all">All tiers</option>
          {tiers.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
      </div>
      {entries.length === 0 ? (
        <div style={styles.note}>This story defines no actions or skills.</div>
      ) : visible.length === 0 ? (
        <div style={styles.note}>Nothing in this story's catalogue matches.</div>
      ) : (
        <ul style={styles.list}>
          {visible.map((entry) => {
            const key = `${entry.kind}:${entry.id}`;
            const open = openId === key;
            const meta =
              entry.kind === "action"
                ? `${entry.action.category} · ${entry.action.opposed ? "OPPOSED" : `DC ${entry.action.dc}`}`
                : `${entry.skill.skillType ?? "active"} skill · ${schema.tiers?.find((candidate) => candidate.id === entry.skill.tier)?.label ?? entry.skill.tier}`;
            return (
              <li key={key} style={styles.item}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? undefined : key)}
                  style={styles.row}
                >
                  <span aria-hidden="true" className="mono" style={styles.chevron}>{open ? "▾" : "▸"}</span>
                  <span style={styles.name}>{entry.name}</span>
                  <span className="mono" style={styles.meta}>{meta}</span>
                  <span className="mono" style={entry.origin === "forged" ? styles.origin : styles.originPool}>
                    {ORIGIN_LABEL[entry.origin]}
                  </span>
                </button>
                {open ? (
                  entry.kind === "action" ? (
                    <ActionDetail schema={schema} action={entry.action} entries={entries} />
                  ) : (
                    <SkillDetail schema={schema} skill={entry.skill} entries={entries} />
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  note: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 12 },
  filters: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  search: {
    flex: "1 1 220px",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    color: "var(--prose)",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "8px 12px",
    outline: "none",
  },
  select: {
    fontFamily: "var(--font-ui)",
    fontSize: 12.5,
    color: "var(--ui-text)",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "7px 10px",
  },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  item: { background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)" },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: 0,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "var(--font-ui)",
  },
  chevron: { fontSize: 11, color: "var(--muted)", width: 10 },
  name: { fontSize: 14, color: "var(--ui-text)" },
  meta: { fontSize: 11, color: "var(--teal)" },
  origin: { marginLeft: "auto", fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" },
  originPool: { marginLeft: "auto", fontSize: 10, color: "var(--brass)", letterSpacing: "0.06em" },
  detail: { padding: "2px 16px 14px 34px" },
  detailDesc: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 10 },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 16px", margin: "0 0 10px" },
  factRow: { display: "flex", flexDirection: "column", gap: 2 },
  factKey: { fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)" },
  factValue: { margin: 0, fontSize: 12.5, color: "var(--ui-text)" },
  outcomes: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  outcomeCaption: { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)", paddingBottom: 4 },
  outcomeKey: { textAlign: "left", verticalAlign: "top", fontSize: 10.5, color: "var(--teal)", padding: "5px 12px 5px 0", whiteSpace: "nowrap", borderTop: "1px solid var(--hairline-soft)" },
  outcomeValue: { color: "var(--ui-text)", padding: "5px 0", borderTop: "1px solid var(--hairline-soft)" },
  hint: { color: "var(--muted)", fontStyle: "italic", marginTop: 2 },
};
