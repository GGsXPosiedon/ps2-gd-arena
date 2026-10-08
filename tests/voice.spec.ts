import { expect, test, type Page } from "@playwright/test";
import { lines, noHmr, norm, waitForPhase } from "./helpers";

// Voice mode with a fake microphone (silence) and a fake Web Speech recognizer that behaves like Chrome:
// one result keeps growing until it is finalized, and abort() discards it.
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    type Result = { isFinal: boolean; 0: { transcript: string }; length: 1 };
    const state = { instances: [] as FakeSR[], aborts: 0 };
    class FakeSR {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      results: Result[] = [];
      started = false;
      dead = false;
      constructor() {
        state.instances.push(this);
      }
      start() {
        this.started = true;
      }
      stop() {
        this.dead = true;
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.dead = true;
        state.aborts++;
        setTimeout(() => this.onend?.(), 10);
      }
      emit(text: string, isFinal: boolean) {
        let idx = this.results.findIndex((r) => !r.isFinal);
        if (idx < 0) idx = this.results.length;
        this.results[idx] = { isFinal, 0: { transcript: text }, length: 1 };
        this.onresult?.({ resultIndex: idx, results: this.results });
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeSR;
    w.webkitSpeechRecognition = FakeSR;
    w.__sr = state;
    // Emits on the live recognizer, but only when no AI is speaking (otherwise the engine treats it as echo).
    w.__srEmit = (text: string, isFinal: boolean) => {
      if (document.querySelector('[data-testid="transcript-live"]')) return false;
      const live = state.instances.filter((i) => i.started && !i.dead).at(-1);
      if (!live) return false;
      live.emit(text, isFinal);
      return true;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    };
  });
}

async function emit(page: Page, text: string, isFinal = false) {
  await expect
    .poll(() => page.evaluate(([t, f]) => (window as unknown as { __srEmit: (t: string, f: boolean) => boolean }).__srEmit(t as string, f as boolean), [text, isFinal] as const), {
      timeout: 20_000,
    })
    .toBe(true);
}

test("speech is committed once: a growing recognizer result is never saved twice", async ({ page }) => {
  await noHmr(page);
  await fakeVoice(page);
  await page.goto("/?e2e=1");
  await page.getByTestId("topic-option").first().click();
  await page.getByTestId("panel-size-3").click();
  await page.getByTestId("enter-room").click();
  await page.getByTestId("take-seat").click();
  await page.getByTestId("join-voice").click();
  await waitForPhase(page, /discussion/i);

  // A pause mid-sentence while the recognizer still holds an unfinalized result.
  await emit(page, "let us stay focused on the");
  await expect(lines(page, "you")).toHaveCount(1, { timeout: 10_000 });
  await expect(lines(page, "you").first()).toContainText("let us stay focused on the");
  // The engine restarted recognition so the half-finished result can't be re-sent.
  expect(await page.evaluate(() => (window as unknown as { __sr: { aborts: number } }).__sr.aborts)).toBeGreaterThan(0);

  // Even if a recognizer re-sends the earlier words, only the new words become a line.
  await emit(page, "let us stay focused on the topic instead of food");
  await emit(page, "let us stay focused on the topic instead of food", true);
  await expect(lines(page, "you")).toHaveCount(2, { timeout: 10_000 });
  const texts = (await lines(page, "you").allInnerTexts()).map(norm);
  expect(texts[1]).toContain("topic instead of food");
  expect(texts[1]).not.toContain("let us stay focused");

  // Nothing else gets committed afterwards.
  await page.waitForTimeout(2500);
  await expect(lines(page, "you")).toHaveCount(2);
});
