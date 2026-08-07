import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setGoogleTranslateLanguage } from "../utils/googleTranslate";

export type AppLanguage = "EN" | "HI";

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "geeta_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(
    () => (localStorage.getItem(STORAGE_KEY) as AppLanguage) || "EN"
  );

  useEffect(() => {
    if (language === "HI") setGoogleTranslateLanguage("hi");
  }, [language]);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    setGoogleTranslateLanguage(lang === "HI" ? "hi" : "en");
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
