export interface DeliveryCommissionInput {
    commissionType?: 'Percentage' | 'Fixed';
    commission?: number;
    deliveryCharge: number; // order.shipping at delivery time
}

export interface DeliveryCommissionResult {
    commissionAmount: number;
    commissionType: 'Percentage' | 'Fixed';
    commissionRate: number;
    commissionBasisAmount: number; // 0 for Fixed
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Percentage-type delivery boys earn a % of the order's delivery charge
 * (order.shipping, which by delivery time already reflects admin's
 * per-order override at dispatch, else the global default from checkout).
 * Fixed-type delivery boys earn the same flat amount every delivery.
 */
export function calculateDeliveryCommission(
    input: DeliveryCommissionInput
): DeliveryCommissionResult {
    const commissionType = input.commissionType ?? 'Fixed';
    const commissionRate = input.commission ?? 40;

    if (commissionType === 'Percentage') {
        const basis = Math.max(0, input.deliveryCharge || 0);
        return {
            commissionAmount: round2((commissionRate / 100) * basis),
            commissionType,
            commissionRate,
            commissionBasisAmount: basis,
        };
    }

    return {
        commissionAmount: round2(commissionRate),
        commissionType,
        commissionRate,
        commissionBasisAmount: 0,
    };
}
