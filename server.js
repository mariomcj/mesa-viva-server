/**
 * Mesa Viva — Servidor local (Express + SQLite + OpenRouter)
 * Substitui Firebase Cloud Functions + Firestore.
 */
"use strict";

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const http = require("http");
const { WebSocketServer } = require("ws");

const R = require("./regras");
const M = require("./mestre");
let SERVER_BASE_URL = process.env.PUBLIC_BASE_URL || "https://download.proflow.online";

// ── Config ──
// Load .env first so env vars are available
try { const fs = require("fs"); if (fs.existsSync(".env")) { const e = fs.readFileSync(".env", "utf8"); for (const l of e.split("\n")) { const m = l.match(/^([^=]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } } catch (_) {}
const PORT = Number(process.env.PORT) || 3062;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
const DB_PATH = process.env.DB_PATH || "./mesa-viva.db";
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// ── Admin ──
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "mesaviva2026";
const _adminTokens = new Set();
function adminMw(req, res, next) {
  const tok = req.headers["x-admin-token"];
  if (!tok || !_adminTokens.has(tok)) return erro(res, 401, "Não autenticado.");
  next();
}

// ── Auth Token ──
function gerarToken() { return crypto.randomBytes(32).toString("hex"); }

function authTokenMw(req, res, next) {
  // Primeiro X-User-Id (UID anônimo/consistente)
  const u = req.headers["x-user-id"];
  if (u) { req.uid = String(u).slice(0, 36); return next(); }
  // Fallback para token
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const row = db.prepare("SELECT userId FROM tokens WHERE token = ?").get(token);
    if (!row) return erro(res, 401, "Token inválido.");
    req.uid = row.userId;
    return next();
  }
  erro(res, 401, "Autenticação necessária.");
}

// ── Database ──
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS mesas (
    codigo TEXT PRIMARY KEY,
    dono TEXT NOT NULL,
    fase TEXT DEFAULT 'lobby',
    tom TEXT DEFAULT 'epico',
    vetos TEXT DEFAULT '',
    qualidade TEXT DEFAULT 'rapido',
    cdVisivel INTEGER DEFAULT 1,
    cena TEXT DEFAULT 'Taverna Javali Cego',
    resumo TEXT DEFAULT '',
    combate TEXT,
    rolagem TEXT,
    processando TEXT,
    inicio INTEGER,
    criadaEm INTEGER DEFAULT (strftime('%s','now')*1000)
  );
  CREATE TABLE IF NOT EXISTS membros (
    codigo TEXT NOT NULL,
    uid TEXT NOT NULL,
    nome TEXT NOT NULL,
    PRIMARY KEY (codigo, uid)
  );
  CREATE TABLE IF NOT EXISTS fichas (
    codigo TEXT NOT NULL,
    uid TEXT NOT NULL,
    dados TEXT NOT NULL,
    PRIMARY KEY (codigo, uid)
  );
  CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    t INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    texto TEXT NOT NULL,
    autor TEXT,
    nome TEXT,
    res TEXT,
    ok INTEGER
  );
`);

// ── Migrations ──
try { db.exec("ALTER TABLE membros ADD COLUMN ultimaAtividade INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN ultimaNarrativa INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN fundo TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS reacoes (codigo TEXT NOT NULL, logId INTEGER NOT NULL, uid TEXT NOT NULL, tipo TEXT NOT NULL, PRIMARY KEY (codigo, logId, uid))"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS sessoes (codigo TEXT NOT NULL, uid TEXT NOT NULL, resumo TEXT DEFAULT '', criadaEm INTEGER DEFAULT (strftime('%s','now')*1000), PRIMARY KEY (codigo, uid))"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, criadoEm INTEGER NOT NULL)"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, userId TEXT NOT NULL, criadoEm INTEGER NOT NULL)"); } catch (e) {}

// ── Helpers ──
function uid() { return crypto.randomUUID().slice(0, 8); }

function json(s) { if (!s) return null; if (typeof s === "object") return s; try { return JSON.parse(s); } catch { return null; } }

function agora() { return Date.now(); }

const ONLINE_WINDOW_MS = 90_000;  // 90s sem bater = offline
const TYPING_TTL_MS = 6_000;      // 6s sem batida = parou de digitar

// Quem está digitando: Map<codigo, Map<uid, {nome, ate}>>
const digitando = new Map();

function atualizarDigitando(codigo, uid, nome, ativo) {
  if (!digitando.has(codigo)) digitando.set(codigo, new Map());
  const m = digitando.get(codigo);
  if (ativo) { m.set(uid, { nome, ate: agora() + TYPING_TTL_MS }); }
  else { m.delete(uid); if (!m.size) digitando.delete(codigo); }
}

function limparDigitando(codigo) {
  if (!digitando.has(codigo)) return;
  const m = digitando.get(codigo);
  const ago = agora();
  for (const [uid, v] of m) { if (v.ate < ago) m.delete(uid); }
  if (!m.size) digitando.delete(codigo);
}

function texto(v, max) {
  let s = String(v ?? "").trim();
  // Remove control chars
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uFFFE\uFFFF]/g, "");
  // Remove lone surrogates
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");
  // Truncate preserving surrogate pairs
  if (s.length > max) {
    s = s.substring(0, max);
    // If ends in high surrogate (start of a pair), drop it
    const last = s.charCodeAt(max - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, max - 1);
  }
  return s;
}

function codigoValido(v) {
  const c = texto(v, 8).toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(c)) return null;
  return c;
}

function erro(res, status, msg) {
  return res.status(status).json({ error: msg });
}

function exigirUsuario(req, res) {
  const u = req.headers["x-user-id"];
  if (!u) return erro(res, 401, "Usuário não identificado. Mande X-User-Id.");
  return String(u).slice(0, 36);
}

const TRAVA_MS = 150_000;

// Carrega mesa + fichas + log recente
function carregar(codigo, uid) {
  const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!m) return null;
  m.combate = json(m.combate);
  m.rolagem = json(m.rolagem);
  m.processando = json(m.processando);
  const membro = db.prepare("SELECT * FROM membros WHERE codigo = ? AND uid = ?").get(codigo, uid);
  if (!membro) return null;
  const fichasRaw = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo);
  const fichas = {};
  for (const f of fichasRaw) fichas[f.uid] = R.normalizarFicha(json(f.dados), f.uid);
  const recentes = db.prepare("SELECT * FROM log WHERE codigo = ? ORDER BY t DESC LIMIT 14").all(codigo).reverse();
  return { codigo, uid, mesa: m, fichas, recentes };
}

function salvarMesa(codigo, campos) {
  const sets = Object.entries(campos).filter(([k]) => k !== "codigo").map(([k]) => `${k} = ?`).join(", ");
  const vals = Object.entries(campos).filter(([k]) => k !== "codigo").map(([, v]) => typeof v === "object" ? JSON.stringify(v) : v);
  if (!sets) return;
  db.prepare(`UPDATE mesas SET ${sets} WHERE codigo = ?`).run(...vals, codigo);
}

function registrar(codigo, ...entradas) {
  const stmt = db.prepare("INSERT INTO log (codigo, t, tipo, texto, autor, nome, res, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const t = agora();
  let nCount = 0;
  for (const [i, e] of entradas.entries()) {
    stmt.run(codigo, t + i, e.tipo, e.texto, e.autor || null, e.nome || null, e.res || null, e.ok != null ? (e.ok ? 1 : 0) : null);
    if (e.tipo === 'narr') { broadcast(codigo, 'narrativa', e); nCount++; }
  }
  if (nCount) salvarMesa(codigo, { ultimaNarrativa: db.prepare("SELECT COALESCE(max(id),0) as id FROM log WHERE codigo = ?").get(codigo).id });
}

function broadcast(codigo, evento, dados) {
  // Notifica todos os WebSocket clients conectados nesta mesa
  const msg = JSON.stringify({ evento, dados });
  for (const ws of wss.clients) {
    if (ws.mesa === codigo && ws.readyState === 1) {
      try { ws.send(msg); } catch {}
    }
  }
}

// ── Middleware de autenticação simples ──
function _tokenUid(req) {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    const row = db.prepare("SELECT userId FROM tokens WHERE token = ?").get(auth.slice(7));
    if (row) return row.userId;
  }
  return null;
}

function authMw(req, res, next) {
  const u = req.headers["x-user-id"] || _tokenUid(req);
  if (!u) return erro(res, 401, "X-User-Id obrigatório");
  req.uid = String(u).slice(0, 36);
  // Atualiza atividade online do membro
  const cod = req.body?.codigo || req.params?.codigo;
  if (cod) {
    const c = codigoValido(cod);
    if (c) db.prepare("UPDATE membros SET ultimaAtividade = ? WHERE codigo = ? AND uid = ?").run(agora(), c, req.uid);
  }
  next();
}

// ── Express ──
const app = express();
// Set server URL for image generation (never latch onto localhost from the tunnel)
app.use((req, res, next) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers['host'] || '');
  if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host)) {
    SERVER_BASE_URL = `https://${host}`;
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Admin redirect — antes do static p/ evitar conflito
app.get(["/admin", "/admin/"], (req, res) => res.redirect(301, "/admin.html"));

// Arquivos estáticos (APK, etc.) sem cache
app.use(express.static("public", {
  setHeaders(res, path) {
    if (path.endsWith(".apk")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
}));
app.use((req, res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); next()});

// ── Rate limiter ──
const RATE_LIMIT = {};
const RATE_MAX = 60;     // requests per window
const RATE_WIN = 60_000; // 1 minute window
app.use((req, res, next) => {
  const uid = req.headers?.["x-user-id"] || req.ip;
  const key = `${uid}:${req.path}`;
  const now = Date.now();
  if (!RATE_LIMIT[key] || now - RATE_LIMIT[key].win > RATE_WIN) {
    RATE_LIMIT[key] = { win: now, count: 1 };
  } else if (RATE_LIMIT[key].count >= RATE_MAX) {
    return erro(res, 429, "Muitas requisições. Aguarde um minuto.");
  } else {
    RATE_LIMIT[key].count++;
  }
  next();
});
// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const k in RATE_LIMIT) {
    if (now - RATE_LIMIT[k].win > RATE_WIN) delete RATE_LIMIT[k];
  }
}, 60_000).unref();

