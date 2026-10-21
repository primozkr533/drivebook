import { describe, expect, it } from "vitest";
import type { Car } from "@/components/signature";
import type { PublicDealer } from "@/server/data/dealers";
import { buildDealerPageModel } from "./model";

const dealer: PublicDealer = {
  name: "Avtohiša Demo",
  legalName: "Avtohiša Demo d.o.o.",
  addressLine: "Tržaška cesta 1",
  postalCode: "1000",
  city: "Ljubljana",
  phone: "+386 1 234 56 78",
  email: "info@demo.test",
  websiteUrl: null,
  googleMapsUrl: null,
  privacyPolicyUrl: null,
  primaryColor: "#0055AA",
  logoUrl: null,
  status: "active",
};

const car = (id: string, model: string): Car => ({
  id,
  make: "Make",
  model,
  year: 2022,
  priceEur: 20000,
  avtoNetUrl: `https://www.avto.net/${id}`,
  active: true,
});

const cars = [car("a", "Octavia Combi"), car("b", "Tiguan"), car("c", "Clio")];
const now = { dateISO: "2026-10-20", isoWeekday: 2, minutes: 600 } as const;

const build = (over: Partial<Parameters<typeof buildDealerPageModel>[0]> = {}) =>
  buildDealerPageModel({ dealer, cars, hours: [], now, carParam: undefined, basePath: "", ...over });

