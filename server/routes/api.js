import express from 'express';
import { analyzeToken, visualizeToken } from '../controllers/tokenController.js';

const router = express.Router();

router.post('/analyze', analyzeToken);
router.get('/visualize/:tokenId', visualizeToken);

export default router;