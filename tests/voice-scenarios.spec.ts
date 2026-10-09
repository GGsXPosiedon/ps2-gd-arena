import { expect, test, type Page } from "@playwright/test";
import { lines, noHmr, pickPanel, waitForPhase } from "./helpers";

// Voice-input scenarios driven through the engine's e2e hook (window.__gdTest): speechStart/speechEnd take the
// same paths as the neural VAD, with the transcript injected instead of recorded. The mic is a silent stream and
// there is no browser recognizer, so the hook is the only source of speech.

const AI = ["arjun", "priya", "meera", "rohan", "ananya", "kabir"];

interface Utt {
  speaker: string;
  text: string;
  phase: string;
  intent: string | null;
  interrupted: boolean;
  interruptedBy: string | null;
}
interface GDState {
  status: string;
  phase: string;
  speaker: string | null;
  lineId: string | null;
  liveText: string;
  studentSpeaking: boolean;
  turnOpen: boolean;
  pendingCommits: number;
  serverStt: boolean;
  handRaised: boolean;
  yourClosingTurn: boolean;
  notice: string | null;
  utterances: Utt[];
  events: string[];
}
type Hook = { speechStart(): void; speechEnd(text?: string): void; state(): GDState };

async function voiceRoom(page: Page, opts: { speakers?: boolean; panel?: string[]; name?: string } = {}) {
  await noHmr(page);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  await page.goto("/?e2e=1");
  await page.getByTestId("topic-option").first().click();
  await pickPanel(page, opts.panel ?? ["arjun", "priya", "meera"]);
  await page.getByTestId("name-input").fill(opts.name ?? "Aditi");
  await page.getByTestId("input-mic").click();
  if (opts.speakers) await page.getByTestId("listen-speakers").click();
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/room/);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __gdTest?: Hook }).__gdTest), { timeout: 20_000 }).toBe(true);
  // The neural VAD loaded, so speech goes through per-segment server transcription.
  await expect.poll(() => state(page).then((s) => s.serverStt), { timeout: 20_000 }).toBe(true);
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { __gdTest: Hook }).__gdTest.state());
const speechStart = (page: Page) => page.evaluate(() => (window as unknown as { __gdTest: Hook }).__gdTest.speechStart());
const speechEnd = (page: Page, text?: string) =>
  page.evaluate((t) => (window as unknown as { __gdTest: Hook }).__gdTest.speechEnd(t ?? undefined), text ?? null);

/**
 * Starts "speaking" (or presses Space) the moment one of `speakers` is mid-line and its line matches `pattern`,
 * checked in the page every few ms because e2e lines are short. `fresh`: skip a line already playing, so the
 * action lands `delayMs` after a line starts. Returns the text of the line that was playing.
 */
async function speakDuring(
  page: Page,
  speakers: string[],
  pattern?: RegExp,
  { action = "speech", delayMs = 0, fresh = false }: { action?: "speech" | "space"; delayMs?: number; fresh?: boolean } = {},
): Promise<string> {
  return page.evaluate(
    ({ speakers, source, action, delayMs, fresh }) =>
      new Promise<string>((resolve, reject) => {
        const hook = (window as unknown as { __gdTest: Hook }).__gdTest;
        const re = source ? new RegExp(source, "i") : null;
        const deadline = Date.now() + 45_000;
        const skip = fresh ? hook.state().lineId : null;
        const iv = setInterval(() => {
          const s = hook.state();
          if (s.speaker && speakers.includes(s.speaker) && (!re || re.test(s.liveText)) && (!skip || s.lineId !== skip)) {
            clearInterval(iv);
            setTimeout(() => {
              if (action === "space") document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
              else hook.speechStart();
              resolve(s.liveText);
            }, delayMs);
          } else if (Date.now() > deadline) {
            clearInterval(iv);
            reject(new Error(`nobody in ${speakers.join(",")} spoke`));
          }
        }, 4);
      }),
    { speakers, source: pattern?.source ?? null, action, delayMs, fresh },
  );
}

/** Resolves once no line is playing. */
async function waitLineEnd(page: Page) {
  await expect.poll(() => state(page).then((s) => s.speaker), { timeout: 15_000, intervals: [20] }).toBeNull();
}

const studentLines = (s: GDState) => s.utterances.filter((u) => u.speaker === "you");
const aiLines = (s: GDState) => s.utterances.filter((u) => AI.includes(u.speaker));

