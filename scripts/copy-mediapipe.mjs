// Copies MediaPipe's in-browser runtime (used to find the person in a profile
// photo so its background can be recoloured — photo-editor.tsx) into public/,
// so the app serves it itself: nothing is fetched from an outside CDN and the
// photo never leaves the browser. Runs before `dev` and `build`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const from = 'node_modules/@mediapipe/tasks-vision/wasm';
const to = 'public/mediapipe/wasm';
if (!existsSync(from)) {
  console.warn('[mediapipe] runtime not installed; photo background change will be unavailable');
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const name of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  copyFileSync(join(from, name), join(to, name));
}
console.log('[mediapipe] runtime copied to', to);
