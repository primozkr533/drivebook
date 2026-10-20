import { cx } from "@/lib/cx";

export type TicketStatus = "confirmed" | "pending" | "attended" | "no-show";

export type DriveTicketData = {
  kind: string; // "Testna vožnja"
  dealer: string;
  car: string;
  carMeta: string;
  weekday: string; // "čet"
  day: string; // "22"
  month: string; // "okt"
  start: string; // "14:30"
  end: string; // "15:15"
  customer: string;
  phone: string;
  phoneVerified: boolean;
  code: string;
  cutoffNote: string; // "Spremeni ali odpovej do sre 21. 10. 12:30"
  reminderNote?: string;
  status: TicketStatus;
};

const statusStyle: Record<TicketStatus, string> = {
  confirmed: "text-ok shadow-[inset_0_0_0_2px_var(--ok)]",
  pending: "text-warn shadow-[inset_0_0_0_2px_var(--warn)]",
  attended: "text-ink shadow-[inset_0_0_0_2px_var(--ink)]",
  "no-show": "text-danger shadow-[inset_0_0_0_2px_var(--danger)]",
};

/**
 * DriveTicket — SIGNATURE. The booking as a physical pass: the moment a customer
 * commits to showing up. Brand band + plate-cut corner + perforated time stub,
 * stamped with the attendance status. This is the product's anti-no-show promise
 * made tangible; give it room. Layout responds to its CONTAINER (@container), so it
 * works in a narrow aside or a full-width row without viewport guesses.
 */
export function DriveTicket({
  t,
  statusLabel,
  labels = { customer: "Stranka", phone: "Telefon", verified: "preverjeno", code: "Koda rezervacije" },
  animate = true,
}: {
  t: DriveTicketData;
  statusLabel: string;
  labels?: { customer: string; phone: string; verified: string; code: string };
  animate?: boolean;
}) {
  return (
    <div className="@container w-full">
    <article
      className={cx(
        "cut-tr cut-lg relative flex w-full flex-col bg-surface text-ink @2xl:flex-row",
        "shadow-[inset_0_0_0_1px_var(--line)]",
        animate && "anim-ticket",
      )}
    >
      {/* brand band — the dealer's colour lives here */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-brand" />

      <div className="flex flex-1 flex-col gap-6 py-6 pl-8 pr-6 @2xl:py-7 @2xl:pl-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="type-utility text-signal-ink">{t.kind}</span>
          <span aria-hidden className="h-px w-6 bg-line-strong" />
          <span className="type-utility text-ink">{t.dealer}</span>
        </div>

        <div>
          <h3 className="type-display text-h1 text-balance">{t.car}</h3>
          <p className="mt-2 text-body text-ink-2">{t.carMeta}</p>
        </div>

        <dl className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="type-utility text-muted">{labels.customer}</dt>
            <dd className="text-body font-[650]">{t.customer}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="type-utility text-muted">{labels.phone}</dt>
            <dd className="flex items-center gap-2 text-body font-[650] tabular">
              {t.phone}
              {t.phoneVerified && (
                <span className="type-utility inline-flex items-center gap-1 text-ok">
                  <svg viewBox="0 0 12 12" aria-hidden className="size-3">
                    <path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                  </svg>
                  {labels.verified}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="lane-rule opacity-70" aria-hidden />

        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-end @lg:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="type-utility text-muted">{labels.code}</span>
            <span className="font-mono text-h3 font-[700] tracking-[0.14em] tabular">{t.code}</span>
          </div>
          <div className="flex flex-col gap-1 text-small text-ink-2 @lg:text-right">
            <span>{t.cutoffNote}</span>
            {t.reminderNote && <span className="text-muted">{t.reminderNote}</span>}
          </div>
        </div>
      </div>

      {/* perforated stub */}
      <div className="relative flex shrink-0 flex-row items-center justify-between gap-6 border-t-2 border-dashed border-line px-8 py-6 @2xl:w-56 @2xl:flex-col @2xl:items-start @2xl:justify-start @2xl:border-l-2 @2xl:border-t-0 @2xl:px-7 @2xl:py-7">
        <span aria-hidden className="absolute -left-3 -top-3 hidden size-6 rounded-pill bg-ground @2xl:block" />
        <span aria-hidden className="absolute -bottom-3 -left-3 hidden size-6 rounded-pill bg-ground @2xl:block" />
        <div className="flex flex-col">
          <span className="type-utility text-muted">{t.weekday}</span>
          <span className="type-display text-mega tabular leading-[0.85]">{t.day}</span>
          <span className="type-utility text-ink">{t.month}</span>
        </div>
        <div className="flex flex-col items-end gap-4 @2xl:items-start">
          <div className="flex flex-col">
            <span className="type-display text-h1 tabular">{t.start}</span>
            <span className="font-mono text-small text-muted tabular">– {t.end}</span>
          </div>
          <span
            className={cx(
              "type-utility inline-block -rotate-[8deg] px-2.5 py-1.5 text-caption",
              statusStyle[t.status],
              animate && "anim-stamp",
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </article>
    </div>
  );
}
