// ============================================================
// Headscale WebUI - Headscale API Client (HTTP)
// ============================================================

const config = require('./config');

const BASE = config.headscaleUrl.replace(/\/+$/, '');
const API_PREFIX = `${BASE}/api/v1`;

/**
 * Make an authenticated request to the Headscale API.
 */
async function hsAPI(method, path, body = null) {
  if (!config.headscaleApiKey) {
    throw new Error('HEADSCALE_API_KEY non configurée. Exécutez: headscale apikeys create  puis ajoutez la clé dans le docker-compose.yml');
  }

  const url = `${API_PREFIX}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${config.headscaleApiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error(`Impossible de contacter Headscale sur ${BASE} : ${e.message}`);
  }

  const text = await res.text();

  if (!res.ok) {
    let msg = `Headscale API [${res.status}] ${url}`;
    try {
      const json = JSON.parse(text);
      msg = json.message || json.error || msg;
    } catch { msg = text || msg; }
    throw new Error(msg);
  }

  if (!text) return {};
  return JSON.parse(text);
}

// ── Nodes ──────────────────────────────────────────────
// Headscale v0.23+ utilise /node, les versions antérieures utilisent /machine

async function listNodes() {
  // Essaie d'abord /node (v0.23+), puis fallback sur /machine (v0.22-)
  try {
    const data = await hsAPI('GET', '/node');
    return data.nodes || data.machines || [];
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('not found')) {
      const data = await hsAPI('GET', '/machine');
      return data.machines || data.nodes || [];
    }
    throw e;
  }
}

async function removeNode(nodeId) {
  const id = String(nodeId).replace(/\D/g, '');
  if (!id) throw new Error('Invalid node ID');
  // Essaie /node (v0.23+), puis fallback sur /machine (v0.22-)
  try {
    return await hsAPI('DELETE', `/node/${id}`);
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('not found')) {
      return await hsAPI('DELETE', `/machine/${id}`);
    }
    throw e;
  }
}

// ── Users ──────────────────────────────────────────────

async function listHeadscaleUsers() {
  const data = await hsAPI('GET', '/user');
  return data.users || [];
}

async function createHeadscaleUser(name) {
  return hsAPI('POST', '/user', { name });
}

// ── Preauthkeys ────────────────────────────────────────

async function listPreauthKeys(user) {
  // v0.23+: GET /api/v1/preauthkey?user=<name>
  try {
    const data = await hsAPI('GET', `/preauthkey?user=${encodeURIComponent(user)}`);
    return data.preAuthKeys || data.preauthKeys || [];
  } catch (e) {
    // Certaines versions utilisent /user/:name/preauthkey
    try {
      const data = await hsAPI('GET', `/user/${encodeURIComponent(user)}/preauthkey`);
      return data.preAuthKeys || data.preauthKeys || [];
    } catch {
      throw e;
    }
  }
}

async function resolveUserId(nameOrId) {
  // Si c'est déjà un entier, on le retourne tel quel
  if (/^\d+$/.test(String(nameOrId))) return String(nameOrId);
  // Sinon on cherche l'utilisateur par nom
  const users = await listHeadscaleUsers();
  const found = users.find(u => u.name === nameOrId);
  if (!found) throw new Error(`Utilisateur "${nameOrId}" introuvable dans Headscale`);
  return String(found.id);
}

async function createPreauthKey(user, opts = {}) {
  // Calcul de la date d'expiration ISO
  let expiration = null;
  if (opts.expiration) {
    const match = opts.expiration.match(/^(\d+)h$/);
    if (match) {
      const hours = parseInt(match[1]);
      expiration = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    }
  }

  // Headscale v0.23+ attend l'ID numérique, pas le nom
  let userId;
  try {
    userId = await resolveUserId(user);
  } catch {
    userId = user; // fallback : envoyer tel quel
  }

  const body = {
    user:      userId,
    reusable:  opts.reusable  || false,
    ephemeral: opts.ephemeral || false,
  };
  if (expiration) body.expiration = expiration;

  try {
    const data = await hsAPI('POST', '/preauthkey', body);
    return data.preAuthKey || data.preauthKey || data;
  } catch (e) {
    // Fallback : certaines versions attendent le nom en string ou l'user dans l'URL
    try {
      // Essai avec le nom original dans le body
      const body2 = { user, reusable: opts.reusable||false, ephemeral: opts.ephemeral||false };
      if (expiration) body2.expiration = expiration;
      const data = await hsAPI('POST', '/preauthkey', body2);
      return data.preAuthKey || data.preauthKey || data;
    } catch {
      // Dernier fallback : user dans l'URL
      try {
        const data = await hsAPI('POST', `/user/${encodeURIComponent(user)}/preauthkey`, {
          reusable:   opts.reusable  || false,
          ephemeral:  opts.ephemeral || false,
          ...(expiration ? { expiration } : {}),
        });
        return data.preAuthKey || data.preauthKey || data;
      } catch {
        throw e; // Remonte l'erreur originale
      }
    }
  }
}

// ── Shell (proxy API complet) ───────────────────────────
// Parse les commandes headscale et les mappe vers l'API REST.
// Supporte toutes les sous-commandes via un mapping générique.

const RESOURCE_MAP = {
  // commande CLI → { endpoint, listField, legacyEndpoint? }
  'nodes':        { get: '/node',    list: 'nodes',       legacy: '/machine',     legacyList: 'machines' },
  'node':         { get: '/node',    list: 'nodes',       legacy: '/machine',     legacyList: 'machines' },
  'machines':     { get: '/machine', list: 'machines' },
  'machine':      { get: '/machine', list: 'machines' },
  'users':        { get: '/user',    list: 'users' },
  'user':         { get: '/user',    list: 'users' },
  'namespaces':   { get: '/user',    list: 'users' },
  'namespace':    { get: '/user',    list: 'users' },
  'preauthkeys':  { get: '/preauthkey', list: 'preAuthKeys' },
  'preauthkey':   { get: '/preauthkey', list: 'preAuthKeys' },
  'routes':       { get: '/routes',  list: 'routes' },
  'route':        { get: '/routes',  list: 'routes' },
  'apikeys':      { get: '/apikey',  list: 'apiKeys' },
  'apikey':       { get: '/apikey',  list: 'apiKeys' },
  'policy':       { get: '/policy',  list: null },
  'acls':         { get: '/policy',  list: null },
};

function parseFlags(parts) {
  const flags = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('-')) {
      const key = parts[i].replace(/^-+/, '');
      const val = parts[i + 1] && !parts[i + 1].startsWith('-') ? parts[++i] : true;
      flags[key] = val;
      // alias communs
      if (key === 'i') flags['identifier'] = val;
      if (key === 'u') flags['user'] = val;
      if (key === 'n') flags['name'] = val;
    }
  }
  return flags;
}

function formatJSON(data, resource) {
  // Essaie d'extraire la liste pertinente
  const map = RESOURCE_MAP[resource] || {};
  const list = map.list && data[map.list] ? data[map.list]
    : (map.legacyList && data[map.legacyList] ? data[map.legacyList] : null);

  const items = list !== null ? list : (Array.isArray(data) ? data : null);

  if (items === null) {
    // Objet unique
    return JSON.stringify(data, null, 2);
  }
  if (!items.length) return '(vide)';
  return JSON.stringify(items, null, 2);
}

async function execShellCommand(command) {
  const trimmed = command.trim();

  // Aide générale
  if (trimmed === 'help' || trimmed === '--help' || trimmed === '-h') {
    return HELP_TEXT;
  }

  if (!trimmed.toLowerCase().startsWith('headscale')) {
    throw new Error('Seules les commandes "headscale ..." sont autorisées');
  }

  // Retire "headscale" du début
  const rest = trimmed.replace(/^headscale\s*/i, '').trim();

  if (!rest || rest === 'help' || rest === '--help' || rest === '-h') {
    return HELP_TEXT;
  }

  // version
  if (rest === 'version' || rest === '--version') {
    try {
      const d = await hsAPI('GET', '/apikey'); // endpoint léger pour check
      return 'Headscale (API) - connexion OK';
    } catch {
      return 'Headscale (API) - vérifiez la configuration';
    }
  }

  const parts = rest.split(/\s+/);
  const resource = parts[0].toLowerCase();
  const action   = (parts[1] || 'list').toLowerCase();
  const flags    = parseFlags(parts.slice(2));
  const map      = RESOURCE_MAP[resource];

  if (!map) {
    // Commande inconnue → tentative générique GET
    throw new Error(`Sous-commande "${resource}" inconnue.\nTapez "headscale help" pour la liste des commandes.`);
  }

  // ── LIST ──
  if (action === 'list' || action === 'ls') {
    let url = map.get;
    // Certains endpoints nécessitent un paramètre user
    if (resource === 'preauthkeys' || resource === 'preauthkey') {
      const user = flags.user || flags.u || flags.n;
      if (!user) throw new Error('Usage: headscale preauthkeys list --user <nom>');
      url = `${url}?user=${encodeURIComponent(user)}`;
    }
    if (resource === 'routes' || resource === 'route') {
      const nodeId = flags.identifier || flags.i || flags['node-id'];
      if (nodeId) url = `${url}?node_id=${encodeURIComponent(nodeId)}`;
    }
    try {
      const data = await hsAPI('GET', url);
      return formatJSON(data, resource);
    } catch (e) {
      if (map.legacy && (e.message.includes('404') || e.message.includes('not found'))) {
        const data = await hsAPI('GET', map.legacy);
        return formatJSON(data, resource);
      }
      throw e;
    }
  }

  // ── GET / SHOW ──
  if (action === 'get' || action === 'show' || action === 'info') {
    const id = flags.identifier || flags.i || flags.id || parts[2];
    if (!id) throw new Error(`Usage: headscale ${resource} ${action} --identifier <id>`);
    try {
      const data = await hsAPI('GET', `${map.get}/${id}`);
      return JSON.stringify(data, null, 2);
    } catch (e) {
      if (map.legacy) {
        const data = await hsAPI('GET', `${map.legacy}/${id}`);
        return JSON.stringify(data, null, 2);
      }
      throw e;
    }
  }

  // ── CREATE ──
  if (action === 'create' || action === 'add' || action === 'register') {
    let body = {};
    // user/namespace create --name <name>
    if (resource === 'users' || resource === 'user' || resource === 'namespaces' || resource === 'namespace') {
      const name = flags.name || flags.n || parts[2];
      if (!name) throw new Error(`Usage: headscale ${resource} create --name <nom>`);
      body = { name };
    }
    // preauthkey create --user <u> [--reusable] [--ephemeral] [--expiration <Xh>]
    else if (resource === 'preauthkeys' || resource === 'preauthkey') {
      const user = flags.user || flags.u;
      if (!user) throw new Error('Usage: headscale preauthkeys create --user <nom> [--reusable] [--ephemeral] [--expiration <Xh>]');
      const key = await createPreauthKey(user, {
        reusable: flags.reusable !== undefined,
        ephemeral: flags.ephemeral !== undefined,
        expiration: flags.expiration || flags.e,
      });
      return JSON.stringify(key, null, 2);
    }
    // node register --user <u> --key <mkey>
    else if (resource === 'nodes' || resource === 'node') {
      if (action === 'register') {
        const user = flags.user || flags.u;
        const key  = flags.key  || flags.k;
        if (!user || !key) throw new Error('Usage: headscale nodes register --user <nom> --key <mkey:...>');
        // résoudre l'ID
        const userId = await resolveUserId(user);
        body = { user: userId, key };
        const data = await hsAPI('POST', '/node/register', body);
        return JSON.stringify(data, null, 2);
      }
    }
    if (Object.keys(body).length === 0 && !body.name) {
      throw new Error(`Action "${action}" non supportée pour "${resource}"`);
    }
    const data = await hsAPI('POST', map.get, body);
    return JSON.stringify(data, null, 2);
  }

  // ── DELETE / REMOVE ──
  if (action === 'delete' || action === 'remove' || action === 'destroy') {
    const id = flags.identifier || flags.i || flags.id || flags.name || flags.n || parts[2];
    if (!id) throw new Error(`Usage: headscale ${resource} delete --identifier <id>`);
    let resolvedId = id;
    // Pour les users, si c'est un nom, on résout l'ID
    if (resource === 'users' || resource === 'user') {
      resolvedId = await resolveUserId(id);
    }
    // Pour les nodes, nettoyer les non-chiffres
    if (resource === 'nodes' || resource === 'node' || resource === 'machines' || resource === 'machine') {
      resolvedId = String(id).replace(/\D/g, '');
    }
    try {
      await hsAPI('DELETE', `${map.get}/${resolvedId}`);
    } catch (e) {
      if (map.legacy) {
        await hsAPI('DELETE', `${map.legacy}/${resolvedId}`);
      } else throw e;
    }
    return `${resource} #${resolvedId} supprimé.`;
  }

  // ── RENAME ──
  if (action === 'rename') {
    const id      = flags.identifier || flags.i || flags.id || parts[2];
    const newName = flags['new-name'] || flags.name || flags.n || parts[3];
    if (!id || !newName)
      throw new Error(`Usage: headscale ${resource} rename --identifier <id> --new-name <nom>`);
    try {
      const data = await hsAPI('POST', `${map.get}/${id}/rename/${encodeURIComponent(newName)}`);
      return JSON.stringify(data, null, 2);
    } catch (e) {
      if (map.legacy) {
        const data = await hsAPI('POST', `${map.legacy}/${id}/rename/${encodeURIComponent(newName)}`);
        return JSON.stringify(data, null, 2);
      }
      throw e;
    }
  }

  // ── ROUTES : enable / disable ──
  if ((resource === 'routes' || resource === 'route') && (action === 'enable' || action === 'disable')) {
    const id = flags.identifier || flags.i || flags.route || parts[2];
    if (!id) throw new Error(`Usage: headscale routes ${action} --identifier <id>`);
    const data = await hsAPI('POST', `/routes/${id}/${action}`);
    return JSON.stringify(data, null, 2);
  }

  // ── MOVE NODE ──
  if ((resource === 'nodes' || resource === 'node') && action === 'move') {
    const id   = flags.identifier || flags.i || parts[2];
    const user = flags.user || flags.u || parts[3];
    if (!id || !user) throw new Error('Usage: headscale nodes move --identifier <id> --user <nom>');
    const userId = await resolveUserId(user);
    const data = await hsAPI('POST', `/node/${id}/user`, { user: userId });
    return JSON.stringify(data, null, 2);
  }

  // ── EXPIRE ──
  if (action === 'expire') {
    const id = flags.identifier || flags.i || parts[2];
    if (!id) throw new Error(`Usage: headscale ${resource} expire --identifier <id>`);
    let endpoint = `${map.get}/${id}/expire`;
    if (resource === 'preauthkeys' || resource === 'preauthkey') {
      const user = flags.user || flags.u;
      if (!user) throw new Error('Usage: headscale preauthkeys expire --user <nom> --identifier <id>');
      endpoint = `/preauthkey/expire`;
      const data = await hsAPI('POST', endpoint, { user, key: id });
      return JSON.stringify(data, null, 2);
    }
    const data = await hsAPI('POST', endpoint);
    return JSON.stringify(data, null, 2);
  }

  // ── POLICY get/set ──
  if (resource === 'policy' || resource === 'acls') {
    if (action === 'get' || action === 'show') {
      const data = await hsAPI('GET', '/policy');
      return JSON.stringify(data, null, 2);
    }
    throw new Error('headscale policy set : non supporté dans le shell (utilisez l\'interface web)');
  }

  throw new Error(`Action "${action}" non reconnue pour "${resource}".\nTapez "headscale help" pour la liste.`);
}

