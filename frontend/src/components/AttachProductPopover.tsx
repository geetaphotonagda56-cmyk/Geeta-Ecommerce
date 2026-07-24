import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openBarcodeScanner } from "../utils/scannerPlatform";
import QRScannerModal from "./QRScannerModal";
import { semanticSearch } from "../services/api/searchService";

interface AttachProductPopoverProps {
  excludeProductId: string;
  anchorRect: DOMRect;
  onAttach: (product: any) => void;
  onClose: () => void;
}

const CARD_WIDTH = 320;

const AttachProductPopover: React.FC<AttachProductPopoverProps> = ({
  excludeProductId,
  anchorRect,
  onAttach,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // The table scrolls both directions inside its own container; rather than
    // re-tracking the anchor, just dismiss so the card never drifts off it.
    // Scrolling *inside* the card itself (e.g. the results list) must NOT
    // count - 'scroll' events don't bubble, but a capture-phase listener on
    // window still sees them, so without this check scrolling the results
    // would close the card it belongs to.
    const handleScroll = (event: Event) => {
      if (cardRef.current && event.target instanceof Node && cardRef.current.contains(event.target)) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await semanticSearch({ q: query.trim(), limit: 15, sort: "relevance" }, controller.signal);
        if (res.success) {
          setResults((res.data || []).filter((p: any) => (p._id || p.id) !== excludeProductId));
        }
      } catch (err: any) {
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
          console.error("Failed to search products", err);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, excludeProductId]);

  const onScanSuccess = (decodedText: string) => {
    setQuery((decodedText || "").trim());
    setIsScanning(false);
  };

  const viewportPadding = 12;
  const left = Math.min(
    Math.max(anchorRect.left, viewportPadding),
    window.innerWidth - CARD_WIDTH - viewportPadding
  );
  const top = anchorRect.bottom + 10;
  const caretLeft = Math.max(14, anchorRect.left - left + 14);

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Attach an existing product as a variation"
      className="fixed z-[9999] flex flex-col bg-white rounded-xl shadow-2xl ring-1 ring-neutral-900/10 overflow-hidden"
      style={{ top, left, width: CARD_WIDTH, maxHeight: 380 }}
    >
      <div
        className="absolute w-3 h-3 bg-white rotate-45 ring-1 ring-neutral-900/10"
        style={{ top: -6, left: caretLeft }}
      />
      <div className="relative flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-neutral-100 bg-stone-50/80">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Attach product
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 transition-colors"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div className="relative p-2.5 border-b border-neutral-100 flex gap-1.5">
        <input
          type="text"
          autoFocus
          className="flex-1 min-w-0 px-2.5 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary-color)]/40 focus:border-[var(--primary-color)] focus:outline-none transition-shadow"
          placeholder="Search name, SKU or barcode..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          onClick={() => openBarcodeScanner(() => setIsScanning(true))}
          className="p-2 bg-[var(--primary-color)]/[0.08] border border-[var(--primary-color)]/20 rounded-lg text-[var(--primary-color)] hover:bg-[var(--primary-color)]/[0.15] transition-colors shrink-0"
          title="Scan Barcode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            <path d="M7 12h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <div className="relative flex-1 overflow-y-auto p-1.5">
        {loading && (
          <div className="p-3 text-xs text-neutral-500 text-center flex items-center justify-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Searching...
          </div>
        )}
        {!loading && query.trim() && results.length === 0 && (
          <div className="p-4 text-xs text-neutral-400 text-center">No products found.</div>
        )}
        {!loading && !query.trim() && (
          <div className="p-4 text-xs text-neutral-400 text-center italic">Type a name/SKU or scan a barcode.</div>
        )}
        {results.map((p: any) => {
          const name = p.productName || p.name || "Unnamed";
          const image = p.mainImage || p.imageUrl;
          return (
            <button
              key={p._id || p.id}
              type="button"
              onClick={() => onAttach(p)}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-stone-50 flex items-center gap-2.5 transition-colors"
            >
              <div className="w-9 h-9 rounded-md border border-neutral-200 bg-neutral-50 shrink-0 overflow-hidden flex items-center justify-center">
                {image ? (
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[8px] text-neutral-400">No img</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-neutral-800 truncate" title={name}>{name}</div>
                <div className="text-[10px] text-neutral-500 flex gap-2 font-mono tabular-nums mt-0.5">
                  {p.sku && <span className="truncate">{p.sku}</span>}
                  <span className="text-[var(--primary-color)] font-semibold">₹{p.price}</span>
                  <span>{p.stock} in stock</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {isScanning && (
        <QRScannerModal onClose={() => setIsScanning(false)} onScanSuccess={onScanSuccess} />
      )}
    </div>,
    document.body
  );
};

export default AttachProductPopover;
