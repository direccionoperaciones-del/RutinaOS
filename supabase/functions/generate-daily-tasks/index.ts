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

    // 1. Obtener parámetros (fecha objetivo, por defecto hoy)
    const { date } = await req.json().catch(() => ({ date: null }))
    const targetDate = date ? new Date(date) : new Date()
    const dayOfWeek = targetDate.getDay() // 0 = Domingo, 1 = Lunes...
    const dayOfMonth = targetDate.getDate()
    
    // Formato YYYY-MM-DD para la base de datos
    const dateStr = targetDate.toISOString().split('T')[0]

    console.log(`Generando tareas para: ${dateStr} (Dia semana: ${dayOfWeek})`)

    // 2. Obtener todas las asignaciones activas junto con su configuración de rutina
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
          fechas_especificas
        )
      `)
      .eq('estado', 'activa')
      .eq('routine_templates.activo', true)

    if (assignError) throw assignError

    const tasksToCreate = []

    // 3. Filtrar cuáles aplican para hoy
    for (const assignment of assignments) {
      const rutina = assignment.routine_templates
      let shouldGenerate = false

      if (!rutina) continue

      // Lógica de Frecuencias
      switch (rutina.frecuencia) {
        case 'diaria':
          // Aplica si dias_ejecucion está vacío (todos los días) o si incluye hoy
          if (!rutina.dias_ejecucion || rutina.dias_ejecucion.length === 0) {
            shouldGenerate = true
          } else if (rutina.dias_ejecucion.includes(dayOfWeek)) {
            shouldGenerate = true
          }
          break
        
        case 'semanal':
          // Solo si el día de la semana coincide
          if (rutina.dias_ejecucion && rutina.dias_ejecucion.includes(dayOfWeek)) {
            shouldGenerate = true
          }
          break

        case 'mensual':
           // Simplificado: Si es el día 1 del mes (o lógica más compleja futura)
           if (dayOfMonth === 1) shouldGenerate = true
           break

        // TODO: Implementar lógica quincenal y fechas específicas
      }

      if (shouldGenerate) {
        tasksToCreate.push({
          tenant_id: assignment.tenant_id,
          assignment_id: assignment.id,
          rutina_id: assignment.rutina_id,
          pdv_id: assignment.pdv_id,
          fecha_programada: dateStr,
          estado: 'pendiente',
          prioridad_snapshot: rutina.prioridad,
          hora_inicio_snapshot: rutina.hora_inicio,
          hora_limite_snapshot: rutina.hora_limite
        })
      }
    }

    // 4. Insertar masivamente (ignorar duplicados gracias a UNIQUE constraint)
    if (tasksToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('task_instances')
        .upsert(tasksToCreate, { 
          onConflict: 'assignment_id,fecha_programada',
          ignoreDuplicates: true 
        })
      
      if (insertError) throw insertError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Proceso finalizado. ${tasksToCreate.length} tareas procesadas para ${dateStr}.` 
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