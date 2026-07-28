
import { Router } from 'express';
import { getProductReviews, addReview, getMyReview } from '../modules/customer/controllers/productReviewController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public route to view reviews
router.get('/:productId', getProductReviews);

// Protected route: get the logged-in customer's own review for a product
router.get('/:productId/mine', authenticate, getMyReview);

// Protected route to add review
router.post('/', authenticate, addReview);

export default router;
