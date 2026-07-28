import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Review from '../models/Review';
import Order from '../models/Order';
import OrderItem from '../models/OrderItem';
import Product from '../models/Product';

dotenv.config();

const checkVerifiedPurchase = async (customerId: string, productId: string): Promise<boolean> => {
    const deliveredOrderIds = await Order.find({ customer: customerId, status: 'Delivered' }).distinct('_id');
    if (deliveredOrderIds.length === 0) return false;

    const deliveredItem = await OrderItem.findOne({
        product: productId,
        order: { $in: deliveredOrderIds }
    });

    return !!deliveredItem;
};

const run = async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const pendingReviews = await Review.find({ status: 'Pending' });
    console.log(`Found ${pendingReviews.length} pending reviews to backfill`);

    const affectedProductIds = new Set<string>();

    for (const review of pendingReviews) {
        const isVerifiedPurchase = await checkVerifiedPurchase(
            review.customer.toString(),
            review.product.toString()
        );
        review.status = 'Approved';
        review.isVerifiedPurchase = isVerifiedPurchase;
        await review.save();
        affectedProductIds.add(review.product.toString());
    }

    for (const productId of affectedProductIds) {
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
    }

    console.log(`Backfilled ${pendingReviews.length} reviews across ${affectedProductIds.size} products`);
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
