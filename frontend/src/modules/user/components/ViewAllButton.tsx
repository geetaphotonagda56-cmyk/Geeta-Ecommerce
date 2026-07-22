import { motion } from "framer-motion";

interface ViewAllButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  /** "solid" (default): colored gradient pill for use on light backgrounds.
   *  "light": white gradient pill with colored text, for use on dark/colored panels. */
  variant?: "solid" | "light";
  /** Stretch to fill the width of its container. */
  fullWidth?: boolean;
}

export default function ViewAllButton({
  onClick,
  label = "View All",
  className = "",
  variant = "solid",
  fullWidth = false,
}: ViewAllButtonProps) {
  const isLight = variant === "light";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.03 }}
      className={`relative inline-flex shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-4 py-2 text-xs md:text-sm font-bold transition-shadow ${
        fullWidth ? "w-full" : ""
      } ${isLight ? "" : "text-white"} ${className}`}
      style={
        isLight
          ? {
              background:
                "linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)",
              color: "var(--customer-primary-dark)",
              boxShadow:
                "0 5px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 4px rgba(0,0,0,0.06)",
            }
          : {
              background:
                "linear-gradient(180deg, var(--customer-primary-light) 0%, var(--customer-primary) 45%, var(--customer-primary-dark) 100%)",
              boxShadow:
                "0 5px 14px var(--customer-primary-alpha-40), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.12)",
            }
      }
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <span className="relative z-10">{label}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10 shrink-0"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </motion.button>
  );
}
