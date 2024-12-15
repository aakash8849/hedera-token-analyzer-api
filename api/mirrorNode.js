const axios = require('axios');
const constants = require('../config/constants');

async function makeRequest(url, params = {}) {
    try {
        const response = await axios.get(url, {
            params,
            timeout: constants.REQUEST_TIMEOUT
        });
        return response.data;
    } catch (error) {
        throw new Error(`API request failed: ${error.message}`);
    }
}

async function getTokenInfo(tokenId) {
    try {
        const data = await makeRequest(`${constants.BASE_URL}/tokens/${tokenId}`);
        return {
            name: data.name,
            symbol: data.symbol,
            decimals: data.decimals,
            total_supply: data.total_supply
        };
    } catch (error) {
        throw new Error(`Failed to fetch token information: ${error.message}`);
    }
}

module.exports = {
    makeRequest,
    getTokenInfo
};