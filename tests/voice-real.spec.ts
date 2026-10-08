import path from "node:path";
import { expect, test } from "@playwright/test";
import { lines, noHmr, pickPanel, waitForPhase } from "./helpers";

// Real audio through the real pipeline: Chrome plays a recorded speech clip as the microphone, the neural VAD
// detects the speech, the segment is sent to /api/stt (mocked here so the test is fast and free), and the
// transcript shows up as the student's line.
const clip = path.join(__dirname, "fixtures", "speech.wav");
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${clip}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

test("spoken audio is detected, transcribed on the server and added to the transcript", async ({ page }) => {
  const sttCalls: string[] = [];
  await page.route("**/api/stt**", async (route) => {
    sttCalls.push(route.request().headers()["content-type"] ?? "");
    await route.fulfill({ json: { text: "I think a four day week could work in some sectors", provider: "mock" } });
  });

  await noHmr(page);
  await page.goto("/?e2e=1");
  await page.getByTestId("topic-option").first().click();
  await pickPanel(page, ["arjun", "priya", "meera"]);
  await page.getByTestId("input-mic").click();
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/room/);
  await waitForPhase(page, /discussion/i);

  await expect(lines(page, "you").filter({ hasText: "four day week could work" }).first()).toBeVisible({ timeout: 45_000 });
  expect(sttCalls.length).toBeGreaterThan(0);
  expect(sttCalls[0]).toContain("audio/wav");
});
