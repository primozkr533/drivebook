import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import auth from "../../messages/sl/auth.json";
import {
  closeDb,
  createBackofficeUser,
  createDealerUser,
  deleteUsers,
  issueLinkToken,
  uniqueEmail,
  type E2eUser,
} from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;
const url = (label: string, ...segments: string[]) => [host(label), ...segments].join("/");
const ROOT = "http://localhost:3000";

const NEW_PASSWORD = "nova-Geslo-2026!";
const tooShort = auth.errorPasswordTooShort.replace("{min}", "10");

const users: E2eUser[] = [];
const track = (user: E2eUser) => (users.push(user), user);

test.afterAll(async () => {
  await deleteUsers(users);
  await closeDb();
});

const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name);

async function submitPassword(page: Page, password: string, confirm: string) {
  await page.getByTestId("new-password").fill(password);
  await page.getByTestId("confirm-password").fill(confirm);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByTestId("set-password-submit").click(),
  ]);
}

test("an invited dealer user sets a password and lands signed in on the app home", async ({ page }) => {
  const user = track(await createDealerUser({ status: "invited" }));
  const token = await issueLinkToken(user, "invite");
  await page.goto(url("app", "set-password", token));

  await submitPassword(page, "kratko", "kratko");
  await expect(page.getByText(tooShort)).toBeVisible();

  await submitPassword(page, NEW_PASSWORD, `${NEW_PASSWORD}x`);
  await expect(page.getByText(auth.errorPasswordMismatch)).toBeVisible();
  expect(await cookie(page, "db_app_session")).toBeUndefined();

  await page.getByTestId("new-password").fill(NEW_PASSWORD);
  await page.getByTestId("confirm-password").fill(NEW_PASSWORD);
  await page.getByTestId("set-password-submit").click();
  await expect(page).toHaveURL(`${host("app")}/`);
  await expect(page.getByTestId("signed-in-as")).toContainText(user.email);
  expect(await cookie(page, "db_app_session")).toMatchObject({ httpOnly: true, domain: `app.${BASE_DOMAIN}` });

  await page.goto(url("app", "set-password", token));
  await expect(page.getByTestId("link-status")).toHaveText(auth.linkUsed);
});

test("a backoffice user resets the password through a reset link", async ({ page }) => {
  const user = track(await createBackofficeUser());
  const token = await issueLinkToken(user, "reset");
  await page.goto(url("admin", "reset-password", token));

  await page.getByTestId("new-password").fill(NEW_PASSWORD);
  await page.getByTestId("confirm-password").fill(NEW_PASSWORD);
  await page.getByTestId("set-password-submit").click();
  await expect(page).toHaveURL(`${host("admin")}/`);
  expect(await cookie(page, "db_admin_session")).toMatchObject({ httpOnly: true, domain: `admin.${BASE_DOMAIN}` });
});

test("used, expired and garbage links show their link-status message", async ({ page }) => {
  const invited = track(await createDealerUser({ status: "invited" }));
  const active = track(await createBackofficeUser());

  await page.goto(url("app", "set-password", await issueLinkToken(invited, "invite", { state: "used" })));
  await expect(page.getByTestId("link-status")).toHaveText(auth.linkUsed);
  await expect(page.getByTestId("new-password")).toHaveCount(0);

  await page.goto(url("app", "set-password", await issueLinkToken(invited, "invite", { state: "expired" })));
  await expect(page.getByTestId("link-status")).toHaveText(auth.inviteExpired);

  await page.goto(url("app", "set-password", "ni-veljaven-zeton"));
  await expect(page.getByTestId("link-status")).toHaveText(auth.linkInvalid);

  await page.goto(url("admin", "reset-password", await issueLinkToken(active, "reset", { state: "expired" })));
  await expect(page.getByTestId("link-status")).toHaveText(auth.resetExpired);
  await expect(page.getByRole("link", { name: auth.requestNewLink })).toHaveAttribute(
    "href",
    ["", "forgot-password"].join("/"),
  );

  // An invite token is not a reset token.
  await page.goto(url("app", "reset-password", await issueLinkToken(invited, "invite")));
  await expect(page.getByTestId("link-status")).toHaveText(auth.linkInvalid);
});

test("forgot-password shows the same confirmation for a known and an unknown e-mail", async ({ page }) => {
  const user = track(await createDealerUser());
  const texts: string[] = [];
  for (const email of [user.email, uniqueEmail("nobody")]) {
    await page.goto(url("app", "forgot-password"));
    await page.getByTestId("forgot-email").fill(email);
    await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-sent")).toHaveText(auth.forgotSent);
    texts.push((await page.locator("main").textContent()) ?? "");
  }
  expect(texts[0]).toBe(texts[1]);
});

test("the login page links to forgot-password", async ({ page }) => {
  await page.goto(url("admin", "login"));
  await page.getByRole("link", { name: auth.forgotPassword }).click();
  await expect(page).toHaveURL(url("admin", "forgot-password"));
  await expect(page.getByTestId("forgot-email")).toBeVisible();
});

test("a reset link opened from the dev inbox on localhost stays on the localhost origin", async ({ page }) => {
  const user = track(await createDealerUser());
  // A per-run client IP keeps this request clear of the shared per-IP limit.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${randomInt(1, 255)}` });
  await page.goto([ROOT, "_dev", "app", "forgot-password"].join("/"));
  await page.getByTestId("forgot-email").fill(user.email);
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toHaveText(auth.forgotSent);

  // The worker sends the e-mail asynchronously, so poll the inbox until it lands.
  const message = page.getByTestId("inbox-message").filter({ hasText: user.email }).first();
  await expect(async () => {
    await page.goto(`${ROOT}/_dev/inbox`);
    await expect(message).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  const link = message.getByTestId("inbox-link").filter({ hasText: "reset-password" }).first();
  await expect(link).toContainText(url("app", "reset-password"));
  expect(await link.getAttribute("href")).toMatch(/^\/_dev\/app\/reset-password\/[^/?#]+$/);
  await link.click();
  await expect(page).toHaveURL((u) => u.origin === ROOT && /^\/_dev\/app\/reset-password\//.test(u.pathname));

  await page.getByTestId("new-password").fill(NEW_PASSWORD);
  await page.getByTestId("confirm-password").fill(NEW_PASSWORD);
  await page.getByTestId("set-password-submit").click();
  await expect(page).toHaveURL((u) => u.origin === ROOT && /^\/_dev\/app(\/account)?\/?$/.test(u.pathname));
  await expect(page.getByTestId("signed-in-as")).toContainText(user.email);
  expect(await cookie(page, "db_app_session")).toMatchObject({ httpOnly: true, domain: "localhost" });
});
