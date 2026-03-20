import { Capacitor } from "@capacitor/core";

export function isNativeCleanerApp() {
  return Capacitor.isNativePlatform();
}
