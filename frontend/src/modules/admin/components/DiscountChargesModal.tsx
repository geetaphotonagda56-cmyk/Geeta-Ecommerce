import { useEffect, useRef, useState } from "react";
import { searchSalesPersons, createSalesPerson, SalesPerson } from "../../../services/api/admin/adminOrderService";

export interface PosCharges {
  discountType: "%" | "₹";
  discountValue: number;
  deliveryChargeEnabled: boolean;
  deliveryCharge: number;
  isPartialPayment: boolean;
  cashCollected: number;
  salesPersonId: string;
  salesPersonName: string;
  salesPersonPhone: string;
}

export const DEFAULT_POS_CHARGES: PosCharges = {
  discountType: "%",
  discountValue: 0,
  // Per spec: delivery charge is ON by default so it isn't forgotten, but
  // the amount defaults to 0 so it has no effect unless someone fills it in.
  deliveryChargeEnabled: true,
  deliveryCharge: 0,
  // On by default so the cashier doesn't have to click it - see
  // isPartialPaymentActive() below for why this alone never affects a sale.
  isPartialPayment: true,
  cashCollected: 0,
  salesPersonId: "",
  salesPersonName: "",
  salesPersonPhone: "",
};

// isPartialPayment defaults to true so the toggle greets the cashier already
// on, but with cashCollected still at its untouched 0 that would otherwise
// mean "₹0 collected, everything is due" the instant ANY cash sale completes
// - including ones where this popup was never opened at all. Requiring an
// actual entered amount is what keeps "popup never opened" behaviorally
// identical to before this feature existed.
export function isPartialPaymentActive(c: PosCharges): boolean {
  return c.isPartialPayment && c.cashCollected > 0;
}

export function hasActiveCharges(c: PosCharges): boolean {
  return (
    c.discountValue > 0 ||
    (c.deliveryChargeEnabled && c.deliveryCharge > 0) ||
    isPartialPaymentActive(c) ||
    !!c.salesPersonName
  );
}

export function computeDiscountAmount(subtotal: number, c: PosCharges): number {
  if (c.discountValue <= 0) return 0;
  const amount = c.discountType === "%" ? (subtotal * c.discountValue) / 100 : c.discountValue;
  return Math.min(Math.max(0, amount), subtotal);
}

export function computeFinalTotal(subtotal: number, c: PosCharges): number {
  const discount = computeDiscountAmount(subtotal, c);
  const delivery = c.deliveryChargeEnabled ? Math.max(0, c.deliveryCharge) : 0;
  return Math.max(0, subtotal - discount + delivery);
}

interface DiscountChargesModalProps {
  open: boolean;
  onClose: () => void;
  subtotal: number;
  /** Sum of purchasePrice * qty across the cart, when known - powers the profit preview. */
  costTotal?: number;
  charges: PosCharges;
  onChange: (next: PosCharges) => void;
}

type Tab = "payment" | "discount" | "more";

