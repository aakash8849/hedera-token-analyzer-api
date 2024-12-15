import fs from 'fs/promises';

export async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

export function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().replace(/[:.]/g, '-');
}

export function formatTokenAmount(amount, decimals) {
    return amount / Math.pow(10, decimals);
}

export async function writeCSV(filePath, headers, data) {
    const content = [headers.join(',')];
    data.forEach(row => {
        content.push(row.join(','));
    });
    await fs.writeFile(filePath, content.join('\n'));
}