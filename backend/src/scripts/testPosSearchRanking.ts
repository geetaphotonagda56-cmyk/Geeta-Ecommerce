import { rankPOSProducts, scorePOSProduct, isScannedCodeQuery, POS_MATCH_SCORE_THRESHOLD, POSRankableProduct } from "../modules/admin/utils/posSearchRanking";
import { getTokens } from "../utils/fuzzyMatch";

let failures = 0;

function assertOrder(actual: POSRankableProduct[], expectedNames: string[], label: string) {
  const actualNames = actual.map((p) => p.productName);
  const pass = JSON.stringify(actualNames) === JSON.stringify(expectedNames);
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expectedNames)}, got ${JSON.stringify(actualNames)}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

const candidates: POSRankableProduct[] = [
  { productName: "Colgate Toothpaste", sku: "COL-1" },
  { productName: "Maggi 2-Minute Noodles", sku: "MAG-1" },
  { productName: "Amul Milk 500ml", sku: "MAGX-1" }, // sku loosely matches "mag" by substring only
];

// Typo'd query should still rank the actual Maggi product first.
assertOrder(
  rankPOSProducts(candidates, "magi noodle"),
  ["Maggi 2-Minute Noodles", "Amul Milk 500ml", "Colgate Toothpaste"],
  "ranks typo'd name match first"
);

// Empty search returns the input order unchanged.
assertOrder(candidates.length ? rankPOSProducts(candidates, "") : [], candidates.map((p) => p.productName), "empty search is a no-op");

// Single-word typos (no shared literal substring at all) must still surface
// via score-based filtering, since the DB regex step can't catch these -
// this is the controller's actual filter, applied here directly.
function filterByScore(products: POSRankableProduct[], search: string): string[] {
  const queryTokens = getTokens(search);
  return rankPOSProducts(products, search)
    .filter((p) => scorePOSProduct(p, queryTokens) >= POS_MATCH_SCORE_THRESHOLD)
    .map((p) => p.productName);
}

const typoCandidates: POSRankableProduct[] = [
  { productName: "dummy" },
  { productName: "Mammy poco 399" },
  { productName: "Colgate Toothpaste" },
];

const mummyResults = filterByScore(typoCandidates, "mummy");
if (mummyResults.includes("dummy") && mummyResults.includes("Mammy poco 399") && !mummyResults.includes("Colgate Toothpaste")) {
  console.log('PASS single-word typo "mummy" surfaces dummy/Mammy, excludes unrelated product');
} else {
  failures += 1;
  console.error(`FAIL single-word typo "mummy": got ${JSON.stringify(mummyResults)}`);
}

// Barcode scans match against variation-level barcode/sku, not just the
// (nonexistent on real documents) top-level fields - this is what a
// hardware/camera scanner query looks like.
const variationCandidates: POSRankableProduct[] = [
  { productName: "Parle-G Biscuit 100g", variations: [{ sku: "PG-100", barcode: ["8901030826169"] }] },
  { productName: "Amul Milk 500ml", variations: [{ sku: "AM-500", barcode: ["8901030999999"] }] },
];
const barcodeResults = filterByScore(variationCandidates, "8901030826169");
if (barcodeResults.length === 1 && barcodeResults[0] === "Parle-G Biscuit 100g") {
  console.log("PASS variation-level barcode scan surfaces the matching product");
} else {
  failures += 1;
  console.error(`FAIL variation-level barcode scan: got ${JSON.stringify(barcodeResults)}`);
}

// isScannedCodeQuery decides whether getPOSProducts may skip its catalogue-wide
// fuzzy fallback. Getting it wrong in either direction is costly: too eager and
// a mistyped product name stops finding anything; too shy and every scan of an
// unlisted barcode fetches and scores the whole catalogue, which is what used
// to leave the POS scanner spinning instead of opening Quick Add.
const codeQueryCases: Array<[string, boolean]> = [
  ["8901030826169", true],   // EAN-13 off a product
  ["PG-100-A2", true],       // SKU with separators
  ["item_9004", true],       // SKU with an underscore
  [" 8901030826169 ", true], // padded by the scanner's line ending
  ["12345", false],          // too short to be a scanned code
  ["dummy", false],          // a word, no digits - keeps the typo fallback
  ["mummy", false],
  ["milk 1l", false],        // whitespace means a human typed it
  ["Maggi 2-Minute", false],
];

for (const [input, expected] of codeQueryCases) {
  const actual = isScannedCodeQuery(input);
  if (actual === expected) {
    console.log(`PASS isScannedCodeQuery(${JSON.stringify(input)}) === ${expected}`);
  } else {
    failures += 1;
    console.error(`FAIL isScannedCodeQuery(${JSON.stringify(input)}): expected ${expected}, got ${actual}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll posSearchRanking tests passed");
}
