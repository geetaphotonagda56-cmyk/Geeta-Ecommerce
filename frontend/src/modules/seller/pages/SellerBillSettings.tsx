import React, { useState, useEffect } from "react";
import { useToast } from "../../../context/ToastContext";
import {
  getSellerBillSettings as apiGetSellerBillSettings,
  updateSellerBillSettings as apiUpdateSellerBillSettings,
} from "../../../services/api/seller/sellerPurchaseService";
import { SELLER_BILL_SETTINGS_KEY, SELLER_BILL_SETTINGS_UPDATED_EVENT } from "../../../utils/sellerPosBillSettings";
import { SimpleInvoice } from "../../admin/components/SimpleInvoice";
import { GSTInvoice } from "../../admin/components/GSTInvoice";

const SAMPLE_INVOICE_BILL = {
  invoiceNum: "INV-0001",
  date: "17/07/2026",
  time: "05:30 PM",
  customerName: "Walk-in Customer",
  customerPhone: "9876543210",
  paymentMethod: "Cash",
  total: 342.5,
  cart: [
    { productName: "Aashirvaad Atta 5kg", qty: 1, price: 249, compareAtPrice: 275, hsnCode: "1101", gst: 5 },
    { productName: "Amul Butter 100g", qty: 2, price: 55, compareAtPrice: 62, hsnCode: "0405", gst: 12 },
  ],
};

interface BillSettings {
  shopName: string;
  address: string;
  phone: string;
  invoiceFormat?: "simple" | "gst";
  notes?: {
      text: string;
      enabled: boolean;
  };
  terms?: {
      text: string;
      enabled: boolean;
  };
  gst?: {
      text: string;
      enabled: boolean;
  };
  fssai?: {
      text: string;
      enabled: boolean;
  };
}

