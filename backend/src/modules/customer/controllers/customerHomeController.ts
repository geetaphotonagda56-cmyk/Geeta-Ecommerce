import { Request, Response } from "express";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Shop from "../../../models/Shop";
import HeaderCategory from "../../../models/HeaderCategory";
import HomeSection from "../../../models/HomeSection";
import BestsellerCard from "../../../models/BestsellerCard";
import LowestPricesProduct from "../../../models/LowestPricesProduct";
import PromoStrip from "../../../models/PromoStrip";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { cache } from "../../../utils/cache";
import { toListItem } from "../../product/productReadMapper";

// Collects up to 3 preview images for a category/subcategory tile so the
// storefront can auto-cycle through them, starting with the tile's own
// image (if any) and filling the rest from its active products.
async function fetchPreviewImages(
  productMatch: { category?: any } | { subcategory?: any },
  tileImage?: string
): Promise<string[]> {
  const images: string[] = tileImage ? [tileImage] : [];

  const products = await Product.find({
    ...productMatch,
    status: "Active",
    publish: true,
  })
    .select("mainImage galleryImages")
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  for (const product of products as any[]) {
    if (images.length >= 3) break;
    if (product.mainImage && !images.includes(product.mainImage)) {
      images.push(product.mainImage);
    }
  }
  for (const product of products as any[]) {
    if (images.length >= 3) break;
    const galleryImage = product.galleryImages?.[0];
    if (galleryImage && !images.includes(galleryImage)) {
      images.push(galleryImage);
    }
  }

  return images;
}

