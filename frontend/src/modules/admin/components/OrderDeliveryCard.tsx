import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Order } from '../../../services/api/admin/adminOrderService';

interface OrderDeliveryCardProps {
    order: Order;
    onConfirmClick: (order: Order) => void;
    onDispatchClick: (order: Order) => void;
    onCancelClick: (order: Order) => void;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (order: Order) => void;
}

const initials = (name?: string) => (name?.trim()?.charAt(0) || '?').toUpperCase();

export default function OrderDeliveryCard({
    order,
    onConfirmClick,
    onDispatchClick,
    onCancelClick,
    selectable,
    selected,
    onToggleSelect,
}: OrderDeliveryCardProps) {
    const items = Array.isArray(order.items) ? (order.items as any[]) : [];
    const firstItem = items[0];
    const extraItemsCount = items.length > 1 ? items.length - 1 : 0;
    const stage = order.deliveryWorkflowStage || 'New';
    const isNew = stage === 'New';
    const dueAmount = order.isPartialPayment
        ? Math.max(0, (order.total || 0) - (order.amountPaid || 0))
        : order.paymentStatus === 'Paid'
            ? 0
            : order.total || 0;

    return (
        <div
            className={`bg-white rounded-xl border shadow-sm p-4 transition-colors ${selected ? 'border-[var(--primary-color)] ring-1 ring-[var(--primary-color)]' : 'border-neutral-200'
                }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    {selectable && (
                        <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => onToggleSelect?.(order)}
                            className="mt-1 w-4 h-4 accent-[var(--primary-color)] shrink-0"
                        />
                    )}
                    <div className="w-10 h-10 rounded-full bg-[var(--primary-alpha-20)] text-[var(--primary-darker)] flex items-center justify-center font-semibold shrink-0">
                        {initials(order.customerName)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{order.customerName}</p>
                        <p className="text-xs text-neutral-500">{order.customerPhone}</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-neutral-900">₹{order.total?.toFixed(0)}</p>
                    {isNew && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-[var(--primary-alpha-20)] text-[var(--primary-darker)]">
                            New
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                <span>#{order.orderNumber}</span>
                <span>·</span>
                <span>{order.orderDate ? format(new Date(order.orderDate), 'd MMM yy hh:mm a') : ''}</span>
            </div>

            {firstItem && (
                <div className="mt-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 overflow-hidden shrink-0">
                        {firstItem.productImage ? (
                            <img src={firstItem.productImage} alt={firstItem.productName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : null}
                    </div>
                    <p className="text-sm text-neutral-700 truncate">
                        {firstItem.productName} x {firstItem.quantity}
                        {extraItemsCount > 0 && (
                            <span className="text-neutral-400"> +{extraItemsCount} more</span>
                        )}
                    </p>
                </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-block px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-neutral-100 text-neutral-700">
                    {order.paymentMethod === 'COD' ? 'COD' : 'Delivery'}
                </span>
                <span className="inline-block px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-neutral-100 text-neutral-700">
                    {order.paymentMethod}
                </span>
                {dueAmount > 0 ? (
                    <span className="inline-block px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-red-100 text-red-700">
                        Due ₹{dueAmount.toFixed(0)}
                    </span>
                ) : (
                    <span className="inline-block px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-green-100 text-green-700">
                        Paid
                    </span>
                )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                    to={`/admin/orders/delivery/${order._id}`}
                    className="text-sm font-medium text-[var(--primary-color)] hover:underline"
                >
                    View order
                </Link>
                {order.orderChannel !== 'WalkIn' && (
                    <div className="flex items-center gap-2">
                        {(stage === 'New' || stage === 'Confirmed') && (
                            <button
                                onClick={() => onCancelClick(order)}
                                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                        {stage === 'New' && (
                            <button
                                onClick={() => onConfirmClick(order)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--primary-color)] rounded-lg hover:bg-[var(--primary-dark)] transition-colors flex items-center gap-1"
                            >
                                ✓ Confirm
                            </button>
                        )}
                        {stage === 'Confirmed' && (
                            <button
                                onClick={() => onDispatchClick(order)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--primary-color)] rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
                            >
                                Dispatch
                            </button>
                        )}
                        {stage !== 'New' && stage !== 'Confirmed' && (
                            <span className="px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 rounded-lg">
                                {stage}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
