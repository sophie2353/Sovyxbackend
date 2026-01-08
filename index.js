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
let IG_ACCESS_TOKEN = null;   // se llena en /ig/callback
let IG_USER_ID = null;        // se llena en /ig/callback

/* -------------------------------------------------------
   0.1 Helper Instagram Graph API
------------------------------------------------------- */
async function callInstagramGraph(endpoint, method = 'GET', body = null) {
  if (!IG_ACCESS_TOKEN) {
    return { error: 'IG_ACCESS_TOKEN vacío. Autentica por /ig/callback primero.' };
  }
  const url = new URL(`https://graph.facebook.com/v24.0/${endpoint}`);
  url.searchParams.set('access_token', IG_ACCESS_TOKEN);

  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const response = await fetch(url.toString(), options);
  const data = await response.json();
  return data;
}

/* -------------------------------------------------------
   1. IG OAuth: Callback → token corto → token largo (~60d)
------------------------------------------------------- */
 app.get('/ig/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const igRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: process.env.REDIRECT_URI,
        code: code
      })
    });

    let data;
    try {
      data = await igRes.json();
    } catch (err) {
      const text = await igRes.text();
      console.error("Error al convertir respuesta IG:", text);
      return res.status(400).json({ error: "Instagram devolvió error", detail: text });
    }

    // si todo salió bien, guardas el token largo
    console.log("Token largo recibido:", data);
    return res.json({ status: "ok", ...data });

  } catch (error) {
    console.error("Error en IG callback:", error);
    return res.status(500).json({ error: "Fallo en callback", detail: error.message });
  }
});

/* -------------------------------------------------------
   1.1 IG: Refresh token largo (extiende expiración)
------------------------------------------------------- */
app.get('/ig/refresh', async (_req, res) => {
  try {
    if (!IG_ACCESS_TOKEN) return res.status(400).json({ error: "No hay token para refrescar" });
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${IG_ACCESS_TOKEN}`
    );
    const refreshData = await refreshRes.json();
    if (refreshData.access_token) IG_ACCESS_TOKEN = refreshData.access_token;
    res.json(refreshData);
  } catch (err) {
    console.error("Error en IG refresh:", err);
    res.status(500).json({ error: "Error refrescando token" });
  }
});

/* -------------------------------------------------------
   2. Publicar en Instagram (imagen + caption)
   Requiere: IG_ACCESS_TOKEN dinámico y IG_USER_ID
------------------------------------------------------- */
app.post('/api/instagram/publish', async (req, res) => {
  try {
    const { caption, image_url } = req.body;
    if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
      return res.status(400).json({ error: "Autentica primero por /ig/callback" });
    }
    if (!image_url) {
      return res.status(400).json({ error: "Falta image_url pública para IG" });
    }

    // 1) Crear media contenedor (con image_url + caption)
    const creation = await callInstagramGraph(
      `${IG_USER_ID}/media`,
      'POST',
      { image_url, caption }
    );
    if (!creation.id) {
      return res.status(400).json({ error: "No se pudo crear el contenedor", raw: creation });
    }

    // 2) Publicar el contenedor
    const publish = await callInstagramGraph(
      `${IG_USER_ID}/media_publish`,
      'POST',
      { creation_id: creation.id }
    );
    if (publish.error) {
      return res.status(400).json({ error: "No se pudo publicar", raw: publish });
    }

    res.json({
      status: 'published',
      creation_id: creation.id,
      publish
    });
  } catch (err) {
    console.error('Error publicando en Instagram:', err);
    res.status(500).json({ error: 'Error interno al publicar en Instagram' });
  }
});

/* -------------------------------------------------------
   3. Insights reales del media publicado
------------------------------------------------------- */
app.get('/api/instagram/insights/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    if (!IG_ACCESS_TOKEN) {
      return res.status(400).json({ error: 'Autentica primero por /ig/callback' });
    }
    const metrics = await callInstagramGraph(
      `${mediaId}/insights?metric=impressions,reach,saved,engagement`,
      'GET'
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
app.post('/api/audience/build', (req, res) => {
  const { session_id, constraints = {} } = req.body;

  const audiencia = {
    audience_id: 'aud_' + Date.now(),
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
    platform: constraints.platform || 'instagram'
  };

  res.json(audiencia);
});

/* -------------------------------------------------------
   5. Asignar delivery (24h + cierre estimado 30%)
------------------------------------------------------- */
app.post('/api/delivery/assign', (req, res) => {
  const { session_id, audience_id, post, window_hours, constraints = {} } = req.body;
  const hours = window_hours || 24;
  const reach_total = Math.floor(hours / 24) * 100000; // 100k cada 24h
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
    window_hours: hours,
    target: {
      reach_total,
      cierre_estimado,
      closure_rate_assumed: 0.30
    },
    eta: new Date(Date.now() + hours * 3600 * 1000).toISOString()
  };

  res.json(entrega);
});

/* -------------------------------------------------------
   6. Lenguaje SOVYXIA High Ticket (config)
------------------------------------------------------- */
app.post('/api/language/configure', (req, res) => {
  const {
    niche,
    ticket,
    platform,
    goal,
    client_type,
    style_preference,
    experience_level
  } = req.body;

  const languageProfile = {
    languageprofileid: 'lang_' + Date.now(),
    tone: {
      authority: "alta",
      energy: style_preference === "agresivo" ? "alta" : "media_alta",
      directness: "alta",
      warmth: "media_baja"
    },
    narrative: {
      core: [
        "infraestructura que hace el resultado inevitable",
        "control del entorno y del flujo de demanda",
        "filtrado automático de quienes no pueden pagar"
      ],
      taboos: [
        "discurso de escasez",
        "pedir permiso",
        "vender como si fueras una opción más"
      ]
    },
    structure: {
      content_types: [
        "case_study",
        "diagnostic_post",
        "direct_offer",
        "authority_thread"
      ],
      recommendedfrequencyper_week: 5
    },
    closing_style: {
      filter_based: true,
      calltoaction:
        "si ya estás facturando y quieres estabilizar tickets altos, escribe 'ESTRUCTURA'",
      disqualification_angle:
        "si todavía estás probando ideas, este sistema no es para ti"
    }
  };

  res.json(languageProfile);
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
