import { en } from './en.js';

const translations = { en };
let locale = 'en';

export function setLocale(nextLocale) {
  if (translations[nextLocale]) locale = nextLocale;
  document.documentElement.lang = locale;
}

export function t(key, variables = {}) {
  const template = translations[locale][key] ?? translations.en[key] ?? key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : match,
  );
}