// Helper function to fetch data for a home section based on its configuration
async function fetchSectionData(
  section: any,
  nearbySellerIds?: mongoose.Types.ObjectId[],
  overrides?: { limit?: number; skip?: number }
): Promise<any[]> {
  try {
    const { categories, subCategories, displayType } = section;
    const limit = overrides?.limit ?? section.limit;
    const skip = overrides?.skip ?? 0;

    // If displayType is "subcategories", fetch subcategories
    if (
      displayType === "subcategories" &&
      categories &&
      categories.length > 0
    ) {
      const categoryIds = categories.map((cat: any) => cat._id || cat);

      const subcategories = await SubCategory.find({
        category: { $in: categoryIds },
      })
        .select("name image order category")
        .sort({ order: 1 })
        .limit(limit || 10)
        .lean();

      const subcategoryTiles = await Promise.all(
        subcategories.map(async (sub: any) => {
          const hasProducts = await Product.exists({
            subcategory: sub._id,
            status: "Active",
            publish: true,
          });
          if (!hasProducts) return null;

          const productImages = await fetchPreviewImages({ subcategory: sub._id }, sub.image);
          return {
            id: sub._id.toString(),
            subcategoryId: sub._id.toString(),
            categoryId: sub.category?.toString() || "",
            name: sub.name,
            image: sub.image || "",
            productImages,
            slug: sub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            type: "subcategory",
          };
        })
      );
      return subcategoryTiles.filter(Boolean) as any[];
    }

    // If displayType is "products", fetch products
    if (displayType === "products") {
      const query: any = {
        status: "Active",
        publish: true,
        // Exclude shop-by-store-only products from home sections
        $or: [
          { isShopByStoreOnly: { $ne: true } },
          { isShopByStoreOnly: { $exists: false } },
        ],
      };

      // Only show products from active categories
      const activeCategories = await Category.find({ status: "Active" }).select("_id").lean();
      const activeCategoryIds = activeCategories.map(c => c._id);
      query.category = { $in: activeCategoryIds };

      // Customer-side seller visibility is gated solely by `isEnabled`.
      // `canCreateCategories` is an admin/authoring permission and must NOT
      // be used here — its schema default is `true`, which used to silently
      // hide every newly registered seller from customers.
      const visibleSellers = await Seller.find({ isEnabled: true }).select("_id");
      const visibleSellerIds = visibleSellers.map(s => s._id);

      query.seller = { $in: visibleSellerIds };

      if (categories && categories.length > 0) {
        const categoryIds = categories
          .map((cat: any) => (cat ? cat._id || cat : null))
          .filter((id: any) => id);

        if (categoryIds.length > 0) {
          query.category = { $in: categoryIds };
        }
      }

      if (subCategories && subCategories.length > 0) {
        const subCategoryIds = subCategories
          .map((sub: any) => (sub ? sub._id || sub : null))
          .filter((id: any) => id);

        if (subCategoryIds.length > 0) {
          query.subcategory = { $in: subCategoryIds };
        }
      }

      const products = await Product.find(query)
        .sort({ createdAt: -1 }) // Show newest items first
        .skip(skip)
        .limit(limit || 8)
        .select("productName mainImage price discPrice variations unitPricing mrp discount rating reviewsCount pack seller")
        .lean();

      return products.map((p: any) => {
        const mapped = toListItem(p);
        const isAvailable = true;

        return {
          id: p._id.toString(),
          productId: p._id.toString(),
          name: p.productName,
          productName: p.productName,
          image: mapped.listing.imageUrl,
          mainImage: mapped.listing.imageUrl,
          price: mapped.price,
          discPrice: mapped.discPrice ?? mapped.price,
          variations: mapped.variations,
          variants: mapped.variants,
          listing: mapped.listing,
          mrp: mapped.compareAtPrice || mapped.price || mapped.listing.minPrice,
          discount: mapped.discount,
          productImages: mapped.listing.imageUrl ? [mapped.listing.imageUrl] : [],
          rating: p.rating || 0,
          reviewsCount: p.reviewsCount || 0,
          reviews: p.reviewsCount || 0,
          pack: p.pack || "",
          type: "product",
          isAvailable,
          seller: p.seller,
        };
      });
    }

    // If displayType is "categories", fetch the selected categories themselves
    if (displayType === "categories") {
      // If categories are specified, fetch those specific categories
      if (categories && categories.length > 0) {
        const categoryIds = categories.map((cat: any) => cat._id || cat);

        const fetchedCategories = await Category.find({
          _id: { $in: categoryIds },
          status: "Active",
        })
          .select("name image imageVariants slug")
          .sort({ order: 1 })
          .limit(limit || 8)
          .lean();

        const categoryTiles = await Promise.all(
          fetchedCategories.map(async (c: any) => {
            const hasProducts = await Product.exists({
              category: c._id,
              status: "Active",
              publish: true,
            });
            if (!hasProducts) return null;

            const productImages = await fetchPreviewImages({ category: c._id }, c.image);
            return {
              id: c._id.toString(),
              categoryId: c.slug || c._id.toString(), // Use slug for SEO-friendly URLs, fallback to _id
              name: c.name,
              image: c.image,
              imageVariants: c.imageVariants || null,
              productImages,
              slug: c.slug,
              type: "category",
            };
          })
        );
        return categoryTiles.filter(Boolean) as any[];
      } else {
        // If no categories specified, return empty array
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error fetching section data:", error);
    return [];
  }
}

async function fetchLowestPricesProducts(
  nearbySellerIds: mongoose.Types.ObjectId[]
) {
  const lowestPricesProductsQuery: any = {
    isActive: true,
  };

  const visibleSellers = await Seller.find({ isEnabled: true }).select("_id");
  const visibleSellerIds = visibleSellers.map((s) => s._id);

  const lowestPricesProducts = await LowestPricesProduct.find(
    lowestPricesProductsQuery
  )
    .populate({
      path: "product",
      select:
        "productName mainImage price discPrice compareAtPrice mrp variations unitPricing discount status publish category subcategory seller",
      match: {
        status: "Active",
        publish: true,
        seller: { $in: visibleSellerIds },
      },
      populate: {
        path: "category",
        match: { status: "Active" },
      },
    })
    .sort({ order: 1 })
    .lean();

  return lowestPricesProducts
    .filter((item: any) => item.product !== null && item.product.category !== null)
    .map((item: any) => {
      const mapped = toListItem(item.product);
      const isAvailable = true;

      return {
        id: mapped._id,
        _id: mapped._id,
        productName: mapped.productName,
        name: mapped.productName,
        mainImage: mapped.mainImage,
        imageUrl: mapped.listing.imageUrl || mapped.mainImage,
        price: mapped.price,
        discPrice: mapped.discPrice,
        compareAtPrice: mapped.compareAtPrice,
        variations: mapped.variations,
        variants: mapped.variants,
        listing: mapped.listing,
        unitPricing: item.product.unitPricing || [],
        mrp: mapped.compareAtPrice || mapped.price,
        discount: mapped.discount || 0,
        categoryId: item.product.category?.toString() || "",
        subcategory: item.product.subcategory?.toString() || "",
        status: mapped.status,
        publish: mapped.publish,
        isAvailable,
        seller: item.product.seller,
        pack: item.product.pack || mapped.variations?.[0]?.value || "",
      };
    });
}

// Get Home Page Content
export const getHomeContent = async (req: Request, res: Response) => {
  const { headerCategorySlug, latitude, longitude } = req.query; // Get header category slug and location from query params

  try {
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    // Location no longer gates product visibility for customers; kept only
    // for the cache bucketing below.
    const nearbySellerIds: mongoose.Types.ObjectId[] = [];

    // Location buckets to ~1.1km so nearby users share a cache entry instead
    // of each minting their own. The response only ever depends on which
    // sellers are "nearby" and the header category, so this key is exact.
    const locationKey =
      userLat !== null && userLng !== null
        ? `${userLat.toFixed(2)},${userLng.toFixed(2)}`
        : "none";
    const homeCacheKey = `home-content-${(headerCategorySlug as string) || "all"}-${locationKey}`;

    const payload = await cache.getOrSet(
      homeCacheKey,
      async () => {
    // Every group below is independent — each depends only on nearbySellerIds
    // and headerCategorySlug, never on another group's result. Running them
    // sequentially made this endpoint the sum of all ten groups; concurrently
    // it costs about as much as its slowest group.

    // 1. Featured / Bestsellers - Get bestseller cards from admin configuration
    const loadBestsellers = async () => {
      const bestsellerCards = await BestsellerCard.find({
        isActive: true,
      })
        .populate("category", "name slug image")
        .sort({ order: 1 })
        .limit(6)
        .lean();

      // For each bestseller card, get 4 products from the associated category
      return (await Promise.all(
        bestsellerCards.map(async (card: any) => {
          const categoryId = card?.category?._id ?? card?.category;
          if (!categoryId) return null;

          // Build product query for images (ignore location to show category preview)
          const productQuery: any = {
            category: categoryId,
            status: "Active",
            publish: true,
          };

          // Ensure category is active
          const activeCategory = await Category.findOne({ _id: categoryId, status: "Active" }).select("_id").lean();
          if (!activeCategory) return null;

          // Fetch 4 active products from the category for preview images
          // We fetch these irrespective of location radius to show category preview
          const categoryProducts = await Product.find(productQuery)
            .select("productName mainImage galleryImages")
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

          if (categoryProducts.length === 0) return null;

          // Extract exactly 4 product images (prefer mainImage, fallback to galleryImages[0])
          const productImages: string[] = [];
          categoryProducts.forEach((product: any) => {
            if (productImages.length < 4 && product.mainImage) {
              productImages.push(product.mainImage);
            }
          });

          // If we have less than 4 products, try to use gallery images
          if (productImages.length < 4) {
            categoryProducts.forEach((product: any) => {
              if (
                productImages.length < 4 &&
                product.galleryImages &&
                product.galleryImages.length > 0
              ) {
                productImages.push(product.galleryImages[0]);
              }
            });
          }

          // Ensure we have exactly 4 images (pad with first image if needed)
          while (productImages.length < 4 && productImages[0]) {
            productImages.push(productImages[0]);
          }

          return {
            id: card._id.toString(),
            categoryId: String(categoryId),
            name: card.name,
            productImages: productImages.slice(0, 4),
            productCount: categoryProducts.length,
          };
        })
      )).filter(Boolean);
    };

    // 3. Categories for Tiles (Grocery, Snacks, etc)
    const loadCategories = async () => {
      return Category.find({
        status: "Active",
      })
        .select("name image imageVariants icon color slug")
        .sort({ order: 1 });
    };

    // 4. Shop By Store - Fetch from database
    const loadShops = async () => {
      const shopDocuments = await Shop.find({ isActive: true })
        .populate("category", "name slug")
        .sort({ order: 1, createdAt: -1 })
        .lean();

      // Transform shop data to match frontend expected format and include preview images
      return Promise.all(
        shopDocuments.map(async (shop: any) => {
          let productImages: string[] = [];

          if (shop.products && shop.products.length > 0) {
            const shopProducts = await Product.find({
              _id: { $in: shop.products.slice(0, 4) },
              status: "Active",
              publish: true,
            })
              .select("mainImage")
              .lean();

            productImages = shopProducts
              .map((p: any) => p.mainImage)
              .filter(Boolean);
          }

          return {
            id: shop.storeId || shop._id.toString(),
            name: shop.name,
            image: shop.image,
            imageVariants: shop.imageVariants || null,
            productImages, // Include preview images irrespective of location
            slug: shop.storeId || shop._id.toString(),
            category: shop.category,
            productIds: shop.products?.map((p: any) => p.toString()) || [],
            bgColor: shop.bgColor || "bg-neutral-50",
          };
        })
      );
    };

    // 5. Trending Items (Fetch some popular categories or products)
    const loadTrending = async () => {
      const trendingCategories = await Category.find({
        status: "Active",
      })
        .limit(5)
        .select("name image slug");

      return trendingCategories.map((c) => ({
        id: c._id,
        name: c.name,
        image: c.image || `/assets/categories/${c.slug}.jpg`,
        type: "category",
      }));
    };

    // 6. Personal Care Subcategories - Now handled by dynamic sections

    // 7. Cooking Ideas (Fetch some products from 'Food' or 'Grocery' categories)
    // We fetch these irrespective of location radius to show preview images
    const loadCookingIdeas = async () => {
      const activeCategories = await Category.find({ status: "Active" }).select("_id").lean();
      const activeCategoryIds = activeCategories.map(c => c._id);

      const foodProductsQuery: any = {
        status: "Active",
        publish: true,
        category: { $in: activeCategoryIds }
      };

      const foodProducts = await Product.find(foodProductsQuery)
        .limit(3)
        .select("productName variations");

      return foodProducts.map((p) => {
        const mapped = toListItem(p);
        return {
          id: p._id,
          title: p.productName,
          image: mapped.listing.imageUrl,
          productId: p._id,
        };
      });
    };

    // 8. Promo Cards (Dynamic - Categories with headerCategoryId)
    // Fetch root categories (parentId: null) that have a headerCategoryId assigned and are Active
    // If headerCategorySlug is provided, filter by that specific header category
    // Include their child categories (subcategories) with images
    const loadPromoCards = async () => {
      // Build query for categories
      const categoryQuery: any = {
        headerCategoryId: { $exists: true, $ne: null },
        status: "Active",
        parentId: null, // Only root categories (not subcategories themselves)
      };

      // If headerCategorySlug is provided, find the header category and filter by it
      if (headerCategorySlug && headerCategorySlug !== "all") {
        const headerCategory = await HeaderCategory.findOne({
          slug: headerCategorySlug,
          status: "Published",
        }).lean();

        if (headerCategory) {
          categoryQuery.headerCategoryId = headerCategory._id;
        } else {
          // If header category not found, return empty promo cards for this header category
          // The query will still work but won't match any categories
          console.log(
            `Header category with slug "${headerCategorySlug}" not found`
          );
        }
      }

      const categoriesWithHeaderCategory = await Category.find(categoryQuery)
        .populate("headerCategoryId", "name status")
        .sort({ order: 1 })
        .lean();

      const promoCards = await Promise.all(
        categoriesWithHeaderCategory.map(async (category: any) => {
          // Get child categories (subcategories) for this category
          const childCategories = await Category.find({
            parentId: category._id,
            status: "Active",
          })
            .select("name image _id")
            .sort({ order: 1 })
            .lean();

          // Extract subcategory images
          const subcategoryImages = childCategories
            .map((child: any) => child.image)
            .filter((img: string) => img && img.trim() !== "");

          return {
            id: category._id.toString(),
            badge: "Up to 55% OFF", // Default badge, can be customized later
            title: category.name,
            categoryId: category._id.toString(),
            slug: category.slug || category._id.toString(),
            bgColor: "bg-yellow-50",
            subcategoryImages: subcategoryImages, // All images included
          };
        })
      );

      // Fallback to hardcoded cards if no categories with headerCategoryId exist
      return promoCards.length > 0
        ? promoCards
        : [
          {
            id: "self-care",
            badge: "Up to 55% OFF",
            title: "Self Care & Wellness",
            categoryId: "personal-care",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "hot-meals",
            badge: "Up to 55% OFF",
            title: "Hot Meals & Drinks",
            categoryId: "breakfast-instant",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "kitchen-essentials",
            badge: "Up to 55% OFF",
            title: "Kitchen Essentials",
            categoryId: "atta-rice",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "cleaning-home",
            badge: "Up to 75% OFF",
            title: "Cleaning & Home Needs",
            categoryId: "household",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
        ];
    };

    // 9. Dynamic Home Sections - Fetch from database
    const loadHomeSections = async () => {
      const homeSections = await HomeSection.find({ isActive: true })
        .populate("categories", "name slug image")
        .populate("subCategories", "name")
        .sort({ order: 1 })
        .lean();

      // Fetch data for each section
      return Promise.all(
        homeSections.map(async (section: any) => {
          const sectionData = await fetchSectionData(section, nearbySellerIds);
          return {
            id: section._id.toString(),
            title: section.title,
            slug: section.slug,
            displayType: section.displayType,
            columns: section.columns,
            data: sectionData,
          };
        })
      );
    };

    // 10. Fetch PromoStrip for the current header category (with caching)
    const loadPromoStrip = async () => {
      const currentHeaderCategorySlug = (headerCategorySlug as string) || "all";
      const promoStripCacheKey = `promoStrip-${currentHeaderCategorySlug.toLowerCase()}`;

      // Try to get from cache first
      let promoStrip = cache.get(promoStripCacheKey) as any;

      if (!promoStrip) {
        const now = new Date();
        const promoStripDoc = await PromoStrip.findOne({
          headerCategorySlug: currentHeaderCategorySlug.toLowerCase(),
          isActive: true,
          startDate: { $lte: now },
          endDate: { $gte: now },
        })
          .populate("categoryCards.categoryId", "name slug image")
          .populate("featuredProducts", "productName mainImage mainImageUrl galleryImageUrls galleryImages price discPrice variations unitPricing mrp compareAtPrice discount rating reviewsCount seller")
          .sort({ order: 1 })
          .lean();

        promoStrip = promoStripDoc;

        // If we have promoStrip, add availability flag to featured products
        if (promoStrip && (promoStrip as any).featuredProducts) {
          (promoStrip as any).featuredProducts = (promoStrip as any).featuredProducts.map((p: any) => {
            return { ...p, isAvailable: true };
          });
        }

        // Cache for 3 minutes (PromoStrip data doesn't change frequently)
        if (promoStrip) {
          cache.set(promoStripCacheKey, promoStrip, 3 * 60 * 1000);
        } else {
          // Cache null result for 1 minute to prevent repeated DB queries
          cache.set(promoStripCacheKey, null, 60 * 1000);
        }
      }

      return promoStrip;
    };

    const [
      bestsellers,
      validLowestPricesProducts,
      categories,
      shops,
      trending,
      cookingIdeas,
      finalPromoCards,
      dynamicSections,
      promoStrip,
    ] = await Promise.all([
      loadBestsellers(),
      fetchLowestPricesProducts(nearbySellerIds), // 2. Lowest Prices Products - Get admin-selected products
      loadCategories(),
      loadShops(),
      loadTrending(),
      loadCookingIdeas(),
      loadPromoCards(),
      loadHomeSections(),
      loadPromoStrip(),
    ]);

        return {
          bestsellers,
          lowestPrices: validLowestPricesProducts, // Admin-selected products for LowestPricesEver section
          categories,
          // Dynamic sections created by admin
          homeSections: dynamicSections,
          shops,
          promoBanners: [
            {
              id: 1,
              image:
                "https://img.freepik.com/free-vector/horizontal-banner-template-grocery-sales_23-2149432421.jpg",
              link: "/category/grocery",
            },
            {
              id: 2,
              image:
                "https://img.freepik.com/free-vector/flat-supermarket-social-media-cover-template_23-2149363385.jpg",
              link: "/category/snacks",
            },
          ],
          trending,
          cookingIdeas,
          promoCards: finalPromoCards, // Return dynamic or fallback cards
          promoStrip: promoStrip || null, // PromoStrip data for the current header category
        };
      },
      60 * 1000 // 60s: home content is editorial, a minute of staleness is fine
    );

    res.set("Cache-Control", "public, max-age=60");
    res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching home content",
      error: error.message,
    });
  }
};

export const getLowestPricesProducts = async (req: Request, res: Response) => {
  try {
    const products = await fetchLowestPricesProducts([]);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching lowest prices products",
      error: error.message,
    });
  }
};

