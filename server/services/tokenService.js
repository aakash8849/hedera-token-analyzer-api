import { Token } from '../models/Token.js';
import { Holder } from '../models/Holder.js';
import { Transaction } from '../models/Transaction.js';

export async function saveTokenInfo(tokenData) {
  try {
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

export async function saveHolders(tokenId, holders) {
  try {
    // Find the treasury (holder with highest balance)
    const treasury = holders.reduce((max, h) => h.balance > max.balance ? h : max, holders[0]);

    // Prepare bulk operations
    const operations = holders.map(holder => ({
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

    await Holder.bulkWrite(operations);
    return true;
  } catch (error) {
    console.error('Error saving holders:', error);
    throw error;
  }
}

export async function saveTransactions(tokenId, transactions) {
  try {
    // Get treasury account
    const treasury = await Holder.findOne({ tokenId, isTreasury: true });
    const treasuryId = treasury?.account;

    // Prepare bulk operations
    const operations = transactions.map(tx => ({
      updateOne: {
        filter: {
          tokenId,
          timestamp: new Date(tx.timestamp),
          sender: tx.sender_account,
          receiver: tx.receiver_account
        },
        update: {
          $set: {
            amount: tx.sender_amount,
            involvesTreasury: tx.sender_account === treasuryId || tx.receiver_account === treasuryId
          }
        },
        upsert: true
      }
    }));

    await Transaction.bulkWrite(operations);
    return true;
  } catch (error) {
    console.error('Error saving transactions:', error);
    throw error;
  }
}

export async function getVisualizationData(tokenId) {
  try {
    const [holders, transactions] = await Promise.all([
      Holder.find({ tokenId }).lean(),
      Transaction.find({ tokenId })
        .sort({ timestamp: -1 })
        .limit(10000) // Limit to last 10000 transactions for performance
        .lean()
    ]);

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
