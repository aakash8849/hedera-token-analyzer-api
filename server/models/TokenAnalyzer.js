import { join } from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import { config } from '../../config/config.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { readCSV, writeCSV, ensureDirectoryExists } from '../utils/fileSystem.js';

// Rate limiting queue with exponential backoff
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = Date.now();
        this.consecutiveErrors = 0;
    }

    async add(requestConfig) {
        return new Promise((resolve, reject) => {
            this.queue.push({ config: requestConfig, resolve, reject });
            if (!this.processing) {
                this.process();
            }
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const { config, resolve, reject } = this.queue[0];
            
            try {
                // Enforce minimum delay between requests
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                const minDelay = Math.min(100 * Math.pow(2, this.consecutiveErrors), 5000);
                
                if (timeSinceLastRequest < minDelay) {
                    await new Promise(r => setTimeout(r, minDelay - timeSinceLastRequest));
                }

                const response = await axios(config);
                this.lastRequestTime = Date.now();
                this.consecutiveErrors = 0;
                this.queue.shift();
                resolve(response);

            } catch (error) {
                if (error.response?.status === 429 || error.response?.status === 503) {
                    this.consecutiveErrors++;
                    const backoffDelay = Math.min(1000 * Math.pow(2, this.consecutiveErrors), 30000);
                    console.log(`Rate limit hit, backing off for ${backoffDelay}ms...`);
                    await new Promise(r => setTimeout(r, backoffDelay));
                    continue;
                }
                
                this.queue.shift();
                reject(error);
            }
        }

        this.processing = false;
    }
}

export class TokenAnalyzer {
    constructor(tokenId) {
        this.tokenId = tokenId;
        this.tokenInfo = null;
        this.startTimestamp = Date.now();
        this.sixMonthsAgoTimestamp = (Date.now() - (6 * 30 * 24 * 60 * 60 * 1000)) / 1000;
        this.tokenDir = join(config.storage.baseDir, `${tokenId}_token_data`);
        this.requestQueue = new RequestQueue();
    }

    async fetchAccountTransactions(accountId) {
        let transactions = [];
        let timestamp = '';
        let retryCount = 0;
        
        while (true) {
            try {
                let url = `${config.mirrorNode.baseUrl}/transactions`;
                let params = {
                    'account.id': accountId,
                    'limit': config.rateLimiting.batchSize,
                    'timestamp': `gt:${this.sixMonthsAgoTimestamp}`
                };

                if (timestamp) {
                    params['timestamp'] = `lt:${timestamp}`;
                }

                const response = await this.requestQueue.add({ 
                    method: 'get',
                    url,
                    params,
                    timeout: config.mirrorNode.timeout 
                });

                if (!response.data?.transactions?.length) break;

                const relevantTxs = this.processTransactions(response.data.transactions, accountId);
                transactions = transactions.concat(relevantTxs);
                
                timestamp = response.data.transactions[response.data.transactions.length - 1].consensus_timestamp;
                retryCount = 0;

            } catch (error) {
                if (retryCount < config.mirrorNode.maxRetries) {
                    retryCount++;
                    console.log(`Error fetching transactions for ${accountId}, attempt ${retryCount}/${config.mirrorNode.maxRetries}`);
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
                    continue;
                }
                throw new Error(`Failed to fetch transactions: ${error.message}`);
            }
        }

        return transactions;
    }

    async analyze() {
        try {
            console.log(`Starting analysis for token ${this.tokenId}`);
            await ensureDirectoryExists(this.tokenDir);
            console.log(`Created directory: ${this.tokenDir}`);

            // Get token info
            this.tokenInfo = await this.getTokenInfo();
            console.log(`Retrieved token info: ${this.tokenInfo.name} (${this.tokenInfo.symbol})`);

            // Fetch and save holders
            console.log('Fetching holders...');
            const holders = await this.fetchHolders();
            await this.saveHolders(holders);

            // Fetch and save transactions
            console.log('Fetching transactions...');
            const transactions = await this.fetchTransactions(holders);
            await this.saveTransactions(transactions);

            console.log(`Analysis complete! Found ${holders.length} holders and ${transactions.length} transactions`);

            return {
                success: true,
                tokenInfo: this.tokenInfo,
                holders: holders.length,
                transactions: transactions.length
            };
        } catch (error) {
            console.error('Analysis failed:', error);
            throw error;
        }
    }

