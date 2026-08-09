import { Router } from "express";
import { getHomeContent, getStoreProducts, getLowestPricesProducts, getAllBestsellers, getHomeSectionBySlug } from "../modules/customer/controllers/customerHomeController";
import { stripPurchasePriceAlways } from "../middleware/staffAccessControl";

const router = Router();

// Public routes
router.use(stripPurchasePriceAlways);
router.get("/", getHomeContent);
router.get("/lowest-prices", getLowestPricesProducts);
router.get("/bestsellers", getAllBestsellers);
router.get("/section/:slug", getHomeSectionBySlug);
router.get("/store/:storeId", getStoreProducts);

export default router;
