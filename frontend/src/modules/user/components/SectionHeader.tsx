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
      <div className="min-w-0 flex items-center gap-2.5 md:gap-3">
        <span
          className="h-6 md:h-8 w-[5px] md:w-[6px] flex-shrink-0 rounded-full"
          style={{
            background: "linear-gradient(180deg, var(--customer-primary) 0%, var(--customer-accent, var(--customer-primary-dark)) 100%)",
            boxShadow: "0 1px 4px var(--customer-primary-alpha-40, rgba(0,0,0,0.18))",
          }}
        />
        <div className="min-w-0">
          <h2 className="font-display text-xl md:text-[1.75rem] font-bold text-neutral-900 tracking-tight capitalize leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] md:text-sm text-neutral-500 font-medium mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
