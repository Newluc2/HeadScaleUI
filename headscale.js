// ============================================================
// Headscale WebUI - Headscale command executor
// ============================================================

const { execFile } = require('child_process');
const config = require('./config');

/**
 * Execute a headscale command safely.
 * Only allows whitelisted subcommands.
 */
function execHeadscale(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    // Validate first arg is an allowed subcommand
    if (!args || args.length === 0) {
      return reject(new Error('No arguments provided'));
    }

    const subcommand = args[0].replace(/^-+/, '').toLowerCase();
    const isAllowed = config.allowedCommands.some(cmd =>
      subcommand === cmd.replace(/^-+/, '').toLowerCase()
    );

    if (!isAllowed) {
      return reject(new Error(`Command not allowed: ${args[0]}`));
    }

    // Sanitize arguments - prevent shell injection
    const sanitized = args.map(arg => {
      if (/[;&|`$(){}]/.test(arg)) {
        throw new Error(`Invalid character in argument: ${arg}`);
      }
      return arg;
    });

    execFile(config.headscaleBin, sanitized, { timeout }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      resolve(stdout);
    });
  });
}

/**
 * Parse headscale node list output (JSON format).
 */
async function listNodes() {
  try {
    const output = await execHeadscale(['nodes', 'list', '-o', 'json']);
    return JSON.parse(output);
  } catch (e) {
    // Fallback: try without json
    const output = await execHeadscale(['nodes', 'list']);
    return parseTextTable(output);
  }
}

/**
 * Remove a node by ID.
 */
async function removeNode(nodeId) {
  const id = String(nodeId).replace(/\D/g, '');
  if (!id) throw new Error('Invalid node ID');
  return execHeadscale(['nodes', 'delete', '-i', id, '--force']);
}

/**
 * List users.
 */
async function listHeadscaleUsers() {
  try {
    const output = await execHeadscale(['users', 'list', '-o', 'json']);
    return JSON.parse(output);
  } catch {
    const output = await execHeadscale(['users', 'list']);
    return parseTextTable(output);
  }
}

/**
 * List preauthkeys for a user.
 */
async function listPreauthKeys(user) {
  try {
    const output = await execHeadscale(['preauthkeys', 'list', '-u', user, '-o', 'json']);
    return JSON.parse(output);
  } catch {
    const output = await execHeadscale(['preauthkeys', 'list', '-u', user]);
    return parseTextTable(output);
  }
}

/**
 * Create a preauthkey for a user.
 */
async function createPreauthKey(user, opts = {}) {
  const args = ['preauthkeys', 'create', '-u', user];
  if (opts.reusable) args.push('--reusable');
  if (opts.ephemeral) args.push('--ephemeral');
  if (opts.expiration) args.push('-e', opts.expiration);
  args.push('-o', 'json');

  try {
    const output = await execHeadscale(args);
    return JSON.parse(output);
  } catch {
    // retry without json
    const argsNoJson = args.filter(a => a !== '-o' && a !== 'json');
    const output = await execHeadscale(argsNoJson);
    return { raw: output.trim() };
  }
}

/**
 * Create a user.
 */
async function createHeadscaleUser(name) {
  return execHeadscale(['users', 'create', name]);
}

/**
 * Parse simple text table output as fallback.
 */
function parseTextTable(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  return lines.map(l => l.trim());
}

module.exports = {
  execHeadscale,
  listNodes,
  removeNode,
  listHeadscaleUsers,
  listPreauthKeys,
  createPreauthKey,
  createHeadscaleUser
};