// ── Health ──
app.get("/api/ping", (_, res) => res.json({ status: "pong", server: "mesa-viva" }));

// ── API: Auth ──
app.post("/api/auth/registrar", (req, res) => {
  const nome = texto(req.body?.nome, 30) || "Jogador";
  const email = texto(req.body?.email, 100);
  const senha = req.body?.senha;
  if (!email || email.length < 3) return erro(res, 400, "Email inválido.");
  if (!senha || senha.length < 4) return erro(res, 400, "Senha deve ter no mínimo 4 caracteres.");
  const id = uid();
  try {
    db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, ?, ?)").run(id, nome, email, senha, agora());
    const token = gerarToken();
    db.prepare("INSERT INTO tokens (token, userId, criadoEm) VALUES (?, ?, ?)").run(token, id, agora());
    res.json({ token, usuario: { id, nome, email } });
  } catch (e) {
    if (e.message?.includes("UNIQUE")) return erro(res, 409, "Email já cadastrado.");
    erro(res, 500, "Erro ao registrar.");
  }
});

app.post("/api/auth/login", (req, res) => {
  const email = texto(req.body?.email, 100);
  const senha = req.body?.senha;
  if (!email || !senha) return erro(res, 400, "Email e senha obrigatórios.");
  const user = db.prepare("SELECT id, nome, email FROM usuarios WHERE email = ? AND senha = ?").get(email, senha);
  if (!user) return erro(res, 401, "Email ou senha incorretos.");
  const token = gerarToken();
  db.prepare("INSERT INTO tokens (token, userId, criadoEm) VALUES (?, ?, ?)").run(token, user.id, agora());
  res.json({ token, usuario: user });
});

