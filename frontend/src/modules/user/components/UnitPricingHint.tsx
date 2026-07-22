import { Product } from '../../../types/domain';
import { getPrimaryVariant } from '../../../utils/customerVariantUtils';

/** Same precedence ProductCard/ProductDetail use: the primary variant's real tieredPrices win, else the root unitPricing field (often just a stale zero-priced default). */
export function getProductTieredPrices(product: Product | null | undefined): { minQty: number; price: number }[] {
  if (!product) return [];
  const primaryVariant = getPrimaryVariant(product);
  const variantTiers = (primaryVariant?.tieredPrices || []).filter((t: any) => t && Number(t.price) > 0);
  if (variantTiers.length > 0) return variantTiers;
  return ((product as any)?.unitPricing || []).filter((t: any) => t && Number(t.price) > 0);
}

interface UnitPricingHintProps {
  product: Product;
  className?: string;
}

/** Compact "Buy N+ at ₹X/unit" hint for tight card layouts. Renders nothing if the product has no unit pricing. */
export default function UnitPricingHint({ product, className }: UnitPricingHintProps) {
  const tiers = getProductTieredPrices(product);
  if (tiers.length === 0) return null;
  const best = tiers.slice().sort((a, b) => a.minQty - b.minQty)[0];

  return (
    <p className={className || 'text-[9px] font-semibold text-[var(--customer-primary)] mb-0.5'}>
      Buy {best.minQty}+ at ₹{best.price.toLocaleString('en-IN')}/unit
    </p>
  );
}
