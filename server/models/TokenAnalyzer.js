import { join } from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import { config } from '../../config/config.js';

export class TokenAnalyzer {
    constructor(tokenId, stats) {
        this.tokenId = tokenId;
        this.tokenInfo = null;
        this.startTimestamp = Date.now();
        this.lastRequestTime = Date.now();
        this.requestCount = 0;
        this.sixMonthsAgoTimestamp = (Date.now() - (6 * 30 * 24 * 60 * 60 * 1000)) / 1000;
        this.tokenDir = join(config.storage.baseDir, `${tokenId}_token_data`);
        this.axiosInstance = axios.create({
            baseURL: config.mirrorNode.baseUrl,
            timeout: config.mirrorNode.timeout,
            headers: { 'Accept-Encoding': 'gzip' }
        });
        this.stats = stats;
    }

    async analyze() {
        try {
            console.log(`Starting analysis for token ${this.tokenId}`);
            await this.ensureDirectoryExists(this.tokenDir);
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
            const transactionsCount = await this.fetchTransactions(holders);

            return {
                success: true,
                tokenInfo: this.tokenInfo,
                holders: holders.length,
                transactions: transactionsCount
            };
        } catch (error) {
            console.error('Analysis failed:', error);
            throw error;
        }
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
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

    formatTokenAmount(amount) {
        if (!amount || !this.tokenInfo?.decimals) return 0;
        const decimals = this.tokenInfo.decimals;
        
        try {
            const amountStr = amount.toString();
            const isNegative = amountStr.startsWith('-');
            const absAmount = isNegative ? amountStr.slice(1) : amountStr;
            const paddedAmount = absAmount.padStart(decimals + 1, '0');
            const integerPart = paddedAmount.slice(0, -decimals) || '0';
            const decimalPart = paddedAmount.slice(-decimals);
            const formattedAmount = `${isNegative ? '-' : ''}${integerPart}.${decimalPart}`;
            return parseFloat(formattedAmount);
        } catch (error) {
            console.error('Error formatting token amount:', error);
            return 0;
        }
    }

    async rateLimit() {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        const delay = Math.max(0, config.rateLimiting.minRequestInterval - elapsed);
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastRequestTime = Date.now();
    }

    async fetchHolders() {
        let holders = [];
        let nextLink = '';
        let retryCount = 0;
        
        do {
            try {
                await this.rateLimit();
                const url = `${config.mirrorNode.baseUrl}/tokens/${this.tokenId}/balances${nextLink}`;
                const response = await axios.get(url, { timeout: config.mirrorNode.timeout });
                holders = holders.concat(response.data.balances);
                nextLink = response.data.links?.next ? `?${response.data.links.next.split('?')[1]}` : '';
                retryCount = 0;
                this.stats.updateHolders(holders.length);
                console.log(`Fetched ${holders.length} holders`);
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                if (retryCount < config.mirrorNode.maxRetries) {
                    retryCount++;
                    console.error(`Error fetching holders (attempt ${retryCount}/${config.mirrorNode.maxRetries}): ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                    continue;
                }
                throw error;
            }
        } while (nextLink);

        return holders;
    }

    async saveHolders(holders) {
        const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
        const holdersData = holders.map(holder => [
            holder.account,
            this.formatTokenAmount(holder.balance)
        ]);
        
        await this.writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
        console.log(`Saved ${holders.length} holders`);
    }

    async writeCSV(filePath, headers, data) {
        const content = [headers.join(',')];
        data.forEach(row => {
            content.push(row.map(cell => 
                typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
            ).join(','));
        });
        await fs.writeFile(filePath, content.join('\n'));
    }

async fetchTransactions(holders) {
    const batchSize = config.rateLimiting.holderBatchSize;
    const batches = Math.ceil(holders.length / batchSize);
    
    this.stats.setBatchProgress(0, batches);
    console.log(`Processing ${holders.length} holders in ${batches} batches`);
    
    for (let i = 0; i < holders.length; i += batchSize) {
        const batch = holders.slice(i, i + batchSize);
        const currentBatch = Math.floor(i/batchSize) + 1;
        this.stats.setBatchProgress(currentBatch, batches);
        
        console.log(`Processing batch ${currentBatch}/${batches}`);
        
        try {
            const batchTransactions = await Promise.all(
                batch.map(async holder => {
                    const transactions = await this.fetchAccountTransactions(holder.account);
                    this.stats.incrementProcessedHolders();
                    if (transactions.length > 0) {
                        this.stats.incrementHoldersWithTransactions();
                    }
                    return transactions;
                })
            );
            
            const newTransactions = batchTransactions.flat();
            
            if (newTransactions.length > 0) {
                for (const tx of newTransactions) {
                    this.stats.addTransaction(tx.transaction_id);
                }
                await this.appendTransactionsToFile(newTransactions);
            }
            
            await new Promise(resolve => setTimeout(resolve, config.rateLimiting.processingDelay));
            
        } catch (error) {
            console.error(`Error processing batch: ${error.message}`);
            continue;
        }
    }

    return this.stats.transactions.total;
}
    async fetchAccountTransactions(accountId) {
        const transactions = [];
        let timestamp = '';
        let retryCount = 0;
        
        while (true) {
            try {
                await this.rateLimit();
                
                const params = {
                    'account.id': accountId,
                    'limit': config.rateLimiting.batchSize,
                    'timestamp': timestamp 
                        ? `lt:${timestamp}` 
                        : `gt:${this.sixMonthsAgoTimestamp}`
                };

                const { data } = await this.axiosInstance.get('/transactions', { params });
                
                if (!data?.transactions?.length) break;

                for (let i = 0; i < data.transactions.length; i += 100) {
                    const chunk = data.transactions.slice(i, i + 100);
                    const relevantTxs = this.processTransactionChunk(chunk, accountId);
                    transactions.push(...relevantTxs);
                }

                timestamp = data.transactions[data.transactions.length - 1].consensus_timestamp;
                retryCount = 0;

                await new Promise(resolve => setTimeout(resolve, 25));

            } catch (error) {
                if (retryCount < config.mirrorNode.maxRetries && 
                    (error.response?.status === 429 || error.response?.status === 503)) {
                    retryCount++;
                    await this.handleRateLimit(retryCount);
                    continue;
                }
                break;
            }
        }

        return transactions;
    }

    async handleRateLimit(retryCount) {
        const delay = Math.min(1000 * Math.pow(1.5, retryCount), 15000);
        console.log(`Rate limit hit, waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    processTransactionChunk(transactions, accountId) {
        return transactions.reduce((acc, tx) => {
            if (!tx.token_transfers?.some(tt => tt.token_id === this.tokenId)) {
                return acc;
            }

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
                        sender_amount: this.formatTokenAmount(Math.abs(sender.amount)),
                        receiver_account: receivedTransfer.account,
                        receiver_amount: this.formatTokenAmount(receivedTransfer.amount),
                        token_symbol: this.tokenInfo.symbol,
                        memo: tx.memo_base64 ? Buffer.from(tx.memo_base64, 'base64').toString() : '',
                        fee_hbar: (tx.charged_tx_fee || 0) / 100000000
                    });
                }
            });

            return acc;
        }, []);
    }

    async appendTransactionsToFile(transactions) {
        const filePath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);
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
        ].join(','));

        await fs.appendFile(filePath, rows.join('\n') + '\n', { flag: 'a' });
    }

    async getVisualizationData() {
        try {
            const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
            const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);

            const [holdersData, transactionsData] = await Promise.all([
                fs.readFile(holdersPath, 'utf8'),
                fs.readFile(transactionsPath, 'utf8')
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
