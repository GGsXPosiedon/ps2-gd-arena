import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_SESSION } from "../src/lib/fixtures/sampleSession";
import { enterRoom, lines, noHmr, pickPanel, say, waitForPhase } from "./helpers";

test.beforeEach(async ({ page }) => {
  await noHmr(page);
});

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

/** A finished session with a report, stored as if this browser ran it (the sample isn't practisable). */
async function seedSession(page: Page, id: string) {
  // "Practise This" is hidden in offline demo mode; pretend a real provider is configured.
  await page.route("**/api/health", (route) => route.fulfill({ json: { provider: "gemini", fast: "x", smart: "y", stt: "browser", tts: "browser" } }));
  await page.goto("/");
  await page.evaluate(
    ([s, id]) => {
      localStorage.setItem(`floor:session:${id}`, JSON.stringify({ ...s, id }));
      localStorage.setItem("floor:sessions", JSON.stringify([id]));
    },
    [SAMPLE_SESSION, id] as const,
  );
}

test("theme choice persists across pages and reloads", async ({ page }) => {
  await page.goto("/");
  const start = await theme(page);
  const other = start === "dark" ? "light" : "dark";
  await page.getByTestId("theme-toggle").click();
  await expect.poll(() => theme(page)).toBe(other);
  await page.reload();
  await expect.poll(() => theme(page)).toBe(other);
  // The phone browser bar follows the chosen theme.
  const bar = other === "light" ? "#ffffff" : "#000000";
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content))).toEqual([bar, bar]);
  await page.getByTestId("topic-option").first().click();
  await expect(page.getByTestId("enter-room")).toBeVisible();
  expect(await theme(page)).toBe(other);
  await page.goto("/report/sample");
  await expect(page.getByTestId("report")).toBeVisible();
  expect(await theme(page)).toBe(other);
  await page.getByTestId("theme-toggle").click();
  await expect.poll(() => theme(page)).toBe(start);
});

test("reloading the setup step keeps the topic, panel and name chosen so far", async ({ page }) => {
  await page.goto("/");
  const topic = "Should campuses allow laptops in exams?";
  await page.getByTestId("custom-topic-input").fill(topic);
  await page.getByTestId("custom-topic-input").press("Enter");
  await expect(page.getByTestId("topic-change")).toBeVisible();
  await pickPanel(page, ["priya", "meera", "rohan", "kabir"]);
  await page.getByTestId("name-input").fill("Riya");
  await page.getByTestId("input-keyboard").click();

  await page.reload();
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();
  await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(4);
  await expect(page.getByTestId("persona-card-kabir")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("name-input")).toHaveValue("Riya");
});

test("setup choices carry into the room and the report: name, Hinglish, typing", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByTestId("topic-option").first().click();
  await pickPanel(page, ["arjun", "priya", "meera"]);
  await page.getByTestId("name-input").fill("Kiran");
  await page.getByTestId("language-hinglish").click();
  await page.getByTestId("input-keyboard").click();
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/room/);

  // Hinglish moderator, typing mode with the message box ready.
  await expect(lines(page, "mod").filter({ hasText: /Kaun start karna chahega/ })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId("composer-input")).toBeEnabled();
  await say(page, "Mera point simple hai, small businesses ke liye yeh mushkil hoga");
  await expect(lines(page, "you").filter({ hasText: "small businesses" })).toHaveCount(1);
  await expect(page.getByTestId("seat-you")).toContainText("Kiran");

  await page.getByTestId("end-session").click();
  await page.getByTestId("end-confirm").click();
  await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Hinglish", { exact: true })).toBeVisible();
  await expect(page.getByText("Typed Session", { exact: true })).toBeVisible();
});

