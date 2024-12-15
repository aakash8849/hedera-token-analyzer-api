import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import apiRoutes from './routes/api.js';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configure CORS with specific origins
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Ensure storage directory exists
const BASE_STORAGE_DIR = config.storage.baseDir;

try {
  await fs.access(BASE_STORAGE_DIR);
} catch {
  await fs.mkdir(BASE_STORAGE_DIR, { recursive: true });
}

// Root endpoint for health checks
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    storage: BASE_STORAGE_DIR
  });
});

// Mount API routes under /api
app.use('/', apiRoutes);

// Add a catch-all route handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something broke!' });
});

// Use the port from config
const PORT = config.port;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Storage directory:', BASE_STORAGE_DIR);
  console.log('Allowed origins:', config.corsOrigins);
});
