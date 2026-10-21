import { createElement } from "react";
import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import { privacyNotice } from "@/components/privacy/notice";
import type { PublicDealer, ResolvedDealerSlug } from "@/server/data/dealers";

const resolveDealerSlug = vi.fn<(slug: string) => Promise<ResolvedDealerSlug>>();
const requestHeaders = new Headers();

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "privacy") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/server/data/dealers", () => ({ resolveDealerSlug: (slug: string) => resolveDealerSlug(slug) }));

const { default: PrivacyPage } = await import("@/app/site/[slug]/zasebnost/page");

const p = messages.privacy;
const t = createTranslator({ locale: "sl", messages, namespace: "privacy" });

const demo: PublicDealer = {
  name: "Avtohiša Demo",
  legalName: "Avtohiša Demo d.o.o.",
  addressLine: "Dunajska cesta 100",
  postalCode: "1000",
  city: "Ljubljana",
  phone: "+386 1 234 56 78",
  email: "info@demo.drivebook.localhost",
  websiteUrl: null,
  googleMapsUrl: null,
  privacyPolicyUrl: null,
  primaryColor: "#E4572E",
  logoUrl: null,
  status: "active",
};

function current(dealer: PublicDealer): ResolvedDealerSlug {
  return { kind: "current", dealer, ctx: {} as never };
}

async function render(slug: string) {
  const element = await PrivacyPage({ params: Promise.resolve({ slug }) });
  const { prelude } = await prerender(createElement(() => element));
  return new Response(prelude).text();
}

describe("privacyNotice", () => {
  it("formats the controller, contact and back link from dealer values", () => {
    const notice = privacyNotice(t, demo, "/_dev/site/demo");
    expect(notice.title).toBe(p.title);
    expect(notice.controller).toBe("Upravljavec osebnih podatkov je Avtohiša Demo d.o.o., Dunajska cesta 100, 1000 Ljubljana.");
    expect(notice.contact).toBe("Kontakt upravljavca: info@demo.drivebook.localhost, +386 1 234 56 78.");
    expect(notice.processor).toBe(p.processor);
    expect(notice.sections).toEqual([
      { heading: p.dataHeading, body: p.dataBody },
      { heading: p.purposeHeading, body: p.purposeBody },
      { heading: p.retentionHeading, body: p.retentionBody },
      { heading: p.rightsHeading, body: p.rightsBody },
    ]);
    expect(notice.back).toEqual({ label: p.back, href: "/_dev/site/demo/" });
  });

  const noAddress = { addressLine: " ", postalCode: "", city: "  " };

  it("drops the address from the controller sentence when it is empty", () => {
    const notice = privacyNotice(t, { ...demo, ...noAddress }, "");
    expect(notice.controller).toBe("Upravljavec osebnih podatkov je Avtohiša Demo d.o.o.");
    expect(notice.contact).toBe("Kontakt upravljavca: info@demo.drivebook.localhost, +386 1 234 56 78.");
  });

  it("drops the phone from the contact sentence when it is empty", () => {
    const notice = privacyNotice(t, { ...demo, phone: "   " }, "");
    expect(notice.controller).toBe("Upravljavec osebnih podatkov je Avtohiša Demo d.o.o., Dunajska cesta 100, 1000 Ljubljana.");
    expect(notice.contact).toBe("Kontakt upravljavca: info@demo.drivebook.localhost.");
  });

  it("drops both when address and phone are empty", () => {
    const notice = privacyNotice(t, { ...demo, ...noAddress, legalName: "Avto Novak", phone: "" }, "");
    expect(notice.controller).toBe("Upravljavec osebnih podatkov je Avto Novak.");
    expect(notice.contact).toBe("Kontakt upravljavca: info@demo.drivebook.localhost.");
    for (const s of [notice.controller, notice.contact]) {
      expect(s).not.toMatch(/, ,|, \.|  /);
    }
  });

  it("shows only the address parts that are present", () => {
    expect(privacyNotice(t, { ...demo, addressLine: "", postalCode: "", city: " Maribor " }, "").controller).toBe(
      "Upravljavec osebnih podatkov je Avtohiša Demo d.o.o., Maribor.",
    );
    expect(privacyNotice(t, { ...demo, postalCode: "", city: "" }, "").controller).toBe(
      "Upravljavec osebnih podatkov je Avtohiša Demo d.o.o., Dunajska cesta 100.",
    );
  });

  it("links back to the host root when there is no base path", () => {
    expect(privacyNotice(t, demo, "").back.href).toBe("/");
  });
});

describe("privacy page", () => {
  beforeEach(() => {
    resolveDealerSlug.mockReset();
    requestHeaders.delete("x-drivebook-base-path");
  });

  it("renders the notice with the dealer as controller, branded and with a back link", async () => {
    resolveDealerSlug.mockResolvedValue(current(demo));
    requestHeaders.set("x-drivebook-base-path", "/_dev/site/demo");
    const html = await render("demo");
    expect(resolveDealerSlug).toHaveBeenCalledWith("demo");
    expect(html).toContain(`>${p.title}</h1>`);
    expect(html).toContain("Avtohiša Demo d.o.o., Dunajska cesta 100, 1000 Ljubljana");
    expect(html).toContain(`>${p.rightsHeading}</h2>`);
    expect(html).toContain("--brand:#E4572E");
    expect(html).toMatch(new RegExp(`<a [^>]*href="/_dev/site/demo/"[^>]*>${p.back}</a>`));
  });

  it("redirects to the dealer's own privacy URL", async () => {
    resolveDealerSlug.mockResolvedValue(current({ ...demo, privacyPolicyUrl: "https://avto.example/zasebnost" }));
    await expect(render("demo")).rejects.toThrow("NEXT_REDIRECT https://avto.example/zasebnost");
  });

  it.each<ResolvedDealerSlug>([{ kind: "unknown" }, { kind: "renamed", slug: "demo" }])("404s for $kind slugs", async (r) => {
    resolveDealerSlug.mockResolvedValue(r);
    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
