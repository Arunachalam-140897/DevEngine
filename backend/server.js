const express = require('express');
const cors = require('cors');
const { generateKubernetesManifests } = require('./generators/kubernetes');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DevOps Manifest Factory backend running' });
});

// Templates API (Postgres)
app.post('/api/templates', async (req, res) => {
  const { name, content } = req.body || {};
  if (!name || !content) {
    return res.status(400).json({ success: false, error: 'name and content are required' });
  }
  try {
    const saved = await db.saveTemplate(name, content);
    return res.json({ success: true, template: saved });
  } catch (err) {
    console.error('save template error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/templates', async (_req, res) => {
  try {
    const rows = await db.listTemplates();
    return res.json({ success: true, templates: rows });
  } catch (err) {
    console.error('list templates error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/templates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tpl = await db.getTemplate(id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, template: tpl });
  } catch (err) {
    console.error('get template error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Single generator endpoint as per spec
app.post('/api/generate/:module', (req, res) => {
  const { module } = req.params;
  try {
    if (module === 'kubernetes') {
      const files = generateKubernetesManifests(req.body);
      return res.json({ success: true, files });
    }
    // other modules later
    return res.status(400).json({
      success: false,
      error: `Module '${module}' not implemented yet`,
    });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
      details: err.details || null,
    });
  }
});

// app.listen(PORT, () => {
//   console.log(`Backend listening on http://localhost:${PORT}`);
// });

// Initialize DB table first, then start server (prevents race on table creation)
// Try to initialize DB with retries to wait for Postgres readiness
async function initDbWithRetry(retries = 10, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.init();
      console.log('DB initialized');
      return;
    } catch (err) {
      console.warn(`DB init attempt ${i + 1} failed: ${err.message}`);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.warn('DB init failed after retries; starting server anyway');
}

(async () => {
  await initDbWithRetry(15, 2000);
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
})();

