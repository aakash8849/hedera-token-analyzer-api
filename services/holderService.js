const path = require('path');
const constants = require('../config/constants');
const mirrorNode = require('../api/mirrorNode');
const { formatTokenAmount } = require('../utils/formatUtils');
const { writeCSV, readCSV } = require('../utils/fileUtils');

async function loadPreviousHolders(tokenDir, tokenId) {
    const holdersPath = path.join(tokenDir, `${tokenId}_holders.csv`);
    try {
        const holders = await readCSV(holdersPath);
        if (!holders) return new Map();
        
        // Convert string balances to numbers for accurate comparison
        return new Map(holders.map(h => [
            h.Account, 
            Number(h.Balance) // Ensure balance is a number
        ]));
    } catch (error) {
        console.error('Error loading previous holders:', error.message);
        return new Map();
    }
}

async function compareHolders(currentHolders, previousHolders) {
    const changes = {
        new: [],
        changed: [],
        unchanged: []
    };

    for (const holder of currentHolders) {
        const account = holder.account;
        const currentBalance = Number(holder.formattedBalance); // Ensure current balance is a number
        const previousBalance = previousHolders.get(account);

        if (previousBalance === undefined) {
            // New holder
            changes.new.push(holder);
        } else {
            // Compare with small epsilon to handle floating point precision
            const epsilon = 1e-8;
            const balanceDiff = Math.abs(currentBalance - previousBalance);
            
            if (balanceDiff > epsilon) {
                // Balance changed
                changes.changed.push(holder);
            } else {
                // Balance unchanged
                changes.unchanged.push(holder);
            }
        }
    }

    // Log detailed information for verification
    console.log('\nDetailed Changes Analysis:');
    console.log(`Total current holders: ${currentHolders.length}`);
    console.log(`Total previous holders: ${previousHolders.size}`);
    console.log(`New holders: ${changes.new.length}`);
    console.log(`Changed balances: ${changes.changed.length}`);
    console.log(`Unchanged: ${changes.unchanged.length}`);

    return changes;
}

async function fetchAllHolders(tokenId, tokenInfo, tokenDir) {
    let holders = [];
    let nextLink = '';
    let retryCount = 0;

    const previousHolders = await loadPreviousHolders(tokenDir, tokenId);
    console.log(`\nLoaded ${previousHolders.size} previous holders`);

    do {
        try {
            const url = `${constants.BASE_URL}/tokens/${tokenId}/balances${nextLink}`;
            const data = await mirrorNode.makeRequest(url);
            
            const formattedHolders = data.balances.map(holder => ({
                ...holder,
                formattedBalance: formatTokenAmount(holder.balance, tokenInfo.decimals)
            }));
            
            holders = holders.concat(formattedHolders);
            nextLink = data.links && data.links.next ? `?${data.links.next.split('?')[1]}` : '';
            retryCount = 0;

            process.stdout.write(`\rFetched ${holders.length} holders`);
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            if (retryCount < constants.MAX_RETRIES) {
                retryCount++;
                console.error(`\nError fetching holders (attempt ${retryCount}/${constants.MAX_RETRIES}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                continue;
            }
            console.error(`\nFailed to fetch all holders after ${constants.MAX_RETRIES} attempts`);
            break;
        }
    } while (nextLink);

    console.log(`\nFound ${holders.length} current holders`);
    
    const changes = await compareHolders(holders, previousHolders);
    
    // Save all current holders
    const holdersPath = path.join(tokenDir, `${tokenId}_holders.csv`);
    const holdersData = holders.map(holder => [
        holder.account,
        holder.formattedBalance.toString() // Ensure balance is stored as string
    ]);
    
    await writeCSV(holdersPath, ['Account', 'Balance'], holdersData);
    console.log(`\nSaved holders to ${holdersPath}`);
    
    return {
        all: holders,
        changes
    };
}

module.exports = {
    fetchAllHolders,
    loadPreviousHolders
};