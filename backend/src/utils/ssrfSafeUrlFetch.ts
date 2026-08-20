import { lookup } from "dns/promises";
import axios from "axios";

const MAX_BYTES_DEFAULT = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS_DEFAULT = 10_000;

/**
 * Returns true if the given IPv4/IPv6 address is in a private, loopback,
 * or link-local range — including 169.254.169.254, the cloud metadata
 * endpoint most SSRF exploits target.
 */
function isPrivateOrReservedIp(address: string): boolean {
  // IPv4
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  // IPv6
  const lower = address.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  return false;
}

/**
 * Downloads `url` server-side with SSRF hygiene: only http/https, only
 * hostnames that resolve to a public IP (checked after DNS resolution,
 * not just the literal string), a byte cap, and a timeout. Throws a
 * descriptive Error on any failure — callers decide how to surface it.
 */
export async function fetchUrlSafely(
  url: string,
  options: { maxBytes?: number; timeoutMs?: number } = {}
): Promise<{ buffer: Buffer; contentType: string }> {
  const maxBytes = options.maxBytes ?? MAX_BYTES_DEFAULT;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS_DEFAULT;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const { address } = await lookup(parsed.hostname);
  if (isPrivateOrReservedIp(address)) {
    throw new Error("URL resolves to a private/internal address, refusing to fetch");
  }

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    headers: {
      // A real browser UA, not a self-identifying bot string: this endpoint
      // fetches publicly-served images the admin already saw rendered in
      // their own browser (search results) — plenty of CDNs/hotlink
      // protection block anything that announces itself as a bot, which
      // was rejecting otherwise-normal image URLs with a 403.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers["content-type"] || "");
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL did not return an image (got ${contentType || "unknown content-type"})`);
  }

  return { buffer: Buffer.from(response.data), contentType };
}
