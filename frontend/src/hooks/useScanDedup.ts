import { useCallback, useRef } from 'react';

/**
 * Cooldown-based dedup for barcode/QR scans (camera and hardware-scanner input both
 * tend to fire the same code multiple times in quick succession).
 * Mirrors the ref-based cooldown originally used in AdminPOSOrders.
 */
export function useScanDedup(defaultCooldownMs = 500) {
  const lastScanRef = useRef({ code: '', time: 0 });

  const isDuplicateScan = useCallback((code: string, cooldownMs = defaultCooldownMs) => {
    const now = Date.now();
    const isDuplicate = code === lastScanRef.current.code && (now - lastScanRef.current.time < cooldownMs);
    if (!isDuplicate) {
      lastScanRef.current = { code, time: now };
    }
    return isDuplicate;
  }, [defaultCooldownMs]);

  return isDuplicateScan;
}