app.get("/api/user/dados", authTokenMw, (req, res) => {
  const user = db.prepare("SELECT id, nome, email, criadoEm FROM usuarios WHERE id = ?").get(req.uid);
  if (!user) return erro(res, 404, "Usuário não encontrado.");
  res.json(user);
});

app.get("/api/user/mesas", authTokenMw, (req, res) => {
  const criadas = db.prepare("SELECT codigo, fase, criadaEm, 'dono' as papel FROM mesas WHERE dono = ?").all(req.uid);
  const membro = db.prepare(`
    SELECT m.codigo, me.fase, me.criadaEm, 'membro' as papel
    FROM membros m JOIN mesas me ON m.codigo = me.codigo
    WHERE m.uid = ? AND me.dono != ?
  `).all(req.uid, req.uid);
  res.json({ mesas: [...criadas, ...membro] });
});

app.post("/api/mesa/criar", authTokenMw, (req, res) => {
  const nome = texto(req.body?.nome, 30) || "Jogador";
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = Array.from({ length: 5 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
    const existe = db.prepare("SELECT 1 FROM mesas WHERE codigo = ?").get(codigo);
    if (existe) continue;
    db.prepare("INSERT INTO mesas (codigo, dono, criadaEm) VALUES (?, ?, ?)").run(codigo, req.uid, agora());
    db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, req.uid, nome);
    return res.json({ codigo });
  }
  erro(res, 503, "Não consegui criar a mesa.");
});

app.post("/api/mesa/entrar/:codigo", authTokenMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const nome = texto(req.body?.nome, 30) || "Jogador";
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  const total = db.prepare("SELECT COUNT(*) as c FROM membros WHERE codigo = ?").get(codigo).c;
  if (total >= 6) return erro(res, 429, "Mesa cheia.");
  db.prepare("INSERT OR REPLACE INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, req.uid, nome);
  broadcast(codigo, "membro", { uid: req.uid, nome });
  res.json({ codigo });
});

app.post("/api/mesa/:codigo/sair", authTokenMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  db.prepare("DELETE FROM membros WHERE codigo = ? AND uid = ?").run(codigo, req.uid);
  broadcast(codigo, "saiu", { uid: req.uid });
  res.json({ ok: true });
});

// ── API: Google OAuth (PKCE com Web Application) ──
const GOOGLE_CLIENT_ID = "SUA_GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET = "SUA_GOOGLE_CLIENT_SECRET";
const GOOGLE_REDIRECT_URI = "https://download.proflow.online/auth/google/callback";

// Armazena estados PKCE pendentes { state -> { code_verifier, criadoEm } }
const _pkceStates = {};

app.post("/api/auth/google/iniciar", async (req, res) => {
  try {
    const state = uid() + uid(); // 16 chars
    const codeVerifier = crypto.randomBytes(32).base64urlSlice();
    const hash = crypto.createHash("sha256");
    hash.update(codeVerifier);
    const codeChallenge = hash.digest().base64urlSlice();

    _pkceStates[state] = { codeVerifier, criadoEm: Date.now() };

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "code",
      redirect_uri: GOOGLE_REDIRECT_URI,
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline"
    });

    res.json({
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params,
      state
    });
  } catch (e) {
    erro(res, 502, "Erro ao iniciar OAuth: " + String(e));
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.type("html").send("<h2>Faltam parâmetros (code, state).</h2>");

  const dados = _pkceStates[state];
  if (!dados) return res.type("html").send("<h2>State inválido ou expirado.</h2>");

  delete _pkceStates[state];

  try {
    const tr = await (await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: dados.codeVerifier,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    })).json();

    if (tr.error) return res.type("html").send("<h2>Erro Google: " + (tr.error_description || tr.error) + "</h2>");

    // Buscar user info
    const userR = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { "Authorization": "Bearer " + tr.access_token }
    })).json();

    if (userR.error) return res.type("html").send("<h2>Erro ao obter dados do usuário.</h2>");

    // Criar ou buscar usuário
    const email = userR.email;
    const nome = userR.name || userR.given_name || "Jogador";
    let user = db.prepare("SELECT id, nome, email FROM usuarios WHERE email = ?").get(email);
    if (!user) {
      const id = uid();
      db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, '', ?)").run(id, nome, email, Date.now());
      user = { id, nome, email };
    }

    const token = gerarToken();
    db.prepare("INSERT INTO tokens (token, userId, criadoEm) VALUES (?, ?, ?)").run(token, user.id, Date.now());

    // Página de sucesso — mostra o código e armazena o resultado
    _pkceStates[state] = { token, usuario: user };
    res.type("html").send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Login OK</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a1a;color:#e0e0e0;text-align:center}.card{background:#1a1a3a;border-radius:16px;padding:40px 32px;max-width:400px;box-shadow:0 4px 30px rgba(0,0,0,.4)}.ok{font-size:48px;margin-bottom:8px}.codigo{font-size:28px;font-weight:700;letter-spacing:4px;color:#ffd700;background:#2a2a4a;border-radius:10px;padding:12px 20px;margin:16px 0;word-break:break-all}</style></head><body><div class="card"><div class="ok">✓</div><h2>Login com Google</h2><p>Volte para o app e digite o código abaixo:</p><div class="codigo">${state}</div><p style="font-size:14px;color:#888">O app verificará automaticamente.</p></div></body></html>`);
  } catch (e) {
    res.type("html").send("<h2>Erro interno: " + String(e) + "</h2>");
  }
});

app.post("/api/auth/google/verificar", async (req, res) => {
  const state = texto(req.body?.state, 30);
  if (!state) return erro(res, 400, "state obrigatório.");

  const dados = _pkceStates[state];
  if (!dados || !dados.token) return res.json({ status: "pending" });

  const { token, usuario } = dados;
  // Limpa após 1 uso
  delete _pkceStates[state];

  res.json({ status: "done", token, usuario });
});

// ── API: Mesa ──

