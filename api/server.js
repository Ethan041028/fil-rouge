'use strict';

const express = require('express');
const { Pool } = require('pg');

// ---------- Configuration (100 % variables d'environnement) ----------
const config = {
  port: 8080,
  version: process.env.APP_VERSION || require('./package.json').version,
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'tasks',
    user: process.env.DB_USER || 'tasks',
    password: process.env.POSTGRES_PASSWORD,
  },
};

// ---------- Logs sur stdout (une ligne JSON par événement) ----------
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[config.logLevel] ?? LEVELS.info;
function log(level, msg, extra = {}) {
  if (LEVELS[level] < minLevel) return;
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));
}

// ---------- Base de données ----------
const pool = new Pool({ ...config.db, max: 5, connectionTimeoutMillis: 3000 });
pool.on('error', (err) => log('warn', 'erreur du pool pg', { error: err.message }));

let schemaReady = false;
let retryTimer = null;

async function initSchema() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      done       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    schemaReady = true;
    log('info', 'base prête, table tasks OK', { host: config.db.host });
  } catch (err) {
    log('warn', 'base indisponible, nouvel essai dans 5 s', { error: err.message });
    retryTimer = setTimeout(initSchema, 5000);
  }
}

// ---------- HTTP ----------
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const level = req.path === '/healthz' || req.path === '/ready' ? 'debug' : 'info';
    log(level, 'requête', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

// Liveness : le process tourne, on ne teste PAS la base.
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));

// Readiness : 200 seulement si la base répond.
app.get('/ready', async (req, res) => {
  try {
    if (!schemaReady) throw new Error('schéma pas encore initialisé');
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});

app.get('/api/version', (req, res) => res.json({ version: config.version }));

app.get('/api/tasks', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, title, done FROM tasks ORDER BY id');
    res.json(rows);
  } catch (err) { next(err); }
});

app.post('/api/tasks', async (req, res, next) => {
  const title = (req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title est obligatoire' });
  try {
    const { rows } = await pool.query('INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, done', [title]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'done (booléen) est obligatoire' });
  try {
    const { rows } = await pool.query('UPDATE tasks SET done = $1 WHERE id = $2 RETURNING id, title, done', [req.body.done, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'tâche introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'tâche introuvable' });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  log('error', 'erreur', { path: req.path, error: err.message });
  res.status(err.code === '22P02' ? 400 : 503).json({ error: 'erreur serveur ou base indisponible' });
});

const server = app.listen(config.port, () => {
  log('info', 'API démarrée', { port: config.port, version: config.version });
  initSchema();
});

// ---------- Arrêt propre ----------
function shutdown(signal) {
  log('info', 'arrêt demandé', { signal });
  clearTimeout(retryTimer);
  server.close(async () => {
    await pool.end().catch(() => {});
    log('info', 'arrêt terminé');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
