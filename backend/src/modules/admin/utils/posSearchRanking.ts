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
 * Ranks POS product candidates by fuzzy relevance to `search`, matching
 * mainly on productName with a lower weight for sku/barcode/itemCode.
 * Ties keep the incoming order (stable sort), so callers should pass
 * products pre-sorted (e.g. by productName) for a deterministic tie-break.
 */
export function rankPOSProducts<T extends POSRankableProduct>(
  products: T[],
  search: string
): T[] {
  const queryTokens = getTokens(search);
  if (!queryTokens.length) return products;

  const scored = products.map((product) => {
    const nameScore = fieldMatchScore(queryTokens, product.productName) * NAME_WEIGHT;
    const codeScore =
      Math.max(
        fieldMatchScore(queryTokens, product.sku),
        fieldMatchScore(queryTokens, product.barcode),
        fieldMatchScore(queryTokens, product.itemCode)
      ) * CODE_WEIGHT;
    return { product, score: Math.max(nameScore, codeScore) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.product);
}