app.post("/api/criar-mesa", (req, res) => {
  const userHeader = texto(req.headers["x-user-id"], 36);
  const userId = userHeader || uid();
  const nome = texto(req.body?.nome, 30) || "Jogador";
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = Array.from({ length: 5 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
    const existe = db.prepare("SELECT 1 FROM mesas WHERE codigo = ?").get(codigo);
    if (existe) continue;
    db.prepare("INSERT INTO mesas (codigo, dono, criadaEm) VALUES (?, ?, ?)").run(codigo, userId, agora());
    db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, userId, nome);
    return res.json({ codigo, uid: userId });
  }
  erro(res, 503, "Não consegui criar a mesa.");
});

app.post("/api/entrar-mesa", (req, res) => {
  const userHeader = texto(req.headers["x-user-id"], 36);
  const userId = userHeader || uid();
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const nome = texto(req.body?.nome, 30) || "Jogador";
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  const total = db.prepare("SELECT COUNT(*) as c FROM membros WHERE codigo = ?").get(codigo).c;
  if (total >= 6) return erro(res, 429, "Mesa cheia.");
  db.prepare("INSERT OR REPLACE INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, userId, nome);
  broadcast(codigo, "membro", { uid: userId, nome });
  res.json({ codigo, uid: userId });
});

app.post("/api/configurar-mesa", authMw, (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const d = req.body || {};
  const campos = {};
  if (["epico", "humor", "sombrio"].includes(d.tom)) campos.tom = d.tom;
  if (typeof d.vetos === "string") campos.vetos = texto(d.vetos, 300);
  if (["rapido", "caprichado"].includes(d.qualidade)) campos.qualidade = d.qualidade;
  if (typeof d.cdVisivel === "boolean") campos.cdVisivel = d.cdVisivel ? 1 : 0;
  if (Object.keys(campos).length) salvarMesa(codigo, campos);
  res.json({ ok: true });
});

app.post("/api/reiniciar-mesa", authMw, (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa || mesa.dono !== req.uid) return erro(res, 403, "Só o dono pode reiniciar.");
  db.prepare("DELETE FROM log WHERE codigo = ?").run(codigo);
  const fichas = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo);
  for (const f of fichas) {
    const ficha = R.normalizarFicha(json(f.dados), f.uid);
    ficha.pv = ficha.pvMax;
    db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(ficha), codigo, f.uid);
  }
  salvarMesa(codigo, { fase: "lobby", combate: null, rolagem: null, processando: null, resumo: "", inicio: null, cena: "Taverna Javali Cego", fundo: "" });
  broadcast(codigo, "reinicio", {});
  res.json({ ok: true });
});

// ── API: Personagem ──

app.post("/api/criar-personagem", authMw, (req, res) => {
  const conceito = texto(req.body?.conceito, 300);
  if (!conceito) return erro(res, 400, "Descreva seu personagem.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const prompt = `${M.CRICACAO}\n\nConceito: ${conceito}`;
  M.perguntar(OPENROUTER_KEY, prompt, "rapido", 2000)
    .then((r) => res.json({ ficha: R.normalizarFicha(r, req.uid, conceito) }))
    .catch((e) => erro(res, 502, e.message || "Erro ao criar personagem."));
});

app.post("/api/salvar-ficha", authMw, (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const antiga = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, req.uid);
  const mesa = db.prepare("SELECT fase FROM mesas WHERE codigo = ?").get(codigo);
  const nova = R.normalizarFicha(req.body?.ficha, req.uid);
  if (!antiga || mesa?.fase === "lobby") nova.pv = req.body?.ficha?.pv === undefined ? nova.pvMax : nova.pv;
  else {
    const a = json(antiga.dados);
    nova.pv = Math.min(nova.pvMax, Math.max(0, Math.abs(nova.pv - a.pv) <= 1 ? nova.pv : a.pv));
  }
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(codigo, req.uid, JSON.stringify(nova));
  broadcast(codigo, "ficha", { uid: req.uid });
  res.json({ ficha: nova });
});

app.post("/api/gerar-imagem", authMw, async (req, res) => {
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const prompt = texto(req.body?.prompt, 500);
  if (!prompt) return erro(res, 400, "Descreva a imagem.");
  try {
    let url = await M.gerarImagem(OPENROUTER_KEY, `Ilustração para RPG de fantasia: ${prompt}`, SERVER_BASE_URL);
    if (!url) return erro(res, 502, "Não foi possível gerar a imagem.");
    res.json({ url });
  } catch (e) { erro(res, 502, e.message || "Erro ao gerar imagem."); }
});

// ── API: Admin ──

app.post("/api/admin/login", (req, res) => {
  const { user, pass } = req.body || {};
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) return erro(res, 401, "Usuário ou senha inválidos.");
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  _adminTokens.add(token);
  // Remove token antigo do mesmo user (se houver)
  setTimeout(() => _adminTokens.delete(token), 86400000); // expira em 24h
  res.json({ token, user: ADMIN_USER });
});

app.get("/api/admin/mesas", adminMw, (req, res) => {
  const mesas = db.prepare(`
    SELECT m.codigo, m.fase, m.cena, m.tom, m.criadaEm, m.ultimaNarrativa,
      (SELECT COUNT(*) FROM membros WHERE codigo = m.codigo) as qtd_membros,
      (SELECT COUNT(*) FROM fichas WHERE codigo = m.codigo) as qtd_fichas
    FROM mesas m ORDER BY m.criadaEm DESC
  `).all();
  res.json({ mesas });
});

app.get("/api/admin/mesas/:codigo", adminMw, (req, res) => {
  const cod = req.params.codigo;
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(cod);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  const fichas = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(cod).map(r => {
    try { return { uid: r.uid, ...JSON.parse(r.dados) }; } catch { return { uid: r.uid }; }
  });
  const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(cod);
  res.json({ mesa, fichas, membros });
});

