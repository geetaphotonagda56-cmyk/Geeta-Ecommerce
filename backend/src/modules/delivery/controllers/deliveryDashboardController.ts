import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Delivery from "../../../models/Delivery";
import Order from "../../../models/Order";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import mongoose from "mongoose";

/**
 * Get Dashboard Stats
 * Returns: Daily Collection, Cash Balance, Pending Orders, All Orders, etc.
 */
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
    // Assuming user ID is attached to req.user by auth middleware
    const deliveryId = req.user?.userId;

    if (!deliveryId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // 1. Fetch Delivery Partner Details (for Cash Balance)
    const deliveryPartner = await Delivery.findById(deliveryId);
    if (!deliveryPartner) {
        return res.status(404).json({ success: false, message: "Delivery partner not found" });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 2. Fetch Orders Assigned to this Partner
    // We need:
    // - Pending Orders (Ready for pickup, Out for delivery, Picked Up)
    // - Today's All Orders (Created today OR Delivered today?) -> "Today's All Order" usually means active + completed today
    // - Today's Delivered Orders (for Earnings & Collection)
    // - Return Orders

    const objectId = new mongoose.Types.ObjectId(deliveryId);

    // Aggregation to get counts in one go
    const stats = await Order.aggregate([
        {
            $match: {
                deliveryBoy: objectId,
                // We consider orders active or touching today
            }
        },
        {
            $group: {
                _id: null,
                // Pending: assigned to this delivery boy and not yet in a
                // terminal state. "Ready for pickup"/"Assigned" are values of
                // deliveryBoyStatus/DeliveryAssignment.status, not Order.status
                // - matching them here never matched real orders, which is why
                // a just-dispatched order (Order.status stays "Processed")
                // never showed up as pending.
                pendingOrders: {
                    $sum: {
                        $cond: [{ $not: [{ $in: ["$status", ["Delivered", "Cancelled", "Rejected", "Returned"]] }] }, 1, 0]
                    }
                },
                // All Orders Today: Created today OR Updated today
                allOrdersToday: {
                    $sum: {
                        $cond: [{ $and: [{ $gte: ["$updatedAt", todayStart] }, { $lte: ["$updatedAt", todayEnd] }] }, 1, 0]
                    }
                },
                // Daily Collection: Cash collected from COD orders delivered TODAY
                dailyCollection: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$status", "Delivered"] },
                                    { $eq: ["$paymentMethod", "COD"] }, // Assuming 'COD' string for Cash on Delivery
                                    { $gte: ["$deliveredAt", todayStart] },
                                    { $lte: ["$deliveredAt", todayEnd] }
                                ]
                            },
                            "$total", // Sum the order total
                            0
                        ]
                    }
                },
                // Today's Earning: Commission earned today (Mock calculation: 40 per order)
                // In real app, this should come from a Commission model or field on Order
                todayDeliveredCount: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$status", "Delivered"] },
                                    { $gte: ["$deliveredAt", todayStart] },
                                    { $lte: ["$deliveredAt", todayEnd] }
                                ]
                            }, 1, 0
                        ]
                    }
                },
                // Total Completed Deliveries (Lifetime)
                totalDeliveredCount: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0]
                    }
                }

            }
        }
    ]);

    const result = stats[0] || {
        pendingOrders: 0,
        allOrdersToday: 0,
        dailyCollection: 0,
        todayDeliveredCount: 0,
        totalDeliveredCount: 0
    };

    // Earnings: sum of the real commission snapshotted per delivery on
    // DeliveryAssignment (reflects this delivery boy's actual commission
    // config), not a flat per-order multiplication.
    const earningsAgg = await DeliveryAssignment.aggregate([
        {
            $match: {
                deliveryBoy: objectId,
                status: "Delivered",
                assignmentType: "Order",
            }
        },
        {
            $group: {
                _id: null,
                totalEarning: { $sum: { $ifNull: ["$commissionAmount", 0] } },
                todayEarning: {
                    $sum: {
                        $cond: [
                            { $and: [{ $gte: ["$deliveredAt", todayStart] }, { $lte: ["$deliveredAt", todayEnd] }] },
                            { $ifNull: ["$commissionAmount", 0] },
                            0
                        ]
                    }
                }
            }
        }
    ]);
    const { todayEarning = 0, totalEarning = 0 } = earningsAgg[0] || {};

    // Return & Replace Tasks: sourced from DeliveryAssignment (same source
    // the "Return & Replace Tasks" page - getReturnTasks - reads from), not
    // Order.status, so the dashboard count actually matches what's shown
    // when the delivery boy taps into that page.
    const activeReturnTaskCount = await DeliveryAssignment.countDocuments({
        deliveryBoy: deliveryId,
        assignmentType: { $in: ["Return", "Replacement"] },
        status: { $in: ["Assigned", "Accepted", "Picked Up", "In Transit"] }
    });

    // Items currently in the delivery boy's possession awaiting drop-off at
    // the store (picked up from the customer, not yet handed back).
    const returnItemsHeldCount = await DeliveryAssignment.countDocuments({
        deliveryBoy: deliveryId,
        assignmentType: "Return",
        status: { $in: ["Picked Up", "In Transit"] }
    });

    // Fetch list of Pending Orders for the "Today's Pending Order" section
    const pendingOrdersList = await Order.find({
        deliveryBoy: deliveryId,
        status: { $nin: ["Delivered", "Cancelled", "Rejected", "Returned"] }
    })
        .select("orderNumber customerName deliveryAddress status total estimatedDeliveryDate") // Select necessary fields
        .sort({ createdAt: -1 })
        .limit(5);

    // Format pending list for Frontend
    const formattedPendingList = pendingOrdersList.map(order => ({
        id: order._id,
        orderId: order.orderNumber,
        customerName: order.customerName,
        status: order.status, // Map backend status to frontend status if needed
        address: `${order.deliveryAddress.address}, ${order.deliveryAddress.city}`, // Simplify address
        totalAmount: order.total,
        estimatedDeliveryTime: order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'
    }));

    return res.status(200).json({
        success: true,
        data: {
            dailyCollection: result.dailyCollection,
            cashBalance: deliveryPartner.cashCollected, // This field stores total cash holding
            pendingOrders: result.pendingOrders,
            allOrders: result.allOrdersToday,
            returnOrders: activeReturnTaskCount,
            returnItems: returnItemsHeldCount,
            todayEarning: todayEarning,
            totalEarning: totalEarning,
            pendingOrdersList: formattedPendingList
        }
    });

});

