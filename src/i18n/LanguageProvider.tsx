import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import {
  getIntlLocale,
  translateStatus,
  translateText,
  type Language,
} from "./translations";

const STORAGE_KEY = "cleannermanager-language";
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

type AttributeName = (typeof TRANSLATABLE_ATTRIBUTES)[number];

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string, variables?: Record<string, string | number>) => string;
  tStatus: (status: string) => string;
  dateLocale: typeof enUS;
  formatDate: (value: Date | number | string, pattern: string) => string;
  formatDateTime: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function shouldSkipElement(element: Element) {
  const tagName = element.tagName;
  return (
    tagName === "SCRIPT" ||
    tagName === "STYLE" ||
    tagName === "CODE" ||
    tagName === "PRE" ||
    tagName === "SVG" ||
    Boolean(element.closest("[data-no-translate='true']"))
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const textNodeSources = useRef(new WeakMap<Text, string>());
  const attributeSources = useRef(new WeakMap<Element, Map<AttributeName, string>>());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const dateLocale = language === "es" ? es : enUS;

  const contextValue = useMemo<LanguageContextValue>(() => {
    const intlLocale = getIntlLocale(language);
    return {
      language,
      setLanguage: setLanguageState,
      t: (text, variables) => translateText(text, language, variables),
      tStatus: (status) => translateStatus(status, language),
      dateLocale,
      formatDate: (value, pattern) => format(new Date(value), pattern, { locale: dateLocale }),
      formatDateTime: (value, options) =>
        new Intl.DateTimeFormat(intlLocale, options).format(new Date(value)),
    };
  }, [dateLocale, language]);

  useEffect(() => {
    const translateTextNode = (textNode: Text) => {
      const current = textNode.textContent ?? "";
      if (!current.trim()) return;

      const stored = textNodeSources.current.get(textNode);
      const source = stored && current === translateText(stored, language) ? stored : current;
      if (language === "en") {
        if (stored && current !== stored) {
          textNode.textContent = stored;
        }
        textNodeSources.current.delete(textNode);
        return;
      }

      textNodeSources.current.set(textNode, source);
      const translated = translateText(source, language);
      if (translated !== current) {
        textNode.textContent = translated;
      }
    };

    const translateAttributes = (element: Element) => {
      const existingMap = attributeSources.current.get(element) ?? new Map<AttributeName, string>();

      for (const attributeName of TRANSLATABLE_ATTRIBUTES) {
        const current = element.getAttribute(attributeName);
        if (!current?.trim()) continue;

        const stored = existingMap.get(attributeName);
        const source = stored && current === translateText(stored, language) ? stored : current;

        if (language === "en") {
          if (stored && current !== stored) {
            element.setAttribute(attributeName, stored);
          }
          existingMap.delete(attributeName);
          continue;
        }

        existingMap.set(attributeName, source);
        const translated = translateText(source, language);
        if (translated !== current) {
          element.setAttribute(attributeName, translated);
        }
      }

      if (existingMap.size > 0) {
        attributeSources.current.set(element, existingMap);
      } else {
        attributeSources.current.delete(element);
      }
    };

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node as Text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      if (shouldSkipElement(element)) return;

      translateAttributes(element);
      element.childNodes.forEach(translateNode);
    };

    const root = document.body;
    translateNode(root);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          translateNode(mutation.target);
          return;
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateNode(mutation.target);
          return;
        }

        mutation.addedNodes.forEach(translateNode);
      });
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => observer.disconnect();
  }, [language]);

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return context;
}
