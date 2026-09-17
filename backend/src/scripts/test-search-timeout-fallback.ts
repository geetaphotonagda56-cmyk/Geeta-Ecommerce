import assert from "node:assert/strict";
import { withTimeout } from "../utils/embedding";

(async () => {
  try {
    await assert.rejects(
      () => withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5, "Timeout test"),
      /timed out/i
    );

    console.log("embedding timeout fallback check passed");
  } catch (error) {
    console.error("embedding timeout fallback check failed", error);
    process.exit(1);
  }
})();
