import { rankPOSProducts, POSRankableProduct } from "../modules/admin/utils/posSearchRanking";

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

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll posSearchRanking tests passed");
}
