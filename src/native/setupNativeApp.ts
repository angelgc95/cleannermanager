import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function setupNativeApp() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await Promise.allSettled([
    StatusBar.setOverlaysWebView({ overlay: false }),
    StatusBar.setBackgroundColor({ color: "#172033" }),
    StatusBar.setStyle({ style: Style.Light }),
    Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
    SplashScreen.hide(),
  ]);

  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }

    CapacitorApp.exitApp();
  });
}
