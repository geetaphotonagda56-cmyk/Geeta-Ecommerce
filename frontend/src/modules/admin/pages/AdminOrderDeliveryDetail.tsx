import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import {
    getOrderWorkflowDetail,
    confirmOrder,
    dispatchOrder,
    updateOrderStatus,
    Order,
    DeliverySlot,
} from '../../../services/api/admin/adminOrderService';
import { generateBillQrDataUrl } from '../../../utils/generateBillQrCode';
import ChooseDeliveryTimeSheet from '../components/ChooseDeliveryTimeSheet';
import DispatchOrderSheet from '../components/DispatchOrderSheet';
import { readAdminPosBillSettings } from '../../../utils/adminPosBillSettings';
import { InvoiceBillDetails } from '../../../utils/invoiceFormats';
import { resolveGstFromProduct } from '../../../utils/gstUtils';
import { SimpleInvoice } from '../components/SimpleInvoice';
import { GSTInvoice } from '../components/GSTInvoice';

export default function AdminOrderDeliveryDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [showConfirmSheet, setShowConfirmSheet] = useState(false);
    const [showDispatchSheet, setShowDispatchSheet] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [billSettings, setBillSettings] = useState<any>(null);
    const [printFormat, setPrintFormat] = useState<'simple' | 'gst'>('simple');
    const [isPrinting, setIsPrinting] = useState(false);

    useEffect(() => {
        const settings = readAdminPosBillSettings();
        setBillSettings(settings);
        if (settings?.invoiceFormat === 'gst' || settings?.invoiceFormat === 'simple') {
            setPrintFormat(settings.invoiceFormat as 'simple' | 'gst');
        }
    }, []);

    const fetchOrder = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const response = await getOrderWorkflowDetail(id);
            if (response.success && response.data) {
                setOrder(response.data);
                if (response.data.deliveryQrToken) {
                    const dataUrl = await generateBillQrDataUrl(response.data._id, response.data.deliveryQrToken);
                    setQrDataUrl(dataUrl);
                }
            }
        } catch (err) {
            console.error('Error fetching order detail:', err);
            showToast('Failed to load order', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const handleConfirm = async (slot: DeliverySlot) => {
        if (!order) return;
        try {
            setSubmitting(true);
            const response = await confirmOrder(order._id, { deliverySlot: slot });
            if (response.success) {
                showToast('Order confirmed', 'success');
                setShowConfirmSheet(false);
                fetchOrder();
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
        if (!order) return;
        try {
            setSubmitting(true);
            const response = await dispatchOrder(order._id, { deliveryBoyId, deliveryCharge });
            if (response.success) {
                showToast('Order dispatched', 'success');
                if ((response as any).warning) {
                    showToast((response as any).warning, 'error');
                }
                setShowDispatchSheet(false);
                fetchOrder();
            } else {
                showToast(response.message || 'Failed to dispatch order', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to dispatch order', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Maps this order into the shape SimpleInvoice/GSTInvoice expect.
    const toInvoiceBillDetails = (o: Order): InvoiceBillDetails => ({
        invoiceNum: o.orderNumber,
        date: new Date(o.orderDate).toLocaleDateString('en-IN'),
        time: new Date(o.orderDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        paymentMethod: o.paymentMethod,
        total: Number(o.total || 0),
        cart: (Array.isArray(o.items) ? (o.items as any[]) : []).map((item: any) => ({
            productName: item.productName || 'Unknown Item',
            qty: Number(item.quantity || 0),
            price: Number(item.unitPrice || 0),
            compareAtPrice: Number(item.mrp || item.compareAtPrice || 0),
            hsnCode: item.hsnCode,
            gst: resolveGstFromProduct(item.gst),
        })),
    });

    const handlePrintBill = () => {
        if (!order) return;
        setIsPrinting(true);
        document.body.classList.add('is-printing-delivery-bill');
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.classList.remove('is-printing-delivery-bill');
                setIsPrinting(false);
            }, 3000);
        }, 500);
    };

    const handleCancel = async () => {
        if (!order || !window.confirm(`Cancel order ${order.orderNumber}?`)) return;
        try {
            const response = await updateOrderStatus(order._id, { status: 'Cancelled' });
            if (response.success) {
                showToast('Order cancelled', 'success');
                fetchOrder();
            } else {
                showToast(response.message || 'Failed to cancel order', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to cancel order', 'error');
        }
    };

    if (loading) {
        return <div className="p-6 text-center text-sm text-neutral-500">Loading order...</div>;
    }

    if (!order) {
        return <div className="p-6 text-center text-sm text-neutral-500">Order not found</div>;
    }

    const items = Array.isArray(order.items) ? (order.items as any[]) : [];
    const stage = order.deliveryWorkflowStage || 'New';
    const deliveryBoy = typeof order.deliveryBoy === 'object' ? order.deliveryBoy : null;
    const phoneDigits = order.customerPhone?.replace(/\D/g, '');

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto">
            <button onClick={() => navigate(-1)} className="text-sm text-neutral-500 mb-3">&larr; Back</button>

            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                <div className="flex items-center justify-between mb-1">
                    <h1 className="text-lg font-semibold text-neutral-900">Order #{order.orderNumber}</h1>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--primary-alpha-20)] text-[var(--primary-darker)]">
                        {stage}
                    </span>
                </div>
                <p className="text-xs text-neutral-500">
                    {order.orderDate ? new Date(order.orderDate).toLocaleString() : ''}
                </p>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                <h2 className="text-sm font-semibold text-neutral-900 mb-3">Customer</h2>
                <p className="text-sm text-neutral-900">{order.customerName}</p>
                <p className="text-sm text-neutral-500 mb-1">{order.customerPhone}</p>
                <p className="text-sm text-neutral-500 mb-3">
                    {order.deliveryAddress?.address}, {order.deliveryAddress?.city} {order.deliveryAddress?.pincode}
                </p>
                <div className="flex items-center gap-2">
                    <a
                        href={`tel:${order.customerPhone}`}
                        className="flex-1 text-center px-3 py-2 text-sm font-medium text-[var(--primary-color)] bg-[var(--primary-alpha-20)] rounded-lg"
                    >
                        📞 Call
                    </a>
                    <a
                        href={`https://wa.me/${phoneDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg"
                    >
                        WhatsApp
                    </a>
                </div>
            </div>

            {deliveryBoy && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900 mb-2">Delivery Partner</h2>
                    <p className="text-sm text-neutral-900">{(deliveryBoy as any).name}</p>
                    <p className="text-sm text-neutral-500">{(deliveryBoy as any).mobile}</p>
                </div>
            )}

            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                <h2 className="text-sm font-semibold text-neutral-900 mb-3">Items</h2>
                <div className="space-y-3">
                    {items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-neutral-100 overflow-hidden shrink-0">
                                    {item.productImage && (
                                        <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                    )}
                                </div>
                                <p className="text-sm text-neutral-700 truncate">{item.productName} x {item.quantity}</p>
                            </div>
                            <p className="text-sm font-medium text-neutral-900 shrink-0">₹{item.total?.toFixed(0)}</p>
                        </div>
                    ))}
                </div>
                <div className="border-t border-neutral-200 mt-3 pt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                        <p>Subtotal</p>
                        <p>₹{order.subtotal?.toFixed(0)}</p>
                    </div>
                    {!!order.platformFee && (
                        <div className="flex items-center justify-between text-sm text-neutral-600">
                            <p>Platform Fee</p>
                            <p>₹{order.platformFee.toFixed(0)}</p>
                        </div>
                    )}
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                        <p>Delivery Charge</p>
                        <p>₹{(order.shipping || 0).toFixed(0)}</p>
                    </div>
                    {!!order.discount && (
                        <div className="flex items-center justify-between text-sm text-green-700">
                            <p>Discount</p>
                            <p>- ₹{order.discount.toFixed(0)}</p>
                        </div>
                    )}
                    <div className="flex items-center justify-between pt-1.5 border-t border-neutral-200">
                        <p className="text-sm font-semibold text-neutral-900">Total</p>
                        <p className="text-sm font-semibold text-neutral-900">₹{order.total?.toFixed(0)}</p>
                    </div>
                </div>
            </div>

            {order.billSummary && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900 mb-3">Profit (Admin only)</h2>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-neutral-500 text-xs">Total Purchase</p>
                            <p className="font-medium text-neutral-900">₹{order.billSummary.totalPurchase?.toFixed(0)}</p>
                        </div>
                        <div>
                            <p className="text-neutral-500 text-xs">Total Sale</p>
                            <p className="font-medium text-neutral-900">₹{order.billSummary.totalSP?.toFixed(0)}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-neutral-500 text-xs">Net Profit</p>
                            <p className="font-semibold text-green-700">₹{order.billSummary.profit?.toFixed(0)}</p>
                        </div>
                    </div>
                    {items.some((item: any) => item.lineProfit !== undefined) && (
                        <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1">
                            {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-neutral-600">
                                    <span className="truncate">{item.productName}</span>
                                    <span>₹{item.lineProfit?.toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {qrDataUrl && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4 flex flex-col items-center">
                    <h2 className="text-sm font-semibold text-neutral-900 mb-3 self-start">Bill QR</h2>
                    <img src={qrDataUrl} alt="Bill QR code" className="w-32 h-32" loading="lazy" decoding="async" />
                </div>
            )}

            <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-4">
                <h2 className="text-sm font-semibold text-neutral-900 mb-3">Print Bill</h2>
                <div className="flex items-center gap-2 mb-3">
                    <button
                        onClick={() => setPrintFormat('simple')}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${printFormat === 'simple'
                            ? 'border-[var(--primary-color)] bg-[var(--primary-alpha-20)] text-[var(--primary-darker)]'
                            : 'border-neutral-200 text-neutral-600'
                            }`}
                    >
                        Simple Format
                    </button>
                    <button
                        onClick={() => setPrintFormat('gst')}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${printFormat === 'gst'
                            ? 'border-[var(--primary-color)] bg-[var(--primary-alpha-20)] text-[var(--primary-darker)]'
                            : 'border-neutral-200 text-neutral-600'
                            }`}
                    >
                        GST Format
                    </button>
                </div>
                <button
                    onClick={handlePrintBill}
                    disabled={isPrinting}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-neutral-900 rounded-lg disabled:opacity-60"
                >
                    {isPrinting ? 'Preparing...' : 'Print Bill'}
                </button>
                <p className="text-[11px] text-neutral-400 mt-2">
                    Prints using the header/footer from Bill Settings, with the delivery QR attached so the delivery partner can scan it to complete this order.
                </p>
            </div>

            {order.orderChannel === 'WalkIn' ? (
                <p className="text-xs text-neutral-500 text-center pb-4">
                    This is a walk-in (POS) bill - confirm/dispatch/cancel actions don't apply.
                </p>
            ) : (
                <div className="flex items-center gap-3 sticky bottom-4">
                    {(stage === 'New' || stage === 'Confirmed') && (
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg"
                        >
                            Cancel
                        </button>
                    )}
                    {stage === 'New' && (
                        <button
                            onClick={() => setShowConfirmSheet(true)}
                            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--primary-color)] rounded-lg"
                        >
                            Confirm
                        </button>
                    )}
                    {stage === 'Confirmed' && (
                        <button
                            onClick={() => setShowDispatchSheet(true)}
                            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--primary-color)] rounded-lg"
                        >
                            Dispatch
                        </button>
                    )}
                </div>
            )}

            <ChooseDeliveryTimeSheet
                isOpen={showConfirmSheet}
                onClose={() => setShowConfirmSheet(false)}
                onConfirm={handleConfirm}
                submitting={submitting}
            />
            <DispatchOrderSheet
                isOpen={showDispatchSheet}
                onClose={() => setShowDispatchSheet(false)}
                onDispatch={handleDispatch}
                submitting={submitting}
                initialDeliveryCharge={order.shipping}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  @page { margin: 0; size: auto; }
                  html, body {
                    height: auto !important;
                    overflow: visible !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                  }
                  body.is-printing-delivery-bill > *:not(.delivery-bill-print-wrapper) {
                    display: none !important;
                    visibility: hidden !important;
                    height: 0 !important;
                    overflow: hidden !important;
                  }
                  body.is-printing-delivery-bill .delivery-bill-print-wrapper {
                    display: block !important;
                    visibility: visible !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    background: white !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    z-index: 999999 !important;
                  }
                  body.is-printing-delivery-bill .delivery-bill-print-wrapper * {
                    visibility: visible !important;
                  }
                  body.is-printing-delivery-bill .delivery-bill-print-wrapper table { width: 100%; }
                }
            ` }} />

            {isPrinting && order && createPortal(
                <div className="hidden delivery-bill-print-wrapper bg-white p-0 m-0">
                    {printFormat === 'simple' ? (
                        <SimpleInvoice billDetails={toInvoiceBillDetails(order)} shopSettings={billSettings} />
                    ) : (
                        <GSTInvoice billDetails={toInvoiceBillDetails(order)} shopSettings={billSettings} />
                    )}
                    {qrDataUrl && (
                        <div className="flex flex-col items-center py-4">
                            <img src={qrDataUrl} alt="Delivery QR" className="w-24 h-24 object-contain" />
                            <p className="text-[10px] mt-1 text-black">Scan at delivery to confirm receipt</p>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
