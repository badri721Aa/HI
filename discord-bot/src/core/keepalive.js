'use strict';
/**
 * Tiny HTTP server. Hosts like Render/Koyeb need an open port, and uptime
 * monitors (UptimeRobot, BetterStack…) can ping it to keep free instances awake.
 */
const http = require('node:http');
const log = require('./logger').child('web');

function startKeepAlive(port, getClients) {
  const server = http.createServer((req, res) => {
    const clients = getClients();
    const status = {
      ok: clients.length > 0 && clients.every((c) => c.isReady()),
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      bots: clients.map((c) => ({
        name: c.botProfile.name,
        tag: c.user?.tag || null,
        ready: c.isReady(),
        pingMs: c.ws.ping,
        servers: c.guilds.cache.size,
        commandsRun: c.stats.commands,
      })),
    };
    if (req.url === '/health') {
      res.writeHead(status.ok ? 200 : 503, { 'content-type': 'text/plain' });
      return res.end(status.ok ? 'OK' : 'STARTING');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  });
  server.listen(port, '0.0.0.0', () => log.info(`Keep-alive server listening on port ${port} (GET / or /health).`));
  server.on('error', (err) => log.error('Keep-alive server error:', err.message));
  return server;
}

module.exports = { startKeepAlive };
