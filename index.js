const express = require('express');
const app = express();

// Si tu entorno no es Node 18+, necesitas importar node-fetch
// const fetch = require('node-fetch');

app.use(express.json());

/* -------------------------------------------------------
   0. CONFIGURACIÓN INSTAGRAM (API OFICIAL)
------------------------------------------------------- */

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_IG_USER_ID = process.env.INSTAGRAM_IG_USER_ID;

async function callInstagramGraph(endpoint, method = 'GET', body = null) {
  const url = new URL(`https://graph.facebook.com/v24.0/${endpoint}`);
  url.searchParams.set('access_token', INSTAGRAM_ACCESS_TOKEN);

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);
  const data = await response.json();
  return data;
}

/* -------------------------------------------------------
   1. ENDPOINT: Construir audiencia (100K high ticket)
------------------------------------------------------- */

app.post('/api/audience/build', (req, res) => {
  const { session_id, constraints = {} } = req.body;

  const audiencia = {
    audience_id: 'aud_' + Date.now(),
    size: constraints.size || 100000,

    // Segmentación avanzada
    geo: constraints.geo || ["LATAM", "EUROPA"],
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores',
      'creadores_contenido',
      'fitness_influencers',
      'agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',

    // Ticket y calidad
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 10000,
    quality_score: 0.9,

    // Plataforma
    platform: 'instagram'
  };

  res.json(audiencia);
});

/* -------------------------------------------------------
   2. ENDPOINT: Asignar entrega (100k cada 24h, acumulativo)
------------------------------------------------------- */

app.post('/api/delivery/assign', (req, res) => {
  const { 
    session_id, 
    audience_id, 
    post, 
    window_hours, 
    closure_target, 
    constraints = {} 
  } = req.body;

  const reach_total = Math.floor((window_hours || 24) / 24) * 100000;

  const entrega = {
    delivery_id: 'deliv_' + Date.now(),
    status: 'scheduled',
    audience_id,
    post,
    geo: constraints.geo || ['LATAM'],
    age_range: constraints.age_range || { min: 25, max: 45 },
    business_type: constraints.business_type || [
      'emprendedores',
      'creadores_contenido',
      'fitness_influencers',
      'agencias'
    ],
    revenue_stage: constraints.revenue_stage || '5k-10k mensual',
    experience_level: constraints.experience_level || 'intermedio',
    window_hours: window_hours || 24,
    target: {
      reach_total,
      closure_rate: closure_target || { min: 0.01, max: 0.10 }
    },
    eta: new Date(Date.now() + (window_hours || 24) * 3600 * 1000).toISOString()
  };

  res.json(entrega);
});

/* -------------------------------------------------------
   3. ENDPOINT: Configurar Lenguaje SOVYXIA High Ticket
------------------------------------------------------- */

app.post('/api/language/configure', (req, res) => {
  const {
    session_id,
    niche,
    ticket,
    platform,
    goal,
    client_type,
    style_preference,
    experience_level
  } = req.body;

  const languageProfile = {
    language_profile_id: 'lang_' + Date.now(),
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
      recommended_frequency_per_week: 5
    },
    closing_style: {
      filter_based: true,
      call_to_action:
        "si ya estás facturando y quieres estabilizar tickets altos, escribe 'ESTRUCTURA'",
      disqualification_angle:
        "si todavía estás probando ideas, este sistema no es para ti"
    }
  };

  res.json(languageProfile);
});

/* -------------------------------------------------------
   4. ENDPOINT: Analizar contenido
------------------------------------------------------- */

app.post('/api/content/analyze', (req, res) => {
  const { session_id, language_profile_id, posts = [] } = req.body;

  const analysis = {
    analysis_id: 'analysis_' + Date.now(),
    summary: {
      clarity_score: 0.78,
      authority_score: 0.72,
      closing_strength: 0.55,
      target_alignment: 0.81,
      high_ticket_signal: 0.67
    },
    issues: [
      {
        type: "closing",
        description: "El cierre es demasiado abierto, no filtra ni genera inevitabilidad."
      },
      {
        type: "authority",
        description: "El tono suena a consejo general, no a sistema probado para gente que ya factura."
      }
    ],
    recommendations: [
      "Refuerza el filtro: deja claro para quién es y para quién no.",
      "Cambia el cierre a uno basado en criterios de entrada, no en curiosidad general."
    ]
  };

  res.json(analysis);
});

/* -------------------------------------------------------
   5. ENDPOINT: Recalibrar contenido
------------------------------------------------------- */

app.post('/api/content/recalibrate', (req, res) => {
  const { session_id, language_profile_id, post, objective } = req.body;

  const optimized = {
    original_excerpt: post?.content || "",
    optimized_version:
      "Versión optimizada con lenguaje SOVYXIA High Ticket: hablas desde autoridad, filtras a quienes no califican y haces que el siguiente paso sea inevitable para quienes ya están facturando.",
    changes_explained: [
      {
        type: "tone",
        before: "Sonaba como un consejo genérico.",
        after: "Ahora hablas como alguien que diseña sistemas para negocios que ya tienen producto y ventas."
      },
      {
        type: "closing",
        before: "CTA del tipo 'si te interesa, escríbeme'.",
        after:
          "CTA filtrado: 'Si ya estás en 5k-10k al mes y quieres estabilizar tickets altos, escribe ESTABLE y te explico cómo lo ajustamos a tu caso.'"
      }
    ]
  };

  res.json(optimized);
});

/* -------------------------------------------------------
   6. ENDPOINT: Publicar en Instagram
------------------------------------------------------- */

app.post('/api/instagram/publish', async (req, res) => {
  try {
    const { caption } = req.body;

    if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_IG_USER_ID) {
      return res.status(400).json({
        error: 'Faltan INSTAGRAM_ACCESS_TOKEN o INSTAGRAM_IG_USER_ID en variables de entorno'
      });
    }

    const creation = await callInstagramGraph(
      `${INSTAGRAM_IG_USER_ID}/media`,
      'POST',
      { caption }
    );

    if (!creation.id) {
      return res.status(400).json({
        error: 'No se pudo crear el contenedor de media en Instagram',
        raw: creation
      });
    }

    const publish = await callInstagramGraph(
      `${INSTAGRAM_IG_USER_ID}/media_publish`,
      'POST',
      { creation_id: creation.id }
    );

    return res.json({ status: 'published', creation, publish });
  } catch (err) {
    console.error('Error publicando en Instagram:', err);
    return res.status(500).json({ error: 'Error interno al publicar en Instagram' });
  }
});

/* -------------------------------------------------------
   7. ENDPOINT: Obtener insights reales de IG
------------------------------------------------------- */

app.get('/api/instagram/insights/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!INSTAGRAM_ACCESS_TOKEN) {
      return res.status(400).json({
        error: 'Falta INSTAGRAM_ACCESS_TOKEN en variables de entorno'
      });
    }

    const metrics = await callInstagramGraph(
      `${mediaId}/insights?metric=impressions,reach,saved,engagement`
    );

    return res.json({
      media_id: mediaId,
      metrics
    });
  } catch (err) {
    console.error('Error obteniendo insights de Instagram:', err);
    return res.status(500).json({ error: 'Error interno al obtener insights de Instagram' });
  }
});
/* -------------------------------------------------------
   8. ENDPOINT: Health Check
------------------------------------------------------- */

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* -------------------------------------------------------
   9. SERVIDOR
------------------------------------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
