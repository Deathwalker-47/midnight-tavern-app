import type { CSSProperties } from "react";
import { Button } from "./Button.js";

export type EquipmentTier = "Common" | "Uncommon" | "Rare" | "Legendary" | "Mythical";
export interface LootAwardItem {
  id: string;
  name: string;
  tier: EquipmentTier;
  quantity: number;
  definition: string;
  effects: string[];
  source: string;
  requirement?: string;
  eligibleSlots?: string[];
}

export const EQUIPMENT_TIER_META: Record<EquipmentTier, { glyph: string; color: string }> = {
  Common: { glyph: "◇", color: "var(--muted)" },
  Uncommon: { glyph: "◈", color: "var(--success)" },
  Rare: { glyph: "❖", color: "var(--teal)" },
  Legendary: { glyph: "★", color: "var(--brass)" },
  Mythical: { glyph: "✷", color: "var(--failure)" },
};

export function LootAward(props: {
  items: LootAwardItem[];
  onEquip?: (item: LootAwardItem) => void;
  onKeep?: (item: LootAwardItem) => void;
  onView?: (item: LootAwardItem) => void;
  slotConflict?: string;
}): JSX.Element | null {
  if (props.items.length === 0) return null;
  return (
    <section aria-label="Loot award" style={{ display: "grid", gap: 9, marginTop: 10 }}>
      {props.items.map((item) => {
        const tier = EQUIPMENT_TIER_META[item.tier];
        return (
          <article key={item.id} style={{
            padding: "11px 12px",
            background: item.tier === "Mythical" ? "color-mix(in srgb, var(--failure) 7%, var(--bg1-panel))" : "var(--bg1-panel)",
            border: `1px solid color-mix(in srgb, ${tier.color} 44%, var(--hairline))`,
            borderRadius: 8,
            boxShadow: item.tier === "Mythical" ? `0 0 18px color-mix(in srgb, ${tier.color} 18%, transparent)` : undefined,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden="true" style={{ color: tier.color, fontSize: 16 }}>{tier.glyph}</span>
              <strong style={{ color: "var(--ui-text)", fontSize: 13.5 }}>{item.name}</strong>
              <span style={{ color: tier.color, fontFamily: "var(--font-mono)", fontSize: 9 }}>{item.tier.toUpperCase()}</span>
              {item.quantity > 1 ? <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>×{item.quantity}</span> : null}
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--secondary)", fontSize: 12, lineHeight: 1.5 }}>{item.definition}</p>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55 }}>
              {item.effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
            <div style={{ marginTop: 7, color: "var(--muted)", fontSize: 10.5 }}>Source: {item.source}{item.requirement ? ` · ${item.requirement}` : ""}</div>
            {props.slotConflict ? <div role="alert" style={{ marginTop: 7, color: "var(--brass)", fontSize: 11.5 }}>{props.slotConflict}</div> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
              {props.onEquip && item.eligibleSlots?.length ? <Button variant="system" onClick={() => props.onEquip?.(item)}>Equip now</Button> : null}
              {props.onKeep ? <Button variant="secondary" onClick={() => props.onKeep?.(item)}>Keep in inventory</Button> : null}
              {props.onView ? <Button variant="ghost" onClick={() => props.onView?.(item)}>View item</Button> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

export const lootAwardPanelStyle: CSSProperties = { fontFamily: "var(--font-ui)" };
