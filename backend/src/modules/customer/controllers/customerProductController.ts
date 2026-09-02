import { Request, Response } from "express";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import HeaderCategory from "../../../models/HeaderCategory";
import mongoose from "mongoose";
import Seller from "../../../models/Seller"; // Import Seller model
import Brand from "../../../models/Brand";
import AppSettings from "../../../models/AppSettings";
import { toListItem, toListItems, toDetail } from "../../product/productReadMapper";

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const normalizeSlug = (value: string): string => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const findHeaderCategoryBySlug = async (value: string) => {
  const rawSlug = String(value || "").trim();
  const normalizedSlug = normalizeSlug(rawSlug);
  const namePattern = rawSlug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  return HeaderCategory.findOne({
    status: "Published",
    $or: [
      { slug: rawSlug },
      { slug: { $regex: new RegExp(`^${escapeRegex(rawSlug)}$`, "i") } },
      { slug: normalizedSlug },
      { slug: { $regex: new RegExp(`^${escapeRegex(normalizedSlug)}$`, "i") } },
      ...(namePattern
        ? [{ name: { $regex: new RegExp(`^${escapeRegex(namePattern)}$`, "i") } }]
        : []),
    ],
  })
    .select("_id")
    .lean();
};

// Collect every Category._id that belongs to a header category, regardless of
// status. We don't filter by `status: "Active"` here because the outer product
// query already restricts to `activeCategoryIds`; doing it twice causes the
// tree walk to stop at any inactive intermediate Category and silently hide
// every product under it on the header-category tab.
const getHeaderCategoryTreeIds = async (headerCategoryId: mongoose.Types.ObjectId) => {
  const allIds: mongoose.Types.ObjectId[] = [];
  const seen = new Set<string>();

  let frontier = (
    await Category.find({ headerCategoryId }).select("_id").lean()
  ).map((category: any) => category._id);

  while (frontier.length) {
    const fresh = frontier.filter((id: any) => {
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!fresh.length) break;
    allIds.push(...fresh);

    frontier = (
      await Category.find({ parentId: { $in: fresh } }).select("_id").lean()
    ).map((category: any) => category._id);
  }

  return allIds;
};

// Get products with filtering options (public)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      category,
      subcategory,
      search,
      page = 1,
      limit = 20,
      sort,
      minPrice,
      maxPrice,
      brand,
      minDiscount,
      isNewArrival,
      headerCategorySlug,
      latitude, // User location latitude
      longitude, // User location longitude
    } = req.query;

    console.log("DEBUG: getProducts called with query:", req.query);

    const settings = await AppSettings.findOne().lean();
    const inventorySection = settings?.productDisplaySettings?.find(s => s.id === 'inventory');
    const negativeStockSoldOut = inventorySection?.fields?.find(f => f.id === 'negative_stock_sold_out')?.isEnabled;

    const query: any = {
      status: "Active",
      publish: true,
    };

    // Only show products from active categories
    const activeCategories = await Category.find({ status: "Active" }).select("_id").lean();
    const activeCategoryIds = activeCategories.map(c => c._id);

    // Use $and array to combine conditions safely without overwriting $or blocks
    const andConditions: any[] = [
      {
        $or: [
          { isShopByStoreOnly: { $ne: true } },
          { isShopByStoreOnly: { $exists: false } },
        ],
      },
      // A product is visible if its category is active, OR its subcategory is
      // active (Category is self-referencing, so subcategory is also a
      // Category doc). This tolerates a stale/dangling `category` ref left
      // over from a category deletion/merge as long as the subcategory it
      // actually belongs to is still active.
      {
        $or: [
          { category: { $in: activeCategoryIds } },
          { subcategory: { $in: activeCategoryIds } },
        ],
      },
    ];

    if (negativeStockSoldOut) {
      query.stock = { $gt: 0 };
    }

    // Customer-side seller visibility is gated only by `isEnabled`.
    //
    // Historical note: this query used to also require
    //   $or: [admin-email, admin-category, admin-storeName, canCreateCategories !== true]
    // but `canCreateCategories` is an admin/authoring permission whose schema
    // default is `true` — meaning every newly registered seller was silently
    // hidden from customers (e.g. "New Shop" / "Gstore" had products that
    // never appeared on the storefront even though they were inside the
    // service-radius circle). Authorization for the storefront is `isEnabled`
    // (the admin-managed toggle). Radius/distance no longer gates what
    // customers can see or buy — sellers still configure it in the admin
    // panel, it's just not enforced on the customer side.
    const visibleSellers = await Seller.find({ isEnabled: true }).select("_id");
    const visibleSellerIds = visibleSellers.map(s => s._id);

    query.seller = { $in: visibleSellerIds };

    // Helper to resolve ID
    const resolveId = async (model: any, value: string, modelName: string = "") => {
      if (mongoose.Types.ObjectId.isValid(value)) {
        try {
          return new mongoose.Types.ObjectId(value);
        } catch (e) {
          return value;
        }
      }
      const baseQuery: any = {};
      if (modelName === "Category") baseQuery.status = "Active";
      let item = await model.findOne({ ...baseQuery, slug: value }).select("_id").lean();
      if (item) return item._id;
      item = await model.findOne({ ...baseQuery, slug: { $regex: new RegExp(`^${value}$`, "i") } }).select("_id").lean();
      if (item) return item._id;
      let namePattern = value.replace(/[-_]/g, " ");
      item = await model.findOne({ ...baseQuery, name: { $regex: new RegExp(`^${namePattern}$`, "i") } }).select("_id").lean();
      if (item) return item._id;
      if (modelName === "Category" && value.includes("and")) {
         const withAmpersand = value.replace(/-and-/g, " & ").replace(/-/g, " ");
         item = await model.findOne({ ...baseQuery, name: { $regex: new RegExp(`^${withAmpersand}$`, "i") } }).select("_id").lean();
         if (item) return item._id;
      }
      return null;
    };

    if (category) {
      const categoryId = await resolveId(Category, category as string, "Category");
      if (categoryId) {
        // Include products from all sub-categories (descendants)
        const catDoc = await Category.findById(categoryId);
        if (catDoc) {
          const descendants = await catDoc.getAllDescendants();
          const allCategoryIds = [catDoc._id, ...descendants.map(d => d._id)];
          andConditions.push({ category: { $in: allCategoryIds } });
        } else {
          andConditions.push({ category: categoryId });
        }
      }
    }

    if (headerCategorySlug && headerCategorySlug !== "all") {
      const header = await findHeaderCategoryBySlug(headerCategorySlug as string);
      if (header?._id) {
        const categoryIds = await getHeaderCategoryTreeIds(header._id);
        andConditions.push({
          $or: [
            { headerCategoryId: header._id },
            { category: { $in: categoryIds } },
            { subcategory: { $in: categoryIds } },
          ],
        });
      } else {
        andConditions.push({ category: { $in: [] } });
      }
    }

    if (subcategory) {
      let subcategoryId = await resolveId(Category, subcategory as string, "Category");
      if (!subcategoryId) {
        subcategoryId = await resolveId(
          SubCategory,
          subcategory as string,
          "SubCategory"
        );
      }

      if (subcategoryId) {
        // Match the ID in either the category OR subcategory field of the product
        andConditions.push({
          $or: [
            { subcategory: subcategoryId },
            { category: subcategoryId }
          ]
        });
      }
    }

    if (brand) {
      andConditions.push({ brand });
    }

    if (minPrice || maxPrice) {
      const priceQuery: any = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);
      andConditions.push({ price: priceQuery });
    }

    if (minDiscount) {
      andConditions.push({ discount: { $gte: Number(minDiscount) } });
    }

    if (isNewArrival === "true") {
      andConditions.push({ isNewArrival: true });
    }

    if (search) {
      const searchRegex = { $regex: search as string, $options: "i" };
      andConditions.push({
        $or: [
          { productName: searchRegex },
          { smallDescription: searchRegex },
          { tags: searchRegex },
          { sku: searchRegex },
          { barcode: searchRegex },
          { "variations.sku": searchRegex },
          { "variations.barcode": searchRegex }
        ]
      });
    }

    // Apply combined conditions to the final query
    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // Calculate skip for pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build sort object
    let sortOptions: any = { createdAt: -1 }; // Default new to old
    if (sort === "price_asc") sortOptions = { price: 1 };
    if (sort === "price_desc") sortOptions = { price: -1 };
    if (sort === "discount") sortOptions = { discount: -1 };
    if (sort === "popular") sortOptions = { popular: -1, dealOfDay: -1 };

    console.log("DEBUG: Final search query:", JSON.stringify(query));

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name icon image")
        .populate("subcategory", "name")
        .populate("brand", "name")
        .populate("seller", "storeName")
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(query),
    ]);

    let mapped = toListItems(products, { allowNegativeStock: !negativeStockSoldOut });

    if (negativeStockSoldOut) {
      mapped = mapped.filter((p) => p.listing.inStock);
    }
    if (minPrice) {
      mapped = mapped.filter((p) => p.listing.maxPrice >= Number(minPrice));
    }
    if (maxPrice) {
      mapped = mapped.filter((p) => p.listing.minPrice <= Number(maxPrice));
    }
    if (sort === "price_asc") {
      mapped.sort((a, b) => a.listing.minPrice - b.listing.minPrice);
    }
    if (sort === "price_desc") {
      mapped.sort((a, b) => b.listing.minPrice - a.listing.minPrice);
    }

    return res.status(200).json({
      success: true,
      data: mapped,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
};

// Get search suggestions (public)
export const getSearchSuggestions = async (req: Request, res: Response) => {
  try {
    const { q, latitude, longitude } = req.query;
    console.log("DEBUG: getSearchSuggestions called with q:", q, "at", latitude, longitude);

    if (!q || typeof q !== 'string') {
      return res.status(200).json({ success: true, data: [] });
    }

    const searchRegex = { $regex: q, $options: "i" };
    // Only suggest products from active categories
    const activeCategories = await Category.find({ status: "Active" }).select("_id").lean();
    const activeCategoryIds = activeCategories.map(c => c._id);

    const query: any = {
      status: "Active",
      publish: true,
      $and: [
        {
          $or: [
            { category: { $in: activeCategoryIds } },
            { subcategory: { $in: activeCategoryIds } },
          ],
        },
        {
          $or: [
            { productName: searchRegex },
            { tags: searchRegex },
            { sku: searchRegex },
            { barcode: searchRegex },
            { "variations.sku": searchRegex },
            { "variations.barcode": searchRegex }
          ],
        },
      ],
    };

    const visibleSellers = await Seller.find({ isEnabled: true }).select("_id");
    query.seller = { $in: visibleSellers.map(s => s._id) };

    const products = await Product.find(query)
      .select("productName _id mainImage category price discPrice variations unitPricing mrp discount compareAtPrice")
      .populate("category", "name")
      .limit(10)
      .lean();

    console.log(`DEBUG: Found ${products.length} matching products for suggestions`);

    // Also search for categories
    const categories = await Category.find({
      name: searchRegex,
      status: "Active"
    }).limit(3).select("name _id image").lean();

    const suggestions = [
      { id: 'search', name: q, type: 'search', image: null },
      ...products.map((p: any) => ({
        id: p._id,
        name: p.productName,
        type: 'product',
        image: p.mainImage,
        categoryName: p.category?.name,
        price: p.price,
        mrp: p.compareAtPrice || p.mrp || p.price,
        discount: p.discount
      })),
      ...categories.map(c => ({ id: c._id, name: c.name, type: 'category', image: c.image }))
    ];

    return res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error: any) {
    console.error("ERROR: getSearchSuggestions:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching suggestions",
      error: error.message
    });
  }
};

