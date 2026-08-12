import { calculateDistance } from "../utils/locationHelper";

export interface DeliveryStop {
  orderId: string;
  orderNumber: string;
  stopType: "pickup" | "dropoff";
  sellerId?: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  sequence: number | null; // 1-indexed, null if unsequenced (missing coords)
  distanceFromPrevKm: number | null;
  customerName?: string;
  totalAmount?: number;
}

export interface SellerLocationForOrder {
  sellerId: string;
  storeName: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

export interface OrderForSequencing {
  _id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  total?: number;
  deliveryAddress?: { address?: string; city?: string; latitude?: number; longitude?: number };
  sellerLocations: SellerLocationForOrder[]; // distinct sellers among this order's items
}

// Order.status values reached before the delivery boy has physically picked
// up the order from the seller(s) - see deliveryOrderController.updateOrderStatus,
// which is the only place status advances to 'Picked Up'/'Out for Delivery'.
const PRE_PICKUP_STATUSES = new Set(["Received", "Pending", "Processed", "Shipped"]);

interface Candidate {
  key: string;
  stop: DeliveryStop;
  dependsOn: string[]; // keys of this order's pickup stops that must be visited first
}

/**
 * Precedence-aware nearest-neighbor greedy sequence: from the current
 * position, always jump to the closest available stop next, where a
 * dropoff only becomes "available" once all of that order's pickup stops
 * have been visited. Stops with missing coordinates (seller with no
 * location, or deliveryAddress lacking lat/lng) can't be distance-sequenced
 * at all - they're appended at the end in original order rather than
 * distorting the route or crashing.
 */
export function computeDeliverySequence(
  startLocation: { lat: number; lng: number } | null,
  orders: OrderForSequencing[]
): DeliveryStop[] {
  const candidates: Candidate[] = [];

  for (const order of orders) {
    const needsPickup = PRE_PICKUP_STATUSES.has(order.status);
    const pickupKeys: string[] = [];

    if (needsPickup) {
      for (const seller of order.sellerLocations) {
        const key = `${order._id}:pickup:${seller.sellerId}`;
        pickupKeys.push(key);
        candidates.push({
          key,
          dependsOn: [],
          stop: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            stopType: "pickup",
            sellerId: seller.sellerId,
            label: seller.storeName || "Seller",
            address: seller.address || "",
            lat: seller.lat,
            lng: seller.lng,
            sequence: null,
            distanceFromPrevKm: null,
          },
        });
      }
    }

    candidates.push({
      key: `${order._id}:dropoff`,
      dependsOn: pickupKeys,
      stop: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        stopType: "dropoff",
        label: order.customerName || "Customer",
        address: order.deliveryAddress?.address || "",
        lat: order.deliveryAddress?.latitude ?? null,
        lng: order.deliveryAddress?.longitude ?? null,
        sequence: null,
        distanceFromPrevKm: null,
        customerName: order.customerName,
        totalAmount: order.total,
      },
    });
  }

  const hasCoords = (c: Candidate) => c.stop.lat !== null && c.stop.lng !== null;
  const geoKeys = new Set(candidates.filter(hasCoords).map((c) => c.key));

  // A dropoff can only be meaningfully distance-sequenced if it AND every
  // pickup it depends on has coordinates - otherwise we could never resolve
  // its dependency in the geo loop below.
  const geoCandidates = candidates.filter(
    (c) => hasCoords(c) && c.dependsOn.every((dep) => geoKeys.has(dep))
  );
  const nonGeoCandidates = candidates.filter((c) => !geoCandidates.includes(c));

  const visited = new Set<string>();
  const sequenced: DeliveryStop[] = [];
  let current = startLocation;
  let remaining = [...geoCandidates];

  while (remaining.length > 0) {
    const available = remaining.filter((c) => c.dependsOn.every((dep) => visited.has(dep)));
    if (available.length === 0) break; // shouldn't happen given the geoKeys filter above

    let nearest = available[0];
    let nearestDist = current
      ? calculateDistance(current.lat, current.lng, nearest.stop.lat as number, nearest.stop.lng as number)
      : 0;

    if (current) {
      for (const cand of available) {
        const d = calculateDistance(current.lat, current.lng, cand.stop.lat as number, cand.stop.lng as number);
        if (d < nearestDist) {
          nearest = cand;
          nearestDist = d;
        }
      }
    }

    nearest.stop.sequence = sequenced.length + 1;
    nearest.stop.distanceFromPrevKm = current ? Number(nearestDist.toFixed(2)) : null;
    sequenced.push(nearest.stop);
    visited.add(nearest.key);
    current = { lat: nearest.stop.lat as number, lng: nearest.stop.lng as number };
    remaining = remaining.filter((c) => c.key !== nearest.key);
  }

  const unsequenced = [...remaining, ...nonGeoCandidates].map((c) => c.stop);

  return [...sequenced, ...unsequenced];
}
