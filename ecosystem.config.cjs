module.exports = {
  apps: [
    {
      name: 'cenar-store-launcher',
      script: './src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      // Launcher + 2 child bots dùng nhiều hơn 300M — tăng lên để tránh restart giữa chừng
      max_memory_restart: '900M',
      restart_delay: 5000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/launcher-out.log',
      error_file: './logs/launcher-error.log',
      merge_logs: false,
      env: {
        NODE_ENV: 'production',
        // KHÔNG set IS_CHILD_BOT — để launcher chạy đúng chế độ parent/proxy
        // Launcher tự fork Store 1 (.env) và Store 2 (.env.store2)
      }
    }
  ]
};
