import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import ViewAllButton from "./ViewAllButton";
import SectionHeader from "./SectionHeader";
import AutoScrollImages from "./AutoScrollImages";
import type { ImageVariants } from "../../../components/OptimizedImage";

interface CategoryTile {
  id: string;
  name: string;
  productImages?: (string | undefined)[];
  image?: string; // Support single image property
  imageVariants?: ImageVariants; // Corresponds to `image`, not `productImages`
  productCount?: number;
  categoryId?: string;
  subcategoryId?: string;
  productId?: string;
  sellerId?: string;
  bgColor?: string;
  slug?: string;
  type?: "subcategory" | "product" | "category";
}

interface CategoryTileSectionProps {
  title: string;
  tiles: CategoryTile[];
  columns?: 2 | 3 | 4 | 6 | 8; // Support all column options
  showProductCount?: boolean; // Show product count only for bestsellers
  viewAllLink?: string; // Optional "View All" navigation target shown next to the title
}

export default function CategoryTileSection({
  title,
  tiles,
  columns = 4,
  showProductCount = false,
  viewAllLink,
}: CategoryTileSectionProps) {
  const navigate = useNavigate();

  const handleTileClick = (tile: CategoryTile) => {
    if (tile.subcategoryId || tile.type === "subcategory") {
      // Navigate to subcategory page or category with subcategory filter
      if (tile.categoryId) {
        navigate(
          `/category/${tile.categoryId}?subcategory=${tile.subcategoryId || tile.id
          }`
        );
      } else if (tile.slug) {
        navigate(`/category/${tile.slug}`);
      } else {
        navigate(`/category/subcategory/${tile.subcategoryId || tile.id}`);
      }
      return;
    }
    if (tile.categoryId) {
      navigate(`/category/${tile.categoryId}`);
      return;
    }
    if (tile.productId) {
      navigate(`/product/${tile.productId}`);
      return;
    }
    if ((tile as any).sellerId) {
      // Navigate to seller's products page or category
      navigate(`/seller/${(tile as any).sellerId}`);
      return;
    }
    // Otherwise just log for now
    console.log("Clicked tile", tile.id);
  };

  // Dynamic grid classes based on column count, capped at 3 columns
  const cappedColumns = Math.min(columns, 3);
  const getGridCols = () => {
    switch (cappedColumns) {
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-3";
      default:
        return "grid-cols-3";
    }
  };

  const gridCols = getGridCols();
  const gapClass = "gap-2.5 md:gap-4";

  return (
    <div className="mb-6 md:mb-8 mt-0 overflow-visible">
      {title && (
        <SectionHeader
          title={title}
          action={viewAllLink ? <ViewAllButton onClick={() => navigate(viewAllLink)} /> : undefined}
        />
      )}
      <div className="px-4 md:px-6 lg:px-8 overflow-visible">
        <div className={`grid ${gridCols} ${gapClass} overflow-visible auto-rows-fr`}>
          {tiles.map((tile) => {
            const images =
              tile.productImages || (tile.image ? [tile.image] : []);
            const hasImages = images.filter(Boolean).length > 0;

            return (
              <motion.div
                key={tile.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex flex-col h-full">
                <Link
                  to={
                    tile.subcategoryId || tile.type === "subcategory"
                      ? tile.categoryId
                        ? `/category/${tile.categoryId}?subcategory=${tile.subcategoryId || tile.id
                        }`
                        : tile.slug
                          ? `/category/${tile.slug}`
                          : `/category/subcategory/${tile.subcategoryId || tile.id
                          }`
                      : tile.productId
                        ? `/product/${tile.productId}`
                        : tile.type === "category"
                          ? tile.slug
                            ? `/category/${tile.slug}`
                            : tile.categoryId
                              ? `/category/${tile.categoryId}`
                              : "#"
                          : tile.categoryId
                            ? `/category/${tile.categoryId}`
                            : (tile as any).sellerId
                              ? `/seller/${(tile as any).sellerId}`
                              : "#"
                  }
                  onClick={(e) => {
                    if (
                      !tile.categoryId &&
                      !tile.productId &&
                      !tile.subcategoryId &&
                      !(tile as any).sellerId
                    ) {
                      e.preventDefault();
                      handleTileClick(tile);
                    }
                  }}
                  className={`flex flex-col bg-white rounded-xl border border-neutral-100 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_20px_-6px_rgba(15,23,42,0.18)] hover:border-neutral-200 transition-all duration-200 ${showProductCount ? "px-2.5 pt-2.5" : "px-1.5 pt-1.5"
                    }`}>
                  {/* Image - Single image for non-bestsellers, 2x2 grid for bestsellers */}
                  <div
                    className={`w-full overflow-hidden rounded-lg flex items-center justify-center flex-shrink-0 ${showProductCount ? "h-32 md:h-36 mb-2" : "aspect-square"
                      } ${tile.bgColor || "bg-cyan-50"}`}
                    style={{ transform: 'scale(0.9)', transformOrigin: 'center' }}>
                    {hasImages ? (
                      showProductCount ? (
                        // Bestsellers: 2x2 grid
                        <div className="w-full h-full grid grid-cols-2 gap-0.5 p-0.5">
                          {images.slice(0, 4).map((img, idx) =>
                            img ? (
                              <img
                                key={idx}
                                src={img}
                                alt=""
                                className="w-full h-full object-contain bg-white"
                                onError={(e) => {
                                  // Hide broken image
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }} loading="lazy" decoding="async" />
                            ) : (
                              <div
                                key={idx}
                                className="w-full h-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-400">
                                {idx + 1}
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        // Other sections: auto-cycles through the tile's images when
                        // more than one is available, otherwise shows a static image
                        <AutoScrollImages
                          images={images}
                          alt={tile.name}
                          variants={!tile.productImages ? tile.imageVariants : undefined}
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">
                        📦
                      </div>
                    )}
                  </div>

                  {/* Product count - shown first (only for bestsellers) */}
                  {showProductCount && tile.productCount && (
                    <div className="mb-1.5 flex justify-center flex-shrink-0">
                      <span className="inline-block bg-neutral-100 text-neutral-600 text-[10px] font-medium px-2 py-0.5 leading-tight">
                        +{tile.productCount} more
                      </span>
                    </div>
                  )}

                  {/* Tile name - inside card only for bestsellers */}
                  {showProductCount && (
                    <div className="pb-2.5 text-[11px] font-semibold text-neutral-900 line-clamp-2 leading-tight text-center w-full block flex-shrink-0">
                      {tile.name}
                    </div>
                  )}
                  {!showProductCount && <div className="pb-1.5" />}
                </Link>

                {/* Category name - outside card for non-bestsellers */}
                {!showProductCount && (
                  <div className="mt-1.5 text-center">
                    <span className="text-xs font-semibold text-neutral-900 line-clamp-2 leading-tight">
                      {tile.name}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
