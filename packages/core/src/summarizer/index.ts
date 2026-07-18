/**
 * Summarizer barrel (low-level-plan §M8).
 *
 * The rolling-memory layer: chapter summaries (blocks of messages), arc documents (blocks
 * of chapters), and the injector that condenses both — plus present-character soft slices —
 * into the context assembler's memory block.
 */
export {
  maybeSummarizeChapter,
  buildChapterUser,
  chapterThreshold,
  ChapterSummarySchema,
  CHAPTER_SYSTEM,
  MESSAGES_PER_CHAPTER_KEY,
  DEFAULT_MESSAGES_PER_CHAPTER,
  type ChapterSummary,
} from "./chapter.js";
export {
  maybeSummarizeArc,
  buildArcUser,
  arcThreshold,
  ARC_SYSTEM,
  CHAPTERS_PER_ARC_KEY,
  DEFAULT_CHAPTERS_PER_ARC,
} from "./arc.js";
export {
  buildMemoryBlock,
  condenseArcDoc,
  condenseSoftSlice,
  type MemoryBlock,
} from "./injector.js";
