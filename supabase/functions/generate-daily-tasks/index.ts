import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta (Faltan variables de entorno).')
    }

    // 1. Autenticación
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta cabecera de autorización.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '');
    let triggeredBy = 'unknown';
    let requesterTenantId: string | null = null;

    // Verificar si es CRON (Service Key) o Usuario (JWT)
    if (token === supabaseServiceKey) {
      triggeredBy = 'cron';
    } else {
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
      
      if (authErr || !user) {
        return new Response(JSON.stringify({ ok: false, error: 'Token inválido o expirado.' }), { status: 401, headers: corsHeaders })
      }

      const { data: profile } = await supabaseAuth.from('profiles').select('role, tenant_id').eq('id', user.id).single();
      
      if (profile?.role === 'director' || profile?.role === 'lider') {
        triggeredBy = `manual_${user.email}`;
        requesterTenantId = profile.tenant_id;
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'Permiso denegado. Solo directores/líderes.' }), { status: 403, headers: corsHeaders })
      }
    }

    // 2. Parseo del Body
    let body: any = {};
    try { 
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (e) {
      console.warn("Body vacío o inválido, usando valores por defecto.");
    }
    
    const manualDate = body.date;

    // Fecha objetivo (Hoy Colombia por defecto)
    const now = new Date();
    // Ajuste simple a UTC-5 (Colombia)
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const nowColombia = new Date(now.getTime() + colombiaOffset);
    const targetDate = manualDate || nowColombia.toISOString().split('T')[0];

    console.log(`[Motor] Iniciando generación para: ${targetDate} (Trigger: ${triggeredBy})`);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Crear registro de ejecución (Log)
    let runRecordId = null;
    // Solo creamos log global si es CRON, para manuales es opcional o se maneja diferente
    if (triggeredBy === 'cron') {
      const { data: runRecord } = await supabaseAdmin.from('task_generation_runs').upsert({
          fecha: targetDate,
          status: 'running',
          started_at: new Date().toISOString(),
          triggered_by: triggeredBy
        }, { onConflict: 'fecha' }).select().single();
      if (runRecord) runRecordId = runRecord.id;
    }

    // --- LÓGICA DE GENERACIÓN ---
    
    // Obtener Tenants activos
    let tenantQuery = supabaseAdmin.from('tenants').select('id').eq('activo', true);
    if (requesterTenantId) tenantQuery = tenantQuery.eq('id', requesterTenantId);
    
    const { data: tenants, error: tenantError } = await tenantQuery;
    
    if (tenantError) throw new Error(`Error consultando tenants: ${tenantError.message}`);
    if (!tenants || tenants.length === 0) throw new Error("No se encontraron organizaciones activas.");

    // Preparar fecha para cálculos
    const [y, m, d] = targetDate.split('-').map(Number);
    // Usamos UTC a mediodía para evitar problemas de timezone al obtener el día de la semana
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom, 1=Lun...
    const dayOfMonth = dateObj.getUTCDate();

    console.log(`[Motor] Fecha: ${targetDate}, DiaSemana: ${dayOfWeek}, DiaMes: ${dayOfMonth}`);

    let totalTasksCreated = 0;
    const logs: string[] = [];

    for (const tenant of tenants) {
      // A. Cargar Asignaciones Activas
      const { data: assignments, error: assignError } = await supabaseAdmin
        .from('routine_assignments')
        .select(`
          id, pdv_id, rutina_id, 
          routine_templates (
            id, nombre, frecuencia, dias_ejecucion, activo, prioridad, 
            hora_inicio, hora_limite, fechas_especificas, vencimiento_dia_mes,
            corte_1_inicio, corte_2_inicio
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('estado', 'activa');

      if (assignError) {
        logs.push(`Error cargando asignaciones Tenant ${tenant.id}: ${assignError.message}`);
        continue;
      }

      if (!assignments || assignments.length === 0) continue;

      // B. Cargar Responsables Vigentes
      const { data: responsibles } = await supabaseAdmin
        .from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('tenant_id', tenant.id)
        .eq('vigente', true);
        
      const respMap = new Map();
      responsibles?.forEach(r => respMap.set(r.pdv_id, r.user_id));

      // C. Cargar Ausencias del Día
      const { data: absences } = await supabaseAdmin
        .from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tenant.id)
        .lte('fecha_desde', targetDate)
        .gte('fecha_hasta', targetDate);
        
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      const tasksToInsert: any[] = [];

      for (const assign of assignments) {
        const r = assign.routine_templates;
        // Validación defensiva: si la rutina fue borrada o es nula
        if (!r || !r.activo) continue;

        let shouldRun = false;

        // Lógica de Frecuencia
        try {
          if (r.frecuencia === 'diaria') {
             // Si dias_ejecucion es null o vacío, asumimos todos los días. Si tiene datos, validamos.
             if (!r.dias_ejecucion || r.dias_ejecucion.length === 0 || r.dias_ejecucion.includes(dayOfWeek)) {
               shouldRun = true;
             }
          }
          else if (r.frecuencia === 'semanal') {
             if (r.dias_ejecucion?.includes(dayOfWeek)) shouldRun = true;
          }
          else if (r.frecuencia === 'mensual') {
             // Ejecutar el día 1 del mes siempre para abrir la tarea
             if (dayOfMonth === 1) shouldRun = true;
          }
          else if (r.frecuencia === 'quincenal') {
             // Ejecutar días de corte (usualmente 1 y 16)
             const corte1 = r.corte_1_inicio || 1;
             const corte2 = r.corte_2_inicio || 16;
             if (dayOfMonth === corte1 || dayOfMonth === corte2) shouldRun = true;
          }
          else if (r.frecuencia === 'fechas_especificas') {
             if (r.fechas_especificas?.includes(targetDate)) shouldRun = true;
          }
        } catch (err) {
          console.error(`Error evaluando rutina ${r.nombre}:`, err);
          continue;
        }

        if (!shouldRun) continue;

        // Determinar responsable
        let userId = respMap.get(assign.pdv_id);
        
        if (!userId) {
          // Loguear warning pero no fallar todo el proceso
          // logs.push(`PDV sin responsable para rutina ${r.nombre}`);
          continue; 
        }

        // Manejo de Ausencias
        const absence = absMap.get(userId);
        if (absence) {
          if (absence.politica === 'omitir') {
            continue; // No generar tarea
          }
          if (absence.politica === 'reasignar' && absence.receptor_id) {
            userId = absence.receptor_id; // Reasignar
          }
        }

        tasksToInsert.push({
          tenant_id: tenant.id,
          assignment_id: assign.id,
          rutina_id: assign.rutina_id,
          pdv_id: assign.pdv_id,
          responsable_id: userId,
          fecha_programada: targetDate,
          estado: 'pendiente',
          prioridad_snapshot: r.prioridad,
          hora_inicio_snapshot: r.hora_inicio || '08:00',
          hora_limite_snapshot: r.hora_limite || '23:59',
          created_at: new Date().toISOString()
        });
      }

      // Insertar en lote (Bulk Insert) para este tenant
      if (tasksToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insertError) {
          logs.push(`Error insertando tareas Tenant ${tenant.id}: ${insertError.message}`);
        } else {
          totalTasksCreated += tasksToInsert.length;
        }
      }
    }

    // Actualizar log si existe
    if (runRecordId) {
      await supabaseAdmin.from('task_generation_runs').update({
          status: 'success', 
          finished_at: new Date().toISOString(), 
          tasks_created: totalTasksCreated, 
          error_message: logs.length > 0 ? logs.join('; ') : null
      }).eq('id', runRecordId);
    }

    console.log(`[Motor] Finalizado. Creadas: ${totalTasksCreated}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Proceso finalizado. Tareas creadas: ${totalTasksCreated}`,
        generated: totalTasksCreated, 
        date: targetDate,
        logs: logs 
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("[Motor Error Critical]", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || "Error interno crítico en el motor.",
        details: error.toString()
      }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})