import { parseColombiaDeadline } from "@/lib/utils";

/**
 * Calcula la fecha límite exacta de una tarea basándose en su configuración.
 * Soporta lógica para frecuencias Diaria, Semanal, Quincenal y Mensual.
 */
export const calculateTaskDeadline = (task: any): Date => {
  if (!task) return new Date();

  const routine = task.routine_templates || {};
  const programadaStr = task.fecha_programada; // YYYY-MM-DD
  const [year, month, day] = programadaStr.split('-').map(Number);
  
  let deadlineDateStr = programadaStr;

  // Lógica de extensión de fecha según frecuencia
  if (routine.frecuencia === 'mensual' && routine.vencimiento_dia_mes) {
    // El vencimiento es el día X del MISMO mes de programación
    // Cuidado: Si el día de vencimiento es menor al día actual (ej: config mal hecha), se asume fin de mes.
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const targetDay = Math.min(routine.vencimiento_dia_mes, lastDayOfMonth);
    
    // Formato YYYY-MM-DD
    deadlineDateStr = `${year}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  
  } else if (routine.frecuencia === 'quincenal') {
    // Corte 1: 1-15 | Corte 2: 16-Fin
    if (day <= 15) {
      // Corte 1 -> Vence el día límite configurado o el 15
      const limit = routine.corte_1_limite || 15;
      deadlineDateStr = `${year}-${String(month).padStart(2, '0')}-${String(limit).padStart(2, '0')}`;
    } else {
      // Corte 2 -> Vence el día límite configurado o fin de mes
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const limit = routine.corte_2_limite ? Math.min(routine.corte_2_limite, lastDayOfMonth) : lastDayOfMonth;
      deadlineDateStr = `${year}-${String(month).padStart(2, '0')}-${String(limit).padStart(2, '0')}`;
    }
  }

  // Hora límite: Prioridad Snapshot > Rutina > Fin del día
  let timeStr = task.hora_limite_snapshot;
  if (!timeStr && routine.hora_limite) {
    timeStr = routine.hora_limite;
  }
  if (!timeStr) {
    timeStr = '23:59:00';
  }

  return parseColombiaDeadline(deadlineDateStr, timeStr);
};