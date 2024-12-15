const path = require('path');

const config = {
    BASE_URL: 'https://mainnet-public.mirrornode.hedera.com/api/v1',
    RATE_LIMIT: 150,
    BATCH_SIZE: 50,
    OUTPUT_DIR: 'token_data',
    REQUEST_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    SIX_MONTHS_IN_MS: 6 * 30 * 24 * 60 * 60 * 1000,
    PROCESSING_DELAY: 200,
    HOLDER_BATCH_SIZE: 25
};

module.exports = config;