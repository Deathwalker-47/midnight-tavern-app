/**
 * storiesStore — the story shelf (Library) and the currently-open story. Talks only to the
 * bridge; never imports core. Loading/error live here so Library can render its state matrix.
 */
import { create } from "zustand";
import { getBridge } from "../bridge/core.js";
import type {
  StorySummary,
  StoryRecord,
  CreateStoryArgs,
  CreateStoryResult,
  MappedCard,
  Blueprint,
} from "../bridge/core.js";

/** The Library shelf's load lifecycle (§02 states: loading / empty / error / shelf). */
export type ShelfStatus = "idle" | "loading" | "ready" | "error";

export type NewStoryDraft = {
  title: string;
  playerName: string;
  premise: string;
  statMode?: "none" | "full";
  /** Persona reviewed for this forge; retained across Blueprint/Wizard navigation. */
  personaId?: string;
  /** Explicit acknowledgement required when forging without a persona. */
  continueWithoutPersona?: boolean;
  blueprint: Blueprint;
  selectedOpening?: string;
  importedCard?: MappedCard;
};

export const EMPTY_STORY_DRAFT: NewStoryDraft = {
  title: "",
  playerName: "",
  premise: "",
  blueprint: {},
};

const LAST_STORY_KEY = "midnight-tavern:last-story-id";

function readLastStoryId(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(LAST_STORY_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberStoryId(storyId?: string): void {
  try {
    if (storyId) globalThis.localStorage?.setItem(LAST_STORY_KEY, storyId);
    else globalThis.localStorage?.removeItem(LAST_STORY_KEY);
  } catch {
    // Persistence is a convenience; private/locked storage must never block opening a story.
  }
}

interface StoriesState {
  stories: StorySummary[];
  status: ShelfStatus;
  error?: string;

  /** The open story's full record (frozen schema), or undefined when none is open. */
  current?: StoryRecord;
  currentStatus: "idle" | "loading" | "ready" | "error";

  /** True while a bootstrap (forging) is in flight; Library shows the interstitial. */
  forging: boolean;
  draft?: NewStoryDraft;

  refresh: () => Promise<void>;
  openStory: (storyId: string) => Promise<void>;
  closeStory: () => void;
  create: (args: CreateStoryArgs) => Promise<CreateStoryResult>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setDraft: (draft: NewStoryDraft) => void;
  clearDraft: () => void;
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  stories: [],
  status: "idle",
  current: undefined,
  currentStatus: "idle",
  forging: false,
  draft: undefined,

  refresh: async () => {
    set({ status: "loading", error: undefined });
    try {
      const bridge = getBridge();
      const stories = await bridge.listStories();
      const lastStoryId = get().current?.id ?? readLastStoryId();
      const canRestore = !!lastStoryId && stories.some((story) => story.id === lastStoryId);
      if (!get().current && canRestore) {
        const current = await bridge.getStory(lastStoryId);
        set({ stories, status: "ready", current, currentStatus: current ? "ready" : "idle" });
      } else {
        set({ stories, status: "ready" });
      }
    } catch (err) {
      set({ status: "error", error: (err as Error).message });
    }
  },

  openStory: async (storyId) => {
    set({ currentStatus: "loading" });
    try {
      const story = await getBridge().getStory(storyId);
      if (!story) {
        set({ current: undefined, currentStatus: "error" });
        return;
      }
      set({ current: story, currentStatus: "ready" });
      rememberStoryId(story.id);
    } catch {
      set({ currentStatus: "error" });
    }
  },

  closeStory: () => {
    rememberStoryId(undefined);
    set({ current: undefined, currentStatus: "idle" });
  },

  create: async (args) => {
    set({ forging: true });
    try {
      const result = await getBridge().createStory(args);
      await get().refresh();
      set({ current: result.story, currentStatus: "ready" });
      rememberStoryId(result.story.id);
      return result;
    } finally {
      set({ forging: false });
    }
  },

  rename: async (id, title) => {
    await getBridge().renameStory(id, title);
    await get().refresh();
    const current = get().current;
    if (current && current.id === id) set({ current: { ...current, title } });
  },

  remove: async (id) => {
    await getBridge().deleteStory(id);
    if (get().current?.id === id) get().closeStory();
    await get().refresh();
  },

  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: undefined }),
}));
