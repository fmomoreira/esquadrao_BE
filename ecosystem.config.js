const path = require('path');
require('dotenv').config();

module.exports = {
  apps: [{
    name: 'esquadrao-be',
    script: './dist/server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '20G',  // Reinicia se chegar a 20GB
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=20480', // 20GB para o Node.js
      PORT: process.env.PORT || 8080,
      DB_HOST: process.env.DB_HOST || 'localhost',
      DB_PORT: process.env.DB_PORT || 5432,
      DB_NAME: process.env.DB_NAME || 'zaplg',
      DB_USER: process.env.DB_USER || 'zaplg',
      DB_PASS: process.env.DB_PASS || 'infor@pgsql$27024',
      REDIS_URI: process.env.REDIS_URI || 'redis://127.0.0.1:6379',
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      // Adicione outras variáveis de ambiente conforme necessário
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true
  }]
};
