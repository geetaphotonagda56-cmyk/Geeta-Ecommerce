import {
  normalizeText,
  getTokens,
  levenshteinDistance,
  tokenSimilarity,
  fieldMatchScore,
} from "../utils/fuzzyMatch";

let failures = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.01) {
  const pass = Math.abs(actual - expected) <= tolerance;
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${label}: expected ~${expected}, got ${actual}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

// normalizeText / getTokens
assertEqual(normalizeText("Maggi  2-Minute Noodles!"), "maggi 2 minute noodles", "normalizeText strips punctuation");
assertEqual(getTokens("Maggi 2-Minute Noodles"), ["maggi", "minute", "noodles"], "getTokens drops single-char tokens");

// levenshteinDistance
assertEqual(levenshteinDistance("maggi", "maggi"), 0, "levenshtein identical strings");
assertEqual(levenshteinDistance("maggi", "magi"), 1, "levenshtein single deletion");
assertEqual(levenshteinDistance("", "abc"), 3, "levenshtein empty left");

// tokenSimilarity
assertEqual(tokenSimilarity("mag", "maggi"), 0.92, "tokenSimilarity prefix match");
assertEqual(tokenSimilarity("maggi", "maggi"), 1, "tokenSimilarity exact match");
assertEqual(tokenSimilarity("xyz", "abc"), 0, "tokenSimilarity unrelated short tokens");

// fieldMatchScore: typo-tolerant ranking — "magi" (typo) should still score
// meaningfully against "Maggi Noodles" and rank above an unrelated product.
const maggiScore = fieldMatchScore(getTokens("magi"), "Maggi Noodles");
const unrelatedScore = fieldMatchScore(getTokens("magi"), "Colgate Toothpaste");
if (maggiScore > unrelatedScore && maggiScore > 0) {
  console.log(`PASS fieldMatchScore ranks typo'd match above unrelated (maggi=${maggiScore.toFixed(3)}, unrelated=${unrelatedScore.toFixed(3)})`);
} else {
  failures += 1;
  console.error(`FAIL fieldMatchScore typo ranking: maggi=${maggiScore}, unrelated=${unrelatedScore}`);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll fuzzyMatch tests passed");
}
