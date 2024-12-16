export function formatTokenAmount(amount, decimals) {
    if (!amount || !decimals) return 0;
    
    try {
        // Convert to string to handle large numbers
        const amountStr = amount.toString();
        
        // Handle negative amounts
        const isNegative = amountStr.startsWith('-');
        const absAmount = isNegative ? amountStr.slice(1) : amountStr;
        
        // Add leading zeros if needed
        const paddedAmount = absAmount.padStart(decimals + 1, '0');
        
        // Split into integer and decimal parts
        const integerPart = paddedAmount.slice(0, -decimals) || '0';
        const decimalPart = paddedAmount.slice(-decimals);
        
        // Combine parts and handle negative sign
        const formattedAmount = `${isNegative ? '-' : ''}${integerPart}.${decimalPart}`;
        
        // Remove trailing zeros after decimal and unnecessary decimal point
        return parseFloat(formattedAmount);
    } catch (error) {
        console.error('Error formatting token amount:', error);
        return 0;
    }
}
