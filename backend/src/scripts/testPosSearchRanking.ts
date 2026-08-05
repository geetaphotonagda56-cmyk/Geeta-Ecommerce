import { rankPOSProducts, scorePOSProduct, POS_MATCH_SCORE_THRESHOLD, POSRankableProduct } from "../modules/admin/utils/posSearchRanking";
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

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll posSearchRanking tests passed");
}
