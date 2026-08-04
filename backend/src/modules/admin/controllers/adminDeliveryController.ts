import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Delivery from "../../../models/Delivery";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import CashCollection from "../../../models/CashCollection";

/**
 * Create a new delivery boy
 */
export const createDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      name,
      mobile,
      email,
      password,
      dateOfBirth,
      address,
      city,
      pincode,
      drivingLicense,
      nationalIdentityCard,
      accountName,
      bankName,
      accountNumber,
      ifscCode,
      bonusType,
    } = req.body;

    if (!name || !mobile || !email || !password || !address || !city) {
      return res.status(400).json({
        success: false,
        message:
          "Name, mobile, email, password, address, and city are required",
      });
    }

    const deliveryBoy = await Delivery.create({
      name,
      mobile,
      email,
      password,
      dateOfBirth,
      address,
      city,
      pincode,
      drivingLicense,
      nationalIdentityCard,
      accountName,
      bankName,
      accountNumber,
      ifscCode,
      bonusType,
      status: "Inactive", // New delivery boys start as inactive
    });

    return res.status(201).json({
      success: true,
      message: "Delivery boy created successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Quick-create a delivery partner from the admin "Dispatch Order" popup,
 * with just a name + phone. Placeholder email/password/address/city fill
 * the schema's required fields; the admin can complete the profile later
 * via the full edit form. Immediately Active so it's dispatchable right away.
 */
export const quickCreateDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, mobile } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Name and mobile are required",
      });
    }

    const existing = await Delivery.findOne({ mobile });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A delivery partner with this mobile number already exists",
      });
    }

    const placeholderEmail = `delivery.${mobile}.${Date.now()}@placeholder.geeta.local`;
    const placeholderPassword = Math.random().toString(36).slice(-10);

    const deliveryBoy = await Delivery.create({
      name,
      mobile,
      email: placeholderEmail,
      password: placeholderPassword,
      address: "",
      city: "",
      status: "Active",
    });

    return res.status(201).json({
      success: true,
      message: "Delivery partner created successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Get all delivery boys
 */
export const getAllDeliveryBoys = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      available,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (available) query.available = available;
    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: "i" } },
        { mobile: { $regex: search as string, $options: "i" } },
        { email: { $regex: search as string, $options: "i" } },
        { address: { $regex: search as string, $options: "i" } },
      ];
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [deliveryBoys, total] = await Promise.all([
      Delivery.find(query)
        .select("-password")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Delivery.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Delivery boys fetched successfully",
      data: deliveryBoys,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get delivery boy by ID
 */
export const getDeliveryBoyById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const deliveryBoy = await Delivery.findById(id).select("-password");

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy fetched successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Update delivery boy
 */
export const updateDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Don't allow password update through this endpoint
    delete updateData.password;

    const deliveryBoy = await Delivery.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy updated successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Delete delivery boy
 */
export const deleteDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check for active assignments
    const activeAssignments = await DeliveryAssignment.countDocuments({
      deliveryBoy: id,
      status: { $in: ["Assigned", "Picked Up", "In Transit"] },
    });

    if (activeAssignments > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete delivery boy with active assignments",
      });
    }

    // Check if cash balance exists
    const deliveryBoy = await Delivery.findById(id);
    if (deliveryBoy && (deliveryBoy.balance > 0 || deliveryBoy.cashCollected > 0)) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete delivery boy with pending balance or cash collected",
      });
    }

    const deletedDeliveryBoy = await Delivery.findByIdAndDelete(id);

    if (!deletedDeliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy deleted successfully",
    });
  }
);

/**
 * Update delivery boy status
 */
export const updateDeliveryStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive",
      });
    }

    const deliveryBoy = await Delivery.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).select("-password");

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy status updated successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Update delivery boy availability
 */
export const updateDeliveryBoyAvailability = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { available } = req.body; // Expecting "Available" or "Not Available"

    if (!["Available", "Not Available"].includes(available)) {
      return res.status(400).json({
        success: false,
        message: "Availability must be 'Available' or 'Not Available'",
      });
    }

    const deliveryBoy = await Delivery.findByIdAndUpdate(
      id,
      { available },
      { new: true, runValidators: true }
    ).select("-password");

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy availability updated successfully",
      data: deliveryBoy,
    });
  }
);

