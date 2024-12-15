import express from 'express';
import { analyzeToken, visualizeToken } from '../controllers/tokenController.js';

const router = express.Router();

// These routes will be mounted under /api
router.post('/analyze', analyzeToken);
router.get('/visualize/:tokenId', visualizeToken);

export default router;
