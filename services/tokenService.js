import axios from 'axios';
import * as d3 from 'd3';

const API_URL = 'http://localhost:3001/api';

export async function analyzeToken(tokenId) {
  try {
    const response = await axios.post(`${API_URL}/analyze`, { tokenId });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
}

export async function getTokenTreasuryInfo(tokenId) {
  try {
    const response = await axios.get(`https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/${tokenId}`);
    return {
      treasuryId: response.data.treasury_account_id,
      creatorId: response.data.admin_key?.key
    };
  } catch (error) {
    throw new Error('Failed to fetch treasury information');
  }
}

export async function visualizeToken(tokenId) {
  try {
    const [visualData, treasuryInfo] = await Promise.all([
      axios.get(`${API_URL}/visualize/${tokenId}`),
      getTokenTreasuryInfo(tokenId)
    ]);

    return processDataForVisualization(visualData.data, treasuryInfo);
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
}

function processDataForVisualization(data, treasuryInfo) {
  // Process holders data
  const holders = data.holders.split('\n')
    .slice(1)
    .filter(line => line.trim())
    .map(line => {
      const [account, balance] = line.split(',');
      return { 
        account, 
        balance: parseFloat(balance) || 0,
        isTreasury: account === treasuryInfo.treasuryId
      };
    });

  // Calculate balance ranges for better visualization
  const balances = holders.map(h => h.balance).filter(b => b > 0);
  const maxBalance = Math.max(...balances);
  const minBalance = Math.min(...balances);
  const balanceScale = d3.scaleSqrt()
    .domain([minBalance, maxBalance])
    .range([5, 50]);

  // Create nodes from holders with non-zero balances
  const nodes = holders
    .filter(h => h.balance > 0)
    .map(h => ({
      id: h.account,
      value: h.balance,
      radius: balanceScale(h.balance),
      isTreasury: h.isTreasury
    }));

  // Process transactions data
  const transactions = data.transactions.split('\n')
    .slice(1)
    .filter(line => line.trim())
    .map(line => {
      const [timestamp, , sender, amount, receiver] = line.split(',');
      return {
        timestamp: new Date(timestamp),
        sender,
        amount: parseFloat(amount) || 0,
        receiver,
        involvesTreasury: sender === treasuryInfo.treasuryId || receiver === treasuryInfo.treasuryId
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  // Create links from transactions
  const links = transactions
    .filter(tx => {
      const sourceExists = nodes.some(n => n.id === tx.sender);
      const targetExists = nodes.some(n => n.id === tx.receiver);
      return sourceExists && targetExists;
    })
    .map(tx => ({
      source: tx.sender,
      target: tx.receiver,
      value: tx.amount,
      timestamp: tx.timestamp,
      involvesTreasury: tx.involvesTreasury
    }));

  return { 
    nodes, 
    links,
    treasuryInfo
  };
}