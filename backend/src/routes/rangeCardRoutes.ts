import { Router } from 'express';
import {
  getRangeCards,
  createRangeCard,
  updateRangeCard,
  deleteRangeCard,
  reorderRangeCards,
} from '../controllers/rangeCardController';
import { authenticate, requireUserType } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', getRangeCards);

// Protected routes (Admin only)
router.use(authenticate);
router.use(requireUserType('Admin'));

router.put('/reorder', reorderRangeCards);
router.post('/', createRangeCard);
router.put('/:id', updateRangeCard);
router.delete('/:id', deleteRangeCard);

export default router;
