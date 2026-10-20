import { expect, test } from "@playwright/test";

test("design showcase renders a heading", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading").first()).toBeVisible();
});
