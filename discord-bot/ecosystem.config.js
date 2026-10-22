// pm2 process file — keeps the bot running forever and restarts it on crashes/reboots.
//   npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'mega-discord-bot',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 1000,
      exp_backoff_restart_delay: 2000,
      max_memory_restart: '1500M',
      kill_timeout: 5000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
