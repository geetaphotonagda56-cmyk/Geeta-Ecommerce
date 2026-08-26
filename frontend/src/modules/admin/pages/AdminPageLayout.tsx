import { useEffect, useState } from "react";
import {
    getAppSettings,
    updateAppSettings,
} from "../../../services/api/admin/adminSettingsService";
import {
    HOME_LAYOUT_SECTIONS,
    PRODUCT_DETAIL_LAYOUT_SECTIONS,
    mergeWithDefaults,
    type PageLayoutEntry,
} from "../../../constants/pageLayoutSections";

type PageKey = "home" | "productDetail";

export default function AdminPageLayout() {
    const [activePage, setActivePage] = useState<PageKey>("home");
    const [homeLayout, setHomeLayout] = useState<PageLayoutEntry[]>([]);
    const [productDetailLayout, setProductDetailLayout] = useState<PageLayoutEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        fetchLayouts();
    }, []);

    const fetchLayouts = async () => {
        try {
            setLoading(true);
            const response = await getAppSettings();
            if (response.success && response.data) {
                setHomeLayout(mergeWithDefaults(response.data.homePageLayout, HOME_LAYOUT_SECTIONS));
                setProductDetailLayout(
                    mergeWithDefaults(response.data.productDetailLayout, PRODUCT_DETAIL_LAYOUT_SECTIONS)
                );
            }
        } catch (err) {
            console.error("Error fetching page layout settings:", err);
            setError("Failed to load page layout settings");
        } finally {
            setLoading(false);
        }
    };

    const activeLayout = activePage === "home" ? homeLayout : productDetailLayout;
    const setActiveLayout = activePage === "home" ? setHomeLayout : setProductDetailLayout;
    const activeCatalog = activePage === "home" ? HOME_LAYOUT_SECTIONS : PRODUCT_DETAIL_LAYOUT_SECTIONS;

    const labelFor = (key: string) => activeCatalog.find((section) => section.key === key)?.label || key;

    const handleDragStart = (index: number) => setDraggedIndex(index);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (dropIndex: number) => {
        if (draggedIndex === null || draggedIndex === dropIndex) return;
        const next = [...activeLayout];
        const [moved] = next.splice(draggedIndex, 1);
        next.splice(dropIndex, 0, moved);
        setActiveLayout(next);
        setDraggedIndex(null);
    };

    const handleDragEnd = () => setDraggedIndex(null);

    const toggleEnabled = (index: number) => {
        setActiveLayout(
            activeLayout.map((entry, i) => (i === index ? { ...entry, enabled: !entry.enabled } : entry))
        );
    };

    const handleSave = async () => {
        setError("");
        setSuccess("");
        try {
            setSaving(true);
            const payload =
                activePage === "home"
                    ? { homePageLayout: homeLayout }
                    : { productDetailLayout: productDetailLayout };
            const response = await updateAppSettings(payload);
            if (response.success) {
                setSuccess("Layout saved successfully!");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to save layout");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="p-6 pb-0">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-semibold text-neutral-800">Page Layout</h1>
                    <div className="text-sm text-[var(--primary-color)]">
                        <span className="text-[var(--primary-color)] hover:underline cursor-pointer">Home</span>{" "}
                        <span className="text-neutral-400">/</span> Page Layout
                    </div>
                </div>
            </div>

            {(success || error) && (
                <div className="px-6">
                    {success && (
                        <div className="bg-[var(--primary-alpha-10)] border border-green-200 text-[var(--primary-darker)] px-4 py-3 rounded mb-4">
                            {success}
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                            {error}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 px-6 pb-6">
                <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="flex border-b border-neutral-200">
                        <button
                            onClick={() => setActivePage("home")}
                            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                                activePage === "home"
                                    ? "text-[var(--primary-color)] border-b-2 border-[var(--primary-color)]"
                                    : "text-neutral-500 hover:text-neutral-700"
                            }`}
                        >
                            Home Page
                        </button>
                        <button
                            onClick={() => setActivePage("productDetail")}
                            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                                activePage === "productDetail"
                                    ? "text-[var(--primary-color)] border-b-2 border-[var(--primary-color)]"
                                    : "text-neutral-500 hover:text-neutral-700"
                            }`}
                        >
                            Product Details Page
                        </button>
                    </div>

                    <div className="p-6">
                        {loading ? (
                            <div className="text-center py-8 text-neutral-400">Loading...</div>
                        ) : (
                            <div className="space-y-2">
                                {activeLayout.map((entry, index) => (
                                    <div
                                        key={entry.key}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={handleDragOver}
                                        onDrop={() => handleDrop(index)}
                                        onDragEnd={handleDragEnd}
                                        className={`flex items-center justify-between p-3 bg-gray-100 rounded-lg cursor-move transition-all border-2 border-transparent ${
                                            draggedIndex === index ? "opacity-50" : "hover:bg-gray-200"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg
                                                width="18"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className="text-neutral-400 flex-shrink-0"
                                            >
                                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                                <line x1="3" y1="18" x2="21" y2="18"></line>
                                            </svg>
                                            <span className="text-sm font-medium text-neutral-800">
                                                {labelFor(entry.key)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => toggleEnabled(index)}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                entry.enabled ? "bg-[var(--primary-color)]" : "bg-neutral-300"
                                            }`}
                                            role="switch"
                                            aria-checked={entry.enabled}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    entry.enabled ? "translate-x-5" : "translate-x-0"
                                                }`}
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="px-6 pb-6">
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                                saving || loading
                                    ? "bg-gray-400 cursor-not-allowed text-white"
                                    : "bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] text-white"
                            }`}
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>

            <footer className="text-center py-4 text-sm text-neutral-600 border-t border-neutral-200 bg-white">
                Copyright © 2025. Developed By{" "}
                <a href="#" className="text-[var(--primary-dark)] hover:underline">
                    Geeta Stores - 10 Minute App
                </a>
            </footer>
        </div>
    );
}
