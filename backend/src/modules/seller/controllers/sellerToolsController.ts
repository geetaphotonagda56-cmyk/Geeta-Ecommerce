import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import AppSettings from "../../../models/AppSettings";
import axios from "axios";

/**
 * Search for product images using Unsplash API (as reliable fallback) or Gemini if configured
 * Route: POST /api/seller/tools/search-image
 */
export const searchProductImage = asyncHandler(
  async (req: Request, res: Response) => {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // 1. Try to get keys from DB (Dynamic)
    const settings = await AppSettings.findOne().select("+geminiApiKey +googleCxId");

    // Keys priorities: Env (Explicit) > DB > Env (Gemini)
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

    // Explicitly clean the key to avoid whitespace issues causing "Invalid Argument"
    // Prioritize GOOGLE_CUSTOM_API_KEY from env as user recently added it
    let googleApiKey = process.env.GOOGLE_CUSTOM_API_KEY || settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (googleApiKey) googleApiKey = googleApiKey.trim();

    // Default to the user's provided CX ID if not in env (Hotfix to avoid server restart)
    const googleCxId = process.env.GOOGLE_CX_ID || settings?.googleCxId || "933cd3189f86843e3";

    let imageUrl = "";
    let images: string[] = [];

    let debugInfo = "";

    // Strategy A: serpapi.org Images Search API - preferred, no CX setup needed
    const serpApiKey = process.env.SERP_IMAGE_SEARCH_API;
    if (serpApiKey) {
        try {
            const response = await axios.get(`https://serpapi.org/api/v1/images-search`, {
                params: {
                    keyword: query + " product",
                    token: serpApiKey,
                    gl: "IN",
                    hl: "en",
                    size: 100,
                    page: 1,
                },
            });

            const results = response.data?.data;
            if (Array.isArray(results) && results.length > 0) {
                images = results
                    .map((r: any) => r.image_url || r.thumbnail)
                    .filter(Boolean);
                imageUrl = images[0] || "";
                console.log(`[Image Search] SerpApi Found ${images.length} results`);
            } else {
                console.warn(`[Image Search] SerpApi returned 0 results.`);
                debugInfo += ` | SerpApi: No Results`;
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
            console.error("[Image Search] SerpApi Error:", errorMsg);
            debugInfo += ` | SerpApi Error: ${errorMsg}`;
        }
    }

    // Strategy B: Google Custom Search
    if (!imageUrl && googleApiKey && googleCxId) {
        try {
             const keyPrefix = googleApiKey.length > 5 ? googleApiKey.substring(0, 5) + "..." : "HIDDEN";
             console.log(`[Image Search] Using Google Custom Search. Key: ${keyPrefix} CX: ${googleCxId}`);

             const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
                 params: {
                     key: googleApiKey,
                     cx: googleCxId,
                     // Exclude stock photo sites to get original product images
                     q: query + " product india -site:unsplash.com -site:pexels.com -site:pixabay.com",
                     searchType: "image",
                     num: 1,
                     imgSize: "large",
                     safe: "active"
                 }
             });

             if (response.data.items && response.data.items.length > 0) {
                 imageUrl = response.data.items[0].link;
                 images = [imageUrl];
                 console.log(`[Image Search] Google Found: ${imageUrl}`);
             } else {
                 console.warn(`[Image Search] Google returned 0 results.`);
                 debugInfo += ` | Google: No Results (CX: ${googleCxId})`;
             }
        } catch (error: any) {
             const errorMsg = error.response?.data?.error?.message || error.message;
             console.error("[Image Search] Google Error:", errorMsg);
             debugInfo += ` | Google Error: ${errorMsg} (Key: ...${googleApiKey ? googleApiKey.slice(-4) : 'NONE'}, CX: ${googleCxId})`;
        }
    }

    // Strategy C: Unsplash — last-resort fallback only, since results are
    // generic stock photos rather than the exact product. Kept behind
    // Strategies A/B so it's never preferred while either of those has
    // working credentials; only reached when both are unavailable/broken.
    if (!imageUrl && unsplashKey) {
        try {
            const response = await axios.get(`https://api.unsplash.com/search/photos`, {
                params: {
                    query: query + " product",
                    per_page: 30,
                    content_filter: "high",
                },
                headers: {
                    Authorization: `Client-ID ${unsplashKey}`,
                },
            });

            const results = response.data?.results;
            if (Array.isArray(results) && results.length > 0) {
                images = results
                    .map((r: any) => r.urls?.regular || r.urls?.small)
                    .filter(Boolean);
                imageUrl = images[0] || "";
                console.log(`[Image Search] Unsplash Found ${images.length} results`);
            } else {
                console.warn(`[Image Search] Unsplash returned 0 results.`);
                debugInfo += ` | Unsplash: No Results`;
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.errors?.join(", ") || error.message;
            console.error("[Image Search] Unsplash Error:", errorMsg);
            debugInfo += ` | Unsplash Error: ${errorMsg}`;
        }
    }

    if (imageUrl) {
        return res.status(200).json({
            success: true,
            data: { imageUrl, images },
            message: "Image found successfully"
        });
    }

    // Return detailed error message
    return res.status(200).json({
        success: false,
        message: `No image found. ${debugInfo}`
    });
  }
);
