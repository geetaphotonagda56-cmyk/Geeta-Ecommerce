import { getTokens, fieldMatchScore } from "../../../utils/fuzzyMatch";

export interface POSRankableProduct {
  productName: string;
  sku?: string;
  barcode?: string[] | string;
  itemCode?: string;
}

const NAME_WEIGHT = 1;
const CODE_WEIGHT = 0.6;

/**
 * Below this, a "match" is just noise (unrelated products sharing a common
 * short token) rather than a genuine typo/partial match. Used by callers
 * that fetch a broad candidate pool (not just DB-regex hits) and need to
 * drop irrelevant ones instead of returning the entire catalog.
 */
export const POS_MATCH_SCORE_THRESHOLD = 0.3;

export function scorePOSProduct(product: POSRankableProduct, queryTokens: string[]): number {
  const nameScore = fieldMatchScore(queryTokens, product.productName) * NAME_WEIGHT;
  const codeScore =
    Math.max(
      fieldMatchScore(queryTokens, product.sku),
      fieldMatchScore(queryTokens, product.barcode),
      fieldMatchScore(queryTokens, product.itemCode)
    ) * CODE_WEIGHT;
  return Math.max(nameScore, codeScore);
}

/**
 * Ranks POS product candidates by fuzzy relevance to `search`, matching
 * mainly on productName with a lower weight for sku/barcode/itemCode.
 * Ties keep the incoming order (stable sort), so callers should pass
 * products pre-sorted (e.g. by productName) for a deterministic tie-break.
 * Purely reorders - does not drop any input product.
 */
export function rankPOSProducts<T extends POSRankableProduct>(
  products: T[],
  search: string
): T[] {
  const queryTokens = getTokens(search);
  if (!queryTokens.length) return products;

  const scored = products.map((product) => ({
    product,
    score: scorePOSProduct(product, queryTokens),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.product);
}
