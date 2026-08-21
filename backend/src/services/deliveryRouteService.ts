import { IOrder } from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import {
  computeDeliverySequence,
  OrderForSequencing,
  SellerLocationForOrder,
  DeliveryStop,
} from "./deliverySequenceService";

export interface OrderRouteInfo {
  sequence: number | null;
  distanceFromPrevKm: number | null;
  nextStopType: "pickup" | "dropoff" | null;
}

// Recomputed on every call rather than persisted: a rider's position and
// which orders are still pending pickup/dropoff change constantly, so a
// value stored at assignment time would go stale the moment the rider moves
// or completes a stop. This keeps the route correct with no cache to
// invalidate - including automatically picking up any order assigned since
// the last read.
export async function getRouteInfoForOrders(
  deliveryBoyId: string,
  orders: IOrder[]
): Promise<Map<string, OrderRouteInfo>> {
  const result = new Map<string, OrderRouteInfo>();
  if (orders.length === 0) return result;

  const [deliveryBoy, orderItems] = await Promise.all([
    Delivery.findById(deliveryBoyId).select("location").lean(),
    OrderItem.find({ order: { $in: orders.map((o) => o._id) } })
      .select("order seller")
      .lean(),
  ]);

  const sellerIdsByOrder = new Map<string, Set<string>>();
  for (const item of orderItems) {
    const orderKey = String(item.order);
    if (!sellerIdsByOrder.has(orderKey)) sellerIdsByOrder.set(orderKey, new Set());
    sellerIdsByOrder.get(orderKey)!.add(String(item.seller));
  }

  const allSellerIds = [...new Set(orderItems.map((i) => String(i.seller)))];
  const sellers = await Seller.find({ _id: { $in: allSellerIds } })
    .select("storeName address latitude longitude")
    .lean();
  const sellerById = new Map(sellers.map((s) => [String(s._id), s]));

  const ordersForSequencing: OrderForSequencing[] = orders.map((order) => {
    const sellerIds = [...(sellerIdsByOrder.get(String(order._id)) || [])];
    const sellerLocations: SellerLocationForOrder[] = sellerIds.map((sellerId) => {
      const seller = sellerById.get(sellerId);
      const lat = seller?.latitude ? parseFloat(seller.latitude) : null;
      const lng = seller?.longitude ? parseFloat(seller.longitude) : null;
      return {
        sellerId,
        storeName: seller?.storeName || "Seller",
        address: seller?.address || "",
        lat: lat !== null && !isNaN(lat) ? lat : null,
        lng: lng !== null && !isNaN(lng) ? lng : null,
      };
    });

    return {
      _id: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      total: order.total,
      deliveryAddress: order.deliveryAddress,
      sellerLocations,
    };
  });

  const startLocation =
    deliveryBoy?.location?.coordinates && deliveryBoy.location.coordinates.length === 2
      ? { lat: deliveryBoy.location.coordinates[1], lng: deliveryBoy.location.coordinates[0] }
      : null;

  const stops = computeDeliverySequence(startLocation, ordersForSequencing);

  // An order can have multiple stops (one pickup per distinct seller, plus
  // its dropoff). The stop with the lowest sequence number is the next thing
  // the rider will actually do for that order, so that's what drives sort
  // order and the distance/ETA shown in an order-list view.
  const stopsByOrder = new Map<string, DeliveryStop[]>();
  for (const stop of stops) {
    if (!stopsByOrder.has(stop.orderId)) stopsByOrder.set(stop.orderId, []);
    stopsByOrder.get(stop.orderId)!.push(stop);
  }

  for (const order of orders) {
    const orderStops = stopsByOrder.get(String(order._id)) || [];
    const nextStop = orderStops
      .filter((s) => s.sequence !== null)
      .sort((a, b) => (a.sequence as number) - (b.sequence as number))[0];

    result.set(String(order._id), {
      sequence: nextStop?.sequence ?? null,
      distanceFromPrevKm: nextStop?.distanceFromPrevKm ?? null,
      nextStopType: nextStop?.stopType ?? null,
    });
  }

  return result;
}