// Get the full contents of a single admin-created home section (unlike the
// home feed, which caps each section at its configured preview `limit`),
// for the section's "View All" page. Category/subcategory sections return
// their whole (bounded) list in one page; product sections are paginated.
export const getHomeSectionBySlug = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { latitude, longitude, page, limit } = req.query;

  try {
    const section = await HomeSection.findOne({ slug, isActive: true })
      .populate("categories", "name slug image")
      .populate("subCategories", "name")
      .lean();

    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    const nearbySellerIds: mongoose.Types.ObjectId[] = [];

    const isProducts = (section as any).displayType === "products";
    const pageNum = Math.max(1, parseInt((page as string) || "1", 10) || 1);
    const pageLimit = isProducts ? Math.min(50, Math.max(1, parseInt((limit as string) || "20", 10) || 20)) : 200;
    const skip = isProducts ? (pageNum - 1) * pageLimit : 0;

    const data = await fetchSectionData(section, nearbySellerIds, { limit: pageLimit, skip });

    res.status(200).json({
      success: true,
      data: {
        id: (section as any)._id.toString(),
        title: (section as any).title,
        slug: (section as any).slug,
        displayType: (section as any).displayType,
        columns: (section as any).columns,
        items: data,
      },
      pagination: isProducts
        ? { page: pageNum, limit: pageLimit, hasMore: data.length === pageLimit }
        : undefined,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching section",
      error: error.message,
    });
  }
};

