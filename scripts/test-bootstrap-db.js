import { buildClient } from '../src/bootstrap.js';
import { db } from '../src/database/db.js';
console.log('Imported bootstrap. Now querying db...');
try {
  const row = db.prepare('SELECT 1').get();
  console.log('Success:', row);
} catch (err) {
  console.error('Failed to query db after bootstrap import:', err);
}
process.exit(0);
