/**
 * The desktop shell's rulebook config folder (plan 09 §4c.2): `$APPDATA/config/`, beside the database.
 * The user edits files there; the app only ever creates the folder and its README, reads the three
 * override files, and — for "restore defaults" — moves a file aside (never deletes the user's work).
 *
 * Tauri-only: imported by `loadSqliteBridge` at runtime, never on the browser/test path. The bridge
 * takes the {@link ConfigFileAccess} interface, so tests substitute an in-memory folder.
 */
import { BaseDirectory, exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ConfigFileKey, ConfigOverrideTexts } from "@midnight-tavern/core";

export interface ConfigFileAccess {
  /** The folder's absolute path, for display. */
  folder(): Promise<string>;
  /** Create the folder and README if missing, then read whichever override files exist. */
  read(): Promise<ConfigOverrideTexts>;
  /** Move one override file aside (`<name>.<time>.bak`) so the shipped defaults apply again. */
  restore(file: ConfigFileKey): Promise<void>;
  /** Show the folder in the OS file manager. */
  reveal(): Promise<void>;
}

const DIR = "config";
const IN_APP_DATA = { baseDir: BaseDirectory.AppData };

export function tauriConfigFiles(
  names: Readonly<Record<ConfigFileKey, string>>,
  readme: string,
  now: () => number = Date.now
): ConfigFileAccess {
  async function ensureFolder(): Promise<void> {
    if (!(await exists(DIR, IN_APP_DATA))) await mkdir(DIR, { ...IN_APP_DATA, recursive: true });
    if (!(await exists(`${DIR}/README.md`, IN_APP_DATA))) {
      await writeTextFile(`${DIR}/README.md`, readme, IN_APP_DATA);
    }
  }
  return {
    async folder() {
      return join(await appDataDir(), DIR);
    },
    async read() {
      await ensureFolder();
      const texts: ConfigOverrideTexts = {};
      for (const key of Object.keys(names) as ConfigFileKey[]) {
        const path = `${DIR}/${names[key]}`;
        if (await exists(path, IN_APP_DATA)) texts[key] = await readTextFile(path, IN_APP_DATA);
      }
      return texts;
    },
    async restore(file) {
      const path = `${DIR}/${names[file]}`;
      if (!(await exists(path, IN_APP_DATA))) return;
      await rename(path, `${path}.${now()}.bak`, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });
    },
    async reveal() {
      await ensureFolder();
      await revealItemInDir(await join(await appDataDir(), DIR, "README.md"));
    },
  };
}
