import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SalesPerson from "../../../models/SalesPerson";

/**
 * Search sales-person/delivery-person entries (admin-scoped, seller: null).
 * Route: GET /api/admin/sales-persons?search=
 */
export const searchSalesPersons = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query;

  const query: any = { seller: null };
  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { phone: regex }];
  }

  const results = await SalesPerson.find(query).sort({ updatedAt: -1 }).limit(20);

  return res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * Create a sales-person/delivery-person entry, or return the existing one
 * if the phone number is already on file (dedupe by phone, not name).
 * Route: POST /api/admin/sales-persons
 */
export const createSalesPerson = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({
      success: false,
      message: "Name and phone are required",
    });
  }

  const existing = await SalesPerson.findOne({ seller: null, phone: String(phone).trim() });
  if (existing) {
    return res.status(200).json({
      success: true,
      data: existing,
      message: "Existing entry found for this phone number",
    });
  }

  const created = await SalesPerson.create({
    name: String(name).trim(),
    phone: String(phone).trim(),
    seller: null,
  });

  return res.status(201).json({
    success: true,
    data: created,
    message: "Sales person created successfully",
  });
});
