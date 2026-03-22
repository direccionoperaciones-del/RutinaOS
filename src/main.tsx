import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { registerServiceWorker } from "./sw-register";

// Inicializar Service Worker
registerServiceWorker();

// Log de versión para confirmar despliegue
// v1.0.2 - SMTP & Email Template Update
console.log("RunOp App v1.0.2 - SMTP & UI refinement");

createRoot(document.getElementById("root")!).render(<App />);