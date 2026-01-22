import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Obtiene la fecha actual OFICIAL DE COLOMBIA (GMT-5) en formato YYYY-MM-DD.
 * Esto corrige definitivamente el problema de que después de las 7PM aparezca el día siguiente (UTC).
 * Usa 'en-CA' para garantizar el formato ISO YYYY-MM-DD.
 */
export function getLocalDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Convierte un string de fecha "YYYY-MM-DD" (de la BD) a un objeto Date
 * interpretado como medianoche LOCAL, no UTC.
 * Evita el error donde "2026-01-21" se muestra como "20 Ene" por diferencias horarias.
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