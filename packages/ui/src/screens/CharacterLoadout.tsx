import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { useRoute } from "../app/router.js";
import { getBridge } from "../bridge/core.js";
import type {
  CharacterInventoryView,
  EquipmentSlot,
  ItemDefinition,
} from "../bridge/core.js";
import { Button, EmptyState, EQUIPMENT_TIER_META, InlineNotice, type EquipmentTier } from "../components/index.js";

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "primary",
  "secondary",
  "head",
  "body",
  "utility",
  "accessory_1",
  "accessory_2",
] as const;

interface LoadoutItem {
  instanceId: string;
  name: string;
  tier: EquipmentTier;
  quantity: number;
  description: string;
  effects: Array<{ label: string; active: boolean; reason?: string }>;
  eligibleSlots: EquipmentSlot[];
  equippedSlots: EquipmentSlot[];
  twoHanded?: boolean;
  unique?: boolean;
  recentlyGained?: boolean;
  requirementMet?: boolean;
  requirement?: string;
}

interface LoadoutData {
  characterId: string;
  characterName: string;
  alive: boolean;
  items: LoadoutItem[];
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "nostats" }
  | { phase: "ready"; data: LoadoutData; integrated: boolean };

export function CharacterLoadout(props: ScreenProps): JSX.Element {
  const { params, navigate } = useRoute();
  const storyId = props.storyId ?? params.storyId;
  const characterId = params.characterId;
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [selectedId, setSelectedId] = useState<string>();
  const [compareSlot, setCompareSlot] = useState<EquipmentSlot>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const load = async (): Promise<void> => {
    if (!storyId || !characterId) {
      setState({ phase: "error", message: "Open a character profile before viewing equipment." });
      return;
    }
    setState({ phase: "loading" });
    try {
      const bridge = getBridge();
      const story = await bridge.getStory(storyId);
      if (story?.schema.statMode !== "full") {
        setState({ phase: "nostats" });
        return;
      }
      const [inventory, dossier] = await Promise.all([
        bridge.getCharacterInventory(characterId),
        bridge.getCharacterDossier(storyId, characterId),
      ]);
      if (!dossier) throw new Error("This character is not in the current story.");
      setState({
        phase: "ready",
        integrated: true,
        data: {
          characterId,
          characterName: dossier.identity.name,
          alive: dossier.sheet.alive,
          items: mapInventory(inventory, dossier.sheet.skills.map((skill) => skill.skillId)),
        },
      });
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "Couldn't load this character's equipment." });
    }
  };

  useEffect(() => { void load(); }, [storyId, characterId]);

  const selected = state.phase === "ready" ? state.data.items.find((item) => item.instanceId === selectedId) : undefined;
  const bySlot = useMemo(() => {
    const map = new Map<EquipmentSlot, LoadoutItem>();
    if (state.phase === "ready") {
      for (const item of state.data.items) for (const slot of item.equippedSlots) map.set(slot, item);
    }
    return map;
  }, [state]);

  const equip = async (item: LoadoutItem, slot: EquipmentSlot): Promise<void> => {
    if (!storyId || !characterId) return;
    const current = bySlot.get(slot);
    if (current && current.instanceId !== item.instanceId && compareSlot !== slot) {
      setCompareSlot(slot);
      return;
    }
    setBusy(true);
    setActionError(undefined);
    try {
      await getBridge().equipItem(characterId, item.instanceId, slot);
      setCompareSlot(undefined);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't equip that item.");
    } finally {
      setBusy(false);
    }
  };

  const unequip = async (slot: EquipmentSlot): Promise<void> => {
    if (!characterId) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await getBridge().unequipSlot(characterId, slot);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't unequip that item.");
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === "loading") return <div style={center} aria-busy="true">Loading loadout…</div>;
  if (state.phase === "nostats") return <div style={page}><EmptyState glyph="◇" title="No equipment sheet" body="No Stats stories keep mechanics hidden. Inventory and equipped effects do not apply." /></div>;
  if (state.phase === "error") return <div style={page}><InlineNotice severity="error" title="Couldn't open this loadout" detail={state.message} /></div>;

  const inventory = state.data.items.filter((item) => item.equippedSlots.length === 0);
  const fallen = !state.data.alive;
  return (
    <div style={page} data-screen="character-loadout" data-fallen={fallen || undefined}>
      <button type="button" onClick={() => navigate("dossier", { storyId, characterId })} style={back}>← Full profile</button>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={title}>{state.data.characterName}'s loadout</h1>
        <span style={systemLabel}>{fallen ? "FALLEN · EFFECTS INACTIVE" : "7 UNIVERSAL SLOTS"}</span>
      </header>
      <p style={lede}>Only equipped items grant effects. Two-handed equipment occupies both Primary and Secondary; stored items never appear active.</p>
      {!state.integrated ? <InlineNotice severity="info" title="No equipment assigned yet" detail="Items appear here only after the DM Ruling grants them during play. Stories no longer pre-generate an item catalog." /> : null}
      {actionError ? <div style={{ marginTop: 12 }}><InlineNotice severity="error" title="Equipment change failed" detail={actionError} /></div> : null}

      <div style={layout}>
        <section>
          <div style={sectionHead}>EQUIPPED LOADOUT · {bySlot.size}/7 OCCUPIED</div>
          <div style={slotGrid}>
            {EQUIPMENT_SLOTS.map((slot) => {
              const item = bySlot.get(slot);
              const occupiedByTwoHanded = item?.twoHanded && slot === "secondary";
              return (
                <article key={slot} style={{ ...slotCard, ...(item ? { borderColor: EQUIPMENT_TIER_META[item.tier].color } : {}) }}>
                  <div style={slotLabel}>{displaySlot(slot).toUpperCase()}</div>
                  {item ? (
                    <>
                      <button type="button" onClick={() => setSelectedId(item.instanceId)} style={itemButton}>
                        <span style={{ color: EQUIPMENT_TIER_META[item.tier].color }}>{EQUIPMENT_TIER_META[item.tier].glyph}</span>
                        <strong>{item.name}</strong>
                      </button>
                      <div style={{ color: "var(--muted)", fontSize: 10.5, marginTop: 4 }}>{occupiedByTwoHanded ? "Occupied by two-handed Primary" : item.tier}</div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void unequip(slot)}
                        style={{ ...back, marginTop: 7, marginBottom: 0, fontSize: 10.5 }}
                      >
                        Unequip
                      </button>
                    </>
                  ) : <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>Empty</div>}
                </article>
              );
            })}
          </div>
        </section>

        <aside style={detailPanel}>
          {selected ? <ItemDetail item={selected} fallen={fallen} busy={busy} onEquip={(slot) => void equip(selected, slot)} compareSlot={compareSlot} current={compareSlot ? bySlot.get(compareSlot) : undefined} /> :
            <EmptyState glyph="❖" title="Select an item" body="Compare requirements, eligible slots, and active effects before replacing anything." />}
        </aside>
      </div>

      <section style={{ marginTop: 28 }}>
        <div style={sectionHead}>INVENTORY · UNEQUIPPED ITEMS</div>
        {inventory.length === 0 ? <div style={emptyInventory}>No equippable items are stored. Loot appears here only after a validated DM Ruling grants it.</div> :
          <div style={inventoryGrid}>{inventory.map((item) => (
            <button key={item.instanceId} type="button" onClick={() => setSelectedId(item.instanceId)} style={{ ...inventoryCard, ...(selectedId === item.instanceId ? { borderColor: "var(--teal)" } : {}) }}>
              <span style={{ color: EQUIPMENT_TIER_META[item.tier].color }}>{EQUIPMENT_TIER_META[item.tier].glyph}</span>
              <span><strong style={{ display: "block", color: "var(--ui-text)" }}>{item.name}</strong><small style={{ color: "var(--muted)" }}>{item.tier} · {item.quantity} owned</small></span>
              {item.recentlyGained ? <span style={recent}>NEW</span> : null}
            </button>
          ))}</div>}
      </section>
    </div>
  );
}

