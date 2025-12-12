const express = require('express');
const cors = require('cors');
const { generateKubernetesManifests } = require('./generators/kubernetes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DevOps Manifest Factory backend running' });
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

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

