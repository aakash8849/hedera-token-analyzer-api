import express from 'express';
import { analyzeToken, getAnalysisStatus, visualizeToken } from '../controllers/tokenController.js';

const router = express.Router();

router.post('/analyze', analyzeToken);
router.get('/analyze/:tokenId/status', getAnalysisStatus);
router.get('/visualize/:tokenId', visualizeToken);

export default router;
