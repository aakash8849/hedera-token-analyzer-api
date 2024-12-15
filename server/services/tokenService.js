import axios from 'axios';
import { config } from '../../config/config.js';

export async function getTokenInfo(tokenId) {
    try {
        const response = await axios.get(
            `${config.mirrorNode.baseUrl}/tokens/${tokenId}`,
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

export async function fetchHolders(tokenId) {
    let holders = [];
    let nextLink = '';
    
    do {
        try {
            const url = `${config.mirrorNode.baseUrl}/tokens/${tokenId}/balances${nextLink}`;
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