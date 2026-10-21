import { createElement } from "react";
import { prerender } from "react-dom/static";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "./i18n";
import { weekDays } from "@/app/site/[slug]/model";
import { emptyWeek, type WeekHours } from "@/lib/opening-hours";

vi.mock("@/app/dealer-admin/(app)/settings/hours/actions", () => ({ saveOpeningHoursAction: vi.fn() }));

const { previewDays } = await import("@/app/dealer-admin/(app)/settings/hours/preview");
const { HoursEditor } = await import("@/app/dealer-admin/(app)/settings/hours/HoursEditor");

const h = messages.settingsHours;

async function render(initial: WeekHours) {
  const element = createElement(NextIntlClientProvider, {
    locale: "sl",
    messages,
    timeZone: "Europe/Ljubljana",
    children: createElement(HoursEditor, { initial }),
  });
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

describe("previewDays", () => {
  it("draws a second range for a day as soon as it is added", () => {
    const week = { ...emptyWeek(), 1: [{ opens: "08:00", closes: "12:00" }] };
    expect(previewDays(week)[0].ranges).toEqual([["08:00", "12:00"]]);

    week[1] = [...week[1], { opens: "13:00", closes: "17:00" }];
    expect(previewDays(week)[0].ranges).toEqual([
      ["08:00", "12:00"],
      ["13:00", "17:00"],
    ]);
  });

  it("uses the public dealer page mapping (Monday first, sorted, short names)", () => {
    const week = {
      ...emptyWeek(),
      1: [
        { opens: "13:00", closes: "17:00" },
        { opens: "08:00", closes: "12:00" },
      ],
      6: [{ opens: "09:00", closes: "12:00" }],
    };
    expect(previewDays(week)).toEqual(
      weekDays([
        { isoWeekday: 1, opensAt: "13:00", closesAt: "17:00" },
        { isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" },
        { isoWeekday: 6, opensAt: "09:00", closesAt: "12:00" },
      ]),
    );
    expect(previewDays(week).map((d) => d.short)).toEqual(["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"]);
  });

  it("skips incomplete and inverted ranges instead of throwing", () => {
    const week = {
      ...emptyWeek(),
      1: [
        { opens: "", closes: "12:00" },
        { opens: "16:00", closes: "09:00" },
        { opens: "13:00", closes: "15:00" },
      ],
    };
    expect(previewDays(week)[0].ranges).toEqual([["13:00", "15:00"]]);
  });
});

describe("HoursEditor", () => {
  it("renders the week with closed days and the live preview", async () => {
    const html = await render({ ...emptyWeek(), 1: [{ opens: "08:00", closes: "12:00" }, { opens: "12:00", closes: "16:00" }] });
    expect(html).toContain(h.weekdays["1"]);
    expect(html).toContain(h.weekdays["7"]);
    expect(html).toContain('data-testid="hours-closed-7"');
    expect(html).not.toContain('data-testid="hours-closed-1"');
    expect(html).toContain("08:00–12:00 · 12:00–16:00");
    expect(html).toContain(h.preview.title);
    expect(html).not.toContain("data-error=");
  });

  it("flags overlapping and inverted ranges on their rows immediately", async () => {
    const html = await render({
      ...emptyWeek(),
      1: [
        { opens: "08:00", closes: "12:00" },
        { opens: "11:00", closes: "14:00" },
      ],
      2: [{ opens: "17:00", closes: "09:00" }],
    });
    expect(html).toMatch(/data-testid="hours-range-1-1" data-error="overlap"/);
    expect(html).toMatch(/data-testid="hours-range-2-0" data-error="end_before_start"/);
    expect(html).not.toMatch(/data-testid="hours-range-1-0" data-error=/);
    expect(html).toContain(h.errors.overlap);
    expect(html).toContain(h.errors.end_before_start);
  });
});
