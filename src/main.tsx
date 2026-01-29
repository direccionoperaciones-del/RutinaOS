import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { registerServiceWorker } from "./sw-register";

// Inicializar Service Worker
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);