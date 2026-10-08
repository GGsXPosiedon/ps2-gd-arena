import { expect, test } from "@playwright/test";
import { SAMPLE_SESSION } from "../src/lib/fixtures/sampleSession";
import { noHmr, norm } from "./helpers";

test.beforeEach(async ({ page }) => {
  await noHmr(page);
});

test.describe("setup page", () => {
  test("topics, categories, custom topic, panel limits, provider badge", async ({ page }) => {
    await page.goto("/");
    const topics = page.getByTestId("topic-option");
    await expect(topics.first()).toBeVisible();
    const firstBusiness = await topics.first().innerText();

    // Category tabs switch the topic list.
    await page.getByRole("tab", { name: "Abstract" }).click();
    await expect(topics.first()).not.toHaveText(firstBusiness);
    await expect(page.getByTestId("topic-option").filter({ hasText: /^Zero$/ })).toBeVisible();
    await page.getByRole("tab", { name: "Case-based" }).click();
    await expect(page.getByTestId("topic-option").filter({ hasText: "D2C snack brand" })).toBeVisible();

    // Custom topic validation: a too-short topic stays on step 1 with an inline error.
    const custom = page.getByTestId("custom-topic-input");
    await custom.fill("ab");
    await custom.press("Enter");
    await expect(page.getByText(/at least 4 characters/i)).toBeVisible();
    await expect(page.getByTestId("persona-card-arjun")).toHaveCount(0);

    // A valid custom topic reveals the panel + settings with that topic in the header.
    await custom.fill("Should exams be open book?");
    await custom.press("Enter");
    await expect(page.getByText("Should exams be open book?")).toBeVisible();
    await expect(page.getByTestId("persona-card-arjun")).toBeVisible();

    // Change goes back to the topic list; Surprise me picks a topic and moves on.
    await page.getByTestId("topic-change").click();
    await expect(page.getByTestId("topic-option").first()).toBeVisible();
    await page.getByTestId("surprise-me").click();
    await expect(page.getByTestId("topic-change")).toBeVisible();

    // Panel size 3: can't go below 3.
    await page.getByTestId("panel-size-3").click();
    await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(3);
    await expect(page.getByTestId("persona-card-arjun")).toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("persona-card-arjun").click({ force: true });
    await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(3);
    await expect(page.getByTestId("persona-card-arjun")).toHaveAttribute("aria-pressed", "true");

    // Panel size 5: can't go above 5.
    await page.getByTestId("panel-size-5").click();
    await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(5);
    await expect(page.getByTestId("persona-card-kabir")).toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("persona-card-kabir").click({ force: true });
    await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(5);
    await expect(page.getByTestId("persona-card-kabir")).toHaveAttribute("aria-pressed", "false");

    // Toggling inside the limits works.
    await page.getByTestId("panel-size-4").click();
    await page.getByTestId("persona-card-kabir").click();
    await expect(page.locator('[data-testid^="persona-card-"][aria-pressed="true"]')).toHaveCount(5);

    // Settings controls exist.
    await page.getByTestId("language-hinglish").click();
    await expect(page.getByTestId("language-hinglish")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("duration-6").click();
    await expect(page.getByTestId("duration-6")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("patience-slider")).toBeVisible();
    await page.getByTestId("captions-toggle").click();
    await expect(page.getByTestId("captions-toggle")).toHaveAttribute("aria-checked", "false");

    // AI disclosure + mock provider badge.
    await expect(page.getByText(/except you is an AI/i)).toBeVisible();
    await expect(page.getByText(/Offline demo mode/i)).toBeVisible();

    // Enter → mic check.
    await page.getByTestId("enter-room").click();
    await expect(page).toHaveURL(/\/check$/);
    await expect(page.getByTestId("continue-typing")).toBeVisible();
  });
});

test.describe("sample report", () => {
  test("renders scores, timeline, evidence quotes found in the transcript, missed openings", async ({ page }) => {
    await page.goto("/report/sample");
    await expect(page.getByTestId("report")).toBeVisible();
    await expect(page.getByTestId("readiness")).toBeVisible({ timeout: 30_000 });
    for (const c of ["initiation", "ideas", "building", "listening", "interruptions", "ending"]) {
      await expect(page.getByTestId(`score-${c}`)).toBeVisible();
    }
    await expect(page.getByTestId("timeline-lane-you")).toBeVisible();

    const cards = page.getByTestId("feedback-card");
    await expect(cards.first()).toBeVisible();
    const transcript = (await page.getByTestId("report-transcript-line").allInnerTexts()).map(norm);
    expect(transcript.length).toBeGreaterThan(5);
    const quotes = await page.getByTestId("quote").allInnerTexts();
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      const nq = norm(q);
      expect(nq.length).toBeGreaterThan(0);
      expect(transcript.some((t) => t.includes(nq)), `quote not found in transcript: ${q}`).toBe(true);
    }
    await expect(page.getByTestId("missed-opening").first()).toBeVisible();
    await expect(page.getByTestId("practice-again")).toBeVisible();
  });

  test("shows retry when AI analysis is unavailable, and retry replaces it", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/report", async (route) => {
      calls++;
      const res = await route.fetch();
      const body = await res.json();
      body.source = calls === 1 ? "heuristic" : "llm";
      if (calls > 1) body.summary = "Retried analysis summary.";
      await route.fulfill({ response: res, json: body });
    });
    // Retry is only offered for real sessions with a real AI provider (not the sample, not demo mode).
    await page.route("**/api/health", (route) => route.fulfill({ json: { provider: "gemini", fast: "x", smart: "y", stt: "browser", tts: "browser" } }));
    await page.goto("/");
    await page.evaluate((s) => {
      localStorage.setItem("floor:session:retry1", JSON.stringify({ ...s, id: "retry1", report: undefined }));
      localStorage.setItem("floor:sessions", JSON.stringify(["retry1"]));
    }, SAMPLE_SESSION);
    await page.goto("/report/retry1");
    await expect(page.getByTestId("retry-feedback")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Rule-Based Feedback/i)).toBeVisible();
    await page.getByTestId("retry-feedback").click();
    await expect(page.getByText("Retried analysis summary.")).toBeVisible();
    await expect(page.getByTestId("retry-feedback")).toHaveCount(0);
    expect(calls).toBe(2);
  });

  test("report API down: metrics still render and retry is offered", async ({ page }) => {
    await page.route("**/api/report", (route) => route.fulfill({ status: 500, body: "boom" }));
    // A stored session without a cached report (the sample ships with one, so it never calls the API).
    await page.goto("/");
    await page.evaluate((s) => {
      localStorage.setItem("floor:session:down1", JSON.stringify({ ...s, id: "down1", report: undefined }));
      localStorage.setItem("floor:sessions", JSON.stringify(["down1"]));
    }, SAMPLE_SESSION);
    await page.goto("/report/down1");
    await expect(page.getByTestId("report")).toBeVisible();
    await expect(page.getByTestId("timeline-lane-you")).toBeVisible();
    await expect(page.getByTestId("retry-feedback")).toBeVisible({ timeout: 30_000 });
  });

  test("unknown report id shows not-found", async ({ page }) => {
    await page.goto("/report/does-not-exist");
    await expect(page.getByText(/Report not found/i)).toBeVisible();
  });
});
