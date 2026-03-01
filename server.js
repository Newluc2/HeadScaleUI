// ============================================================
// Headscale WebUI - Main Server
// ============================================================

const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const { getDB } = require('./db');

const app = express();

// ---- Middleware ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.sessionMaxAge,
    httpOnly: true,
    sameSite: 'strict'
  }
}));

// ---- API Routes ----
app.use('/api', routes);

// ---- Static Frontend ----
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Start ----
async function start() {
  await getDB(); // Initialize database
  app.listen(config.port, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║    Headscale WebUI                   ║`);
    console.log(`  ║    http://localhost:${config.port}              ║`);
    console.log(`  ║    Default: admin / admin             ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
