// Copies the Silero VAD model, its audio worklet and the onnxruntime-web WASM runtime into public/vad/
// so the browser loads them from the same origin. Runs on install and before `next build` (Vercel too).
// The files are generated rather than committed: the WASM runtime alone is ~14 MB.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vad");
const vad = join(root, "node_modules", "@ricky0123", "vad-web", "dist");
const ort = join(root, "node_modules", "onnxruntime-web", "dist");

const files = [
  [vad, "vad.worklet.bundle.min.js"],
  [vad, "silero_vad_v5.onnx"],
  [ort, "ort-wasm-simd-threaded.wasm"],
  [ort, "ort-wasm-simd-threaded.mjs"],
];

if (!existsSync(vad) || !existsSync(ort)) {
  console.warn("[copy-vad-assets] packages not installed yet; skipping");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
for (const [dir, name] of files) copyFileSync(join(dir, name), join(out, name));
console.log(`[copy-vad-assets] copied ${files.length} files to public/vad`);
