import { join } from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_STORAGE_DIR = process.env.NODE_ENV === 'production' 
  ? (process.env.STORAGE_DIR || '/data')
  : join(__dirname, '..', 'token_data');

export class TokenAnalyzer {
    constructor(tokenId) {
        this.tokenId = tokenId;
        this.tokenInfo = null;
        this.startTimestamp = Date.now();
        this.lastRequestTime = Date.now();
        this.requestCount = 0;
        this.sixMonthsAgoTimestamp = (Date.now() - (6 * 30 * 24 * 60 * 60 * 1000)) / 1000;
        this.tokenDir = join(BASE_STORAGE_DIR, `${tokenId}_token_data`);
    }

    // ... (keep existing methods)

    async getVisualizationData() {
        try {
            const holdersPath = join(this.tokenDir, `${this.tokenId}_holders.csv`);
            const transactionsPath = join(this.tokenDir, `${this.tokenId}_transactions.csv`);

            const [holdersData, transactionsData] = await Promise.all([
                fs.readFile(holdersPath, 'utf8'),
                fs.readFile(transactionsPath, 'utf8')
            ]);

            return {
                holders: holdersData,
                transactions: transactionsData
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Data not found. Please analyze the token first.');
            }
            throw error;
        }
    }
}