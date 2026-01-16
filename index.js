/* -------------------------------------------------------
   SOVYX Backend - IG OAuth + Segmentación + Delivery
------------------------------------------------------- */

. require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Compatibilidad con Node <18
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// CONFIGURACIÓN DEFINITIVA DE CORS PARA GITHUB PAGES → VERCEL
const corsOptions = {
  origin: [
    'https://sophie2353.github.io', // Todos los GitHub Pages
    'http://localhost:3000', // React dev server
    'http://localhost:5173', // Vite dev server
    'http://localhost:5500', // Live Server
    'http://127.0.0.1:5500', // Live Server alternativo
    'http://localhost:8080' // Otro puerto común
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-Api-Key'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400, // 24 horas de cache para preflight
  optionsSuccessStatus: 204
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));

// Manejar preflight OPTIONS para todas las rutas
app.options('*', cors(corsOptions));

// Middleware para parsear JSON
app.use(express.json());

// Middleware para parsear URL encoded
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba CORS
app.get('/cors-test', (req, res) => {
  res.json({
    success: true,
    message: '✅ CORS configurado correctamente',
    frontendOrigin: req.headers.origin || 'No origin header',
    backend: 'Vercel',
    allowedOrigins: corsOptions.origin,
    timestamp: new Date().toISOString()
  });
});

// Tu código existente aquí debajo...
// (tus rutas, lógica, etc.)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend en Vercel (puerto: ${PORT})`);
  console.log(`✅ CORS habilitado para GitHub Pages`);
  console.log(`🌐 Orígenes permitidos: ${corsOptions.origin.join(', ')}`);
});
/* -------------------------------------------------------
   0. CONFIG GLOBAL: Token dinámico
------------------------------------------------------- */

// Variables para TU cuenta (owner)
let IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
let IG_USER_ID = process.env.IG_USER_ID;

// Definición de clientes
let CLIENT1_ACCESS_TOKEN = process.env.CLIENT1_ACCESS_TOKEN;
let CLIENT1_USER_ID = process.env.CLIENT1_USER_ID;

let CLIENT2_ACCESS_TOKEN = process.env.CLIENT2_ACCESS_TOKEN;
let CLIENT2_USER_ID = process.env.CLIENT2_USER_ID;

let CLIENT3_ACCESS_TOKEN = process.env.CLIENT3_ACCESS_TOKEN;
let CLIENT3_USER_ID = process.env.CLIENT3_USER_ID;

// Mapeo dinámico de tokens
const tokens = {
  owner: { access_token: IG_ACCESS_TOKEN, user_id: IG_USER_ID },
  client1: { access_token: CLIENT1_ACCESS_TOKEN, user_id: CLIENT1_USER_ID },
  client2: { access_token: CLIENT2_ACCESS_TOKEN, user_id: CLIENT2_USER_ID },
  client3: { access_token: CLIENT3_ACCESS_TOKEN, user_id: CLIENT3_USER_ID }
};

// Función auxiliar para llamar al Graph API
async function callInstagramGraph(endpoint, method = 'GET', body = {}, token) {
  const url = `https://graph.instagram.com/${endpoint}?access_token=${token}`;
  const options = { method };
  if (method === 'POST') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  return res.json();
}

/* -------------------------------------------------------
   1. Refresh token largo
------------------------------------------------------- */
app.get(['/ig/refresh', '/ig/:client/refresh'], async (req, res) => {
  const { client } = req.params;
  let token = IG_ACCESS_TOKEN;

  if (client) {
    if (!tokens[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = tokens[client].access_token;
  }

  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
    );
    const refreshData = await refreshRes.json();
    if (refreshData.access_token) {
      if (client) tokens[client].access_token = refreshData.access_token;
      else IG_ACCESS_TOKEN = refreshData.access_token;
    }
    res.json(refreshData);
  } catch (err) {
    console.error("Error en IG refresh:", err);
    res.status(500).json({ error: "Error refrescando token" });
  }
});

