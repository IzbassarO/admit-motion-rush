// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
// public/ so the app serves it from its own origin (no CDN required).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.warn('[copy-mediapipe-wasm] @mediapipe/tasks-vision not installed; skipping.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
// FilesetResolver (non-module mode) loads vision_wasm_internal.* or the nosimd variant.
const files = readdirSync(src).filter((f) => !f.includes('module'));
for (const f of files) cpSync(join(src, f), join(dest, f));
console.log(`[copy-mediapipe-wasm] copied ${files.length} files to public/mediapipe/wasm`);
