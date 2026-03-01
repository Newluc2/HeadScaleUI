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
    throw new Error('HEADSCALE_API_KEY non configurée. Générez une clé avec: headscale apikeys create');
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

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    let msg = `Headscale API error ${res.status}`;
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

async function listNodes() {
  const data = await hsAPI('GET', '/machine');
  return data.machines || data.nodes || [];
}

async function removeNode(nodeId) {
  const id = String(nodeId).replace(/\D/g, '');
  if (!id) throw new Error('Invalid node ID');
  return hsAPI('DELETE', `/machine/${id}`);
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
  const data = await hsAPI('GET', `/preauthkey?user=${encodeURIComponent(user)}`);
  return data.preAuthKeys || data.preauthKeys || [];
}

async function createPreauthKey(user, opts = {}) {
  const body = {
    user: user,
    reusable: opts.reusable || false,
    ephemeral: opts.ephemeral || false,
  };
  if (opts.expiration) {
    // Convertir "24h" en date ISO
    const match = opts.expiration.match(/^(\d+)h$/);
    if (match) {
      const hours = parseInt(match[1]);
      const exp = new Date(Date.now() + hours * 3600 * 1000);
      body.expiration = exp.toISOString();
    }
  }
  const data = await hsAPI('POST', '/preauthkey', body);
  return data.preAuthKey || data.preauthKey || data;
}

// ── Shell (API proxy) ──────────────────────────────────

async function execShellCommand(command) {
  // Parse "headscale xxx" commands and map to API calls
  const trimmed = command.trim();
  if (!trimmed.startsWith('headscale')) {
    throw new Error('Seules les commandes headscale sont autorisées');
  }

  const parts = trimmed.replace(/^headscale\s+/, '').split(/\s+/);
  const sub = parts[0];

  switch (sub) {
    case 'nodes':
    case 'node':
      if (parts[1] === 'list' || !parts[1]) {
        const nodes = await listNodes();
        return formatNodesTable(nodes);
      }
      if (parts[1] === 'delete' || parts[1] === 'remove') {
        const id = parts.find((p, i) => parts[i - 1] === '-i' || parts[i - 1] === '--identifier') || parts[2];
        await removeNode(id);
        return `Node ${id} supprimé.`;
      }
      break;

    case 'users':
    case 'user':
      if (parts[1] === 'list' || !parts[1]) {
        const users = await listHeadscaleUsers();
        return formatUsersTable(users);
      }
      if (parts[1] === 'create' && parts[2]) {
        await createHeadscaleUser(parts[2]);
        return `User "${parts[2]}" créé.`;
      }
      break;

    case 'preauthkeys':
    case 'preauthkey':
      if (parts[1] === 'list') {
        const userFlag = parts.indexOf('-u');
        const user = userFlag >= 0 ? parts[userFlag + 1] : parts[2];
        if (!user) throw new Error('User requis: headscale preauthkeys list -u <user>');
        const keys = await listPreauthKeys(user);
        return formatKeysTable(keys);
      }
      break;

    case 'version':
      return 'Headscale (via API) - Utilisez l\'interface web pour les actions.';

    case '--help':
    case '-h':
    case 'help':
      return [
        'Commandes disponibles (via API):',
        '  headscale nodes list              - Lister les nodes',
        '  headscale nodes delete -i <id>    - Supprimer un node',
        '  headscale users list              - Lister les users',
        '  headscale users create <name>     - Créer un user',
        '  headscale preauthkeys list -u <u> - Lister les clés',
      ].join('\n');

    default:
      throw new Error(`Sous-commande non supportée: ${sub}. Tapez "headscale help" pour l'aide.`);
  }

  throw new Error(`Commande non reconnue. Tapez "headscale help" pour l'aide.`);
}

// ── Formatters ─────────────────────────────────────────

function formatNodesTable(nodes) {
  if (!nodes.length) return 'Aucun node trouvé.';
  const lines = ['ID\tNom\tUser\tIP\tOnline'];
  for (const n of nodes) {
    const name = n.givenName || n.given_name || n.name || '-';
    const user = n.user?.name || n.user || '-';
    const ips = (n.ipAddresses || n.ip_addresses || []).join(', ') || '-';
    const online = n.online ? 'online' : 'offline';
    lines.push(`${n.id}\t${name}\t${user}\t${ips}\t${online}`);
  }
  return lines.join('\n');
}

function formatUsersTable(users) {
  if (!users.length) return 'Aucun user trouvé.';
  const lines = ['ID\tNom\tCréé le'];
  for (const u of users) {
    lines.push(`${u.id}\t${u.name}\t${u.createdAt || u.created_at || '-'}`);
  }
  return lines.join('\n');
}

function formatKeysTable(keys) {
  if (!keys.length) return 'Aucune clé trouvée.';
  const lines = ['Clé\tRéutilisable\tÉphémère\tExpiration'];
  for (const k of keys) {
    const key = (k.key || k.id || '-').substring(0, 20) + '...';
    lines.push(`${key}\t${k.reusable || false}\t${k.ephemeral || false}\t${k.expiration || '-'}`);
  }
  return lines.join('\n');
}

module.exports = {
  listNodes,
  removeNode,
  listHeadscaleUsers,
  listPreauthKeys,
  createPreauthKey,
  createHeadscaleUser,
  execShellCommand,
};
