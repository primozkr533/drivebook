"use server";

import { DealerReadOnlyError, ForbiddenError, requireDealerUser } from "@/server/auth/permissions";
import { WEEKDAYS, type HoursErrorItem, type TimeRange, type WeekHours, type WeekHoursInput } from "@/lib/opening-hours";
import { replaceOpeningHours } from "@/server/data/settings-hours";

export type SaveHoursState =
  | { ok: true; week: WeekHours }
  | { ok: false; errors: HoursErrorItem[] }
  | { ok: false; error: "forbidden" | "readOnly" };

const str = (value: unknown) => (typeof value === "string" ? value : "");

// Server action input is client-controlled; coerce it to the expected shape and let the service validate values.
function toWeekInput(input: unknown): WeekHoursInput {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const week: WeekHoursInput = {};
  for (const day of WEEKDAYS) {
    const ranges = raw[day];
    week[day] = Array.isArray(ranges)
      ? ranges.map((r): TimeRange => {
          const range = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
          return { opens: str(range.opens), closes: str(range.closes) };
        })
      : [];
  }
  return week;
}

export async function saveOpeningHoursAction(input: unknown): Promise<SaveHoursState> {
  const { ctx } = await requireDealerUser();
  try {
    return await replaceOpeningHours(ctx, toWeekInput(input));
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (err instanceof DealerReadOnlyError) return { ok: false, error: "readOnly" };
    throw err;
  }
}
