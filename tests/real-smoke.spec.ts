import path from "node:path";
import { expect, test } from "@playwright/test";
import { lines, noHmr, pickPanel, waitForPhase } from "./helpers";

// End-to-end against the real AI services (LLM, cloud voices, server transcription). Uses real credits, so it
// only runs on demand:  REAL_SMOKE=1 npx playwright test real-smoke
// A recorded clip plays as the microphone on a loop, so the student "speaks" every ~14 s.
const clip = path.join(__dirname, "fixtures", "speech.wav");
test.skip(!process.env.REAL_SMOKE, "set REAL_SMOKE=1 to run against real services");
test.use({
  extraHTTPHeaders: {},
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${clip}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

test("a real session: AI lines, cloud voices, transcribed speech and an LLM report", async ({ page }) => {
  test.setTimeout(240_000);
  const log: string[] = [];
  const turn: number[] = [];
  const tts: string[] = [];
  const stt: string[] = [];
  let reportSource = "";
  page.on("console", (m) => {
    if (m.text().includes("[voice]") || m.type() === "error") log.push(`${m.type()}: ${m.text()}`);
  });
  page.on("response", async (r) => {
    const url = r.url();
    if (url.includes("/api/turn")) turn.push(r.status());
    if (url.includes("/api/tts")) tts.push(`${r.status()} ${r.headers()["x-voice-provider"] ?? ""}`);
    if (url.includes("/api/stt")) stt.push(`${r.status()} ${await r.text().catch(() => "")}`);
    if (url.includes("/api/report")) reportSource = (await r.json().catch(() => ({})))?.source ?? `status ${r.status()}`;
  });

  await noHmr(page);
  await page.goto("/");
  await page.getByTestId("topic-option").first().click();
  await pickPanel(page, ["arjun", "priya", "meera"]);
  await page.getByTestId("input-mic").click();
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/room/);
  await waitForPhase(page, /opening|discussion/i, 90_000);

  // Let the discussion run: the AIs talk, the looping clip cuts in.
  await expect(lines(page, "you").first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(45_000);
  const transcript = await lines(page).evaluateAll((els) => els.map((e) => `${e.getAttribute("data-speaker")}: ${e.textContent}`));

  await page.getByTestId("end-session").click();
  await page.getByTestId("end-confirm").click();
  await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => reportSource, { timeout: 60_000 }).not.toBe("");

  console.log(["--- transcript", ...transcript, "--- /api/turn", turn.join(" "), "--- /api/tts", ...tts, "--- /api/stt", ...stt, "--- report", reportSource, "--- console", ...log].join("\n"));
  const personaLines = transcript.filter((t) => /^(arjun|priya|meera):/.test(t));
  expect(personaLines.length).toBeGreaterThanOrEqual(2);
  expect(transcript.some((t) => t.startsWith("you:"))).toBe(true);
  expect(tts.filter((t) => t.startsWith("200")).length).toBeGreaterThan(0);
  expect(reportSource).toBe("llm");
});
