// Tauri v2 build script. Runs tauri-build's codegen (parses tauri.conf.json,
// wires capabilities, embeds the frontend dist reference). Keep it minimal —
// all real configuration lives in tauri.conf.json and capabilities/.
fn main() {
    tauri_build::build();
}
