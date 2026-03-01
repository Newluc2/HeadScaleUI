// ============================================================
// Headscale WebUI - Database Layer (sql.js - pure JS SQLite)
// ============================================================

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const config = require('./config');

class DB {
  constructor() {
    this.db = null;
    this._ready = this._init();
  }

  async _init() {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(config.dbPath)) {
      const buffer = fs.readFileSync(config.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin if no users exist
    const result = this.db.exec('SELECT COUNT(*) as c FROM users');
    const count = result[0]?.values[0][0] || 0;
    if (count === 0) {
      const hash = bcrypt.hashSync(config.defaultAdmin.password, 10);
      this.db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [config.defaultAdmin.username, hash, 'admin']);
      console.log(`[DB] Default admin user created: ${config.defaultAdmin.username}`);
    }

    this._save();
  }

  _save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(config.dbPath, buffer);
    } catch (e) {
      console.error('[DB] Save error:', e.message);
    }
  }

  _getAll(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  _getOne(sql, params = []) {
    const rows = this._getAll(sql, params);
    return rows[0] || null;
  }

  _run(sql, params = []) {
    this.db.run(sql, params);
    this._save();
  }

  // ---- Users ----
  findUser(username) {
    return this._getOne('SELECT * FROM users WHERE username = ?', [username]);
  }

  verifyPassword(username, password) {
    const user = this.findUser(username);
    if (!user) return null;
    if (bcrypt.compareSync(password, user.password)) {
      return { id: user.id, username: user.username, role: user.role };
    }
    return null;
  }

  changePassword(username, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    this._run('UPDATE users SET password = ? WHERE username = ?', [hash, username]);
  }

  listUsers() {
    return this._getAll('SELECT id, username, role, created_at FROM users');
  }

  createUser(username, password, role = 'readonly') {
    const hash = bcrypt.hashSync(password, 10);
    this._run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role]);
  }

  deleteUser(id) {
    this._run('DELETE FROM users WHERE id = ?', [id]);
  }

  // ---- Audit Log ----
  log(username, action, detail = '') {
    this._run('INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)', [username, action, detail]);
  }

  getLogs(limit = 200) {
    return this._getAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit]);
  }
}

// Export a promise-based singleton
let instance = null;

async function getDB() {
  if (!instance) {
    instance = new DB();
    await instance._ready;
  }
  return instance;
}

module.exports = { getDB };
