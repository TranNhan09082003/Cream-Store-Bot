import { db } from '../src/database/db.js';
console.log('DB Name:', db.name);
try {
  const row = db.prepare('SELECT 1').get();
  console.log('Row:', row);
} catch (err) {
  console.error('Error executing query:', err);
}
process.exit(0);
