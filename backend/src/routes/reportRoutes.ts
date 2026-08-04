import { Router } from "express";
import {
  getSalesReport,
  getGSTSalesReport,
  deleteGSTSalesReportEntries,
  getPaymentReport,
  getSalesSummaryReport,
  getReturnExchangeReport,
  getStockSalesSummary,
  getDueSummaryReport
} from "../modules/seller/controllers/reportController";
import {
  listGSTReport,
  createGSTReportEntry,
  updateGSTReportEntry,
  deleteGSTReportEntry,
} from "../modules/seller/controllers/sellerGSTReportController";
import { authenticate, requireUserType, checkEnabled } from "../middleware/auth";
import { hidePurchasePriceForStaff, blockStaffReportMutation } from "../middleware/staffAccessControl";

const router = Router();

// All routes require authentication and seller user type
router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(checkEnabled);
router.use(hidePurchasePriceForStaff);
// Get seller's sales report
router.get("/sales", getSalesReport);
router.get("/gst-sales", getGSTSalesReport);
router.delete("/gst-sales", blockStaffReportMutation, deleteGSTSalesReportEntries);
router.get("/payment", getPaymentReport);
router.get("/sales-summary", getSalesSummaryReport);
router.get("/return-exchange", getReturnExchangeReport);
router.get("/stock-sales-summary", getStockSalesSummary);
router.get("/due-summary", getDueSummaryReport);

// Custom GST Report (Purchase GST Register) - manual register CRUD
router.get("/gst-register", listGSTReport);
router.post("/gst-register", createGSTReportEntry);
router.patch("/gst-register/:id", blockStaffReportMutation, updateGSTReportEntry);
router.delete("/gst-register/:id", blockStaffReportMutation, deleteGSTReportEntry);

export default router;
