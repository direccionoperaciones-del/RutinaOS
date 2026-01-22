import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Obtiene la fecha actual del dispositivo del usuario en formato YYYY-MM-DD
 * Soluciona el problema de UTC donde después de las 7PM (Colombia) ya es el día siguiente.
 */
export function getLocalDate(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

/**
 * Convierte un string de fecha "YYYY-MM-DD" (de la BD) a un objeto Date
 * interpretado como medianoche LOCAL, no UTC.
 * Evita el error donde "2026-01-21" se muestra como "20 Ene" por la zona horaria.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  // El mes en JS es base-0 (Enero = 0)
  return new Date(year, month - 1, day);
}