/**
 * storiesStore — the story shelf (Library) and the currently-open story. Talks only to the
 * bridge; never imports core. Loading/error live here so Library can render its state matrix.
 */
import { create } from "zustand";
import { getBridge } from "../bridge/core.js";
import type { StorySummary, StoryRecord, CreateStoryArgs, CreateStoryResult } from "../bridge/core.js";

/** The Library shelf's load lifecycle (§02 states: loading / empty / error / shelf). */
export type ShelfStatus = "idle" | "loading" | "ready" | "error";

interface StoriesState {
  stories: StorySummary[];
  status: ShelfStatus;
  error?: string;

  /** The open story's full record (frozen schema), or undefined when none is open. */
  current?: StoryRecord;
  currentStatus: "idle" | "loading" | "ready" | "error";

  /** True while a bootstrap (forging) is in flight; Library shows the interstitial. */
  forging: boolean;

  refresh: () => Promise<void>;
  openStory: (storyId: string) => Promise<void>;
  closeStory: () => void;
  create: (args: CreateStoryArgs) => Promise<CreateStoryResult>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  stories: [],
  status: "idle",
  current: undefined,
  currentStatus: "idle",
  forging: false,

  refresh: async () => {
    set({ status: "loading", error: undefined });
    try {
      const stories = await getBridge().listStories();
      set({ stories, status: "ready" });
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
    } catch {
      set({ currentStatus: "error" });
    }
  },

  closeStory: () => set({ current: undefined, currentStatus: "idle" }),

  create: async (args) => {
    set({ forging: true });
    try {
      const result = await getBridge().createStory(args);
      await get().refresh();
      set({ current: result.story, currentStatus: "ready" });
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
}));
