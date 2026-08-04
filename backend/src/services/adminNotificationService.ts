import { Server as SocketIOServer } from 'socket.io';
import OrderItem from '../models/OrderItem';
import Notification from '../models/Notification';
import mongoose from 'mongoose';

/**
 * Notify all admins about a new order
 */
export async function notifyAdminsOfNewOrder(
    io: SocketIOServer,
    order: any
): Promise<void> {
    try {
        if (!io) {
            console.error('Socket.io server not provided to notifyAdminsOfNewOrder');
            return;
        }

        // Unconditionally fetch populated order items since we only have IDs at this point
        const orderItems = await OrderItem.find({ order: order._id }).populate('product');

        const notificationData = {
            type: 'NEW_ORDER',
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            customer: {
                name: order.customerName,
                email: order.customerEmail,
                phone: order.customerPhone,
                address: order.deliveryAddress
            },
            items: orderItems.map((item: any) => ({
                productName: item.productName || item.product?.productName || item.product?.name,
                quantity: item.quantity,
                price: item.unitPrice,
                total: item.total,
                variation: item.variation
            })),
            totalAmount: order.total,
            timestamp: new Date()
        };

        io.to(`admin-notifications`).emit('new-order-alert', notificationData);
        console.log(`📤 Emitted new-order-alert to admin-notifications for order ${order.orderNumber}`);

        await Notification.create({
            recipientType: 'Admin',
            type: 'Order',
            title: 'New order received',
            message: `Order ${order.orderNumber} placed by ${order.customerName}`,
            link: `/admin/orders/delivery/${order._id}`,
            priority: 'High',
        });
    } catch (error) {
        console.error('Error in notifyAdminsOfNewOrder:', error);
    }
}
