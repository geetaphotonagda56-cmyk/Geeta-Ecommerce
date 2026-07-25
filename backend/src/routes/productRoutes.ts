import { Router } from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  updateStock,
  updateProductStatus,
  bulkUpdateStock,
  getShops,
} from "../modules/seller/controllers/productController";
import { getBrands } from "../modules/admin/controllers/adminProductController";
import { searchProductImage } from "../modules/seller/controllers/sellerToolsController";
import { authenticate, requireUserType, checkEnabled } from "../middleware/auth";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Search image tool - shared by both the seller and admin bulk-edit UIs, so
// unlike the rest of this router it isn't seller-only. Must be registered
// before the blanket requireUserType("Seller") below, since that runs for
// every request on this router regardless of which route matches.
router.post("/search-image", requireUserType("Seller", "Admin"), checkEnabled, searchProductImage);

// Everything else on this router requires seller user type
router.use(requireUserType("Seller"));
router.use(checkEnabled);

// Get all brands - sellers need this for product creation
router.get("/brands", getBrands);

// Get all active shops - sellers need this for shop-by-store-only products
router.get("/shops", getShops);

// Create product
router.post("/", createProduct);

// Get seller's products with filters
router.get("/", getProducts);

// Get product by ID
router.get("/:id", getProductById);

// Update product
router.put("/:id", updateProduct);

// Delete product
router.delete("/:id", deleteProduct);

// Update stock for a product variation
router.patch("/:id/variations/:variationId/stock", updateStock);

// Bulk update stock
router.patch("/bulk-stock-update", bulkUpdateStock);

// Update product status (publish, popular, dealOfDay)
router.patch("/:id/status", updateProductStatus);

export default router;
