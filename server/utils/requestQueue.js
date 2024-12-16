class RequestQueue {
    constructor() {
        this.queue = new Map(); // Map of tokenId -> Promise
    }

    async enqueue(tokenId, operation) {
        if (this.queue.has(tokenId)) {
            // Wait for existing operation to complete
            await this.queue.get(tokenId);
        }

        // Create new operation promise
        const operationPromise = operation().finally(() => {
            // Cleanup after operation completes
            if (this.queue.get(tokenId) === promise) {
                this.queue.delete(tokenId);
            }
        });

        const promise = operationPromise;
        this.queue.set(tokenId, promise);
        return promise;
    }
}

export const requestQueue = new RequestQueue();