app.post("/api/admin/mesas", adminMw, (req, res) => {
  const { codigo, cena, tom } = req.body || {};
  const cod = (codigo || Math.random().toString(36).slice(2, 7)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (cod.length < 3) return erro(res, 400, "Código inválido.");
  const existente = db.prepare("SELECT codigo FROM mesas WHERE codigo = ?").get(cod);
  if (existente) return erro(res, 409, "Código já existe.");
  db.prepare("INSERT INTO mesas (codigo, dono, cena, tom) VALUES (?, 'admin', ?, ?)").run(cod, cena || "Taverna Javali Cego", tom || "epico");
  res.json({ ok: true, codigo: cod });
});

app.put("/api/admin/mesas/:codigo", adminMw, (req, res) => {
  const cod = req.params.codigo;
  const campos = [];
  const params = [];
  for (const k of ["cena", "fase", "tom", "resumo", "fundo"]) {
    if (req.body[k] !== undefined) { campos.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (!campos.length) return erro(res, 400, "Nada a alterar.");
  params.push(cod);
  db.prepare(`UPDATE mesas SET ${campos.join(", ")} WHERE codigo = ?`).run(...params);
  res.json({ ok: true });
});

app.delete("/api/admin/mesas/:codigo", adminMw, (req, res) => {
  const cod = req.params.codigo;
  if (cod === "J6T5N") return erro(res, 403, "Mesa principal protegida.");
  db.prepare("DELETE FROM log WHERE codigo = ?").run(cod);
  db.prepare("DELETE FROM fichas WHERE codigo = ?").run(cod);
  db.prepare("DELETE FROM membros WHERE codigo = ?").run(cod);
  db.prepare("DELETE FROM reacoes WHERE codigo = ?").run(cod);
  db.prepare("DELETE FROM sessoes WHERE codigo = ?").run(cod);
  db.prepare("DELETE FROM mesas WHERE codigo = ?").run(cod);
  res.json({ ok: true });
});

app.post("/api/admin/fichas/:codigo", adminMw, (req, res) => {
  const cod = req.params.codigo;
  const f = req.body || {};
  const uid = f.uid || `admin_${Math.random().toString(36).slice(2, 8)}`;
  if (!f.nome) return erro(res, 400, "Nome obrigatório.");
  const ficha = {
    uid, nome: f.nome, raca: f.raca || "Humano", classe: f.classe || "Guerreiro",
    pv: Math.max(1, Number(f.pv) || 20), pvMax: Math.max(1, Number(f.pvMax) || 20),
    nivel: Math.max(1, Number(f.nivel) || 1), xp: Math.max(0, Number(f.xp) || 0),
    forca: 10, destreza: 10, inteligencia: 10, presenca: 10, ataques: [], pericias: [], inventario: [], moedas: 0
  };
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(cod, uid, JSON.stringify(ficha));
  res.json({ ok: true, uid });
});

app.put("/api/admin/fichas/:codigo/:uid", adminMw, (req, res) => {
  const cod = req.params.codigo, uid = req.params.uid;
  const existente = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(cod, uid);
  let f = existente ? JSON.parse(existente.dados) : {};
  for (const k of ["nome", "raca", "classe"]) if (req.body[k] !== undefined) f[k] = req.body[k];
  if (req.body.pv !== undefined) f.pv = Math.max(0, Number(req.body.pv));
  if (req.body.pvMax !== undefined) f.pvMax = Math.max(1, Number(req.body.pvMax));
  if (req.body.nivel !== undefined) f.nivel = Math.max(1, Number(req.body.nivel));
  if (req.body.xp !== undefined) f.xp = Math.max(0, Number(req.body.xp));
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(cod, uid, JSON.stringify(f));
  res.json({ ok: true });
});

app.delete("/api/admin/fichas/:codigo/:uid", adminMw, (req, res) => {
  const cod = req.params.codigo, uid = req.params.uid;
  db.prepare("DELETE FROM fichas WHERE codigo = ? AND uid = ?").run(cod, uid);
  res.json({ ok: true });
});

// ── API: Jogo ──

app.post("/api/comecar-aventura", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  try {
    const fichas = db.prepare("SELECT COUNT(*) as c FROM fichas WHERE codigo = ?").get(codigo).c;
    if (!fichas) return erro(res, 400, "Crie pelo menos um personagem.");
    salvarMesa(codigo, { fase: "jogo", inicio: agora(), cena: "Taverna Javali Cego", fundo: "", resumo: "", combate: null, rolagem: null, processando: null });
    registrar(codigo, { tipo: "sys", texto: "A sessão começou." });
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Não encontrado.");
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nEVENTO: Abertura da sessão. Faça uma abertura curta apresentando cada personagem do grupo pelo nome e coloque o grupo na taverna Javali Cego, quando Odila Ventoforte se aproxima. Não pergunte o que fazem — apenas narre a cena.\nNão peça testes nem inicie combate.`;
    const r = await M.perguntar(OPENROUTER_KEY, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.8);
    if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
    const campos = {};
    if (r?.cena) campos.cena = texto(r.cena, 60);
    if (Object.keys(campos).length) salvarMesa(codigo, campos);
    broadcast(codigo, "nova", { narracao: r?.narracao || "" });
    res.json({ ok: true });
  } catch (e) { erro(res, 502, e.message); }
});

app.post("/api/agir", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const acao = texto(req.body?.texto, 500);
  if (!acao) return erro(res, 400, "Diga o que faz.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  try {
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Mesa não encontrada.");
    const f = ctx.fichas[req.uid];
    if (!f) return erro(res, 400, "Crie seu personagem.");
    if (ctx.mesa.fase !== "jogo") return erro(res, 400, "Aventura não começou.");
    const rol = json(ctx.mesa.rolagem);
    if (rol) return erro(res, 400, "Há uma rolagem pendente.");
    const vez = R.vezAtual(json(ctx.mesa.combate));
    if (vez) {
      const combate = json(ctx.mesa.combate);
      // Se o combate está pausado, ninguém age
      if (combate?.pausado) return erro(res, 400, "Combate pausado. Retome para agir.");
      // Se o jogador da vez está caído ou foi excluído, avança o combate automaticamente
      const atu = ctx.fichas[vez.id];
      if (!atu || atu.pv <= 0) {
        registrar(ctx.codigo, { tipo: "sys", texto: `${vez.nome} não pode agir — pulando para o próximo.` });
        await avancarCombate(ctx);
        const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
        broadcast(codigo, "atualizar", { mesa: dadosMesa });
        return res.json({ rolagem: null });
      }
      // Se o turno expirou (>10 min), avança automaticamente
      if (combate?.inicioVez && Date.now() - combate.inicioVez > 600000) {
        registrar(ctx.codigo, { tipo: "sys", texto: `Tempo de ${vez.nome} esgotado (10 min) — avançando.` });
        // Pula o jogador que esgotou o tempo
        ctx.uid = vez.id;
        await avancarCombate(ctx);
        const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
        broadcast(codigo, "atualizar", { mesa: dadosMesa });
        return res.json({ rolagem: null });
      }
      if (vez.id !== req.uid) return erro(res, 400, `Vez de ${vez.nome}.`);
    }
    if (f.pv <= 0) return erro(res, 400, `${f.nome} está caído.`);
    const p = json(ctx.mesa.processando);
    if (p) {
      const expirado = agora() - p.desde >= TRAVA_MS;
      if (p.por !== req.uid && !expirado)
        return erro(res, 429, `O Mestre está narrando a ação de ${p.nome}.`);
      if (p.por === req.uid && !expirado)
        return erro(res, 429, "Sua ação já está sendo processada.");
    }
    salvarMesa(codigo, { processando: JSON.stringify({ por: req.uid, nome: ctx.mesa.membros?.[req.uid] || f.nome, desde: agora() }) });
    registrar(codigo, { tipo: "acao", autor: req.uid, nome: f.nome, texto: acao });
    const extra = json(ctx.mesa.combate) ? `É o turno de ${f.nome} no combate. Se for um ataque, peça um teste do tipo "ataque". Se houver inimigos visíveis e o jogador não atacá-los, pode iniciar combate com eles.` : "";
    const r = await M.perguntar(OPENROUTER_KEY, `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nEVENTO: ${f.nome} (id ${req.uid}) declara a ação: "${acao.replace(/"/g, "'")}"\n${extra}`, ctx.mesa.qualidade || "rapido", 3000, 0.7);
    await aplicar(ctx, r, true, req.uid);
    salvarMesa(codigo, { processando: null });
    // Se não gerou rolagem, avança combate
    const novoRol = json(db.prepare("SELECT rolagem FROM mesas WHERE codigo = ?").get(codigo).rolagem);
    if (!novoRol && json(ctx.mesa.combate)) await avancarCombate(ctx);
    const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    broadcast(codigo, "atualizar", { mesa: dadosMesa });
    res.json({ rolagem: novoRol });
  } catch (e) { salvarMesa(codigo, { processando: null }); erro(res, 502, e.message); }
});

