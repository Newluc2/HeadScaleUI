// ============================================================
// Headscale WebUI - API Routes
// ============================================================

const express = require('express');
const router = express.Router();
const hs = require('./headscale');
const { getDB } = require('./db');
const config = require('./config');

// ---- Auth Middleware ----
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ---- Auth Routes ----
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const db = await getDB();
  const user = db.verifyPassword(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = user;
  db.log(username, 'LOGIN', 'User logged in');
  res.json({ ok: true, user: { username: user.username, role: user.role } });
});

router.post('/auth/logout', async (req, res) => {
  if (req.session.user) {
    const db = await getDB();
    db.log(req.session.user.username, 'LOGOUT', 'User logged out');
  }
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

router.post('/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' });
  }
  const db = await getDB();
  const user = db.verifyPassword(req.session.user.username, currentPassword);
  if (!user) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.changePassword(req.session.user.username, newPassword);
  db.log(req.session.user.username, 'CHANGE_PASSWORD', 'Password changed');
  res.json({ ok: true });
});

// ---- Nodes ----
router.get('/nodes', requireAuth, async (req, res) => {
  try {
    const nodes = await hs.listNodes();
    res.json({ nodes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/nodes/:id', requireAdmin, async (req, res) => {
  try {
    await hs.removeNode(req.params.id);
    const db = await getDB();
    db.log(req.session.user.username, 'DELETE_NODE', `Deleted node ${req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Users ----
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await hs.listHeadscaleUsers();
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'User name required' });
    await hs.createHeadscaleUser(name);
    const db = await getDB();
    db.log(req.session.user.username, 'CREATE_USER', `Created Headscale user: ${name}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Preauthkeys ----
router.get('/preauthkeys/:user', requireAuth, async (req, res) => {
  try {
    const keys = await hs.listPreauthKeys(req.params.user);
    res.json({ keys });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/preauthkeys', requireAdmin, async (req, res) => {
  try {
    const { user, reusable, ephemeral, expiration } = req.body;
    if (!user) return res.status(400).json({ error: 'User required' });
    const key = await hs.createPreauthKey(user, { reusable, ephemeral, expiration });
    const db = await getDB();
    db.log(req.session.user.username, 'CREATE_KEY', `Created preauthkey for user: ${user}`);
    res.json({ key, headscaleUrl: config.headscaleUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Shell (restricted) ----
router.post('/shell', requireAdmin, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command required' });
    }

    const trimmed = command.trim();
    if (!trimmed.startsWith('headscale')) {
      return res.status(403).json({ error: 'Only headscale commands are allowed' });
    }

    const output = await hs.execShellCommand(trimmed);
    const db = await getDB();
    db.log(req.session.user.username, 'SHELL', trimmed);
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Audit Logs ----
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const logs = db.getLogs(500);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- WebUI Users Management ----
router.get('/webui-users', requireAdmin, async (req, res) => {
  const db = await getDB();
  const users = db.listUsers();
  res.json({ users });
});

router.post('/webui-users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const db = await getDB();
    db.createUser(username, password, role || 'readonly');
    db.log(req.session.user.username, 'CREATE_WEBUI_USER', `Created WebUI user: ${username} (${role || 'readonly'})`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/webui-users/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDB();
    db.deleteUser(req.params.id);
    db.log(req.session.user.username, 'DELETE_WEBUI_USER', `Deleted WebUI user #${req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Config info ----
router.get('/config', requireAuth, (req, res) => {
  res.json({
    headscaleUrl: config.headscaleUrl
  });
});

// ---- Debug / Health check ----
router.get('/debug', requireAuth, async (req, res) => {
  const result = {
    headscaleUrl: config.headscaleUrl,
    apiKeySet: !!config.headscaleApiKey,
    apiKeyPrefix: config.headscaleApiKey ? config.headscaleApiKey.substring(0, 8) + '...' : 'NOT SET',
  };

  // Test /node
  try {
    const r = await fetch(`${config.headscaleUrl}/api/v1/node`, {
      headers: { 'Authorization': `Bearer ${config.headscaleApiKey}` }
    });
    result.nodeEndpoint = { status: r.status, ok: r.ok };
  } catch (e) {
    result.nodeEndpoint = { error: e.message };
  }

  // Test /user
  try {
    const r = await fetch(`${config.headscaleUrl}/api/v1/user`, {
      headers: { 'Authorization': `Bearer ${config.headscaleApiKey}` }
    });
    const body = await r.text();
    result.userEndpoint = { status: r.status, ok: r.ok, body: body.substring(0, 200) };
  } catch (e) {
    result.userEndpoint = { error: e.message };
  }

  // Test preauthkey (liste uniquement, sans user)
  try {
    const r = await fetch(`${config.headscaleUrl}/api/v1/preauthkey`, {
      headers: { 'Authorization': `Bearer ${config.headscaleApiKey}` }
    });
    result.preauthkeyEndpoint = { status: r.status, ok: r.ok };
  } catch (e) {
    result.preauthkeyEndpoint = { error: e.message };
  }

  res.json(result);
});

module.exports = router;
