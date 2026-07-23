import type { MacroDefinition } from "./types.js";

/** Case-insensitive registry used by the macro evaluator and extension integrations. */
export class MacroRegistry {
  readonly #definitions = new Map<string, MacroDefinition>();

  register(definition: MacroDefinition): this {
    const names = [definition.name, ...(definition.aliases ?? [])];
    for (const name of names) {
      const key = name.trim().toLowerCase();
      if (!key) throw new Error("Macro names cannot be empty.");
      if (this.#definitions.has(key)) {
        throw new Error(`Macro "${name}" is already registered.`);
      }
      this.#definitions.set(key, definition);
    }
    return this;
  }

  get(name: string): MacroDefinition | undefined {
    return this.#definitions.get(name.trim().toLowerCase());
  }

  has(name: string): boolean {
    return this.#definitions.has(name.trim().toLowerCase());
  }

  names(): string[] {
    return [...new Set([...this.#definitions.values()].map((definition) => definition.name))]
      .sort((left, right) => left.localeCompare(right));
  }
}
