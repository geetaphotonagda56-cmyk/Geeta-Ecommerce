import { Server as SocketIOServer } from 'socket.io';
import { escalateStalledOrders } from './orderNotificationService';

const POLL_INTERVAL_MS = 60 * 1000; // check every minute

export function startDeliveryEscalationScheduler(io: SocketIOServer): void {
    setInterval(() => {
        escalateStalledOrders(io).catch((error) => {
            console.error('Delivery escalation scheduler tick failed:', error);
        });
    }, POLL_INTERVAL_MS);

    console.log('🕐 Delivery escalation scheduler started (interval: 60s)');
}
