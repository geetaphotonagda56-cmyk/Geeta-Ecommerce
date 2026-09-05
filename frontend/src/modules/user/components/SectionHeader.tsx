import { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

/** Shared section title treatment for the Home feed — gradient accent mark
 * + display serif heading, with an optional subtitle and trailing action
 * (typically a ViewAllButton). Keeps every feed section reading as one
 * consistent system instead of each one re-implementing its own header. */
export default function SectionHeader({ title, subtitle, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-3 mb-3.5 md:mb-6 px-4 md:px-6 lg:px-8 ${className}`}>
      <div className="min-w-0 flex items-center gap-3">
        <span
          className="grad-action h-7 md:h-9 w-1.5 flex-shrink-0 rounded-full"
          style={{ boxShadow: "0 2px 8px var(--customer-primary-alpha-40)" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="font-display text-[1.35rem] md:text-[2rem] font-bold text-neutral-900 tracking-tight capitalize leading-none truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] md:text-sm text-neutral-500 font-medium mt-1 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
