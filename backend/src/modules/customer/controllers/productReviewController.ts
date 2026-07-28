import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Review from '../../../models/Review';
import Order from '../../../models/Order';
import OrderItem from '../../../models/OrderItem';
import Product from '../../../models/Product';

// Recompute and persist a product's aggregate rating from its reviews.
const recomputeProductRating = async (productId: string): Promise<void> => {
    const stats = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId), status: 'Approved' } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const avgRating = stats.length > 0 ? stats[0].avgRating : 0;
    const count = stats.length > 0 ? stats[0].count : 0;

    await Product.findByIdAndUpdate(productId, {
        rating: Math.round(avgRating * 10) / 10,
        reviewsCount: count
    });
};

// A customer is "Verified" for a product if they have a delivered
// OrderItem for it, on one of their own orders.
const checkVerifiedPurchase = async (customerId: string, productId: string): Promise<boolean> => {
    const deliveredOrderIds = await Order.find({ customer: customerId, status: 'Delivered' }).distinct('_id');
    if (deliveredOrderIds.length === 0) return false;

    const deliveredItem = await OrderItem.findOne({
        product: productId,
        order: { $in: deliveredOrderIds }
    });

    return !!deliveredItem;
};

// Get reviews for a product (Public)
export const getProductReviews = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 5;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product id' });
        }

        const reviews = await Review.find({ product: productId, status: 'Approved' })
            .populate('customer', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Review.countDocuments({ product: productId, status: 'Approved' });

        // Calculate average rating (aggregate $match does not auto-cast
        // strings to ObjectId, so it must be cast explicitly here).
        const stats = await Review.aggregate([
            { $match: { product: new mongoose.Types.ObjectId(productId), status: 'Approved' } },
            { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);

        const avgRating = stats.length > 0 ? stats[0].avgRating : 0;
        const totalReviews = stats.length > 0 ? stats[0].count : 0;

        return res.status(200).json({
            success: true,
            data: {
                reviews,
                stats: {
                    avgRating: Math.round(avgRating * 10) / 10,
                    totalReviews
                },
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message
        });
    }
};

// Get the logged-in customer's own review for a product, if any (Protected)
export const getMyReview = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product id' });
        }

        const review = await Review.findOne({ customer: userId, product: productId })
            .populate('customer', 'name');

        return res.status(200).json({
            success: true,
            data: review
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching your review',
            error: error.message
        });
    }
};

// Add or update (upsert) a review (Protected). Any logged-in customer may
// review any product; purchase history only affects the Verified badge.
export const addReview = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { productId, rating, comment, title, images } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'A valid productId is required'
            });
        }

        const numericRating = Number(rating);
        if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({
                success: false,
                message: 'A rating between 1 and 5 is required'
            });
        }

        const productExists = await Product.exists({ _id: productId });
        if (!productExists) {
            return res.status(400).json({
                success: false,
                message: 'Product not found'
            });
        }

        const isVerifiedPurchase = await checkVerifiedPurchase(userId as string, productId);

        const review = await Review.findOneAndUpdate(
            { customer: userId, product: productId },
            {
                customer: userId,
                product: productId,
                rating: numericRating,
                comment,
                title,
                images,
                status: 'Approved',
                isVerifiedPurchase
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).populate('customer', 'name');

        await recomputeProductRating(productId);

        return res.status(200).json({
            success: true,
            message: 'Review saved successfully',
            data: review
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error adding review',
            error: error.message
        });
    }
};
