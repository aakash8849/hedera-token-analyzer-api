import { TokenAnalyzer } from '../models/TokenAnalyzer.js';
import { AnalysisStats } from '../models/AnalysisStats.js';

const activeAnalyses = new Map();

export async function analyzeToken(req, res) {
    try {
        const { tokenId } = req.body;
        if (!tokenId || !/^\d+\.\d+\.\d+$/.test(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID format' });
        }

        // Check if analysis is already running
        if (activeAnalyses.has(tokenId)) {
            const stats = activeAnalyses.get(tokenId);
            return res.json({
                status: 'in_progress',
                progress: stats.getProgress()
            });
        }

        // Create new analysis
        const stats = new AnalysisStats();
        activeAnalyses.set(tokenId, stats);

        // Start analysis in background
        const analyzer = new TokenAnalyzer(tokenId, stats);
        analyzer.analyze()
            .then(result => {
                const finalStats = stats.getProgress();
                activeAnalyses.delete(tokenId);
                return finalStats;
            })
            .catch(error => {
                console.error('Analysis failed:', error);
                activeAnalyses.delete(tokenId);
            });

        // Return initial response
        res.json({
            status: 'started',
            progress: stats.getProgress()
        });
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
}

export async function getAnalysisStatus(req, res) {
    try {
        const { tokenId } = req.params;
        if (!tokenId || !/^\d+\.\d+\.\d+$/.test(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID format' });
        }

        const stats = activeAnalyses.get(tokenId);
        if (!stats) {
            return res.json({ status: 'not_found' });
        }

        res.json({
            status: 'in_progress',
            progress: stats.getProgress()
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
}
