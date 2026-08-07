// Drives Google's website-translate widget programmatically so the rest of
// the app can flip the whole rendered page between languages from a single
// EN/HI toggle, without maintaining per-string translation files.

declare global {
  interface Window {
    google?: { translate?: { TranslateElement: new (options: object, elementId: string) => void } };
    googleTranslateElementInit?: () => void;
  }
}

const ELEMENT_ID = "google_translate_element";
const SCRIPT_SRC = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

let initPromise: Promise<void> | null = null;

function ensureHiddenContainer(): void {
  if (document.getElementById(ELEMENT_ID)) return;
  const container = document.createElement("div");
  container.id = ELEMENT_ID;
  container.style.display = "none";
  document.body.appendChild(container);
}

// Loads the Google Translate script exactly once and resolves once the
// TranslateElement (and its hidden <select class="goog-te-combo">) exists.
export function initGoogleTranslate(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    ensureHiddenContainer();

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate) return resolve();
      new window.google.translate.TranslateElement(
        { pageLanguage: "en", includedLanguages: "en,hi", autoDisplay: false },
        ELEMENT_ID
      );
      resolve();
    };

    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  });

  return initPromise;
}

// The widget only exposes its combo <select> a short while after init
// resolves, so retry briefly instead of failing on the first missing frame.
function findComboSelect(retriesLeft = 20): Promise<HTMLSelectElement | null> {
  const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (select) return Promise.resolve(select);
  if (retriesLeft <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    setTimeout(() => resolve(findComboSelect(retriesLeft - 1)), 150);
  });
}

export async function setGoogleTranslateLanguage(lang: "en" | "hi"): Promise<void> {
  await initGoogleTranslate();
  const select = await findComboSelect();
  if (!select) return;

  select.value = lang;
  select.dispatchEvent(new Event("change"));
}
