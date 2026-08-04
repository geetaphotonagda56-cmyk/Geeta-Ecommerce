import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getSocketBaseURL } from '../services/api/config';
import { getCurrentModuleToken } from '../utils/moduleAuth';

interface AssignmentPayload {
    orderId: string;
    orderNumber: string;
    customerName: string;
    total: number;
}

/**
 * Direct-assignment alert (admin dispatches an order straight to this
 * delivery boy - no accept/reject race, unlike useDeliveryOrderNotifications).
 * Shows a toast with a "View" action linking to the order.
 */
export const useDeliveryAssignmentAlerts = (navigate: (path: string) => void) => {
    const { isAuthenticated, user } = useAuth();
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!isAuthenticated || user?.userType !== 'Delivery' || !user?.id) {
            return;
        }

        const token = getCurrentModuleToken();
        const socket = io(getSocketBaseURL(), {
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join-delivery-notifications', user.id);
        });

        const handleAssignment = (data: AssignmentPayload) => {
            toast.success(
                (t) => (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <div
                        onClick={() => {
                            toast.dismiss(t.id);
                            navigate(`/delivery/orders/${data.orderId}`);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <p style={{ fontWeight: 700, fontSize: 13 }}>New order assigned to you</p>
                        <p style={{ fontSize: 12 }}>
                            Order #{data.orderNumber} - ₹{data.total} - Tap to view
                        </p>
                    </div>
                ),
                { duration: 8000, icon: '📦' }
            );
        };

        socket.on('new-assignment', handleAssignment);

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, user]);
};
