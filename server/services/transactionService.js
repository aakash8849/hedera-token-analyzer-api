import axios from 'axios';
import { config } from '../../config/config.js';
import { formatTokenAmount } from '../utils/formatters.js';

export async function fetchTransactions(accountId, tokenId, tokenInfo, sixMonthsAgoTimestamp) {
    let transactions = [];
    let timestamp = '';
    let reachedTimeLimit = false;

    while (!reachedTimeLimit) {
        try {
            let url = `${config.mirrorNode.baseUrl}/transactions`;
            let params = {
                'account.id': accountId,
                'limit': 100,
                'timestamp': `gt:${sixMonthsAgoTimestamp}`
            };

            if (timestamp) {
                params['timestamp'] = `lt:${timestamp}`;
            }

            const response = await axios.get(url, { 
                params,
                timeout: config.mirrorNode.timeout 
            });

            if (!response.data?.transactions?.length) break;

            const relevantTxs = processTransactions(
                response.data.transactions,
                accountId,
                tokenId,
                tokenInfo,
                sixMonthsAgoTimestamp
            );

            transactions = transactions.concat(relevantTxs);
            timestamp = response.data.transactions[response.data.transactions.length - 1].consensus_timestamp;
            
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            throw new Error(`Failed to fetch transactions: ${error.message}`);
        }
    }

    return transactions;
}

function processTransactions(transactions, accountId, tokenId, tokenInfo, sixMonthsAgoTimestamp) {
    return transactions.reduce((acc, tx) => {
        const txTimestamp = parseInt(tx.consensus_timestamp);
        
        if (txTimestamp < sixMonthsAgoTimestamp) {
            return acc;
        }

        if (tx.token_transfers?.some(tt => tt.token_id === tokenId)) {
            const transfers = tx.token_transfers.filter(tt => tt.token_id === tokenId);
            const receivedTransfers = transfers.filter(tt => 
                tt.account === accountId && tt.amount > 0
            );

            receivedTransfers.forEach(receivedTransfer => {
                const sender = transfers.find(tt => 
                    tt.amount < 0 && Math.abs(tt.amount) >= receivedTransfer.amount
                );

                if (sender) {
                    acc.push({
                        timestamp: new Date(txTimestamp * 1000).toISOString(),
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
            });
        }

        return acc;
    }, []);
}