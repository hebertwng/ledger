import { createObservable } from '../utils/observable.js';
import ptBR from '../locales/pt-BR.js';
import enUS from '../locales/en-US.js';

export const SUPPORTED_LOCALES = ['pt-BR', 'en-US'];
const DEFAULT_LOCALE = 'pt-BR';
const DICTIONARIES = { 'pt-BR': ptBR, 'en-US': enUS };
const STORAGE_KEY = 'ledger.locale';

function detectInitialLocale() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch (error) {
    // localStorage indisponível (ex.: modo privado); segue para a detecção por navegador.
  }
  const browserLocale = (typeof navigator !== 'undefined' && navigator.language) || DEFAULT_LOCALE;
  const prefix = browserLocale.slice(0, 2).toLowerCase();
  return SUPPORTED_LOCALES.find((locale) => locale.slice(0, 2).toLowerCase() === prefix) || DEFAULT_LOCALE;
}

const localeState = createObservable(detectInitialLocale());

export function getLocale() {
  return localeState.get();
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  localeState.set(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (error) {
    // Preferência de idioma não persiste nesta sessão; segue funcionando em memória.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function onLocaleChange(listener) {
  return localeState.subscribe(listener);
}

export function t(key, params) {
  const dictionary = DICTIONARIES[getLocale()] || DICTIONARIES[DEFAULT_LOCALE];
  const template = dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}
