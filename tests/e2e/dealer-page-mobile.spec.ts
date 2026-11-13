import { expect, test, type Page } from "@playwright/test";
import { closeDb, createDealer, deleteDealers, type E2eDealer } from "./helpers/auth-users";
import { addCarsWithImages, setDealerLogoKey } from "./helpers/cars";

const site = (slug: string) => ["", "_dev", "site", slug].join("/");

test.use({ viewport: { width: 360, height: 740 } });

type ImgInfo = { src: string; width: string | null; height: string | null; loading: string | null; fetchPriority: string | null; top: number };

async function images(page: Page): Promise<ImgInfo[]> {
  return page.locator("img").evaluateAll((els) =>
    els.map((el) => ({
      src: el.getAttribute("src") ?? "",
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      loading: el.getAttribute("loading"),
      fetchPriority: el.getAttribute("fetchpriority"),
      top: el.getBoundingClientRect().top + window.scrollY,
    })),
  );
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

function expectDimensionsAndLazy(imgs: ImgInfo[], viewportHeight: number) {
  for (const img of imgs) {
    expect(Number(img.width), img.src).toBeGreaterThan(0);
    expect(Number(img.height), img.src).toBeGreaterThan(0);
    if (img.top >= viewportHeight) expect(img.loading, img.src).toBe("lazy");
  }
}

test("demo dealer page at 360 px: images have dimensions, no horizontal scroll", async ({ page }) => {
  await page.goto(site("demo"));
  await expect(page.getByRole("heading", { name: /Octavia/ })).toBeVisible();
  expectDimensionsAndLazy(await images(page), 740);
  await expectNoHorizontalScroll(page);
});

test.describe("dealer with a logo and car photos", () => {
  let dealer: E2eDealer;

  test.beforeAll(async () => {
    dealer = await createDealer();
    await setDealerLogoKey(dealer.id, "logos/e2e-missing.png");
    await addCarsWithImages(dealer.id, 5);
  });

  test.afterAll(async () => {
    await deleteDealers([dealer]);
    await closeDb();
  });

  test("at 360 px only the first car photo loads eagerly, the rest are lazy, and nothing scrolls sideways", async ({ page }) => {
    await page.goto(site(dealer.slug));
    await expect(page.getByRole("heading", { name: "Octavia 5", exact: true })).toBeVisible();

    const imgs = await images(page);
    const logo = imgs.filter((i) => i.src.includes("logos/"));
    const carPhotos = imgs.filter((i) => i.src.includes("cars/"));
    expect(logo).toHaveLength(1);
    expect(carPhotos).toHaveLength(5);

    expectDimensionsAndLazy(imgs, 740);
    expect(carPhotos[0]!.loading).toBe("eager");
    expect(carPhotos[0]!.fetchPriority).toBe("high");
    for (const photo of carPhotos.slice(1)) expect(photo.loading).toBe("lazy");
    await expect(page.locator("img[decoding='async']")).toHaveCount(imgs.length);

    await expectNoHorizontalScroll(page);
  });
});
