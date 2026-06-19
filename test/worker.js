// ============================================================
// cloudflare-worker.js
// Deploy this on Cloudflare Workers (free plan works)
// It acts as a secure proxy between your GitHub Pages site
// and the Djubo API — keeping your access token hidden.
// ============================================================

// ─────────────────────────────────────────────────────────
// CONFIG — store secrets as Cloudflare Worker Environment Variables
// Set these in: Workers > Your Worker > Settings > Variables
// ─────────────────────────────────────────────────────────
const ACCESS_TOKEN    = "13e47bc8-9d8f-4d4a-9804-ab87cff3080e";
const PARTNER_ID      = "407";
const PARTNER_HOTEL   = "407";      // ⚠️ Confirm with Djubo support
const API_VERSION     = "9";
const SOURCE_ID       = "100";
const SUB_SOURCE_ID   = "1001";
const DJUBO_BASE      = "https://www.secure-booking-engine.com/djubo-direct";
// Sandbox: const DJUBO_BASE = "https://transit.djubo.in/djubo-direct";

// ─────────────────────────────────────────────────────────
// ALLOWED ORIGINS — add your GitHub Pages URL here
// Format: https://YOUR-USERNAME.github.io
// ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://YOUR-USERNAME.github.io",
  "http://localhost:3000",   // for local testing
  "http://127.0.0.1:5500",  // for VS Code Live Server
];

// ─────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\//, ""); // strip leading slash

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, corsHeaders);
  }

  // Route to correct Djubo endpoint
  switch (path) {
    case "availability":
      return proxyAvailability(body, corsHeaders);
    case "guestPopulate":
      return proxyGuestPopulate(body, corsHeaders);
    case "bookingSubmit":
      return proxyBookingSubmit(body, corsHeaders);
    default:
      return errorResponse("Unknown endpoint: " + path, 404, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────
// PROXY: /availability
// ─────────────────────────────────────────────────────────
async function proxyAvailability(body, corsHeaders) {
  const payload = {
    version:             API_VERSION,
    partner_id:          PARTNER_ID,
    partner_hotel_code:  PARTNER_HOTEL,
    source_id:           SOURCE_ID,
    sub_source_id:       SUB_SOURCE_ID,
    start_date:          body.start_date,
    end_date:            body.end_date,
    party:               body.party || [{ adults: 2, children: 0 }],
    currency:            body.currency || "INR",
  };

  return djuboRequest("/availability", payload, corsHeaders);
}

// ─────────────────────────────────────────────────────────
// PROXY: /guest-populate
// ─────────────────────────────────────────────────────────
async function proxyGuestPopulate(body, corsHeaders) {
  const payload = {
    version:             API_VERSION,
    partner_id:          PARTNER_ID,
    partner_hotel_code:  PARTNER_HOTEL,
    source_id:           SOURCE_ID,
    sub_source_id:       SUB_SOURCE_ID,
    guestTrackerId:      body.guestTrackerId ?? -1,
    guest: {
      first_name: body.first_name,
      last_name:  body.last_name,
      email:      body.email,
      phone:      body.phone,
    },
  };

  return djuboRequest("/guest-populate", payload, corsHeaders);
}

// ─────────────────────────────────────────────────────────
// PROXY: /booking_submit/
// ─────────────────────────────────────────────────────────
async function proxyBookingSubmit(body, corsHeaders) {
  const payload = {
    version:             API_VERSION,
    partner_id:          PARTNER_ID,
    partner_hotel_code:  PARTNER_HOTEL,
    source_id:           SOURCE_ID,
    sub_source_id:       SUB_SOURCE_ID,
    guest_tracker_id:    body.guest_tracker_id,
    start_date:          body.start_date,
    end_date:            body.end_date,
    party:               body.party || [{ adults: 2, children: 0 }],
    currency:            body.currency || "INR",
    customer: {
      first_name:       body.first_name,
      last_name:        body.last_name,
      email:            body.email,
      phone:            body.phone,
      special_requests: body.special_requests || "",
    },
    rooms:        body.rooms,
    partner_data: { room_rate_key: body.room_rate_key },
    price:        body.price,
    payments:     body.payments || [],
  };

  return djuboRequest("/booking_submit/", payload, corsHeaders);
}

// ─────────────────────────────────────────────────────────
// CORE FETCH to Djubo
// ─────────────────────────────────────────────────────────
async function djuboRequest(endpoint, payload, corsHeaders) {
  try {
    const response = await fetch(`${DJUBO_BASE}${endpoint}`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `DJUBO-TOKEN ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return errorResponse("Djubo API error: " + err.message, 502, corsHeaders);
  }
}

function errorResponse(message, status, corsHeaders) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}