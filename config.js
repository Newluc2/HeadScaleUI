// ============================================================
// Headscale WebUI - Server Configuration
// ============================================================

module.exports = {
  // Server port
  port: process.env.PORT || 3000,

  // Session secret (change this in production!)
  sessionSecret: process.env.SESSION_SECRET || 'headscale-webui-secret-change-me',

  // Headscale server URL (used for generating tailscale up commands)
  headscaleUrl: process.env.HEADSCALE_URL || 'https://headscale.example.com',

  // Path to headscale binary
  headscaleBin: process.env.HEADSCALE_BIN || 'headscale',

  // Default admin credentials (change on first login!)
  defaultAdmin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin'
  },

  // Session max age (milliseconds) - default 8 hours
  sessionMaxAge: 8 * 60 * 60 * 1000,

  // Database file path
  dbPath: process.env.DB_PATH || './data/headscale-webui.db',

  // Allowed headscale subcommands in shell
  allowedCommands: [
    'node', 'nodes', 'user', 'users',
    'preauthkeys', 'preauthkey',
    'routes', 'route',
    'apikeys', 'apikey',
    'debug',
    'serve',
    'version',
    '--help', '-h'
  ]
};
