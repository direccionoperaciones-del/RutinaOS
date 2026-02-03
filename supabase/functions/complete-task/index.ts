import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';

    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized');
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const { taskId, gpsData, inventory, comments } = await req.json();
    if (!taskId) throw new Error('Task ID required');

    // 2. Data Fetch
    const { data: task } = await supabase
      .from('task_instances')
      .select(`*, routine_templates(*), pdv(*)`)
      .eq('id', taskId)
      .single();

    if (!task) throw new Error('Task not found');

    const routine = task.routine_templates;
    const pdv = task.pdv;

    // 3. GPS Validation
    let gps_en_rango = false;
    if (routine.gps_obligatorio) {
      if (!gpsData?.lat || !gpsData?.lng) throw new Error('GPS coordinates required.');
      if (!pdv.latitud || !pdv.longitud) throw new Error('PDV location not configured.');
      
      const dist = calculateDistance(gpsData.lat, gpsData.lng, pdv.latitud, pdv.longitud);
      const max = pdv.radio_gps || 100;
      if (dist > max) throw new Error(`Ubicación fuera de rango (${Math.round(dist)}m). Máximo: ${max}m.`);
      gps_en_rango = true;
    } else if (gpsData?.lat && pdv.latitud) {
      const dist = calculateDistance(gpsData.lat, gpsData.lng, pdv.latitud, pdv.longitud);
      gps_en_rango = dist <= (pdv.radio_gps || 100);
    }

    // 4. Status Calculation (Advanced Date Logic)
    let newStatus = task.estado;
    if (task.estado === 'pendiente' || task.estado === 'en_proceso') {
      // Calcular fecha límite REAL (considerando mensual/quincenal)
      let deadlineStr = task.fecha_programada; // Base YYYY-MM-DD
      const [y, m, d] = deadlineStr.split('-').map(Number);

      if (routine.frecuencia === 'mensual' && routine.vencimiento_dia_mes) {
        const lastDay = new Date(y, m, 0).getDate();
        const dayLimit = Math.min(routine.vencimiento_dia_mes, lastDay);
        deadlineStr = `${y}-${String(m).padStart(2,'0')}-${String(dayLimit).padStart(2,'0')}`;
      } 
      else if (routine.frecuencia === 'quincenal') {
        if (d <= 15) {
           const limit = routine.corte_1_limite || 15;
           deadlineStr = `${y}-${String(m).padStart(2,'0')}-${String(limit).padStart(2,'0')}`;
        } else {
           const lastDay = new Date(y, m, 0).getDate();
           const limit = routine.corte_2_limite ? Math.min(routine.corte_2_limite, lastDay) : lastDay;
           deadlineStr = `${y}-${String(m).padStart(2,'0')}-${String(limit).padStart(2,'0')}`;
        }
      }

      // Construir objeto Date Deadline en UTC (para comparar)
      const timeLimit = task.hora_limite_snapshot || '23:59:59';
      const deadlineDate = new Date(`${deadlineStr}T${timeLimit}-05:00`); // Asumimos -05:00 (Colombia) para simplificar comparación servidor
      
      // Hora actual (Servidor Deno suele estar en UTC, ajustamos offset)
      const now = new Date();
      
      // Comparación simple de timestamps
      newStatus = now.getTime() > deadlineDate.getTime() ? 'completada_vencida' : 'completada_a_tiempo';
    }

    // 5. Inventory
    if (inventory?.length > 0) {
      await supabase.from('inventory_submission_rows').delete().eq('task_id', taskId);
      const rows = inventory.map((r: any) => ({
        task_id: taskId,
        producto_id: r.producto_id,
        esperado: Number(r.esperado || 0),
        fisico: Number(r.fisico || 0)
      }));
      await supabase.from('inventory_submission_rows').insert(rows);
    }

    // 6. Audit
    const requiresAudit = routine.requiere_auditoria ?? true;
    let auditStatus = task.audit_status === 'rechazado' ? 'pendiente' : (requiresAudit ? 'pendiente' : 'aprobado');
    let auditAt = (!requiresAudit && auditStatus === 'aprobado') ? new Date().toISOString() : task.audit_at;
    let auditMsg = (!requiresAudit && auditStatus === 'aprobado') ? 'Aprobación automática' : task.audit_notas;

    // 7. Update
    await supabase.from('task_instances').update({
      estado: newStatus,
      completado_at: new Date().toISOString(),
      completado_por: user.id,
      gps_latitud: gpsData?.lat,
      gps_longitud: gpsData?.lng,
      gps_en_rango: gps_en_rango,
      comentario: comments,
      audit_status: auditStatus,
      audit_at: auditAt,
      audit_notas: auditMsg,
      submission_ip: clientIp,
      gps_accuracy: gpsData?.accuracy
    }).eq('id', taskId);

    return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})