/**
 * Get delivery assignments
 */
export const getDeliveryAssignments = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params; // Delivery boy ID
    const { status, page = 1, limit = 10 } = req.query;

    const query: any = { deliveryBoy: id };
    if (status) query.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [assignments, total] = await Promise.all([
      DeliveryAssignment.find(query)
        .populate("order")
        .populate("assignedBy", "firstName lastName")
        .sort({ assignedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      DeliveryAssignment.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Delivery assignments fetched successfully",
      data: assignments,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Collect cash from delivery boy
 */
export const collectCash = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params; // Delivery boy ID
  const { amount, notes } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid amount is required",
    });
  }

  const deliveryBoy = await Delivery.findById(id);
  if (!deliveryBoy) {
    return res.status(404).json({
      success: false,
      message: "Delivery boy not found",
    });
  }

  if (deliveryBoy.cashCollected < amount) {
    return res.status(400).json({
      success: false,
      message: "Amount exceeds cash collected",
    });
  }

  // Update cash collected
  deliveryBoy.cashCollected -= amount;
  // LOGIC FIX: When cash is collected (paid to admin), balance (amount owed to delivery boy) should logicly NOT increase? 
  // However, looking at the previous developer's logic: 
  // "balance" might mean "amount delivery boy OWES admin"?? Or "amount Admin OWES delivery boy"?
  // If deliveryBoy.cashCollected is "Cash currently held by delivery boy", then collecting it reduces it.
  // Generally "Balance" in these apps = Wallet Balance (Earnings).
  // If we collected cash, it means the delivery boy PAID the admin. 
  // If the delivery boy PAID the admin, why would their wallet balance INCREASE?
  // Unless "Balance" is a debt ledger?
  // Let's assume standard behavior: Paying cash reduces cashCollected. Logic regarding 'balance' was suspicious.
  // I will LEAVE the existing suspicious logic as-is for now to avoid breaking existing accounting, 
  // but I'll add the new endpoint.

  // deliveryBoy.balance += amount; // This line was in original code. Keeping it but noting it is weird.
  // Wait, if I am implementing this new, I should probably do it right? 
  // The original file had this logic? Yes, lines 277-278. 
  // I am NOT touching collectCash logic right now as it wasn't requested, I'm just adding NEW endpoints.

  // Re-adding the original lines I replaced in this chunk (actually I'm just appending, wait):
  // Ah, this chunk is replacing the END of the file basically? 
  // No, I'm appending getDeliveryBoyCashCollections AFTER collectCash.

  // Actually, I should just append to the file.

  deliveryBoy.balance += amount;
  await deliveryBoy.save();

  return res.status(200).json({
    success: true,
    message: "Cash collected successfully",
    data: {
      deliveryBoy: deliveryBoy.toObject(),
      transaction: {
        amount,
        notes,
        previousCashCollected: deliveryBoy.cashCollected + amount,
        newCashCollected: deliveryBoy.cashCollected,
        previousBalance: deliveryBoy.balance - amount,
        newBalance: deliveryBoy.balance,
      },
    },
  });
});

/**
 * Get delivery boy cash collections
 */
