// Serves per-product Open Graph tags for social-media link-preview crawlers
// (WhatsApp, Facebook, Twitter, etc). The main app is a client-rendered SPA,
// so crawlers that don't execute JS would otherwise only ever see the static
// tags in index.html (site logo, generic title). vercel.json routes crawler
// requests for /product/:id here based on User-Agent; everyone else keeps
// getting the normal SPA shell.

const API_BASE = process.env.API_BASE_URL || "https://api.geeta.today/api/v1";
const SITE_URL = "https://www.geeta.today";
const FALLBACK_IMAGE = `${SITE_URL}/geetastoreslogo.png`;
const FALLBACK_TITLE = "Geeta Stores - Fast Grocery Delivery";
const FALLBACK_DESCRIPTION =
  "Order groceries, essentials, and more with fast delivery from Geeta Stores.";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

function renderHtml({ title, description, image, url }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />

    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="Geeta Stores" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />

    <meta http-equiv="refresh" content="0;url=${escapeHtml(url)}" />
  </head>
  <body>
    <a href="${escapeHtml(url)}">${escapeHtml(title)}</a>
  </body>
</html>`;
}

export default async function handler(req, res) {
  const { id } = req.query;
  const url = `${SITE_URL}/product/${encodeURIComponent(String(id))}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
  );

  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) {
    res.status(200).send(
      renderHtml({
        title: FALLBACK_TITLE,
        description: FALLBACK_DESCRIPTION,
        image: FALLBACK_IMAGE,
        url,
      })
    );
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const apiRes = await fetch(`${API_BASE}/customer/products/${id}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!apiRes.ok) {
      throw new Error(`Product fetch failed with status ${apiRes.status}`);
    }

    const json = await apiRes.json();
    const product = json?.data;

    if (!product) {
      throw new Error("Product data missing from response");
    }

    const title = product.productName
      ? `${product.productName} - Geeta Stores`
      : FALLBACK_TITLE;
    const description =
      product.smallDescription || product.description || FALLBACK_DESCRIPTION;
    const image = product.mainImage || FALLBACK_IMAGE;

    res.status(200).send(renderHtml({ title, description, image, url }));
  } catch (error) {
    console.error("product-og: falling back to defaults", error);
    res.status(200).send(
      renderHtml({
        title: FALLBACK_TITLE,
        description: FALLBACK_DESCRIPTION,
        image: FALLBACK_IMAGE,
        url,
      })
    );
  }
}