/**
 * Get Help & Support Data
 */
export const getHelpSupport = asyncHandler(async (_req: Request, res: Response) => {
    const faqItems = [
        {
            question: 'How do I accept a new order?',
            answer: 'When you receive a new order notification, tap on it to view order details. Click "Accept Order" to confirm.',
        },
        {
            question: 'What should I do if I cannot deliver an order?',
            answer: 'Contact the customer first. If unable to reach them, mark the order as "Unable to Deliver" and contact support.',
        },
        {
            question: 'How are my earnings calculated?',
            answer: 'You earn ₹25 per successful delivery. Additional bonuses may apply for special orders or peak hours.',
        },
        {
            question: 'How do I update my profile information?',
            answer: 'Go to Menu > Profile and tap "Edit Profile" to update your personal details, vehicle information, etc.',
        },
        {
            question: 'What if I have a complaint or issue?',
            answer: 'You can contact our support team through the Help & Support section or call our helpline at +91-1800-XXX-XXXX.',
        },
        {
            question: 'What are the delivery timings?',
            answer: 'You can deliver orders between 8 AM and 10 PM. Peak hours are usually during lunch (12-3 PM) and dinner (7-10 PM).',
        }
    ];

    const contactOptions = [
        { label: 'Call Support', value: '+91-1800-XXX-XXXX', icon: 'phone' },
        { label: 'Email Support', value: 'support@Geeta Stores.com', icon: 'email' },
        { label: 'Live Chat', value: 'Available 24/7', icon: 'chat' },
    ];

    res.status(200).json({
        success: true,
        data: {
            faqs: faqItems,
            contact: contactOptions
        }
    });
});
