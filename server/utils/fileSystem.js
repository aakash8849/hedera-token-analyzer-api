import fs from 'fs/promises';
import { join } from 'path';

export async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

export async function writeCSV(filePath, headers, data) {
    const content = [headers.join(',')];
    data.forEach(row => {
        content.push(row.map(cell => 
            typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
        ).join(','));
    });
    await fs.writeFile(filePath, content.join('\n'));
}

export async function readCSV(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('File not found');
        }
        throw error;
    }
}