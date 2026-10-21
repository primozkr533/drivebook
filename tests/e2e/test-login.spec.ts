import { expect, test } from "@playwright/test";

const ROOT = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const host = (label: string) => `http://${label}.${BASE_DOMAIN}:3000`;
const TEST_LOGIN = ["", "api", "test", "login"].join("/");
const DEMO_OWNER_EMAIL = "owner@demo.drivebook.si";

// Compose passes FARM_TEST_AUTH through from the same shell that runs Playwright.
const enabled = process.env.FARM_TEST_AUTH === "1";

test("the test login does not exist without FARM_TEST_AUTH", async ({ request }) => {
  test.skip(enabled, "FARM_TEST_AUTH=1 on this stack");
  for (const origin of [ROOT, host("app")]) {
    const res = await request.post(`${origin}${TEST_LOGIN}`);
    expect(res.status()).toBe(404);
    expect(res.headers()["set-cookie"] ?? "").not.toContain("db_app_session");
  }
});

test.describe("with FARM_TEST_AUTH=1", () => {
  test.skip(!enabled, "FARM_TEST_AUTH is not set on this stack");

  for (const { name, origin } of [
    { name: "dev alias", origin: ROOT },
    { name: "app. host", origin: host("app") },
  ]) {
    test(`${name}: signs the demo Owner into the dealer admin`, async ({ page }) => {
      const res = await page.request.post(`${origin}${TEST_LOGIN}`, { data: { surface: "dealer" } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        ok: true,
        user: { email: DEMO_OWNER_EMAIL, role: "owner" },
        dealerSlug: expect.any(String),
        redirect: origin === ROOT ? "/_dev/app" : "/",
      });
      const cookie = (await page.context().cookies(origin)).find((c) => c.name === "db_app_session");
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });

      await page.goto(`${origin}${body.redirect}`);
      await expect(page).not.toHaveURL(/\/login$/);
      const header = page.getByRole("banner");
      await expect(header.getByTestId("header-email")).toHaveText(DEMO_OWNER_EMAIL);
      await expect(header.getByTestId("header-context")).toContainText("Avtohiša Demo");
    });
  }

  test("the session is not accepted on the backoffice", async ({ page }) => {
    const res = await page.request.post(`${ROOT}${TEST_LOGIN}`);
    expect(res.status()).toBe(200);
    await page.goto(`${ROOT}/_dev/admin/`);
    await expect(page).toHaveURL(`${ROOT}/_dev/admin/login`);

    await page.request.post(`${host("app")}${TEST_LOGIN}`);
    await page.goto(`${host("admin")}/`);
    await expect(page).toHaveURL(`${host("admin")}/login`);
  });

  test("is not available on dealer subdomains", async ({ request }) => {
    expect((await request.post(`${host("demo")}${TEST_LOGIN}`)).status()).toBe(404);
  });
});
