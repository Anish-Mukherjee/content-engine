// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'content-pipeline',
    script: 'dist/index.js',
    cwd: '/srv/content-pipeline',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=450',
    instances: 1,
    autorestart: true,
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true,
  }],
};
