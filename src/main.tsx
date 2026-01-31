import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { registerServiceWorker } from "./sw-register";

// Inicializar Service Worker
registerServiceWorker();

// Log de versión para confirmar despliegue
console.log("Movacheck App v1.0.1 - Push Notification Update");

createRoot(document.getElementById("root")!).render(<App />);