/**
 * LeadFlow AI — Cloudflare Worker Error Telemetry Receiver
 * Deploy: wrangler publish
 *
 * Receives POST requests from the extension's reportErrorTelemetry() function.
 * Logs errors to Cloudflare's native console + optionally stores to KV.
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Only accept POST to /report
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    try {
      const body = await request.json();

      // Validate required fields
      const context   = String(body?.context   || "unknown").slice(0, 100);
      const error     = String(body?.error     || "").slice(0, 500);
      const stack     = String(body?.stack     || "").slice(0, 1000);
      const version   = String(body?.version   || "unknown").slice(0, 20);
      const timestamp = String(body?.timestamp || new Date().toISOString()).slice(0, 30);

      const record = { context, error, stack, version, timestamp, ip: request.headers.get("CF-Connecting-IP") || "" };

      // Log to Cloudflare's structured log console
      console.log("[LeadFlow AI Telemetry]", JSON.stringify(record));

      // Optional: Store in KV if bound (add KV binding named TELEMETRY_KV in wrangler.toml)
      if (env.TELEMETRY_KV) {
        const key = `error:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        ctx.waitUntil(env.TELEMETRY_KV.put(key, JSON.stringify(record), { expirationTtl: 2592000 })); // 30 days
      }

      return new Response(JSON.stringify({ ok: true, received: true }), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
