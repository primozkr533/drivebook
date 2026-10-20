import { expect, test } from "@playwright/test";

test("demo dealer page lists its active cars", async ({ page }) => {
  await page.goto("/_dev/site/demo");
  await expect(page.getByRole("heading", { name: /Octavia/ })).toBeVisible();
  await expect(page.locator('a[href^="tel:+386"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "308", exact: true })).toHaveCount(0);
});

test("unknown dealer slug is a 404", async ({ page }) => {
  // Built from segments so route crawlers do not pick the missing dealer up as a page.
  const res = await page.goto(["", "_dev", "site", "ne-obstaja"].join("/"));
  expect(res?.status()).toBe(404);
});
