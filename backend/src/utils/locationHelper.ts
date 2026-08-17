import mongoose from "mongoose";
import Seller from "../models/Seller";
import { cache } from "./cache";

/**
 * Helper function to calculate distance between two coordinates (Haversine formula)
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find sellers whose service radius covers the user's location
 * @param userLat User's latitude
 * @param userLng User's longitude
 * @returns Array of seller IDs within range
 */
export async function findSellersWithinRange(
  userLat: number,
  userLng: number
): Promise<mongoose.Types.ObjectId[]> {
  if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
    return [];
  }

  // Validate coordinates
  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return [];
  }

  // This does a full seller collection scan plus an in-memory Haversine loop
  // over every approved seller, and gets called multiple times per request
  // by some callers (e.g. the product detail page used to call it twice).
  // Seller locations/radii change rarely, so bucket to ~1.1km and cache
  // briefly — that turns N identical scans per minute into 1.
  const cacheKey = `nearby-sellers-${userLat.toFixed(2)},${userLng.toFixed(2)}`;
  const cached = cache.get<string[]>(cacheKey);
  if (cached) {
    return cached.map((id) => new mongoose.Types.ObjectId(id));
  }

  try {
    // Fetch all approved sellers with location or Admin status
    const sellers = await Seller.find({
      status: "Approved",
      $or: [
        { location: { $exists: true, $ne: null }, serviceRadiusKm: { $exists: true, $gt: 0 } },
        { email: /admin/i },
        { category: "Admin" },
        { storeName: { $regex: /Admin/i } }
      ]
    }).select("_id location serviceRadiusKm email category storeName");

    // Filter sellers where user is within their service radius, or it's an Admin seller
    const nearbySellerIds: mongoose.Types.ObjectId[] = [];

    for (const seller of sellers) {
      // Always include Admin sellers regardless of distance/coordinates
      const isAdminSeller =
        /admin/i.test(seller.email || "") ||
        seller.category === "Admin" ||
        /Admin/i.test(seller.storeName || "");

      if (isAdminSeller) {
        nearbySellerIds.push(seller._id as mongoose.Types.ObjectId);
        continue;
      }

      if (seller.location && seller.location.coordinates) {
        const sellerLng = seller.location.coordinates[0];
        const sellerLat = seller.location.coordinates[1];
        const distance = calculateDistance(
          userLat,
          userLng,
          sellerLat,
          sellerLng
        );
        const serviceRadius = seller.serviceRadiusKm || 10; // Default to 10km if not set

        if (distance <= serviceRadius) {
          nearbySellerIds.push(seller._id as mongoose.Types.ObjectId);
        }
      }
    }

    cache.set(cacheKey, nearbySellerIds.map((id) => id.toString()), 60 * 1000);
    return nearbySellerIds;
  } catch (error) {
    console.error("Error finding nearby sellers:", error);
    return [];
  }
}
