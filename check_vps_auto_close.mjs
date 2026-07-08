import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const { VPS_HOST, VPS_PORT, VPS_USER, VPS_PASS } = process.env;

if (!VPS_HOST || !VPS_USER || !VPS_PASS) {
  console.error('Missing VPS credentials. Set VPS_HOST, VPS_USER, VPS_PASS in environment.');
  process.exit(1);
}

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;

    const tempPath = path.join(process.cwd(), 'data', 'vps_active_temp.sqlite');
    sftp.fastGet('data/shopbot.sqlite', tempPath, (err) => {
      if (err) {
        console.error('Download failed:', err.message);
        conn.end();
        return;
      }

      const db = new Database(tempPath, { readonly: true });

      try {
        const ticket = db.prepare("SELECT * FROM tickets WHERE ticket_code = 'TKT_968637'").get();
        console.log('=== VPS TKT_968637 ===');
        console.log(ticket);

        const dueTickets = db.prepare("SELECT * FROM tickets WHERE auto_close_at IS NOT NULL AND status = 'OPEN'").all();
        console.log('\n=== VPS OPEN TICKETS WITH auto_close_at ===');
        console.log(dueTickets);
      } catch (e) {
        console.error(e.message);
      }

      db.close();
      fs.unlinkSync(tempPath);
      conn.end();
    });
  });
}).connect({
  host: VPS_HOST,
  port: parseInt(VPS_PORT || '2022', 10),
  username: VPS_USER,
  password: VPS_PASS,
});
