import { JSONFilePreset } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultData = { users: [] };

// Export the database instance
export const db = await JSONFilePreset(join(__dirname, '../data/users.json'), defaultData);