// Get all active bestseller category cards (unlike the home feed, which caps
// at 6 for the preview row, this returns the full curated list for the
// "View All" page).
export const getAllBestsellers = async (_req: Request, res: Response) => {
  try {
    const bestsellerCards = await BestsellerCard.find({ isActive: true })
      .populate("category", "name slug image")
      .sort({ order: 1 })
      .lean();

    const bestsellers = (
      await Promise.all(
        bestsellerCards.map(async (card: any) => {
          const categoryId = card?.category?._id ?? card?.category;
          if (!categoryId) return null;

          const activeCategory = await Category.findOne({ _id: categoryId, status: "Active" })
            .select("_id")
            .lean();
          if (!activeCategory) return null;

          const categoryProducts = await Product.find({
            category: categoryId,
            status: "Active",
            publish: true,
          })
            .select("productName mainImage galleryImages")
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

          if (categoryProducts.length === 0) return null;

          const productImages: string[] = [];
          categoryProducts.forEach((product: any) => {
            if (productImages.length < 4 && product.mainImage) {
              productImages.push(product.mainImage);
            }
          });
          if (productImages.length < 4) {
            categoryProducts.forEach((product: any) => {
              if (
                productImages.length < 4 &&
                product.galleryImages &&
                product.galleryImages.length > 0
              ) {
                productImages.push(product.galleryImages[0]);
              }
            });
          }
          while (productImages.length < 4 && productImages[0]) {
            productImages.push(productImages[0]);
          }

          return {
            id: card._id.toString(),
            categoryId: String(categoryId),
            name: card.name,
            productImages: productImages.slice(0, 4),
            productCount: categoryProducts.length,
          };
        })
      )
    ).filter(Boolean);

    res.status(200).json({
      success: true,
      data: bestsellers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching bestsellers",
      error: error.message,
    });
  }
};

