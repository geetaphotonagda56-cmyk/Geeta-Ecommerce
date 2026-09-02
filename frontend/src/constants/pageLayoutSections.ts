export interface PageLayoutSectionDef {
  key: string;
  label: string;
}

export interface PageLayoutEntry {
  key: string;
  enabled: boolean;
}

// Home page section catalog, in current default order.
// `hero` = HomeHero (category tab bar). `dynamicHomeSections` = the
// admin-curated block group managed on the "Home Section" admin page —
// its own internal per-block order is a separate, existing concern.
export const HOME_LAYOUT_SECTIONS: PageLayoutSectionDef[] = [
  { key: "popup", label: "Popup Banner (First Visit)" },
  { key: "hero", label: "Hero Header & Category Tabs" },
  { key: "userFavorites", label: "Your Favorites (Logged-in Users)" },
  { key: "newProducts", label: "New Arrivals" },
  { key: "mainBannerSlider", label: "Main Banner Slider" },
  { key: "exploreOurRange", label: "Explore Our Range" },
  { key: "lowestPrices", label: "Lowest Prices Ever" },
  { key: "flashDeal", label: "Flash Deal Section" },
  { key: "featuredDeal", label: "Featured Deal" },
  { key: "bestsellers", label: "Bestsellers" },
  { key: "dealOfTheDay", label: "Deal of the Day" },
  { key: "firstOrderOffer", label: "First Order Offer Banner" },
  { key: "dynamicHomeSections", label: "Home Sections (Admin Curated)" },
  { key: "mainSectionBanner", label: "Main Section Banner" },
  { key: "shopByStore", label: "Shop by Store" },
  { key: "allProducts", label: "All Products" },
  { key: "footerBanner", label: "Footer Banner" },
];

// Product Detail page section catalog, in current default order.
// Excludes the image gallery, price/variant block, and sticky footer cart
// bar — those are fixed, not part of this catalog.
export const PRODUCT_DETAIL_LAYOUT_SECTIONS: PageLayoutSectionDef[] = [
  { key: "serviceGuarantees", label: "Service Guarantees" },
  { key: "highlights", label: "Highlights" },
  { key: "infoSpecs", label: "Info / Specifications" },
  { key: "reviews", label: "Ratings & Reviews" },
  { key: "viewMoreFromBrand", label: "View More from Brand" },
  { key: "exploreOurRange", label: "Explore Our Range" },
  { key: "featuredDeal", label: "Featured Deal" },
  { key: "flashDeal", label: "Flash Deal Section" },
  { key: "similarProducts", label: "Similar Products" },
];

/**
 * Merges a saved layout array with the code-defined catalog: saved entries
 * keep their saved order/enabled state; any catalog key not yet present in
 * `saved` is appended at the end as enabled. Entries whose key no longer
 * exists in the catalog are dropped.
 */
export function mergeWithDefaults(
  saved: PageLayoutEntry[] | undefined | null,
  catalog: PageLayoutSectionDef[]
): PageLayoutEntry[] {
  const catalogKeys = new Set(catalog.map((section) => section.key));
  const cleaned = (saved || []).filter((entry) => catalogKeys.has(entry.key));
  const seenKeys = new Set(cleaned.map((entry) => entry.key));
  catalog.forEach((section) => {
    if (!seenKeys.has(section.key)) {
      cleaned.push({ key: section.key, enabled: true });
    }
  });
  return cleaned;
}

/** Ordered list of enabled section keys, ready to drive rendering. */
export function orderedEnabledKeys(
  saved: PageLayoutEntry[] | undefined | null,
  catalog: PageLayoutSectionDef[]
): string[] {
  return mergeWithDefaults(saved, catalog)
    .filter((entry) => entry.enabled)
    .map((entry) => entry.key);
}
