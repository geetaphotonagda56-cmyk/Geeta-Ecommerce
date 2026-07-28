import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBrandById, Brand } from '../../services/api/brandService';
import { getProducts } from '../../services/api/customerProductService';
import ProductCard from './components/ProductCard';
import ShareButton from '../../components/ShareButton';

import IconLoader from '../../components/loaders/IconLoader';

export default function BrandProducts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 100;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = currentPage < totalPages;

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      if (currentPage === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        // Fetch Brand Details only on the first page
        if (currentPage === 1) {
          const brandResponse = await getBrandById(id);
          if (brandResponse.success) {
            setBrand(brandResponse.data);
          }
        }

        // Fetch Products for this brand
        const productsResponse = await getProducts({
          brand: id,
          page: currentPage,
          limit: limit
        });
        if (productsResponse.success) {
           // Ensure products have proper structure
           const safeProducts = Array.isArray(productsResponse.data) ? productsResponse.data.map((p: any) => ({
            ...p,
            tags: Array.isArray(p.tags) ? p.tags : [],
            nameParts: p.name ? p.name.toLowerCase().split(" ") : [],
          })) : [];
          setProducts((prev) => (currentPage === 1 ? safeProducts : [...prev, ...safeProducts]));
          if (productsResponse.pagination) {
            setTotalPages(productsResponse.pagination.pages);
          }
        }
      } catch (err) {
        console.error("Error fetching brand data:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    fetchData();
  }, [id, currentPage]);

  useEffect(() => {
    setCurrentPage(1); // Reset page when brand changes
  }, [id]);

  // Infinite scroll: load the next page when the sentinel comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><IconLoader forceShow /></div>;

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-100 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
            <button
                onClick={() => navigate(-1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 rounded-full transition-colors"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
                {brand?.image && (
                    <img src={brand.image} alt="" className="w-8 h-8 object-contain rounded-md border border-neutral-100" />
                )}
                <h1 className="text-lg font-bold text-neutral-800 truncate">{brand?.name || 'Brand Products'}</h1>
            </div>
            <ShareButton
                iconOnly
                title={brand?.name}
                text={brand?.name ? `Check out ${brand.name} on Geeta Stores` : undefined}
                className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 rounded-full transition-colors text-neutral-700 ml-auto flex-shrink-0"
            />
        </div>
      </div>

      {/* Products Grid */}
      <div className="p-4">
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                {products.map((product) => (
                    <ProductCard
                        key={product._id || product.id}
                        product={product}
                        showBadge={true}
                        showStockInfo={false}
                        categoryStyle={true}
                    />
                ))}
            </div>
            <div ref={sentinelRef} className="h-1 w-full" />
            {loadingMore && (
              <div className="flex justify-center p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--customer-primary-dark)]"></div>
              </div>
            )}
          </>
        ) : (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                <div className="text-4xl mb-4">🛍️</div>
                <p>No products found for this brand.</p>
            </div>
        )}
      </div>
    </div>
  );
}
