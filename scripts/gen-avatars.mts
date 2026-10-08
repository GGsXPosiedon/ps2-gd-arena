// Generates the AI personas' profile pictures into public/avatars/<id>.svg.
// Style: DiceBear "notionists" by Zoish (CC0 1.0). Illustrated on purpose: the participants are AI.
// Run: bun run scripts/gen-avatars.mts
import { mkdir, writeFile } from "node:fs/promises";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";

type Look = { seed: string; hair: string; glasses?: string; beard?: string };

// Chosen from contact sheets so each face matches its persona and reads at 16–72 px.
const LOOKS: Record<string, Look> = {
  arjun: { seed: "arjun-a", hair: "variant27", beard: "variant02" }, // confident, full beard
  priya: { seed: "priya-a", hair: "variant41", glasses: "variant08" }, // sharp, clear glasses
  meera: { seed: "meera-c", hair: "variant39" }, // calm, ponytail
  rohan: { seed: "rohan-b", hair: "variant20" }, // friendly, curly
  ananya: { seed: "ananya-c", hair: "variant28" }, // bold, wavy
  kabir: { seed: "kabir-b", hair: "variant34" }, // easy-going
};

await mkdir("public/avatars", { recursive: true });
for (const [id, look] of Object.entries(LOOKS)) {
  const svg = createAvatar(notionists, {
    seed: look.seed,
    hair: [look.hair],
    glasses: look.glasses ? [look.glasses] : undefined,
    glassesProbability: look.glasses ? 100 : 0,
    beard: look.beard ? [look.beard] : undefined,
    beardProbability: look.beard ? 100 : 0,
    gestureProbability: 0,
    bodyIconProbability: 0,
    // zoom into the face so it reads in small avatars
    scale: 130,
    translateY: 14,
  } as Parameters<typeof createAvatar<typeof notionists>>[1]).toString();
  await writeFile(`public/avatars/${id}.svg`, svg);
  console.log(`public/avatars/${id}.svg`);
}
