import { Request, Response, NextFunction } from 'express';

/**
 * Response fields that reveal purchase/cost price or profit margin.
 * Kept as an explicit allowlist (rather than a name pattern) so unrelated
 * fields like "purchaseDate" or "stockValue" are never accidentally dropped.
 */
const SENSITIVE_PRICE_FIELDS = new Set([
  'purchasePrice',
  'totalPurchasePrice',
  'totalPurchase',
  'purchaseValue',
  'profit',
  'lineProfit',
  'netProfit',
  'totalProfit',
  'grossProfit',
  'profitMarginPercent',
]);

function stripSensitivePriceFields(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripSensitivePriceFields);
  }
  if (value && typeof value === 'object') {
    const source = typeof value.toJSON === 'function' && !(value instanceof Date) ? value.toJSON() : value;
    if (!source || typeof source !== 'object') {
      return source;
    }
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(source)) {
      if (SENSITIVE_PRICE_FIELDS.has(key)) continue;
      out[key] = stripSensitivePriceFields(v);
    }
    return out;
  }
  return value;
}

/**
 * A staff member can see purchase price / profit only if they were
 * explicitly granted the "view_purchase_price" permission. The owning
 * Admin/Seller account (isStaff falsy) always has full access.
 */
export const canViewPurchasePrice = (req: Request): boolean => {
  if (!req.user?.isStaff) return true;
  const permissions = req.user.permissions || [];
  // The staff permissions panel stores fine-grained UI toggles with a "ui:" prefix.
  return permissions.includes('view_purchase_price') || permissions.includes('ui:view_purchase_price');
};

/**
 * Strips purchase price / profit fields from every JSON response for staff
 * accounts that lack the "view_purchase_price" permission. Mounted once per
 * router so no individual controller can accidentally leak the field.
 */
export const hidePurchasePriceForStaff = (req: Request, res: Response, next: NextFunction): void => {
  if (canViewPurchasePrice(req)) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => originalJson(stripSensitivePriceFields(body))) as typeof res.json;
  next();
};

/**
 * Unconditionally strips purchase price / profit fields from every JSON
 * response, regardless of who is asking. Mount this on customer-facing
 * (public/unauthenticated) product routes, which share the same product
 * mapper as the admin/seller side and must never expose cost price.
 */
export const stripPurchasePriceAlways = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => originalJson(stripSensitivePriceFields(body))) as typeof res.json;
  next();
};

function stripPurchasePriceFromPayload(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripPurchasePriceFromPayload);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === 'purchasePrice') continue;
      out[key] = stripPurchasePriceFromPayload(v);
    }
    return out;
  }
  return value;
}

/**
 * Prevents a staff account that lacks "view_purchase_price" from writing
 * purchasePrice through product create/update payloads. Without this, a
 * staff member with edit access but no purchase-price visibility could
 * silently overwrite the real cost price with 0/blank when saving a form
 * whose purchase price field the backend never sent them in the first place.
 */
export const stripPurchasePriceFromStaffWrites = (req: Request, _res: Response, next: NextFunction): void => {
  if (!canViewPurchasePrice(req) && req.body && typeof req.body === 'object') {
    req.body = stripPurchasePriceFromPayload(req.body);
  }
  next();
};

/**
 * Blocks staff accounts from mutating report data. Staff may view reports
 * (GET) but only the owning Admin/Seller account may create, edit, or
 * delete report entries.
 */
export const blockStaffReportMutation = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.isStaff) {
    res.status(403).json({
      success: false,
      message: 'Staff accounts cannot modify or delete report data. Contact an admin for this action.',
    });
    return;
  }
  next();
};
