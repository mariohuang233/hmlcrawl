module.exports = {
  apps: [{
    name: 'electricity-crawler',
    script: './scripts/run-local-crawler.js',
    cwd: 'D:\\projects\\hml\\hml\\hmlcrawl-main',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      USE_DIRECT_IP: 'true',
      LOCAL_ENV_PATH: '.env.local'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
