import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Obtiene la fecha actual del dispositivo del usuario en formato YYYY-MM-DD
 * Usa los métodos locales nativos (getFullYear, getMonth, getDate) para garantizar
 * que coincida exactamente con el reloj del sistema, ignorando UTC.
 */
export function getLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte un string de fecha "YYYY-MM-DD" (de la BD) a un objeto Date
 * interpretado como medianoche LOCAL.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // Aseguramos que el string tenga el formato correcto y forzamos la interpretación local
  // al usar el constructor new Date(y, m, d)
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Meses en JS son 0-11
  const day = parseInt(parts[2], 10);
  
  return new Date(year, month, day);
}