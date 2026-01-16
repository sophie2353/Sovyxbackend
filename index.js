/* -------------------------------------------------------
   SOVYX Backend - IG OAuth + Segmentación + Delivery
------------------------------------------------------- */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Compatibilidad con Node <18
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ========== CONFIGURACIÓN GLOBAL: Token dinámico ==========
// Variables para TU cuenta (owner) - USAR CONST en lugar de LET
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const IG_USER_ID = process.env.IG_USER_ID || '';

// Definición de clientes
const CLIENT1_ACCESS_TOKEN = process.env.CLIENT1_ACCESS_TOKEN || '';
const CLIENT1_USER_ID = process.env.CLIENT1_USER_ID || '';

const CLIENT2_ACCESS_TOKEN = process.env.CLIENT2_ACCESS_TOKEN || '';
const CLIENT2_USER_ID = process.env.CLIENT2_USER_ID || '';

const CLIENT3_ACCESS_TOKEN = process.env.CLIENT3_ACCESS_TOKEN || '';
const CLIENT3_USER_ID = process.env.CLIENT3_USER_ID || '';

const CLIENT4_ACCESS_TOKEN = process.env.CLIENT4_ACCESS_TOKEN || '';
const CLIENT4_USER_ID = process.env.CLIENT4_USER_ID || '';

const CLIENT5_ACCESS_TOKEN = process.env.CLIENT5_ACCESS_TOKEN || '';
const CLIENT5_USER_ID = process.env.CLIENT5_USER_ID || '';

// Mapeo dinámico de tokens
const tokens = {
  owner: { 
    access_token: IG_ACCESS_TOKEN, 
    user_id: IG_USER_ID 
  },
  client1: { 
    access_token: CLIENT1_ACCESS_TOKEN, 
    user_id: CLIENT1_USER_ID 
  },
  client2: { 
    access_token: CLIENT2_ACCESS_TOKEN, 
    user_id: CLIENT2_USER_ID 
  },
  client3: { 
    access_token: CLIENT3_ACCESS_TOKEN, 
    user_id: CLIENT3_USER_ID 
  },
  client4: { 
    access_token: CLIENT4_ACCESS_TOKEN, 
    user_id: CLIENT4_USER_ID 
  },
  client5: { 
    access_token: CLIENT5_ACCESS_TOKEN, 
    user_id: CLIENT5_USER_ID 
  }
};

// CONFIGURACIÓN DEFINITIVA DE CORS PARA GITHUB PAGES → VERCEL
const corsOptions = {
  origin: [
    'https://sophie2353.github.io', // Tu GitHub Pages
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080'
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
  maxAge: 86400,
  optionsSuccessStatus: 204
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));

// Manejar preflight OPTIONS para todas las rutas
app.options('*', cors(corsOptions));

// Middleware para parsear JSON y URL encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== FUNCIONES AUXILIARES ==========
// Función auxiliar para llamar al Graph API de Instagram
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

// ========== RUTAS ==========

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

// Health y raíz
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    time: new Date().toISOString(),
    tokens_configured: Object.keys(tokens).filter(client => tokens[client].access_token && tokens[client].user_id)
  });
});

app.get('/', (_req, res) => {
  res.json({ 
    message: '✨ SOVYX backend activo',
    endpoints: {
      campaign: 'POST /api/campaign',
      refresh_token: 'GET /ig/refresh',
      health: 'GET /health',
      cors_test: 'GET /cors-test'
    },
    clients_available: Object.keys(tokens)
  });
});

