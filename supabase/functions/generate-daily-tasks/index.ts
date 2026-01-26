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

    // 1. OBTENER FECHA OBJETIVO (FUERZADA A COLOMBIA GMT-5)
    const { date } = await req.json().catch(() => ({ date: null }))
    
    let targetDate: Date;
    
    if (date) {
      // Si viene manual (YYYY-MM-DD), asumimos que esa es la fecha Colombia deseada
      // Le agregamos T05:00:00Z para que al restar 5 sea el día correcto, 
      // o simplemente la tratamos como string.
      // Mejor: Parseamos el string y trabajamos con sus componentes.
      const [y, m, d] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(y, m - 1, d, 5, 0, 0)); // 5 AM UTC = Media noche Col? No, simplifiquemos.
    } else {
      // Automático: Obtener hora actual UTC
      const now = new Date();
      // Restar 5 horas (5 * 60 * 60 * 1000 ms) para obtener "hora colombia" representada en un objeto Date
      const colombiaOffset = -5;
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      targetDate = new Date(utc + (3600000 * colombiaOffset));
    }

    // Extraer componentes de la fecha COLOMBIA
    const dayOfWeek = targetDate.getDay() // 0 = Domingo
    const dayOfMonth = targetDate.getDate()
    const year = targetDate.getFullYear();
    const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(targetDate.getDate()).padStart(2, '0');
    
    // Fecha String Oficial para la BD (YYYY-MM-DD)
    const dateStr = date || `${year}-${monthStr}-${dayStr}`;

    console.log(`🇨🇴 Generando tareas para Fecha Colombia: ${dateStr} (Dia semana: ${dayOfWeek}, Dia mes: ${dayOfMonth})`)

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
           const limitDay = rutina.vencimiento_dia_mes || 31;
           // Generar si hoy (en Colombia) es <= al día de vencimiento
           if (dayOfMonth <= limitDay) {
             shouldGenerate = true;
             // Fijamos fecha al 01 para unicidad
             calculatedDate = `${year}-${monthStr}-01`;
           }
           break
           
        case 'quincenal':
           // Corte 1
           if (dayOfMonth <= (rutina.corte_1_limite || 15)) {
             shouldGenerate = true;
             calculatedDate = `${year}-${monthStr}-01`;
           }
           // Corte 2
           else if (dayOfMonth >= 16) {
             shouldGenerate = true;
             calculatedDate = `${year}-${monthStr}-16`;
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
          fecha_programada: calculatedDate,
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
          onConflict: 'assignment_id,fecha_programada',
          ignoreDuplicates: true 
        })
      
      if (insertError) throw insertError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Proceso finalizado. ${tasksToCreate.length} tareas procesadas para ${dateStr} (GMT-5).` 
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