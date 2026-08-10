import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseURL } from '../../../services/api/config';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
    getOrdersByWorkflowStage,
    confirmOrder,
    dispatchOrder,
    updateOrderStatus,
    Order,
    OrderWorkflowStage,
    OrderChannel,
    DeliverySlot,
} from '../../../services/api/admin/adminOrderService';
import OrderDeliveryCard from '../components/OrderDeliveryCard';
import ChooseDeliveryTimeSheet from '../components/ChooseDeliveryTimeSheet';
import DispatchOrderSheet from '../components/DispatchOrderSheet';

const TABS: OrderWorkflowStage[] = ['All', 'New', 'Confirmed', 'Shipment Ready', 'In Transit', 'Delivered'];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const isSelectable = (order: Order) =>
    order.orderChannel !== 'WalkIn' &&
    (order.deliveryWorkflowStage === 'New' || order.deliveryWorkflowStage === 'Confirmed');

export default function AdminOrderDelivery() {
    const { isAuthenticated, token, user } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<OrderWorkflowStage>('All');
    const [channel, setChannel] = useState<OrderChannel>('Online');
    const [orders, setOrders] = useState<Order[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(PAGE_SIZE_OPTIONS[0]);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [confirmTarget, setConfirmTarget] = useState<Order | null>(null);
    const [dispatchTarget, setDispatchTarget] = useState<Order | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

    const socketRef = useRef<Socket | null>(null);

    const fetchOrders = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getOrdersByWorkflowStage(activeTab, {
                search: search || undefined,
                limit,
                page,
                channel,
            });
            if (response.success) {
                setOrders(response.data || []);
                setCounts(response.counts || {});
                setTotalPages(response.pagination?.pages || 1);
                setTotal(response.pagination?.total || 0);
            }
        } catch (err) {
            console.error('Error fetching order delivery list:', err);
            showToast('Failed to load orders', 'error');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, search, channel, page, limit]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const changeTab = (tab: OrderWorkflowStage) => {
        setActiveTab(tab);
        setPage(1);
        setSelectedIds(new Set());
    };

    const changeChannel = (next: OrderChannel) => {
        setChannel(next);
        setPage(1);
        setSelectedIds(new Set());
    };

    const changeSearch = (value: string) => {
        setSearch(value);
        setPage(1);
        setSelectedIds(new Set());
    };

    const changeLimit = (value: number) => {
        setLimit(value);
        setPage(1);
        setSelectedIds(new Set());
    };

    useEffect(() => {
        const userRole = user?.role || user?.userType;
        if (!isAuthenticated || !token || !user || (userRole !== 'Admin' && userRole !== 'Super Admin')) {
            return;
        }

        const socket = io(getSocketBaseURL(), {
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join-admin-room', user.userId || user.id);
        });

        const refetch = () => fetchOrders();
        socket.on('new-order-alert', refetch);
        socket.on('order-in-transit', refetch);
        socket.on('order-delivered', refetch);

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, token, user]);

    const handleConfirm = async (slot: DeliverySlot) => {
        if (!confirmTarget) return;
        try {
            setSubmitting(true);
            const response = await confirmOrder(confirmTarget._id, { deliverySlot: slot });
            if (response.success) {
                showToast('Order confirmed', 'success');
                setConfirmTarget(null);
                fetchOrders();
            } else {
                showToast(response.message || 'Failed to confirm order', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to confirm order', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDispatch = async (deliveryBoyId: string, deliveryCharge: number) => {
        if (!dispatchTarget) return;
        try {
            setSubmitting(true);
            const response = await dispatchOrder(dispatchTarget._id, { deliveryBoyId, deliveryCharge });
            if (response.success) {
                showToast('Order dispatched', 'success');
                if ((response as any).warning) {
                    showToast((response as any).warning, 'error');
                }
                setDispatchTarget(null);
                fetchOrders();
            } else {
                showToast(response.message || 'Failed to dispatch order', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to dispatch order', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (order: Order) => {
        if (!window.confirm(`Cancel order ${order.orderNumber}?`)) return;
        try {
            const response = await updateOrderStatus(order._id, { status: 'Cancelled' });
            if (response.success) {
                showToast('Order cancelled', 'success');
                fetchOrders();
            } else {
                showToast(response.message || 'Failed to cancel order', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to cancel order', 'error');
        }
    };

    const toggleSelect = (order: Order) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(order._id)) next.delete(order._id);
            else next.add(order._id);
            return next;
        });
    };

    const selectableOnPage = orders.filter(isSelectable);
    const allOnPageSelected =
        selectableOnPage.length > 0 && selectableOnPage.every((o) => selectedIds.has(o._id));

    const toggleSelectAllOnPage = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allOnPageSelected) {
                selectableOnPage.forEach((o) => next.delete(o._id));
            } else {
                selectableOnPage.forEach((o) => next.add(o._id));
            }
            return next;
        });
    };

    const selectedOrders = orders.filter((o) => selectedIds.has(o._id));
    const selectedConfirmable = selectedOrders.filter((o) => o.deliveryWorkflowStage === 'New');
    const selectedDiscardable = selectedOrders.filter(isSelectable);

    const handleBulkConfirmSubmit = async (slot: DeliverySlot) => {
        if (selectedConfirmable.length === 0) return;
        try {
            setSubmitting(true);
            const results = await Promise.allSettled(
                selectedConfirmable.map((o) => confirmOrder(o._id, { deliverySlot: slot }))
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            showToast(
                failed === 0
                    ? `${selectedConfirmable.length} order(s) confirmed`
                    : `${selectedConfirmable.length - failed} confirmed, ${failed} failed`,
                failed === 0 ? 'success' : 'error'
            );
            setBulkConfirmOpen(false);
            setSelectedIds(new Set());
            fetchOrders();
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkDiscard = async () => {
        if (selectedDiscardable.length === 0) return;
        if (!window.confirm(`Discard ${selectedDiscardable.length} selected order(s)?`)) return;
        try {
            setSubmitting(true);
            const results = await Promise.allSettled(
                selectedDiscardable.map((o) => updateOrderStatus(o._id, { status: 'Cancelled' }))
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            showToast(
                failed === 0
                    ? `${selectedDiscardable.length} order(s) discarded`
                    : `${selectedDiscardable.length - failed} discarded, ${failed} failed`,
                failed === 0 ? 'success' : 'error'
            );
            setSelectedIds(new Set());
            fetchOrders();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-neutral-900">Order Delivery</h1>
                <div className="flex items-center bg-neutral-100 rounded-full p-1 text-xs font-semibold">
                    <button
                        onClick={() => changeChannel('WalkIn')}
                        className={`px-3 py-1.5 rounded-full transition-colors ${channel === 'WalkIn' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                            }`}
                    >
                        Walk-in
                    </button>
                    <button
                        onClick={() => changeChannel('Online')}
                        className={`px-3 py-1.5 rounded-full transition-colors ${channel === 'Online' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                            }`}
                    >
                        Online (App)
                    </button>
                </div>
            </div>
            {channel === 'WalkIn' && (
                <p className="text-xs text-neutral-500 mb-3">
                    Walk-in bills are shown for visibility only - confirm/dispatch/cancel actions don't apply to POS orders.
                </p>
            )}

            <input
                type="text"
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Search by order ID, customer name or phone"
                className="w-full mb-4 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
            />

            <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => changeTab(tab)}
                        className={`shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors ${activeTab === tab
                                ? 'bg-[var(--primary-color)] text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                    >
                        {tab} {counts[tab] !== undefined ? `(${counts[tab]})` : ''}
                    </button>
                ))}
            </div>

            {selectableOnPage.length > 0 && (
                <label className="flex items-center gap-2 mb-3 text-xs font-medium text-neutral-600">
                    <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="w-4 h-4 accent-[var(--primary-color)]"
                    />
                    Select all on this page
                </label>
            )}

            {loading ? (
                <div className="text-center py-12 text-sm text-neutral-500">Loading orders...</div>
            ) : orders.length === 0 ? (
                <div className="text-center py-12 text-sm text-neutral-500">No orders in this tab</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {orders.map((order) => (
                        <OrderDeliveryCard
                            key={order._id}
                            order={order}
                            onConfirmClick={setConfirmTarget}
                            onDispatchClick={setDispatchTarget}
                            onCancelClick={handleCancel}
                            selectable={isSelectable(order)}
                            selected={selectedIds.has(order._id)}
                            onToggleSelect={toggleSelect}
                        />
                    ))}
                </div>
            )}

            {orders.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>Show</span>
                        <select
                            value={limit}
                            onChange={(e) => changeLimit(Number(e.target.value))}
                            className="px-2 py-1 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                        <span>of {total}</span>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Prev
                            </button>
                            <span className="text-xs text-neutral-500">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {selectedIds.size > 0 && (
                <div className="fixed bottom-4 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-sm sm:max-w-none sm:w-auto bg-neutral-900 text-white rounded-2xl sm:rounded-full shadow-lg px-3 py-2.5 sm:px-4 flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 sm:gap-3">
                    <span className="text-xs font-medium w-full sm:w-auto text-center sm:text-left">
                        {selectedIds.size} selected
                    </span>
                    <div className="flex items-center gap-2 flex-wrap justify-center w-full sm:w-auto">
                        <button
                            onClick={() => setBulkConfirmOpen(true)}
                            disabled={selectedConfirmable.length === 0 || submitting}
                            className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold bg-[var(--primary-color)] rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Confirm ({selectedConfirmable.length})
                        </button>
                        <button
                            onClick={handleBulkDiscard}
                            disabled={selectedDiscardable.length === 0 || submitting}
                            className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold bg-red-500 rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Discard ({selectedDiscardable.length})
                        </button>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="px-2 text-xs text-neutral-300 hover:text-white"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            <ChooseDeliveryTimeSheet
                isOpen={!!confirmTarget}
                onClose={() => setConfirmTarget(null)}
                onConfirm={handleConfirm}
                submitting={submitting}
            />

            <ChooseDeliveryTimeSheet
                isOpen={bulkConfirmOpen}
                onClose={() => setBulkConfirmOpen(false)}
                onConfirm={handleBulkConfirmSubmit}
                submitting={submitting}
            />

            <DispatchOrderSheet
                isOpen={!!dispatchTarget}
                onClose={() => setDispatchTarget(null)}
                onDispatch={handleDispatch}
                submitting={submitting}
                initialDeliveryCharge={dispatchTarget?.shipping}
            />
        </div>
    );
}
