import React, { useState, useEffect, useRef } from "react";
import { useToast } from "../../../context/ToastContext";
import { Camera, Save, ArrowLeft, Loader2, Trash2, Phone, MapPin, Building, FileText, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { uploadImage } from "../../../services/api/uploadService";
import { ADMIN_POS_BILL_SETTINGS_KEY, ADMIN_POS_BILL_SETTINGS_UPDATED_EVENT } from "../../../utils/adminPosBillSettings";
import { SimpleInvoice } from "../components/SimpleInvoice";
import { GSTInvoice } from "../components/GSTInvoice";
import ImageCropperModal from "../../../components/ImageCropperModal";

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
  qrCode?: string; // URL for QR Scanner image
}

const AdminPOSBillSettings = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);
  const [qrCropperFile, setQrCropperFile] = useState<File | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

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
    },
    qrCode: ""
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem(ADMIN_POS_BILL_SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({
            ...prev,
            ...parsed,
            notes: parsed.notes || {
                text: "Thank you for your business",
                enabled: true
            },
            terms: parsed.terms || {
                text: "Goods once sold will not be taken back.",
                enabled: true
            },
            gst: parsed.gst || {
                text: "",
                enabled: false
            },
            fssai: parsed.fssai || {
                text: "",
                enabled: false
            },
            qrCode: parsed.qrCode || ""
        }));
      } catch (e) {
        console.error("Failed to parse bill settings", e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'phone') {
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

  const handleQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrCropperFile(file);
  };

  const handleQRCropped = async (croppedFile: File) => {
    setQrCropperFile(null);
    if (qrInputRef.current) qrInputRef.current.value = '';
    try {
        setUploadingQR(true);
        const result = await uploadImage(croppedFile, 'pos-settings');
        setSettings(prev => ({
            ...prev,
            qrCode: result.secureUrl
        }));
        showToast("QR Scanner image uploaded successfully", "success");
    } catch (error) {
        console.error("Upload failed:", error);
        showToast("Upload failed", "error");
    } finally {
        setUploadingQR(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (settings.phone && !/^\d{10}$/.test(settings.phone)) {
      showToast("Phone number must be exactly 10 digits", "error");
      return;
    }

    localStorage.setItem(ADMIN_POS_BILL_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(ADMIN_POS_BILL_SETTINGS_UPDATED_EVENT));
    showToast("POS Bill settings saved successfully", "success");
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-12">
      {/* Header */}
      <div className="flex items-center justify-between bg-white px-4 py-4 border-b border-neutral-200 md:px-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeft className="h-6 w-6 text-neutral-700" />
          </button>
          <h1 className="text-xl font-bold text-neutral-800">POS Bill Settings</h1>
        </div>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 rounded-xl bg-[var(--primary-color)] px-6 py-2.5 font-semibold text-white shadow-lg shadow-[var(--primary-color)]/20 hover:bg-[var(--primary-dark)] transition-all"
        >
          <Save className="h-5 w-5" />
          <span>Save Settings</span>
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* QR Scanner Section */}
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100">
            <h2 className="text-lg font-bold text-neutral-800 mb-6 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[var(--primary-color)]" />
                QR Scanner Image (Optional)
            </h2>
            <div className="flex flex-col items-center gap-4">
                <div className="group relative h-48 w-48 flex items-center justify-center rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50 shadow-inner transition-all hover:border-[var(--primary-color)]/50 hover:bg-[var(--primary-color)]/5 overflow-hidden">
                    {settings.qrCode ? (
                        <div className="relative w-full h-full p-4">
                            <img src={settings.qrCode} alt="QR Scanner" className="w-full h-full object-contain" />
                            <button
                                onClick={() => setSettings(prev => ({...prev, qrCode: ""}))}
                                className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-neutral-400">
                            <QrCode className="h-12 w-12" />
                            <span className="text-xs font-medium text-center px-4">Click to upload QR code for payments</span>
                        </div>
                    )}
                    <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity ${settings.qrCode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                        <button
                            onClick={() => qrInputRef.current?.click()}
                            className="h-12 w-12 flex items-center justify-center rounded-full bg-white shadow-lg text-[var(--primary-color)] transition-transform hover:scale-110"
                        >
                            {uploadingQR ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
                <input
                    type="file"
                    ref={qrInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleQRUpload}
                />
                <p className="text-[10px] text-neutral-500 font-medium text-center max-w-xs">
                    This QR code will be displayed on POS bills and PDF shared with customers.
                </p>
            </div>
        </div>

        {/* Basic Shop Information */}
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100 space-y-6">
          <h2 className="text-base font-bold text-neutral-800 border-b border-neutral-50 pb-4">Shop Information</h2>
          <div className="grid gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-neutral-600 ml-1">Shop Name (on Bill)</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-100 text-neutral-400 group-focus-within:text-[var(--primary-color)] transition-colors">
                  <Building className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  name="shopName"
                  value={settings.shopName}
                  onChange={handleChange}
                  placeholder="e.g. Geeta Stores"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 pl-16 pr-4 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-neutral-600 ml-1">Contact Phone</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-100 text-neutral-400 group-focus-within:text-[var(--primary-color)] transition-colors">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  name="phone"
                  value={settings.phone}
                  onChange={handleChange}
                  placeholder="Enter 10 digit number"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 pl-16 pr-4 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-neutral-600 ml-1">Shop Address</label>
              <div className="relative group">
                <div className="absolute left-4 top-4 h-10 w-10 flex items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-100 text-neutral-400 group-focus-within:text-[var(--primary-color)] transition-colors">
                  <MapPin className="h-4 w-4" />
                </div>
                <textarea
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Shop address for the bill"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 pl-16 pr-4 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Invoice Format Selection */}
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100">
          <h2 className="text-base font-bold text-neutral-800 mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--primary-color)]" />
            Invoice Format
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Select the invoice format for your POS bills</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSettings(prev => ({...prev, invoiceFormat: "simple"}))}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  settings.invoiceFormat === "simple"
                    ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5'
                    : 'border-neutral-200 bg-neutral-50/30 hover:border-neutral-300'
                }`}
              >
                <div className="text-sm font-bold text-neutral-800">Simple Format</div>
                <div className="text-xs text-neutral-500 mt-1">Minimal display: Product, Qty, Price, Total</div>
              </button>
              <button
                onClick={() => setSettings(prev => ({...prev, invoiceFormat: "gst"}))}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  settings.invoiceFormat === "gst"
                    ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5'
                    : 'border-neutral-200 bg-neutral-50/30 hover:border-neutral-300'
                }`}
              >
                <div className="text-sm font-bold text-neutral-800">GST Format</div>
                <div className="text-xs text-neutral-500 mt-1">Professional format with HSN codes & tax breakup</div>
              </button>
            </div>

            {/* Live Preview */}
            <div className="pt-2">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                Preview {settings.invoiceFormat === "gst" ? "— GST Format" : "— Simple Format"}
              </p>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4 overflow-hidden">
                <div className="mx-auto max-w-full overflow-auto rounded-xl bg-white shadow-sm border border-neutral-100" style={{ maxHeight: 420 }}>
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
        </div>

        {/* Notes & Terms */}
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100">
          <h2 className="text-base font-bold text-neutral-800 mb-6">Bill Footer Content</h2>
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-800">Footer Note</h3>
                  <p className="text-xs text-neutral-500 mt-1">Shown below the totals</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({...prev, notes: { enabled: !prev.notes?.enabled, text: prev.notes?.text || "" }}))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.notes?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notes?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {settings.notes?.enabled && (
                <input
                  type="text"
                  value={settings.notes.text}
                  onChange={(e) => setSettings(prev => ({...prev, notes: { ...prev.notes!, text: e.target.value }}))}
                  placeholder="e.g. Thank you for shopping!"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 px-5 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none"
                />
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-800">Terms & Conditions</h3>
                  <p className="text-xs text-neutral-500 mt-1">Smaller text at the bottom</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({...prev, terms: { enabled: !prev.terms?.enabled, text: prev.terms?.text || "" }}))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.terms?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.terms?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {settings.terms?.enabled && (
                <textarea
                  value={settings.terms.text}
                  onChange={(e) => setSettings(prev => ({...prev, terms: { ...prev.terms!, text: e.target.value }}))}
                  rows={3}
                  placeholder="Terms and conditions..."
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 px-5 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none resize-none"
                />
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-800">GST Number</h3>
                  <p className="text-xs text-neutral-500 mt-1">Optional display on bill</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({...prev, gst: { enabled: !prev.gst?.enabled, text: prev.gst?.text || "" }}))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.gst?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.gst?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {settings.gst?.enabled && (
                <input
                  type="text"
                  value={settings.gst.text}
                  onChange={(e) => setSettings(prev => ({...prev, gst: { ...prev.gst!, text: e.target.value }}))}
                  placeholder="Enter GST Number"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 px-5 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none"
                />
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-800">FSSAI Number</h3>
                  <p className="text-xs text-neutral-500 mt-1">Optional display on bill</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({...prev, fssai: { enabled: !prev.fssai?.enabled, text: prev.fssai?.text || "" }}))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.fssai?.enabled ? 'bg-[var(--primary-color)]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.fssai?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {settings.fssai?.enabled && (
                <input
                  type="text"
                  value={settings.fssai.text}
                  onChange={(e) => setSettings(prev => ({...prev, fssai: { ...prev.fssai!, text: e.target.value }}))}
                  placeholder="Enter FSSAI Number"
                  className="w-full rounded-2xl border-neutral-200 bg-neutral-50/30 px-5 py-4 text-neutral-800 font-medium focus:border-[var(--primary-color)] focus:ring-4 focus:ring-[var(--primary-color)]/5 transition-all outline-none"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageCropperModal
        file={qrCropperFile}
        open={!!qrCropperFile}
        onClose={() => {
          setQrCropperFile(null);
          if (qrInputRef.current) qrInputRef.current.value = '';
        }}
        onCropped={handleQRCropped}
      />
    </div>
  );
};

export default AdminPOSBillSettings;
