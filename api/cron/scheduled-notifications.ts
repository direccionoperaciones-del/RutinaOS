import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // 1. Validar Método
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 2. Validar que viene de Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Inicializar Supabase (Usando variables de entorno de Vercel)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Server configuration error: Missing Supabase credentials.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. Buscar notificaciones programadas pendientes
    const now = new Date().toISOString();
    
    // Seleccionamos 'entity_id' porque 'notify-message' espera el ID del mensaje, no de la notificación
    const { data: pending, error } = await supabase
      .from('notifications')
      .select('id, entity_id') 
      .is('sent_at', null)
      .lte('scheduled_at', now)
      .eq('status', 'pending')
      .limit(50);

    if (error) throw error;

    let processed = 0;
    let failed = 0;

    // 5. Procesar cada notificación
    for (const notification of pending || []) {
      try {
        // Llamar a la Edge Function existente 'notify-message'
        const response = await fetch(
          `${supabaseUrl}/functions/v1/notify-message`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            // IMPORTANTE: Enviamos entity_id como message_id
            body: JSON.stringify({ message_id: notification.entity_id })
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        // Marcar como enviada
        await supabase
          .from('notifications')
          .update({ 
            sent_at: new Date().toISOString(),
            status: 'sent'
          })
          .eq('id', notification.id);

        processed++;

      } catch (err) {
        console.error(`Failed to send notification ${notification.id}:`, err);
        failed++;
        
        await supabase
          .from('notifications')
          .update({ status: 'failed' })
          .eq('id', notification.id);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed,
      failed,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}