const BASE_LOCAL_STORAGE_KEY = "dndcharactersheets";

export function localStorageKey(key: string) {
  return `${BASE_LOCAL_STORAGE_KEY}_${key}`;
}

export function readLocalStorage(key: string, defaultValue?: any) {
  const readValue = window.localStorage.getItem(localStorageKey(key));
  if (readValue) {
    return JSON.parse(readValue);
  }
  return defaultValue;
}

export function writeLocalStorage(key: string, value: any) {
  window.localStorage.setItem(localStorageKey(key), JSON.stringify(value));
}
