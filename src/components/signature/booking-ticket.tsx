import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export type TicketData = {
  reference: string;
  kind: "testDrive" | "viewing";
  start: Date;
  end: Date;
  car: string;
  customerName: string;
  /** Already masked, e.g. "+386 41 ••• 218". */
  customerPhone: string;
  phoneVerified: boolean;
  dealerName: string;
  dealerAddress: string;
};

/**
 * SIGNATURE — the booking ticket ("Termin").
 * The product's emotional peak: a test drive that WILL happen. A torn-stub
 * ticket in the dealer's colour, time set like a departure board, and the
 * "Telefon preverjen" stamp — the visible promise against no-shows.
 * Used on the customer confirmation and manage pages (phase 2) and as the
 * booking detail header in the dealer admin (phase 3).
 */
export function BookingTicket({ ticket, className }: { ticket: TicketData; className?: string }) {
  const t = useTranslations("ticket");
  const format = useFormatter();
  const minutes = Math.round((ticket.end.getTime() - ticket.start.getTime()) / 60000);
  const time = (d: Date) => format.dateTime(d, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={cn("[filter:var(--elev-drop)]", className)}>
      <article
        className="db-ticket grid grid-cols-[var(--stub)_minmax(0,1fr)] bg-surface-raised [--stub:5.5rem] sm:[--stub:7.5rem]"
        aria-label={`${t("eyebrow")} ${ticket.reference}`}
      >
        {/* Stub: the date, in the dealer's colour */}
        <div className="flex flex-col items-center justify-center gap-1 bg-brand px-2 py-6 text-brand-ink">
          <span className="font-mono text-micro font-medium uppercase tracking-utility opacity-85">
            {format.dateTime(ticket.start, { weekday: "short" })}
          </span>
          <span className="font-display text-[length:clamp(2.75rem,8vw,var(--type-display))] font-semibold leading-none tabular">
            {format.dateTime(ticket.start, { day: "numeric" })}
          </span>
          <span className="font-mono text-micro font-medium uppercase tracking-utility opacity-85">
            {format.dateTime(ticket.start, { month: "short" })}
          </span>
        </div>

        {/* Body, separated by the perforation */}
        <div className="relative flex min-w-0 flex-col gap-4 border-l-2 border-dashed border-line p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-micro font-medium uppercase tracking-utility text-muted">
            <span className="text-ink">{t(ticket.kind)}</span>
            <span aria-hidden>·</span>
            <span>{t("duration", { minutes })}</span>
          </div>

          <p className="font-display text-[length:clamp(2rem,6vw,var(--type-h1))] font-semibold leading-none tabular text-ink">
            {time(ticket.start)}
            <span className="mx-1.5 text-faint">–</span>
            {time(ticket.end)}
          </p>

          <p className="text-lead font-semibold text-ink leading-snug">{ticket.car}</p>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
            <TicketField label={t("customer")} value={ticket.customerName} />
            <TicketField label={t("phone")} value={ticket.customerPhone} mono />
            <TicketField label={t("where")} value={`${ticket.dealerName}, ${ticket.dealerAddress}`} />
            <TicketField label={t("reference")} value={ticket.reference} mono />
          </dl>

          <p className="flex items-center gap-2 text-caption text-muted">
            <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M8 2.5a4 4 0 0 0-4 4v2.5L2.8 11h10.4L12 9V6.5a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0" />
            </svg>
            {t("reminder")}
          </p>

          {ticket.phoneVerified ? (
            <span
              className={cn(
                "db-stamp pointer-events-none absolute right-3 top-3 sm:right-6 sm:top-5",
                "rounded-sm border-2 border-primary px-2 py-1 text-center text-primary",
                "font-mono text-micro font-semibold uppercase leading-tight tracking-utility",
                "shadow-[inset_0_0_0_2px_var(--surface-raised),inset_0_0_0_3px_var(--primary)]",
              )}
            >
              ✓ {t("verifiedStamp")}
            </span>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function TicketField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-micro font-medium uppercase tracking-utility text-muted">{label}</dt>
      <dd className={cn("truncate text-small text-ink", mono && "font-mono tabular")}>{value}</dd>
    </div>
  );
}