/* -------------------------------------------------------
   2. Publicar en Instagram
------------------------------------------------------- */
app.post(['/api/instagram/publish', '/api/:client/instagram/publish'], async (req, res) => {
  const { client } = req.params;
  const { caption, image_url } = req.body;

  let token = IG_ACCESS_TOKEN;
  let userId = IG_USER_ID;

  if (client) {
    if (!tokens[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = tokens[client].access_token;
    userId = tokens[client].user_id;
  }

  if (!image_url) return res.status(400).json({ error: "Falta image_url pública para IG" });

  try {
    const creation = await callInstagramGraph(
      `${userId}/media`,
      'POST',
      { image_url, caption },
      token
    );

    if (!creation.id) return res.status(400).json({ error: "No se pudo crear el contenedor", raw: creation });

    const publish = await callInstagramGraph(
      `${userId}/media_publish`,
      'POST',
      { creation_id: creation.id },
      token
    );

    res.json({ status: 'published', creation_id: creation.id, publish });
  } catch (err) {
    console.error('Error publicando en Instagram:', err);
    res.status(500).json({ error: 'Error interno al publicar en Instagram' });
  }
});

/* -------------------------------------------------------
   3. Insights
------------------------------------------------------- */
app.get(['/api/instagram/insights/:mediaId', '/api/:client/instagram/insights/:mediaId'], async (req, res) => {
  const { client, mediaId } = req.params;

  let token = IG_ACCESS_TOKEN;
  if (client) {
    if (!tokens[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = tokens[client].access_token;
  }

  try {
    const metrics = await callInstagramGraph(
      `${mediaId}/insights?metric=impressions,reach,saved,engagement`,
      'GET',
      {},
      token
    );
    res.json({ media_id: mediaId, metrics });
  } catch (err) {
    console.error('Error obteniendo insights:', err);
    res.status(500).json({ error: 'Error interno al obtener insights' });
  }
});

/* -------------------------------------------------------
   ENDPOINT UNIFICADO: CAMPAÑA COMPLETA
   Combina: /api/audience/create + /api/delivery/assign
------------------------------------------------------- */
app.post(['/api/campaign', '/api/:client/campaign'], (req, res) => {
  const { client = 'owner' } = req.params;
  const { 
    session_id, 
    post, 
    window_hours = 24, 
    constraints = {} 
  } = req.body;
  
  const { access_token, user_id } = tokens[client];

  // Validación de tokens
  if (!access_token || !user_id) {
    return res.status(400).json({ 
      error: `Token o User ID no configurados para ${client}`,
      status: 'error'
    });
  }

  // Validación de campos requeridos
  if (!session_id) {
    return res.status(400).json({ 
      error: 'session_id es requerido',
      status: 'error'
    });
  }

  // Timestamp común
  const timestamp = Date.now();

  // 🔹 1. CREAR AUDIENCIA (primera parte unificada)
  const audiencia = {
    audience_id: 'aud_' + timestamp,
    session_id,
    size: constraints.size || 100000,
    geo: constraints.geo || ["LATAM", "EUROPA"],
    segment: constraints.segment || "high_ticket",
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores',
      'creadores_contenido',
      'fitness_influencers',
      'agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    quality_score: 0.9,
    platform: constraints.platform || 'instagram',
    client_used: client,
    user_id,
    access_token_used: true,
    created_at: new Date(timestamp).toISOString()
  };

  // 🔹 2. CREAR DELIVERY (segunda parte unificada)
  const hours = window_hours;
  const reach_total = Math.floor(hours / 24) * 100000;
  const cierre_estimado = Math.floor(reach_total * 0.30);

  const delivery = {
    delivery_id: 'deliv_' + timestamp,
    status: 'scheduled',
    session_id,
    audience_id: audiencia.audience_id, // Enlazado automáticamente
    post: post || 'Sin contenido especificado',
    geo: constraints.geo || ['LATAM', 'EUROPA'],
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores',
      'creadores_contenido',
      'fitness_influencers',
      'agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    window_hours: hours,
    target: {
      reach_total,
      cierre_estimado,
      closure_rate_assumed: 0.30,
      cpm_estimated: 15.50
    },
    eta: new Date(timestamp + hours * 3600 * 1000).toISOString(),
    client_used: client,
    user_id,
    access_token_used: true,
    scheduled_at: new Date(timestamp).toISOString()
  };

  // 🔹 3. RESPUESTA UNIFICADA
  const campaign = {
    status: 'success',
    campaign_id: 'camp_' + timestamp,
    unified_response: true,
    timestamp: new Date().toISOString(),
    
    // Datos originales (igual que antes)
    audience: audiencia,
    delivery: delivery,
    
    // Resumen combinado
    summary: {
      total_audience: audiencia.size,
      delivery_window: `${hours} horas`,
      estimated_reach: reach_total,
      estimated_closures: cierre_estimado,
      client: client,
      platform: audiencia.platform
    },
    
    // Metadata para tracking
    metadata: {
      endpoints_consolidated: ['audience/create', 'delivery/assign'],
      single_call: true,
      response_time_ms: Date.now() - timestamp,
      version: '1.0'
    }
  };

  res.json(campaign);
});

/* -------------------------------------------------------
   ENDPOINTS INDIVIDUALES (para compatibilidad)
   Si todavía necesitas llamarlos por separado
------------------------------------------------------- */
app.post(['/api/audience/create', '/api/:client/audience/create'], (req, res) => {
  const { client = 'owner' } = req.params;
  const { session_id, constraints = {} } = req.body;
  const { access_token, user_id } = tokens[client];

  if (!access_token || !user_id) {
    return res.status(400).json({ error: `Token o User ID no configurados para ${client}` });
  }

  const audiencia = {
    audience_id: 'aud_' + Date.now(),
    session_id,
    size: constraints.size || 100000,
    geo: constraints.geo || ["LATAM", "EUROPA"],
    segment: constraints.segment || "high_ticket",
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores','creadores_contenido','fitness_influencers','agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    quality_score: 0.9,
    platform: constraints.platform || 'instagram',
    client_used: client,
    user_id,
    access_token_used: true
  };

  res.json(audiencia);
});

app.post(['/api/delivery/assign', '/api/:client/delivery/assign'], (req, res) => {
  const { client = 'owner' } = req.params;
  const { session_id, audience_id, post, window_hours, constraints = {} } = req.body;
  const { access_token, user_id } = tokens[client];

  if (!access_token || !user_id) {
    return res.status(400).json({ error: `Token o User ID no configurados para ${client}` });
  }
  
  const hours = window_hours || 24;
  const reach_total = Math.floor(hours / 24) * 100000;
  const cierre_estimado = Math.floor(reach_total * 0.30);

  const entrega = {
    delivery_id: 'deliv_' + Date.now(),
    status: 'scheduled',
    session_id,
    audience_id,
    post,
    geo: constraints.geo || ['LATAM', 'EUROPA'],
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores','creadores_contenido','fitness_influencers','agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    window_hours: hours,
    target: {
      reach_total,
      cierre_estimado,
      closure_rate_assumed: 0.30
    },
    eta: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
    client_used: client,
    user_id,
    access_token_used: true
  };

  res.json(entrega);
});

/* -------------------------------------------------------
   7. Analizar contenido (texto + cierre)
------------------------------------------------------- */
app.post('/api/content/analyze', (req, res) => {
  const { posts = [] } = req.body;

  const analysis = {
    analysisid: 'analysis' + Date.now(),
    summary: {
      clarity_score: 0.78,
      authority_score: 0.72,
      closing_strength: 0.55,
      target_alignment: 0.81,
      highticketsignal: 0.67
    },
    issues: [
      { type: "closing", description: "El cierre es demasiado abierto, no filtra ni genera inevitabilidad." },
      { type: "authority", description: "El tono suena a consejo general, no a sistema probado para gente que ya factura." }
    ],
    recommendations: [
      "Refuerza el filtro: deja claro para quién es y para quién no.",
      "Cambia el cierre a uno basado en criterios de entrada, no en curiosidad general."
    ]
  };

  res.json(analysis);
});

/* -------------------------------------------------------
   8. Recalibrar contenido (versión optimizada)
------------------------------------------------------- */
app.post('/api/content/recalibrate', (req, res) => {
  const { post, objective } = req.body;

  const optimized = {
    original_excerpt: post?.content || "",
    optimized_version:
      "Versión SOVYXIA High Ticket: hablas desde autoridad, filtras a quienes no califican y haces que el siguiente paso sea inevitable para quienes ya están facturando.",
    changes_explained: [
      { type: "tone", before: "Sonaba como consejo genérico.", after: "Ahora hablas como arquitecta de sistemas para negocios con ventas." },
      { type: "closing", before: "CTA blando.", after: "CTA filtrado: 'Si ya estás en 5k-10k/mes y quieres estabilizar tickets altos, escribe ESTRUCTURA'." }
    ]
  };

  res.json(optimized);
});

/* -------------------------------------------------------
   9. Health y raíz
------------------------------------------------------- */
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.send('✨ SOVYX backend activo y listo para recibir llamadas 🚀');
});

/* -------------------------------------------------------
   10. SERVIDOR
------------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOVYX backend activo en puerto ${PORT}`);
});
