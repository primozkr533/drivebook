import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  backdateSessions,
  clearLoginAttempts,
  closeDb,
  createBackofficeUser,
  createDealerUser,
  deleteUsers,
  sessionExpiries,
  type E2eUser,
} from "./helpers/auth-users";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const ROOT = "http://localhost:3000";
const DAY_S = 24 * 60 * 60;

const IP = `198.51.100.${randomInt(1, 255)}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": IP } });

const users: E2eUser[] = [];

test.afterAll(async () => {
  await deleteUsers(users);
  await clearLoginAttempts({ ips: [IP] });
  await closeDb();
});

const surfaces = [
  {
    name: "dealer admin",
    base: `http://app.${BASE_DOMAIN}:3000`,
    cookie: "db_app_session",
    create: () => createDealerUser(),
  },
  { name: "backoffice (dev alias)", base: `${ROOT}/_dev/admin`, cookie: "db_admin_session", create: () => createBackofficeUser() },
];

async function signIn(page: Page, base: string, user: E2eUser) {
  await page.goto(`${base}/login`);
  await page.getByTestId("login-email").fill(user.email);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(`${base}/account`);
}

for (const { name, base, cookie, create } of surfaces) {
  test(`${name}: opening a page renews the session cookie`, async ({ page, context }) => {
    const user = await create();
    users.push(user);
    await signIn(page, base, user);

    const issued = (await context.cookies(base)).find((c) => c.name === cookie);
    expect(issued).toBeDefined();
    // Shorten the browser's copy so a renewal is visible regardless of how fast the test runs.
    const shortened = Math.floor(Date.now() / 1000) + DAY_S;
    await context.addCookies([{ ...issued!, expires: shortened }]);
    await backdateSessions(user, new Date(Date.now() - 2 * 60 * 60 * 1000));
    const [before] = await sessionExpiries(user);

    const renewed = await page.goto(`${base}/account`);
    expect(renewed?.request().method()).toBe("GET");
    expect(renewed?.status()).toBe(200);
    const after = (await context.cookies(base)).find((c) => c.name === cookie);
    expect(after?.value).toBe(issued!.value);
    expect(after!.expires).toBeGreaterThan(shortened + 28 * DAY_S);
    expect((await sessionExpiries(user))[0]!.getTime()).toBeGreaterThan(before!.getTime());

    // Refreshed just now, so the next page view sends no cookie.
    const fresh = await page.goto(`${base}/account`);
    expect(await fresh?.headerValue("set-cookie")).toBeNull();
  });
}
