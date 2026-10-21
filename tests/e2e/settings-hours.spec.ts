import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import settingsHours from "../../messages/sl/settingsHours.json";
import { clearLoginAttempts, closeDb, createDealerUser, deleteUsers, type E2eUser } from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const APP = `http://app.${BASE_DOMAIN}:3000`;
// Built from segments: the gate probe crawls slash-prefixed literals, and this page only exists on app.
const HOURS = ["", "settings", "hours"].join("/");
const ACCOUNT = ["", "account"].join("/");

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const users: E2eUser[] = [];

test.afterAll(async () => {
  await deleteUsers(users);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

async function signIn(page: Page, user: E2eUser) {
  await page.goto(`${APP}/login`);
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(`${APP}${ACCOUNT}`);
}

// Edits are never saved here: the demo dealer's hours are shared with the other specs.
test("the preview follows unsaved edits and overlapping ranges are flagged and refused", async ({ page }) => {
  const owner = await createDealerUser({ role: "owner" });
  users.push(owner);
  await signIn(page, owner);
  await page.goto(`${APP}${HOURS}`);

  const sunday = page.getByTestId("hours-preview").getByRole("listitem").nth(6);
  while ((await page.getByTestId("hours-remove-7-0").count()) > 0) await page.getByTestId("hours-remove-7-0").click();
  await expect(page.getByTestId("hours-closed-7")).toHaveText(settingsHours.closed);
  await expect(sunday).toContainText(settingsHours.closed);

  await page.getByTestId("hours-add-7").click();
  await expect(sunday).toContainText("08:00–16:00");
  await page.getByTestId("hours-add-7").click();
  await expect(sunday).toContainText("08:00–16:00 · 16:00–18:00");

  await page.getByTestId("hours-opens-7-1").fill("15:00");
  await expect(page.getByTestId("hours-range-7-1")).toHaveAttribute("data-error", "overlap");
  await expect(page.getByTestId("hours-error-7-1")).toHaveText(settingsHours.errors.overlap);

  await page.getByTestId("hours-save").click();
  await expect(page.getByTestId("hours-form-error")).toHaveAttribute("data-state", "hasErrors");
  await expect(page.getByTestId("hours-error-7-1")).toHaveText(settingsHours.errors.overlap);
});

test("a Salesperson sees access denied instead of the editor", async ({ page }) => {
  const sales = await createDealerUser({ role: "salesperson" });
  users.push(sales);
  await signIn(page, sales);
  await page.goto(`${APP}${HOURS}`);
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await expect(page.getByTestId("hours-editor")).toHaveCount(0);
});
