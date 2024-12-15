import { join } from 'path';
import { ensureDirectoryExists, writeCSV, readCSV } from '../utils/fileSystem.js';
import { getTokenInfo, fetchHolders } from '../services/tokenService.js';
import { fetchTransactions } from '../services/transactionService.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { config } from '../../config/config.js';

const BASE_STORAGE_DIR = process.env.NODE_ENV === 'production' 
    ? (process.env.STORAGE_DIR || '/data')
    : 'token_data';

export class TokenAnalyzer {
    constructor(tokenId) {
        this.tokenId = tokenId;
        this.tokenInfo = null;
        this.sixMonthsAgoTimestamp = (Date.now() - (6 * 30 * 24 * 60 * 60 * 1000)) / 1000;
        this.tokenDir = join(BASE_STORAGE_DIR, `${tokenId}_token_data`);
    }

    async analyze() {
        try {
            console.log(`Starting analysis for token ${this.tokenId}`);
            await ensureDirectoryExists(this.tokenDir);
            console.log(`Created directory: ${this.tokenDir}`);
            
            // Get token info
            this.tokenInfo = await getTokenInfo(this.tokenId);
            console.log(`Retrieved token info: ${this.tokenInfo.name} (${this.tokenInfo.symbol})`);
            
            // Fetch and save holders
            console.log('Fetching holders...');
            const holders = await fetchHolders(this.tokenId);
            await this.saveHolders(holders);
            
            // Fetch and save transactions
            const transactions = [];
            for (let i = 0; i < holders.length; i += config.rateLimiting.holderBatchSize) {
                const batch = holders.slice(i, i + config.rateLimiting.holderBatchSize);
                console.log(`Processing holders ${i + 1}-${Math.min(i + config.rateLimiting.holderBatchSize, holders.length)} of ${holders.length}`);
                
                const batchTransactions = await Promise.all(
                    batch.map(holder => 
                        fetchTransactions(
                            holder.account,
                            this.tokenId,
                            this.tokenInfo,
                            this.sixMonthsAgoTimestamp
                        )
                    )
                );
                transactions.push(...batchTransactions.flat());
                await this.saveTransactions(transactions);
                await new Promise(resolve => setTimeout(resolve, config.rateLimiting.processingDelay));
            }

            console.log(`Analysis complete! Found ${holders.length} holders and ${transactions.length} transactions`);
            
            return {
                tokenInfo: this.tokenInfo,
                holders: holders.length,
                transactions: transactions.length,
                outputDir: this.tokenDir
            };
        } catch (error) {
            console.error('Analysis failed:', error);
            throw error;
        }
    }

    async saveHolders(holders) {
        const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
        const holdersData = holders.map(holder => [
            holder.account,
            formatTokenAmount(holder.balance, this.tokenInfo.decimals)
        ]);
        
        await writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
        console.log(`Saved ${holders.length} holders to ${holdersPath}`);
    }

    async saveTransactions(transactions) {
        const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);
        const headers = [
            'Timestamp',
            'Transaction ID',
            'Sender Account',
            'Total Sent Amount',
            'Receiver Account',
            'Receiver Amount',
            'Token Symbol',
            'Memo',
            'Fee (HBAR)'
        ];

        const rows = transactions.map(tx => [
            tx.timestamp,
            tx.transaction_id,
            tx.sender_account,
            tx.sender_amount,
            tx.receiver_account,
            tx.receiver_amount,
            tx.token_symbol,
            tx.memo,
            tx.fee_hbar
        ]);

        await writeCSV(transactionsPath, headers, rows);
        console.log(`Saved ${transactions.length} transactions to ${transactionsPath}`);
    }

    async getVisualizationData() {
        try {
            const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
            const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);

            const [holdersData, transactionsData] = await Promise.all([
                readCSV(holdersPath),
                readCSV(transactionsPath)
            ]);

             // Process holders data
            const holders = holdersData.split('\n')
                .slice(1) // Skip header
                .filter(line => line.trim())
                .map(line => {
                    const [account, balance] = line.split(',');
                    return {
                        account,
                        balance: parseFloat(balance) || 0
                    };
                });

            // Process transactions data
            const transactions = transactionsData.split('\n')
                .slice(1) // Skip header
                .filter(line => line.trim())
                .map(line => {
                    const [
                        timestamp,
                        transaction_id,
                        sender_account,
                        sender_amount,
                        receiver_account,
                        receiver_amount,
                        token_symbol,
                        memo,
                        fee_hbar
                    ] = line.split(',');

                    return {
                        timestamp: new Date(timestamp),
                        transaction_id,
                        sender_account,
                        sender_amount: parseFloat(sender_amount) || 0,
                        receiver_account,
                        receiver_amount: parseFloat(receiver_amount) || 0,
                        token_symbol,
                        memo,
                        fee_hbar: parseFloat(fee_hbar) || 0
                    };
                });

            // Calculate metrics for visualization
            const maxBalance = Math.max(...holders.map(h => h.balance));
            const minBalance = Math.min(...holders.map(h => h.balance));

            // Create nodes from holders
            const nodes = holders.map(holder => ({
                id: holder.account,
                value: holder.balance,
                radius: Math.sqrt(holder.balance / maxBalance) * 50 + 5, // Scale node size
                category: this.getHolderCategory(holder.balance, maxBalance)
            }));

            // Create links from transactions
            const links = transactions.map(tx => ({
                source: tx.sender_account,
                target: tx.receiver_account,
                value: tx.receiver_amount,
                timestamp: tx.timestamp
            }));

            return {
                nodes,
                links,
                metrics: {
                    totalHolders: holders.length,
                    totalTransactions: transactions.length,
                    maxBalance,
                    minBalance,
                    tokenInfo: this.tokenInfo
                }
            };
        } catch (error) {
            console.error('Visualization data processing error:', error);
            throw new Error('Failed to process visualization data: ' + error.message);
        }
    }

    getHolderCategory(balance, maxBalance) {
        const ratio = balance / maxBalance;
        if (ratio > 0.1) return 'large';
        if (ratio > 0.01) return 'medium';
        return 'small';
    }
}
            return {
                holders: holdersData,
                transactions: transactionsData
            };
        } catch (error) {
            if (error.message === 'File not found') {
                throw new Error('Data not found. Please analyze the token first.');
            }
            throw error;
        }
    }
}
