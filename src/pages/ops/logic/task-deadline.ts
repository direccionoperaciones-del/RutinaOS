import { parseColombiaDeadline } from "@/lib/utils";

/**
 * Calcula la fecha límite exacta de una tarea basándose en su configuración.
 * Asegura que la interpretación de la hora sea siempre COT (Colombia Time).
 */
export const calculateTaskDeadline = (task: any): Date => {
  if (!task) return new Date();

  // Prioridad 1: Snapshot de la hora límite guardado al crear la tarea
  // Prioridad 2: Configuración actual de la rutina (si existe)
  // Fallback: Final del día (23:59)
  let timeStr = task.hora_limite_snapshot;
  
  if (!timeStr && task.routine_templates?.hora_limite) {
    timeStr = task.routine_templates.hora_limite;
  }
  
  if (!timeStr) {
    timeStr = '23:59:00';
  }

  // Usar la función robusta que no depende del timezone del navegador
  return parseColombiaDeadline(task.fecha_programada, timeStr);
};