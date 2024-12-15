export function formatTokenAmount(amount, decimals) {
    // Convert to string to handle large numbers
    const amountStr = amount.toString();
    const decimalPower = Math.pow(10, decimals);
    
    // Use string manipulation for precise decimal placement
    if (amountStr.length <= decimals) {
        // Add leading zeros if needed
        const paddedAmount = amountStr.padStart(decimals + 1, '0');
        const integerPart = '0';
        const decimalPart = paddedAmount.slice(0, decimals);
        return parseFloat(`${integerPart}.${decimalPart}`);
    } else {
        const integerPart = amountStr.slice(0, -decimals);
        const decimalPart = amountStr.slice(-decimals);
        return parseFloat(`${integerPart}.${decimalPart}`);
    }
}
