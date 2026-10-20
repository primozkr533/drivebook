import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import auth from "../../messages/sl/auth.json";
import {
  clearLoginAttempts,
  closeDb,
  createBackofficeUser,
  createDealerUser,
  deleteUsers,
  totpCode,
  uniqueEmail,
  type E2eUser,
} from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;

// A per-run client IP keeps these failures from tripping the shared per-IP limit on later runs.
const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const users: E2eUser[] = [];
const track = (user: E2eUser) => (users.push(user), user);

test.afterAll(async () => {
  await deleteUsers(users);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

async function signIn(page: Page, email: string, password: string) {
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await submit(page);
}

// Waits for the server action round trip so the next fill can't race the form reset.
async function submit(page: Page) {
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByTestId("login-submit").click(),
  ]);
}

const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name);

test("a dealer user signs in, lands on the account page and signs out again", async ({ page }) => {
  const user = track(await createDealerUser());
  await page.goto(`${host("app")}/login`);
  await signIn(page, user.email, user.password);

  await expect(page).toHaveURL(`${host("app")}/account`);
  expect(await cookie(page, "db_app_session")).toMatchObject({ httpOnly: true, domain: `app.${BASE_DOMAIN}` });
  expect(await cookie(page, "db_admin_session")).toBeUndefined();

  await page.goto(`${host("app")}/login`);
  await expect(page).toHaveURL(`${host("app")}/account`);

  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(`${host("app")}/login`);
  await expect(page.getByTestId("login-email")).toBeVisible();
  expect(await cookie(page, "db_app_session")).toBeUndefined();
});

test("a backoffice superadmin with 2FA signs in through the code step", async ({ page }) => {
  const user = track(await createBackofficeUser({ role: "superadmin", totp: true }));
  await page.goto(`${host("admin")}/login`);
  await signIn(page, user.email, user.password);

  const code = page.getByTestId("login-totp");
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute("inputmode", "numeric");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  expect(await cookie(page, "db_admin_session")).toBeUndefined();

  await code.fill("000000");
  await submit(page);
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorTotpInvalid);

  await page.getByTestId("login-totp").fill(totpCode(user));
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(`${host("admin")}/account`);
  expect(await cookie(page, "db_admin_session")).toMatchObject({ httpOnly: true, domain: `admin.${BASE_DOMAIN}` });
});

test("wrong credentials show one generic message", async ({ page }) => {
  const user = track(await createDealerUser());
  await page.goto(`${host("app")}/login`);

  await signIn(page, user.email, "napacno-geslo");
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorInvalid);

  await signIn(page, uniqueEmail("nobody"), "napacno-geslo");
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorInvalid);
  expect(await cookie(page, "db_app_session")).toBeUndefined();
});

test("repeated failures show the rate-limit message", async ({ page }) => {
  const email = uniqueEmail("limited");
  try {
    await page.goto(`${host("app")}/login`);
    for (let i = 0; i < 5; i++) {
      await signIn(page, email, `napacno-${i}`);
      await expect(page.getByTestId("login-error")).toHaveText(auth.errorInvalid);
    }
    await signIn(page, email, "napacno-zadnjic");
    await expect(page.getByTestId("login-error")).toHaveText(auth.errorRateLimited);
  } finally {
    await clearLoginAttempts({ emails: [email] });
  }
});