export default function DiscountChargesModal({ open, onClose, subtotal, costTotal, charges, onChange }: DiscountChargesModalProps) {
  const [tab, setTab] = useState<Tab>("payment");
  const [personQuery, setPersonQuery] = useState(charges.salesPersonName);
  const [personResults, setPersonResults] = useState<SalesPerson[]>([]);
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [newPersonPhone, setNewPersonPhone] = useState("");
  const [savingPerson, setSavingPerson] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) setPersonQuery(charges.salesPersonName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!personDropdownOpen) return;
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await searchSalesPersons(personQuery.trim());
        if (res.success) setPersonResults(res.data || []);
      } catch {
        // Non-critical - roster search failing shouldn't block billing.
      }
    }, 250);
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [personQuery, personDropdownOpen]);

  if (!open) return null;

  const discountAmount = computeDiscountAmount(subtotal, charges);
  const finalTotal = computeFinalTotal(subtotal, charges);
  const cashReturns = Math.max(0, charges.cashCollected - finalTotal);
  const due = charges.isPartialPayment ? Math.max(0, finalTotal - charges.cashCollected) : 0;
  const profitPercent =
    costTotal !== undefined && costTotal >= 0 && finalTotal > 0
      ? ((finalTotal - costTotal) / finalTotal) * 100
      : null;

  const selectPerson = (p: SalesPerson) => {
    onChange({ ...charges, salesPersonId: p._id, salesPersonName: p.name, salesPersonPhone: p.phone });
    setPersonQuery(p.name);
    setPersonDropdownOpen(false);
    setCreatingPerson(false);
  };

  const saveNewPerson = async () => {
    if (!personQuery.trim() || !newPersonPhone.trim()) return;
    setSavingPerson(true);
    try {
      const res = await createSalesPerson(personQuery.trim(), newPersonPhone.trim());
      if (res.success && res.data) {
        selectPerson(res.data);
      }
    } catch {
      // Fall back to plain free-text on failure - name is already bound below.
    } finally {
      setSavingPerson(false);
      setNewPersonPhone("");
    }
  };

  const tabs: { key: Tab; label: string; icon: JSX.Element }[] = [
    {
      key: "payment",
      label: "Payment",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      key: "discount",
      label: "Discount",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2.83 12.83a2 2 0 010-2.83l7.17-7.17a2 2 0 012.83 0l7.76 7.76a2 2 0 010 2.82z" />
          <line x1="7" y1="7.01" x2="7.01" y2="7.01" />
        </svg>
      ),
    },
    {
      key: "more",
      label: "More",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-4 sm:zoom-in-95 fade-in duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[var(--primary-color)] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" />
            </svg>
            <h3 className="font-bold text-base">More Options</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Total summary */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Total amount</p>
            <p className="text-xl font-black text-gray-900">
              ₹{finalTotal.toLocaleString()}
              {discountAmount > 0 && <span className="text-sm font-medium text-gray-400 line-through ml-2">₹{subtotal.toLocaleString()}</span>}
            </p>
          </div>
          {discountAmount > 0 && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              Saved ₹{discountAmount.toLocaleString()}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key ? "bg-[var(--primary-color)] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto min-h-[300px]">
          {tab === "payment" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Cash Payment
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Cash collected</label>
                  <input
                    type="number"
                    min={0}
                    value={charges.cashCollected === 0 ? "" : charges.cashCollected}
                    onChange={(e) => onChange({ ...charges, cashCollected: e.target.value === "" ? 0 : Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">
                    {charges.isPartialPayment ? "Due" : "Cash returns"}
                  </label>
                  <div
                    className={`w-full rounded-lg px-3 py-2.5 text-sm font-bold ${
                      charges.isPartialPayment ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    ₹{(charges.isPartialPayment ? due : cashReturns).toLocaleString()}
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Is it partial payment?</span>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...charges, isPartialPayment: !charges.isPartialPayment })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${charges.isPartialPayment ? "bg-[var(--primary-color)]" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${charges.isPartialPayment ? "translate-x-5" : ""}`} />
                </button>
              </label>
            </div>
          )}

          {tab === "discount" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Apply special discount</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={charges.discountValue === 0 ? "" : charges.discountValue}
                    onChange={(e) => onChange({ ...charges, discountValue: e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0) })}
                    placeholder="0"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)] outline-none"
                  />
                  <div className="flex bg-gray-100 rounded-lg p-1 shrink-0">
                    {(["%", "₹"] as const).map((unit) => (
                      <button
                        key={unit}
                        onClick={() => onChange({ ...charges, discountType: unit })}
                        className={`w-10 rounded-md text-sm font-bold transition-colors ${
                          charges.discountType === unit ? "bg-white text-[var(--primary-color)] shadow-sm" : "text-gray-400"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-sm px-1">
                  <span className="text-gray-500">Discount amount</span>
                  <span className="font-bold text-gray-800">− ₹{discountAmount.toLocaleString()}</span>
                </div>
              )}

              {profitPercent !== null && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold ${profitPercent >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                  </svg>
                  Profit: {profitPercent.toFixed(0)}% on ₹{finalTotal.toLocaleString()}
                </div>
              )}
            </div>
          )}

          {tab === "more" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Salesman / Delivery Person</label>
                <div className="relative">
                  <input
                    type="text"
                    value={personQuery}
                    onChange={(e) => {
                      setPersonQuery(e.target.value);
                      onChange({ ...charges, salesPersonName: e.target.value, salesPersonId: "", salesPersonPhone: "" });
                      setPersonDropdownOpen(true);
                      setCreatingPerson(false);
                    }}
                    onFocus={() => setPersonDropdownOpen(true)}
                    placeholder="Search or type a name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)] outline-none"
                  />
                  {personDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-52 overflow-y-auto">
                      {personResults.length > 0 &&
                        personResults.map((p) => (
                          <button
                            key={p._id}
                            onClick={() => selectPerson(p)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-pink-50 flex items-center justify-between"
                          >
                            <span className="font-medium text-gray-800">{p.name}</span>
                            <span className="text-xs text-gray-400">{p.phone}</span>
                          </button>
                        ))}
                      {personQuery.trim() && !creatingPerson && (
                        <button
                          onClick={() => setCreatingPerson(true)}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--primary-color)] font-semibold hover:bg-gray-50 border-t border-gray-100"
                        >
                          + Add "{personQuery.trim()}" as new
                        </button>
                      )}
                      {creatingPerson && (
                        <div className="p-3 border-t border-gray-100 space-y-2">
                          <input
                            type="tel"
                            autoFocus
                            value={newPersonPhone}
                            onChange={(e) => setNewPersonPhone(e.target.value)}
                            placeholder="Phone number"
                            className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                          />
                          <button
                            onClick={saveNewPerson}
                            disabled={savingPerson || !newPersonPhone.trim()}
                            className="w-full bg-[var(--primary-color)] text-white text-xs font-bold py-1.5 rounded-md disabled:opacity-50"
                          >
                            {savingPerson ? "Saving..." : "Save & Select"}
                          </button>
                        </div>
                      )}
                      {personResults.length === 0 && !personQuery.trim() && (
                        <p className="px-3 py-4 text-center text-xs text-gray-400 italic">Type to search or add someone new</p>
                      )}
                      <button
                        onClick={() => setPersonDropdownOpen(false)}
                        className="w-full text-center px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 border-t border-gray-100"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">Apply delivery charge on this order</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ ...charges, deliveryChargeEnabled: !charges.deliveryChargeEnabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${charges.deliveryChargeEnabled ? "bg-[var(--primary-color)]" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${charges.deliveryChargeEnabled ? "translate-x-5" : ""}`} />
                  </button>
                </label>

                <div className={`mt-3 transition-opacity ${charges.deliveryChargeEnabled ? "" : "opacity-40 pointer-events-none"}`}>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Delivery Charge</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={charges.deliveryCharge === 0 ? "" : charges.deliveryCharge}
                      onChange={(e) => onChange({ ...charges, deliveryCharge: e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0.0"
                      disabled={!charges.deliveryChargeEnabled}
                      className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)] outline-none disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full bg-[var(--primary-color)] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-transform">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
