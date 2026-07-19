import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  const availability = {
    openai: !!openaiKey && openaiKey.length > 0,
    anthropic: !!anthropicKey && anthropicKey.length > 0,
  };

  return new Response(JSON.stringify(availability), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
