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

    // --- 1. DETERMINAR FECHA (COLOMBIA GMT-5) ---
    const { date } = await req.json().catch(() => ({ date: null }))
    
    let targetDate: Date;
    
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      // Creamos fecha a mediodía UTC para evitar bordes, asumiendo que el string ya es la fecha deseada
      targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    } else {
      // Automático: Ajuste -5 horas desde UTC actual
      const now = new Date();
      const colombiaOffset = -5;
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      targetDate = new Date(utc + (3600000 * colombiaOffset));
    }

    const dayOfWeek = targetDate.getDay() // 0 = Domingo
    const dayOfMonth = targetDate.getDate()
    const year = targetDate.getFullYear();
    const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = date || `${year}-${monthStr}-${dayStr}`; // YYYY-MM-DD

    console.log(`🇨🇴 Motor iniciando para: ${dateStr} (Dia: ${dayOfWeek})`)

    // --- 2. CARGAR DATOS MAESTROS ---
    
    // A. Rutinas Asignadas (Qué hacer)
    const { data: assignments, error: assignError } = await supabase
      .from('routine_assignments')
      .select(`
        id, tenant_id, pdv_id, rutina_id,
        routine_templates (
          id, frecuencia, dias_ejecucion, prioridad, hora_inicio, hora_limite,
          fechas_especificas, vencimiento_dia_mes, corte_1_limite, corte_2_limite, activo
        )
      `)
      .eq('estado', 'activa')
      .eq('routine_templates.activo', true);

    if (assignError) throw new Error(`Error cargando rutinas: ${assignError.message}`);

    // B. Responsables de PDV (Quién lo hace)
    const { data: pdvResponsibles, error: pdvError } = await supabase
      .from('pdv_assignments')
      .select('pdv_id, user_id')
      .eq('vigente', true);
    
    if (pdvError) throw new Error(`Error cargando responsables: ${pdvError.message}`);

    // Mapa rápido: PDV_ID -> USER_ID
    const responsibleMap = new Map();
    pdvResponsibles?.forEach(p => responsibleMap.set(p.pdv_id, p.user_id));

    // C. Ausencias / Novedades para la fecha (Está disponible?)
    const { data: absences, error: absError } = await supabase
      .from('user_absences')
      .select('user_id, politica, receptor_id')
      .lte('fecha_desde', dateStr)
      .gte('fecha_hasta', dateStr);

    if (absError) throw new Error(`Error cargando ausencias: ${absError.message}`);

    // Mapa: USER_ID -> { politica, receptor }
    const absenceMap = new Map();
    absences?.forEach(a => absenceMap.set(a.user_id, a));

    // D. Excepciones de Rutina (Cancelaciones específicas para hoy)
    const { data: exceptions, error: excError } = await supabase
      .from('routine_assignment_exceptions')
      .select('assignment_id')
      .eq('fecha', dateStr);
    
    if (excError) throw new Error(`Error cargando excepciones: ${excError.message}`);
    
    const exceptionSet = new Set(exceptions?.map(e => e.assignment_id));

    // --- 3. PROCESAMIENTO ---
    
    const tasksToCreate = [];
    const logs = [];

    for (const assignment of assignments) {
      // Filtro 1: Excepción manual para hoy
      if (exceptionSet.has(assignment.id)) continue;

      const rutina = assignment.routine_templates;
      if (!rutina) continue;

      // Filtro 2: Frecuencia (¿Toca hoy?)
      let shouldGenerate = false;
      let calculatedDate = dateStr;

      switch (rutina.frecuencia) {
        case 'diaria':
          if (!rutina.dias_ejecucion?.length || rutina.dias_ejecucion.includes(dayOfWeek)) shouldGenerate = true;
          break;
        case 'semanal':
          if (rutina.dias_ejecucion?.includes(dayOfWeek)) shouldGenerate = true;
          break;
        case 'mensual':
           if (dayOfMonth <= (rutina.vencimiento_dia_mes || 31)) {
             shouldGenerate = true;
             calculatedDate = `${year}-${monthStr}-01`; // Agrupar mensual al día 1
           }
           break;
        case 'quincenal':
           if (dayOfMonth <= (rutina.corte_1_limite || 15)) {
             shouldGenerate = true;
             calculatedDate = `${year}-${monthStr}-01`;
           } else if (dayOfMonth >= 16) {
             shouldGenerate = true;
             calculatedDate = `${year}-${monthStr}-16`;
           }
           break;
        case 'fechas_especificas':
           if (rutina.fechas_especificas?.includes(dateStr)) shouldGenerate = true;
           break;
      }

      if (!shouldGenerate) continue;

      // Filtro 3: Determinar Responsable
      let responsibleId = responsibleMap.get(assignment.pdv_id);

      if (!responsibleId) {
        logs.push(`⚠️ PDV ${assignment.pdv_id} sin responsable. Tarea omitida.`);
        continue;
      }

      // Filtro 4: Verificar Ausencia del Responsable
      const absence = absenceMap.get(responsibleId);
      if (absence) {
        if (absence.politica === 'omitir') {
          logs.push(`ℹ️ Usuario ${responsibleId} ausente (Omitir). Tarea omitida.`);
          continue;
        } else if (absence.politica === 'reasignar' && absence.receptor_id) {
          logs.push(`🔄 Reasignando tarea de ${responsibleId} a ${absence.receptor_id}.`);
          responsibleId = absence.receptor_id;
        }
      }

      // --- PREPARAR INSERT ---
      tasksToCreate.push({
        tenant_id: assignment.tenant_id,
        assignment_id: assignment.id,
        rutina_id: assignment.rutina_id,
        pdv_id: assignment.pdv_id,
        responsable_id: responsibleId, // ¡CRÍTICO: AHORA SÍ SE ASIGNA!
        fecha_programada: calculatedDate,
        estado: 'pendiente',
        prioridad_snapshot: rutina.prioridad,
        hora_inicio_snapshot: rutina.hora_inicio,
        hora_limite_snapshot: rutina.hora_limite
      });
    }

    // --- 4. GUARDAR EN BD ---
    if (tasksToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('task_instances')
        .upsert(tasksToCreate, { 
          onConflict: 'assignment_id,fecha_programada',
          ignoreDuplicates: true 
        });
      
      if (insertError) throw insertError;
    }

    // --- 5. RESULTADO ---
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Generadas ${tasksToCreate.length} tareas para el ${dateStr}.`,
        details: logs 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Critical Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})