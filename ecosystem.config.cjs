module.exports = {
  apps: [
    {
      name: 'cenar-store-bot',
      script: './src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
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
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.store2'
      }
    }
  ]
};
