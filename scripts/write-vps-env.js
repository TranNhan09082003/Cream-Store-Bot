import { execSync } from 'node:child_process';

console.log('Copying local .env and .env.store2 to VPS...');
try {
  execSync('scp -o StrictHostKeyChecking=no -i C:/Users/ivano/.ssh/oracle_bot .env root@103.179.189.36:/opt/cenar-store/.env');
  execSync('scp -o StrictHostKeyChecking=no -i C:/Users/ivano/.ssh/oracle_bot .env.store2 root@103.179.189.36:/opt/cenar-store/.env.store2');
  console.log('Successfully written env files to VPS!');
} catch (err) {
  console.error('Error writing to VPS:', err.message);
}
