import { getTokenConnection } from '../config/database.js';

export async function saveTokenInfo(tokenData) {
  try {
    const conn = await getTokenConnection(tokenData.tokenId);
    const Token = conn.model('Token');

    const token = await Token.findOneAndUpdate(
      { tokenId: tokenData.tokenId },
      tokenData,
      { upsert: true, new: true }
    );
    return token;
  } catch (error) {
    console.error('Error saving token info:', error);
    throw error;
  }
}

export async function saveHolders(tokenId, holdersData) {
  try {
    // Ensure holdersData is properly structured
    if (!holdersData || !Array.isArray(holdersData.balances)) {
      console.error('Invalid holders data structure:', holdersData);
      throw new Error('Invalid holders data structure');
    }

    const conn = await getTokenConnection(tokenId);
    const Holder = conn.model('Holder');

    // Find the treasury (holder with highest balance)
    const treasury = holdersData.balances.reduce((max, h) => 
      (parseInt(h.balance) > parseInt(max.balance)) ? h : max, 
      { balance: '0' }
    );

    // Prepare bulk operations
    const operations = holdersData.balances.map(holder => ({
      updateOne: {
        filter: { tokenId, account: holder.account },
        update: {
          $set: {
            balance: holder.balance,
            isTreasury: holder.account === treasury.account
          }
        },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await Holder.bulkWrite(operations);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving holders:', error);
    throw error;
  }
}

export async function saveTransactions(tokenId, transactions) {
  try {
    if (!Array.isArray(transactions)) {
      console.error('Invalid transactions data structure:', transactions);
      throw new Error('Invalid transactions data structure');
    }

    const conn = await getTokenConnection(tokenId);
    const Transaction = conn.model('Transaction');
    const Holder = conn.model('Holder');

    // Get treasury account
    const treasury = await Holder.findOne({ tokenId, isTreasury: true });
    const treasuryId = treasury?.account;

    // Prepare bulk operations
    const operations = transactions.map(tx => ({
      updateOne: {
        filter: {
          tokenId,
          transactionId: tx.transaction_id
        },
        update: {
          $set: {
            timestamp: new Date(tx.timestamp),
            sender: tx.sender_account,
            receiver: tx.receiver_account,
            amount: parseFloat(tx.sender_amount),
            receiverAmount: parseFloat(tx.receiver_amount),
            tokenSymbol: tx.token_symbol,
            memo: tx.memo,
            feeHbar: parseFloat(tx.fee_hbar),
            involvesTreasury: tx.sender_account === treasuryId || tx.receiver_account === treasuryId
          }
        },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await Transaction.bulkWrite(operations);
    }

    return true;
  } catch (error) {
    console.error('Error saving transactions:', error);
    throw error;
  }
}

export async function getVisualizationData(tokenId) {
  try {
    const conn = await getTokenConnection(tokenId);
    const Holder = conn.model('Holder');
    const Transaction = conn.model('Transaction');

    // Fetch data from MongoDB
    const [holders, transactions] = await Promise.all([
      Holder.find({ tokenId }).lean(),
      Transaction.find({ tokenId })
        .sort({ timestamp: -1 })
        .limit(10000)
        .lean()
    ]);

    // Return data in the format expected by the visualization
    return {
      holders: holders.map(h => ({
        account: h.account,
        balance: h.balance,
        isTreasury: h.isTreasury
      })),
      transactions: transactions.map(tx => ({
        timestamp: tx.timestamp,
        sender: tx.sender,
        amount: tx.amount,
        receiver: tx.receiver,
        involvesTreasury: tx.involvesTreasury
      }))
    };
  } catch (error) {
    console.error('Error getting visualization data:', error);
    throw error;
  }
}
