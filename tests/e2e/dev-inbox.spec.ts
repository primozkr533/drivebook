import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDb } from "@/db/client";
import { createFakeEmailProvider } from "@/server/notify/providers/fake";

// Writes to the running stack's database (DATABASE_URL, the compose db on localhost by default).
test.afterAll(() => getDb().$client.end());

test("dev inbox shows an e-mail captured by the fake provider", async ({ page }) => {
  const marker = randomUUID().slice(0, 8);
  const link = `http://app.drivebook.localhost:3000/set-password?token=${marker}`;
  await createFakeEmailProvider().send({
    to: `kupec-${marker}@example.si`,
    senderName: "Avtohiša Demo",
    subject: `Povabilo ${marker}`,
    html: `<p>Povabilo ${marker}</p>`,
    text: `Nastavite geslo: ${link}`,
  });

  await page.goto("/_dev");
  await page.locator(`a[href="/_dev/inbox"]`).click();
  await expect(page).toHaveURL(/\/_dev\/inbox$/);
  await expect(page.getByRole("heading", { level: 1, name: "Razvojni nabiralnik" })).toBeVisible();

  const message = page.getByTestId("inbox-message").filter({ hasText: `Povabilo ${marker}` });
  await expect(message).toBeVisible();
  await expect(message.getByText(`kupec-${marker}@example.si`)).toBeVisible();
  await expect(message.getByTestId("inbox-link")).toHaveAttribute("href", link);

  await message.getByRole("button", { name: "Prikaži HTML" }).click();
  await expect(message.frameLocator("iframe").getByText(`Povabilo ${marker}`)).toBeVisible();
});