describe("buildDealerPageModel", () => {
  it("keeps the data-layer order with nothing selected by default", () => {
    const m = build();
    expect(m.cars.map((c) => c.car.id)).toEqual(["a", "b", "c"]);
    expect(m.cars.some((c) => c.selected)).toBe(false);
  });

  it("moves the ?car match first and selects it", () => {
    const m = build({ carParam: "c" });
    expect(m.cars.map((c) => [c.car.id, c.selected])).toEqual([
      ["c", true],
      ["a", false],
      ["b", false],
    ]);
  });

  it("ignores an unknown or inactive car param", () => {
    const withInactive = [...cars, { ...car("d", "308"), active: false }];
    for (const carParam of ["zzz", "d", ""]) {
      const m = build({ cars: withInactive, carParam });
      expect(m.cars.map((c) => c.car.id)).toEqual(["a", "b", "c"]);
      expect(m.cars.some((c) => c.selected)).toBe(false);
    }
  });

  it("uses the first value of a repeated car param", () => {
    expect(build({ carParam: ["b", "c"] }).cars[0]).toMatchObject({ car: { id: "b" }, selected: true });
  });

  it("shows no cars for a suspended dealer", () => {
    const m = build({ dealer: { ...dealer, status: "suspended" }, carParam: "a" });
    expect(m.suspended).toBe(true);
    expect(m.cars).toEqual([]);
  });

  it("strips spaces from the tel: href", () => {
    expect(build().telHref).toBe("tel:+38612345678");
  });

  it("prefers the dealer's googleMapsUrl", () => {
    expect(build({ dealer: { ...dealer, googleMapsUrl: "https://maps.app.goo.gl/x" } }).mapsHref).toBe(
      "https://maps.app.goo.gl/x",
    );
  });

  it("falls back to a Google Maps search of the address", () => {
    expect(build().mapsHref).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent("Avtohiša Demo, Tržaška cesta 1, 1000 Ljubljana"),
    );
  });

  it("exposes the full contact data", () => {
    const m = build();
    expect(m.phone).toBe("+386 1 234 56 78");
    expect(m.address).toEqual({ line: "Tržaška cesta 1", locality: "1000 Ljubljana" });
  });

  it("hides the phone, address and maps link when contact data is empty", () => {
    for (const status of ["active", "suspended"] as const) {
      const m = build({ dealer: { ...dealer, status, addressLine: "", postalCode: "", city: "", phone: "" } });
      expect(m.phone).toBeNull();
      expect(m.telHref).toBeNull();
      expect(m.address).toBeNull();
      expect(m.mapsHref).toBeNull();
    }
  });

  it("treats whitespace-only contact fields as empty", () => {
    const m = build({ dealer: { ...dealer, addressLine: " ", postalCode: " ", city: "", phone: "  " } });
    expect(m.telHref).toBeNull();
    expect(m.address).toBeNull();
    expect(m.mapsHref).toBeNull();
  });

  it("hides the maps link without an address even when googleMapsUrl is set", () => {
    const m = build({
      dealer: { ...dealer, addressLine: "", postalCode: "", city: "", googleMapsUrl: "https://maps.app.goo.gl/x" },
    });
    expect(m.mapsHref).toBeNull();
  });

  it("builds the maps query from the non-empty parts of a partial address", () => {
    const search = (q: string) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
    const cityOnly = build({ dealer: { ...dealer, addressLine: "", postalCode: "" } });
    expect(cityOnly.address).toEqual({ line: null, locality: "Ljubljana" });
    expect(cityOnly.mapsHref).toBe(search("Avtohiša Demo, Ljubljana"));

    const lineOnly = build({ dealer: { ...dealer, postalCode: "", city: "" } });
    expect(lineOnly.address).toEqual({ line: "Tržaška cesta 1", locality: null });
    expect(lineOnly.mapsHref).toBe(search("Avtohiša Demo, Tržaška cesta 1"));

    const postalOnly = build({ dealer: { ...dealer, addressLine: "", city: "" } });
    expect(postalOnly.mapsHref).toBe(search("Avtohiša Demo, 1000"));
  });

  it("keeps the phone with an empty address", () => {
    const m = build({ dealer: { ...dealer, addressLine: "", postalCode: "", city: "" } });
    expect(m.telHref).toBe("tel:+38612345678");
    expect(m.address).toBeNull();
  });

  it("links the dealer's own privacy policy when set", () => {
    expect(build({ dealer: { ...dealer, privacyPolicyUrl: "https://demo.si/zasebnost" } }).privacy).toEqual({
      href: "https://demo.si/zasebnost",
      external: true,
    });
  });

  it("falls back to the platform notice under the base path", () => {
    expect(build({ basePath: "/_dev/site/demo" }).privacy).toEqual({ href: "/_dev/site/demo/zasebnost", external: false });
    expect(build().privacy.href).toBe(["", "zasebnost"].join("/"));
  });

  it("exposes a mailto: link only when the e-mail is set", () => {
    expect(build()).toMatchObject({ email: "info@demo.test", emailHref: "mailto:info@demo.test" });
    for (const email of ["", "  "]) {
      expect(build({ dealer: { ...dealer, email } })).toMatchObject({ email: null, emailHref: null });
    }
  });

  it("has no closed dates and keeps today's hours without closures", () => {
    const m = build({ hours: [{ isoWeekday: 2, opensAt: "08:00", closesAt: "16:00" }] });
    expect(m.closedDates).toEqual([]);
    expect(m.days[1]).toEqual({ short: "Tor", ranges: [["08:00", "16:00"]] });
  });

  it("marks today closed by a custom closure and lists it with its reason", () => {
    const m = build({
      hours: [{ isoWeekday: 2, opensAt: "08:00", closesAt: "16:00" }],
      closures: {
        today: { closed: true, reason: "closure", closureReason: "Inventura" },
        upcoming: [
          { date: "2026-10-20", reason: "closure", closureReason: "Inventura" },
          { date: "2026-10-21", reason: "closure", closureReason: "Inventura" },
        ],
      },
    });
    expect(m.days[1]).toEqual({ short: "Tor", ranges: [], note: "Inventura" });
    expect(m.closedDates).toEqual([
      { date: "20. 10. 2026", label: "Inventura" },
      { date: "21. 10. 2026", label: "Inventura" },
    ]);
  });

  it("names holidays by key and leaves closures without a reason unlabelled", () => {
    const names: Record<string, string> = { reformation: "dan reformacije" };
    const m = build({
      holidayName: (key) => names[key],
      closures: {
        today: { closed: true, reason: "holiday", holidayKey: "reformation" },
        upcoming: [
          { date: "2026-10-20", reason: "holiday", holidayKey: "reformation" },
          { date: "2026-10-22", reason: "closure", closureReason: null },
          { date: "2026-10-23", reason: "holiday" },
        ],
      },
    });
    expect(m.days[1]).toMatchObject({ ranges: [], note: "dan reformacije" });
    expect(m.closedDates.map((c) => c.label)).toEqual(["dan reformacije", null, null]);
  });

  it("builds all seven lanes with closed days empty and today as a 0-based index", () => {
    const m = build({
      hours: [
        { isoWeekday: 1, opensAt: "13:00", closesAt: "17:00" },
        { isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" },
        { isoWeekday: 6, opensAt: "09:00", closesAt: "12:00" },
      ],
    });
    expect(m.days.map((d) => d.short)).toEqual(["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"]);
    expect(m.days[0].ranges).toEqual([
      ["08:00", "12:00"],
      ["13:00", "17:00"],
    ]);
    expect(m.days[6].ranges).toEqual([]);
    expect(m.today).toBe(1);
    expect(m.nowMin).toBe(600);
  });
});
