import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Retorna un objeto Date que representa la hora actual en Colombia (UTC-5).
 * El objeto Date retornado tendrá los valores numéricos (horas, minutos) correspondientes a Colombia,
 * aunque internamente el navegador crea que es hora local.
 * ESTO ES INTENCIONAL para permitir comparaciones directas de "Hora Muro".
 */
export const getColombiaDate = (): Date => {
  const now = new Date();
  // Obtenemos la cadena de fecha en hora colombiana
  const colombiaTimeStr = now.toLocaleString("en-US", { timeZone: "America/Bogota" });
  // Creamos un nuevo objeto fecha basado en esa cadena. 
  // El navegador interpretará esta cadena como "Local", lo cual está bien para nuestras comparaciones relativas.
  return new Date(colombiaTimeStr);
};

/**
 * Parsea una fecha (YYYY-MM-DD) y una hora (HH:MM o HH:MM:SS) 
 * y retorna un objeto Date que representa ese momento exacto en "Tiempo Colombia".
 * Evita conversiones de zona horaria automáticas del navegador.
 */
export const parseColombiaDeadline = (dateStr: string, timeStr?: string | null): Date => {
  // Si no hay fecha, retornamos "ahora" en tiempo Colombia
  if (!dateStr) return getColombiaDate();

  try {
    // Descomponer YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(num => parseInt(num, 10));
    
    let hours = 23;
    let minutes = 59;
    let seconds = 0;

    // Descomponer HH:MM:SS si existe
    if (timeStr) {
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10);
        if (parts.length >= 3) {
          seconds = parseInt(parts[2], 10);
        }
      }
    }

    // Construir la fecha usando el constructor local (año, mes-indexado-0, día, horas...)
    // Esto crea una fecha que "dice" tener la hora especificada en el reloj local.
    // Al comparar con getColombiaDate() (que también está "falsificada" a local), la comparación es correcta.
    return new Date(year, month - 1, day, hours, minutes, seconds);
  } catch (e) {
    console.error("Error parsing date/time:", dateStr, timeStr, e);
    return getColombiaDate(); // Fallback seguro
  }
};

// Deprecated or Aliased for compatibility
export const getLocalDate = () => {
  // Retorna la fecha actual en formato YYYY-MM-DD ajustada a Colombia
  const date = getColombiaDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateStr: string): Date => {
  return parseColombiaDeadline(dateStr, "00:00:00");
};