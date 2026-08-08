import { useEffect, useState } from "react";
import { getHomeContent } from "../../services/api/customerHomeService";
import { getCategories } from "../../services/api/customerProductService";
import { useLocation } from "../../hooks/useLocation";
import CategoryTileSection from "./components/CategoryTileSection";
import ProductCard from "./components/ProductCard";

export default function Categories() {
  const { location } = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<any>({
    homeSections: [],
  });
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getHomeContent(
          undefined,
          location?.latitude,
          location?.longitude
        );

        let sections: any[] = [];
        if (response.success && response.data) {
          sections = response.data.homeSections || [];
        }

        // Fallback 1: if admin homeSections are empty, render customer categories from /customer/home payload.
        if (sections.length === 0 && response.success && Array.isArray(response.data?.categories)) {
          const categories = response.data.categories
            .filter((c: any) => c && (c._id || c.id) && c.name)
            .map((c: any) => ({
              id: c._id || c.id,
              name: c.name,
              image: c.image,
              categoryId: c._id || c.id,
              slug: c.slug,
              type: "category",
            }));
          if (categories.length > 0) {
            sections = [
              {
                id: "categories-fallback-home",
                title: "Categories",
                displayType: "category",
                columns: 4,
                data: categories,
              },
            ];
          }
        }

        // Fallback 2: if still empty, fetch categories API directly.
        if (sections.length === 0) {
          try {
            const categoryRes = await getCategories(false);
            if (categoryRes.success && Array.isArray(categoryRes.data)) {
              const categories = categoryRes.data
                .filter((c: any) => c && (c._id || c.id) && c.name)
                .map((c: any) => ({
                  id: c._id || c.id,
                  name: c.name,
                  image: c.image,
                  categoryId: c._id || c.id,
                  slug: (c as any).slug,
                  type: "category",
                }));
              if (categories.length > 0) {
                sections = [
                  {
                    id: "categories-fallback-api",
                    title: "Categories",
                    displayType: "category",
                    columns: 4,
                    data: categories,
                  },
                ];
              }
            }
          } catch (e) {
            console.warn("Categories fallback API failed", e);
          }
        }

        // Inject Seller Categories. Customers must only see Active
        // seller-own categories; Inactive ones are hidden so the seller can
        // soft-disable them without removing the document. Missing `status`
        // is treated as Active for back-compat with older cached payloads.
        const sellerCatsStorage = localStorage.getItem('seller_own_categories');
        if (sellerCatsStorage) {
            try {
                const sellerCats = JSON.parse(sellerCatsStorage);
                const activeSellerCats = (sellerCats as any[]).filter(
                    (c) => c && (c.status === undefined || c.status === 'Active')
                );
                if (activeSellerCats.length > 0) {
                    const sellerSection = {
                        id: 'seller-categories-section',
                        title: 'Seller Categories',
                        type: 'category', // or whatever type matches CategoryTileSection
                        displayType: 'category', // Ensure this matches rendering logic
                        columns: 4,
                        data: activeSellerCats.map((c: any) => ({
                            id: c._id,
                            name: c.name,
                            image: c.image,
                            categoryId: c._id, // Add this so routing works
                            type: 'category',
                            productImages: [c.image], // Fallback for some views
                            itemCount: c.totalSubcategory || 0
                        }))
                    };
                    sections = [...sections, sellerSection];
                }
            } catch (e) {
                console.error("Error parsing seller categories", e);
            }
        }

        if (response.success || sections.length > 0) { // Allow if only seller cats exist too
          setHomeData({ ...(response.data || {}), homeSections: sections });
          if (sections.length > 0) {
            setSelectedSectionId(sections[0].id);
          }
        } else {
          setError("Failed to load categories. Please try again.");
        }
      } catch (error) {
        console.error("Failed to fetch home content:", error);
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location?.latitude, location?.longitude]);

  if (loading && !homeData.homeSections.length) {
    return null; // Let global IconLoader handle it
  }

  if (error && !homeData.homeSections.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center bg-white">
        <div className="w-20 h-20 bg-[var(--customer-primary-alpha-10)] rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-[var(--customer-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Oops! Something went wrong</h3>
        <p className="text-gray-600 mb-6 max-w-xs">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-[var(--customer-primary-dark)] text-white rounded-full font-medium hover:bg-[var(--customer-primary-darker)] transition-colors"
        >
          Try Refreshing
        </button>
      </div>
    );
  }

  const sections: any[] = homeData.homeSections || [];
  const selectedSection = sections.find((s) => s.id === selectedSectionId) || sections[0];

  return (
    <div className="flex flex-col bg-white h-screen overflow-hidden">
      {/* Page Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 bg-white border-b border-neutral-200 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-neutral-900">Categories</h1>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-12 md:py-16 text-neutral-500 px-4">
          <p className="text-lg md:text-xl mb-2">No categories found</p>
          <p className="text-sm md:text-base">
            Please create home sections from the admin panel
          </p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Section Headings */}
          <div className="w-20 bg-white border-r border-neutral-100 overflow-y-auto scrollbar-hide flex-shrink-0 py-2">
            <div className="space-y-1">
              {sections.map((section) => {
                const isSelected = section.id === selectedSection?.id;
                const sectionImage =
                  section.data && section.data.length > 0
                    ? section.data[0].image ||
                      (section.data[0].productImages &&
                        section.data[0].productImages.find(Boolean))
                    : undefined;
                const title = section.title || "Categories";
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`w-full flex flex-col items-center justify-center py-2 relative transition-all duration-200 group ${
                      isSelected ? "bg-[var(--customer-primary-alpha-10)]" : "hover:bg-neutral-50"
                    }`}
                    style={{ minHeight: "72px" }}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-[var(--customer-primary-dark)] rounded-r-full"></div>
                    )}

                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg mb-1 flex-shrink-0 overflow-hidden transition-all duration-200 shadow-sm ${
                        isSelected
                          ? "ring-2 ring-[var(--customer-primary-dark)] ring-offset-2 bg-white"
                          : "bg-neutral-50 border border-neutral-100 group-hover:shadow-md"
                      }`}
                    >
                      {sectionImage ? (
                        <img
                          src={sectionImage}
                          alt={title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const parent = target.parentElement;
                            if (parent) {
                              parent.textContent = "📦";
                            }
                          }}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] text-center leading-tight px-1 capitalize transition-colors ${
                        isSelected
                          ? "font-bold text-[var(--customer-primary-dark)]"
                          : "text-neutral-500 group-hover:text-neutral-900"
                      }`}
                      style={{
                        wordBreak: "break-word",
                        maxWidth: "100%",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content Area - Selected Section's Tiles */}
          <div className="flex-1 overflow-y-auto scrollbar-hide bg-white">
            {selectedSection && (
              <div className="pt-4 pb-4 md:pt-6 md:pb-8">
                {selectedSection.displayType === "products" &&
                selectedSection.data &&
                selectedSection.data.length > 0 ? (
                  (() => {
                    const columnCount = Number(selectedSection.columns) || 2;
                    const gridClass =
                      {
                        2: "grid-cols-2",
                        3: "grid-cols-3",
                      }[Math.min(columnCount, 3)] || "grid-cols-2";
                    return (
                      <div className="px-4">
                        <div className={`grid ${gridClass} gap-2`}>
                          {selectedSection.data.map((product: any) => (
                            <ProductCard
                              key={product.id || product._id}
                              product={product}
                              categoryStyle={true}
                              showBadge={true}
                              showPackBadge={false}
                              showStockInfo={false}
                              compact={true}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <CategoryTileSection
                    title=""
                    tiles={selectedSection.data || []}
                    columns={3}
                    showProductCount={false}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
