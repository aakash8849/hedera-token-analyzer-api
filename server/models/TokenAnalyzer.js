import { join } from 'path';
import { ensureDirectoryExists, writeCSV, readCSV } from '../utils/fileSystem.js';
import { getTokenInfo, fetchHolders } from '../services/tokenService.js';
import { fetchTransactions } from '../services/transactionService.js';
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
        console.log(`Saved ${holders.length} holders to CSV`);
        
        // Fetch and save transactions
        console.log('Fetching transactions...');
        const transactions = [];
        const totalHolders = holders.length;
        
        for (let i = 0; i < holders.length; i += config.rateLimiting.holderBatchSize) {
            const batch = holders.slice(i, i + config.rateLimiting.holderBatchSize);
            console.log(`Processing holders ${i + 1}-${Math.min(i + config.rateLimiting.holderBatchSize, totalHolders)} of ${totalHolders}`);
            
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
            
            const newTransactions = batchTransactions.flat();
            transactions.push(...newTransactions);
            console.log(`Found ${newTransactions.length} transactions in this batch`);
            
            await this.saveTransactions(transactions);
            console.log(`Saved ${transactions.length} total transactions to CSV`);
            
            // Add delay between batches
            await new Promise(resolve => setTimeout(resolve, config.rateLimiting.processingDelay));
        }

        console.log('Analysis complete!');
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
            formatTokenAmount(holder.balance, this.tokenInfo.decimals) // Apply decimals conversion
        ]);
        
        console.log('Saving holders with proper decimal formatting...'); // Debug log
        console.log('Sample holder data:', holdersData[0]); // Debug log
       
        await writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
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
    }

    async getVisualizationData() {
        try {
            const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
            const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);

            const [holdersData, transactionsData] = await Promise.all([
                readCSV(holdersPath),
                readCSV(transactionsPath)
            ]);
             console.log('Retrieved visualization data'); // Debug log
            console.log('Holders data size:', holdersData.split('\n').length);
            console.log('Transactions data size:', transactionsData.split('\n').length);
           
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
