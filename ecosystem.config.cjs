// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'content-pipeline',
    // tsx runs TS sources directly — avoids the ESM `.js` extension gap that bare
    // tsc emits. `npm run build` still produces dist/ for typecheck validation.
    script: './node_modules/.bin/tsx',
    args: 'src/index.ts',
    cwd: '/srv/content-pipeline',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=450',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true,
  }],
};
