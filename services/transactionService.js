const path = require('path');
const constants = require('../config/constants');
const mirrorNode = require('../api/mirrorNode');
const { formatTokenAmount } = require('../utils/formatUtils');
const { writeCSV, readCSV, appendToCSV } = require('../utils/fileUtils');

async function loadExistingTransactions(tokenDir, tokenId) {
    const transactionsPath = path.join(tokenDir, `${tokenId}_transactions.csv`);
    try {
        const transactions = await readCSV(transactionsPath);
        return transactions || [];
    } catch (error) {
        console.error('Error loading existing transactions:', error.message);
        return [];
    }
}

async function getLatestTransactionTimestamp(transactions) {
    if (!transactions || transactions.length === 0) {
        return null;
    }
    return new Date(Math.max(...transactions.map(tx => new Date(tx.Timestamp)))).toISOString();
}

async function fetchAccountTransactions(accountId, tokenId, tokenInfo, startTimestamp, progressCallback) {
    let transactions = [];
    let timestamp = '';
    let retryCount = 0;
    let pageCount = 0;
    let reachedTimeLimit = false;
    
    while (!reachedTimeLimit) {
        try {
            let url = `${constants.BASE_URL}/transactions`;
            let params = {
                'account.id': accountId,
                'limit': constants.BATCH_SIZE
            };

            if (startTimestamp) {
                params['timestamp'] = `gt:${startTimestamp}`;
            }

            if (timestamp) {
                params['timestamp'] = `lt:${timestamp}`;
            }

            const data = await mirrorNode.makeRequest(url, params);
            if (!data?.transactions?.length) break;

            pageCount++;
            const relevantTxs = [];

            for (const tx of data.transactions) {
                if (tx.token_transfers?.some(tt => tt.token_id === tokenId)) {
                    const transfers = tx.token_transfers.filter(tt => tt.token_id === tokenId);
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
                                    timestamp: new Date(parseInt(tx.consensus_timestamp) * 1000).toISOString(),
                                    transaction_id: tx.transaction_id,
                                    sender_account: sender.account,
                                    sender_amount: formatTokenAmount(Math.abs(sender.amount), tokenInfo.decimals),
                                    receiver_account: receivedTransfer.account,
                                    receiver_amount: formatTokenAmount(receivedTransfer.amount, tokenInfo.decimals),
                                    token_symbol: tokenInfo.symbol,
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
            if (retryCount < constants.MAX_RETRIES) {
                retryCount++;
                console.error(`\nError fetching transactions for ${accountId} (attempt ${retryCount}/${constants.MAX_RETRIES}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                continue;
            }
            console.error(`\nFailed to fetch all transactions for ${accountId} after ${constants.MAX_RETRIES} attempts`);
            break;
        }
    }

    return transactions;
}

async function saveTransactions(newTransactions, tokenDir, tokenId) {
    const transactionsPath = path.join(tokenDir, `${tokenId}_transactions.csv`);
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

    const existingTransactions = await loadExistingTransactions(tokenDir, tokenId);
    const existingTxIds = new Set(existingTransactions.map(tx => tx['Transaction ID']));

    const uniqueNewTransactions = newTransactions.filter(tx => !existingTxIds.has(tx.transaction_id));

    if (existingTransactions.length === 0) {
        // If no existing transactions, create new file
        const rows = uniqueNewTransactions.map(tx => [
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
    } else if (uniqueNewTransactions.length > 0) {
        // Append only new transactions
        const rows = uniqueNewTransactions.map(tx => [
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
        await appendToCSV(transactionsPath, headers, rows);
    }

    console.log(`\nSaved ${uniqueNewTransactions.length} new transactions to ${transactionsPath}`);
    return uniqueNewTransactions.length;
}

module.exports = {
    fetchAccountTransactions,
    saveTransactions,
    loadExistingTransactions,
    getLatestTransactionTimestamp
};