app.post("/api/rolar", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const valor = req.body?.valor === undefined || req.body?.valor === null ? null : Number(req.body.valor);
  if (valor !== null && !(Number.isInteger(valor) && valor >= 1 && valor <= 20))
    return erro(res, 400, "O d20 vai de 1 a 20.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  try {
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Mesa não encontrada.");
    const rol = json(ctx.mesa.rolagem);
    if (!rol || rol.jogador !== req.uid) return erro(res, 400, "Não há rolagem pendente para você.");
    const f = ctx.fichas[req.uid];
    if (!f) return erro(res, 400, "Personagem não encontrado.");
    const natural = valor ?? R.d(20);
    const combate = json(ctx.mesa.combate);
    const res2 = R.resolverRolagem(rol, natural, combate, f.nome);
    registrar(codigo, {
      tipo: "roll", texto: `${f.nome} · ${rol.rotulo}: ${res2.natural}${R.sinal(rol.bonus)}${rol.bonus} = ${res2.total} vs ${rol.tipo === "ataque" ? "CA" : "CD"} ${rol.cd}${valor !== null ? " (dado real)" : ""}`,
      res: res2.dano !== undefined ? `acertou, ${res2.dano} de dano` : res2.sucesso ? "sucesso" : "falha",
      ok: res2.sucesso ? 1 : 0,
    });
    const campos = { rolagem: null };
    if (combate) campos.combate = JSON.stringify(combate);
    salvarMesa(codigo, campos);
    const fim = R.combateAcabou(combate, ctx.fichas);
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nEVENTO: Resultado de um teste. Narre a consequência.\n${res2.descricao}${fim ? "\nTodos os inimigos foram derrotados: narre o fim do combate." : ""}\nNão peça outro teste agora (deixe "teste" nulo).`;
    const r = await M.perguntar(OPENROUTER_KEY, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.5);
    await aplicar(ctx, { ...r, combate: null, efeitos: [] }, false, req.uid);
    if (json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate)) await avancarCombate(ctx);
    const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    broadcast(codigo, "atualizar", { mesa: dadosMesa });
    res.json({ natural: res2.natural, total: res2.total, sucesso: res2.sucesso, dano: res2.dano ?? null });
  } catch (e) { erro(res, 502, e.message); }
});

app.post("/api/ideias", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  try {
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Mesa não encontrada.");
    const f = ctx.fichas[req.uid];
    if (!f) return erro(res, 400, "Crie seu personagem.");
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nO jogador de ${f.nome} pediu ajuda: sugira 3 ações úteis e diferentes para ${f.nome} agora, usando as habilidades e o jeito do personagem. Cada uma em primeira pessoa, até 15 palavras, pronta para ser dita.\nResponda SOMENTE com um array JSON de 3 strings.`;
    const r = await M.perguntar(OPENROUTER_KEY, prompt, "rapido", 2000);
    res.json({ ideias: (Array.isArray(r) ? r : []).slice(0, 3).map((s) => texto(s, 160)) });
  } catch (e) { erro(res, 502, e.message); }
});

// ── API: Leitura (para o app) ──

