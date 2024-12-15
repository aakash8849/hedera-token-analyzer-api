const readline = require('readline');
const path = require('path');
const { startVisualizationServer } = require('../server');
const { readCSV } = require('../utils/fileUtils');
const { processDataForVisualization } = require('../visualization/dataProcessor');

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        const tokenId = await new Promise((resolve) => {
            rl.question('Enter Token ID to visualize (e.g., 0.0.xxxxx): ', (answer) => {
                if (!/^\d+\.\d+\.\d+$/.test(answer)) {
                    throw new Error('Invalid token ID format');
                }
                resolve(answer);
            });
        });

        const tokenDir = path.join('token_data', `${tokenId}_token_data`);
        const holdersPath = path.join(tokenDir, `${tokenId}_holders.csv`);
        const transactionsPath = path.join(tokenDir, `${tokenId}_transactions.csv`);

        // Read and process data
        const holders = await readCSV(holdersPath);
        const transactions = await readCSV(transactionsPath);

        if (!holders || !transactions) {
            throw new Error(`Data not found for token ${tokenId}. Please run 'npm run fetch' first.`);
        }

        const visualizationData = processDataForVisualization(holders, transactions);
        
        // Start the visualization server
        await startVisualizationServer(visualizationData);
        console.log('\nVisualization server started. Opening in your default browser...');

    } catch (error) {
        console.error('\nError:', error.message);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}