const HELP_TEXT = `Commandes headscale disponibles (via API REST) :

  Nodes :
    headscale nodes list
    headscale nodes get      --identifier <id>
    headscale nodes delete   --identifier <id>
    headscale nodes rename   --identifier <id> --new-name <nom>
    headscale nodes move     --identifier <id> --user <nom>
    headscale nodes register --user <nom> --key <mkey:...>
    headscale nodes expire   --identifier <id>
    headscale routes list    [--identifier <node_id>]
    headscale routes enable  --identifier <route_id>
    headscale routes disable --identifier <route_id>

  Users :
    headscale users list
    headscale users create   --name <nom>
    headscale users delete   --identifier <id|nom>
    headscale users rename   --identifier <id> --new-name <nom>

  PreAuthKeys :
    headscale preauthkeys list    --user <nom>
    headscale preauthkeys create  --user <nom> [--reusable] [--ephemeral] [--expiration <Xh>]
    headscale preauthkeys expire  --user <nom> --identifier <key>

  API Keys :
    headscale apikeys list

  Autres :
    headscale policy get
    headscale version
`;


module.exports = {
  listNodes,
  removeNode,
  listHeadscaleUsers,
  listPreauthKeys,
  createPreauthKey,
  createHeadscaleUser,
  execShellCommand,
};
