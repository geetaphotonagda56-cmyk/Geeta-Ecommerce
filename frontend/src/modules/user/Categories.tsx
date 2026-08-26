import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCategories, Category } from "../../services/api/customerProductService";

export default function Categories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoriesByParent, setSubcategoriesByParent] = useState<Record<string, Category[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getCategories(false);
        if (cancelled) return;

        if (response.success && Array.isArray(response.data)) {
          // Subcategories are just Category documents whose parentId points
          // to a root category (not the legacy SubCategory collection).
          const rootCategories = response.data.filter((c) => !c.parentId);
          const byParent: Record<string, Category[]> = {};
          response.data.forEach((c) => {
            if (c.parentId) {
              const parentKey = String(c.parentId);
              if (!byParent[parentKey]) byParent[parentKey] = [];
              byParent[parentKey].push(c);
            }
          });
          setCategories(rootCategories);
          setSubcategoriesByParent(byParent);
          if (rootCategories.length > 0) {
            setActiveCategoryId(rootCategories[0]._id || rootCategories[0].id || null);
          }
        } else {
          setError("Failed to load categories. Please try again.");
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
        if (!cancelled) setError("Network error. Please check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  // Scroll-spy: highlight the left sidebar entry for whichever category
  // section is currently topmost in the right-hand scroll view.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).dataset.categoryId;
          if (id) setActiveCategoryId(id);
        }
      },
      {
        root: container,
        rootMargin: "0px 0px -70% 0px",
        threshold: 0,
      }
    );

    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const handleSidebarClick = (id: string) => {
    setActiveCategoryId(id);
    const el = sectionRefs.current.get(id);
    const container = scrollContainerRef.current;
    if (!el || !container) return;

    isProgrammaticScroll.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });

    if (programmaticScrollTimeout.current) clearTimeout(programmaticScrollTimeout.current);
    programmaticScrollTimeout.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 600);
  };

  const handleSubcategoryClick = (categoryId: string, subcategoryId: string) => {
    navigate(`/category/${categoryId}?subcategory=${subcategoryId}`);
  };

  if (loading && categories.length === 0) {
    return null; // Let global IconLoader handle it
  }

  if (error && categories.length === 0) {
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

  return (
    <div className="flex flex-col bg-white h-screen overflow-hidden">
      {/* Page Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 bg-white border-b border-neutral-200 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-neutral-900">Categories</h1>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 md:py-16 text-neutral-500 px-4">
          <p className="text-lg md:text-xl mb-2">No categories found</p>
          <p className="text-sm md:text-base">Please check back later</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Categories */}
          <div className="w-20 bg-white border-r border-neutral-100 overflow-y-auto scrollbar-hide flex-shrink-0 py-2">
            <div className="space-y-1">
              {categories.map((category) => {
                const id = category._id || category.id || "";
                const isSelected = id === activeCategoryId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSidebarClick(id)}
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
                      {category.image ? (
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const parent = target.parentElement;
                            if (parent) parent.textContent = "📦";
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
                      {category.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right - all categories' subcategory sections, stacked and scrollable */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide bg-white">
            {categories.map((category) => {
              const id = category._id || category.id || "";
              const subcategories = subcategoriesByParent[id] || [];
              return (
                <div
                  key={id}
                  data-category-id={id}
                  ref={(el) => {
                    if (el) sectionRefs.current.set(id, el);
                    else sectionRefs.current.delete(id);
                  }}
                  className="pt-4 pb-2 px-4 md:px-6 scroll-mt-2"
                >
                  <h2 className="text-base md:text-lg font-bold text-neutral-900 mb-3 capitalize">
                    {category.name}
                  </h2>

                  {subcategories.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2.5 md:gap-4 pb-6">
                      {subcategories.map((sub: any) => {
                        const subId = sub._id || sub.id;
                        return (
                          <button
                            key={subId}
                            type="button"
                            onClick={() => handleSubcategoryClick(id, subId)}
                            className="flex flex-col items-center text-center"
                          >
                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 flex items-center justify-center mb-1.5">
                              {sub.image ? (
                                <img
                                  src={sub.image}
                                  alt={sub.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    const parent = target.parentElement;
                                    if (parent) parent.textContent = "📦";
                                  }}
                                />
                              ) : (
                                <span className="text-2xl">📦</span>
                              )}
                            </div>
                            <span className="text-xs font-medium text-neutral-800 line-clamp-2 leading-tight">
                              {sub.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(`/category/${id}`)}
                      className="text-sm text-[var(--customer-primary-dark)] font-medium pb-6"
                    >
                      View products in {category.name} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