/** The floor is free again and an AI participant finishes a new line within ~10 s. */
async function aiKeepsTalking(page: Page) {
  await expect.poll(() => state(page).then((s) => s.turnOpen || s.pendingCommits > 0), { timeout: 8_000 }).toBe(false);
  const before = aiLines(await state(page)).length;
  await expect.poll(() => state(page).then((s) => aiLines(s).length), { timeout: 12_000 }).toBeGreaterThan(before);
}

test.describe("voice input scenarios (e2e hook, mock AI)", () => {
  test("a) speaking over the moderator's 'who would like to begin?' opens the discussion", async ({ page }) => {
    await voiceRoom(page);
    await speakDuring(page, ["mod"], /begin/);
    expect((await state(page)).turnOpen).toBe(true);
    await speechEnd(page, "I would like to begin by saying a four day week protects mental health");
    await expect(lines(page, "you").filter({ hasText: "four day week protects mental health" })).toHaveCount(1);

    const s = await state(page);
    const iYou = s.utterances.findIndex((u) => u.speaker === "you");
    const iOpen = s.utterances.findIndex((u) => u.speaker === "mod" && /begin/i.test(u.text));
    expect(iYou).toBeGreaterThan(iOpen); // listed after the line it answered
    // The student opened: no AI spoke before them.
    expect(s.utterances.slice(0, iYou).some((u) => AI.includes(u.speaker))).toBe(false);
    await aiKeepsTalking(page);
  });

  test("b) barge-in: talking over an AI stops it and the student's point is kept", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    await speakDuring(page, AI);
    await waitLineEnd(page);
    const cut = aiLines(await state(page)).at(-1)!;
    expect(cut.interrupted).toBe(true);
    expect(cut.interruptedBy).toBe("you");
    await speechEnd(page, "Sorry to cut in, but the data from Iceland shows productivity held steady");
    await expect(lines(page, "you").filter({ hasText: "data from Iceland" })).toHaveCount(1);
    expect((await state(page)).events).toContain("interrupt:you");
    await aiKeepsTalking(page);
  });

  test("c) echo filter: the AI's own words are dropped, a reply that shares words is kept", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    // Echo: the transcript repeats what the AI was saying.
    const playing = await speakDuring(page, AI);
    const echo = playing.split(/\s+/).slice(0, 9).join(" ");
    await waitLineEnd(page);
    await speechEnd(page, echo);
    await expect.poll(() => state(page).then((s) => s.turnOpen || s.pendingCommits > 0)).toBe(false);
    expect(studentLines(await state(page))).toHaveLength(0);
    await aiKeepsTalking(page);

    // A genuine reply reusing some of the AI's vocabulary.
    const said = await speakDuring(page, AI);
    const shared = said.split(/\s+/).filter((w) => w.length > 4).slice(0, 2).join(" and ");
    const reply = `I hear the point about ${shared}, but small shops simply cannot staff a four day week`;
    await waitLineEnd(page);
    await speechEnd(page, reply);
    await expect(lines(page, "you").filter({ hasText: "small shops simply cannot staff" })).toHaveCount(1);
    await aiKeepsTalking(page);
  });

  test("c2) headphones picked but the mic hears the speakers: echo cut-ins switch to speaker mode", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    // The AI's voice comes back through the mic right after its audio starts and cuts it off. Even a two-word echo
    // is dropped, then a longer one; after the second, voice stops interrupting the AIs.
    let playing = await speakDuring(page, AI, undefined, { delayMs: 100, fresh: true });
    await waitLineEnd(page);
    await speechEnd(page, playing.split(/\s+/).slice(0, 2).join(" "));
    await aiKeepsTalking(page);
    playing = await speakDuring(page, AI, undefined, { delayMs: 100, fresh: true });
    await waitLineEnd(page);
    await speechEnd(page, playing.split(/\s+/).slice(0, 8).join(" "));
    await expect(page.getByText(/mic hears the speakers/i)).toBeVisible({ timeout: 5_000 });
    expect(studentLines(await state(page))).toHaveLength(0);

    await speakDuring(page, AI, undefined, { delayMs: 100, fresh: true });
    await waitLineEnd(page);
    expect(aiLines(await state(page)).at(-1)!.interrupted).toBe(false);
    await page.waitForTimeout(1200); // the student kept talking after the line ended
    await speechEnd(page, "and that is my point about remote teams");
    await expect(lines(page, "you").filter({ hasText: "remote teams" })).toHaveCount(1);
    await aiKeepsTalking(page);
  });

  test("d) speakers: the AI's voice doesn't interrupt; speech running past its line is caught; Space cuts in", async ({ page }) => {
    await voiceRoom(page, { speakers: true });
    await waitForPhase(page, /discussion/i);

    // 1. The mic hears the AI (echo), so the line is not interrupted; the student keeps talking after it ends.
    await speakDuring(page, AI);
    await waitLineEnd(page);
    expect(aiLines(await state(page)).at(-1)!.interrupted).toBe(false);
    expect((await state(page)).turnOpen).toBe(true); // the floor waits for the student
    await page.waitForTimeout(1200);
    expect((await state(page)).speaker).toBeNull(); // no AI started over them
    await speechEnd(page, "Adding to that, rural offices would need a different schedule entirely");
    await expect(lines(page, "you").filter({ hasText: "rural offices would need" })).toHaveCount(1);
    await aiKeepsTalking(page);

    // 2. Only echo, ending with the line: nothing is added and the floor moves on.
    const count = studentLines(await state(page)).length;
    const playing = await speakDuring(page, AI);
    await waitLineEnd(page);
    await speechEnd(page, playing.split(/\s+/).slice(-3).join(" "));
    await aiKeepsTalking(page);
    expect(studentLines(await state(page))).toHaveLength(count);

    // 3. Space interrupts; the floor waits a moment for the student to start.
    await speakDuring(page, AI, undefined, { action: "space" });
    await waitLineEnd(page);
    expect(aiLines(await state(page)).at(-1)!.interrupted).toBe(true);
    await page.waitForTimeout(1000);
    expect((await state(page)).speaker).toBeNull();
    await speechStart(page);
    await page.waitForTimeout(400);
    await speechEnd(page, "Let me push back on that with the example of hospitals");
    await expect(lines(page, "you").filter({ hasText: "example of hospitals" })).toHaveCount(1);
    await aiKeepsTalking(page);
  });

  test("e) several speech segments in one turn become one line, in order", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    await speakDuring(page, AI);
    await speechEnd(page, "First, productivity per hour went up in the trials.");
    await page.waitForTimeout(150);
    await speechStart(page);
    await page.waitForTimeout(300);
    await speechEnd(page, "Second, burnout dropped sharply.");
    await expect(lines(page, "you")).toHaveCount(1);
    await expect(lines(page, "you").first()).toContainText("First, productivity per hour went up in the trials. Second, burnout dropped sharply.");
    await aiKeepsTalking(page);
  });

  test("f) a segment with no words releases the floor", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    await speakDuring(page, AI);
    await speechEnd(page, "");
    await aiKeepsTalking(page);
    expect(studentLines(await state(page))).toHaveLength(0);
    await expect(page.getByTestId("transcript-interim")).toHaveCount(0);
  });

  test("g) transcription failing or slow never freezes the room", async ({ page }) => {
    let mode: "fail" | "slow" = "fail";
    await page.route("**/api/stt**", async (route) => {
      if (mode === "fail") return route.fulfill({ status: 502, json: { error: "down" } });
      await new Promise((r) => setTimeout(r, 8000));
      await route.fulfill({ json: { text: "this arrived late but still counts", provider: "mock" } }).catch(() => {});
    });
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);

    // Fails: the student is told, the floor is released.
    await speakDuring(page, AI);
    await speechEnd(page); // real /api/stt client
    await expect(page.getByText(/Didn't catch that/)).toBeVisible({ timeout: 8_000 });
    await aiKeepsTalking(page);
    expect(studentLines(await state(page))).toHaveLength(0);

    // Slow: the AIs carry on after a bounded wait, and the line still lands when the transcript arrives.
    mode = "slow";
    await speakDuring(page, AI);
    await speechEnd(page);
    const t0 = Date.now();
    await expect.poll(() => state(page).then((s) => s.turnOpen || s.pendingCommits > 0), { timeout: 9_000 }).toBe(false);
    expect(Date.now() - t0).toBeLessThan(7_500);
    await aiKeepsTalking(page);
    await expect(lines(page, "you").filter({ hasText: "arrived late but still counts" })).toHaveCount(1, { timeout: 10_000 });
  });

  test.describe("h) the dominator cuts in", () => {
    // Deterministic room: the interjection is never skipped (and seat picks are stable).
    const fixRandom = (page: Page) =>
      page.evaluate(() => {
        Math.random = () => 0.5;
      });

    test("holding the floor: the student keeps talking and Arjun yields", async ({ page }) => {
      await voiceRoom(page);
      await fixRandom(page);
      await waitForPhase(page, /discussion/i);
      await speakDuring(page, AI);
      await expect.poll(() => state(page).then((s) => s.events), { timeout: 20_000, intervals: [20] }).toContain("interrupt:arjun");
      await expect(page.getByText(/cutting in/i)).toBeVisible();
      // still talking...
      await expect.poll(() => state(page).then((s) => s.events), { timeout: 5_000 }).toContain("hold:arjun");
      await waitLineEnd(page);
      expect((await state(page)).turnOpen).toBe(true);
      await speechEnd(page, "As I was saying, the pilot should start with government offices");
      await expect(lines(page, "you").filter({ hasText: "start with government offices" })).toHaveCount(1);
      const mine = studentLines(await state(page)).at(-1)!;
      expect(mine.interrupted).toBe(false);
      await aiKeepsTalking(page);
    });

    test("ceding the floor: the student stops and their line is marked as cut off", async ({ page }) => {
      await voiceRoom(page);
      await fixRandom(page);
      await waitForPhase(page, /discussion/i);
      await speakDuring(page, AI);
      await expect.poll(() => state(page).then((s) => s.events), { timeout: 20_000, intervals: [20] }).toContain("interrupt:arjun");
      await speechEnd(page, "I think the four day week would mostly help parents and");
      await expect.poll(() => state(page).then((s) => s.events), { timeout: 5_000 }).toContain("cede:arjun");
      await expect(lines(page, "you").filter({ hasText: "mostly help parents" })).toHaveCount(1);
      const mine = studentLines(await state(page)).at(-1)!;
      expect(mine.interruptedBy).toBe("arjun");
      await aiKeepsTalking(page);
    });
  });

  test("i) muting or pausing mid-speech releases the floor; speech works again afterwards", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);

    await speakDuring(page, AI);
    await page.getByTestId("mute-toggle").click();
    expect((await state(page)).turnOpen).toBe(false);
    await speechEnd(page, "this was said while muted"); // ignored
    await aiKeepsTalking(page);
    await page.getByTestId("mute-toggle").click();
    await speakDuring(page, AI);
    await speechEnd(page, "Unmuted now, and my point is about commuting costs");
    await expect(lines(page, "you").filter({ hasText: "commuting costs" })).toHaveCount(1);
    expect(studentLines(await state(page)).some((u) => u.text.includes("while muted"))).toBe(false);
    await aiKeepsTalking(page);

    // Pause mid-speech, then resume.
    await speakDuring(page, AI);
    await page.getByTestId("more-controls").click();
    await page.getByTestId("pause-toggle").click();
    await expect(page.getByTestId("paused-overlay")).toBeVisible();
    await speechEnd(page, "said during the pause");
    await page.getByTestId("resume").click();
    await expect(lines(page, "mod").filter({ hasText: /back|continue/i })).toHaveCount(1, { timeout: 15_000 });
    await aiKeepsTalking(page);
    expect(studentLines(await state(page)).some((u) => u.text.includes("during the pause"))).toBe(false);
    await speakDuring(page, AI);
    await speechEnd(page, "After the break, I want to add a point on hiring");
    await expect(lines(page, "you").filter({ hasText: "point on hiring" })).toHaveCount(1);
    await aiKeepsTalking(page);
  });

  test("j) raised hand: the moderator says 'Go ahead' and the spoken answer is taken", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /discussion/i);
    await page.getByTestId("raise-hand").click();
    await expect.poll(() => state(page).then((s) => s.handRaised)).toBe(true);
    await speakDuring(page, ["mod"], /go ahead/);
    await speechEnd(page, "Thank you. A compressed week only works if the work itself is measurable");
    await expect(lines(page, "you").filter({ hasText: "work itself is measurable" })).toHaveCount(1);
    expect((await state(page)).handRaised).toBe(false);
    await aiKeepsTalking(page);
  });

  test("k) the closing statement given by voice reaches the report", async ({ page }) => {
    await voiceRoom(page);
    await waitForPhase(page, /closing/i, 90_000);
    await expect.poll(() => state(page).then((s) => s.yourClosingTurn), { timeout: 60_000, intervals: [50] }).toBe(true);
    await speechStart(page);
    await page.waitForTimeout(500);
    const closing = "To conclude, I support a phased four day week, starting with office jobs";
    await speechEnd(page, closing);
    await expect(lines(page, "you").filter({ hasText: "phased four day week" })).toHaveCount(1);
    const mine = studentLines(await state(page)).at(-1)!;
    expect(mine.phase).toBe("closing");
    await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 60_000 });
    await expect(page.getByTestId("report-transcript-line").filter({ hasText: "phased four day week" }).first()).toBeAttached({ timeout: 30_000 });
  });
});
