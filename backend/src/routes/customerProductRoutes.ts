import { Router } from "express";
import { getProducts, getProductById, getAllBrands, getBrandDetails, getSearchSuggestions } from "../modules/customer/controllers/customerProductController";
import { stripPurchasePriceAlways } from "../middleware/staffAccessControl";

const router = Router();

// Public routes (no auth required for viewing products)
// Purchase price must never reach anonymous customers, regardless of controller-level select().
router.use(stripPurchasePriceAlways);
router.get("/brands", getAllBrands);
router.get("/brands/:id", getBrandDetails);
router.get("/suggestions", getSearchSuggestions);
router.get("/", getProducts);
router.get("/:id", getProductById);

export default router;
