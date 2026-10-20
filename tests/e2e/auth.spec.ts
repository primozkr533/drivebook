import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import auth from "../../messages/sl/auth.json";
import {
  clearLoginAttempts,
  closeDb,
  createBackofficeUser,
  createDealerUser,
  deleteUsers,
  totpCode,
  type E2eUser,
} from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;
const url = (label: string, ...segments: string[]) => [host(label), ...segments].join("/");
const ROOT = "http://localhost:3000";

// A per-run client IP keeps these failures from tripping the shared per-IP limit on later runs.
const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const NEW_PASSWORD = "nova-Geslo-2026!";

let dealer: E2eUser;
let backoffice: E2eUser;
let limited: E2eUser;
let resetting: E2eUser;
let twoFactor: E2eUser;
const users = () => [dealer, backoffice, limited, resetting, twoFactor].filter(Boolean);

test.beforeAll(async () => {
  dealer = await createDealerUser();
  backoffice = await createBackofficeUser();
  limited = await createDealerUser();
  resetting = await createDealerUser();
  twoFactor = await createBackofficeUser({ totp: true });
  await clearLoginAttempts({ ips: [IP], emails: users().map((u) => u.email) });
});

test.afterAll(async () => {
  await deleteUsers(users());
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name);

// Waits for the server action round trip so the next fill can't race the form reset.
async function submit(page: Page, testId = "login-submit") {
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByTestId(testId).click(),
  ]);
}

async function fillLogin(page: Page, label: string, email: string, password: string) {
  await page.goto(url(label, "login"));
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
}

async function signIn(page: Page, label: string, user: Pick<E2eUser, "email">, password: string) {
  await fillLogin(page, label, user.email, password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(url(label, "account"));
}

test.describe("cross-host cookie rejection", () => {
  const cases = [
    { from: "app", to: "admin", cookieName: "db_app_session", user: () => dealer },
    { from: "admin", to: "app", cookieName: "db_admin_session", user: () => backoffice },
  ];

  for (const { from, to, cookieName, user } of cases) {
    test(`a ${from}. session is host-only and rejected on ${to}.`, async ({ page }) => {
      await signIn(page, from, user(), user().password);
      const session = await cookie(page, cookieName);
      expect(session?.domain).toBe(`${from}.${BASE_DOMAIN}`);

      await page.context().addCookies(
        ["db_app_session", "db_admin_session"].map((name) => ({ name, value: session!.value, url: host(to) })),
      );
      await page.goto(url(to, "account"));
      await expect(page).toHaveURL(url(to, "login"));
      await expect(page.getByTestId("login-email")).toBeVisible();
    });
  }
});

test("after 5 wrong passwords the correct one shows the rate-limit message", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await fillLogin(page, "app", limited.email, `napacno-${i}`);
    await submit(page);
    await expect(page.getByTestId("login-error")).toHaveText(auth.errorInvalid);
  }
  await fillLogin(page, "app", limited.email, limited.password);
  await submit(page);
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorRateLimited);
  await expect(page).toHaveURL(url("app", "login"));
  expect(await cookie(page, "db_app_session")).toBeUndefined();
});

test("password reset through the dev inbox link", async ({ page }) => {
  await page.goto(url("app", "forgot-password"));
  await page.getByTestId("forgot-email").fill(resetting.email);
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toHaveText(auth.forgotSent);

  // The worker sends the e-mail asynchronously, so poll the inbox until it lands.
  const message = page.getByTestId("inbox-message").filter({ hasText: resetting.email }).first();
  await expect(async () => {
    await page.goto(`${ROOT}/_dev/inbox`);
    await expect(message).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  const link = message.getByTestId("inbox-link").filter({ hasText: "reset-password" }).first();
  const resetUrl = await link.getAttribute("href");
  expect(resetUrl).toContain(url("app", "reset-password"));
  await link.click();

  await page.getByTestId("new-password").fill(NEW_PASSWORD);
  await page.getByTestId("confirm-password").fill(NEW_PASSWORD);
  await page.getByTestId("set-password-submit").click();
  await expect(page).toHaveURL(new RegExp(`^${host("app")}/(account)?$`));
  await expect(page.getByTestId("signed-in-as")).toContainText(resetting.email);

  await page.getByTestId("logout").first().click();
  await expect(page).toHaveURL(url("app", "login"));
  expect(await cookie(page, "db_app_session")).toBeUndefined();

  await signIn(page, "app", resetting, NEW_PASSWORD);

  await page.goto(resetUrl!);
  await expect(page.getByTestId("link-status")).toHaveText(auth.linkUsed);
  await expect(page.getByTestId("new-password")).toHaveCount(0);
});

test("a user with 2FA signs in only with the correct code", async ({ page }) => {
  await fillLogin(page, "admin", twoFactor.email, twoFactor.password);
  await submit(page);

  const code = page.getByTestId("login-totp");
  await expect(code).toBeVisible();
  expect(await cookie(page, "db_admin_session")).toBeUndefined();

  const wrong = String((Number(generateSync({ secret: twoFactor.totpSecret! })) + 500_000) % 1_000_000).padStart(6, "0");
  await code.fill(wrong);
  await submit(page);
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorTotpInvalid);
  expect(await cookie(page, "db_admin_session")).toBeUndefined();

  await page.getByTestId("login-totp").fill(totpCode(twoFactor));
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(url("admin", "account"));
  expect(await cookie(page, "db_admin_session")).toMatchObject({ httpOnly: true, domain: `admin.${BASE_DOMAIN}` });
});
