import { Share2 } from "lucide-react";
import { useToast } from "../context/ToastContext";

interface ShareButtonProps {
  title?: string;
  text?: string;
  url?: string; // defaults to the current page URL
  className?: string;
  iconOnly?: boolean;
}

export default function ShareButton({
  title,
  text,
  url,
  className = "",
  iconOnly = false,
}: ShareButtonProps) {
  const { showToast } = useToast();

  const handleShare = async () => {
    const shareUrl = url || window.location.href;
    const shareTitle = title || document.title;
    // Some WhatsApp/iOS combinations only surface one of `text`/`url` in the
    // share sheet, so fold the link into the text itself for reliability.
    const shareText = text ? `${text}\n${shareUrl}` : shareUrl;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch (err: any) {
        // AbortError fires when the user just cancels the native share sheet - not an error.
        if (err?.name !== "AbortError") {
          console.error("Share failed", err);
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Link copied to clipboard", "success");
    } catch (err) {
      console.error("Copy failed", err);
      showToast("Couldn't copy link", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share this page"
      className={
        className ||
        "flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-[var(--customer-primary)] hover:text-[var(--customer-primary)] transition-colors"
      }
    >
      <Share2 className="h-4 w-4" />
      {!iconOnly && <span>Share</span>}
    </button>
  );
}