const SellerBillSettings = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<BillSettings>({
    shopName: "",
    address: "",
    phone: "",
    invoiceFormat: "simple",
    notes: {
        text: "Thank you for your business",
        enabled: true
    },
    terms: {
        text: "Goods once sold will not be taken back.",
        enabled: true
    },
    gst: {
        text: "",
        enabled: false
    },
    fssai: {
        text: "",
        enabled: false
    }
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiGetSellerBillSettings();
        if (res.success && res.data) {
          const parsed = res.data as any;
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            notes: parsed.notes || {
              text: "Thank you for your business",
              enabled: true,
            },
            terms: parsed.terms || {
              text: "Goods once sold will not be taken back.",
              enabled: true,
            },
            gst: parsed.gst || {
              text: "",
              enabled: false,
            },
            fssai: parsed.fssai || {
              text: "",
              enabled: false,
            },
          }));
          localStorage.setItem("seller_bill_settings", JSON.stringify(parsed));
          return;
        }
      } catch {
        // fallback to local cache
      }

      const savedSettings = localStorage.getItem(SELLER_BILL_SETTINGS_KEY);
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            notes: parsed.notes || {
              text: "Thank you for your business",
              enabled: true,
            },
            terms: parsed.terms || {
              text: "Goods once sold will not be taken back.",
              enabled: true,
            },
            gst: parsed.gst || {
              text: "",
              enabled: false,
            },
            fssai: parsed.fssai || {
              text: "",
              enabled: false,
            },
          }));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Failed to parse bill settings", e);
        }
      }
    };
    load();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'phone') {
        // Allow only numbers and max 10 digits
        const numericValue = value.replace(/\D/g, '');
        if (numericValue.length <= 10) {
             setSettings((prev) => ({
                ...prev,
                [name]: numericValue,
              }));
        }
    } else {
        setSettings((prev) => ({
          ...prev,
          [name]: value,
        }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Phone validation: must be exactly 10 digits
    if (!/^\d{10}$/.test(settings.phone)) {
      showToast("Phone number must be exactly 10 digits", "error");
      return;
    }

    try {
      const res = await apiUpdateSellerBillSettings(settings as any);
      if (res.success) {
        localStorage.setItem(SELLER_BILL_SETTINGS_KEY, JSON.stringify(settings));
        window.dispatchEvent(new Event(SELLER_BILL_SETTINGS_UPDATED_EVENT));
        showToast("Bill settings saved successfully", "success");
      } else {
        showToast(res.message || "Failed to save bill settings", "error");
      }
    } catch {
      showToast("Failed to save bill settings", "error");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Bill Settings</h1>
      <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shop Name
            </label>
            <input
              type="text"
              name="shopName"
              value={settings.shopName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
              placeholder="Enter your shop name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              name="address"
              value={settings.address}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
              placeholder="Enter shop address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="text"
              name="phone"
              maxLength={10}
              value={settings.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
              placeholder="Enter contact number"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-3">
                Invoice Format
                <span className="block text-xs text-gray-500 font-normal">Select the format used when printing POS bills</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, invoiceFormat: "simple" }))}
                className={`p-4 rounded-md border-2 text-left transition-all ${
                  (settings.invoiceFormat ?? "simple") === "simple"
                    ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-bold text-gray-800">Simple Format</div>
                <div className="text-xs text-gray-500 mt-1">Minimal display: Product, Qty, Price, Total</div>
              </button>
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, invoiceFormat: "gst" }))}
                className={`p-4 rounded-md border-2 text-left transition-all ${
                  settings.invoiceFormat === "gst"
                    ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-bold text-gray-800">GST Format</div>
                <div className="text-xs text-gray-500 mt-1">Professional format with HSN codes & tax breakup</div>
              </button>
            </div>

            <div className="pt-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Preview {settings.invoiceFormat === "gst" ? "— GST Format" : "— Simple Format"}
              </p>
              <div className="rounded-md border border-gray-200 bg-gray-50/50 p-4 overflow-hidden">
                <div className="mx-auto max-w-full overflow-auto rounded-md bg-white shadow-sm border border-gray-100" style={{ maxHeight: 420 }}>
                  <div style={{ transform: "scale(0.62)", transformOrigin: "top center", width: "161.3%", marginLeft: "-30.65%" }}>
                    {settings.invoiceFormat === "gst" ? (
                      <GSTInvoice billDetails={SAMPLE_INVOICE_BILL} shopSettings={settings} />
                    ) : (
                      <SimpleInvoice billDetails={SAMPLE_INVOICE_BILL} shopSettings={settings} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                    Notes
                    <span className="block text-xs text-gray-500 font-normal">Shown at the bottom of the bill</span>
                </label>
                <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                        ...prev,
                        notes: {
                            text: prev.notes?.text || "Thank you for your business",
                            enabled: !prev.notes?.enabled
                        }
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.notes?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notes?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {settings.notes?.enabled && (
                <textarea
                    name="notes"
                    value={settings.notes?.text || ''}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        notes: {
                            enabled: prev.notes?.enabled ?? true,
                            text: e.target.value
                        }
                    }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
                    placeholder="Enter notes (e.g. Thank you for your business)"
                />
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                    Terms & Conditions
                    <span className="block text-xs text-gray-500 font-normal">Shown at the bottom of the bill</span>
                </label>
                <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                        ...prev,
                        terms: {
                            text: prev.terms?.text || "Goods once sold will not be taken back.",
                            enabled: !prev.terms?.enabled
                        }
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.terms?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.terms?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {settings.terms?.enabled && (
                <textarea
                    name="terms"
                    value={settings.terms?.text || ''}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        terms: {
                            enabled: prev.terms?.enabled ?? true,
                            text: e.target.value
                        }
                    }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
                    placeholder="Enter terms and conditions..."
                />
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                    GST Details (Optional)
                    <span className="block text-xs text-gray-500 font-normal">Shown on invoice</span>
                </label>
                <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                        ...prev,
                        gst: {
                            text: prev.gst?.text || "",
                            enabled: !prev.gst?.enabled
                        }
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.gst?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.gst?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {settings.gst?.enabled && (
                <input
                    type="text"
                    name="gst"
                    value={settings.gst?.text || ''}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        gst: {
                            enabled: prev.gst?.enabled ?? true,
                            text: e.target.value
                        }
                    }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
                    placeholder="Enter GST Number"
                />
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                    FSSAI Number (Optional)
                    <span className="block text-xs text-gray-500 font-normal">Shown on invoice</span>
                </label>
                <button
                    type="button"
                    onClick={() => setSettings(prev => ({
                        ...prev,
                        fssai: {
                            text: prev.fssai?.text || "",
                            enabled: !prev.fssai?.enabled
                        }
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.fssai?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.fssai?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {settings.fssai?.enabled && (
                <input
                    type="text"
                    name="fssai"
                    value={settings.fssai?.text || ''}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        fssai: {
                            enabled: prev.fssai?.enabled ?? true,
                            text: e.target.value
                        }
                    }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
                    placeholder="Enter FSSAI Number"
                />
            )}
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="px-6 py-2 bg-[var(--primary-color)] text-white rounded-md hover:bg-[var(--primary-dark)] transition-colors font-medium"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SellerBillSettings;
