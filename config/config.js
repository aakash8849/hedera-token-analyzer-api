export const config = {
  port: process.env.PORT || 3001,
  corsOrigins: [
    'http://localhost:5173',
    'https://hedera-token-analyzer.netlify.app'
  ],
  storage: {
    baseDir: process.env.NODE_ENV === 'production' 
      ? (process.env.STORAGE_DIR || '/data')
      : 'token_data',
    tokenDir: 'tokens'
  },
  mirrorNode: {
    baseUrl: 'https://mainnet-public.mirrornode.hedera.com/api/v1',
    timeout: 30000,
    maxRetries: 3
  }
};
