const express = require('express');
const app = express();
app.use(express.json());

// Endpoint: construir audiencia high ticket
app.post('/api/audience/build', (req, res) => {
  const { session_id, constraints = {} } = req.body; // valor por defecto
  const audiencia = {
    audience_id: 'aud_' + Date.now(),
    size: constraints.size || 100000,
    geo: constraints.geo || ['LATAM', 'USA'],
    topics: constraints.topics || ['negocios', 'software'],
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
    eta: new Date(Date.now() + (window_hours || 24) * 3600 * 1000).toISOString()
  };
  res.json(entrega);
});

// Endpoint de salud para verificar que el backend está vivo
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Arrancar servidor en Railway (usa el puerto asignado automáticamente)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOVYX backend activo en puerto ${PORT}`);
});
