// ============================================================
// Headscale WebUI - Main Application
// ============================================================

const App = {
  user: null,
  currentPage: 'nodes',
  shellHistory: [],
  shellHistoryIndex: -1,

  // ---- Init ----
  async init() {
    this.bindEvents();
    this.loadTheme();
    try {
      const data = await API.me();
      this.user = data.user;
      this.showApp();
    } catch {
      this.showLogin();
    }
  },

  // ---- Auth ----
  showLogin() {
    this.user = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-user').focus();
  },

  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-name').textContent = this.user.username;
    document.getElementById('user-role').textContent = this.user.role;
    document.getElementById('user-avatar').textContent = this.user.username[0].toUpperCase();

    // Hide admin-only elements for readonly users
    const adminOnly = ['create-user-card', 'webui-users-card'];
    adminOnly.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = this.user.role === 'admin' ? '' : 'none';
    });

    this.navigateTo('nodes');
  },

  // ---- Navigation ----
  navigateTo(page) {
    this.currentPage = page;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Show the selected page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Load page data
    this.loadPageData(page);
  },

  async loadPageData(page) {
    switch (page) {
      case 'nodes': return this.loadNodes();
      case 'add-node': return this.loadAddNodeUsers();
      case 'users-keys': return this.loadUsersAndKeys();
      case 'logs': return this.loadLogs();
      case 'settings': return this.loadSettings();
    }
  },

  // ---- Nodes ----
  async loadNodes() {
    const loading = document.getElementById('nodes-loading');
    const error = document.getElementById('nodes-error');
    const table = document.getElementById('nodes-table');
    const empty = document.getElementById('nodes-empty');
    const tbody = document.getElementById('nodes-tbody');

    loading.classList.remove('hidden');
    error.classList.add('hidden');
    table.classList.add('hidden');
    empty.classList.add('hidden');

    try {
      const data = await API.getNodes();
      loading.classList.add('hidden');

      const nodes = data.nodes;
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      tbody.innerHTML = nodes.map(node => {
        const isOnline = this.isNodeOnline(node);
        const statusClass = isOnline ? 'online' : 'offline';
        const statusText = isOnline ? 'Online' : 'Offline';
        const lastSeen = this.formatDate(node.lastSeen || node.last_seen || node.lastSuccessfulUpdate);
        const ipList = (node.ipAddresses || node.ip_addresses || []).join(', ') || node.ipAddress || '-';
        const userName = node.user?.name || node.user || node.userName || '-';
        const name = node.givenName || node.given_name || node.name || '-';
        const id = node.id || '-';

        return `
          <tr>
            <td><code>${id}</code></td>
            <td><strong>${this.escapeHtml(name)}</strong></td>
            <td>${this.escapeHtml(userName)}</td>
            <td><code>${this.escapeHtml(ipList)}</code></td>
            <td><span class="status ${statusClass}"><span class="status-dot"></span>${statusText}</span></td>
            <td>${lastSeen}</td>
            <td>
              ${this.user.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="App.confirmDeleteNode('${id}', '${this.escapeHtml(name)}')">Supprimer</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      table.classList.remove('hidden');
    } catch (e) {
      loading.classList.add('hidden');
      error.textContent = `Erreur : ${e.message}`;
      error.classList.remove('hidden');
    }
  },

  isNodeOnline(node) {
    if (node.online !== undefined) return node.online;
    const lastSeen = node.lastSeen || node.last_seen || node.lastSuccessfulUpdate;
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  },

  async confirmDeleteNode(id, name) {
    const confirmed = await this.confirm(
      'Supprimer le node',
      `Êtes-vous sûr de vouloir supprimer le node "${name}" (ID: ${id}) ? Cette action est irréversible.`
    );
    if (!confirmed) return;

    try {
      await API.deleteNode(id);
      this.toast('Node supprimé avec succès', 'success');
      this.loadNodes();
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  },

  // ---- Add Node ----
  async loadAddNodeUsers() {
    const select = document.getElementById('add-node-user');
    try {
      const data = await API.getUsers();
      const users = data.users || [];
      if (Array.isArray(users) && users.length > 0 && typeof users[0] === 'object') {
        select.innerHTML = users.map(u =>
          `<option value="${this.escapeHtml(u.name || u.id)}">${this.escapeHtml(u.name || u.id)}</option>`
        ).join('');
      } else if (Array.isArray(users)) {
        select.innerHTML = users.map(u =>
          `<option value="${this.escapeHtml(u)}">${this.escapeHtml(u)}</option>`
        ).join('');
      } else {
        select.innerHTML = '<option value="">Aucun user</option>';
      }
    } catch (e) {
      select.innerHTML = `<option value="">Erreur: ${e.message}</option>`;
    }
  },

  async generateKey() {
    const user = document.getElementById('add-node-user').value;
    const expiration = document.getElementById('add-node-expiry').value;
    const reusable = document.getElementById('add-node-reusable').checked;
    const ephemeral = document.getElementById('add-node-ephemeral').checked;

    if (!user) {
      this.toast('Veuillez sélectionner un user', 'warning');
      return;
    }

    try {
      const data = await API.createPreauthKey(user, { reusable, ephemeral, expiration });
      const result = document.getElementById('generated-key-result');
      const keyEl = document.getElementById('generated-key-value');
      const cmdEl = document.getElementById('tailscale-command');

      const key = data.key?.key || data.key?.raw || (typeof data.key === 'string' ? data.key : JSON.stringify(data.key));
      const url = data.headscaleUrl || 'https://headscale.example.com';
      const cmd = `tailscale up --login-server ${url} --authkey ${key}`;

      keyEl.textContent = key;
      cmdEl.textContent = cmd;
      result.classList.remove('hidden');

      this.toast('Clé générée avec succès', 'success');
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  },

  copyTailscaleCommand() {
    const cmd = document.getElementById('tailscale-command').textContent;
    navigator.clipboard.writeText(cmd).then(() => {
      this.toast('Commande copiée !', 'success');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast('Commande copiée !', 'success');
    });
  },

  // ---- Users & Keys ----
  async loadUsersAndKeys() {
    const loading = document.getElementById('users-loading');
    const list = document.getElementById('users-list');

    loading.classList.remove('hidden');
    list.innerHTML = '';

    try {
      const data = await API.getUsers();
      const users = data.users || [];
      loading.classList.add('hidden');

      if (!users.length) {
        list.innerHTML = '<div class="empty-state"><p>Aucun user trouvé</p></div>';
        return;
      }

      for (const user of users) {
        const userName = typeof user === 'string' ? user : (user.name || user.id || 'unknown');
        const createdAt = user.createdAt || user.created_at || '';

        let keysHtml = '<div class="loading" style="padding:0.5rem">Chargement des clés...</div>';
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
          <div class="user-card-header" onclick="this.parentElement.classList.toggle('open')">
            <h4>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${this.escapeHtml(userName)}
              ${createdAt ? `<span style="color:var(--text-muted);font-size:0.8rem;font-weight:400">Créé le ${this.formatDate(createdAt)}</span>` : ''}
            </h4>
            <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="user-card-body">${keysHtml}</div>
        `;
        list.appendChild(card);

        // Load keys async
        this.loadKeysForUser(card, userName);
      }
    } catch (e) {
      loading.classList.add('hidden');
      list.innerHTML = `<div class="error-box">Erreur : ${e.message}</div>`;
    }
  },

  async loadKeysForUser(card, userName) {
    const body = card.querySelector('.user-card-body');
    try {
      const data = await API.getPreauthKeys(userName);
      const keys = data.keys || [];

      if (!keys.length || (Array.isArray(keys) && typeof keys[0] === 'string')) {
        body.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Aucune clé de pré-authentification</p>';
        return;
      }

      body.innerHTML = keys.map(k => {
        const keyStr = k.key || k.id || '-';
        const created = this.formatDate(k.createdAt || k.created_at || '');
        const expiry = k.expiration || k.expiresAt || k.expires_at || '';
        const isExpired = expiry ? new Date(expiry) < new Date() : false;
        const used = k.used || false;
        const reusable = k.reusable || false;
        const ephemeral = k.ephemeral || false;

        let statusBadge = '';
        if (isExpired) {
          statusBadge = '<span class="badge badge-danger">Expiré</span>';
        } else if (used && !reusable) {
          statusBadge = '<span class="badge badge-warning">Utilisé</span>';
        } else {
          statusBadge = '<span class="badge badge-success">Valide</span>';
        }

        let tagsBadges = '';
        if (reusable) tagsBadges += '<span class="badge badge-info">Réutilisable</span> ';
        if (ephemeral) tagsBadges += '<span class="badge badge-info">Éphémère</span> ';

        return `
          <div class="key-item">
            <div class="key-value">${this.escapeHtml(keyStr.substring(0, 20))}...</div>
            <div class="key-meta">
              ${statusBadge}
              ${tagsBadges}
              <span>Créé: ${created}</span>
              <span>Expire: ${expiry ? this.formatDate(expiry) : 'Jamais'}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger);font-size:0.85rem">Erreur: ${e.message}</p>`;
    }
  },

  async createHeadscaleUser() {
    const input = document.getElementById('new-user-name');
    const name = input.value.trim();
    if (!name) {
      this.toast('Veuillez entrer un nom d\'utilisateur', 'warning');
      return;
    }
    try {
      await API.createUser(name);
      input.value = '';
      this.toast(`User "${name}" créé avec succès`, 'success');
      this.loadUsersAndKeys();
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  },

  // ---- Shell ----
  async execShellCommand(command) {
    const output = document.getElementById('terminal-output');
    const input = document.getElementById('shell-input');

    if (!command.trim()) return;

    // Add to history
    this.shellHistory.unshift(command);
    if (this.shellHistory.length > 100) this.shellHistory.pop();
    this.shellHistoryIndex = -1;

    // Display command
    const cmdLine = document.createElement('div');
    cmdLine.className = 'terminal-line command';
    cmdLine.textContent = command;
    output.appendChild(cmdLine);

    try {
      const data = await API.execShell(command);
      const raw = data.output || '(aucune sortie)';
      // Essaie de pretty-print le JSON
      let formatted = raw;
      try {
        const parsed = JSON.parse(raw);
        formatted = JSON.stringify(parsed, null, 2);
      } catch { /* pas du JSON, laisser tel quel */ }
      const outLine = document.createElement('pre');
      outLine.className = 'terminal-line output';
      outLine.textContent = formatted;
      output.appendChild(outLine);
    } catch (e) {
      const errLine = document.createElement('div');
      errLine.className = 'terminal-line error';
      errLine.textContent = `Erreur: ${e.message}`;
      output.appendChild(errLine);
    }

    input.value = '';
    output.scrollTop = output.scrollHeight;
  },

  shellNavigateHistory(direction) {
    const input = document.getElementById('shell-input');
    if (direction === 'up') {
      if (this.shellHistoryIndex < this.shellHistory.length - 1) {
        this.shellHistoryIndex++;
        input.value = this.shellHistory[this.shellHistoryIndex];
      }
    } else {
      if (this.shellHistoryIndex > 0) {
        this.shellHistoryIndex--;
        input.value = this.shellHistory[this.shellHistoryIndex];
      } else {
        this.shellHistoryIndex = -1;
        input.value = '';
      }
    }
  },

  // ---- Logs ----
  async loadLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="loading">Chargement...</td></tr>';

    try {
      const data = await API.getLogs();
      const logs = data.logs || [];

      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Aucun log</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => `
        <tr>
          <td>${this.formatDate(log.created_at)}</td>
          <td><strong>${this.escapeHtml(log.username)}</strong></td>
          <td><span class="badge badge-info">${this.escapeHtml(log.action)}</span></td>
          <td>${this.escapeHtml(log.detail || '')}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="error-box">Erreur: ${e.message}</td></tr>`;
    }
  },

  // ---- Settings ----
  async loadSettings() {
    if (this.user.role !== 'admin') return;
    this.loadWebuiUsers();
  },

  async loadWebuiUsers() {
    const list = document.getElementById('webui-users-list');
    try {
      const data = await API.getWebuiUsers();
      const users = data.users || [];
      list.innerHTML = users.map(u => `
        <div class="key-item">
          <strong>${this.escapeHtml(u.username)}</strong>
          <div class="key-meta">
            <span class="badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}">${u.role}</span>
            <span>Créé: ${this.formatDate(u.created_at)}</span>
            ${u.username !== this.user.username ? `<button class="btn btn-danger btn-sm" onclick="App.deleteWebuiUser(${u.id})">Supprimer</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<p class="error-msg">${e.message}</p>`;
    }
  },

  async addWebuiUser() {
    const username = document.getElementById('wui-username').value.trim();
    const password = document.getElementById('wui-password').value;
    const role = document.getElementById('wui-role').value;

    if (!username || !password) {
      this.toast('Identifiant et mot de passe requis', 'warning');
      return;
    }

    try {
      await API.createWebuiUser(username, password, role);
      document.getElementById('wui-username').value = '';
      document.getElementById('wui-password').value = '';
      this.toast('Utilisateur WebUI créé', 'success');
      this.loadWebuiUsers();
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  },

  async deleteWebuiUser(id) {
    const confirmed = await this.confirm('Supprimer l\'utilisateur', 'Voulez-vous vraiment supprimer cet utilisateur WebUI ?');
    if (!confirmed) return;
    try {
      await API.deleteWebuiUser(id);
      this.toast('Utilisateur supprimé', 'success');
      this.loadWebuiUsers();
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  },

  // ---- Change password ----
  async changePassword(e) {
    e.preventDefault();
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    const errEl = document.getElementById('cp-error');
    const successEl = document.getElementById('cp-success');

    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (newPass !== confirm) {
      errEl.textContent = 'Les mots de passe ne correspondent pas';
      errEl.classList.remove('hidden');
      return;
    }

    if (newPass.length < 4) {
      errEl.textContent = 'Le mot de passe doit faire au moins 4 caractères';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      await API.changePassword(current, newPass);
      successEl.textContent = 'Mot de passe changé avec succès';
      successEl.classList.remove('hidden');
      document.getElementById('cp-current').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  // ---- Theme ----
  loadTheme() {
    const theme = localStorage.getItem('headscale-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeButtons(theme);
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('headscale-theme', theme);
    this.updateThemeButtons(theme);
  },

  updateThemeButtons(theme) {
    document.getElementById('btn-theme-light')?.classList.toggle('active', theme === 'light');
    document.getElementById('btn-theme-dark')?.classList.toggle('active', theme === 'dark');
  },

  // ---- Utilities ----
  escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  confirm(title, message) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      modal.classList.remove('hidden');

      const cleanup = (result) => {
        modal.classList.add('hidden');
        document.getElementById('confirm-ok').removeEventListener('click', onOk);
        document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        document.querySelector('.modal-backdrop').removeEventListener('click', onCancel);
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      document.getElementById('confirm-ok').addEventListener('click', onOk);
      document.getElementById('confirm-cancel').addEventListener('click', onCancel);
      document.querySelector('.modal-backdrop').addEventListener('click', onCancel);
    });
  },

  // ---- Event Bindings ----
  bindEvents() {
    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      const username = document.getElementById('login-user').value;
      const password = document.getElementById('login-pass').value;
      try {
        const data = await API.login(username, password);
        this.user = data.user;
        this.showApp();
      } catch (err) {
        errEl.textContent = err.message || 'Identifiants invalides';
        errEl.classList.remove('hidden');
      }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await API.logout();
      this.showLogin();
    });
    document.getElementById('btn-mobile-logout')?.addEventListener('click', async () => {
      await API.logout();
      this.showLogin();
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(item.dataset.page);
      });
    });

    // Mobile menu
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    // Refresh buttons
    document.getElementById('btn-refresh-nodes')?.addEventListener('click', () => this.loadNodes());
    document.getElementById('btn-refresh-users')?.addEventListener('click', () => this.loadUsersAndKeys());
    document.getElementById('btn-refresh-logs')?.addEventListener('click', () => this.loadLogs());

    // Generate key
    document.getElementById('btn-generate-key')?.addEventListener('click', () => this.generateKey());

    // Copy command
    document.getElementById('btn-copy-cmd')?.addEventListener('click', () => this.copyTailscaleCommand());

    // Create user
    document.getElementById('btn-create-user')?.addEventListener('click', () => this.createHeadscaleUser());

    // Shell
    document.getElementById('shell-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('shell-input');
      this.execShellCommand(input.value);
    });

    document.getElementById('shell-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this.shellNavigateHistory('up'); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.shellNavigateHistory('down'); }
    });

    // Theme
    document.getElementById('btn-theme-light')?.addEventListener('click', () => this.setTheme('light'));
    document.getElementById('btn-theme-dark')?.addEventListener('click', () => this.setTheme('dark'));

    // Change password
    document.getElementById('change-password-form')?.addEventListener('submit', (e) => this.changePassword(e));

    // Add WebUI user
    document.getElementById('btn-add-wui-user')?.addEventListener('click', () => this.addWebuiUser());
  }
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => App.init());
