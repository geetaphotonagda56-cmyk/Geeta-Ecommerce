import { Request, Response } from 'express';
import { RangeCard } from '../models/RangeCard';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * @desc    Get range cards
 * @route   GET /api/v1/range-cards
 * @access  Public (storefront gets only active cards; pass ?all=true for admin)
 */
export const getRangeCards = asyncHandler(async (req: Request, res: Response) => {
  const { all } = req.query;
  const filter = all === 'true' ? {} : { isActive: true };

  const rangeCards = await RangeCard.find(filter).sort({ order: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: rangeCards.length,
    data: rangeCards,
  });
});

/**
 * @desc    Create a new range card
 * @route   POST /api/v1/range-cards
 * @access  Private/Admin
 */
export const createRangeCard = asyncHandler(async (req: Request, res: Response) => {
  const { imageUrl, label, minPrice, maxPrice, order, isActive } = req.body;

  const rangeCard = await RangeCard.create({
    imageUrl,
    label,
    minPrice,
    maxPrice,
    order: order ?? 0,
    isActive: isActive !== undefined ? isActive : true,
  });

  res.status(201).json({
    success: true,
    data: rangeCard,
  });
});

/**
 * @desc    Update a range card
 * @route   PUT /api/v1/range-cards/:id
 * @access  Private/Admin
 */
export const updateRangeCard = asyncHandler(async (req: Request, res: Response) => {
  let rangeCard = await RangeCard.findById(req.params.id);

  if (!rangeCard) {
    res.status(404);
    throw new Error('Range card not found');
  }

  rangeCard = await RangeCard.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: rangeCard,
  });
});

/**
 * @desc    Delete a range card
 * @route   DELETE /api/v1/range-cards/:id
 * @access  Private/Admin
 */
export const deleteRangeCard = asyncHandler(async (req: Request, res: Response) => {
  const rangeCard = await RangeCard.findById(req.params.id);

  if (!rangeCard) {
    res.status(404);
    throw new Error('Range card not found');
  }

  await rangeCard.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

/**
 * @desc    Reorder range cards
 * @route   PUT /api/v1/range-cards/reorder
 * @access  Private/Admin
 */
export const reorderRangeCards = asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body as { items: { id: string; order: number }[] };

  if (!Array.isArray(items)) {
    res.status(400);
    throw new Error('items must be an array of { id, order }');
  }

  await Promise.all(
    items.map(({ id, order }) =>
      RangeCard.findByIdAndUpdate(id, { order })
    )
  );

  const rangeCards = await RangeCard.find().sort({ order: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    data: rangeCards,
  });
});
