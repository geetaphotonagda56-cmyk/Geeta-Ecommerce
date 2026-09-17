import assert from "node:assert/strict";
import { buildIdInFilter } from "../services/searchService";

const empty = buildIdInFilter([]);
assert.equal(empty, undefined, "Empty category/seller filter should not force a no-results query");

const filled = buildIdInFilter(["a", "b"]);
assert.deepEqual(filled, { $in: ["a", "b"] }, "Filled filters should remain intact");

console.log("search empty filter regression check passed");
