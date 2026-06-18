module.exports = {
  apps: [
    {
      name: 'cenar-store-bot',
      script: './src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      kill_timeout: 8000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/bot1-out.log',
      error_file: './logs/bot1-error.log',
      merge_logs: false,
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env'
      }
    },
    {
      name: 'cenar-store-bot-2',
      script: './src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      kill_timeout: 8000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/bot2-out.log',
      error_file: './logs/bot2-error.log',
      merge_logs: false,
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.store2'
      }
    }
  ]
};
