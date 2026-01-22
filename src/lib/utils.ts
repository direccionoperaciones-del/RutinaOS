import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Retorna la fecha actual en formato YYYY-MM-DD respetando la zona horaria local del usuario.
 * Soluciona el bug de .toISOString() que devuelve la fecha UTC (a veces el día siguiente).
 */
export function getLocalDate(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}