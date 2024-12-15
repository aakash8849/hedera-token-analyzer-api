const path = require('path');
const readline = require('readline');
const config = require('./config');
const api = require('./api');
const utils = require('./utils');

class TokenAnalyzer {
    constructor(tokenId) {
        this.tokenId = tokenId;
        this.tokenInfo = null;
        this.startTimestamp = Date.now();
        this.lastRequestTime = Date.now();
        this.requestCount = 0;
        this.sixMonthsAgoTimestamp = (Date.now() - config.SIX_MONTHS_IN_MS) / 1000;
        this.tokenDir = path.join(config.OUTPUT_DIR, `${tokenId}_token_data`);
    }

    async initialize() {
        await utils.ensureDirectoryExists(config.OUTPUT_DIR);
        await utils.ensureDirectoryExists(this.tokenDir);
        this.tokenInfo = await api.getTokenInfo(this.tokenId);
        console.log(`\nToken Information:`);
        console.log(`Name: ${this.tokenInfo.name}`);
        console.log(`Symbol: ${this.tokenInfo.symbol}`);
        console.log(`Decimals: ${this.tokenInfo.decimals}`);
    }

    async fetchAllHolders() {
        let holders = [];
        let nextLink = '';
        let retryCount = 0;

        do {
            try {
                const url = `${config.BASE_URL}/tokens/${this.tokenId}/balances${nextLink}`;
                const data = await api.makeRequest(url);
                holders = holders.concat(data.balances);
                nextLink = data.links && data.links.next ? `?${data.links.next.split('?')[1]}` : '';
                retryCount = 0;

                process.stdout.write(`\rFetched ${holders.length} holders`);
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                if (retryCount < config.MAX_RETRIES) {
                    retryCount++;
                    console.error(`\nError fetching holders (attempt ${retryCount}/${config.MAX_RETRIES}): ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                    continue;
                }
                console.error(`\nFailed to fetch all holders after ${config.MAX_RETRIES} attempts`);
                break;
            }
        } while (nextLink);

        console.log(`\nFound ${holders.length} holders`);
        
        // Save holders to CSV
        const holdersPath = path.join(this.tokenDir, `${this.tokenId}_holders.csv`);
        const holdersData = holders.map(holder => [
            holder.account,
            utils.formatTokenAmount(holder.balance, this.tokenInfo.decimals)
        ]);
        
        await utils.writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
        console.log(`\nSaved holders to ${holdersPath}`);
        
        return holders;
    }

    async fetchAccountTransactions(accountId, progressCallback) {
        let transactions = [];
        let timestamp = '';
        let retryCount = 0;
        let pageCount = 0;
        let reachedTimeLimit = false;
        
        while (!reachedTimeLimit) {
            try {
                let url = `${config.BASE_URL}/transactions`;
                let params = {
                    'account.id': accountId,
                    'limit': config.BATCH_SIZE,
                    'timestamp': `gt:${this.sixMonthsAgoTimestamp}`
                };

                if (timestamp) {
                    params['timestamp'] = `lt:${timestamp}`;
                }

                const data = await api.makeRequest(url, params);
                if (!data?.transactions?.length) break;

                pageCount++;
                const relevantTxs = [];

                for (const tx of data.transactions) {
                    const txTimestamp = parseInt(tx.consensus_timestamp.split('.')[0]);
                    
                    if (txTimestamp < this.sixMonthsAgoTimestamp) {
                        reachedTimeLimit = true;
                        break;
                    }

                    if (tx.token_transfers?.some(tt => tt.token_id === this.tokenId)) {
                        const transfers = tx.token_transfers.filter(tt => tt.token_id === this.tokenId);
                        const receivedTransfers = transfers.filter(tt => 
                            tt.account === accountId && tt.amount > 0
                        );

                        if (receivedTransfers.length > 0) {
                            const senderTransfers = transfers.filter(tt => tt.amount < 0);
                            
                            for (const receivedTransfer of receivedTransfers) {
                                const sender = senderTransfers.find(st => 
                                    Math.abs(st.amount) >= receivedTransfer.amount
                                );

                                if (sender) {
                                    relevantTxs.push({
                                        timestamp: new Date(txTimestamp * 1000).toISOString(),
                                        transaction_id: tx.transaction_id,
                                        sender_account: sender.account,
                                        sender_amount: utils.formatTokenAmount(Math.abs(sender.amount), this.tokenInfo.decimals),
                                        receiver_account: receivedTransfer.account,
                                        receiver_amount: utils.formatTokenAmount(receivedTransfer.amount, this.tokenInfo.decimals),
                                        token_symbol: this.tokenInfo.symbol,
                                        memo: tx.memo_base64 ? Buffer.from(tx.memo_base64, 'base64').toString() : '',
                                        fee_hbar: (tx.charged_tx_fee || 0) / 100000000
                                    });
                                }
                            }
                        }
                    }
                }

                transactions = transactions.concat(relevantTxs);
                timestamp = data.transactions[data.transactions.length - 1].consensus_timestamp;
                
                if (progressCallback) {
                    progressCallback(transactions.length, pageCount);
                }

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                if (retryCount < config.MAX_RETRIES) {
                    retryCount++;
                    console.error(`\nError fetching transactions for ${accountId} (attempt ${retryCount}/${config.MAX_RETRIES}): ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                    continue;
                }
                console.error(`\nFailed to fetch all transactions for ${accountId} after ${config.MAX_RETRIES} attempts`);
                break;
            }
        }

        return transactions;
    }

    async saveTransactions(transactions) {
        const transactionsPath = path.join(this.tokenDir, `${this.tokenId}_transactions.csv`);
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

        await utils.writeCSV(transactionsPath, headers, rows);
        console.log(`\nSaved transactions to ${transactionsPath}`);
    }

    async analyze() {
        try {
            await this.initialize();
            
            const holders = await this.fetchAllHolders();
            console.log(`\nProcessing ${holders.length} holders for transactions...`);
            
            let allTransactions = [];
            
            for (let i = 0; i < holders.length; i += config.HOLDER_BATCH_SIZE) {
                const batch = holders.slice(i, i + config.HOLDER_BATCH_SIZE);
                console.log(`\nProcessing holders ${i + 1}-${Math.min(i + config.HOLDER_BATCH_SIZE, holders.length)} of ${holders.length}`);
                
                const batchTransactions = await Promise.all(batch.map(async (holder) => {
                    console.log(`Processing account ${holder.account}...`);
                    return await this.fetchAccountTransactions(holder.account, 
                        (count) => process.stdout.write(`\rFound ${count} transactions`));
                }));
                
                allTransactions = allTransactions.concat(batchTransactions.flat());
                
                if (allTransactions.length > 0) {
                    await this.saveTransactions(allTransactions);
                }

                await new Promise(resolve => setTimeout(resolve, config.PROCESSING_DELAY));
            }

            console.log(`\nAnalysis complete!`);
            console.log(`Data saved in: ${this.tokenDir}`);
            
        } catch (error) {
            console.error('\nAnalysis failed:', error.message);
            throw error;
        }
    }
}

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

module.exports = TokenAnalyzer;