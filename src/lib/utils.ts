import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Obtiene la fecha actual OFICIAL DE COLOMBIA (GMT-5)
 * Implementación manual radical: Resta 5 horas al tiempo UTC directamente.
 * Esto ignora cualquier configuración del navegador/servidor y garantiza la fecha colombiana.
 */
export function getLocalDate(date: Date = new Date()): string {
  // Obtener timestamp UTC
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  
  // Restar 5 horas exactas (3600000 ms * 5) para llegar a Colombia
  const bogotaTime = new Date(utc - (3600000 * 5));
  
  // Formatear manualmente YYYY-MM-DD para evitar conversiones implícitas
  const year = bogotaTime.getFullYear();
  const month = (bogotaTime.getMonth() + 1).toString().padStart(2, '0');
  const day = bogotaTime.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Parsea una fecha YYYY-MM-DD y la interpreta como una fecha local a las 00:00:00
 * Fundamental para que los filtros de fecha funcionen con precisión.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}