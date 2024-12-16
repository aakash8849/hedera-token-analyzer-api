export const config = {
  port: process.env.PORT || 10000,
  corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5173',
    'https://hedera-token-analyzer.netlify.app'
  ],
  storage: {
    baseDir: process.env.NODE_ENV === 'production' 
      ? (process.env.STORAGE_DIR || '/data')
      : 'token_data'
  },
  mirrorNode: {
    baseUrl: process.env.MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com/api/v1',
    timeout: parseInt(process.env.MIRROR_NODE_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3
  },
  rateLimiting: {
    limit: parseInt(process.env.RATE_LIMIT) || 150,
    batchSize: parseInt(process.env.BATCH_SIZE) || 50,
    holderBatchSize: parseInt(process.env.HOLDER_BATCH_SIZE) || 25,
    processingDelay: parseInt(process.env.PROCESSING_DELAY) || 200,
    minRequestInterval: parseInt(process.env.MIN_REQUEST_INTERVAL) || 100
  }
};
