/**
 * DesignSystem — a LIVE component gallery / dev reference route. It renders every component from
 * `../components` in its variants and states, mirroring `Design/handoff/screens/DesignSystem.dc.html`.
 * No store or bridge wiring: every component is fed static sample props. This doubles as a visual
 * smoke test — if any component throws on its documented props, this screen surfaces it.
 *
 * Sections mirror the prototype: color tokens, type registers, the RulingArtifact in all eight
 * variants, mastery & resources, party strip (default + narrow + fallen), living cards, story
 * shelf & timeline, providers & roles (KeyField's four states), chips/status/notices, buttons,
 * and the remaining feedback atoms. Tokens only (the color section reads the actual CSS variables
 * from :root so the swatches stay honest). Reduced-motion is honored by each component.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { LivingCardView as CoreLivingCardView } from "../bridge/core";
import {
  ArcDoc,
  Button,
  ChapterCard,
  Chip,
  ConfirmDialog,
  DeadMarker,
  EmptyState,
  ForgingInterstitial,
  InlineNotice,
  KeyField,
  LivingCard,
  LivingCardView,
  MasteryPips,
  ModelStatusChip,
  PartyStrip,
  PremiseInput,
  ProviderCard,
  RelationshipRow,
  ResourceBar,
  RoleMatrixRow,
  SamplerPanel,
  MessageActions,
  LorebookLibraryCard,
  AttachRow,
  PersonaPickerRow,
  BlueprintForm,
  RulingArtifact,
  StoryCard,
  ThinkingIndicator,
  Toast,
} from "../components";
import type { RulingArtifactVariant, RulingRoll, SamplerField } from "../components";
import type { Blueprint } from "../bridge/core";

interface ScreenProps {
  storyId?: string;
}

/** Color groups mirror the prototype; hexes are shown as labels only — the swatch fills from the token var. */
const COLOR_GROUPS: { name: string; swatches: { label: string; token: string; hex: string }[] }[] = [
  {
    name: "GROUNDS",
    swatches: [
      { label: "Ground", token: "--bg0-ground", hex: "#14100C" },
      { label: "Panel", token: "--bg1-panel", hex: "#1B1611" },
      { label: "Card", token: "--bg2-card", hex: "#231C15" },
      { label: "Raised", token: "--bg3-raised", hex: "#2C241B" },
      { label: "Hairline", token: "--hairline", hex: "#382E21" },
    ],
  },
  {
    name: "STORY REGISTER",
    swatches: [
      { label: "Brass", token: "--brass", hex: "#D9A648" },
      { label: "Brass bright", token: "--brass-bright", hex: "#F2C56B" },
      { label: "Prose", token: "--prose", hex: "#EADCBE" },
      { label: "Secondary", token: "--secondary", hex: "#A08D6C" },
      { label: "Muted", token: "--muted", hex: "#6E5F49" },
    ],
  },
  {
    name: "SYSTEM REGISTER",
    swatches: [
      { label: "Teal", token: "--teal", hex: "#74B8AE" },
      { label: "Teal dim", token: "--teal-dim", hex: "#4E827B" },
      { label: "Success", token: "--success", hex: "#8FB573" },
      { label: "Failure", token: "--failure", hex: "#C96F57" },
      { label: "Crit gold", token: "--crit-gold", hex: "#F5CE6E" },
      { label: "Crit crimson", token: "--crit-crimson", hex: "#B5442F" },
      { label: "Dead", token: "--dead", hex: "#8A8175" },
    ],
  },
];

