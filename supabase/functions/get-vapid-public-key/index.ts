import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // IMPORTANTE: Debes configurar VAPID_PUBLIC_KEY en los secretos de Supabase
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')

    if (!publicKey) {
      throw new Error('VAPID_PUBLIC_KEY no está configurada en los secretos de Supabase')
    }

    return new Response(
      JSON.stringify({ publicKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})