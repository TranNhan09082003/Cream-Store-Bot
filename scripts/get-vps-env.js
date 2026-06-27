import 'dotenv/config';
console.log('BOT_TOKEN starts with:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.slice(0, 15) : 'none');
console.log('CLIENT_ID:', process.env.CLIENT_ID);
console.log('GUILD_ID:', process.env.GUILD_ID);
process.exit(0);
