import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Obtiene la fecha y hora actual exacta en Colombia (GMT-5).
 * Independiente de la zona horaria del navegador del usuario.
 */
export function getColombiaDate(): Date {
  // Crear fecha basada en string ISO específico para Bogotá
  const now = new Date();
  const bogotaString = now.toLocaleString("en-US", { timeZone: "America/Bogota" });
  return new Date(bogotaString);
}

/**
 * Retorna la fecha actual de Colombia en formato YYYY-MM-DD
 */
export function getLocalDate(): string {
  const date = getColombiaDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte un string YYYY-MM-DD (fecha BD) a un objeto Date
 * que representa las 00:00:00 de ese día EN COLOMBIA.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return getColombiaDate();
  
  // Dividimos manualmente para evitar interpretaciones UTC del navegador
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Creamos la fecha. OJO: new Date(y,m,d) crea la fecha en hora LOCAL del navegador.
  // Esto está bien para componentes de calendario visuales, pero para lógica de vencimiento
  // necesitamos asegurar que comparamos "peras con peras".
  return new Date(year, month - 1, day);
}

/**
 * Verifica si una fecha ha pasado respecto a AHORA (Hora Colombia).
 * Útil para validaciones de vencimiento.
 */
export function isOverdueInColombia(deadline: Date): boolean {
  const nowColombia = getColombiaDate();
  return nowColombia > deadline;
}

/**
 * Intenta abrir el selector de fecha nativo de forma segura.
 * Maneja excepciones de cross-origin iframe.
 */
export function openDatePicker(id: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.focus(); // Fallback para navegadores viejos
      }
    } catch (error) {
      // Fallback silencioso si falla por restricciones de seguridad (iframe)
      // Simplemente damos foco para permitir escribir
      console.warn("showPicker blocked:", error);
      input.focus();
    }
  }
}