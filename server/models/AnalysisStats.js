export class AnalysisStats {
    constructor() {
        this.startTime = Date.now();
        this.holders = {
            total: 0,
            processed: 0,
            withTransactions: 0
        };
        this.transactions = {
            total: 0,
            unique: new Set()
        };
        this.currentBatch = 0;
        this.totalBatches = 0;
    }

    updateHolders(total) {
        this.holders.total = total;
    }

    incrementProcessedHolders() {
        this.holders.processed++;
    }

    incrementHoldersWithTransactions() {
        this.holders.withTransactions++;
    }

    addTransaction(transactionId) {
        if (!this.transactions.unique.has(transactionId)) {
            this.transactions.unique.add(transactionId);
            this.transactions.total++;
        }
    }

    setBatchProgress(current, total) {
        this.currentBatch = current;
        this.totalBatches = total;
    }

    getProgress() {
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        return {
            holders: {
                total: this.holders.total,
                processed: this.holders.processed,
                withTransactions: this.holders.withTransactions,
                progress: this.holders.total ? 
                    ((this.holders.processed / this.holders.total) * 100).toFixed(2) : 0
            },
            transactions: {
                total: this.transactions.total,
                unique: this.transactions.unique.size
            },
            batches: {
                current: this.currentBatch,
                total: this.totalBatches,
                progress: this.totalBatches ? 
                    ((this.currentBatch / this.totalBatches) * 100).toFixed(2) : 0
            },
            elapsedTime: elapsedTime.toFixed(2)
        };
    }
}
