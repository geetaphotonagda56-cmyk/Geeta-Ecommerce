/**
 * True when a rejected request gave up on its own clock rather than getting a
 * reply. Callers use it to tell "the network is too slow / half-dead" apart
 * from a real answer, which matters most on the POS barcode path: a timed-out
 * lookup must never be reported to the operator as "not in inventory".
 */
export function isRequestTimeout(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  const message = (error as { message?: string } | null)?.message ?? "";
  return /timeout/i.test(message);
}

/** True when the request never reached the server at all (offline, DNS, reset). */
export function isNetworkError(error: unknown): boolean {
  const typed = error as { response?: unknown; code?: string } | null;
  if (!typed) return false;
  if (typed.response) return false;
  return typed.code === "ERR_NETWORK" || !isRequestTimeout(error);
}
