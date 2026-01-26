import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine formula to calculate distance in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { taskId, gpsData, inventory, comments } = await req.json()

    if (!taskId) {
        return new Response(JSON.stringify({ error: 'Task ID required' }), { status: 400, headers: corsHeaders })
    }

    // 2. Fetch Task Context (Routine Rules + PDV Location)
    const { data: task, error: taskError } = await supabase
      .from('task_instances')
      .select(`
        *,
        routine_templates (gps_obligatorio),
        pdv (latitud, longitud, radio_gps)
      `)
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: corsHeaders })
    }

    const routine = task.routine_templates
    const pdv = task.pdv

    // 3. Security Check: GPS Validation
    let gps_en_rango = false; 
    
    if (routine.gps_obligatorio) {
        if (!gpsData || !gpsData.lat || !gpsData.lng) {
            return new Response(JSON.stringify({ error: 'GPS coordinates required for this task.' }), { status: 400, headers: corsHeaders })
        }
        
        if (!pdv.latitud || !pdv.longitud) {
             return new Response(JSON.stringify({ error: 'PDV location not configured.' }), { status: 400, headers: corsHeaders })
        }

        console.log(`[complete-task] Validating GPS for User ${user.id} at Task ${taskId}`);
        const distance = calculateDistance(gpsData.lat, gpsData.lng, pdv.latitud, pdv.longitud)
        const maxRadio = pdv.radio_gps || 100

        if (distance > maxRadio) {
             console.warn(`[complete-task] GPS Reject: Distance ${Math.round(distance)}m > ${maxRadio}m`);
             return new Response(JSON.stringify({ 
                 error: `Ubicación fuera de rango (${Math.round(distance)}m). Máximo permitido: ${maxRadio}m.` 
             }), { status: 400, headers: corsHeaders })
        }
        
        gps_en_rango = true;
    } else {
        // Optional validation for non-mandatory tasks
        if (gpsData?.lat && gpsData?.lng && pdv.latitud && pdv.longitud) {
             const distance = calculateDistance(gpsData.lat, gpsData.lng, pdv.latitud, pdv.longitud)
             gps_en_rango = distance <= (pdv.radio_gps || 100);
        }
    }

    // 4. Calculate Status (Server-side Deadline Check)
    // Convert deadline to UTC for comparison (Colombia is UTC-5)
    const deadlineStr = `${task.fecha_programada}T${task.hora_limite_snapshot || '23:59:59'}`;
    const [dDate, dTime] = deadlineStr.split('T');
    const [dYear, dMonth, dDay] = dDate.split('-').map(Number);
    const [dHour, dMin, dSec] = dTime.split(':').map(Number);
    
    // Deadline Date Object (Adjusted for UTC-5)
    const deadlineDate = new Date(Date.UTC(dYear, dMonth - 1, dDay, dHour + 5, dMin, dSec || 0));
    const nowUTC = new Date();
    
    let newStatus = task.estado;
    const isTaskPending = task.estado === 'pendiente' || task.estado === 'en_proceso';
    
    if (isTaskPending) {
        newStatus = nowUTC.getTime() > deadlineDate.getTime() ? 'completada_vencida' : 'completada_a_tiempo';
    }

    // 5. Perform Database Updates
    // 5.1 Inventory
    if (inventory && inventory.length > 0) {
        await supabase.from('inventory_submission_rows').delete().eq('task_id', taskId)
        
        const rows = inventory.map((r: any) => ({
            task_id: taskId,
            producto_id: r.producto_id,
            esperado: r.esperado,
            fisico: r.fisico
        }))
        const { error: invError } = await supabase.from('inventory_submission_rows').insert(rows)
        if (invError) throw new Error(`Inventory error: ${invError.message}`)
    }

    // 5.2 Task Instance
    const nextAuditStatus = task.audit_status === 'rechazado' ? 'pendiente' : task.audit_status;
    
    const updatePayload = {
        estado: newStatus,
        completado_at: isTaskPending ? new Date().toISOString() : task.completado_at,
        completado_por: task.completado_por || user.id,
        gps_latitud: gpsData?.lat,
        gps_longitud: gpsData?.lng,
        gps_en_rango: gps_en_rango,
        comentario: comments,
        audit_status: nextAuditStatus
    }

    const { error: updateError } = await supabase
        .from('task_instances')
        .update(updatePayload)
        .eq('id', taskId)

    if (updateError) throw new Error(`Update error: ${updateError.message}`)

    return new Response(JSON.stringify({ success: true, status: newStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error(`[complete-task] Critical Error:`, error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})