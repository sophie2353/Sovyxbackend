/* -------------------------------------------------------
   SOVYX Backend - IG OAuth + Segmentación + Delivery
------------------------------------------------------- */
require('dotenv').config();
const express = require('express');
const app = express();

// Compatibilidad con Node <18 (Railway suele usar 16)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

app.use(express.json());

/* -------------------------------------------------------
   0. CONFIG GLOBAL: Token dinámico
------------------------------------------------------- */

// Variables para TU cuenta
let IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
let IG_USER_ID = process.env.IG_USER_ID;

// Definición de clientes
const clients = {
  client1: {
    token: process.env.TOKENCLIENT1,
    userId: process.env.USERIDCLIENT1
  },
  client2: {
    token: process.env.TOKENCLIENT2,
    userId: process.env.USERIDCLIENT2
  }
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
    if (!clients[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = clients[client].token;
  }

  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
    );
    const refreshData = await refreshRes.json();
    if (refreshData.access_token) {
      if (client) clients[client].token = refreshData.access_token;
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
    if (!clients[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = clients[client].token;
    userId = clients[client].userId;
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
    if (!clients[client]) return res.status(400).json({ error: "Cliente no válido" });
    token = clients[client].token;
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
   4. Construir audiencia (100k, LATAM+EUROPA, high ticket)
------------------------------------------------------- */
app.post(['/api/audience/build', '/api/:client/audience/build'], (req, res) => {
  const { client } = req.params;
  const { session_id, constraints = {} } = req.body;

  const audiencia = {
    audience_id: 'aud_' + Date.now(),
    size: constraints.size || 100000, // tamaño base 100k
    geo: constraints.geo || ["LATAM", "EUROPA"], // regiones por defecto
    segment: constraints.segment || "high_ticket", // segmento fijo
    age_range: constraints.age_range || { min: 25, max: 45 }, // rango de edad
    business_type: constraints.business_type || [
      'emprendedores','creadores_contenido','fitness_influencers','agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    quality_score: 0.9,
    platform: constraints.platform || 'instagram',
    client_used: client || 'owner'
  };

  res.json(audiencia);
});

/* -------------------------------------------------------
   5. Asignar delivery (100k cada 24h + cierre estimado 30%)
------------------------------------------------------- */
app.post(['/api/delivery/assign', '/api/:client/delivery/assign'], (req, res) => {
  const { client } = req.params;
  const { session_id, audience_id, post, window_hours, constraints = {} } = req.body;

  const hours = window_hours || 24;

  // Alcance fijo: 100k cada 24h → proporcional en días
  const reach_total = Math.floor(hours / 24) * 100000; 
  const cierre_estimado = Math.floor(reach_total * 0.30); // 30%

  const entrega = {
    delivery_id: 'deliv_' + Date.now(),
    status: 'scheduled',
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
      reach_total,              // 100k cada 24h → proporcional
      cierre_estimado,          // 30% de cierre estimado
      closure_rate_assumed: 0.30
    },
    eta: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
    client_used: client || 'owner'
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