app.get("/api/mesa/:codigo", (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const uid = req.headers["x-user-id"];
  if (uid) {
    const membro = db.prepare("SELECT uid FROM membros WHERE codigo = ? AND uid = ?").get(codigo, String(uid).slice(0, 36));
    if (!membro) return erro(res, 403, "Você não é membro desta mesa.");
    req.uid = String(uid).slice(0, 36);
  }
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  mesa.combate = json(mesa.combate);
  mesa.rolagem = json(mesa.rolagem);
  mesa.processando = json(mesa.processando);
  const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(codigo);
  const m = {};
  const online = [];
  const ago = agora();
  for (const mb of membros) {
    m[mb.uid] = mb.nome;
    if (mb.ultimaAtividade && ago - mb.ultimaAtividade < ONLINE_WINDOW_MS) online.push(mb.uid);
  }
  mesa.membros = m;
  mesa.online = online;
  // Limpa digitando expirado e inclui
  limparDigitando(codigo);
  mesa.digitando = {};
  if (digitando.has(codigo)) {
    for (const [uid, v] of digitando.get(codigo)) mesa.digitando[uid] = v.nome;
  }
  res.json(mesa);
});

app.get("/api/mesa/:codigo/fichas", (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const uid = req.headers["x-user-id"] || _tokenUid(req);
  if (!uid) return erro(res, 401, "X-User-Id obrigatório");
  if (!db.prepare("SELECT uid FROM membros WHERE codigo = ? AND uid = ?").get(codigo, String(uid).slice(0, 36)))
    return erro(res, 403, "Você não é membro desta mesa.");
  const rows = db.prepare("SELECT * FROM fichas WHERE codigo = ?").all(codigo);
  const fichas = {};
  for (const r of rows) fichas[r.uid] = R.normalizarFicha(json(r.dados), r.uid);
  res.json(fichas);
});

app.get("/api/mesa/:codigo/log", (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const uid = req.headers["x-user-id"] || _tokenUid(req);
  if (!uid) return erro(res, 401, "X-User-Id obrigatório");
  if (!db.prepare("SELECT uid FROM membros WHERE codigo = ? AND uid = ?").get(codigo, String(uid).slice(0, 36)))
    return erro(res, 403, "Você não é membro desta mesa.");
  const log = db.prepare("SELECT * FROM log WHERE codigo = ? ORDER BY id DESC LIMIT 50").all(codigo).reverse();
  res.json(log);
});

// ── API: Online / Digitando ──

app.post("/api/mesa/:codigo/typing", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const ativo = req.body?.digitando === true;
  const nome = req.body?.nome || "";
  limparDigitando(codigo);
  atualizarDigitando(codigo, req.uid, texto(nome, 30), ativo);
  broadcast(codigo, "typing", { uid: req.uid, nome: texto(nome, 30), ativo });
  res.json({ ok: true });
});

// ── API: Reações (👍/👎) ──
app.post("/api/mesa/:codigo/reacao", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const logId = Number(req.body?.logId);
  const tipo = String(req.body?.tipo || "");
  if (!logId || !["gostei", "nao_gostei", "desisti"].includes(tipo)) return erro(res, 400, "Tipo inválido.");
  try { db.exec("INSERT OR REPLACE INTO reacoes (codigo, logId, uid, tipo) VALUES (?, ?, ?, ?)", codigo, logId, req.uid, tipo); } catch (e) { return erro(res, 500, "Erro ao salvar reação."); }
  res.json({ ok: true });
});

// ── Pausar/Retomar Combate ──
app.post("/api/mesa/:codigo/combate/pausar", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const m = db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo);
  const combate = json(m?.combate);
  if (!combate) return erro(res, 400, "Não há combate ativo.");
  if (combate.pausado) {
    // Retomar: ajusta o timer para descontar o tempo pausado
    const agora = Date.now();
    const parado = agora - combate.pausadoEm;
    combate.inicioVez = (combate.inicioVez || agora) + parado;
    delete combate.pausado;
    delete combate.pausadoEm;
    db.prepare("UPDATE mesas SET combate = ? WHERE codigo = ?").run(JSON.stringify(combate), codigo);
    registrar(codigo, { tipo: "sys", texto: "⏵ Combate retomado." });
  } else {
    // Pausar
    combate.pausado = true;
    combate.pausadoEm = Date.now();
    db.prepare("UPDATE mesas SET combate = ? WHERE codigo = ?").run(JSON.stringify(combate), codigo);
    registrar(codigo, { tipo: "sys", texto: "⏸ Combate pausado." });
  }
  const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  broadcast(codigo, "atualizar", { mesa: dadosMesa });
  res.json({ ok: true, pausado: !!combate.pausado });
});

// ── Helpers de jogo ──

