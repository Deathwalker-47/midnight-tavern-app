/**
 * Golden classifier corpus (plan §M4.4, §10).
 *
 * ~40 player phrasings mapped to the catalog action ids they should classify to (empty =
 * narration_only). The ids match the `makeStory()` fixture catalog. Asserted structurally
 * here (every expected id is a real catalog id); a live-model pass over the same corpus is
 * the manual/CI classifier-accuracy gate.
 */
export interface GoldenCase {
  message: string;
  /** Expected catalog action ids ([] = pure narration). */
  expected: string[];
}

export const GOLDEN_CASES: GoldenCase[] = [
  // combat — attack_melee (weapon + blade)
  { message: "I swing my sword at the guard", expected: ["attack_melee"] },
  { message: "I slash the bandit with my blade", expected: ["attack_melee"] },
  { message: "Strike him down with my sword!", expected: ["attack_melee"] },
  { message: "I thrust my rapier into the beast", expected: ["attack_melee"] },
  // combat — attack_wild (no skill)
  { message: "I flail wildly at whatever's closest", expected: ["attack_wild"] },
  { message: "I throw a desperate punch", expected: ["attack_wild"] },
  { message: "I grab a chair and smash it at them", expected: ["attack_wild"] },
  // combat — duel (opposed)
  { message: "I challenge the captain to a duel", expected: ["duel"] },
  { message: "I cross blades with the swordsman, testing his guard", expected: ["duel"] },
  { message: "We fence back and forth across the hall", expected: ["duel"] },
  // combat — master_strike (advanced)
  { message: "I attempt my signature finishing move", expected: ["master_strike"] },
  { message: "I unleash the master's killing technique", expected: ["master_strike"] },
  // exploration — pick_lock
  { message: "I pick the lock on the chest", expected: ["pick_lock"] },
  { message: "I work my picks into the door's mechanism", expected: ["pick_lock"] },
  { message: "I try to jimmy the padlock open", expected: ["pick_lock"] },
  // utility — search_room
  { message: "I search the room for anything useful", expected: ["search_room"] },
  { message: "I rummage through the drawers", expected: ["search_room"] },
  { message: "I look around for hidden compartments", expected: ["search_room"] },
  { message: "I comb the study for clues", expected: ["search_room"] },
  // social — persuade
  { message: "I try to convince the merchant to lower his price", expected: ["persuade"] },
  { message: "I plead with the guard to let us pass", expected: ["persuade"] },
  { message: "I sweet-talk the innkeeper", expected: ["persuade"] },
  { message: "I argue that they owe us a favor", expected: ["persuade"] },
  // crafting — brew_potion
  { message: "I brew a healing potion from my herbs", expected: ["brew_potion"] },
  { message: "I mix the reagents in my flask", expected: ["brew_potion"] },
  { message: "I distill a tonic over the fire", expected: ["brew_potion"] },
  // utility — mend_ally (consumable)
  { message: "I pour the potion down my ally's throat", expected: ["mend_ally"] },
  { message: "I press a healing draught to Wren's lips", expected: ["mend_ally"] },
  // learn_skill
  { message: "I ask the swordmaster to teach me the blade", expected: ["learn_skill"] },
  { message: "I study the lockpicking manual to learn the craft", expected: ["learn_skill"] },
  { message: "I train under the alchemist to learn brewing", expected: ["learn_skill"] },
  // narration_only — dialogue, movement, observation
  { message: '"Lovely evening," I remark', expected: [] },
  { message: "I nod slowly and say nothing", expected: [] },
  { message: "I walk toward the tavern door", expected: [] },
  { message: "I take a deep breath and steady myself", expected: [] },
  { message: "I watch the rain streak down the window", expected: [] },
  { message: "I introduce myself to the stranger", expected: [] },
  { message: "I sit by the fire and warm my hands", expected: [] },
  { message: "I recall the last time I was here", expected: [] },
  { message: "I wave to the barkeep across the room", expected: [] },
  { message: "I wonder aloud what happened to the old bridge", expected: [] },
];
