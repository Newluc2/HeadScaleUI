// ============================================================
// Headscale WebUI - API Client
// ============================================================

const API = {
  async _fetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 && !url.includes('/auth/login')) {
        App.showLogin();
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },

  // Auth
  login(username, password) {
    return this._fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  logout() {
    return this._fetch('/api/auth/logout', { method: 'POST' });
  },

  me() {
    return this._fetch('/api/auth/me');
  },

  changePassword(currentPassword, newPassword) {
    return this._fetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // Nodes
  getNodes() {
    return this._fetch('/api/nodes');
  },

  deleteNode(id) {
    return this._fetch(`/api/nodes/${id}`, { method: 'DELETE' });
  },

  // Users
  getUsers() {
    return this._fetch('/api/users');
  },

  createUser(name) {
    return this._fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  // Preauthkeys
  getPreauthKeys(user) {
    return this._fetch(`/api/preauthkeys/${encodeURIComponent(user)}`);
  },

  createPreauthKey(user, opts = {}) {
    return this._fetch('/api/preauthkeys', {
      method: 'POST',
      body: JSON.stringify({ user, ...opts })
    });
  },

  // Shell
  execShell(command) {
    return this._fetch('/api/shell', {
      method: 'POST',
      body: JSON.stringify({ command })
    });
  },

  // Logs
  getLogs() {
    return this._fetch('/api/logs');
  },

  // Config
  getConfig() {
    return this._fetch('/api/config');
  },

  // WebUI Users
  getWebuiUsers() {
    return this._fetch('/api/webui-users');
  },

  createWebuiUser(username, password, role) {
    return this._fetch('/api/webui-users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  },

  deleteWebuiUser(id) {
    return this._fetch(`/api/webui-users/${id}`, { method: 'DELETE' });
  }
};
