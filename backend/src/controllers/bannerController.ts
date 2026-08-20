import { Request, Response } from 'express';
import { Banner } from '../models/Banner';
import AppSettings from '../models/AppSettings';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * @desc    Get all banners
 * @route   GET /api/v1/banners
 * @access  Public
 */
export const getBanners = asyncHandler(async (req: Request, res: Response) => {
  const { position } = req.query;
  const query: any = { isActive: true };

  if (position) {
    query.position = position;
  }

  // If requesting from admin (implied by route structure usually, but here we just return all for lists)
  // We might want to return inactive ones for admin?
  // For now, let's just return all if no specific filter, or handle "admin" param if needed.
  // But typically admin view fetches all.

  // Let's verify if this is an admin request.
  // For simplicity, if no query params, return all (sorted by created desc)
  const filter = position ? query : {};

  const banners = await Banner.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: banners.length,
    data: banners,
  });
});

/**
 * @desc    Create a new banner
 * @route   POST /api/v1/banners
 * @access  Private/Admin
 */
export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  const { position, resourceType, resourceId, resourceName, imageUrl, imageVariants, isActive } = req.body;

  const banner = await Banner.create({
    position,
    resourceType,
    resourceId,
    resourceName,
    imageUrl,
    imageVariants,
    isActive: isActive !== undefined ? isActive : true,
  });

  res.status(201).json({
    success: true,
    data: banner,
  });
});

/**
 * @desc    Update a banner
 * @route   PUT /api/v1/banners/:id
 * @access  Private/Admin
 */
export const updateBanner = asyncHandler(async (req: Request, res: Response) => {
  let banner = await Banner.findById(req.params.id);

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  banner = await Banner.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: banner,
  });
});

/**
 * @desc    Delete a banner
 * @route   DELETE /api/v1/banners/:id
 * @access  Private/Admin
 */
export const deleteBanner = asyncHandler(async (req: Request, res: Response) => {
  const banner = await Banner.findById(req.params.id);

  if (!banner) {
    res.status(404);
    throw new Error('Banner not found');
  }

  await banner.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

/**
 * @desc    Get flash deal settings
 * @route   GET /flash-deals
 * @access  Public
 */
export const getFlashDeals = asyncHandler(async (req: Request, res: Response) => {
  let settings: any = await AppSettings.findOne().select('flashDeal dealOfTheDay featuredDeal');

  if (!settings) {
     settings = await AppSettings.getSettings();
  }

  const data = {
    flashDealTargetDate: settings.flashDeal?.targetDate 
      ? new Date(settings.flashDeal.targetDate).toISOString() 
      : new Date(Date.now() + 86400000).toISOString(),
    flashDealImage: settings.flashDeal?.image || '',
    flashDealImageVariants: settings.flashDeal?.imageVariants || null,
    isActive: settings.flashDeal?.active ?? true,
    // Flash Deal Products (separate from Deal of the Day)
    flashDealProductIds: settings.flashDeal?.productIds || [],
    // Deal of the Day
    dealOfTheDayProductIds: settings.dealOfTheDay?.productIds || [],
    dealOfTheDayActive: settings.dealOfTheDay?.active ?? true,
    // Featured Deal
    featuredDealProductIds: settings.featuredDeal?.productIds || [],
    featuredDealActive: settings.featuredDeal?.active ?? true,
  };

  res.status(200).json({
    success: true,
    data
  });
});

/**
 * @desc    Update flash deal settings
 * @route   PUT /flash-deals
 * @access  Private/Admin
 */
export const updateFlashDeals = asyncHandler(async (req: Request, res: Response) => {
  const { flashDealTargetDate, flashDealImage, flashDealImageVariants, isActive, flashDealProductIds, dealOfTheDayProductIds, dealOfTheDayActive, featuredDealProductIds, featuredDealActive } = req.body;

  let settings: any = await AppSettings.findOne();
  if (!settings) {
      settings = await AppSettings.create({
          appName: "Geeta Stores",
          contactEmail: "contact@geetastores.com",
          contactPhone: "1234567890",
      });
  }

  // Update Flash Deal fields if provided
  if (flashDealTargetDate !== undefined || flashDealImage !== undefined || isActive !== undefined || flashDealProductIds !== undefined) {
      settings.flashDeal = {
          targetDate: flashDealTargetDate ? new Date(flashDealTargetDate) : settings.flashDeal?.targetDate,
          image: flashDealImage !== undefined ? flashDealImage : settings.flashDeal?.image,
          imageVariants: flashDealImageVariants !== undefined ? flashDealImageVariants : settings.flashDeal?.imageVariants,
          active: isActive !== undefined ? isActive : (settings.flashDeal?.active ?? true),
          productIds: flashDealProductIds !== undefined ? flashDealProductIds : settings.flashDeal?.productIds
      };
  }

  // Update Deal of the Day if provided
  if (dealOfTheDayProductIds !== undefined || dealOfTheDayActive !== undefined) {
      settings.dealOfTheDay = {
          productIds: dealOfTheDayProductIds !== undefined ? dealOfTheDayProductIds : settings.dealOfTheDay?.productIds,
          active: dealOfTheDayActive !== undefined ? dealOfTheDayActive : (settings.dealOfTheDay?.active ?? true)
      };
  }

  // Update Featured Deal if provided
  if (featuredDealProductIds !== undefined || featuredDealActive !== undefined) {
      settings.featuredDeal = {
          productIds: featuredDealProductIds !== undefined ? featuredDealProductIds : settings.featuredDeal?.productIds,
          active: featuredDealActive !== undefined ? featuredDealActive : (settings.featuredDeal?.active ?? true)
      };
  }

  await settings.save();

  const data = {
    flashDealTargetDate: settings.flashDeal?.targetDate?.toISOString(),
    flashDealImage: settings.flashDeal?.image,
    flashDealImageVariants: settings.flashDeal?.imageVariants,
    isActive: settings.flashDeal?.active,
    flashDealProductIds: settings.flashDeal?.productIds,
    dealOfTheDayProductIds: settings.dealOfTheDay?.productIds,
    dealOfTheDayActive: settings.dealOfTheDay?.active,
    featuredDealProductIds: settings.featuredDeal?.productIds,
    featuredDealActive: settings.featuredDeal?.active
  };

  res.status(200).json({
    success: true,
    data
  });
});