async function aplicar(ctx, r, permitirTeste, uid) {
  const codigo = ctx.codigo;
  const campos = {};
  if (r?.cena) campos.cena = texto(r.cena, 60);
  if (r?.fundo) campos.fundo = texto(r.fundo, 500);
  // Generate background image when scene has a name and no fundo exists yet
  if (r?.cena && OPENROUTER_KEY && (!ctx.mesa?.fundo || r.cena !== ctx.mesa.cena)) {
    M.gerarImagem(OPENROUTER_KEY, `Ambiente de RPG de fantasia: ${r.cena}, ilustração de fundo para chat, atmosférico, desfoque suave`, SERVER_BASE_URL).then((url) => {
      if (url) salvarMesa(codigo, { fundo: url });
    }).catch(() => {});
  }
  if (r?.resumo) campos.resumo = texto(r.resumo, 900);
  if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
  // XP por participação
  for (const f of Object.values(ctx.fichas)) {
    if (f.pv > 0 && f.xp != null) {
      f.xp = (f.xp || 0) + 5;
      while (f.xp >= f.nivel * 100) { f.xp -= f.nivel * 100; f.nivel = (f.nivel || 1) + 1; registrar(codigo, { tipo: "sys", texto: `${f.nome} subiu para nível ${f.nivel}!`, ok: 1 }); }
      db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, f.uid);
    }
  }
  for (const ef of Array.isArray(r?.efeitos) ? r.efeitos.slice(0, 6) : []) {
    const alvoId = ef?.alvo;
    let f = ctx.fichas[alvoId];
    if (!f) f = Object.values(ctx.fichas).find((x) => x.nome === alvoId);
    if (f) {
      if (ef.cura) { const v = R.rolar(String(ef.cura)).total; f.pv = Math.min(f.pvMax, f.pv + v); registrar(codigo, { tipo: "roll", texto: `${f.nome} recupera ${v} PV`, ok: 1 }); }
      if (ef.dano) { const v = R.rolar(String(ef.dano)).total; f.pv = Math.max(0, f.pv - v); registrar(codigo, { tipo: "roll", texto: `${f.nome} sofre ${v} de dano`, ok: 0 }); }
      db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, f.uid);
      continue;
    }
    // Se o alvo não for um jogador, pode ser um inimigo do combate
    const combate = json(ctx.mesa?.combate || campos?.combate);
    if (combate?.inimigos) {
      const ini = combate.inimigos.find((i) => i.id === alvoId || i.nome === alvoId);
      if (ini && ef.dano) {
        const v = R.rolar(String(ef.dano)).total;
        ini.pv = Math.max(0, ini.pv - v);
        ini.pvMax = ini.pvMax || ini.pv; // garante pvMax se não existir
        registrar(codigo, { tipo: "roll", texto: `${ini.nome} sofre ${v} de dano`, ok: 1 });
        campos.combate = JSON.stringify(combate);
      }
    }
  }
  if (Array.isArray(r?.combate?.inimigos) && r.combate.inimigos.length && !ctx.mesa.combate) {
    const jogadores = Object.values(ctx.fichas).filter((f) => f.pv > 0);
    const c = R.iniciarCombate(jogadores, r.combate.inimigos);
    campos.combate = JSON.stringify(c);
    registrar(codigo, { tipo: "sys", texto: "Combate! Iniciativa: " + c.ordem.map((o) => `${o.nome} ${o.ini}`).join(" · ") });
  }
  let rolagem = null;
  const minha = ctx.fichas[uid || ctx.uid];
  if (permitirTeste && r?.teste && minha) {
    const combate = json(ctx.mesa.combate) || json(campos.combate);
    rolagem = R.montarRolagem(minha, r.teste, combate, String(agora()));
    if (rolagem) campos.rolagem = JSON.stringify(rolagem);
  }
  if (Object.keys(campos).length) salvarMesa(codigo, campos);
}

async function avancarCombate(ctx) {
  const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(ctx.codigo);
  const combate = json(m.combate);
  if (!combate) return;
  if (R.combateAcabou(combate, ctx.fichas)) {
    salvarMesa(ctx.codigo, { combate: null });
    registrar(ctx.codigo, { tipo: "sys", texto: "Combate encerrado." });
    // XP por vitória
    for (const f of Object.values(ctx.fichas)) {
      if (f.pv > 0 && f.xp != null) {
        f.xp = (f.xp || 0) + 25;
        while (f.xp >= f.nivel * 100) { f.xp -= f.nivel * 100; f.nivel = (f.nivel || 1) + 1; }
        db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), ctx.codigo, f.uid);
      }
    }
    broadcast(ctx.codigo, "combate-fim", {});
    return;
  }
  const antes = {};
  for (const f of Object.values(ctx.fichas)) antes[f.uid] = f.pv;
  const ocorrido = R.passarVez(combate, ctx.fichas, ctx.uid);
  for (const f of Object.values(ctx.fichas)) {
    if (f.pv !== antes[f.uid]) db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), ctx.codigo, f.uid);
  }
  salvarMesa(ctx.codigo, { combate: JSON.stringify(combate) });
  if (ocorrido.length) {
    for (const o of ocorrido) registrar(ctx.codigo, { tipo: "roll", texto: o.log.texto, ok: o.log.ok ? 1 : 0 });
  }
  broadcast(ctx.codigo, "atualizar", {});
  if (!OPENROUTER_KEY || !ocorrido.length) return;
  const prox = R.vezAtual(combate);
  // Tenta narrar o turno dos inimigos (com 1 retry se falhar)
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await M.perguntar(OPENROUTER_KEY, `${M.contexto(m, Object.values(ctx.fichas), [])}\n\nTurno dos inimigos. Narre o que aconteceu, com base exatamente nestes resultados já rolados pelo código:\n${ocorrido.map((o) => o.linha).join("\n")}${prox ? `\nDepois disso é a vez de ${prox.nome}. A situação pede ação de ${prox.nome}.` : ""}\nNão peça testes. Deixe "teste", "combate" e "efeitos" vazios.`, m.qualidade || "rapido", 3000, 0.3 + tentativa * 0.2);
      if (r?.narracao) registrar(ctx.codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
      break;
    } catch (e) {
      if (tentativa === 1) {
        console.log(`[avancarCombate] Narração falhou: ${e.message}`);
        registrar(ctx.codigo, { tipo: "sys", texto: `Turno dos inimigos processado (narração indisponível).` });
      }
    }
  }
  broadcast(ctx.codigo, "atualizar", {});
}

// ── WebSocket ──
const server = http.createServer(app);
server.timeout = 120_000; // 2 min — Cloudflare tunnel proxyReadTimeout
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  // Cliente envia a mesa que quer ouvir como primeira mensagem
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.mesa) ws.mesa = String(msg.mesa).toUpperCase();
    } catch {}
  });
  ws.on("close", () => {});
});

// ── Start ──
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🎲 Mesa Viva — Servidor rodando em http://0.0.0.0:${PORT}`);
  console.log(`   API key: ${OPENROUTER_KEY ? "✅ configurada" : "❌ OPENROUTER_API_KEY não encontrada"}`);
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}\\n`);
    // Periodic WAL checkpoint
    setInterval(() => {
      try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch (e) {}
    }, 600_000).unref(); // every 10 minutes
  })