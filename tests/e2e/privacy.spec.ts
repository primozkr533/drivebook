import { expect, test } from "@playwright/test";

test("default privacy notice names the demo dealer as controller", async ({ page }) => {
  await page.goto("/_dev/site/demo/zasebnost");
  await expect(page.getByRole("heading", { level: 1, name: "Obvestilo o varstvu osebnih podatkov" })).toBeVisible();
  await expect(page.getByText("Avtohiša Demo d.o.o.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Nazaj na stran avtohiše" })).toHaveAttribute("href", "/_dev/site/demo/");
});
