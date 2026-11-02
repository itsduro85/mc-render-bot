const express = require('express');
const mineflayer = require('mineflayer');

// ---------- Config (set these as environment variables on Render) ----------
const config = {
  host: process.env.MC_HOST || 'mcplaytime.mcsh.gg', // your server address
  port: parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'Pipilika',
  version: process.env.MC_VERSION || false,          // e.g. "1.20.4"; false = auto-detect
  auth: process.env.MC_AUTH || 'offline',            // 'offline' for cracked servers
  reconnectDelayMs: parseInt(process.env.RECONNECT_MINUTES || '1', 10) * 60 * 1000,
  connectTimeoutMs: 60 * 1000,
  httpPort: parseInt(process.env.PORT || '3000', 10), // Render injects PORT
};

if (!config.host) {
  console.error('MC_HOST is not set. Set it to your server address.');
  process.exit(1);
}

// ---------- State ----------
let bot = null;
let online = false;
let reconnectTimer = null;
let connectTimeout = null;
let activityTimers = [];
let lastEvent = 'starting';
let lastEventAt = new Date();

function log(msg) {
  lastEvent = msg;
  lastEventAt = new Date();
  console.log(`[${lastEventAt.toISOString()}] ${msg}`);
}

// ---------- Anti-AFK behaviour ----------
function clearActivity() {
  activityTimers.forEach((t) => clearInterval(t));
  activityTimers = [];
}

function startAntiAfk() {
  clearActivity();

  // Rapid jumping: press jump for 100ms every 500ms
  activityTimers.push(
    setInterval(() => {
      if (!bot || !online) return;
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 100);
    }, 500)
  );

  // Random head rotation every 3s (some AFK plugins also check camera movement)
  activityTimers.push(
    setInterval(() => {
      if (!bot || !online) return;
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * 0.6;
      bot.look(yaw, pitch, true).catch(() => {});
    }, 3000)
  );

  // Arm swing every 10s
  activityTimers.push(
    setInterval(() => {
      if (!bot || !online) return;
      bot.swingArm('right');
    }, 10000)
  );
}

// ---------- Connection / reconnect logic ----------
function scheduleReconnect(reason) {
  if (reconnectTimer) return; // already scheduled
  online = false;
  clearActivity();
  clearTimeout(connectTimeout);
  const mins = config.reconnectDelayMs / 60000;
  log(`Disconnected (${reason}). Retrying in ${mins} min...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, config.reconnectDelayMs);
}

function startBot() {
  if (bot) {
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (_) {}
    bot = null;
  }

  log(`Connecting to ${config.host}:${config.port} as ${config.username}...`);

  try {
    bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version,
      auth: config.auth,
      hideErrors: true,
    });
  } catch (err) {
    scheduleReconnect(`failed to create bot: ${err.message}`);
    return;
  }

  // If we never spawn (hung connection), give up and retry later
  connectTimeout = setTimeout(() => {
    if (!online) {
      log('Connection timed out.');
      try { bot.end(); } catch (_) {}
      scheduleReconnect('connect timeout');
    }
  }, config.connectTimeoutMs);

  bot.once('spawn', () => {
    online = true;
    clearTimeout(connectTimeout);
    log('Joined the server. Anti-AFK running.');
    startAntiAfk();
  });

  bot.on('kicked', (reason) => {
    let text = reason;
    try { text = typeof reason === 'string' ? reason : JSON.stringify(reason); } catch (_) {}
    log(`Kicked: ${text}`);
  });

  bot.on('error', (err) => {
    log(`Error: ${err.message}`);
    // Connection failures (server offline etc.) surface here before 'end'
    if (!online) scheduleReconnect(err.code || err.message);
  });

  bot.on('end', (reason) => scheduleReconnect(reason || 'connection ended'));
}

// ---------- Keep-alive web server (for UptimeRobot / cron-job.org) ----------
const app = express();

app.get('/', (_req, res) => {
  res.send(`Bot is ${online ? 'ONLINE' : 'OFFLINE'} | last event: ${lastEvent}`);
});

app.get('/health', (_req, res) => {
  res.json({
    botOnline: online,
    lastEvent,
    lastEventAt,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.listen(config.httpPort, () => log(`Web server listening on port ${config.httpPort}`));

// Never let a stray error kill the process
process.on('uncaughtException', (err) => log(`Uncaught exception: ${err.message}`));
process.on('unhandledRejection', (err) => log(`Unhandled rejection: ${err && err.message}`));

startBot();