export const getDeliveryBoyCashCollections = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [collections, total] = await Promise.all([
      CashCollection.find({ deliveryBoy: id })
        .sort({ collectedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      CashCollection.countDocuments({ deliveryBoy: id }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Cash collections fetched successfully",
      data: collections,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Delivery Performance Report
 * Per-delivery-boy summary (assigned/delivered/failed/cancelled counts,
 * average delivery duration, on-time % against Order.estimatedDeliveryDate)
 * plus a paginated drill-down list of individual assignments.
 */
export const getDeliveryPerformanceReport = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      dateFrom,
      dateTo,
      deliveryBoyId,
      page = 1,
      limit = 20,
    } = req.query;

    const matchStage: any = {};
    if (dateFrom || dateTo) {
      matchStage.assignedAt = {};
      if (dateFrom) matchStage.assignedAt.$gte = new Date(dateFrom as string);
      if (dateTo) matchStage.assignedAt.$lte = new Date(dateTo as string);
    }
    if (deliveryBoyId) {
      matchStage.deliveryBoy = new mongoose.Types.ObjectId(
        deliveryBoyId as string
      );
    }

    // Per-delivery-boy counts + average delivery duration
    const perDeliveryBoyAgg = await DeliveryAssignment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$deliveryBoy",
          assigned: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "Failed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
          },
          totalDurationMs: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Delivered"] },
                    { $ifNull: ["$deliveredAt", false] },
                  ],
                },
                { $subtract: ["$deliveredAt", "$assignedAt"] },
                0,
              ],
            },
          },
          deliveredWithDuration: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Delivered"] },
                    { $ifNull: ["$deliveredAt", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "deliveries",
          localField: "_id",
          foreignField: "_id",
          as: "deliveryBoyInfo",
        },
      },
      { $unwind: { path: "$deliveryBoyInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          deliveryBoyId: "$_id",
          name: "$deliveryBoyInfo.name",
          mobile: "$deliveryBoyInfo.mobile",
          assigned: 1,
          delivered: 1,
          failed: 1,
          cancelled: 1,
          avgDurationMs: {
            $cond: [
              { $gt: ["$deliveredWithDuration", 0] },
              { $divide: ["$totalDurationMs", "$deliveredWithDuration"] },
              0,
            ],
          },
        },
      },
      { $sort: { assigned: -1 } },
    ]);

    // On-time % — join delivered assignments to their Order's estimatedDeliveryDate
    const onTimeAgg = await DeliveryAssignment.aggregate([
      {
        $match: {
          ...matchStage,
          status: "Delivered",
          deliveredAt: { $ne: null },
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "orderInfo",
        },
      },
      { $unwind: "$orderInfo" },
      { $match: { "orderInfo.estimatedDeliveryDate": { $ne: null } } },
      {
        $group: {
          _id: "$deliveryBoy",
          onTimeCount: {
            $sum: {
              $cond: [
                { $lte: ["$deliveredAt", "$orderInfo.estimatedDeliveryDate"] },
                1,
                0,
              ],
            },
          },
          withEstimate: { $sum: 1 },
        },
      },
    ]);

    const onTimeMap = new Map(
      onTimeAgg.map((row) => [row._id.toString(), row])
    );

    const perDeliveryBoy = perDeliveryBoyAgg.map((row) => {
      const onTime = onTimeMap.get(row.deliveryBoyId.toString());
      const onTimePercent =
        onTime && onTime.withEstimate > 0
          ? (onTime.onTimeCount / onTime.withEstimate) * 100
          : null;
      return { ...row, onTimePercent };
    });

    const summary = perDeliveryBoy.reduce(
      (acc, row) => {
        acc.assigned += row.assigned;
        acc.delivered += row.delivered;
        acc.failed += row.failed;
        acc.cancelled += row.cancelled;
        return acc;
      },
      { assigned: 0, delivered: 0, failed: 0, cancelled: 0 }
    );

    const totalOnTime = Array.from(onTimeMap.values()).reduce(
      (acc, row) => {
        acc.onTimeCount += row.onTimeCount;
        acc.withEstimate += row.withEstimate;
        return acc;
      },
      { onTimeCount: 0, withEstimate: 0 }
    );
    const overallOnTimePercent =
      totalOnTime.withEstimate > 0
        ? (totalOnTime.onTimeCount / totalOnTime.withEstimate) * 100
        : null;
    const overallAvgDurationMs = perDeliveryBoy.length
      ? perDeliveryBoy.reduce(
          (sum, row) => sum + row.avgDurationMs * (row.delivered || 0),
          0
        ) / (summary.delivered || 1)
      : 0;

    // Paginated drill-down list of individual assignments
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [assignments, total] = await Promise.all([
      DeliveryAssignment.find(matchStage)
        .populate("deliveryBoy", "name mobile")
        .populate("order", "orderNumber estimatedDeliveryDate total")
        .sort({ assignedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      DeliveryAssignment.countDocuments(matchStage),
    ]);

    return res.status(200).json({
      success: true,
      message: "Delivery performance report fetched successfully",
      data: {
        perDeliveryBoy,
        summary: {
          ...summary,
          onTimePercent: overallOnTimePercent,
          avgDurationMs: overallAvgDurationMs,
        },
        assignments,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);
