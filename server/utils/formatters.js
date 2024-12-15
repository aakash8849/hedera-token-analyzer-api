export function formatTokenAmount(amount, decimals) {
    return amount / Math.pow(10, decimals);
}

export function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}