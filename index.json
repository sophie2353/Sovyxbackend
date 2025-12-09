const express = require('express');
const app = express();
app.use(express.json());

// Endpoint: construir audiencia high ticket
app.post('/api/audience/build', (req, res) => {
  const { session_id, constraints } = req.body;
  const audiencia = {
    audience_id: 'aud_' + Date.now(),
    size: constraints.size || 100000,
    geo: constraints.geo || ['LATAM','USA'],
    topics: constraints.topics || ['negocios','software'],
    ticket_min: constraints.ticket_min || 1000,
    ticket_max: constraints.ticket_max || 5000,
    quality_score: 0.9
  };
  res.json(audiencia);
});

// Endpoint: adjudicar entrega 24h
app.post('/api/delivery/assign', (req, res) => {
  const { session_id, audience_id, post, window_hours, closure_target } = req.body;
  const entrega = {
    delivery_id: 'deliv_' + Date.now(),
    status: 'scheduled',
    audience_id,
    post,
    window_hours,
    target: {
      reach_24h: 100000,
      closure_rate: closure_target || { min: 0.01, max: 0.10 }
    },
    eta: new Date(Date.now() + (window_hours||24)*3600*1000).toISOString()
  };
  res.json(entrega);
});

// Endpoint: telemetría
app.get('/api/delivery/telemetry', (req, res) => {
  const { delivery_id } = req.query;
  const telemetria = {
    delivery_id,
    delivered: Math.floor(Math.random()*50000),
    projected_24h: 100000,
    responses: Math.floor(Math.random()*2000),
    closures_estimated: 0.05,
    recommendations: [
      { action: 'boost_time', reason: 'ventana pico 18–22h' },
      { action: 'segment_refine', reason: 'elevar intención B2B SaaS' }
    ]
  };
  res.json(telemetria);
});

// Puerto Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SOVYX backend activo en puerto ${PORT}`));
