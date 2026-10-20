import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import account from "../../messages/sl/account.json";
import {
  clearLoginAttempts,
  closeDb,
  createBackofficeUser,
  createDealerUser,
  deleteUsers,
  type E2eUser,
} from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;
const ROOT = "http://localhost:3000";

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const users: E2eUser[] = [];
const track = (user: E2eUser) => (users.push(user), user);

test.afterAll(async () => {
  await deleteUsers(users);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

const surfaces = [
  { name: "dealer admin", base: host("app"), create: () => createDealerUser() },
  { name: "backoffice (dev alias)", base: `${ROOT}/_dev/admin`, create: () => createBackofficeUser({ role: "support" }) },
];

async function signIn(page: Page, base: string, email: string, password: string) {
  await page.goto(`${base}/login`);
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(`${base}/account`);
}

// Waits for the server action round trip so the next fill can't race the form reset.
async function submit(page: Page, testId: string) {
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.getByTestId(testId).click(),
  ]);
}

const wrongCode = (secret: string) =>
  String((Number(generateSync({ secret })) + 500_000) % 1_000_000).padStart(6, "0");

for (const { name, base, create } of surfaces) {
  test.describe(name, () => {
    test("shows the signed-in email and the 2FA state", async ({ page }) => {
      const user = track(await create());
      await signIn(page, base, user.email, user.password);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(account.title);
      await expect(page.getByTestId("account-email")).toHaveText(user.email);
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "off");
      await expect(page.getByTestId("totp-state")).toHaveText(account.totpOff);
    });

    test("changes the password; the new one works at the next login", async ({ page }) => {
      const user = track(await create());
      await signIn(page, base, user.email, user.password);
      const newPassword = "Novo-geslo-2026!";

      await page.getByTestId("current-password").fill("not-the-password");
      await page.getByTestId("new-password").fill(newPassword);
      await page.getByTestId("confirm-password").fill(newPassword);
      await submit(page, "change-password-submit");
      await expect(page.getByTestId("account-status")).toHaveText(account.errorWrongPassword);

      await page.getByTestId("current-password").fill(user.password);
      await page.getByTestId("new-password").fill(newPassword);
      await page.getByTestId("confirm-password").fill(`${newPassword}x`);
      await submit(page, "change-password-submit");
      await expect(page.getByTestId("account-status")).toHaveText(account.errorMismatch);

      await page.getByTestId("current-password").fill(user.password);
      await page.getByTestId("new-password").fill(newPassword);
      await page.getByTestId("confirm-password").fill(newPassword);
      await submit(page, "change-password-submit");
      await expect(page.getByTestId("account-status")).toHaveText(account.passwordChanged);

      await page.getByTestId("logout").click();
      await expect(page).toHaveURL(`${base}/login`);
      await signIn(page, base, user.email, newPassword);
    });

    test("enables 2FA with a code generated from the shown secret", async ({ page }) => {
      const user = track(await create());
      await signIn(page, base, user.email, user.password);

      await submit(page, "totp-enable");
      const qr = page.getByTestId("totp-qr");
      await expect(qr).toBeVisible();
      await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
      await expect(qr).toHaveAttribute("alt", account.totpQrAlt);
      const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
      expect(secret).toMatch(/^[A-Z2-7]+$/);

      await page.getByTestId("totp-code").fill(wrongCode(secret));
      await submit(page, "totp-confirm");
      await expect(page.getByTestId("totp-error")).toHaveText(account.errorInvalidCode);
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "off");

      await page.getByTestId("totp-code").fill(generateSync({ secret }));
      await submit(page, "totp-confirm");
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "on");

      await page.reload();
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "on");
      await expect(page.getByTestId("totp-disable")).toBeVisible();
    });

    test("disabling needs password + valid code; a wrong code leaves 2FA on", async ({ page }) => {
      const user = track(await create());
      await signIn(page, base, user.email, user.password);
      await submit(page, "totp-enable");
      const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
      await page.getByTestId("totp-code").fill(generateSync({ secret }));
      await submit(page, "totp-confirm");
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "on");

      await page.getByTestId("totp-disable-password").fill(user.password);
      await page.getByTestId("totp-disable-code").fill(wrongCode(secret));
      await submit(page, "totp-disable");
      await expect(page.getByTestId("totp-error")).toHaveText(account.errorInvalidCode);
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "on");

      await page.getByTestId("totp-disable-password").fill(user.password);
      await page.getByTestId("totp-disable-code").fill(generateSync({ secret }));
      await submit(page, "totp-disable");
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "off");
      await page.reload();
      await expect(page.getByTestId("totp-state")).toHaveAttribute("data-state", "off");
    });
  });
}
