import { z } from "zod";
import { MasteryRankSchema } from "./primitives.js";

// A deterministic predicate over one character's hard state. Conditions contain
// no model-authored expressions; every variant is evaluated by the engine.
export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("skill"), skillId: z.string(), minRank: MasteryRankSchema.optional() }),
  z.object({ type: z.literal("resource"), resourceId: z.string(), min: z.number() }),
  z.object({ type: z.literal("item"), itemId: z.string() }),
  z.object({ type: z.literal("flag"), flagId: z.string(), value: z.boolean() }),
  z.object({ type: z.literal("attribute"), attributeId: z.string(), min: z.number() }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

// A condition together with the concise explanation shown in a ruling.
export const ConditionWithReasonSchema = z.object({
  condition: ConditionSchema,
  reason: z.string().trim().min(1).max(40),
});
export type ConditionWithReason = z.infer<typeof ConditionWithReasonSchema>;
