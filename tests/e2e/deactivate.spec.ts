import { execFile } from "node:child_process";
import { randomInt } from "node:crypto";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import auth from "../../messages/sl/auth.json";
import { clearLoginAttempts, closeDb, createDealerUser, deleteUsers, type E2eUser } from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;
const url = (label: string, ...segments: string[]) => [host(label), ...segments].join("/");
const ROOT = "http://localhost:3000";

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

let active: E2eUser;
let invited: E2eUser;
const users = () => [active, invited].filter(Boolean);

test.beforeAll(async () => {
  active = await createDealerUser();
  invited = await createDealerUser({ status: "invited" });
  await clearLoginAttempts({ ips: [IP], emails: users().map((u) => u.email) });
});

test.afterAll(async () => {
  await deleteUsers(users());
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

// Runs the real operator CLI against the stack's database (DATABASE_URL, like the user helper).
async function userAdmin(...args: string[]) {
  const { stdout } = await promisify(execFile)("npx", ["tsx", "src/server/auth/user-admin-cli.ts", ...args], {
    cwd: process.cwd(),
    env: process.env,
  });
  return stdout;
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.goto(url("app", "login"));
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

test("a deactivated user loses their session and cannot sign in again", async ({ page }) => {
  await fillLogin(page, active.email, active.password);
  await expect(page).toHaveURL(url("app", "account"));
  await expect(page.getByTestId("signed-in-as")).toContainText(active.email);

  expect(await userAdmin("deactivate", "--surface", "dealer", "--email", active.email)).toContain(active.email);

  await page.reload();
  await expect(page).toHaveURL(url("app", "login"));
  await expect(page.getByTestId("login-email")).toBeVisible();

  await fillLogin(page, active.email, active.password);
  await expect(page.getByTestId("login-error")).toHaveText(auth.errorInvalid);
  await expect(page).toHaveURL(url("app", "login"));
});

test("resend-invite prints a set-password link that arrives in the dev inbox", async ({ page }) => {
  const stdout = await userAdmin("resend-invite", "--surface", "dealer", "--email", invited.email);
  const link = stdout.match(/^Set-password link: (\S+)$/m)?.[1];
  expect(link).toContain(url("app", "set-password"));

  const message = page.getByTestId("inbox-message").filter({ hasText: invited.email }).first();
  await expect(async () => {
    await page.goto(`${ROOT}/_dev/inbox`);
    await expect(message).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(message.getByTestId("inbox-link").filter({ hasText: "set-password" }).first()).toHaveAttribute(
    "href",
    link!,
  );
});