// Get single product by ID (public)
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.query; // User location

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Neither of these depends on the other's result, so fetch them together
    // instead of paying for both round trips back to back.
    const [product, settings] = await Promise.all([
      Product.findOne({
        _id: id,
        status: "Active",
        publish: true,
      })
        .populate({
          path: "category",
          match: { status: "Active" }, // Ensure category is active
          select: "name parentId status"
        })
        .populate("subcategory", "name parentId")
        .populate("brand", "name image")
        .populate(
          "seller",
          "storeName city fssaiLicNo address location serviceRadiusKm email isEnabled category"
        ),
      AppSettings.findOne().lean(),
    ]);

    if (!product || !product.category) { // If category is null due to match filter, hide product
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    // Check Negative Stock Setting
    const inventorySection = settings?.productDisplaySettings?.find(s => s.id === 'inventory');
    const negativeStockSoldOut = inventorySection?.fields?.find(f => f.id === 'negative_stock_sold_out')?.isEnabled;

    // Do not hard-404 sold-out products on the detail page — the storefront list
    // already gates on legacy root `stock` while variant stock may still be 0 on
    // unmigrated products. Let the PDP render with inStock from the read mapper.

    // Hide the product if the owning seller has been disabled by the admin.
    // (The legacy `canCreateCategories === true` block was removed — that
    // flag is an authoring permission, not a customer-visibility gate, and
    // defaulted to true, which silently 404'd every normal seller's
    // products.)
    const sellerInfo = product.seller as any;
    if (sellerInfo && sellerInfo.isEnabled === false) {
      return res.status(404).json({
        success: false,
        message: "This product is currently unavailable",
      });
    }

    // Distance to the seller no longer gates purchasability on the customer
    // side (radius is still configured per-seller in the admin panel, it's
    // just not enforced here).
    const isAvailableAtLocation = true;

    // Find similar products (by category)
    // 2. Build the final query
    const subSubId = product.subSubCategory;
    const subId = (product.subcategory as any)?._id || product.subcategory;
    const catId = (product.category as any)?._id || product.category;

    const similarProductsQuery: any = {
      _id: { $ne: product._id },
      status: "Active",
      publish: true,
      $and: [
        {
          $or: [
            { isShopByStoreOnly: { $ne: true } },
            { isShopByStoreOnly: { $exists: false } },
          ]
        }
      ]
    };

    // Case 1: If product has a sub-sub-category, show products from that same sub-sub-category
    if (subSubId) {
      similarProductsQuery.subSubCategory = subSubId;
      if (subId) similarProductsQuery.subcategory = subId;
      if (catId) similarProductsQuery.category = catId;
    }
    // Case 2: If product has a subcategory, show products from that same subcategory
    else if (subId) {
      similarProductsQuery.subcategory = subId;
      similarProductsQuery.subSubCategory = { $in: [null, ""] };
      if (catId) similarProductsQuery.category = catId;
    }
    // Case 3: If no subcategory, show products from the same main category
    else if (catId) {
      similarProductsQuery.category = catId;
      similarProductsQuery.subcategory = { $eq: null };
      similarProductsQuery.subSubCategory = { $in: [null, ""] };
    }

    const similarProducts = await Product.find(similarProductsQuery)
      .limit(6)
      .select("productName variations pack discount _id rating reviewsCount deliveryTime");

    return res.status(200).json({
      success: true,
      data: {
        ...toDetail(product, { allowNegativeStock: !negativeStockSoldOut }),
        similarProducts: toListItems(similarProducts, { allowNegativeStock: !negativeStockSoldOut }),
        isAvailableAtLocation,
      },
    });
  } catch (error: any) {
    console.error("Error in getProductById:", {
      productId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error fetching product details",
      error: error.message,
    });
  }
};

// Get all brands (public)
export const getAllBrands = async (_req: Request, res: Response) => {
  try {
    const brands = await Brand.find({}).sort({ name: 1 });
    return res.status(200).json({
      success: true,
      data: brands,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching brands",
      error: error.message,
    });
  }
};

// Get brand details (public)
export const getBrandDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID",
      });
    }

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: brand,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching brand details",
      error: error.message,
    });
  }
};