/** All eight RulingArtifact variants with honest sample rolls. */
const RULINGS: { variant: RulingArtifactVariant; props: Record<string, unknown> }[] = [
  {
    variant: "success",
    props: { roll: { title: "Persuade the warden", outcome: "success", d20: 14, modifier: 3, total: 17, dc: 15 } as RulingRoll },
  },
  {
    variant: "failure",
    props: { roll: { title: "Sneak past the sentry", outcome: "failure", d20: 6, modifier: 1, total: 7, dc: 13 } as RulingRoll },
  },
  {
    variant: "crit-success",
    props: { roll: { title: "Finishing blow", outcome: "crit-success", d20: 20, modifier: 3, total: 23, dc: 13 } as RulingRoll, effectLine: "Blade Adept reaches 5/5 — advances to EXPERT (+5)" },
  },
  {
    variant: "crit-failure",
    props: { roll: { title: "Vault the chasm", outcome: "crit-failure", d20: 1, modifier: 2, total: 3, dc: 15 } as RulingRoll },
  },
  {
    variant: "opposed",
    props: {
      roll: {
        title: "Stealth vs perception",
        outcome: "success",
        d20: 16,
        modifier: 0,
        total: 16,
        dc: 12,
        opposed: { attacker: "Stealth 16", defender: "Perception 12" },
      } as RulingRoll,
    },
  },
  {
    variant: "npc",
    props: { roll: { title: "Wren picks the lock", outcome: "success", d20: 16, modifier: 3, total: 19, dc: 15 } as RulingRoll, effectLine: "Lockpicking 3/5 → 4/5" },
  },
  {
    variant: "stacked",
    props: {
      rolls: [
        { title: "Grave-wight strikes", outcome: "success", d20: 15, modifier: 0, total: 15, dc: 14 },
        { title: "Kestrel ripostes", outcome: "success", d20: 12, modifier: 4, total: 16, dc: 13 },
      ] as [RulingRoll, RulingRoll],
      resultLine: "The wight lands a blow (−5 HP) before Kestrel answers in kind.",
    },
  },
  {
    variant: "denied",
    props: { reason: "Requires Lockpicking — not learned.", hint: "Learn the skill in play, or find another way in." },
  },
];

/** A sample player living card (full mechanical + soft projection). */
function samplePlayerCard(): CoreLivingCardView {
  return {
    characterId: "kestrel",
    name: "Kestrel Vane",
    isPlayer: true,
    alive: true,
    resources: [
      { id: "hp", label: "Health", current: 19, max: 24, playerVisible: true },
      { id: "stamina", label: "Stamina", current: 10, max: 14, playerVisible: true },
    ],
    inventory: [
      { itemId: "blade", name: "Courier's blade", qty: 1 },
      { itemId: "marks", name: "Silver marks", qty: 12 },
    ],
    skills: [
      { skillId: "blade", name: "Blade", rank: "adept" },
      { skillId: "persuasion", name: "Persuasion", rank: "novice" },
    ],
    soft: {
      tier: "primary",
      traits: ["Steady hands", "Reluctant hero", "Blade-trained"],
      likes: ["Fair contracts"],
      dislikes: ["Debtors"],
      mood: "wary",
      relationships: [{ toCharacterId: "wren", trust: 0.4, power: -0.2, feeling: "trusts, warily" }],
      recentObservations: ["Crossed the grey lent at dusk.", "Paid the toll in silver."],
    },
  };
}

/** A sample fallen NPC card (desaturated, HP pinned to 0). */
function sampleFallenCard(): CoreLivingCardView {
  return {
    characterId: "aldric",
    name: "Brother Aldric",
    isPlayer: false,
    alive: false,
    resources: [{ id: "hp", label: "Health", current: 0, max: 18, playerVisible: true }],
    inventory: [],
    skills: [{ skillId: "liturgy", name: "Liturgy", rank: "expert" }],
    soft: {
      tier: "secondary",
      traits: ["Devout", "Weary"],
      likes: [],
      dislikes: [],
      relationships: [],
      recentObservations: [],
    },
  };
}

