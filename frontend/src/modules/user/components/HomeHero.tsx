import { useNavigate } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getTheme } from '../../../utils/themes';
import { useLocation } from '../../../hooks/useLocation';
import { getCategories } from '../../../services/api/customerProductService';
import { Category } from '../../../types/domain';
import ShareButton from '../../../components/ShareButton';
import { getCachedHeaderCategoriesPublic, getHeaderCategoriesPublic } from '../../../services/api/headerCategoryService';
import { getIconByName } from '../../../utils/iconLibrary';
import { useThemeContext } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { useLanguage, AppLanguage } from '../../../context/LanguageContext';
import { Mic } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

gsap.registerPlugin(ScrollTrigger);

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionResultListLike = ArrayLike<SpeechRecognitionResultLike> & { isFinal?: boolean };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultListLike> };
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
}

interface HomeHeroProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const ALL_TAB: Tab = {
  id: 'all',
  label: 'All',
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

interface LanguageDropdownProps {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  isSticky: boolean;
  themeKey: string; // Added themeKey prop
}

const LanguageDropdown = ({ language, setLanguage, isSticky, themeKey }: LanguageDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const theme = getTheme(themeKey || 'all'); // Use themeKey here

  // Extract primary color for active state
  // Theme usually returns colors like '#HEX' or 'rgb(...)'.
  // We'll use a fallback or try to use the theme's primary color.
  const activeColor = theme.primary && theme.primary[0] ? theme.primary[0] : '#0d9488'; // Defaulting to teal-like if fail

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const options: { value: AppLanguage; label: string }[] = [
    { value: 'EN', label: 'English' },
    { value: 'HI', label: 'Hindi' }
  ];

  return (
    <div
      ref={dropdownRef}
      className="relative flex items-center h-full"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 outline-none transition-colors border-r border-gray-300 mr-2 h-5"
      >
        <span
          className="text-xs font-bold leading-none"
          style={{ color: isSticky ? '#6b7280' : '#4b5563' }}
        >
          {language}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isSticky ? "#9ca3af" : "#6b7280"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-lg shadow-xl border border-neutral-100 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setLanguage(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-neutral-50 flex items-center justify-between group`}
                style={{
                  color: language === opt.value ? activeColor : '#374151',
                  backgroundColor: language === opt.value ? 'rgba(0,0,0,0.02)' : 'transparent'
                }}
              >
                <span>{opt.label}</span>
                {language === opt.value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function HomeHero({ activeTab = 'all', onTabChange }: HomeHeroProps) {
  const cachedHeaderCategories = getCachedHeaderCategoriesPublic() || [];
  const [headerCategories, setHeaderCategories] = useState<any[]>(cachedHeaderCategories);
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (!cachedHeaderCategories.length) {
      return [ALL_TAB];
    }

    const mapped = cachedHeaderCategories.map((c) => ({
      id: c.slug,
      label: c.name,
      theme: c.theme || c.slug,
      icon: c.image ? (
        <img src={c.image} alt={c.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        getIconByName(c.iconName)
      )
    }));

    const hasAllTab = mapped.some((tab) => tab.id === 'all');
    if (hasAllTab) {
      const allTabIndex = mapped.findIndex((tab) => tab.id === 'all');
      const allTab = mapped[allTabIndex];
      const otherTabs = mapped.filter((_, i) => i !== allTabIndex);
      return [allTab, ...otherTabs];
    }

    return [ALL_TAB, ...mapped];
  });

  useEffect(() => {
    const fetchHeaderCategories = async () => {
      try {
        const cats = await getHeaderCategoriesPublic(true);
        if (cats && cats.length > 0) {
          setHeaderCategories(cats);
          const mapped = cats.map(c => ({
            id: c.slug,
            label: c.name,
            theme: c.theme || c.slug,
            icon: c.image ? (
                <img src={c.image} alt={c.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            ) : (
                getIconByName(c.iconName)
            )
          }));

          // Check if a tab with id 'all' is already provided by the API
          const hasAllTab = mapped.some(tab => tab.id === 'all');

          if (hasAllTab) {
            // Find the 'all' tab and ensure it's at the beginning
            const allTabIndex = mapped.findIndex(tab => tab.id === 'all');
            const allTab = mapped[allTabIndex];
            const otherTabs = mapped.filter((_, i) => i !== allTabIndex);
            setTabs([allTab, ...otherTabs]);
          } else {
            setTabs([ALL_TAB, ...mapped]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch header categories', error);
      }
    };
    // Always revalidate on mount — getOrFetch resolves instantly when the
    // cache is still fresh, so this costs nothing when there's nothing new.
    // Skipping the fetch whenever any cached value existed used to be
    // harmless (the cache was in-memory only, so it was always empty on a
    // fresh load) but now that header categories persist to sessionStorage,
    // that guard would permanently lock the tabs to whatever was cached
    // first — including a stale or incomplete list — and never correct it.
    fetchHeaderCategories();
  }, []);

  const { themeKey: currentThemeKey } = useThemeContext();

  const navigate = useNavigate();
  const { location: userLocation, requestLocation, isLocationLoading } = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);
  const topSectionRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const SpeechRecognitionCtor = useMemo(() => getSpeechRecognition(), []);
  const { showToast } = useToast();

  const stopVoiceSearch = () => {
    recognitionRef.current?.stop();
  };

  const handleVoiceSearch = () => {
    if (!SpeechRecognitionCtor) {
      showToast("Voice search isn't supported on this browser.", "error");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript ?? "";
      setVoiceTranscript(transcript);
      if (result?.isFinal && transcript) {
        navigate(`/search?q=${encodeURIComponent(transcript)}`);
      }
    };

    recognition.onerror = () => {
      // Silently stop; the popup closing is feedback enough.
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceTranscript("");
    };

    recognitionRef.current = recognition;
    setVoiceTranscript("");
    setIsListening(true);
    recognition.start();
  };
  const [isSticky, setIsSticky] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const { language, setLanguage } = useLanguage();

  // Format location display text
  const locationDisplayText = useMemo(() => {
    if (userLocation) {
      if (userLocation.address) {
        return userLocation.address;
      } else if (userLocation.city && userLocation.state) {
        return `${userLocation.city}, ${userLocation.state}`;
      } else if (userLocation.city) {
        return userLocation.city;
      }
      return '';
    }
    return '';
  }, [userLocation]);

  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch categories for search suggestions
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await getCategories();
        let apiCategories = [];
        if (response.success && response.data) {
          apiCategories = response.data.map((c: any) => ({
            ...c,
            id: c._id || c.id
          }));
        }

        // Merge with Seller Categories from localStorage. Only Active
        // seller-own categories feed customer search suggestions — Inactive
        // ones must stay hidden from the storefront. Missing `status` is
        // treated as Active for back-compat.
        const sellerPermissions = JSON.parse(localStorage.getItem('seller_category_permissions') || '{}');
        const sellerCatsStorage = localStorage.getItem('seller_own_categories'); // Using simplified key for demo
        let sellerCategories: any[] = [];

        if (sellerCatsStorage) {
             const parsed = JSON.parse(sellerCatsStorage) as any[];
             sellerCategories = parsed.filter(
                 (c) => c && (c.status === undefined || c.status === 'Active')
             );
        }

        // In a real scenario we would filter by permission, but for demo we just show created ones
        // const allowedSellerCategories = sellerCategories.filter(...)

        setCategories([...apiCategories, ...sellerCategories]);
      } catch (error) {
        console.error("Error fetching categories for suggestions:", error);
      }
    };
    fetchCategories();
  }, []);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (activeTab === 'all' && categories.length > 0) {
      return categories.slice(0, 8).map(c => c.name.toLowerCase());
    }
    switch (activeTab) {
      case 'wedding': return ['gift packs', 'dry fruits', 'sweets', 'decorative items', 'wedding cards', 'return gifts'];
      case 'winter': return ['woolen clothes', 'caps', 'gloves', 'blankets', 'heater', 'winter wear'];
      case 'electronics': return ['chargers', 'cables', 'power banks', 'earphones', 'phone cases', 'screen guards'];
      case 'beauty': return ['lipstick', 'makeup', 'skincare', 'kajal', 'face wash', 'moisturizer'];
      case 'grocery': return ['atta', 'milk', 'dal', 'rice', 'oil', 'vegetables'];
      case 'fashion': return ['clothing', 'shoes', 'accessories', 'watches', 'bags', 'jewelry'];
      case 'sports': return ['cricket bat', 'football', 'badminton', 'fitness equipment', 'sports shoes', 'gym wear'];
      default: return ['atta', 'milk', 'dal', 'coke', 'bread', 'eggs', 'rice', 'oil'];
    }
  }, [activeTab, categories]);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(hero, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
    }, hero);
    return () => ctx.revert();
  }, []);

  // Animate search suggestions
  useEffect(() => {
    setCurrentSearchIndex(0);
    const interval = setInterval(() => {
      setCurrentSearchIndex((prev) => (prev + 1) % searchSuggestions.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [searchSuggestions.length, activeTab]);

  // Handle scroll for sticky behavior using Intersection detection via BoundingRect
  useEffect(() => {
    const handleScroll = () => {
      if (topSectionRef.current) {
        // We check the bottom position of the top section (Logo).
        // When it moves out of view (becomes <= 0 or small offset), we stick the header.
        const topSectionBottom = topSectionRef.current.getBoundingClientRect().bottom;
        // e.g. if section height is ~60px, transition as it scrolls
        const threshold = 10; // slightly before full exit

        setIsSticky(topSectionBottom <= threshold);

        // Optional: Progress logic if you want gradient transition
        const topSectionHeight = topSectionRef.current.offsetHeight || 60;
        const p = Math.min(Math.max(1 - (topSectionBottom / topSectionHeight), 0), 1);
        setScrollProgress(p);
      }
    };

    // Attach to MAIN container because that is what scrolls
    const main = document.querySelector('main');
    if (main) {
      main.addEventListener('scroll', handleScroll, { passive: true });
    }
    // Also attach to window just in case usage changes
    window.addEventListener('scroll', handleScroll, { passive: true });

    handleScroll(); // Initial check

    return () => {
      if (main) main.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Update sliding indicator
  useEffect(() => {
    const updateIndicator = (shouldScroll = true) => {
      const activeTabButton = tabRefs.current.get(activeTab);
      const container = tabsContainerRef.current;
      if (activeTabButton && container) {
        try {
          const left = activeTabButton.offsetLeft;
          const width = activeTabButton.offsetWidth;
          if (width > 0) setIndicatorStyle({ left, width });

          if (shouldScroll) {
            const containerScrollLeft = container.scrollLeft;
            const containerWidth = container.offsetWidth;
            const buttonRight = left + width;
            const scrollPadding = 20;
            let targetScrollLeft = containerScrollLeft;

            if (left < containerScrollLeft + scrollPadding) {
              targetScrollLeft = left - scrollPadding;
            } else if (buttonRight > containerScrollLeft + containerWidth - scrollPadding) {
              targetScrollLeft = buttonRight - containerWidth + scrollPadding;
            }

            if (targetScrollLeft !== containerScrollLeft) {
              container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
            }
          }
        } catch (error) { console.warn(error); }
      }
    };
    updateIndicator(true);
    const t1 = setTimeout(() => updateIndicator(true), 50);
    const t2 = setTimeout(() => updateIndicator(true), 150);
    const t3 = setTimeout(() => updateIndicator(false), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [activeTab]);

  const handleTabClick = (tabId: string) => {
    const mainElement = document.querySelector('main');
    if (mainElement instanceof HTMLElement) {
      mainElement.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    onTabChange?.(tabId);
  };

  const theme = getTheme(currentThemeKey);
  const heroGradient = `linear-gradient(to bottom right, ${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;

  // Render the sticky content (Search + Tabs)
  const renderStickyContent = () => (
    <div
      ref={stickyRef}
      className={isSticky ? 'fixed top-0 left-0 right-0 z-[9999] bg-[#fff7ed] shadow-md animate-fade-in' : 'relative z-50 bg-transparent'}
      style={{
        transition: 'background-color 0.3s ease',
      }}
    >
      <div className={`px-4 md:px-6 lg:px-8 pt-2 ${isSticky ? 'md:pt-2.5' : 'md:pt-0'} pb-2 md:pb-2`}>
        {/* Search Bar */}
        <div
          onClick={() => navigate('/search')}
          className={`w-full md:w-auto md:max-w-xl md:mx-auto rounded-2xl shadow-[0_6px_20px_-6px_rgba(15,23,42,0.25)] px-3.5 ${isSticky ? 'py-3 md:py-2.5' : 'py-2 md:py-1.5'} flex items-center gap-2 cursor-pointer hover:shadow-[0_10px_28px_-6px_rgba(15,23,42,0.3)] transition-all duration-300 mb-2 md:mb-1.5 bg-white relative z-50`}
          style={{
            backgroundColor: isSticky ? `rgba(249, 250, 251, 1)` : 'white',
            border: isSticky ? `1px solid rgba(229, 231, 235, 1)` : 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 md:w-4 md:h-4">
            <circle cx="11" cy="11" r="8" stroke={isSticky ? "#9ca3af" : "#6b7280"} strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke={isSticky ? "#9ca3af" : "#6b7280"} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="flex-1 relative h-4 md:h-4 overflow-hidden">
            {searchSuggestions.map((suggestion, index) => {
              const isActive = index === currentSearchIndex;
              const prevIndex = (currentSearchIndex - 1 + searchSuggestions.length) % searchSuggestions.length;
              const isPrev = index === prevIndex;
              return (
                <div
                  key={suggestion}
                  className={`absolute inset-0 flex items-center transition-all duration-500 ${isActive ? 'translate-y-0 opacity-100' : isPrev ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0'}`}
                >
                  <span className={`text-xs md:text-xs`} style={{ color: isSticky ? '#9ca3af' : '#6b7280' }}>
                    {language === 'HI' ? 'खोजें' : 'Search'} &apos;{suggestion}&apos;
                  </span>
                </div>
              );
            })}
          </div>

          <LanguageDropdown
            language={language}
            setLanguage={setLanguage}
            isSticky={isSticky}
            themeKey={currentThemeKey}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleVoiceSearch();
            }}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 md:w-5 md:h-5 rounded-full bg-gradient-to-r from-red-500 to-red-600 shadow-sm shadow-red-500/40 hover:shadow-md hover:shadow-red-500/50 active:scale-95 transition-all"
            aria-label="Search by voice"
            title="Search by voice"
          >
            <Mic className="h-3.5 w-3.5 md:h-3 md:w-3 text-white" />
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-neutral-400/40 w-full" style={{ paddingBottom: 0 }}>
          <div
           ref={tabsContainerRef}
          className="relative flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide -mx-4 md:mx-0 px-4 md:px-6 lg:px-8 scroll-smooth"
          style={{ paddingBottom: '12px' }}
          data-padding-bottom="md:8px"
          onWheel={(e) => {
            // Web view: mouse wheel is vertical; use it to scroll categories horizontally.
            if (window.innerWidth >= 768 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          {indicatorStyle.width > 0 && (
            <div
              className="absolute bottom-0 h-[3px] rounded-full transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                background: 'linear-gradient(90deg, var(--customer-primary), var(--customer-primary-dark, var(--customer-primary)))',
                boxShadow: '0 0 8px var(--customer-primary-alpha-40, rgba(0,0,0,0.25))',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 0,
              }}
            />
          )}

          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const tabColor = isActive ? 'text-neutral-900' : isSticky ? 'text-neutral-600' : 'text-neutral-800';
            return (
              <button
                key={tab.id}
                ref={(el) => { if (el) tabRefs.current.set(tab.id, el); else tabRefs.current.delete(tab.id); }}
                onClick={() => handleTabClick(tab.id)}
                className={`flex-shrink-0 flex flex-col items-center justify-center w-auto min-w-[75px] md:w-auto md:min-w-[95px] px-1 md:px-3 py-2 relative ${tabColor} z-10`}
                style={{ transition: 'color 0.3s ease-out' }}
                type="button"
              >
                <motion.div
                  className={`mb-1.5 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center ${tabColor}`}
                  style={{ transition: 'color 0.3s ease-out' }}
                  animate={
                    isActive
                      ? { scale: [1, 1.12, 1], y: [0, -1.5, 0] }
                      : { scale: 1, y: 0 }
                  }
                  transition={
                    isActive
                      ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                  }
                >
                  <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
                    {tab.icon}
                  </div>
                </motion.div>
                <span className={`text-[10px] md:text-xs md:whitespace-nowrap ${isActive ? 'font-bold' : 'font-medium'}`} style={{ transition: 'font-weight 0.3s ease-out' }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );

  const { config } = useAppContext();

  return (
    <div
      ref={heroRef}
      className="relative z-20"
      style={{ background: heroGradient, paddingBottom: 0, marginBottom: 0 }}
    >
      {/* Top section with logo - NOT sticky */}
      <div>
        <div ref={topSectionRef} className="px-4 md:px-6 lg:px-8 pt-3 md:pt-0 pb-2 md:pb-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-shrink-0 md:invisible">
              <img
                src={config?.appLogo || "/assets/geetastoreslogo.png"}
                alt={config?.appName || "Geeta Stores"}
                className="h-10 md:h-12 w-auto object-contain"
              />
            </div>
            {locationDisplayText && (
              <div 
                className={`flex items-center gap-1 text-neutral-700 text-xs md:text-sm cursor-pointer hover:opacity-80 transition-opacity ${isLocationLoading ? 'opacity-70 pointer-events-none' : ''}`}
                onClick={() => {
                  if (!isLocationLoading) {
                    requestLocation();
                  }
                }}
              >
                {isLocationLoading ? (
                  <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span className="line-clamp-1 font-medium" title={locationDisplayText}>
                  {isLocationLoading ? 'Updating location...' : locationDisplayText}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <ShareButton
              iconOnly
              title={config?.appName || "Geeta Stores"}
              text={`Check out ${config?.appName || "Geeta Stores"} - fast grocery delivery!`}
              imageUrl={config?.appLogo || `${window.location.origin}/assets/geetastoreslogo.png`}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-700 hover:bg-black/5 transition-colors"
            />
          </div>
        </div>
      </div>

      {isSticky ? (
        <>
          <div style={{ height: '110px' }} />
          {createPortal(renderStickyContent(), document.body)}
        </>
      ) : (
        renderStickyContent()
      )}

      {isListening && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Voice search"
          onClick={stopVoiceSearch}
        >
          <div
            className="mx-4 flex w-full max-w-xs flex-col items-center rounded-2xl bg-white px-6 py-8 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/30" />
              <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-red-500/20" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg">
                <Mic className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-5 text-base font-semibold text-neutral-900">Listening&hellip;</p>
            <p className="mt-1 min-h-[1.5rem] text-sm text-neutral-500">
              {voiceTranscript || "Speak now (in English)"}
            </p>
            <button
              type="button"
              onClick={stopVoiceSearch}
              className="mt-5 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
