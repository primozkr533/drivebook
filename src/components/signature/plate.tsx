import { cn } from "@/lib/cn";

/**
 * Registration-plate chip for a dealer slug — how a dealer's subdomain is
 * shown everywhere (backoffice lists, settings, share links). Fixed plate
 * colours: it reads the same on light, dark and any dealer brand.
 */
export function Plate({
  slug,
  domain,
  size = "md",
  className,
}: {
  slug: string;
  /** Optional suffix shown after the plate, e.g. ".drivebook.si". */
  domain?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <span
        className={cn(
          "inline-flex items-stretch overflow-hidden rounded-sm border-2 border-plate-ink bg-plate-ground text-plate-ink",
          "shadow-[inset_0_0_0_1px_var(--plate-ground),inset_0_0_0_2px_var(--plate-ink)]",
          size === "sm" && "h-7",
          size === "md" && "h-9",
          size === "lg" && "h-14",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex flex-col items-center justify-between bg-plate-band text-plate-band-ink py-0.5",
            size === "lg" ? "w-7" : "w-5",
          )}
        >
          <svg viewBox="0 0 20 20" className={size === "lg" ? "size-5" : "size-3.5"} fill="currentColor">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <circle key={i} cx={10 + Math.cos(a) * 7} cy={10 + Math.sin(a) * 7} r="1.25" />;
            })}
          </svg>
          <span className="font-display text-micro font-bold leading-none text-plate-ground">
            SLO
          </span>
        </span>
        <span
          className={cn(
            "flex items-center font-display font-semibold uppercase leading-none tracking-utility",
            size === "sm" && "px-2 text-body",
            size === "md" && "px-3 text-h4",
            size === "lg" && "px-4 text-h2",
          )}
        >
          {slug}
        </span>
      </span>
      {domain ? <span className="font-mono text-small text-muted">{domain}</span> : null}
    </span>
  );
}
