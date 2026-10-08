import { expect, type Page } from "@playwright/test";

/** Lowercase, drop punctuation/quotes, collapse whitespace — for "quote appears in transcript" checks. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/…/g, " ")
    .replace(/[“”"'‘’.,!?;:()\[\]—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Next dev only: when the HMR socket drops (e.g. context.setOffline) and reconnects to a server whose
 * build changed (other edits), the dev client reloads the page mid-session. Proxy the socket and never
 * surface a disconnect to the page, so it never reconnects/reloads. Messages are still forwarded
 * (Turbopack needs them to load chunks for newly visited routes). No effect on production builds.
 */
export async function noHmr(page: Page) {
  await page.routeWebSocket(/\/_next\/(webpack-)?hmr/, (ws) => {
    const server = ws.connectToServer();
    server.onClose(() => {});
  });
}

/** Setup → check → room in e2e mode (silent fast captions, 40 s discussion, typed input). */
export async function enterRoom(page: Page, opts: { name?: string; panel?: 3 | 4 | 5 } = {}) {
  await noHmr(page);
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("topic-option").first()).toBeVisible();
  await page.getByTestId("topic-option").first().click();
  await page.getByTestId(`panel-size-${opts.panel ?? 3}`).click();
  if (opts.name) await page.getByTestId("name-input").fill(opts.name);
  await page.getByTestId("enter-room").click();
  await expect(page).toHaveURL(/\/check$/);
  await page.getByTestId("continue-typing").click();
  await expect(page).toHaveURL(/\/room$/);
  await expect(page.getByTestId("room")).toBeVisible();
  await page.getByTestId("join-voice").click();
}

export function lines(page: Page, speaker?: string) {
  return speaker
    ? page.locator(`[data-testid="transcript-line"][data-speaker="${speaker}"]`)
    : page.getByTestId("transcript-line");
}

/** Waits until the room's phase indicator mentions `phase` (case-insensitive). */
export async function waitForPhase(page: Page, phase: RegExp, timeout = 60_000) {
  await expect(page.getByTestId("phase")).toHaveText(phase, { timeout });
}

/** Sends a typed line through the room composer. */
export async function say(page: Page, text: string) {
  const input = page.getByTestId("composer-input");
  await input.fill(text);
  await input.press("Enter");
}
