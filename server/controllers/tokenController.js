import { TokenAnalyzer } from '../models/TokenAnalyzer.js';
import { AnalysisStats } from '../models/AnalysisStats.js';
import { saveTokenInfo, saveHolders, saveTransactions, getVisualizationData } from '../services/tokenService.js';

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
            .then(async result => {
                // Save data to MongoDB
                await saveTokenInfo({
                    tokenId,
                    name: result.tokenInfo.name,
                    symbol: result.tokenInfo.symbol,
                    decimals: result.tokenInfo.decimals,
                    totalSupply: result.tokenInfo.total_supply
                });

                await saveHolders(tokenId, result.holders);
                await saveTransactions(tokenId, result.transactions);

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

export async function getOngoingAnalyses(req, res) {
    try {
        const analyses = Array.from(activeAnalyses.entries()).map(([tokenId, stats]) => ({
            tokenId,
            progress: stats.getProgress()
        }));
        
        res.json(analyses);
    } catch (error) {
        console.error('Error fetching ongoing analyses:', error);
        res.status(500).json({ error: error.message });
    }
}

export async function visualizeToken(req, res) {
    try {
        const { tokenId } = req.params;
        if (!tokenId || !/^\d+\.\d+\.\d+$/.test(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID format' });
        }

        const data = await getVisualizationData(tokenId);
        res.json(data);
    } catch (error) {
        console.error('Visualization error:', error);
        res.status(500).json({ error: error.message });
    }
}
