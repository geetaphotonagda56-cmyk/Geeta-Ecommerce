import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import mongoose from "mongoose";

/**
 * Get Earnings History
 */
export const getEarningsHistory = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const objectId = new mongoose.Types.ObjectId(deliveryId);

    // Aggregation to group earnings by day, sourced from DeliveryAssignment
    // (which snapshots the real commission paid per delivery) rather than
    // Order, so this reflects each delivery boy's actual commission config.
    const earnings = await DeliveryAssignment.aggregate([
        {
            $match: {
                deliveryBoy: objectId,
                status: "Delivered",
                assignmentType: "Order",
                deliveredAt: { $exists: true } // Ensure delivered date exists
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt" }
                },
                amount: { $sum: { $ifNull: ["$commissionAmount", 0] } },
                deliveries: { $sum: 1 }
            }
        },
        { $sort: { _id: -1 } }, // Sort by date descending
        { $limit: 30 } // Last 30 days
    ]);

    const formattedEarnings = earnings.map(day => {
        // Humanize date labels like "Today", "Yesterday"
        const date = new Date(day._id);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let dateLabel = day._id;
        if (date.toDateString() === today.toDateString()) dateLabel = "Today";
        else if (date.toDateString() === yesterday.toDateString()) dateLabel = "Yesterday";
        else {
            // Calculate "X days ago" if needed or leave date string
            const diffTime = Math.abs(today.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) dateLabel = `${diffDays} days ago`;
        }

        return {
            date: dateLabel,
            rawDate: day._id, // Keep raw date for sorting/logic if needed
            amount: day.amount,
            deliveries: day.deliveries
        };
    });

    return res.status(200).json({
        success: true,
        data: formattedEarnings
    });
});

/**
 * Get per-delivery earnings breakdown for the logged-in delivery boy
 */
export const getEarningsDetail = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const objectId = new mongoose.Types.ObjectId(deliveryId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const match: any = {
        deliveryBoy: objectId,
        status: "Delivered",
        assignmentType: "Order",
    };

    const [assignments, total] = await Promise.all([
        DeliveryAssignment.find(match)
            .populate("order", "orderNumber total shipping")
            .select("order deliveredAt commissionAmount commissionType commissionRate commissionBasisAmount")
            .sort({ deliveredAt: -1 })
            .skip(skip)
            .limit(limit),
        DeliveryAssignment.countDocuments(match),
    ]);

    const data = assignments.map((assignment: any) => ({
        id: assignment._id,
        orderId: assignment.order?._id,
        orderNumber: assignment.order?.orderNumber,
        deliveredAt: assignment.deliveredAt,
        commissionType: assignment.commissionType,
        commissionRate: assignment.commissionRate,
        commissionBasisAmount: assignment.commissionBasisAmount,
        commissionAmount: assignment.commissionAmount ?? 0,
    }));

    return res.status(200).json({
        success: true,
        data,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
});
