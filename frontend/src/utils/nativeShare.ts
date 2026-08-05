/**
 * Plain Android `android.webkit.WebView` (what Flutter's `webview_flutter`
 * wraps) does not implement the Web Share API, so `navigator.share` is
 * always `undefined` there and every share button silently falls back to
 * clipboard-copy. To get the native Android share sheet inside the app,
 * the Flutter side registers a JavascriptChannel named "NativeShare":
 *
 *   controller.addJavaScriptChannel(
 *     'NativeShare',
 *     onMessageReceived: (message) {
 *       final data = jsonDecode(message.message);
 *       Share.share(data['text'] ?? data['url'], subject: data['title']);
 *     },
 *   );
 */
declare global {
  interface Window {
    NativeShare?: { postMessage: (message: string) => void };
  }
}

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareResult = "flutter" | "native" | "cancelled" | "clipboard" | "failed";

/**
 * Tries, in order: the Flutter native-share bridge, the browser Web Share
 * API, then clipboard-copy. Returns which path was taken so callers can
 * decide whether a "link copied" toast is appropriate (only for "clipboard").
 */
export async function shareContent(content: ShareContent): Promise<ShareResult> {
  if (typeof window !== "undefined" && window.NativeShare?.postMessage) {
    window.NativeShare.postMessage(JSON.stringify(content));
    return "flutter";
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(content);
      return "native";
    } catch (err: any) {
      // User dismissed the native share sheet - not a failure, don't fall through to clipboard.
      if (err?.name === "AbortError") return "cancelled";
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(content.url || content.text || "");
      return "clipboard";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