function ItemDetail(props: { item: LoadoutItem; fallen: boolean; busy: boolean; compareSlot?: EquipmentSlot; current?: LoadoutItem; onEquip: (slot: EquipmentSlot) => void }): JSX.Element {
  const { item } = props;
  const tier = EQUIPMENT_TIER_META[item.tier];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ color: tier.color, fontSize: 20 }}>{tier.glyph}</span><h2 style={{ ...title, fontSize: 22 }}>{item.name}</h2>
        <span style={{ ...systemLabel, color: tier.color }}>{item.tier.toUpperCase()}</span>
      </div>
      <p style={{ ...lede, marginTop: 8 }}>{item.description}</p>
      {item.twoHanded ? <div style={notice}>Two-handed · occupies Primary + Secondary</div> : null}
      {item.unique ? <div style={notice}>Unique · only one copy can be equipped</div> : null}
      {item.requirement && !item.requirementMet ? <InlineNotice severity="warn" title="Requirement not met" detail={`${item.requirement}. It can remain stored, but grants no effects until equipped legally.`} /> : null}
      <div style={{ ...sectionHead, marginTop: 15 }}>EFFECTS</div>
      <div style={{ display: "grid", gap: 7 }}>{item.effects.map((effect) => (
        <div key={effect.label} style={{ padding: "8px 10px", background: "var(--bg2-card)", border: "1px solid var(--hairline)", borderRadius: 7 }}>
          <span style={{ color: props.fallen || !effect.active ? "var(--muted)" : "var(--success)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{props.fallen ? "INACTIVE" : effect.active ? "ACTIVE" : "CONDITIONAL"}</span>
          <div style={{ color: "var(--secondary)", fontSize: 12, marginTop: 3 }}>{effect.label}{effect.reason ? ` · ${effect.reason}` : ""}</div>
        </div>
      ))}</div>
      {props.compareSlot && props.current ? <div style={{ marginTop: 12 }}><InlineNotice severity="warn" title={`Replace ${props.current.name}?`} detail={`Equipping here removes its effects. Nothing is silently unequipped.`} /></div> : null}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
        {item.eligibleSlots.map((slot) => <Button key={slot} variant="system" disabled={props.busy || !item.requirementMet || props.fallen} onClick={() => props.onEquip(slot)}>
          {props.compareSlot === slot ? `Confirm replace in ${displaySlot(slot)}` : `Equip to ${displaySlot(slot)}`}
        </Button>)}
      </div>
    </>
  );
}

