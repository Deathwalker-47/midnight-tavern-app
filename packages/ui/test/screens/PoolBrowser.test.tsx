/**
 * PoolBrowser (plan 09 §7, design brief §5b) — section-first browsing with lazy pages, search, the
 * honest per-entry states (locked by tier, the D8 "kept" reason), enable / disable through the
 * bridge, and the DOM staying bounded at ~3,000 entries (§7.1).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { PoolBrowser } from "../../src/screens/storySettings/PoolBrowser";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import type { CoreBridge, PoolBrowseEntry, PoolSectionView } from "../../src/bridge/core";

let bridge: CoreBridge;
let storyId: string;
let playerId: string;

beforeEach(async () => {
  bridge = makeMemoryBridge();
  setBridge(bridge);
  const created = await bridge.createStory({ title: "Pool", premise: "A fading kingdom.", playerName: "Ari", statMode: "full" });
  storyId = created.story.id;
  playerId = created.playerCharacterId;
});

const section = (title: string) => screen.getByRole("button", { name: new RegExp(title) });
const row = (entryId: string) => screen.getByTestId(`pool-entry-${entryId}`);

describe("PoolBrowser", () => {
  it("opens collapsed with per-section counts, and loads a section only when opened", async () => {
    const browse = vi.spyOn(bridge, "browsePool");
    render(<PoolBrowser storyId={storyId} />);
    expect(await screen.findByTestId("pool-browser")).toBeInTheDocument();
    expect(section("Persuasion & Negotiation")).toHaveTextContent("0 of 7 enabled");
    expect(section("Persuasion & Negotiation")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByTestId(/^pool-entry-/)).toHaveLength(0);
    expect(browse).not.toHaveBeenCalled();

    fireEvent.click(section("Persuasion & Negotiation"));
    expect(await screen.findByTestId("pool-entry-uni.social.persuasion.persuade")).toHaveAttribute("data-state", "available");
    expect(browse).toHaveBeenCalledWith(storyId, { sectionId: "persuasion", offset: 0, limit: 40 });
    expect(section("Persuasion & Negotiation")).toHaveAttribute("aria-expanded", "true");
  });

  it("enables and disables through the bridge, updating the row, the counts and the caller", async () => {
    const onChanged = vi.fn();
    render(<PoolBrowser storyId={storyId} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: /Persuasion & Negotiation/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Enable Persuade" }));
    await waitFor(() => expect(row("uni.social.persuasion.persuade")).toHaveAttribute("data-state", "enabled"));
    expect(within(row("uni.social.persuasion.persuade")).getByText("ENABLED · added by you")).toBeInTheDocument();
    expect(section("Persuasion & Negotiation")).toHaveTextContent("1 of 7 enabled");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect((await bridge.listPoolEnablements(storyId)).map((enablement) => enablement.entryId)).toEqual([
      "uni.social.persuasion.persuade",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Disable Persuade" }));
    await waitFor(() => expect(row("uni.social.persuasion.persuade")).toHaveAttribute("data-state", "available"));
    expect(section("Persuasion & Negotiation")).toHaveTextContent("0 of 7 enabled");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("shows a tier lock as when it unlocks, with no toggle", async () => {
    render(<PoolBrowser storyId={storyId} />);
    fireEvent.click(await screen.findByRole("button", { name: /Leadership & Command/ }));
    const command = await screen.findByTestId("pool-entry-uni.social.leadership.command");
    expect(command).toHaveAttribute("data-state", "locked");
    expect(within(command).getByText("LOCKED BY TIER")).toBeInTheDocument();
    expect(
      within(command).getByText("Command is uncommon; uncommon entries unlock once the story completes its first chapter.")
    ).toBeInTheDocument();
    expect(within(command).queryByRole("button")).toBeNull();
  });

  it("keeps a learned skill on with the reason naming who learned it (D8), and says what an entry brings", async () => {
    render(<PoolBrowser storyId={storyId} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Fire Magic\s*0 of/ }));
    const bolt = await screen.findByTestId("pool-entry-uni.magic.fire_magic.fire_bolt");
    expect(within(bolt).getByText("Also enables Fire Magic.")).toBeInTheDocument();
    fireEvent.click(within(bolt).getByRole("button", { name: "Enable Fire Bolt" }));
    await waitFor(() => expect(row("uni.magic.fire_magic.fire_magic")).toHaveAttribute("data-state", "enabled"));
    // Still needed by Fire Bolt, so Fire Magic is kept even before anyone learns it.
    expect(within(row("uni.magic.fire_magic.fire_magic")).getByText("Fire Bolt still needs it; disable that first.")).toBeInTheDocument();

    const card = (await bridge.getLivingCard(storyId, playerId))!;
    card.skills.push({ skillId: "uni.magic.fire_magic.fire_magic", name: "Fire Magic", rank: "novice" });
    fireEvent.click(within(row("uni.magic.fire_magic.fire_bolt")).getByRole("button", { name: "Disable Fire Bolt" }));
    await waitFor(() => expect(row("uni.magic.fire_magic.fire_bolt")).toHaveAttribute("data-state", "available"));
    const kept = row("uni.magic.fire_magic.fire_magic");
    expect(within(kept).getByText("KEPT · added by you")).toBeInTheDocument();
    expect(within(kept).getByText("Ari has learned this, so it stays.")).toBeInTheDocument();
    expect(within(kept).queryByRole("button")).toBeNull();
  });

  it("searches the whole pool instead of the sections", async () => {
    render(<PoolBrowser storyId={storyId} />);
    fireEvent.change(await screen.findByLabelText("Search the universal pool"), { target: { value: "fire bolt" } });
    const results = await screen.findByTestId("pool-search-results");
    await waitFor(() => expect(within(results).getByText("1 MATCH")).toBeInTheDocument());
    expect(within(results).getByTestId("pool-entry-uni.magic.fire_magic.fire_bolt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Persuasion & Negotiation/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search the universal pool"), { target: { value: "zzzz nothing" } });
    expect(await screen.findByText("Nothing in the pool matches “zzzz nothing”.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the universal pool"), { target: { value: "" } });
    expect(await screen.findByRole("button", { name: /Persuasion & Negotiation/ })).toBeInTheDocument();
  });

  it("shows a refusal from the bridge on the row it belongs to", async () => {
    setBridge(
      Object.assign(makeMemoryBridge(), {
        listPoolSections: async () => [{ id: "s", title: "Section", description: "d", offered: 1, enabled: 0 }],
        browsePool: async () => ({
          entries: [{ entryId: "uni.a.b.c", name: "Thing", kind: "action", sectionId: "s", description: "d", state: "available" }],
          total: 1,
          offset: 0,
        }),
        enablePoolEntry: async () => ({ ok: false, reason: "Not today." }),
      } as Partial<CoreBridge>)
    );
    render(<PoolBrowser storyId="any" />);
    fireEvent.click(await screen.findByRole("button", { name: /Section/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Enable Thing" }));
    expect(await within(row("uni.a.b.c")).findByRole("alert")).toHaveTextContent("Not today.");
  });

  it("says so when the pool cannot be read", async () => {
    setBridge(Object.assign(makeMemoryBridge(), { listPoolSections: async () => Promise.reject(new Error("offline")) }));
    render(<PoolBrowser storyId="any" />);
    expect(await screen.findByText("The universal pool could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("stays bounded at ~3,000 entries: headers only until a section opens, then one page at a time", async () => {
    const sections: PoolSectionView[] = Array.from({ length: 166 }, (_, index) => ({
      id: `section_${index}`,
      title: `Section ${index}`,
      description: "Synthetic.",
      offered: 18,
      enabled: 0,
    }));
    const entries: PoolBrowseEntry[] = Array.from({ length: 3_000 }, (_, index) => ({
      entryId: `uni.synthetic.group.entry_${index}`,
      name: `Entry ${index}`,
      kind: "action",
      sectionId: index < 50 ? "section_0" : `section_${1 + (index % 165)}`,
      description: "Synthetic.",
      state: "available",
    }));
    const browsePool = vi.fn(async (_story: string, query: { sectionId?: string; offset?: number; limit?: number } = {}) => {
      const matching = entries.filter((entry) => entry.sectionId === query.sectionId);
      const offset = query.offset ?? 0;
      return { entries: matching.slice(offset, offset + (query.limit ?? 40)), total: matching.length, offset };
    });
    setBridge(Object.assign(makeMemoryBridge(), { listPoolSections: async () => sections, browsePool }));
    render(<PoolBrowser storyId="big" />);
    expect(await screen.findByText("0 of 2988 pool entries are enabled in this story.", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Section \d+/ })).toHaveLength(166);
    expect(screen.queryAllByTestId(/^pool-entry-/)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /^Section 0\s*0 of 18/ }));
    await waitFor(() => expect(screen.queryAllByTestId(/^pool-entry-/)).toHaveLength(40));
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more of 10" }));
    await waitFor(() => expect(screen.queryAllByTestId(/^pool-entry-/)).toHaveLength(50));
    expect(browsePool).toHaveBeenLastCalledWith("big", { sectionId: "section_0", offset: 40, limit: 40 });
    expect(screen.queryByRole("button", { name: /more of/ })).toBeNull();
  });
});
