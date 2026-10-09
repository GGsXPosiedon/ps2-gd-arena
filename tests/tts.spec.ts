import { expect, test, type Page, type Route } from "@playwright/test";
import { lines, noHmr, norm, pickPanel, say } from "./helpers";

// Cloud voices in a real (non-e2e) room. /api/health is stubbed to report a cloud voice provider and
// /api/tts returns generated WAV clips, so the client's chunked playback, preloading, fallbacks and
// watchdogs run for real in Chrome without spending voice credits. The browser voice is faked so
// fallbacks are fast and we can see what it said.

interface TtsCall {
  speaker: string;
  text: string;
  language: string;
  t: number;
}

/** A silent mono 16-bit WAV of `ms` milliseconds. */
function wav(ms: number): Buffer {
  const rate = 8000;
  const n = Math.round((rate * ms) / 1000);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

const clip = (route: Route, ms: number) => route.fulfill({ body: wav(ms), contentType: "audio/wav" });

/** Fake browser voice ("speaks" ~150 ms + 2 ms/char, records each utterance) and a switch for <audio> playback. */
function browserStubs() {
  const w = window as unknown as Record<string, unknown>;
  const spoken: string[] = [];
  w.__spoken = spoken;
  const voices = ["Test Voice A", "Test Voice B"].map((name, i) => ({ name, lang: "en-IN", localService: true, default: !i, voiceURI: name }));
  class Utterance {
    text: string;
    voice = null;
    lang = "";
    rate = 1;
    pitch = 1;
    onstart: ((e: unknown) => void) | null = null;
    onend: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onboundary: ((e: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  let current: Utterance | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const synth = {
    get speaking() {
      return !!current;
    },
    pending: false,
    paused: false,
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    pause() {},
    resume() {},
    speak(u: Utterance) {
      spoken.push(u.text);
      current = u;
      setTimeout(() => current === u && u.onstart?.({}), 10);
      timer = setTimeout(() => {
        if (current !== u) return;
        current = null;
        u.onend?.({});
      }, 150 + u.text.length * 2);
    },
    cancel() {
      const u = current;
      current = null;
      clearTimeout(timer);
      u?.onerror?.({ error: "interrupted" });
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });

  // __playMode: "stall" = play() resolves but nothing plays (no "ended"); "blocked" = autoplay refused.
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const mode = w.__playMode;
    if (this.src.startsWith("blob:") && mode === "stall") return Promise.resolve();
    if (this.src.startsWith("blob:") && mode === "blocked") return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    return play.call(this);
  };
}

/** Stubs health (cloud voices on) and /api/tts; returns the log of synthesis requests. */
async function cloudVoices(page: Page, respond: (call: TtsCall, route: Route) => Promise<void>) {
  const calls: TtsCall[] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { provider: "mock", fast: "mock", smart: "mock", stt: "browser", tts: "sarvam" } }),
  );
  await page.route("**/api/tts", async (route) => {
    const call = { ...route.request().postDataJSON(), t: Date.now() } as TtsCall;
    calls.push(call);
    await respond(call, route);
  });
  return calls;
}

/** Setup → room (not e2e: real voices, real pacing), typing instead of the mic. */
async function enter(page: Page, opts: { hinglish?: boolean; playMode?: "stall" | "blocked" } = {}) {
  await noHmr(page);
  await page.addInitScript(browserStubs);
  if (opts.playMode) await page.addInitScript((m) => ((window as unknown as Record<string, unknown>).__playMode = m), opts.playMode);
  await page.goto("/");
  await page.getByTestId("topic-option").first().click();
  await pickPanel(page, ["arjun", "priya", "meera"]);
  if (opts.hinglish) await page.getByTestId("language-hinglish").click();
  await page.getByTestId("input-keyboard").click();
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/room/);
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const aiLines = (page: Page) => page.locator('[data-testid="transcript-line"]:not([data-speaker="you"])');
const personaLines = (page: Page) => page.locator('[data-testid="transcript-line"]:not([data-speaker="you"]):not([data-speaker="mod"])');
/** The line's own words, without its name header or tags. */
const lineText = async (line: ReturnType<Page["locator"]>) =>
  norm(
    await line.evaluate((el) => {
      const p = el.querySelector("p");
      return (el.getAttribute("data-speaker") === "mod" ? p?.lastElementChild : p?.firstChild)?.textContent ?? "";
    }),
  );
const said = (calls: TtsCall[], speaker: string) => norm(calls.filter((c) => c.speaker === speaker).map((c) => c.text).join(" "));

