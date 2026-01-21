import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Obtener parámetros
    const { date } = await req.json().catch(() => ({ date: null }))
    const targetDate = date ? new Date(date) : new Date()
    const dayOfWeek = targetDate.getDay() // 0 = Domingo
    const dayOfMonth = targetDate.getDate()
    
    // Formato YYYY-MM-DD
    const dateStr = targetDate.toISOString().split('T')[0]

    console.log(`Generando tareas para: ${dateStr} (Dia mes: ${dayOfMonth})`)

    // 2. Obtener asignaciones activas con configuración completa de rutina
    const { data: assignments, error: assignError } = await supabase
      .from('routine_assignments')
      .select(`
        id,
        tenant_id,
        pdv_id,
        rutina_id,
        routine_templates (
          id,
          frecuencia,
          dias_ejecucion,
          prioridad,
          hora_inicio,
          hora_limite,
          fechas_especificas,
          vencimiento_dia_mes,
          corte_1_limite,
          corte_2_limite
        )
      `)
      .eq('estado', 'activa')
      .eq('routine_templates.activo', true)

    if (assignError) throw assignError

    const tasksToCreate = []

    // 3. Filtrar
    for (const assignment of assignments) {
      const rutina = assignment.routine_templates
      let shouldGenerate = false
      let calculatedDate = dateStr; // Por defecto es hoy

      if (!rutina) continue

      switch (rutina.frecuencia) {
        case 'diaria':
          if (!rutina.dias_ejecucion || rutina.dias_ejecucion.length === 0) {
            shouldGenerate = true
          } else if (rutina.dias_ejecucion.includes(dayOfWeek)) {
            shouldGenerate = true
          }
          break
        
        case 'semanal':
          if (rutina.dias_ejecucion && rutina.dias_ejecucion.includes(dayOfWeek)) {
            shouldGenerate = true
          }
          break

        case 'mensual':
           // LOGICA MEJORADA:
           // Generar si hoy es <= al día de vencimiento.
           // Ej: Vence el 25. Si hoy es 1, 10 o 21, intentamos generar.
           // La BD bloqueará duplicados gracias al constraint UNIQUE(assignment_id, fecha_programada).
           // PERO, para evitar duplicados diarios (tarea dia 21, tarea dia 22...), 
           // fijamos la "fecha_programada" al día 1 del mes para tareas mensuales.
           // Así, si ejecutas el script el día 21, intentará crear la tarea con fecha 01. Si ya existe, no hace nada.
           
           const limitDay = rutina.vencimiento_dia_mes || 31;
           if (dayOfMonth <= limitDay) {
             shouldGenerate = true;
             // Fijamos fecha al día 1 del mes actual para mantener unicidad mensual
             const year = targetDate.getFullYear();
             const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
             calculatedDate = `${year}-${month}-01`;
           }
           break
           
        case 'quincenal':
           // Corte 1 (Días 1-15)
           if (dayOfMonth <= (rutina.corte_1_limite || 15)) {
             shouldGenerate = true;
             const year = targetDate.getFullYear();
             const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
             calculatedDate = `${year}-${month}-01`; // Fijar al inicio quincena 1
           }
           // Corte 2 (Días 16-Fin)
           else if (dayOfMonth >= 16 && dayOfMonth <= 31) {
             shouldGenerate = true;
             const year = targetDate.getFullYear();
             const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
             calculatedDate = `${year}-${month}-16`; // Fijar al inicio quincena 2
           }
           break

        case 'fechas_especificas':
           if (rutina.fechas_especificas && rutina.fechas_especificas.includes(dateStr)) {
             shouldGenerate = true
           }
           break
      }

      if (shouldGenerate) {
        tasksToCreate.push({
          tenant_id: assignment.tenant_id,
          assignment_id: assignment.id,
          rutina_id: assignment.rutina_id,
          pdv_id: assignment.pdv_id,
          fecha_programada: calculatedDate, // Usar fecha calculada (ej: 1ro del mes)
          estado: 'pendiente',
          prioridad_snapshot: rutina.prioridad,
          hora_inicio_snapshot: rutina.hora_inicio,
          hora_limite_snapshot: rutina.hora_limite
        })
      }
    }

    // 4. Insertar masivamente
    if (tasksToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('task_instances')
        .upsert(tasksToCreate, { 
          onConflict: 'assignment_id,fecha_programada', // Clave compuesta vital
          ignoreDuplicates: true 
        })
      
      if (insertError) throw insertError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Proceso finalizado. ${tasksToCreate.length} intenciones de tarea procesadas.` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})