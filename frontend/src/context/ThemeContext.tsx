import { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { getTheme, Theme } from '../utils/themes';
import { getCachedHeaderCategoriesPublic, getHeaderCategoriesPublic } from '../services/api/headerCategoryService';

interface ThemeContextType {
    activeCategory: string;
    setActiveCategory: (category: string) => void;
    currentTheme: Theme;
    themeKey: string;
    currentCategory: any | null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [activeCategory, setActiveCategory] = useState('all');
    const [headerCategories, setHeaderCategories] = useState<any[]>(() => getCachedHeaderCategoriesPublic() || []);

    const fetchHeaderCategories = async () => {
        try {
            const cats = await getHeaderCategoriesPublic();
            if (cats) {
                setHeaderCategories(cats);
            }
        } catch (error) {
            console.error('Failed to fetch header categories in ThemeProvider', error);
        }
    };

    useEffect(() => {
        // Always revalidate on mount (see HomeHero.tsx for why: this guard
        // used to be harmless when the cache was in-memory only, but now
        // that header categories persist to sessionStorage, skipping the
        // fetch here would permanently lock onto whatever was cached first).
        fetchHeaderCategories();

        // Refresh when tab gets focus (Real-time update from Admin changes)
        window.addEventListener('focus', fetchHeaderCategories);
        return () => window.removeEventListener('focus', fetchHeaderCategories);
    }, []);

    const slugToThemeMap = useMemo(() => {
        const map = new Map<string, string>();
        headerCategories.forEach(cat => {
            map.set(cat.slug, cat.theme || cat.slug);
        });
        return map;
    }, [headerCategories]);

    const themeKey = useMemo(() => {
        // The "All" tab is the storefront default — it must always reflect the
        // real admin-configured brand color (--customer-primary etc.), never a
        // per-category mood theme. Header categories can still be individually
        // assigned a seasonal theme (e.g. "wedding", "sports") in the admin
        // panel; that only applies once the shopper picks that specific tab.
        if (activeCategory === 'all') return 'all';
        return slugToThemeMap.get(activeCategory) || activeCategory || 'all';
    }, [activeCategory, slugToThemeMap]);

    const currentTheme = getTheme(themeKey);

    const currentCategory = useMemo(() => {
        return headerCategories.find(cat => cat.slug === activeCategory) || null;
    }, [activeCategory, headerCategories]);

    return (
        <ThemeContext.Provider value={{ activeCategory, setActiveCategory, currentTheme, themeKey, currentCategory }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemeContext() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useThemeContext must be used within a ThemeProvider');
    }
    return context;
}