function displaySlot(slot: EquipmentSlot): string {
  return slot === "accessory_1"
    ? "Accessory I"
    : slot === "accessory_2"
      ? "Accessory II"
      : slot[0]!.toUpperCase() + slot.slice(1);
}

function effectLabel(effect: ItemDefinition["effects"][number]): string {
  switch (effect.type) {
    case "attribute_score":
      return `${effect.attributeId} score ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
    case "skill_check":
      return `${effect.skillId} checks ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
    case "action_check":
      return `${effect.actionId} checks ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
    case "resource_capacity":
      return `${effect.resourceId} capacity ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
    case "action_enable":
      return `Enables action: ${effect.actionId}`;
    case "skill_enable":
      return `Enables ${effect.skillId} at ${effect.rank}`;
    case "lifestyle":
      return effect.description;
  }
}

function displayTier(tier: ItemDefinition["tier"]): EquipmentTier {
  return (tier[0]!.toUpperCase() + tier.slice(1)) as EquipmentTier;
}

function mapInventory(
  inventory: CharacterInventoryView,
  learnedSkillIds: readonly string[]
): LoadoutItem[] {
  const definitionById = new Map(
    inventory.definitions.map((definition) => [definition.id, definition])
  );
  return inventory.instances.flatMap((instance) => {
    const definition = definitionById.get(instance.definitionId);
    if (!definition) return [];
    const equipped = inventory.assignments.some(
      (assignment) => assignment.itemInstanceId === instance.id
    );
    return [{
      instanceId: instance.id,
      name: definition.name,
      tier: displayTier(definition.tier),
      quantity: instance.quantity,
      description: definition.description,
      effects: definition.effects.map((effect) => ({
        label: effectLabel(effect),
        active: equipped,
        ...("condition" in effect && effect.condition
          ? { reason: "Active only while its stated condition holds." }
          : {}),
      })),
      eligibleSlots: definition.slotCompatibility,
      equippedSlots: inventory.assignments
        .filter((assignment) => assignment.itemInstanceId === instance.id)
        .map((assignment) => assignment.slot),
      twoHanded: definition.handsRequired === 2,
      unique: definition.unique,
      recentlyGained: Date.now() - Date.parse(instance.acquiredAt) < 10 * 60 * 1000,
      requirementMet:
        !definition.requiresSkill || learnedSkillIds.includes(definition.requiresSkill),
      ...(definition.requiresSkill
        ? { requirement: `Requires ${definition.requiresSkill}` }
        : {}),
    }];
  });
}

const page: CSSProperties = { padding: "26px 36px 70px", maxWidth: 1120, margin: "0 auto" };
const center: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--muted)" };
const back: CSSProperties = { background: "transparent", border: 0, color: "var(--secondary)", cursor: "pointer", padding: 0, marginBottom: 16 };
const title: CSSProperties = { margin: 0, color: "var(--prose)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 32 };
const lede: CSSProperties = { color: "var(--secondary)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 720 };
const systemLabel: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em" };
const layout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(290px, .75fr)", gap: 22, alignItems: "start", marginTop: 24 };
const sectionHead: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", marginBottom: 10 };
const slotGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9 };
const slotCard: CSSProperties = { minHeight: 80, padding: "11px 12px", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 9 };
const slotLabel: CSSProperties = { color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".08em" };
const itemButton: CSSProperties = { display: "flex", alignItems: "center", gap: 7, background: "transparent", border: 0, color: "var(--ui-text)", cursor: "pointer", padding: "8px 0 0", textAlign: "left" };
const detailPanel: CSSProperties = { position: "sticky", top: 14, padding: "16px", background: "var(--bg1-panel)", border: "1px solid var(--teal-dim)", borderRadius: "var(--radius-card)", minHeight: 220 };
const inventoryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 9 };
const inventoryCard: CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 8, textAlign: "left", cursor: "pointer" };
const emptyInventory: CSSProperties = { color: "var(--muted)", fontSize: 12.5, padding: 18, border: "1px dashed var(--hairline)", borderRadius: 8 };
const recent: CSSProperties = { marginLeft: "auto", color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 9 };
const notice: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginBottom: 7 };

export default CharacterLoadout;
