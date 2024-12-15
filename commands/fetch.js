const readline = require('readline');
const TokenAnalyzer = require('../TokenAnalyzer');

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        const tokenId = await new Promise((resolve) => {
            rl.question('Enter Token ID (e.g., 0.0.xxxxx): ', (answer) => {
                if (!/^\d+\.\d+\.\d+$/.test(answer)) {
                    throw new Error('Invalid token ID format');
                }
                resolve(answer);
            });
        });

        console.log('\nInitiating token analysis...');
        const analyzer = new TokenAnalyzer(tokenId);
        await analyzer.analyze();

    } catch (error) {
        console.error('\nError:', error.message);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}