import React, { useEffect, useRef, useState } from "react";
import { openBarcodeScanner } from "../utils/scannerPlatform";
import QRScannerModal from "./QRScannerModal";
import { semanticSearch } from "../services/api/searchService";

interface AttachProductModalProps {
  excludeProductId: string;
  onAttach: (products: any[]) => void;
  onClose: () => void;
}

const AttachProductModal: React.FC<AttachProductModalProps> = ({
  excludeProductId,
  onAttach,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selected, setSelected] = useState<Map<string, any>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
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
        const res = await semanticSearch({ q: query.trim(), limit: 20, sort: "relevance" }, controller.signal);
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

  const toggleSelected = (p: any) => {
    const id = p._id || p.id;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, p);
      return next;
    });
  };

  const removeSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSave = () => {
    if (selected.size === 0) {
      onClose();
      return;
    }
    onAttach(Array.from(selected.values()));
    onClose();
  };

  const selectedList = Array.from(selected.values());

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 sm:p-4">
      <div
        role="dialog"
        aria-label="Attach existing products as variations"
        className="bg-white w-full h-full sm:h-[85vh] sm:max-w-4xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-neutral-100 bg-stone-50/80 shrink-0">
          <h3 className="text-sm font-semibold text-neutral-800">Attach Existing Products</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors p-1"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="px-3.5 sm:px-5 py-3 border-b border-neutral-100 flex gap-2 shrink-0">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary-color)]/40 focus:border-[var(--primary-color)] focus:outline-none transition-shadow"
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

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 overflow-hidden">
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-2">
            {loading && (
              <div className="p-4 text-xs text-neutral-500 text-center flex items-center justify-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Searching...
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && (
              <div className="p-6 text-xs text-neutral-400 text-center">No products found.</div>
            )}
            {!loading && !query.trim() && (
              <div className="p-6 text-xs text-neutral-400 text-center italic">Type a name/SKU or scan a barcode to search.</div>
            )}
            {results.map((p: any) => {
              const id = p._id || p.id;
              const name = p.productName || p.name || "Unnamed";
              const image = p.mainImage || p.imageUrl;
              const isSelected = selected.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSelected(p)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition-colors ${
                    isSelected ? "bg-[var(--primary-color)]/[0.08] ring-1 ring-[var(--primary-color)]/30" : "hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(p)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 accent-[var(--primary-color)] w-4 h-4"
                  />
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

          <div className="sm:w-64 shrink-0 max-h-40 sm:max-h-none overflow-y-auto p-2 bg-stone-50/60">
            <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Selected ({selectedList.length})
            </div>
            {selectedList.length === 0 && (
              <div className="p-4 text-xs text-neutral-400 text-center italic">No products selected yet.</div>
            )}
            {selectedList.map((p: any) => {
              const id = p._id || p.id;
              const name = p.productName || p.name || "Unnamed";
              return (
                <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-colors">
                  <div className="min-w-0 flex-1 text-xs font-medium text-neutral-800 truncate" title={name}>{name}</div>
                  <button
                    type="button"
                    onClick={() => removeSelected(id)}
                    className="text-neutral-400 hover:text-red-500 transition-colors shrink-0"
                    aria-label={`Remove ${name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-3.5 sm:px-5 py-3 border-t border-neutral-100 bg-stone-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg text-sm font-medium text-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={selectedList.length === 0}
            className="w-full sm:w-auto px-4 py-2 bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save{selectedList.length > 0 ? ` (${selectedList.length})` : ""}
          </button>
        </div>
      </div>

      {isScanning && (
        <QRScannerModal onClose={() => setIsScanning(false)} onScanSuccess={onScanSuccess} />
      )}
    </div>
  );
};

export default AttachProductModal;