/** Demo sampler profile for the SamplerPanel specimen — one field marked unsupported. */
const DEMO_SAMPLER_FIELDS: SamplerField[] = [
  { key: "temperature", label: "Temperature", value: 0.8, min: 0, max: 2, step: 0.05 },
  { key: "topP", label: "Top-p", value: 0.95, min: 0, max: 1, step: 0.05 },
  { key: "topK", label: "Top-k", value: 40, min: 0, max: 100, step: 1 },
  { key: "presencePenalty", label: "Presence penalty", value: 0.3, min: -2, max: 2, step: 0.1 },
  { key: "frequencyPenalty", label: "Frequency penalty", value: 0.3, min: -2, max: 2, step: 0.1 },
  { key: "repetitionPenalty", label: "Repetition penalty", value: 1.0, min: 0, max: 2, step: 0.05, supported: false },
  { key: "maxTokens", label: "Max tokens", value: 1200, min: 100, max: 4000, step: 100 },
];

/** Demo blueprint for the BlueprintForm specimen. */
const DEMO_BLUEPRINT: Blueprint = {
  name: "Kestrel Vane",
  description: "A courier of the Vale Road with a soldier's bearing and a debtor's caution.",
  personality: "Wary, dry-humored, fiercely loyal once won.",
  scenario: "An ash-buried mountain road where pilgrims vanish near a ruined monastery.",
  firstMessage: "The gate is cold enough to sting…",
  alternateGreetings: ["Snow again, and the road gone white to the treeline."],
  tags: ["dark fantasy", "survival"],
};

