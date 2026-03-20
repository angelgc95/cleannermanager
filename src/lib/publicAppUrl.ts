import { Capacitor } from "@capacitor/core";

const DEFAULT_PUBLIC_APP_URL = "https://www.cleannermanager.com";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getPublicAppOrigin() {
  if (Capacitor.isNativePlatform()) {
    return normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL);
  }

  return window.location.origin;
}

export function buildPublicAppUrl(path = "/") {
  const base = getPublicAppOrigin();
  return new URL(path, `${base}/`).toString();
}
