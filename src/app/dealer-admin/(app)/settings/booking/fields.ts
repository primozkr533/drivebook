import type {
  BookingRuleError,
  BookingRuleField,
  BookingRules,
  BookingRulesInput,
} from "@/server/data/settings-booking";

export const BOOKING_FORM_FIELDS = [
  "testDriveMinutes",
  "viewingMinutes",
  "otherMinutes",
  "capacity",
  "minNoticeHours",
  "horizonDays",
  "bufferMinutes",
  "cancelCutoffHours",
  "slotIntervalMinutes",
] as const;

export type BookingFormField = (typeof BOOKING_FORM_FIELDS)[number];
export type BookingFormValues = Record<BookingFormField, string>;
export type BookingFormErrors = Partial<Record<BookingFormField, BookingRuleError>>;
export type BookingFieldUnit = "minutes" | "hours" | "days" | "count";

export const BOOKING_FORM_RULE: Record<BookingFormField, BookingRuleField> = {
  testDriveMinutes: "testDriveMinutes",
  viewingMinutes: "viewingMinutes",
  otherMinutes: "otherMinutes",
  capacity: "capacity",
  minNoticeHours: "minNoticeMinutes",
  horizonDays: "horizonDays",
  bufferMinutes: "bufferMinutes",
  cancelCutoffHours: "cancelCutoffMinutes",
  slotIntervalMinutes: "slotIntervalMinutes",
};

export const BOOKING_FORM_UNIT: Record<BookingFormField, BookingFieldUnit> = {
  testDriveMinutes: "minutes",
  viewingMinutes: "minutes",
  otherMinutes: "minutes",
  capacity: "count",
  minNoticeHours: "hours",
  horizonDays: "days",
  bufferMinutes: "minutes",
  cancelCutoffHours: "hours",
  slotIntervalMinutes: "minutes",
};

const isHours = (field: BookingFormField) => BOOKING_FORM_UNIT[field] === "hours";

export function fromRuleValue(field: BookingFormField, value: number): number {
  return isHours(field) ? value / 60 : value;
}

export function toFormValues(rules: BookingRules): BookingFormValues {
  return Object.fromEntries(
    BOOKING_FORM_FIELDS.map((field) => [field, String(fromRuleValue(field, rules[BOOKING_FORM_RULE[field]]))]),
  ) as BookingFormValues;
}

export function readFormValues(form: FormData): BookingFormValues {
  return Object.fromEntries(
    BOOKING_FORM_FIELDS.map((field) => {
      const value = form.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as BookingFormValues;
}

function hoursToMinutes(raw: string): unknown {
  const text = raw.trim().replace(",", ".");
  if (text === "") return "";
  const hours = Number(text);
  // Rounding only strips float noise (1.1 h → 66 min); fractions of a minute still reach the service as non-integers.
  return Number.isFinite(hours) ? Math.round(hours * 60 * 1e6) / 1e6 : raw;
}

export function toRulesInput(values: BookingFormValues): BookingRulesInput {
  return Object.fromEntries(
    BOOKING_FORM_FIELDS.map((field) => [
      BOOKING_FORM_RULE[field],
      isHours(field) ? hoursToMinutes(values[field]) : values[field],
    ]),
  );
}

export function toFormErrors(errors: Partial<Record<BookingRuleField, BookingRuleError>>): BookingFormErrors {
  const result: BookingFormErrors = {};
  for (const field of BOOKING_FORM_FIELDS) {
    const error = errors[BOOKING_FORM_RULE[field]];
    if (error) result[field] = error;
  }
  return result;
}