test("call controls: pause and resume, captions, transcript panel, end dialog", async ({ page }) => {
  await enterRoom(page);
  await waitForPhase(page, /Opening|Discussion/);

  // Pause from the More menu stops everything; Resume brings it back.
  await page.getByTestId("more-controls").click();
  await page.getByTestId("pause-toggle").click();
  await expect(page.getByTestId("paused-overlay")).toBeVisible();
  await expect(page.getByTestId("composer-input")).toBeDisabled();
  const frozen = await page.getByTestId("timer").innerText();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("timer")).toHaveText(frozen);
  await page.getByTestId("resume").click();
  await expect(page.getByTestId("paused-overlay")).toHaveCount(0);
  await expect(page.getByTestId("composer-input")).toBeEnabled();

  // P toggles pause from the keyboard (outside the message box).
  await page.getByTestId("host-bar").click();
  await page.keyboard.press("p");
  await expect(page.getByTestId("paused-overlay")).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.getByTestId("paused-overlay")).toHaveCount(0);

  // Captions: menu item and the C key.
  await expect(page.getByTestId("captions")).toBeVisible();
  await page.getByTestId("more-controls").click();
  await page.getByTestId("cc-toggle").click();
  await expect(page.getByTestId("captions")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByTestId("host-bar").click();
  await page.keyboard.press("c");
  await expect(page.getByTestId("captions")).toBeVisible();

  // The transcript panel can be hidden; the keyboard button brings it back with the cursor in the box.
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("transcript")).toHaveCount(0);
  await page.getByTestId("mute-toggle").click();
  await expect(page.getByTestId("composer-input")).toBeFocused();

  // End dialog: Cancel and Escape keep the call going; End goes to the report.
  await page.getByTestId("end-session").click();
  await expect(page.getByRole("dialog", { name: "End the discussion?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "End the discussion?" })).toHaveCount(0);
  await page.getByTestId("end-session").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "End the discussion?" })).toHaveCount(0);
  await page.getByTestId("end-session").click();
  await page.getByTestId("end-confirm").click();
  await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
});

