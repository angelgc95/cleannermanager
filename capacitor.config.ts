import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cleannermanager.cleaner",
  appName: "Cleaner Manager",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#172033",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#172033",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#172033",
      style: "LIGHT",
    },
  },
};

export default config;