test.describe("cloud voices (stubbed /api/tts, real playback)", () => {
  test("lines play as chunked clips with moving captions, and upcoming lines are synthesized ahead", async ({ page }) => {
    const calls = await cloudVoices(page, (_c, route) => clip(route, 700));
    await enter(page);

    // The caption advances while the brief plays.
    const caption = page.locator('[data-testid="transcript-live"][data-speaker="mod"] p > span.text-fg');
    await expect(caption).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await caption.innerText().catch(() => "")).length, { timeout: 10_000 }).toBeGreaterThan(20);

    await expect(lines(page, "mod").first()).toBeVisible({ timeout: 30_000 });
    const briefDone = Date.now();
    const brief = await lineText(lines(page, "mod").first());
    const briefCalls = calls.filter((c) => c.speaker === "mod" && norm(brief).includes(norm(c.text)));
    expect(briefCalls.length).toBeGreaterThanOrEqual(2); // sentence chunks, not one long request
    expect(norm(brief)).toContain(norm(briefCalls.map((c) => c.text).join(" ")));

    // While the brief was playing, the next moderator line and the opener's first line were already requested.
    const open = calls.find((c) => c.speaker === "mod" && /floor is open/i.test(c.text));
    expect(open && open.t).toBeLessThan(briefDone - 500);
    expect(calls.some((c) => c.speaker !== "mod" && c.t < briefDone - 500)).toBe(true);

    // The opener's line is spoken in full by the cloud voice, never by the browser fallback.
    const first = personaLines(page).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    expect(said(calls, (await first.getAttribute("data-speaker"))!)).toContain(await lineText(first));
    expect(await spoken(page)).toEqual([]);
  });

  test("typing over a cloud line cuts it mid-clip, the discussion carries on, and the report opens", async ({ page }) => {
    const calls = await cloudVoices(page, (c, route) => clip(route, c.speaker === "mod" ? 400 : 2500));
    await enter(page);

    const live = page.locator('[data-testid="transcript-live"]:not([data-speaker="mod"])');
    await expect(live).toBeVisible({ timeout: 40_000 });
    const speaker = (await live.getAttribute("data-speaker"))!;
    await page.waitForTimeout(900); // inside the first 2.5 s clip
    await say(page, "Let me add a point on what this costs small firms.");

    const cut = lines(page, speaker).filter({ hasText: "Cut off" }).first();
    await expect(cut).toBeVisible({ timeout: 10_000 });
    await expect(lines(page, "you").filter({ hasText: "costs small firms" })).toHaveCount(1);
    const cutText = await lineText(cut);
    expect(said(calls, speaker).startsWith(cutText)).toBe(true);
    expect(cutText.length).toBeLessThan(said(calls, speaker).length);

    // Nobody is left talking over the student, and someone picks up after them.
    const before = await aiLines(page).count();
    await expect.poll(() => aiLines(page).count(), { timeout: 30_000 }).toBeGreaterThan(before);

    await page.getByTestId("end-session").click();
    await page.getByTestId("end-confirm").click();
    await expect(page).toHaveURL(/\/report\//, { timeout: 60_000 });
    await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 30_000 });
  });

  test("failing synthesis falls back to the browser voice, then stops calling the cloud", async ({ page }) => {
    const calls = await cloudVoices(page, (_c, route) => route.fulfill({ status: 500, json: { error: "down" } }));
    await enter(page);

    await expect(lines(page, "mod").first()).toBeVisible({ timeout: 20_000 });
    const brief = await lineText(lines(page, "mod").first());
    expect(norm((await spoken(page)).join(" "))).toContain(brief);

    // Three failed lines switch cloud voices off for a while: later lines don't touch /api/tts.
    await expect.poll(() => aiLines(page).count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(3);
    const n = calls.length;
    await expect.poll(() => aiLines(page).count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(5);
    expect(calls.length).toBe(n);
  });

  test("a hanging synthesis request falls back after a few seconds instead of stalling the line", async ({ page }) => {
    await cloudVoices(page, async (c, route) => {
      // The brief's first sentence never comes back.
      if (/^Welcome/.test(c.text)) return new Promise<void>((resolve) => setTimeout(resolve, 60_000));
      await clip(route, 400);
    });
    await enter(page);

    const t0 = Date.now();
    await expect(lines(page, "mod").first()).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - t0).toBeLessThan(14_000);
    const brief = await lineText(lines(page, "mod").first());
    expect(norm((await spoken(page)).join(" "))).toContain(brief); // said by the browser voice instead

    // The next line is back on the cloud voice.
    await expect(lines(page, "mod").nth(1)).toBeVisible({ timeout: 20_000 });
    expect(norm((await spoken(page)).join(" "))).not.toContain("floor is open");
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a clip that never reports its end is advanced by the watchdog", async ({ page }) => {
    await cloudVoices(page, (_c, route) => clip(route, 300));
    await enter(page, { playMode: "stall" });

    await expect(lines(page, "mod").first()).toBeVisible({ timeout: 40_000 });
    await expect(lines(page, "mod").first()).toContainText(/topic/i);
    expect(await spoken(page)).toEqual([]); // moved on by the watchdog, not by a fallback
  });

  test("blocked autoplay falls back per line but keeps trying cloud voices", async ({ page }) => {
    const calls = await cloudVoices(page, (_c, route) => clip(route, 300));
    await enter(page, { playMode: "blocked" });

    await expect.poll(() => aiLines(page).count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(4);
    const n = calls.length;
    await expect.poll(() => aiLines(page).count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(6);
    expect(calls.length).toBeGreaterThan(n); // not switched off: a tap would bring the voices back
    expect((await spoken(page)).length).toBeGreaterThanOrEqual(4);
  });

  test("Hinglish rooms ask for Hinglish delivery", async ({ page }) => {
    const calls = await cloudVoices(page, (_c, route) => clip(route, 300));
    await enter(page, { hinglish: true });

    await expect(lines(page, "mod").first()).toBeVisible({ timeout: 30_000 });
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls.map((c) => c.language))).toEqual(new Set(["hinglish"]));
  });
});