test("browser Back mid-discussion asks before leaving instead of dropping the session", async ({ page }) => {
  await enterRoom(page);
  await waitForPhase(page, /Opening|Discussion/);
  await say(page, "Let me open with a simple definition of the topic");
  await page.goBack();
  await expect(page).toHaveURL(/\/room$/);
  await expect(page.getByRole("dialog", { name: "End the discussion?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(lines(page, "you").filter({ hasText: "simple definition" })).toHaveCount(1);
  await expect(page.getByTestId("composer-input")).toBeEnabled();

  await page.goBack();
  await page.getByTestId("end-confirm").click();
  await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("report-transcript-line").filter({ hasText: "simple definition" })).toHaveCount(1);
});

test("Practise This carries the drill focus into setup and the room; Practice Again clears it", async ({ page }) => {
  await seedSession(page, "drill1");
  await page.goto("/report/drill1");
  await expect(page.getByTestId("readiness")).toBeVisible();
  await page.getByRole("button", { name: "Practise This" }).first().click();
  await expect(page).toHaveURL(/step=table/);
  const chip = page.getByTestId("setup-focus");
  await expect(chip).toBeVisible();
  const focus = ((await chip.innerText()).split("Focus:")[1] ?? "").trim();
  expect(focus.length).toBeGreaterThan(5);

  // Into a (fast, e2e) room: the goal stays on screen during the discussion.
  await page.goto("/?step=table&e2e=1");
  await expect(page.getByTestId("setup-focus")).toContainText(focus);
  await page.getByTestId("input-keyboard").click();
  await page.getByTestId("enter-room").click();
  await expect(page.getByText(`Your focus: ${focus}`)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("end-session").click();
  await page.getByTestId("end-confirm").click();
  await expect(page).toHaveURL(/\/report\/[a-z0-9]+$/, { timeout: 30_000 });

  // Removing it on setup, and Practice Again, both clear it.
  await page.getByTestId("practice-again").click();
  await expect(page.getByTestId("enter-room")).toBeVisible();
  await expect(page.getByTestId("setup-focus")).toHaveCount(0);
  await page.goto("/report/drill1");
  await page.getByRole("button", { name: "Practise This" }).first().click();
  await page.getByRole("button", { name: "Remove focus" }).click();
  await expect(page.getByTestId("setup-focus")).toHaveCount(0);
});

test("report: moment filters, jump to a line in the transcript, transcript filters, export", async ({ page }) => {
  await page.goto("/report/sample");
  await expect(page.getByTestId("readiness")).toBeVisible();

  // Moment filters show only their kind.
  const filters = page.getByRole("group", { name: "Filter moments" });
  await filters.getByRole("button", { name: /Try Next Time/ }).click();
  const cards = page.getByTestId("feedback-card");
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) expect(text).toContain("Try Next Time");
  await filters.getByRole("button", { name: /^All/ }).click();

  // Go to Line opens the transcript at that line; Escape closes it and focus returns.
  const go = cards.first().getByRole("button", { name: "Go to Line" });
  const quote = (await cards.first().getByTestId("quote").innerText()).slice(0, 30);
  await go.click();
  const drawer = page.getByRole("dialog", { name: "Transcript" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("report-transcript-line").filter({ hasText: quote })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(go).toBeFocused();

  // Transcript filters.
  await page.getByRole("button", { name: /^Transcript/ }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Only Me" }).click();
  const shown = drawer.locator('[data-testid="report-transcript-line"]:not([hidden])');
  await expect(shown.first()).toBeVisible();
  const you = SAMPLE_SESSION.utterances.filter((u) => u.speaker === "you").length;
  await expect(shown).toHaveCount(you);
  await drawer.getByRole("button", { name: "Close transcript" }).click();

  // Export downloads the transcript as text.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("gd-transcript-sample.txt");
});

test("unknown pages show a branded 404 that links home", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: /This page isn.t here/ })).toBeVisible();
  await page.getByTestId("not-found-home").click();
  await expect(page.getByTestId("custom-topic-input")).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("typing mode: the message box is on screen and sends", async ({ page }) => {
    await enterRoom(page);
    await expect(page.getByTestId("composer-input")).toBeInViewport();
    await waitForPhase(page, /Opening|Discussion/).catch(() => {}); // phase label is hidden on phones
    await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 30_000 });
    await say(page, "On a phone I can still type my point");
    await expect(lines(page, "you").filter({ hasText: "type my point" })).toHaveCount(1);

    // Back to the tiles; the keyboard button reopens the message box.
    await page.getByTestId("chat-toggle").click();
    await expect(page.getByTestId("seat-you")).toBeVisible();
    await page.getByTestId("mute-toggle").click();
    await expect(page.getByTestId("composer-input")).toBeFocused();
  });

  test("no page scrolls sideways or logs errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const noSideScroll = async (where: string) => {
      const [sw, w] = await page.evaluate(() => [document.scrollingElement!.scrollWidth, innerWidth]);
      expect(sw, `${where} scrolls sideways`).toBeLessThanOrEqual(w);
    };

    await page.goto("/?e2e=1");
    await expect(page.getByTestId("custom-topic-input")).toBeVisible();
    await noSideScroll("home");
    await page.getByTestId("topic-option").last().click();
    await pickPanel(page, ["arjun", "priya", "meera", "rohan", "ananya"]);
    await noSideScroll("setup");
    await page.getByTestId("input-keyboard").click();
    await page.getByTestId("enter-room").click();
    await expect(page.getByTestId("room")).toBeVisible();
    await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 30_000 });
    await noSideScroll("room");
    await page.getByTestId("end-session").click();
    await page.getByTestId("end-confirm").click();
    await expect(page.getByTestId("report")).toBeVisible({ timeout: 30_000 });
    await noSideScroll("report");
    await page.goto("/report/sample");
    await expect(page.getByTestId("readiness")).toBeVisible();
    await noSideScroll("sample report");
    expect(errors).toEqual([]);
  });
});
