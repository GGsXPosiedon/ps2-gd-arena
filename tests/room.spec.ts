import { expect, test } from "@playwright/test";
import { enterRoom, lines, noHmr, norm, say, waitForPhase, pickPanel } from "./helpers";

const AI = ["arjun", "priya", "meera"];

test.describe("live GD room (e2e mode: mock AI, silent captions, 40 s discussion)", () => {
  test("full demo flow: brief → discussion → raise hand → closing → report", async ({ page }) => {
    await enterRoom(page, { name: "Aditi", panel: 3 });

    // Seats for the 3 AIs and the student; the moderator is the host bar, not a seat.
    for (const id of [...AI, "you"]) await expect(page.getByTestId(`seat-${id}`)).toBeVisible();
    await expect(page.getByTestId("seat-mod")).toHaveCount(0);
    await expect(page.getByTestId("host-bar")).toBeVisible();
    await expect(page.getByTestId("phase")).toHaveText(/Brief|Opening|Discussion/);

    // Moderator brief lands in the transcript.
    await expect(lines(page, "mod").first()).toContainText(/topic/i);

    // Someone is visibly speaking at some point.
    await page.waitForSelector('[data-testid^="seat-"][data-speaking="true"]', { timeout: 30_000 });

    await waitForPhase(page, /Discussion/);
    await expect(page.getByTestId("timer")).toHaveText(/\d\d:\d\d/);

    // The student makes a point by typing.
    const point1 = "Building on Priya's point, small businesses cannot afford this change";
    await say(page, point1);
    await expect(lines(page, "you").filter({ hasText: "small businesses cannot afford" })).toHaveCount(1);

    // At least two different AI participants speak.
    await expect
      .poll(
        async () => {
          const speakers = await lines(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-speaker")));
          return new Set(speakers.filter((s) => s && ["arjun", "priya", "meera"].includes(s))).size;
        },
        { timeout: 40_000 },
      )
      .toBeGreaterThanOrEqual(2);

    // Raise hand → moderator gives the floor → student speaks.
    await page.getByTestId("raise-hand").click();
    await expect(page.getByTestId("raise-hand")).toHaveAttribute("aria-pressed", "true");
    await expect(lines(page, "mod").filter({ hasText: /Go ahead/ })).toHaveCount(1, { timeout: 30_000 });
    const point2 = "Let me add that the government could pilot this in public offices first";
    await say(page, point2);
    await expect(lines(page, "you").filter({ hasText: "pilot this in public offices" })).toHaveCount(1);

    // Closing round: the moderator calls on Aditi by name, she concludes.
    await waitForPhase(page, /Closing/, 90_000);
    await expect(page.getByText("Your turn to conclude")).toBeVisible({ timeout: 60_000 });
    await expect(lines(page, "mod").filter({ hasText: "Aditi" }).last()).toBeVisible();
    const closing = "To conclude, I support a phased four day week starting with office jobs";
    await say(page, closing);

    // Report.
    await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 60_000 });
    await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 30_000 });
    for (const c of ["initiation", "ideas", "building", "listening", "interruptions", "ending"]) {
      await expect(page.getByTestId(`score-${c}`)).toBeVisible();
    }
    await expect(page.getByTestId("feedback-card").first()).toBeVisible();
    const quotes = (await page.getByTestId("quote").allInnerTexts()).map(norm);
    const studentLines = [point1, point2, closing].map(norm);
    expect(quotes.some((q) => studentLines.some((l) => l.includes(q) || q.includes(l)))).toBe(true);
    await expect(page.getByTestId("timeline-lane-you")).toBeVisible();

    // The session shows up in "Recent sessions" on the setup page.
    await page.getByTestId("new-discussion").first().click();
    await page.getByText(/^Recent sessions/).click(); // collapsed by default
    await expect(page.getByTestId("recent-session").first()).toBeVisible();
  });

  test("offline pauses the room and freezes the timer; reconnecting resumes it", async ({ page, context }) => {
    await enterRoom(page, { name: "Aditi" });
    await waitForPhase(page, /Discussion/);
    await expect(lines(page).nth(3)).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await expect(page.getByTestId("reconnecting")).toBeVisible();
    const t1 = await page.getByTestId("timer").innerText();
    await page.waitForTimeout(2500);
    expect(await page.getByTestId("timer").innerText()).toBe(t1);

    await context.setOffline(false);
    await expect(page.getByTestId("reconnecting")).toBeHidden();
    // The moderator resumes and the discussion continues.
    await expect(lines(page, "mod").filter({ hasText: /back|continue/i })).toHaveCount(1, { timeout: 30_000 });
    const before = await lines(page).count();
    await expect.poll(() => lines(page).count(), { timeout: 30_000 }).toBeGreaterThan(before);
  });

  test("AI calls failing: the room keeps going (fallback), then recovers", async ({ page }) => {
    await enterRoom(page, { name: "Aditi" });
    await waitForPhase(page, /Discussion/);
    await expect(lines(page).nth(3)).toBeVisible({ timeout: 30_000 });

    await page.route("**/api/turn", (r) => r.fulfill({ status: 502, body: "down" }));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The moderator fills in with a scripted prompt and the degraded chip shows.
    await expect(page.getByText(/AI is having trouble/i)).toBeVisible({ timeout: 45_000 });
    const fallbacks = /different perspective|example to support|other side|practical first step/i;
    await expect(lines(page, "mod").filter({ hasText: fallbacks }).first()).toBeVisible({ timeout: 30_000 });

    await page.unroute("**/api/turn");
    // AI participants speak again.
    const aiCount = () =>
      lines(page)
        .evaluateAll((els) => els.filter((e) => ["arjun", "priya", "meera", "rohan"].includes(e.getAttribute("data-speaker") ?? "")).length);
    const before = await aiCount();
    await expect.poll(aiCount, { timeout: 40_000 }).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  test("ending early saves a report", async ({ page }) => {
    await enterRoom(page, { name: "Aditi" });
    await waitForPhase(page, /Discussion/);
    await say(page, "I think we should look at the impact on small towns as well");
    await expect(lines(page, "you")).toHaveCount(1);
    await page.getByTestId("end-session").click();
    await page.getByTestId("end-confirm").click();
    await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
    await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-transcript-line").filter({ hasText: "impact on small towns" })).toHaveCount(1);
  });
});

