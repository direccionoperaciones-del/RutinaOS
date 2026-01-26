import { parseLocalDate } from "@/lib/utils";

/**
 * Calcula la fecha y hora límite real de una tarea.
 * Retorna un objeto Date nativo que representa ese momento.
 */
export function calculateTaskDeadline(task: any): Date {
  if (!task || !task.fecha_programada) return new Date();

  // 1. Obtenemos la fecha base (00:00:00 del día programado)
  const baseDate = parseLocalDate(task.fecha_programada);
  
  const timeStr = task.hora_limite_snapshot || '23:59:00';
  const rutina = task.routine_templates;

  let year = baseDate.getFullYear();
  let month = baseDate.getMonth();
  let targetDay = baseDate.getDate();

  // Lógica de fechas especiales (Mensual/Quincenal)
  if (rutina) {
    if (rutina.frecuencia === 'mensual') {
       targetDay = rutina.vencimiento_dia_mes || 31;
       // Ajuste fin de mes
       const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
       if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
    }
    else if (rutina.frecuencia === 'quincenal') {
       // Si la fecha programada es <= 15, es primer corte
       if (baseDate.getDate() <= 15) {
          targetDay = rutina.corte_1_limite || 15;
       } else {
          targetDay = rutina.corte_2_limite || 30;
          const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
          if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
       }
    }
  }

  // 2. Construir la fecha límite
  const deadline = new Date(year, month, targetDay);
  
  // 3. Establecer la hora
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  deadline.setHours(hours ?? 23, minutes ?? 59, seconds ?? 0, 0);

  return deadline;
}