/**
 * Calcula la fecha y hora límite real de una tarea basándose en su frecuencia y configuración.
 * 
 * - Diaria/Semanal/FechasEsp: Usa fecha_programada + hora_limite
 * - Mensual: Usa mes de fecha_programada + dia_vencimiento
 * - Quincenal: Usa corte 1 o corte 2 según fecha_programada
 */
export function calculateTaskDeadline(task: any): Date {
  if (!task || !task.fecha_programada) return new Date();

  // Parsear fecha base (YYYY-MM-DD) asumiendo hora local para evitar saltos de día por UTC
  const [y, m, d] = task.fecha_programada.split('-').map(Number);
  const baseDate = new Date(y, m - 1, d); // Mes es 0-indexado
  
  const timeStr = task.hora_limite_snapshot || '23:59:00';
  const rutina = task.routine_templates;

  // Función auxiliar para parsear HH:MM:SS
  const setTime = (dateTarget: Date, timeString: string) => {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    // Usamos ?? en lugar de || para permitir que 0 sea un valor válido
    dateTarget.setHours(hours ?? 23, minutes ?? 59, seconds ?? 0);
    return dateTarget;
  };

  // Si no hay datos de rutina, fallback a la fecha programada simple
  if (!rutina) {
     const deadline = new Date(baseDate);
     return setTime(deadline, timeStr);
  }

  let targetDay = baseDate.getDate();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); 

  // LÓGICA MENSUAL
  if (rutina.frecuencia === 'mensual') {
     targetDay = rutina.vencimiento_dia_mes || 31;
     
     // Ajustar si el mes tiene menos días (ej: 31 en Febrero -> 28/29)
     const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
     if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
  }
  
  // LÓGICA QUINCENAL
  else if (rutina.frecuencia === 'quincenal') {
     // El generador fija fecha_programada al 01 o al 16.
     // Si es primera quincena (dia <= 15)
     if (baseDate.getDate() <= 15) {
        targetDay = rutina.corte_1_limite || 15;
     } else {
        // Segunda quincena
        targetDay = rutina.corte_2_limite || 30;
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        if (targetDay > lastDayOfMonth) targetDay = lastDayOfMonth;
     }
  }

  // Construir fecha final combinada
  const deadline = new Date(year, month, targetDay);
  return setTime(deadline, timeStr);
}