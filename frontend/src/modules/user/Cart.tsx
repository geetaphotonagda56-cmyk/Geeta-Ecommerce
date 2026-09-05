import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import Button from '../../components/ui/button';
import { appConfig } from '../../services/configService';
import { calculateProductPrice, getCartItemVariantSelector, getCartLineUnitPrice, getCartLineVariantIdentity } from '../../utils/priceUtils';
import { getProductCardImageVariants } from '../../utils/customerVariantUtils';
import OptimizedImage from '../../components/OptimizedImage';

export default function Cart() {
  const { cart, updateQuantity, removeFromCart, clearCart, freeGiftRules: activeRules, loading } = useCart();
  const navigate = useNavigate();

  const deliveryFee = (cart.total || 0) >= (appConfig.freeDeliveryThreshold || 500) ? 0 : (appConfig.deliveryFee || 40);
  const platformFee = appConfig.platformFee || 0;
  const totalAmount = (cart.total || 0) + deliveryFee + platformFee;

  const itemCount = cart.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const totalSaved = cart.items.reduce((sum, item) => {
    const prod = item.product;
    if (!prod) return sum;
    const variantSelector = getCartItemVariantSelector(item);
    const { mrp } = calculateProductPrice(prod, variantSelector);
    const unit = getCartLineUnitPrice(item);
    const diff = (mrp || 0) - unit;
    return diff > 0 ? sum + diff * (item.quantity ?? 0) : sum;
  }, 0);

  const handleCheckout = () => {
    navigate('/checkout');
  };

  if (cart.items.length === 0) {
    return (
      <div className="min-h-[70vh] bg-white flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-sm">
          <div className="grad-action mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.6L21 7H6" />
            </svg>
          </div>
          <h2 className="font-display text-3xl font-bold text-neutral-900 mb-2 tracking-tight">Your basket is empty</h2>
          <p className="text-neutral-600 mb-7 leading-relaxed">
            Browse today&apos;s fresh picks and get them delivered in {appConfig.estimatedDeliveryTime}.
          </p>
          <Link to="/">
            <Button variant="default" size="lg" className="sheen grad-action elev-2 border-0 px-8 text-white">
              Start shopping
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-4 md:pb-8">
      {/* Header band — the one dark moment on the page, so the basket reads
          as its own place rather than another white feed. */}
      <div className="grad-canopy texture-weave relative overflow-hidden rounded-b-[32px] px-4 md:px-6 lg:px-8 pt-5 pb-6 md:pt-7 md:pb-8 mb-5 md:mb-7">
        <div
          className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--customer-accent), transparent 70%)' }}
          aria-hidden="true"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight leading-none">
              Your basket
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} · arriving in {appConfig.estimatedDeliveryTime}
            </p>
          </div>
          <button
            onClick={clearCart}
            className="flex-shrink-0 rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Clear all
          </button>
        </div>

        {totalSaved > 0 && (
          <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 backdrop-blur-sm">
            <span className="text-sm">🎉</span>
            <span className="text-xs font-semibold text-white">
              You are saving ₹{Math.round(totalSaved).toLocaleString('en-IN')} on this order
            </span>
          </div>
        )}

        {/* Free Gift Progress Bar (Multi-Tier) */}
        {(() => {
          if (activeRules.length === 0) return null;

          const currentTotal = cart.total || 0;
          const highestRule = activeRules[activeRules.length - 1];
          const maxTarget = highestRule.minCartValue || 1000;

          // Find next milestone
          const nextRule = activeRules.find(r => r.minCartValue > currentTotal);

          return (
            <div className="relative mt-5 pt-5 border-t border-white/15">
              {nextRule ? (
                <div className="mb-5 text-center text-sm text-white/80">
                  Add <span className="font-bold text-[var(--customer-accent)]">₹{(nextRule.minCartValue - currentTotal).toLocaleString('en-IN')}</span> more to unlock{' '}
                  <span className="font-bold text-white">{nextRule.giftProduct?.productName || 'a free gift'}</span>
                </div>
              ) : (
                <div className="mb-5 flex items-center justify-center gap-2 text-center text-sm font-semibold text-[var(--customer-accent)]">
                  <span className="text-lg">🎉</span> All free gifts unlocked
                </div>
              )}

              {/* Milestone Bar Container */}
              <div className="relative h-12 mb-2 px-2">
                {/* Background Line */}
                <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-white/15 z-0"></div>

                {/* Progress Line */}
                <div
                  className="grad-accent absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full z-0 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, (currentTotal / maxTarget) * 100)}%` }}
                ></div>

                {/* Milestones */}
                {activeRules.map((rule) => {
                  const isUnlocked = currentTotal >= rule.minCartValue;
                  const position = (rule.minCartValue / maxTarget) * 100;

                  return (
                    <div
                      key={rule._id || rule.id}
                      className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center group z-10"
                      style={{ left: `${position}%`, transform: `translate(-${position === 100 ? '100' : '50'}%, -50%)` }}
                    >
                      {/* Icon Circle */}
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                          isUnlocked
                            ? 'grad-accent border-transparent text-[var(--customer-accent-text)] scale-110'
                            : 'border-white/30 bg-[var(--customer-primary-darker)] text-white/40'
                        }`}
                      >
                        {isUnlocked ? (
                          <span className="text-sm font-bold">✓</span>
                        ) : (
                          <span className="text-[10px]">🎁</span>
                        )}
                      </div>

                      {/* Label */}
                      <div className="absolute top-9 w-24 text-center">
                        <span className={`block text-[10px] font-bold ${isUnlocked ? 'text-[var(--customer-accent)]' : 'text-white/50'}`}>
                          {isUnlocked ? 'Unlocked' : `₹${rule.minCartValue}`}
                        </span>
                        <span className="mx-auto block max-w-full truncate text-[9px] leading-tight text-white/40">
                          {rule.giftProduct?.productName?.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Cart Items */}
      <div className="px-4 md:px-6 lg:px-8 space-y-3 md:space-y-4 mb-5 md:mb-7">
        {cart.items.map((item) => {
          const prod = item.product;
          if (!prod) return null;

          const qty = item.quantity ?? 0;
          const variantSelector = getCartItemVariantSelector(item);
          const applicableUnitPrice = getCartLineUnitPrice(item);
          const { displayPrice, mrp, hasDiscount } = calculateProductPrice(prod, variantSelector);
          const isTieredApplied = applicableUnitPrice < displayPrice;
          const isFreeGift = item.isFreeGift;

          const prodId = prod.id || prod._id || '';
          const lineKey = item.id || `${prodId}-${item.variantId || item.variation || item.variant || 'default'}`;

          return (
            <div
              key={lineKey}
              className="group/line relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-3.5 md:p-5 transition-all duration-300 hover:elev-2 hover:border-[var(--customer-primary-light)]"
            >
              {isFreeGift && (
                <span className="grad-accent absolute top-0 left-0 rounded-br-2xl px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--customer-accent-text)]">
                  Free gift
                </span>
              )}

              <div className={`flex gap-3.5 md:gap-5 ${isFreeGift ? 'pt-4' : ''}`}>
                {/* Product Image */}
                <div className="bg-white relative flex h-24 w-24 md:h-28 md:w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200">
                  {prod.imageUrl ? (
                    <OptimizedImage
                      src={prod.imageUrl}
                      variants={getProductCardImageVariants(prod as never)}
                      alt={prod.name}
                      className="h-full w-full object-cover"
                      sizes="112px"
                    />
                  ) : (
                    <span className="font-display text-2xl text-[var(--customer-primary-light)]">
                      {(prod.name || 'P').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-neutral-900 leading-snug line-clamp-2 md:text-lg">
                      {prod.name}
                    </h3>

                    {/* Delete Button */}
                    {!isFreeGift && (
                      <button
                        onClick={() => {
                          const { variantId, variantTitle } = getCartLineVariantIdentity(item);
                          removeFromCart(prodId, variantId, variantTitle);
                        }}
                        className="-mr-1 flex-shrink-0 rounded-full p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        disabled={loading}
                        aria-label={`Remove ${prod.name} from basket`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.variation || item.variant ? `${item.variation || item.variant}` : (prod.pack || '')}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-xl md:text-2xl font-bold text-neutral-900 leading-none tracking-tight">
                          ₹{applicableUnitPrice.toLocaleString('en-IN')}
                        </span>
                        {mrp > applicableUnitPrice && (
                          <span className="text-xs text-neutral-400 line-through">
                            ₹{mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                        {hasDiscount && (
                          <span className="grad-accent rounded-full px-2 py-0.5 text-[10px] font-bold text-[var(--customer-accent-text)]">
                            {Math.round(((mrp - applicableUnitPrice) / mrp) * 100)}% off
                          </span>
                        )}
                      </div>
                      {isTieredApplied && (
                        <span className="w-fit rounded-full bg-[var(--customer-primary-alpha-10)] px-2 py-0.5 text-[10px] font-semibold text-[var(--customer-primary)]">
                          Bulk price applied
                        </span>
                      )}
                    </div>

                    {!isFreeGift && (
                      <div className="grad-action flex items-center gap-1 rounded-full p-1">
                        <button
                          onClick={() => {
                            const { variantId, variantTitle } = getCartLineVariantIdentity(item);
                            updateQuantity(prodId, qty - 1, variantId, variantTitle);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base font-bold leading-none text-white transition-colors hover:bg-white/30 disabled:opacity-50"
                          disabled={loading}
                          aria-label="Decrease quantity"
                        >
                          <span className="relative top-[-1px]">−</span>
                        </button>
                        <span className="w-7 text-center font-display text-sm font-bold text-white">{qty}</span>
                        <button
                          onClick={() => {
                            const { variantId, variantTitle } = getCartLineVariantIdentity(item);
                            updateQuantity(prodId, qty + 1, variantId, variantTitle);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base font-bold leading-none text-white transition-colors hover:bg-white/30 disabled:opacity-50"
                          disabled={loading}
                          aria-label="Increase quantity"
                        >
                          <span className="relative top-[-1px]">+</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Summary */}
      <div className="px-4 md:px-6 lg:px-8 mb-24 md:mb-8">
        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white md:ml-auto md:max-w-md">
          <div className="p-5 md:p-6">
            <h2 className="font-display text-xl md:text-2xl font-bold text-neutral-900 mb-5 tracking-tight">
              Order summary
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="font-semibold text-neutral-900">₹{(cart.total || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Platform fee</span>
                <span className="font-semibold text-neutral-900">₹{(platformFee || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery</span>
                <span className={`font-semibold ${deliveryFee === 0 ? 'text-[var(--customer-primary)]' : 'text-neutral-900'}`}>
                  {deliveryFee === 0 ? 'Free' : `₹${deliveryFee.toLocaleString('en-IN')}`}
                </span>
              </div>
            </div>

            {(cart.total || 0) < (appConfig.freeDeliveryThreshold || 500) && (
              <div className="mt-4 rounded-2xl border border-[var(--customer-primary)] bg-white px-3.5 py-2.5 text-xs font-medium text-[var(--customer-primary-dark)]">
                Add ₹{((appConfig.freeDeliveryThreshold || 500) - (cart.total || 0)).toLocaleString('en-IN')} more to get free delivery
              </div>
            )}
          </div>

          {/* Total + CTA sit on the dark band so the final number is the
              loudest thing in the summary. */}
          <div className="grad-canopy px-5 py-5 md:px-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <span className="block text-xs font-medium uppercase tracking-[0.14em] text-white/50">Total</span>
                {totalSaved > 0 && (
                  <span className="mt-1 block text-[11px] font-semibold text-[var(--customer-accent)]">
                    You saved ₹{Math.round(totalSaved).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <span className="font-display text-3xl md:text-4xl font-bold text-white leading-none tracking-tight">
                ₹{(totalAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>

            <Button
              variant="default"
              size="lg"
              onClick={handleCheckout}
              className="sheen grad-action elev-2 w-full border-0 text-base font-bold text-white"
            >
              Proceed to checkout
            </Button>

            <p className="mt-3 text-center text-[11px] text-white/40">
              Inclusive of all taxes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
