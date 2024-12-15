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
  origin: [
    'https://hedera-token-analyzer.netlify.app',
    'http://localhost:5173' // For local development
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Ensure storage directory exists
const BASE_STORAGE_DIR = process.env.NODE_ENV === 'production' 
  ? (process.env.STORAGE_DIR || '/data')
  : join(__dirname, '..', 'token_data');

try {
  await fs.access(BASE_STORAGE_DIR);
} catch {
  await fs.mkdir(BASE_STORAGE_DIR, { recursive: true });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    storage: BASE_STORAGE_DIR
  });
});

// Mount API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Use the port that Render expects (10000)
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Storage directory:', BASE_STORAGE_DIR);
});