// Get Products for a specific "Store" (Campaign/Collection)
// Fetch products based on store configuration from database
export const getStoreProducts = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const { latitude, longitude } = req.query; // User location for filtering
    let query: any = {
      status: "Active",
      publish: true,
      // Only show shop-by-store-only products in shop by store section
      isShopByStoreOnly: true,
    };

    // Only show products from active categories
    const activeCategories = await Category.find({ status: "Active" }).select("_id").lean();
    const activeCategoryIds = activeCategories.map(c => c._id);
    query.category = { $in: activeCategoryIds };

    console.log(`[getStoreProducts] Looking for shop with storeId: ${storeId}`);

    // Build shop query - only include _id if storeId is a valid ObjectId
    const shopQuery: any = { isActive: true };
    if (mongoose.Types.ObjectId.isValid(storeId)) {
      shopQuery.$or = [
        { storeId: storeId.toLowerCase() },
        { _id: new mongoose.Types.ObjectId(storeId) }
      ];
    } else {
      shopQuery.storeId = storeId.toLowerCase();
    }

    // Find the shop by storeId or _id
    const shop = await Shop.findOne(shopQuery)
      .populate("category", "_id name slug image")
      .populate("subCategory", "_id name")
      .lean();

    console.log(`[getStoreProducts] Shop found:`, shop ? { name: shop.name, productsCount: shop.products?.length || 0, category: shop.category, image: shop.image } : 'NOT FOUND');

    let shopData: any = null;

    if (shop) {
      shopData = {
        name: shop.name,
        image: shop.image,
        description: shop.description || '',
        category: shop.category,
      };

      // Convert products array to ObjectIds if needed
      // When using .lean(), products array contains ObjectIds directly
      let productIds: mongoose.Types.ObjectId[] = [];
      if (shop.products && shop.products.length > 0) {
        productIds = shop.products.map((p: any) => {
          // Handle different formats: ObjectId, string, or object with _id
          if (mongoose.Types.ObjectId.isValid(p)) {
            return typeof p === 'string' ? new mongoose.Types.ObjectId(p) : p;
          }
          return p._id ? (typeof p._id === 'string' ? new mongoose.Types.ObjectId(p._id) : p._id) : p;
        }).filter(Boolean);
      }

      console.log(`[getStoreProducts] Shop has ${productIds.length} products assigned`);

      // Get shop ID for filtering
      const shopId = (shop as any)._id;

      // If shop has specific products assigned, use those
      if (productIds.length > 0) {
        query._id = { $in: productIds };
        // Also filter by shopId to ensure products belong to this shop
        query.shopId = shopId;
        console.log(`[getStoreProducts] Filtering by product IDs: ${productIds.length} products and shopId: ${shopId}`);
      }
      // Otherwise, filter by shopId and category/subcategory
      else {
        // Filter by shopId to show only products assigned to this shop
        query.shopId = shopId;
        console.log(`[getStoreProducts] Filtering by shopId: ${shopId}`);

        if (shop.category) {
          const categoryId = (shop.category as any)._id || (shop.category as any);
          query.category = categoryId;
          console.log(`[getStoreProducts] Also filtering by category: ${categoryId}`);

          // If subcategory is also specified, filter by both
          if (shop.subCategory) {
            const subCategoryId = (shop.subCategory as any)._id || (shop.subCategory as any);
            query.$or = [
              { category: categoryId, shopId: shopId },
              { subcategory: subCategoryId, shopId: shopId },
            ];
            console.log(`[getStoreProducts] Also filtering by subcategory: ${subCategoryId}`);
          }
        }
      }
    } else {
      // Fallback: try to match by category name (legacy support)
      const categoryId = await getCategoryIdByName(storeId);
      if (categoryId) {
        query.category = categoryId;
        // Try to get category details for shop data
        const category = await Category.findById(categoryId).select("name slug image").lean();
        if (category) {
          shopData = {
            name: category.name,
            image: category.image || '',
            description: '',
            category: category,
          };
        }
      } else {
        // No matching shop or category found
        return res.status(200).json({
          success: true,
          data: [],
          shop: null,
          message: "Store not found"
        });
      }
    }

    // Visibility filter — see customerProductController.ts for the reason
    // `canCreateCategories` is deliberately excluded.
    const visibleSellersQuery = { isEnabled: true } as const;

    const visibleSellers = await Seller.find(visibleSellersQuery).select("_id");
    const visibleSellerIds = visibleSellers.map(s => s._id);
    query.seller = { $in: visibleSellerIds };

    console.log(`[getStoreProducts] Final query:`, JSON.stringify(query, null, 2));

    const products = await Product.find(query)
      .populate("category", "name icon image")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate("seller", "storeName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean({ virtuals: true });

    const total = await Product.countDocuments(query);

    console.log(`[getStoreProducts] Found ${total} products matching query, returning ${products.length}`);

    return res.status(200).json({
      success: true,
      data: products.map(p => ({ ...p, isAvailable: true })),
      shop: shopData,
      pagination: {
        page: 1,
        limit: 50,
        total,
        pages: Math.ceil(total / 50),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching store products",
      error: error.message,
    });
  }
};

// Helper
async function getCategoryIdByName(name: string) {
  const cat = await Category.findOne({
    name: { $regex: new RegExp(name, "i") },
  });
  return cat ? cat._id : null;
}
