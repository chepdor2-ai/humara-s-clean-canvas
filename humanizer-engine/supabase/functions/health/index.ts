import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiUrl = Deno.env.get('NEXT_API_URL') || 'http://localhost:3000'
    const response = await fetch(`${apiUrl}/api/health`)
    const data = await response.json()

    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      api: data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      status: 'unhealthy',
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