export function DesignSystem(_props: ScreenProps): JSX.Element {
  const playerCard = useMemo(samplePlayerCard, []);  const fallenCard = useMemo(sampleFallenCard, []);

  const modelOptions = [
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  ];

  return (
    <div style={styles.screen} data-testid="designsystem-screen">
      <div style={styles.intro}>
        <div style={styles.eyebrow}>FOUNDATIONS &amp; COMPONENTS</div>
        <h1 style={styles.h1}>Lamplight over a game table</h1>
        <p style={styles.lede}>
          Two registers, held apart on purpose.{" "}
          <b style={{ color: "var(--brass)" }}>Story</b> is warm, serif, brass — everything the
          fiction touches. <b style={{ color: "var(--teal)" }}>System</b> is cool, mono, teal —
          dice, DCs, verdicts, ledgers. They never trade places.
        </p>
      </div>

      {/* ── COLOR ── */}
      <Section id="color" title="Color">
        {COLOR_GROUPS.map((group) => (
          <div key={group.name} style={{ marginBottom: 18 }}>
            <div style={styles.groupLabel}>{group.name}</div>
            <div style={styles.swatchRow}>
              {group.swatches.map((sw) => (
                <div key={sw.token} style={{ width: 120 }}>
                  <div style={{ ...styles.swatchChip, background: `var(${sw.token})` }} />
                  <div style={styles.swatchLabel}>{sw.label}</div>
                  <div style={styles.swatchHex}>{sw.hex}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ── TYPE ── */}
      <Section id="type" title="Type">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TypeRow label="Display · Cormorant">
            <span style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--prose)" }}>
              Under the Ossuary
            </span>
          </TypeRow>
          <TypeRow label="Prose · Source Serif">
            <span style={{ fontFamily: "var(--font-prose)", fontSize: 17, lineHeight: 1.75, color: "var(--prose)" }}>
              The gate is cold enough to sting. Beyond the iron you hear the slow drip of meltwater
              and, beneath it, a dry chittering.
            </span>
          </TypeRow>
          <TypeRow label="UI · IBM Plex Sans">
            <span style={{ fontSize: 14, color: "var(--ui-text)" }}>
              Buttons, labels, forms — the interface voice.
            </span>
          </TypeRow>
          <TypeRow label="System · Plex Mono">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--teal)" }}>
              d20 14 + 3 = 17 · vs DC 15
            </span>
          </TypeRow>
        </div>
      </Section>

      {/* ── RULINGS ── */}
      <Section id="rulings" title="Ruling artifact">
        <p style={styles.sectionNote}>
          The signature component. Mounts mid-prose: the die settles, the math fades in, the total
          counts up, the verdict stamps. Rendered here with animation off for a stable gallery.
        </p>
        <div style={styles.rulingGrid}>
          {RULINGS.map((r) => (
            <RulingArtifact key={r.variant} variant={r.variant} animate={false} {...r.props} />
          ))}
        </div>
      </Section>

      {/* ── MASTERY + RESOURCE ── */}
      <Section id="mechanics" title="Mastery &amp; resources">
        <div style={styles.twoCol}>
          <div style={styles.panel}>
            <div style={styles.panelLabel}>MASTERY PIPS · 4 RANKS</div>
            {(["novice", "adept", "expert", "master"] as const).map((rank) => (
              <div key={rank} style={styles.mechRow}>
                <span style={{ fontSize: 13, color: "var(--ui-text)", textTransform: "capitalize" }}>{rank}</span>
                <MasteryPips rank={rank} showModifier animate={false} recentlyAdvanced={rank === "adept"} />
              </div>
            ))}
          </div>
          <div style={styles.panel}>
            <div style={styles.panelLabel}>RESOURCE BARS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ResourceBar label="Health" current={19} max={24} animate={false} />
              <ResourceBar label="Health · wounded" current={5} max={24} animate={false} />
              <ResourceBar label="Stamina" current={10} max={14} animate={false} />
            </div>
          </div>
        </div>
      </Section>

      {/* ── PARTY STRIP ── */}
      <Section id="party" title="Party strip">
        <p style={styles.sectionNote}>
          The present cast atop the story stream — avatar, name, player-visible HP, mood glyph.
          Fallen members use the fallen treatment; collapses to avatars-only when narrow.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PartyStrip
            members={[
              { id: "kestrel", name: "Kestrel", isPlayer: true, initials: "KV", hpFraction: 0.79, mood: "◑" },
              { id: "wren", name: "Wren", isPlayer: false, initials: "WC", hpFraction: 0.44, mood: "◇" },
              { id: "aldric", name: "Aldric", isPlayer: false, initials: "BA", alive: false },
            ]}
          />
          <div>
            <div style={styles.miniLabel}>COLLAPSED (NARROW)</div>
            <PartyStrip
              collapsed
              members={[
                { id: "kestrel", name: "Kestrel", isPlayer: true, initials: "KV", hpFraction: 0.79 },
                { id: "wren", name: "Wren", isPlayer: false, initials: "WC", hpFraction: 0.44 },
                { id: "aldric", name: "Aldric", isPlayer: false, initials: "BA", alive: false },
              ]}
            />
          </div>
        </div>
      </Section>

      {/* ── LIVING CARDS ── */}
      <Section id="cards" title="Living card">
        <p style={styles.sectionNote}>
          Two densities: the compact drawer form and the full Characters-page form. Player cards
          accent brass; others teal; fallen desaturates.
        </p>
        <div style={styles.twoCol}>
          <div>
            <div style={styles.miniLabel}>COMPACT (DRAWER)</div>
            <LivingCard card={playerCard} recentlyAdvancedSkillIds={["blade"]} animate={false} />
          </div>
          <div>
            <div style={styles.miniLabel}>FULL + FALLEN</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <LivingCardView card={playerCard} recentlyAdvancedSkillIds={["blade"]} resolveName={(id) => (id === "wren" ? "Wren" : id)} animate={false} />
              <LivingCardView card={fallenCard} animate={false} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>RELATIONSHIP ROW · DEAD MARKER</div>
          <div style={styles.panel}>
            <RelationshipRow name="Wren Colvers" trust={0.4} power={-0.2} feeling="trusts, warily" />
            <RelationshipRow name="Prior Voss" trust={-0.7} power={0.5} feeling="fears" />
            <div style={{ marginTop: 8 }}>
              <DeadMarker withGlyph />
            </div>
          </div>
        </div>
      </Section>

      {/* ── SHELF + TIMELINE ── */}
      <Section id="shelf" title="Story shelf &amp; timeline">
        <div style={styles.twoCol}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={styles.miniLabel}>STORY CARDS</div>
            <StoryCard
              title="Embers of the Ashen Vale"
              blurb="A courier crosses the grey lent to a monastery that will not stay buried."
              meta="CH 4 · 82 messages"
              spineColor="var(--brass)"
              onOpen={() => {}}
            />
            <StoryCard
              title="The Tidewright's Bargain"
              blurb="Maps of places that do not want to be mapped."
              meta="CH 1 · 12 messages"
              spineColor="var(--teal)"
              onOpen={() => {}}
            />
          </div>
          <div>
            <div style={styles.miniLabel}>CHAPTER TIMELINE</div>
            <div style={styles.panel}>
              <ChapterCard index={1} title="The grey lent" summary="Kestrel takes the toll road." status="summarized" range="msgs 1–20" animate={false} />
              <ChapterCard index={2} title="The reliquary gate" summary="Something has forced it open." status="in-progress" range="msgs 21–" animate={false} />
              <ChapterCard index={3} title="Below the cloister" status="pending" animate={false} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>ARC DOCUMENT</div>
          <ArcDoc
            title="Under the Ossuary"
            index={1}
            range="Chapters 1–3"
            sections={[
              { heading: "What happened", body: "Kestrel crossed the grey lent to Cindermoor, where the Ember Choir's last voice keeps a failing vigil over the ossuary dead." },
              { heading: "Threads", items: ["The reliquary gate stands forced.", "Prior Voss hunts the thing beneath.", "Wren's debt comes due."] },
            ]}
          />
        </div>
      </Section>

      {/* ── PROVIDERS + ROLES ── */}
      <Section id="providers" title="Providers &amp; roles">
        <p style={styles.sectionNote}>KeyField in all four states, inside ProviderCards; the role matrix with a deliberate advanced-fit mismatch.</p>
        <div style={styles.twoCol}>
          <ProviderCard name="OpenRouter" keyState="valid" subtitle="OpenAI-compatible">
            <KeyField value="sk-or-v1-abc123" onChange={() => {}} state="valid" balance="$4.20 credit" animate={false} />
          </ProviderCard>
          <ProviderCard name="OpenAI" keyState="validating">
            <KeyField value="sk-proj-checking" onChange={() => {}} state="validating" animate={false} />
          </ProviderCard>
          <ProviderCard name="Anthropic" keyState="rejected">
            <KeyField value="sk-ant-bad" onChange={() => {}} state="rejected" reason="Invalid key" animate={false} />
          </ProviderCard>
          <ProviderCard name="Local" keyState="empty" subtitle="not configured">
            <KeyField value="" onChange={() => {}} state="empty" animate={false} />
          </ProviderCard>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>ROLE MATRIX</div>
          <div style={styles.panel}>
            <RoleMatrixRow role="narrator" description="Writes the prose." options={modelOptions} value="anthropic/claude-sonnet-4" onChange={() => {}} fit="recommended" />
            <RoleMatrixRow role="classifier" description="Decides when to roll." options={modelOptions} value="openai/gpt-4o-mini" onChange={() => {}} fit="recommended" />
            <RoleMatrixRow role="summarizer" description="Compresses chapters into arcs." options={modelOptions} value="anthropic/claude-sonnet-4" onChange={() => {}} fit="advanced" />
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ModelStatusChip status="connected" label="Narrator connected" animate={false} />
          <ModelStatusChip status="validating" label="Validating" animate={false} />
          <ModelStatusChip status="error" label="Rejected" animate={false} />
          <ModelStatusChip status="idle" label="Idle" animate={false} />
        </div>
      </Section>

      {/* ── CONFIGURATION & AUTHORING (v2 §1/§2/§3/§6/§7/§8 specimens) ── */}
      <Section id="authoring" title="Configuration &amp; authoring">
        <p style={styles.sectionNote}>
          The v2 model-config, lorebook-library, message-history, and blueprint surfaces: RoleMatrixRow states, the full
          SamplerPanel, MessageActions (swipe counter · locked die · rewind menu), LorebookLibraryCard, the attach + persona
          rows, and the BlueprintForm.
        </p>

        <div style={styles.miniLabel}>ROLE MATRIX ROW — STATES</div>
        <div style={styles.panel}>
          <RoleMatrixRow role="narrator" description="Recommended fit." options={modelOptions} value="anthropic/claude-sonnet-4" onChange={() => {}} fit="recommended" />
          <RoleMatrixRow role="classifier" description="Advanced / json-mode risk." options={modelOptions} value="openai/gpt-4o-mini" onChange={() => {}} fit="advanced" />
          <RoleMatrixRow role="bootstrapper" description="Story AI — the fifth role, renamed." options={modelOptions} value="anthropic/claude-sonnet-4" onChange={() => {}} fit="recommended" />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={styles.miniLabel}>SAMPLER PANEL — PRESETS + DISABLED FIELD</div>
          <SamplerPanel
            fields={DEMO_SAMPLER_FIELDS}
            activePreset="Creative"
            dirty
            onPreset={() => {}}
            onFieldChange={() => {}}
            onResetToRecommended={() => {}}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={styles.miniLabel}>MESSAGE ACTIONS — LATEST (SWIPE + LOCKED DIE) · EARLIER (REWIND-ONLY)</div>
          <div style={styles.panel}>
            <MessageActions variantIndex={2} variantCount={3} isLatest rollLocked onPrevVariant={() => {}} onNextVariant={() => {}} onDeleteLastExchange={() => {}} onRewindToHere={() => {}} />
            <div style={{ height: 12 }} />
            <MessageActions variantIndex={1} variantCount={1} isLatest={false} onRewindToHere={() => {}} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={styles.miniLabel}>LOREBOOK LIBRARY CARD</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            <LorebookLibraryCard name="The Ember Choir" source="user" entryCount={12} attachmentCount={3} onOpen={() => {}} />
            <LorebookLibraryCard name="Saltmarrow Wharves" source="imported_card" entryCount={5} attachmentCount={1} onOpen={() => {}} />
            <LorebookLibraryCard name="Vale Road lore" source="migrated" entryCount={8} attachmentCount={0} onOpen={() => {}} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={styles.miniLabel}>ATTACH PANEL — LOREBOOK ROWS + PERSONA PICKER</div>
          <div style={{ ...styles.panel, display: "flex", flexDirection: "column", gap: 8 }}>
            <AttachRow name="The Ember Choir" source="user" enabled onToggle={() => {}} onDetach={() => {}} />
            <AttachRow name="Saltmarrow Wharves" source="imported_card" enabled={false} onToggle={() => {}} onDetach={() => {}} />
            <PersonaPickerRow label="Play as" personaName="Kestrel Vane" onChange={() => {}} />
            <PersonaPickerRow label="Play as" onChange={() => {}} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={styles.miniLabel}>BLUEPRINT FORM</div>
          <BlueprintForm value={DEMO_BLUEPRINT} onChange={() => {}} />
        </div>
      </Section>

      {/* ── CHIPS + STATUS + NOTICES ── */}
      <Section id="ui" title="Chips, status &amp; notices">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <Chip tone="recommended">RECOMMENDED</Chip>
          <Chip tone="advanced">ADVANCED — RESULTS MAY VARY</Chip>
          <Chip tone="fallen">FALLEN</Chip>
          <Chip tone="keyword">choir</Chip>
          <Chip tone="keyword">cold-fire</Chip>
        </div>
        <div style={styles.twoCol}>
          <InlineNotice severity="error" title="Model failure" detail="Names the role, links to a fix." />
          <InlineNotice severity="warn" title="Mechanics skipped" detail="Classifier error — narration only." />
          <InlineNotice severity="info" title="Heads up" detail="An informational aside." />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>TOASTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
            <Toast severity="info" title="Persona saved" detail="Kestrel Vane is ready." durationMs={0} />
            <Toast severity="error" title="Import failed" detail="That file isn't a card." durationMs={0} onDismiss={() => {}} />
          </div>
        </div>
      </Section>

      {/* ── FEEDBACK / MOTION ATOMS ── */}
      <Section id="feedback" title="Feedback &amp; motion">
        <div style={styles.twoCol}>
          <div style={styles.panel}>
            <div style={styles.panelLabel}>THINKING INDICATOR</div>
            <ThinkingIndicator animate={false} />
          </div>
          <div style={styles.panel}>
            <div style={styles.panelLabel}>FORGING INTERSTITIAL</div>
            <ForgingInterstitial
              animate={false}
              steps={[
                { label: "Reading the premise", status: "done" },
                { label: "Forging the world", status: "active" },
                { label: "Casting the first scene", status: "pending" },
              ]}
            />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>PREMISE INPUT</div>
          <PremiseInput value="A gate, cold enough to sting. Beyond the iron, something waits." onChange={() => {}} />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>EMPTY STATE</div>
          <div style={styles.panel}>
            <EmptyState glyph="❦" title="Nothing here yet" body="Empty states invite rather than apologize." action={<Button variant="primary">Create one</Button>} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={styles.miniLabel}>CONFIRM DIALOG (INLINE PREVIEW)</div>
          <div style={{ position: "relative", minHeight: 180, border: "1px solid var(--hairline)", borderRadius: 10, overflow: "hidden" }}>
            <ConfirmDialog
              open
              tone="danger"
              title="Delete this persona?"
              body="Kestrel Vane will be removed. This can't be undone."
              confirmLabel="Delete"
              cancelLabel="Keep"
              onConfirm={() => {}}
              onCancel={() => {}}
              style={{ position: "absolute" }}
            />
          </div>
        </div>
      </Section>

      {/* ── BUTTONS ── */}
      <Section id="buttons" title="Buttons">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <Button variant="primary">Primary · Send</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="system">System action</Button>
          <Button variant="disabled" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <p style={styles.footer}>
        <b style={{ color: "var(--secondary)" }}>Voice:</b> the storyteller is a warm, plain
        game-master — sentence case, active verbs, no purple filler. The system register is terse
        and certain: “SUCCESS · 17 vs DC 15.” Never let one voice borrow the other’s color.
      </p>
    </div>
  );
}

function Section(props: { id: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section id={props.id} style={styles.section}>
      <h2 style={styles.h2} dangerouslySetInnerHTML={undefined}>
        {props.title.replace(/&amp;/g, "&")}
      </h2>
      {props.children}
    </section>
  );
}

function TypeRow(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={styles.typeRow}>
      <div style={styles.typeRowLabel}>{props.label}</div>
      <div style={{ minWidth: 0 }}>{props.children}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    padding: "34px 44px 90px",
    maxWidth: 940,
    fontFamily: "var(--font-ui)",
    color: "var(--prose)",
  },
  intro: { marginBottom: 40 },
  eyebrow: { fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.16em", color: "var(--teal)" },
  h1: { fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600, color: "var(--prose)", margin: "6px 0 4px" },
  lede: { fontSize: 15, color: "var(--secondary)", lineHeight: 1.7, maxWidth: 620, margin: 0 },
  section: { marginBottom: 46 },
  h2: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 600,
    color: "var(--prose)",
    borderBottom: "1px solid var(--hairline)",
    paddingBottom: 9,
    margin: "0 0 18px",
  },
  sectionNote: { fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 18px", maxWidth: 600 },
  groupLabel: { fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--teal)", marginBottom: 9 },
  swatchRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  swatchChip: { height: 52, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" },
  swatchLabel: { fontSize: 11.5, color: "var(--ui-text)", marginTop: 6 },
  swatchHex: { fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" },
  typeRow: { display: "flex", gap: 20, alignItems: "baseline", borderBottom: "1px solid var(--hairline)", paddingBottom: 16 },
  typeRowLabel: { flex: "0 0 130px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" },
  rulingGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  panel: { background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 11, padding: 18 },
  panelLabel: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)", marginBottom: 12 },
  mechRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" },
  miniLabel: { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 },
  footer: {
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.7,
    borderTop: "1px solid var(--hairline)",
    paddingTop: 20,
  },
};

export default DesignSystem;