/* -------------------------------------------------------
   1. Refresh token largo (Instagram)
------------------------------------------------------- */
app.get(['/ig/refresh', '/ig/:client/refresh'], async (req, res) => {
  const { client } = req.params;
  
  // Determinar qué token usar
  let token;
  if (client && tokens[client]) {
    token = tokens[client].access_token;
  } else {
    token = IG_ACCESS_TOKEN;
  }
  
  if (!token || token === '') {
    return res.status(400).json({ 
      error: "Token no configurado",
      client: client || 'owner',
      hint: "Configura IG_ACCESS_TOKEN en variables de entorno"
    });
  }

  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
    );
    const refreshData = await refreshRes.json();
    
    // NOTA: En producción real, deberías actualizar la variable o DB
    res.json({
      status: 'success',
      message: 'Token refresh ejecutado',
      data: refreshData,
      note: 'En desarrollo, actualiza manualmente las variables de entorno'
    });
  } catch (err) {
    console.error("Error en IG refresh:", err);
    res.status(500).json({ 
      error: "Error refrescando token",
      details: err.message 
    });
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
  
  // Obtener tokens del cliente
  const clientTokens = tokens[client];
  if (!clientTokens) {
    return res.status(404).json({ 
      error: `Cliente "${client}" no encontrado`,
      available_clients: Object.keys(tokens)
    });
  }
  
  const { access_token, user_id } = clientTokens;

  // Validación de tokens (solo verifica si están vacíos)
  if (!access_token || access_token === '' || !user_id || user_id === '') {
    return res.status(400).json({ 
      error: `Token o User ID no configurados para ${client}`,
      status: 'error',
      hint: `Configura ${client.toUpperCase()}_ACCESS_TOKEN y ${client.toUpperCase()}_USER_ID en variables de entorno`
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

  // 🔹 1. CREAR AUDIENCIA
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

  // 🔹 2. CREAR DELIVERY
  const hours = window_hours;
  const reach_total = Math.floor(hours / 24) * 100000;
  const cierre_estimado = Math.floor(reach_total * 0.30);

  const delivery = {
    delivery_id: 'deliv_' + timestamp,
    status: 'scheduled',
    session_id,
    audience_id: audiencia.audience_id,
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
    
    audience: audiencia,
    delivery: delivery,
    
    summary: {
      total_audience: audiencia.size,
      delivery_window: `${hours} horas`,
      estimated_reach: reach_total,
      estimated_closures: cierre_estimado,
      client: client,
      platform: audiencia.platform
    },
    
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
------------------------------------------------------- */
app.post(['/api/audience/create', '/api/:client/audience/create'], (req, res) => {
  const { client = 'owner' } = req.params;
  const { session_id, constraints = {} } = req.body;
  
  const clientTokens = tokens[client];
  if (!clientTokens) {
    return res.status(404).json({ 
      error: `Cliente "${client}" no encontrado`,
      available_clients: Object.keys(tokens)
    });
  }
  
  const { access_token, user_id } = clientTokens;

  if (!access_token || access_token === '') {
    return res.status(400).json({ 
      error: `Token no configurado para ${client}`,
      hint: `Configura ${client.toUpperCase()}_ACCESS_TOKEN en variables de entorno`
    });
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
    user_id: user_id || 'not_required',
    access_token_used: true
  };

  res.json(audiencia);
});

app.post(['/api/delivery/assign', '/api/:client/delivery/assign'], (req, res) => {
  const { client = 'owner' } = req.params;
  const { session_id, audience_id, post, window_hours, constraints = {} } = req.body;
  
  const clientTokens = tokens[client];
  if (!clientTokens) {
    return res.status(404).json({ 
      error: `Cliente "${client}" no encontrado`,
      available_clients: Object.keys(tokens)
    });
  }
  
  const { access_token, user_id } = clientTokens;

  if (!access_token || access_token === '') {
    return res.status(400).json({ 
      error: `Token no configurado para ${client}`,
      hint: `Configura ${client.toUpperCase()}_ACCESS_TOKEN en variables de entorno`
    });
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
    user_id: user_id || 'not_required',
    access_token_used: true
  };

  res.json(entrega);
});

/* -------------------------------------------------------
   Analizar contenido (simulado)
------------------------------------------------------- */
app.post('/api/content/analyze', (req, res) => {
  const { posts = [] } = req.body;

  const analysis = {
    analysis_id: 'analysis' + Date.now(),
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
   Recalibrar contenido (simulado)
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
   Insights (Instagram) - Mantenido por si lo necesitas
------------------------------------------------------- */
app.get(['/api/instagram/insights/:mediaId', '/api/:client/instagram/insights/:mediaId'], async (req, res) => {
  const { client, mediaId } = req.params;

  const token = client && tokens[client] ? tokens[client].access_token : IG_ACCESS_TOKEN;
  
  if (!token || token === '') {
    return res.status(400).json({ 
      error: "Token de Instagram no configurado",
      client: client || 'owner'
    });
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
    res.status(500).json({ 
      error: 'Error al obtener insights',
      details: err.message 
    });
  }
});

/* -------------------------------------------------------
   SERVIDOR (SOLO UN app.listen())
------------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SOVYX backend activo en puerto ${PORT}`);
  console.log(`✅ CORS habilitado para: ${corsOptions.origin.join(', ')}`);
  console.log(`👥 Clientes disponibles: ${Object.keys(tokens).join(', ')}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
