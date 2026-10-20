import { expect, test } from "@playwright/test";

const ROOT = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "drivebook.localhost";
const PORT = 3000;

const host = (label: string) => `http://${label}.${BASE_DOMAIN}:${PORT}`;

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(90_000);
  const api = await playwright.request.newContext();
  try {
    // The web container migrates and seeds on start; until then the demo dealer is unknown (404) or the DB is down (5xx).
    await expect
      .poll(async () => (await api.get(`${ROOT}/_dev/site/demo`).catch(() => null))?.status(), {
        timeout: 60_000,
        intervals: [1_000],
      })
      .toBe(200);
  } finally {
    await api.dispose();
  }
});

test("root host / ends on /design", async ({ page }) => {
  await page.goto(`${ROOT}/`);
  await expect(page).toHaveURL(/\/design$/);
});

test.describe("dealer subdomain", () => {
  test("shows the demo dealer and its active cars only", async ({ page }) => {
    const res = await page.goto(`${host("demo")}/`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Avtohiša Demo", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Octavia/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "308", exact: true })).toHaveCount(0);
  });

  test("?car= puts the selected car first", async ({ page }) => {
    await page.goto(`${host("demo")}/?car=bR5nW0tGk2YfA9xM`);
    await expect(page.locator("article").first().getByRole("heading", { level: 3 })).toHaveText("Clio");
  });

  test("privacy notice names the dealer", async ({ page }) => {
    const res = await page.goto(`${host("demo")}/zasebnost`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Avtohiša Demo d.o.o.").first()).toBeVisible();
  });

  test("old slug answers 301 to the new subdomain, keeping path and query", async ({ request }) => {
    const res = await request.get(`${host("avtohisa-demo")}/abc?car=1`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toBe(`${host("demo")}/abc?car=1`);
  });

  for (const label of ["nope-dealer", "www"]) {
    test(`${label}. is a 404`, async ({ page }) => {
      const res = await page.goto(`${host(label)}/`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Strani ni mogoče najti" })).toBeVisible();
    });
  }
});

test.describe("login surfaces", () => {
  test("app. redirects to /login", async ({ page }) => {
    await page.goto(`${host("app")}/`);
    await expect(page).toHaveURL(`${host("app")}/login`);
    await expect(page.getByRole("heading", { name: "Prijava za avtohiše" })).toBeVisible();
  });

  test("admin. serves the backoffice login", async ({ page }) => {
    const res = await page.goto(`${host("admin")}/login`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Prijava v zaledni sistem" })).toBeVisible();
  });
});

test.describe("surface isolation", () => {
  const crossSurface = [
    `${host("app")}/backoffice/login`,
    `${host("admin")}/dealer-admin/login`,
    `${host("demo")}/dealer-admin/login`,
    `${ROOT}/site/demo`,
  ];
  for (const url of crossSurface) {
    test(`${url} is a 404`, async ({ request }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }
});

test.describe("dev aliases", () => {
  test("/_dev/site/demo shows the dealer page", async ({ page }) => {
    await page.goto(`${ROOT}/_dev/site/demo`);
    await expect(page.getByRole("heading", { name: /Octavia/ })).toBeVisible();
  });

  test("/_dev/app/login shows the dealer login", async ({ page }) => {
    await page.goto(`${ROOT}/_dev/app/login`);
    await expect(page.getByRole("heading", { name: "Prijava za avtohiše" })).toBeVisible();
  });

  test("/_dev/admin/login shows the backoffice login", async ({ page }) => {
    await page.goto(`${ROOT}/_dev/admin/login`);
    await expect(page.getByRole("heading", { name: "Prijava v zaledni sistem" })).toBeVisible();
  });
});
