import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupNativeApp } from "./native/setupNativeApp";

void setupNativeApp();

createRoot(document.getElementById("root")!).render(<App />);