    async getTokenInfo() {
        try {
            const response = await axios.get(
                `${config.mirrorNode.baseUrl}/tokens/${this.tokenId}`,
                { timeout: config.mirrorNode.timeout }
            );
            return {
                name: response.data.name,
                symbol: response.data.symbol,
                decimals: response.data.decimals,
                total_supply: response.data.total_supply
            };
        } catch (error) {
            throw new Error(`Failed to fetch token information: ${error.message}`);
        }
    }

    async fetchHolders() {
        let holders = [];
        let nextLink = '';
        
        do {
            try {
                const url = `${config.mirrorNode.baseUrl}/tokens/${this.tokenId}/balances${nextLink}`;
                const response = await axios.get(url, { timeout: config.mirrorNode.timeout });
                holders = holders.concat(response.data.balances);
                nextLink = response.data.links?.next ? `?${response.data.links.next.split('?')[1]}` : '';
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                throw new Error(`Failed to fetch holders: ${error.message}`);
            }
        } while (nextLink);

        return holders;
    }

    async saveHolders(holders) {
        const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
        const holdersData = holders.map(holder => [
            holder.account,
            formatTokenAmount(holder.balance, this.tokenInfo.decimals)
        ]);
        
        await writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
        console.log(`Saved ${holders.length} holders`);
    }

    async fetchTransactions(holders) {
        let allTransactions = [];
        
        for (let i = 0; i < holders.length; i += config.rateLimiting.holderBatchSize) {
            const batch = holders.slice(i, i + config.rateLimiting.holderBatchSize);
            console.log(`Processing holders ${i + 1}-${Math.min(i + config.rateLimiting.holderBatchSize, holders.length)} of ${holders.length}`);
            
            const batchTransactions = await Promise.all(
                batch.map(holder => this.fetchAccountTransactions(holder.account))
            );
            
            allTransactions = allTransactions.concat(batchTransactions.flat());
            await new Promise(resolve => setTimeout(resolve, config.rateLimiting.processingDelay));
        }

        return allTransactions;
    }

    async fetchAccountTransactions(accountId) {
        let transactions = [];
        let timestamp = '';
        
        while (true) {
            try {
                let url = `${config.mirrorNode.baseUrl}/transactions`;
                let params = {
                    'account.id': accountId,
                    'limit': config.rateLimiting.batchSize,
                    'timestamp': `gt:${this.sixMonthsAgoTimestamp}`
                };

                if (timestamp) {
                    params['timestamp'] = `lt:${timestamp}`;
                }

                const response = await axios.get(url, { 
                    params,
                    timeout: config.mirrorNode.timeout 
                });

                if (!response.data?.transactions?.length) break;

                const relevantTxs = this.processTransactions(response.data.transactions, accountId);
                transactions = transactions.concat(relevantTxs);
                
                timestamp = response.data.transactions[response.data.transactions.length - 1].consensus_timestamp;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                throw new Error(`Failed to fetch transactions: ${error.message}`);
            }
        }

        return transactions;
    }

    processTransactions(transactions, accountId) {
        return transactions.reduce((acc, tx) => {
            if (tx.token_transfers?.some(tt => tt.token_id === this.tokenId)) {
                const transfers = tx.token_transfers.filter(tt => tt.token_id === this.tokenId);
                const receivedTransfers = transfers.filter(tt => 
                    tt.account === accountId && tt.amount > 0
                );

                receivedTransfers.forEach(receivedTransfer => {
                    const sender = transfers.find(tt => 
                        tt.amount < 0 && Math.abs(tt.amount) >= receivedTransfer.amount
                    );

                    if (sender) {
                        acc.push({
                            timestamp: new Date(parseInt(tx.consensus_timestamp) * 1000).toISOString(),
                            transaction_id: tx.transaction_id,
                            sender_account: sender.account,
                            sender_amount: formatTokenAmount(Math.abs(sender.amount), this.tokenInfo.decimals),
                            receiver_account: receivedTransfer.account,
                            receiver_amount: formatTokenAmount(receivedTransfer.amount, this.tokenInfo.decimals),
                            token_symbol: this.tokenInfo.symbol,
                            memo: tx.memo_base64 ? Buffer.from(tx.memo_base64, 'base64').toString() : '',
                            fee_hbar: (tx.charged_tx_fee || 0) / 100000000
                        });
                    }
                });
            }
            return acc;
        }, []);
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
        console.log(`Saved ${transactions.length} transactions`);
    }

    async getVisualizationData() {
        try {
            const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
            const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);

            const [holdersData, transactionsData] = await Promise.all([
                readCSV(holdersPath),
                readCSV(transactionsPath)
            ]);

            return {
                holders: holdersData,
                transactions: transactionsData
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Data not found. Please analyze the token first.');
            }
            throw error;
        }
    }
}
