import { TokenAnalyzer } from '../models/TokenAnalyzer.js';

export async function analyzeToken(req, res) {
    try {
        const { tokenId } = req.body;
        if (!tokenId || !/^\d+\.\d+\.\d+$/.test(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID format' });
        }
        
        const analyzer = new TokenAnalyzer(tokenId);
        const result = await analyzer.analyze();
        res.json(result);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
}

export async function visualizeToken(req, res) {
    try {
        const { tokenId } = req.params;
        if (!tokenId || !/^\d+\.\d+\.\d+$/.test(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID format' });
        }

        const analyzer = new TokenAnalyzer(tokenId);
        const result = await analyzer.getVisualizationData();
        res.json(result);
    } catch (error) {
        console.error('Visualization error:', error);
        res.status(500).json({ error: error.message });
    }
}