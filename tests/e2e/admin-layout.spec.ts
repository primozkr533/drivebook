import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import account from "../../messages/sl/account.json";
import { clearLoginAttempts, closeDb, createBackofficeUser, createDealerUser, deleteUsers, type E2eUser } from "./helpers/auth-users";

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
  { name: "dealer admin", origin: host("app"), base: "" },
  { name: "dealer admin (dev alias)", origin: ROOT, base: "/_dev/app" },
  { name: "backoffice", origin: host("admin"), base: "" },
  { name: "backoffice (dev alias)", origin: ROOT, base: "/_dev/admin" },
];

for (const { name, origin, base } of surfaces) {
  test(`${name}: (app) pages redirect to login without a session`, async ({ page }) => {
    for (const path of ["/", "/account"]) {
      await page.goto(`${origin}${base}${path}`);
      await expect(page).toHaveURL(`${origin}${base}/login`);
      await expect(page.getByTestId("login-email")).toBeVisible();
    }
  });
}

async function signIn(page: Page, loginUrl: string, user: E2eUser) {
  await page.goto(loginUrl);
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
}

test("the dealer header shows the nav, dealer name, email and logout", async ({ page }) => {
  const user = track(await createDealerUser());
  await signIn(page, `${host("app")}/login`, user);
  await expect(page).toHaveURL(`${host("app")}/account`);

  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: account.navAccount })).toHaveAttribute("href", "/account");
  await expect(header.getByTestId("header-context")).not.toBeEmpty();
  await expect(header.getByTestId("header-email")).toHaveText(user.email);
  await expect(header.getByTestId("logout")).toBeVisible();
  await expect(header.getByTestId("compact-menu-button")).toBeHidden();
});

test("the backoffice header under the dev alias links within the alias", async ({ page }) => {
  const user = track(await createBackofficeUser({ role: "support" }));
  await signIn(page, `${ROOT}/_dev/admin/login`, user);
  await expect(page).toHaveURL(`${ROOT}/_dev/admin/account`);

  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: account.navAccount })).toHaveAttribute("href", "/_dev/admin/account");
  await expect(header.getByTestId("header-email")).toHaveText(user.email);
  await expect(header.getByTestId("logout")).toBeVisible();
});

test.describe("at 375 px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the inline nav hides and the compact menu toggles the same links", async ({ page }) => {
    const user = track(await createDealerUser());
    await signIn(page, `${host("app")}/login`, user);
    await expect(page).toHaveURL(`${host("app")}/account`);

    const header = page.getByRole("banner");
    await expect(header.getByRole("navigation", { name: "Glavna navigacija" })).toBeHidden();

    const button = header.getByTestId("compact-menu-button");
    const panel = header.getByTestId("compact-menu-panel");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByRole("link", { name: account.navAccount })).toHaveAttribute("href", "/account");
    await expect(panel).toContainText(user.email);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