test("visiting /room directly shows the pre-join screen, and Start works", async ({ page }) => {
  await enterRoom(page, { name: "Aditi" });
  await waitForPhase(page, /brief|opening|discussion/i);
  // Reload (no ?start=1): audio needs a fresh click, so the lobby asks for one.
  await page.goto("/room");
  await expect(page.getByTestId("join-voice")).toBeVisible();
  await page.getByTestId("join-voice").click();
  await waitForPhase(page, /brief|opening|discussion/i);
  await expect(lines(page, "mod").first()).toBeVisible({ timeout: 15_000 });
});

test.describe("microphone denied", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const deny = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = deny;
    });
  });

  test("mic test on the setup step explains the block and switches to typing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("topic-option").first().click();
    await page.getByTestId("input-mic").click();
    await page.getByTestId("test-mic").click();
    await expect(page.getByText(/Microphone access is blocked/i)).toBeVisible();
    await expect(page.getByTestId("input-keyboard")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("enter-room")).toBeEnabled();
  });

  test("room falls back to typing when the mic is denied mid-join", async ({ page }) => {
    await noHmr(page);
    await page.goto("/");
    await page.getByTestId("topic-option").first().click();
    await pickPanel(page, ["arjun", "priya", "meera"]);
    // Mic chosen but never tested (or permission revoked later): the room falls back to typing.
    await page.getByTestId("input-mic").click();
    await page.getByTestId("enter-room").click();
    await expect(page).toHaveURL(/\/room/);
    await expect(page.getByText(/Microphone access is blocked/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("composer-input")).toBeEnabled();
    await say(page, "Typing works even without a microphone");
    await expect(lines(page, "you").filter({ hasText: "without a microphone" })).toHaveCount(1);
    await page.getByTestId("end-session").click();
    await page.getByTestId("end-confirm").click();
    await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
  });
});
