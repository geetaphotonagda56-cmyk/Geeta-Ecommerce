import QRCode from "qrcode";

/**
 * Encodes "<orderId>:<deliveryQrToken>" as a QR code data URL for printing on
 * the bill. The delivery boy scans this at drop-off to mark the order
 * Delivered - see completeDeliveryByScan on the backend.
 */
export async function generateBillQrDataUrl(orderId: string, deliveryQrToken: string): Promise<string> {
  const payload = `${orderId}:${deliveryQrToken}`;
  return QRCode.toDataURL(payload, { margin: 1, width: 160 });
}
