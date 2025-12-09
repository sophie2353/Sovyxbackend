const express = require('express');
const app = express();
app.use(express.json());

// Endpoint: construir audiencia high ticket
app.post('/api/audience/build', (req, res) => {
  const { session_id, constraints } = req.body;
  const audiencia = {
    audienceid: 'aud' + Date.now(),
    size: constraints.size || 100000,
    geo: constraints.geo || ['LATAM','USA'],
    topics: constraints.topics || ['negocios','software'],
    ticketmin: constraints.ticketmin || 1000,
    ticketmax: constraints.ticketmax || 5000,
    quality_score: 0.9
  };
  res.json(audiencia);
});

// Endpoint: adjudicar entrega 24h
app.post('/api/delivery/assign', (req, res) => {
  const { sessionid, audienceid, post, windowhours, closuretarget } = req.body;
  const entrega = {
    deliveryid: 'deliv' + Date.now(),
    status: 'scheduled',
    audience_id,
    post,
    window_hours,
    target: {
      reach_24h: 100000,
      closurerate: closuretarget || { min: 0.01, max: 0.10 }
    },
    eta: new Date(Date.now() + (window_hours||24)36001000).toISOString()
  };
  res.json(entrega);
});

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(SOVYX backend activo en puerto ${PORT});
});
