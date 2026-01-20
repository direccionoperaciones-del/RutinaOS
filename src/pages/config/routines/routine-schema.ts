import { z } from "zod";

export const routineSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  prioridad: z.enum(["baja", "media", "alta", "critica"]),
  frecuencia: z.enum(["diaria", "semanal", "quincenal", "mensual", "fechas_especificas"]),
  
  // Horarios
  hora_inicio: z.string(),
  hora_limite: z.string(),
  
  // Configuración Frecuencias
  dias_ejecucion: z.array(z.number()).default([]), // 0=Dom, 1=Lun...
  corte_1_limite: z.coerce.number().optional(), // Para Quincenal (1-15)
  corte_2_limite: z.coerce.number().optional(), // Para Quincenal (16-31)
  vencimiento_dia_mes: z.coerce.number().optional(), // Para Mensual (1-31)
  fechas_especificas: z.array(z.string()).max(5, "Máximo 5 fechas específicas").default([]),

  // Requisitos
  gps_obligatorio: z.boolean().default(false),
  fotos_obligatorias: z.boolean().default(false),
  min_fotos: z.coerce.number().min(0).default(0),
  requiere_inventario: z.boolean().default(false),
  activo: z.boolean().default(true),
  roles_ejecutores: z.array(z.string()).default(["administrador"]),
});

export type RoutineFormValues = z.infer<typeof routineSchema>;