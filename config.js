// ============================================================
// Headscale WebUI - Server Configuration
// ============================================================

module.exports = {
  // Server port
  port: process.env.PORT || 3000,

  // Session secret (change this in production!)
  sessionSecret: process.env.SESSION_SECRET || 'headscale-webui-secret-change-me',

  // Headscale server URL (API + used for generating tailscale up commands)
  headscaleUrl: process.env.HEADSCALE_URL || 'http://127.0.0.1:8080',

  // Headscale API Key (généré avec: headscale apikeys create)
  headscaleApiKey: process.env.HEADSCALE_API_KEY || '',

  // Default admin credentials (change on first login!)
  defaultAdmin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin'
  },

  // Session max age (milliseconds) - default 8 hours
  sessionMaxAge: 8 * 60 * 60 * 1000,

  // Database file path
  dbPath: process.env.DB_PATH || './data/headscale-webui.db',
};
