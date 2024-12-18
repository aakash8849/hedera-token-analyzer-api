import express from 'express';
import { 
    analyzeToken, 
    getAnalysisStatus, 
    getOngoingAnalyses,
    visualizeToken 
} from '../controllers/tokenController.js';

const router = express.Router();

// Analysis endpoints
router.post('/analyze', analyzeToken);
router.get('/analyze/:tokenId/status', getAnalysisStatus);
router.get('/analyze/ongoing', getOngoingAnalyses);
router.get('/visualize/:tokenId', visualizeToken);

export default router;
