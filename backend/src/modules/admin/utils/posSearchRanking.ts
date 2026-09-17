import { getTokens, fieldMatchScore } from "../../../utils/fuzzyMatch";

export interface POSRankableProduct {
  productName: string;
  sku?: string;
  barcode?: string[] | string;
  itemCode?: string;
  variations?: Array<{ sku?: string; barcode?: string[] | string }>;
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

/**
 * True for a search term that is a machine-readable code (a scanned barcode,
 * SKU or item code) rather than words a human typed: no whitespace, at least
 * six characters, and containing a digit. Product names ("dummy", "milk 1l")
 * fail one of those tests, so they keep the fuzzy/typo fallback.
 *
 * Callers use it to skip that fallback: fuzzy-scoring a digit string against
 * product names cannot produce a meaningful match, so for a code the honest -
 * and immediate - answer to "no literal hit" is "not in the catalogue".
 */
export const isScannedCodeQuery = (value: string): boolean => {
  const trimmed = value.trim();
  return /^[A-Za-z0-9._/-]{6,}$/.test(trimmed) && /[0-9]/.test(trimmed);
};

export function scorePOSProduct(product: POSRankableProduct, queryTokens: string[]): number {
  const nameScore = fieldMatchScore(queryTokens, product.productName) * NAME_WEIGHT;
  // The Product schema only stores sku/barcode on variations - there is no
  // top-level sku/barcode field on real documents - so a scan/search must be
  // scored against every variation's codes, not just the (always-empty)
  // top-level ones, or every variant-only match gets filtered out below.
  const variationCodeScores = (product.variations || []).flatMap((variation) => [
    fieldMatchScore(queryTokens, variation.sku),
    fieldMatchScore(queryTokens, variation.barcode),
  ]);
  const codeScore =
    Math.max(
      fieldMatchScore(queryTokens, product.sku),
      fieldMatchScore(queryTokens, product.barcode),
      fieldMatchScore(queryTokens, product.itemCode),
      ...variationCodeScores,
      0
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
export interface BulkEditRankableProduct {
  productName: string;
  sku?: string;
  barcode?: string[] | string;
  hsnCode?: string;
  variations?: Array<{
    sku?: string;
    barcode?: string[] | string;
    name?: string;
    value?: string;
    rackNumber?: string;
    blockNumber?: string;
  }>;
}

/**
 * Same fuzzy scoring as scorePOSProduct, extended to cover the extra fields
 * the admin bulk-edit search matches on exactly (variation name/value,
 * rack/block number, HSN code) so its fuzzy fallback stays consistent with
 * its own literal-regex search rather than POS's narrower field set.
 */
export function scoreBulkEditProduct(product: BulkEditRankableProduct, queryTokens: string[]): number {
  const nameScore = fieldMatchScore(queryTokens, product.productName) * NAME_WEIGHT;
  const variationCodeScores = (product.variations || []).flatMap((variation) => [
    fieldMatchScore(queryTokens, variation.sku),
    fieldMatchScore(queryTokens, variation.barcode),
    fieldMatchScore(queryTokens, variation.name),
    fieldMatchScore(queryTokens, variation.value),
    fieldMatchScore(queryTokens, variation.rackNumber),
    fieldMatchScore(queryTokens, variation.blockNumber),
  ]);
  const codeScore =
    Math.max(
      fieldMatchScore(queryTokens, product.sku),
      fieldMatchScore(queryTokens, product.barcode),
      fieldMatchScore(queryTokens, product.hsnCode),
      ...variationCodeScores,
      0
    ) * CODE_WEIGHT;
  return Math.max(nameScore, codeScore);
}

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
