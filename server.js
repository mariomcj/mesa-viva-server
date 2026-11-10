/**
 * Mesa Viva — Servidor local (Express + SQLite + OpenRouter)
 * Substitui Firebase Cloud Functions + Firestore.
 */
"use strict";

const express = require("express");
const cors = require("cors");
const { abrirBanco } = require("./sqlite-compat");
const crypto = require("crypto");
const http = require("http");
const { WebSocketServer } = require("ws");

const R = require("./regras");
const M = require("./mestre");
const AV = require("./aventuras");
const I18N = require("./i18n");
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
const db = abrirBanco(DB_PATH);
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
// Upgrade do relatório: capítulos, clima, votação, expedição, saque e dono pagante.
for (const sql of [
  "ALTER TABLE mesas ADD COLUMN capitulo INTEGER DEFAULT 0",
  "ALTER TABLE mesas ADD COLUMN clima TEXT DEFAULT 'limpo'",
  "ALTER TABLE mesas ADD COLUMN periodo TEXT DEFAULT 'tarde'",
  "ALTER TABLE mesas ADD COLUMN aventuraConcluida INTEGER DEFAULT 0",
  "ALTER TABLE mesas ADD COLUMN votacao TEXT",
  "ALTER TABLE mesas ADD COLUMN expedicao TEXT",
  "ALTER TABLE mesas ADD COLUMN saque TEXT",
  "ALTER TABLE mesas ADD COLUMN encontro TEXT",
  "ALTER TABLE mesas ADD COLUMN donoConta TEXT",
  "ALTER TABLE log ADD COLUMN evento TEXT",
  "ALTER TABLE log ADD COLUMN selo TEXT",
  "ALTER TABLE log ADD COLUMN capitulo INTEGER",
  "ALTER TABLE mesas ADD COLUMN aventura TEXT DEFAULT 'mina'",
  "ALTER TABLE mesas ADD COLUMN idioma TEXT DEFAULT 'pt'",
]) { try { db.exec(sql); } catch (e) {} }

const { criarCreditos } = require("./creditos");
const { criarLoja } = require("./loja");
const { criarFundos } = require("./fundos");
const { criarCampanha } = require("./campanha");
const creditos = criarCreditos(db);
const loja = criarLoja(db, creditos);
const fundos = criarFundos(db);
const campanha = criarCampanha(db);
const VERSAO_SERVIDOR = "2.0.0";

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
  return res.status(status).json({ error: I18N.traduzir(msg, I18N.idiomaDe(res.req)) });
}

/** Traduz só as linhas escritas pelo servidor; narração e ações dos jogadores não mudam. */
function traduzirLog(entradas, idioma) {
  if (idioma !== "en") return entradas;
  return entradas.map((e) => (e.tipo === "narr" || e.tipo === "acao") ? e : { ...e, texto: I18N.traduzir(e.texto, idioma) });
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

/** Conta que paga pela mesa: a conta (token) de quem criou; mesas antigas usam o uid do dono. */
function contaDaMesa(mesa) {
  return mesa?.donoConta || mesa?.dono || null;
}

/** Conta de quem faz a requisição: a do token de login; sem login, o uid do aparelho. */
function contaDaRequisicao(req) {
  return _tokenUid(req) || req.uid || null;
}

/** Memória da campanha + encontro sugerido, para o prompt do Mestre. */
function extraContexto(ctx) {
  const mem = campanha.memoria(ctx.codigo);
  const exp = json(ctx.mesa.expedicao);
  return {
    ...mem,
    encontro: ctx.mesa.encontro || null,
    expedicao: exp?.ativa ? `o grupo está numa ${exp.modo === "torre" ? "torre" : "masmorra"}, andar ${exp.andar}, sala atual: ${exp.sala}. Narre só esta sala, curta e tensa.` : null,
  };
}

/**
 * Chama o Mestre respeitando créditos e teste grátis, e registra o uso real de tokens.
 * Lança ErroCreditos quando a cobrança está ativa e a mesa não tem créditos.
 */
class ErroCreditos extends Error {}
async function chamarMestre(ctx, prompt, qualidade, maxTokens, temperatura) {
  const conta = contaDaMesa(ctx.mesa);
  const aut = creditos.autorizar(conta, qualidade || "rapido");
  if (!aut.ok) throw new ErroCreditos(aut.motivo);
  const r = await M.perguntar(OPENROUTER_KEY, prompt, aut.qualidade, maxTokens, temperatura);
  try { creditos.registrarUso(conta, { codigo: ctx.codigo, tipo: "texto", modelo: r?.__uso?.modelo, usage: r?.__uso?.usage, qualidade: aut.qualidade }); } catch (e) { console.log(`[creditos] ${e.message}`); }
  return r;
}

/** Atualiza o fundo da cena: reaproveita, usa a biblioteca ou gera (e cobra) uma imagem nova. */
function atualizarFundo(ctx, cena) {
  const conta = contaDaMesa(ctx.mesa);
  const sit = conta ? creditos.situacao(conta) : null;
  const soBiblioteca = !OPENROUTER_KEY || (sit?.cobrancaAtiva && sit?.teste?.ativo && sit.creditos <= 0);
  fundos.escolher(cena, {
    baseUrl: SERVER_BASE_URL,
    soBiblioteca,
    gerarImagem: () => M.gerarImagem(OPENROUTER_KEY, `Ambiente de RPG de fantasia: ${cena}, ilustração de fundo para chat, atmosférico, desfoque suave`, SERVER_BASE_URL),
  }).then(({ url, gerou }) => {
    if (gerou) { try { creditos.registrarUso(conta, { codigo: ctx.codigo, tipo: "imagem" }); } catch {} }
    if (url) { salvarMesa(ctx.codigo, { fundo: url }); broadcast(ctx.codigo, "atualizar", {}); }
  }).catch(() => {});
}

function salvarFicha(codigo, f) {
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, f.uid);
}

/** Dá XP a todos os vivos e registra cada subida de nível no diário. */
function darXp(codigo, fichas, quantidade, motivo) {
  for (const f of Object.values(fichas)) {
    if (f.pv <= 0) continue;
    const niveis = R.ganharXp(f, quantidade);
    for (const n of niveis) {
      const p = R.pendencias(f);
      const escolhas = [p.talentos ? "um talento" : null, p.subclasse ? "a subclasse" : null, p.atributos ? "+1 atributo" : null].filter(Boolean).join(", ");
      registrar(codigo, { tipo: "sys", texto: `${f.nome} subiu para o nível ${n}! PV máximo ${f.pvMax}, proficiência +${f.proficiencia}.${escolhas ? ` Escolha na ficha: ${escolhas}.` : ""}`, ok: 1, evento: "nivel", selo: "NÍVEL" });
    }
    salvarFicha(codigo, f);
  }
  if (motivo && quantidade >= 20) registrar(codigo, { tipo: "sys", texto: `+${quantidade} XP: ${motivo}.`, ok: 1, evento: "xp" });
}

function salvarMesa(codigo, campos) {
  const sets = Object.entries(campos).filter(([k]) => k !== "codigo").map(([k]) => `${k} = ?`).join(", ");
  // null vira NULL de verdade (antes virava o texto "null").
  const vals = Object.entries(campos).filter(([k]) => k !== "codigo").map(([, v]) => v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v);
  if (!sets) return;
  db.prepare(`UPDATE mesas SET ${sets} WHERE codigo = ?`).run(...vals, codigo);
}

function registrar(codigo, ...entradas) {
  const stmt = db.prepare("INSERT INTO log (codigo, t, tipo, texto, autor, nome, res, ok, evento, selo, capitulo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const t = agora();
  const capitulo = db.prepare("SELECT capitulo FROM mesas WHERE codigo = ?").get(codigo)?.capitulo ?? 0;
  let nCount = 0;
  for (const [i, e] of entradas.entries()) {
    // Eventos de status e combate nunca usam tipo 'narr' (o app lê 'narr' em voz alta).
    stmt.run(codigo, t + i, e.tipo, e.texto, e.autor || null, e.nome || null, e.res || null, e.ok != null ? (e.ok ? 1 : 0) : null, e.evento || null, e.selo || null, capitulo);
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
    const conta = contaDaRequisicao(req);
    db.prepare("INSERT INTO mesas (codigo, dono, criadaEm, donoConta, idioma) VALUES (?, ?, ?, ?, ?)").run(codigo, req.uid, agora(), conta, I18N.idiomaDe(req));
    db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, req.uid, nome);
    creditos.garantir(conta); // o teste grátis de 14 dias começa na primeira mesa criada
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
    const conta = _tokenUid(req) || userId;
    db.prepare("INSERT INTO mesas (codigo, dono, criadaEm, donoConta, idioma) VALUES (?, ?, ?, ?, ?)").run(codigo, userId, agora(), conta, I18N.idiomaDe(req));
    db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES (?, ?, ?)").run(codigo, userId, nome);
    creditos.garantir(conta);
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
  if (["pt", "en"].includes(d.idioma)) campos.idioma = d.idioma;
  if (typeof d.aventura === "string") {
    const mesa = db.prepare("SELECT dono, fase FROM mesas WHERE codigo = ?").get(codigo);
    if (!AV.AVENTURAS.some((a) => a.id === d.aventura)) return erro(res, 400, "Aventura inválida.");
    if (mesa?.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa escolhe a aventura.");
    if (mesa.fase !== "lobby") return erro(res, 400, "Termine a aventura atual antes de começar outra.");
    campos.aventura = d.aventura;
    campos.cena = AV.aventura(d.aventura).cenaInicial;
  }
  if (Object.keys(campos).length) { salvarMesa(codigo, campos); broadcast(codigo, "atualizar", {}); }
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
  salvarMesa(codigo, { fase: "lobby", combate: null, rolagem: null, processando: null, resumo: "", inicio: null, cena: AV.daMesa(mesa).cenaInicial, fundo: "", capitulo: 0, aventuraConcluida: 0, votacao: null, expedicao: null, saque: null, encontro: null, clima: "limpo", periodo: "tarde" });
  db.prepare("DELETE FROM flags_mesa WHERE codigo = ?").run(codigo);
  broadcast(codigo, "reinicio", {});
  res.json({ ok: true });
});

// ── API: Personagem ──

app.post("/api/criar-personagem", authMw, (req, res) => {
  const conceito = texto(req.body?.conceito, 300);
  if (!conceito) return erro(res, 400, "Descreva seu personagem.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const prompt = M.promptCriacao(conceito, I18N.idiomaDe(req));
  M.perguntar(OPENROUTER_KEY, prompt, "rapido", 2000)
    .then((r) => res.json({ ficha: R.normalizarFicha(r, req.uid, conceito) }))
    .catch((e) => erro(res, 502, e.message || "Erro ao criar personagem."));
});

app.post("/api/salvar-ficha", authMw, (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const antiga = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, req.uid);
  const mesa = db.prepare("SELECT fase FROM mesas WHERE codigo = ?").get(codigo);
  // XP, nível, ouro, talentos, itens e status são do servidor: o app não consegue zerá-los ao salvar.
  const nova = R.normalizarFicha(R.mesclarFichaEditada(req.body?.ficha, antiga ? json(antiga.dados) : null), req.uid);
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
  // Modo de depuração: o admin pode forçar clima, período, capítulo e encontro para testar.
  if (req.body.clima !== undefined && !R.CLIMAS.includes(req.body.clima)) return erro(res, 400, `Clima inválido (${R.CLIMAS.join(", ")}).`);
  if (req.body.periodo !== undefined && !R.PERIODOS.includes(req.body.periodo)) return erro(res, 400, `Período inválido (${R.PERIODOS.join(", ")}).`);
  for (const k of ["cena", "fase", "tom", "resumo", "fundo", "clima", "periodo", "capitulo", "aventuraConcluida", "encontro"]) {
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
  // Mesmo formato do motor de regras (for/des/con/int/sab/car), não o formato antigo do painel.
  const ficha = R.normalizarFicha({
    nome: f.nome, raca: f.raca, classe: f.classe, nivel: f.nivel, xp: f.xp, pv: f.pv,
    atributos: f.atributos || { for: 12, des: 12, con: 12, int: 12, sab: 12, car: 12 },
    ca: f.ca, ataques: f.ataques, pericias: f.pericias, equipamento: f.equipamento, ouro: f.ouro,
  }, uid);
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(cod, uid, JSON.stringify(ficha));
  res.json({ ok: true, uid });
});

app.put("/api/admin/fichas/:codigo/:uid", adminMw, (req, res) => {
  const cod = req.params.codigo, uid = req.params.uid;
  const existente = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(cod, uid);
  let f = existente ? JSON.parse(existente.dados) : {};
  for (const k of ["nome", "raca", "classe"]) if (req.body[k] !== undefined) f[k] = req.body[k];
  if (req.body.pv !== undefined) f.pv = Math.max(0, Number(req.body.pv));
  if (req.body.nivel !== undefined) f.nivel = Math.max(1, Number(req.body.nivel));
  if (req.body.xp !== undefined) f.xp = Math.max(0, Number(req.body.xp));
  if (req.body.ouro !== undefined) f.ouro = Math.max(0, Number(req.body.ouro));
  // pvMax é calculado pelo nível e pela Constituição.
  f = R.normalizarFicha(f, uid);
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
    const mesaAntes = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    const aut = creditos.autorizar(contaDaMesa(mesaAntes), mesaAntes?.qualidade || "rapido");
    if (!aut.ok) return erro(res, 402, aut.motivo);
    const av = AV.daMesa(mesaAntes);
    salvarMesa(codigo, { fase: "jogo", inicio: agora(), cena: av.cenaInicial, fundo: "", resumo: "", combate: null, rolagem: null, processando: null, capitulo: 0, aventuraConcluida: 0, votacao: null, expedicao: null, saque: null, encontro: null, clima: "limpo", periodo: "anoitecer" });
    registrar(codigo, { tipo: "sys", texto: `A sessão começou. Capítulo 1: ${av.capitulos[0].titulo}. Objetivo: ${av.capitulos[0].objetivo}`, evento: "capitulo" });
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Não encontrado.");
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes, extraContexto(ctx))}\n\nEVENTO: Abertura da sessão. Faça uma abertura curta apresentando cada personagem do grupo pelo nome e ${av.abertura}. Não pergunte o que fazem — apenas narre a cena.\nNão peça testes nem inicie combate.`;
    const r = await chamarMestre(ctx, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.8);
    if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
    const cena = r?.cena ? texto(r.cena, 60) : av.cenaInicial;
    salvarMesa(codigo, { cena });
    atualizarFundo(ctx, cena);
    broadcast(codigo, "nova", { narracao: r?.narracao || "" });
    res.json({ ok: true });
  } catch (e) { erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
});

// ── Biblioteca de aventuras ──
app.get("/api/aventuras", (req, res) => res.json({ aventuras: AV.lista(I18N.idiomaDe(req)) }));

/** Depois de concluir uma aventura, o grupo segue para outra com os mesmos personagens. */
app.post("/api/proxima-aventura", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const id = String(req.body?.aventura || "");
  if (!AV.AVENTURAS.some((a) => a.id === id)) return erro(res, 400, "Aventura inválida.");
  try {
    const mesaAntes = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    if (!mesaAntes) return erro(res, 404, "Mesa não encontrada.");
    if (mesaAntes.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa escolhe a aventura.");
    if (mesaAntes.fase !== "jogo" || !Number(mesaAntes.aventuraConcluida)) return erro(res, 400, "Termine a aventura atual antes de começar outra.");
    if (json(mesaAntes.combate) || json(mesaAntes.rolagem) || json(mesaAntes.expedicao)?.ativa) return erro(res, 400, "Termine o que está acontecendo antes.");
    const aut = creditos.autorizar(contaDaMesa(mesaAntes), mesaAntes.qualidade || "rapido");
    if (!aut.ok) return erro(res, 402, aut.motivo);
    const av = AV.aventura(id);
    const anterior = AV.daMesa(mesaAntes);
    // Todos começam a nova aventura descansados; nível, itens e ouro continuam.
    for (const row of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) {
      const f = R.normalizarFicha(json(row.dados), row.uid);
      f.pv = f.pvMax; f.status = []; f.descansoCapitulo = -1;
      salvarFicha(codigo, f);
    }
    salvarMesa(codigo, {
      aventura: id, capitulo: 0, aventuraConcluida: 0, cena: av.cenaInicial, fundo: "", combate: null, rolagem: null, processando: null,
      votacao: null, expedicao: null, saque: null, encontro: null, clima: "limpo", periodo: "tarde",
      resumo: texto(`Antes disto, o grupo concluiu a aventura "${anterior.titulo}". ${mesaAntes.resumo || ""}`, 1500),
    });
    registrar(codigo, { tipo: "sys", texto: `Nova aventura: ${av.titulo}. Capítulo 1: ${av.capitulos[0].titulo}. Objetivo: ${av.capitulos[0].objetivo}`, evento: "capitulo", selo: "CAPÍTULO" });
    const ctx = carregar(codigo, req.uid);
    if (!ctx) return erro(res, 404, "Não encontrado.");
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), [], extraContexto(ctx))}\n\nEVENTO: Abertura de uma nova aventura com o mesmo grupo, algum tempo depois da anterior. Em uma frase, diga como a fama do grupo os trouxe até aqui; depois ${av.abertura}. Não pergunte o que fazem — apenas narre a cena.\nNão peça testes nem inicie combate.`;
    const r = await chamarMestre(ctx, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.8);
    if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
    const cena = r?.cena ? texto(r.cena, 60) : av.cenaInicial;
    salvarMesa(codigo, { cena });
    atualizarFundo(ctx, cena);
    broadcast(codigo, "nova", { narracao: r?.narracao || "" });
    res.json({ ok: true });
  } catch (e) { erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
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
    const r = await chamarMestre(ctx, `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes, extraContexto(ctx))}\n\nEVENTO: ${f.nome} (id ${req.uid}) declara a ação: "${acao.replace(/"/g, "'")}"\n${extra}`, ctx.mesa.qualidade || "rapido", 3000, 0.7);
    // O encontro de estrada sugerido já foi entregue ao Mestre: não repetir.
    if (ctx.mesa.encontro) salvarMesa(codigo, { encontro: null });
    await aplicar(ctx, r, true, req.uid);
    salvarMesa(codigo, { processando: null });
    // Se não gerou rolagem, avança combate
    const novoRol = json(db.prepare("SELECT rolagem FROM mesas WHERE codigo = ?").get(codigo).rolagem);
    if (!novoRol && json(ctx.mesa.combate)) await avancarCombate(ctx);
    const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    broadcast(codigo, "atualizar", { mesa: dadosMesa });
    res.json({ rolagem: novoRol });
  } catch (e) { salvarMesa(codigo, { processando: null }); erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
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
    // Minigame (fechadura, enigma): +2 se acertou, -2 se errou. Só vale para testes de perícia.
    const minigame = req.body?.minigame;
    const ajuste = rol.tipo !== "ataque" && (minigame === "ok" || minigame === "falhou") ? (minigame === "ok" ? 2 : -2) : 0;
    const ambiente = { clima: ctx.mesa.clima, periodo: ctx.mesa.periodo };
    const res2 = R.resolverRolagem(rol, natural, combate, f, { ajuste, ambiente });
    salvarFicha(codigo, f); // Sede de Sangue pode curar quem ataca
    registrar(codigo, {
      tipo: "roll", texto: `${f.nome} · ${rol.rotulo}: ${res2.natural}${R.sinal(rol.bonus + ajuste)}${rol.bonus + ajuste} = ${res2.total} vs ${rol.tipo === "ataque" ? "CA" : "CD"} ${rol.cd}${valor !== null ? " (dado real)" : ""}${ajuste ? ` (minigame ${ajuste > 0 ? "+2" : "-2"})` : ""}`,
      res: res2.dano !== undefined ? `acertou, ${res2.dano} de dano` : res2.sucesso ? "sucesso" : "falha",
      ok: res2.sucesso ? 1 : 0,
      evento: res2.evento, selo: res2.selo,
    });
    if (combate) {
      for (const i of combate.inimigos || []) if (i.pv <= 0 && !i._registrado) { i._registrado = true; registrar(codigo, { tipo: "sys", texto: `${i.nome} foi derrotado.`, ok: 1, evento: "inimigo_caido" }); }
    }
    const campos = { rolagem: null };
    if (combate) campos.combate = JSON.stringify(combate);
    salvarMesa(codigo, campos);
    ctx.mesa.combate = combate;
    const fim = R.combateAcabou(combate, ctx.fichas);
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes, extraContexto(ctx))}\n\nEVENTO: Resultado de um teste. Narre a consequência.\n${res2.descricao}${fim ? "\nTodos os inimigos foram derrotados ou fugiram: narre o fim do combate." : ""}\nNão peça outro teste agora (deixe "teste" nulo).`;
    const r = await chamarMestre(ctx, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.5);
    await aplicar(ctx, { ...r, combate: null, efeitos: [] }, false, req.uid);
    if (json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate)) await avancarCombate(ctx);
    const dadosMesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
    broadcast(codigo, "atualizar", { mesa: dadosMesa });
    res.json({ natural: res2.natural, total: res2.total, sucesso: res2.sucesso, dano: res2.dano ?? null, selo: res2.selo, evento: res2.evento });
  } catch (e) { erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
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
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes, extraContexto(ctx))}\n\nO jogador de ${f.nome} pediu ajuda: sugira 3 ações úteis e diferentes para ${f.nome} agora, usando as habilidades e o jeito do personagem. Cada uma em primeira pessoa, até 15 palavras, pronta para ser dita.\nResponda SOMENTE com um array JSON de 3 strings.${ctx.mesa.idioma === "en" ? " Write the 3 actions in English." : ""}`;
    const r = await chamarMestre(ctx, prompt, "rapido", 2000);
    res.json({ ideias: (Array.isArray(r) ? r : []).slice(0, 3).map((s) => texto(s, 160)) });
  } catch (e) { erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
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
  mesa.votacao = json(mesa.votacao);
  mesa.expedicao = json(mesa.expedicao);
  mesa.saque = json(mesa.saque);
  mesa.cdVisivel = mesa.cdVisivel !== 0; // o app espera booleano
  const lang = I18N.idiomaDe(req);
  const tr = (t) => I18N.traduzir(t, lang);
  const av = AV.daMesa(mesa);
  const caps = AV.capitulos(av, lang);
  const capIdx = Math.max(0, Math.min(caps.length - 1, Number(mesa.capitulo) || 0));
  mesa.aventura = av.id;
  mesa.aventuraTitulo = lang === "en" ? av.tituloEn : av.titulo;
  mesa.idioma = mesa.idioma === "en" ? "en" : "pt";
  mesa.capituloTitulo = caps[capIdx].titulo;
  mesa.objetivo = Number(mesa.aventuraConcluida) ? tr("Aventura concluída.") : caps[capIdx].objetivo;
  mesa.totalCapitulos = caps.length;
  mesa.climaNome = tr(R.NOME_CLIMA[mesa.clima] || "Céu limpo");
  mesa.periodoNome = tr(R.NOME_PERIODO[mesa.periodo] || "Tarde");
  if (mesa.votacao?.pergunta) mesa.votacao.pergunta = tr(mesa.votacao.pergunta);
  if (mesa.saque && lang === "en") for (const k of Object.keys(mesa.saque)) mesa.saque[k] = (mesa.saque[k] || []).map((it) => ({ ...it, nome: I18N.nomeItem(it.nome), descricao: I18N.descricaoItem(it.descricao) }));
  // Situação dos créditos de quem paga a mesa (para o aviso de teste grátis no app).
  try {
    const s = creditos.situacao(contaDaMesa(mesa));
    if (s) mesa.creditos = { cobrancaAtiva: s.cobrancaAtiva, emTeste: s.teste.ativo, diasTeste: s.teste.diasRestantes, horasTeste: s.teste.horasRestantes, saldo: s.creditos, podeJogar: s.podeJogar, aviso: s.aviso ? tr(s.aviso) : null };
  } catch {}
  delete mesa.donoConta;
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
  for (const r of rows) {
    const f = R.normalizarFicha(json(r.dados), r.uid);
    fichas[r.uid] = I18N.ficha({ ...f, pendencias: R.pendencias(f), caEfetiva: R.caEfetiva(f), xpProximo: R.xpParaProximo(f.nivel) }, I18N.idiomaDe(req));
  }
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
  res.json(traduzirLog(log, I18N.idiomaDe(req)));
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
  try { db.prepare("INSERT OR REPLACE INTO reacoes (codigo, logId, uid, tipo) VALUES (?, ?, ?, ?)").run(codigo, logId, req.uid, tipo); } catch (e) { return erro(res, 500, "Erro ao salvar reação."); }
  res.json({ ok: true });
});

// ── Upgrade do relatório: rotas novas ──

// Versão mínima do app: quem estiver abaixo é avisado para atualizar.
app.get("/api/versao", (req, res) => res.json({
  servidor: VERSAO_SERVIDOR,
  appMinimo: Number(process.env.APP_BUILD_MINIMO) || 1,
  appAtual: Number(process.env.APP_BUILD_ATUAL) || 2,
  urlApk: `${SERVER_BASE_URL}/mesa-viva-latest.apk`,
}));

app.get("/api/regras/catalogo", (req, res) => {
  const lang = I18N.idiomaDe(req);
  res.json({ ...I18N.catalogo(R.catalogo(), lang), capitulos: AV.capitulos(AV.AVENTURAS[0], lang), aventuras: AV.lista(lang) });
});

// ── Créditos e loja ──
app.get("/api/conta/creditos", authMw, (req, res) => {
  const conta = contaDaRequisicao(req);
  res.json({ ...creditos.situacao(conta), produtos: creditos.PRODUTOS, lojaConfigurada: loja.configurada });
});

app.get("/api/loja/produtos", (req, res) => res.json({ produtos: creditos.PRODUTOS, lojaConfigurada: loja.configurada }));

app.post("/api/loja/validar", authMw, async (req, res) => {
  const conta = contaDaRequisicao(req);
  try {
    const r = await loja.validar(conta, texto(req.body?.produto, 60), String(req.body?.purchaseToken || ""));
    if (!r.ok) return erro(res, r.status || 400, r.erro);
    res.json(r);
  } catch (e) { erro(res, 502, `Não consegui confirmar a compra: ${e.message}`); }
});

app.get("/api/admin/uso", adminMw, (req, res) => {
  res.json({ ultimos30dias: creditos.resumoUso(30), config: creditos.CONFIG, fundos: fundos.MODO, lojaConfigurada: loja.configurada });
});

app.post("/api/admin/creditos", adminMw, (req, res) => {
  const conta = texto(req.body?.conta, 60);
  const qtd = Number(req.body?.quantidade);
  if (!conta || !Number.isFinite(qtd)) return erro(res, 400, "Informe conta e quantidade.");
  creditos.creditar(conta, qtd);
  res.json(creditos.situacao(conta));
});

app.post("/api/admin/mesas/:codigo/flags", adminMw, (req, res) => {
  const cod = codigoValido(req.params.codigo);
  if (!cod) return erro(res, 400, "Código inválido.");
  const novos = campanha.registrarMundo(cod, req.body || {}, "depuração", 0);
  res.json({ ok: true, novos, memoria: campanha.memoria(cod) });
});

// ── Ficha: escolhas de nível, redistribuição e saque ──
function fichaDoJogador(req, res) {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) { erro(res, 400, "Código inválido."); return null; }
  const ctx = carregar(codigo, req.uid);
  if (!ctx) { erro(res, 404, "Mesa não encontrada."); return null; }
  const f = ctx.fichas[req.uid];
  if (!f) { erro(res, 400, "Crie seu personagem."); return null; }
  return { ctx, f, codigo };
}

app.post("/api/ficha/escolher", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { f, codigo } = x;
  const tipo = req.body?.tipo, valor = String(req.body?.valor || "");
  const p = R.pendencias(f);
  let msg;
  if (tipo === "talento") {
    if (!p.talentos) return erro(res, 400, "Nenhum talento disponível agora.");
    if (!R.TALENTOS[valor] || f.talentos.includes(valor)) return erro(res, 400, "Talento inválido.");
    f.talentos.push(valor); msg = `${f.nome} aprendeu o talento ${R.TALENTOS[valor].nome}.`;
  } else if (tipo === "subclasse") {
    if (!p.subclasse) return erro(res, 400, "A subclasse fica disponível no nível 3.");
    if (!R.SUBCLASSES[f.classe]?.[valor]) return erro(res, 400, "Subclasse inválida.");
    f.subclasse = valor; msg = `${f.nome} seguiu o caminho: ${R.SUBCLASSES[f.classe][valor].nome}.`;
  } else if (tipo === "atributo") {
    if (!p.atributos) return erro(res, 400, "Nenhum aumento de atributo disponível agora.");
    if (!R.ATRIBUTOS.includes(valor) || f.atributos[valor] >= 20) return erro(res, 400, "Atributo inválido.");
    f.atributos[valor] += 1; f.atributosGanhos += 1;
    msg = `${f.nome} aumentou ${R.NOME_ATRIBUTO[valor]} para ${f.atributos[valor]}.`;
  } else return erro(res, 400, "Tipo inválido.");
  const nova = R.normalizarFicha(f, f.uid);
  if (nova.pvMax > f.pvMax) nova.pv = Math.min(nova.pvMax, f.pv + (nova.pvMax - f.pvMax));
  salvarFicha(codigo, nova);
  registrar(codigo, { tipo: "sys", texto: msg, ok: 1, evento: "escolha" });
  broadcast(codigo, "ficha", { uid: f.uid });
  res.json({ ficha: { ...nova, pendencias: R.pendencias(nova) } });
});

app.post("/api/ficha/redistribuir", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { ctx, f, codigo } = x;
  if (ctx.mesa.combate) return erro(res, 400, "Não dá para redistribuir durante o combate.");
  const at = req.body?.atributos || {};
  const novos = {};
  for (const a of R.ATRIBUTOS) {
    const v = Math.floor(Number(at[a]));
    if (!Number.isFinite(v) || v < 3 || v > 20) return erro(res, 400, `Valor inválido para ${R.NOME_ATRIBUTO[a]}.`);
    novos[a] = v;
  }
  const soma = R.ATRIBUTOS.reduce((s, a) => s + novos[a], 0);
  const max = 72 + (f.atributosGanhos || 0);
  if (soma > max) return erro(res, 400, `A soma dos atributos pode ser no máximo ${max} (está ${soma}).`);
  const custo = R.custoRedistribuir(f);
  if ((f.ouro || 0) < custo) return erro(res, 400, `Redistribuir de novo custa ${custo} peças de ouro.`);
  f.ouro -= custo;
  f.atributos = novos;
  f.talentos = []; // os talentos voltam a ficar disponíveis para escolher
  f.respecUsado = true;
  const nova = R.normalizarFicha(f, f.uid);
  salvarFicha(codigo, nova);
  registrar(codigo, { tipo: "sys", texto: `${f.nome} redistribuiu os pontos${custo ? ` (custo: ${custo} de ouro)` : " (a primeira vez é grátis)"}.`, evento: "escolha" });
  broadcast(codigo, "ficha", { uid: f.uid });
  res.json({ ficha: { ...nova, pendencias: R.pendencias(nova) } });
});

app.post("/api/saque/escolher", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { ctx, f, codigo } = x;
  const saque = json(ctx.mesa.saque) || {};
  const opcoes = saque[req.uid];
  if (!opcoes) return erro(res, 400, "Não há saque para você.");
  const i = Number(req.body?.indice);
  if (req.body?.indice !== "dispensar" && !(Number.isInteger(i) && opcoes[i])) return erro(res, 400, "Escolha inválida.");
  if (req.body?.indice !== "dispensar") {
    if ((f.itens || []).length >= 8) return erro(res, 400, "Inventário cheio (8 itens). Dispense um item na ficha antes.");
    f.itens.push(opcoes[i]);
    salvarFicha(codigo, f);
    registrar(codigo, { tipo: "sys", texto: `${f.nome} ficou com ${opcoes[i].nome} (${R.NOME_RARIDADE[opcoes[i].raridade]}).`, ok: 1, evento: "item", selo: R.NOME_RARIDADE[opcoes[i].raridade].toUpperCase() });
  }
  delete saque[req.uid];
  salvarMesa(codigo, { saque: Object.keys(saque).length ? JSON.stringify(saque) : null });
  broadcast(codigo, "atualizar", {});
  res.json({ ok: true });
});

app.post("/api/ficha/dispensar-item", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { f, codigo } = x;
  const id = String(req.body?.item || "");
  const it = (f.itens || []).find((i) => i.id === id);
  if (!it) return erro(res, 404, "Item não encontrado.");
  f.itens = f.itens.filter((i) => i.id !== id);
  f.ouro = (f.ouro || 0) + 2 + 3 * (R.RARIDADES.indexOf(it.raridade));
  salvarFicha(codigo, f);
  broadcast(codigo, "ficha", { uid: f.uid });
  res.json({ ok: true });
});

// ── Loja de ouro, poções e descanso ──
function respostaFicha(f) {
  return { ficha: { ...f, pendencias: R.pendencias(f), caEfetiva: R.caEfetiva(f), xpProximo: R.xpParaProximo(f.nivel) } };
}

app.post("/api/loja-ouro/comprar", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { ctx, f, codigo } = x;
  const produto = String(req.body?.produto || "");
  const P = R.LOJA.produtos;
  let custo, msg;
  if (produto === "taverna") {
    if (ctx.mesa.combate) return erro(res, 400, "Não dá para descansar na taverna durante o combate.");
    if (f.pv <= 0) return erro(res, 400, "Personagem caído precisa de cura antes.");
    custo = P.taverna.preco;
    if (f.ouro < custo) return erro(res, 400, `Uma noite na taverna custa ${custo} de ouro.`);
    f.pv = f.pvMax; f.status = [];
    msg = `${f.nome} passou a noite na taverna e acordou renovado (${custo} de ouro).`;
  } else if (produto === "pocao") {
    custo = P.pocao.preco;
    if (f.pocoes >= R.LOJA.maxPocoes) return erro(res, 400, `Dá para carregar no máximo ${R.LOJA.maxPocoes} poções.`);
    if (f.ouro < custo) return erro(res, 400, `A poção custa ${custo} de ouro.`);
    f.pocoes += 1;
    msg = `${f.nome} comprou uma poção de cura (${custo} de ouro).`;
  } else if (produto === "ferreiro") {
    if (ctx.mesa.combate) return erro(res, 400, "O ferreiro não trabalha no meio de uma luta.");
    const idx = (f.itens || []).findIndex((i) => i.id === String(req.body?.item || ""));
    if (idx < 0) return erro(res, 404, "Item não encontrado.");
    const m = R.melhorarItem(f.itens[idx]);
    if (!m) return erro(res, 400, "Esse item já está no máximo que o ferreiro alcança.");
    custo = m.preco;
    if (f.ouro < custo) return erro(res, 400, `O ferreiro cobra ${custo} de ouro por esse trabalho.`);
    const antigo = f.itens[idx].nome;
    f.itens[idx] = m.item;
    msg = `O ferreiro melhorou ${antigo}: agora é ${m.item.nome} (${R.NOME_RARIDADE[m.item.raridade]}, ${custo} de ouro).`;
  } else if (produto === "refazerSaque") {
    const saque = json(ctx.mesa.saque) || {};
    if (!saque[req.uid]) return erro(res, 400, "Você não tem saque para revirar.");
    custo = P.refazerSaque.preco;
    if (f.ouro < custo) return erro(res, 400, `Revirar o saque custa ${custo} de ouro.`);
    const melhorAtual = Math.max(...saque[req.uid].map((i) => R.RARIDADES.indexOf(i.raridade)));
    saque[req.uid] = R.gerarSaque(Math.max(0, melhorAtual - 1));
    salvarMesa(codigo, { saque: JSON.stringify(saque) });
    msg = `${f.nome} revirou o saque atrás de algo melhor (${custo} de ouro).`;
  } else return erro(res, 400, "Produto inválido.");
  f.ouro -= custo;
  salvarFicha(codigo, f);
  registrar(codigo, { tipo: "sys", texto: msg, ok: 1, evento: "loja" });
  broadcast(codigo, "ficha", { uid: f.uid });
  broadcast(codigo, "atualizar", {});
  res.json(respostaFicha(f));
});

app.post("/api/ficha/usar-pocao", authMw, async (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { ctx, f, codigo } = x;
  if (f.pocoes <= 0) return erro(res, 400, "Você não tem poções.");
  const combate = ctx.mesa.combate;
  if (combate) {
    if (R.vezAtual(combate)?.id !== req.uid) return erro(res, 400, "No combate, a poção só pode ser tomada na sua vez.");
    if (ctx.mesa.rolagem) return erro(res, 400, "Resolva a rolagem pendente antes.");
  }
  if (f.pv >= f.pvMax) return erro(res, 400, "Seus PV já estão cheios.");
  const curou = R.curar(f, R.curaPocao(f));
  f.pocoes -= 1;
  salvarFicha(codigo, f);
  registrar(codigo, { tipo: "sys", texto: `${f.nome} bebeu uma poção e recuperou ${curou} PV (${f.pv}/${f.pvMax}).`, ok: 1, evento: "cura" });
  res.json(respostaFicha(f));
  if (combate) {
    try { await avancarCombate({ ...ctx, fichas: { ...ctx.fichas, [f.uid]: f } }); } catch (e) { console.log(`[pocao] ${e.message}`); }
  } else broadcast(codigo, "ficha", { uid: f.uid });
});

app.post("/api/ficha/descansar", authMw, (req, res) => {
  const x = fichaDoJogador(req, res); if (!x) return;
  const { ctx, f, codigo } = x;
  if (ctx.mesa.combate) return erro(res, 400, "Não dá para descansar durante o combate.");
  if (f.pv <= 0) return erro(res, 400, "Personagem caído precisa de cura antes.");
  const cap = Number(ctx.mesa.capitulo) || 0;
  if (f.descansoCapitulo === cap) return erro(res, 400, "Você já fez o descanso curto deste capítulo.");
  if (f.pv >= f.pvMax) return erro(res, 400, "Seus PV já estão cheios.");
  const curou = R.curar(f, R.curaDescanso(f));
  f.descansoCapitulo = cap;
  salvarFicha(codigo, f);
  registrar(codigo, { tipo: "sys", texto: `${f.nome} fez um descanso curto e recuperou ${curou} PV (${f.pv}/${f.pvMax}).`, ok: 1, evento: "cura" });
  broadcast(codigo, "ficha", { uid: f.uid });
  res.json(respostaFicha(f));
});

// ── Votação do grupo ──
function eleitores(ctx) {
  const vivos = Object.values(ctx.fichas).filter((f) => f.pv > 0).map((f) => f.uid);
  return vivos.length ? vivos : Object.keys(ctx.fichas);
}

app.post("/api/votar", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const ctx = carregar(codigo, req.uid);
  if (!ctx) return erro(res, 404, "Mesa não encontrada.");
  if (!ctx.fichas[req.uid]) return erro(res, 400, "Crie seu personagem para votar.");
  const v = json(ctx.mesa.votacao);
  if (!v) return erro(res, 400, "Não há votação aberta.");
  const r = campanha.votar(v, req.uid, String(req.body?.opcao || ""), eleitores(ctx));
  if (!r.valido) return erro(res, 400, "Opção inválida.");
  if (!r.decidida) {
    salvarMesa(codigo, { votacao: JSON.stringify(v) });
    broadcast(codigo, "atualizar", {});
    return res.json({ ok: true, decidida: false });
  }
  salvarMesa(codigo, { votacao: null });
  registrar(codigo, { tipo: "sys", texto: `O grupo decidiu: ${r.resultado === "continuar" ? "seguir em frente" : "parar"}.`, evento: "votacao_fim" });
  try {
    if (v.tipo === "expedicao") await resolverExpedicao(ctx, r.resultado);
  } catch (e) { return erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
  broadcast(codigo, "atualizar", {});
  res.json({ ok: true, decidida: true, resultado: r.resultado });
});

// ── Expedições: masmorra por andares e torre "subir ou parar" ──
app.post("/api/expedicao/iniciar", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const ctx = carregar(codigo, req.uid);
  if (!ctx) return erro(res, 404, "Mesa não encontrada.");
  if (ctx.mesa.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa inicia uma expedição.");
  if (ctx.mesa.fase !== "jogo") return erro(res, 400, "Comece a aventura primeiro.");
  if (ctx.mesa.combate || ctx.mesa.rolagem || json(ctx.mesa.votacao)) return erro(res, 400, "Termine o que está acontecendo antes.");
  if (json(ctx.mesa.expedicao)?.ativa) return erro(res, 400, "Já existe uma expedição em andamento.");
  const exp = campanha.novaExpedicao(req.body?.modo);
  registrar(codigo, { tipo: "sys", texto: exp.modo === "torre" ? "O grupo entra na Torre: a cada andar, a recompensa cresce. Subir ou parar?" : "O grupo desce para a masmorra. Cada sala pode trazer ouro ou perigo.", evento: "expedicao_inicio", selo: exp.modo === "torre" ? "TORRE" : "MASMORRA" });
  try { await entrarSala(ctx, exp); } catch (e) { return erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
  broadcast(codigo, "atualizar", {});
  res.json({ ok: true });
});

async function entrarSala(ctx, exp) {
  const codigo = ctx.codigo;
  const sala = campanha.proximaSala(exp);
  const fichas = Object.values(ctx.fichas);
  const nomes = { monstro: "monstros", chefe: "o chefe do andar", bau: "um baú", armadilha: "uma armadilha", descanso: "um lugar seguro para descansar" };
  registrar(codigo, { tipo: "sys", texto: `Andar ${exp.andar}: ${nomes[sala]}.`, evento: "sala", selo: `ANDAR ${exp.andar}` });
  const cena = exp.modo === "torre" ? `Torre, andar ${exp.andar}` : `Masmorra, sala ${exp.andar}`;
  salvarMesa(codigo, { cena });
  atualizarFundo(ctx, cena);
  let eventoNarrar = "";
  if (sala === "monstro" || sala === "chefe") {
    const c = R.iniciarCombate(fichas.filter((f) => f.pv > 0), campanha.inimigosDaSala(exp, fichas));
    salvarMesa(codigo, { combate: JSON.stringify(c), expedicao: JSON.stringify(exp) });
    registrar(codigo, { tipo: "sys", texto: "Combate! Iniciativa: " + c.ordem.map((o) => `${o.nome} ${o.ini}`).join(" · "), evento: "combate_inicio", selo: "COMBATE" });
    eventoNarrar = `O grupo entra na sala e é atacado por ${c.inimigos.map((i) => i.nome).join(", ")}. O combate começou: descreva a ameaça em 2 ou 3 frases. Não crie outros inimigos (deixe "combate" nulo).`;
  } else {
    if (sala === "bau") {
      const saque = {};
      for (const f of fichas) if (f.pv > 0) saque[f.uid] = R.gerarSaque(exp.andar);
      salvarMesa(codigo, { saque: JSON.stringify(saque) });
      registrar(codigo, { tipo: "sys", texto: "Um baú! Cada um escolhe 1 entre 3 itens na aba Mesa.", ok: 1, evento: "saque", selo: "SAQUE" });
      eventoNarrar = "O grupo encontra um baú antigo e o abre: descreva o brilho do que há dentro.";
    } else if (sala === "armadilha") {
      const cd = 11 + Math.min(6, exp.andar);
      for (const f of fichas) {
        if (f.pv <= 0) continue;
        const nat = R.d(20); const total = nat + R.mod(f.atributos.des);
        if (total >= cd) registrar(codigo, { tipo: "roll", texto: `${f.nome} · Salvaguarda de Destreza: ${nat}${R.sinal(R.mod(f.atributos.des))}${R.mod(f.atributos.des)} = ${total} vs CD ${cd}`, res: "escapou", ok: 1, evento: "esquiva", selo: "ESQUIVA" });
        else {
          const dano = R.rolar(`1d6+${Math.floor(exp.andar / 2)}`).total;
          f.pv = Math.max(1, f.pv - dano); // armadilha não derruba ninguém
          salvarFicha(codigo, f);
          registrar(codigo, { tipo: "roll", texto: `${f.nome} · Salvaguarda de Destreza: ${nat}${R.sinal(R.mod(f.atributos.des))}${R.mod(f.atributos.des)} = ${total} vs CD ${cd}`, res: `${dano} de dano`, ok: 0, evento: "acerto_inimigo" });
        }
      }
      eventoNarrar = "Uma armadilha dispara quando o grupo entra na sala (os resultados já estão no registro): descreva-a.";
    } else if (sala === "descanso") {
      for (const f of fichas) {
        if (f.pv <= 0) continue;
        const v = R.rolar(`1d8+${f.nivel || 1}`).total;
        f.pv = Math.min(f.pvMax, f.pv + v);
        salvarFicha(codigo, f);
      }
      registrar(codigo, { tipo: "sys", texto: "O grupo descansa e recupera as forças.", ok: 1, evento: "cura" });
      eventoNarrar = "O grupo encontra um canto seguro e descansa: descreva um momento de respiro.";
    }
    exp.ouro += campanha.recompensaDoAndar(exp);
    salvarMesa(codigo, { expedicao: JSON.stringify(exp) });
  }
  const c2 = carregar(codigo, ctx.uid);
  if (OPENROUTER_KEY && c2) {
    try {
      const r = await chamarMestre(c2, `${M.contexto(c2.mesa, Object.values(c2.fichas), c2.recentes, extraContexto(c2))}\n\nEVENTO: ${eventoNarrar}\nNão peça testes.`, c2.mesa.qualidade || "rapido", 2000, 0.7);
      if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
    } catch (e) { if (e instanceof ErroCreditos) throw e; registrar(codigo, { tipo: "sys", texto: "(narração indisponível)" }); }
  }
  if (sala === "monstro" || sala === "chefe") {
    // Se um inimigo ganhou a iniciativa, ele age logo.
    const c3 = carregar(codigo, null) || carregar(codigo, ctx.uid);
    const cAtual = json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate);
    if (R.vezAtual(cAtual)?.tipo === "ini") await avancarCombate({ ...(c3 || ctx), uid: null });
  } else {
    abrirVotacaoExpedicao(codigo, exp);
  }
}

async function resolverExpedicao(ctx, resultado) {
  const exp = json(db.prepare("SELECT expedicao FROM mesas WHERE codigo = ?").get(ctx.codigo)?.expedicao);
  if (!exp?.ativa) return;
  if (resultado === "continuar") { await entrarSala(carregar(ctx.codigo, ctx.uid) || ctx, exp); return; }
  const vivos = Object.values(ctx.fichas).filter((f) => f.pv > 0);
  const parte = vivos.length ? Math.floor(exp.ouro / vivos.length) : 0;
  for (const f of vivos) { f.ouro = (f.ouro || 0) + parte; salvarFicha(ctx.codigo, f); }
  registrar(ctx.codigo, { tipo: "sys", texto: `O grupo volta com ${exp.ouro} peças de ouro (${parte} para cada um) depois de ${exp.andar} ${exp.modo === "torre" ? "andares" : "salas"}.`, ok: 1, evento: "expedicao_fim", selo: "OURO" });
  darXp(ctx.codigo, ctx.fichas, exp.andar * 10, "expedição concluída");
  salvarMesa(ctx.codigo, { expedicao: null, cena: AV.daMesa(ctx.mesa).cenaInicial });
}

// ── Epílogo ──
app.post("/api/epilogo", authMw, async (req, res) => {
  const codigo = codigoValido(req.body?.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const ctx = carregar(codigo, req.uid);
  if (!ctx) return erro(res, 404, "Mesa não encontrada.");
  if (ctx.mesa.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa pede o epílogo.");
  if (Number(ctx.mesa.aventuraConcluida) !== 1) return erro(res, 400, Number(ctx.mesa.aventuraConcluida) === 2 ? "O epílogo já foi narrado." : "A aventura ainda não terminou.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  try {
    salvarMesa(codigo, { aventuraConcluida: 2 });
    const r = await chamarMestre(ctx, M.promptEpilogo(ctx.mesa, Object.values(ctx.fichas), campanha.memoria(codigo)), ctx.mesa.qualidade || "rapido", 3000, 0.8);
    registrar(codigo, { tipo: "sys", texto: "Epílogo", evento: "epilogo", selo: "EPÍLOGO" });
    if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 3000) });
    darXp(codigo, ctx.fichas, R.XP.epilogo, "aventura concluída");
    broadcast(codigo, "atualizar", {});
    res.json({ ok: true });
  } catch (e) { salvarMesa(codigo, { aventuraConcluida: 1 }); erro(res, e instanceof ErroCreditos ? 402 : 502, e.message); }
});

// ── Diário e bestiário ──
function membroOu403(req, res) {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) { erro(res, 400, "Código inválido."); return null; }
  const uid = req.headers["x-user-id"] || _tokenUid(req);
  if (!uid || !db.prepare("SELECT uid FROM membros WHERE codigo = ? AND uid = ?").get(codigo, String(uid).slice(0, 36))) { erro(res, 403, "Você não é membro desta mesa."); return null; }
  return codigo;
}

app.get("/api/mesa/:codigo/diario", (req, res) => {
  const codigo = membroOu403(req, res); if (!codigo) return;
  const mesa = db.prepare("SELECT capitulo, aventuraConcluida, aventura FROM mesas WHERE codigo = ?").get(codigo);
  const lang = I18N.idiomaDe(req);
  const entradas = db.prepare(`SELECT id, t, tipo, texto, nome, evento, selo, capitulo FROM log
    WHERE codigo = ? AND (tipo IN ('narr', 'acao') OR evento IN ('capitulo', 'reputacao', 'npc', 'nivel', 'vitoria', 'derrota', 'item', 'aventura_fim', 'epilogo', 'expedicao_fim', 'votacao_fim'))
    ORDER BY id DESC LIMIT 400`).all(codigo).reverse();
  res.json({
    aventuraTitulo: lang === "en" ? AV.daMesa(mesa).tituloEn : AV.daMesa(mesa).titulo,
    capitulos: AV.capitulos(AV.daMesa(mesa), lang).map((c, i) => ({ ...c, numero: i + 1, concluido: i < (mesa?.capitulo || 0) || (mesa?.aventuraConcluida || 0) > 0 })),
    capituloAtual: mesa?.capitulo || 0,
    ...campanha.memoria(codigo),
    bestiario: campanha.bestiario(codigo),
    entradas: traduzirLog(entradas, lang),
  });
});

// ── Pontos de salvamento ──
function limiteSaves(mesa) {
  const s = creditos.situacao(contaDaMesa(mesa));
  return s?.apoiador ? 10 : 3;
}

app.get("/api/mesa/:codigo/saves", (req, res) => {
  const codigo = membroOu403(req, res); if (!codigo) return;
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  res.json({ saves: campanha.listarSaves(codigo), limite: limiteSaves(mesa) });
});

app.post("/api/mesa/:codigo/saves", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  const mesa = codigo && db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  if (mesa.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa salva o jogo.");
  if (json(mesa.combate) || json(mesa.rolagem)) return erro(res, 400, "Salve fora do combate e sem rolagem pendente.");
  if (campanha.listarSaves(codigo).length >= limiteSaves(mesa)) return erro(res, 400, `Limite de ${limiteSaves(mesa)} pontos de salvamento. Apague um antes.`);
  const id = campanha.salvar(codigo, texto(req.body?.nome, 40) || `Capítulo ${(mesa.capitulo || 0) + 1}`);
  registrar(codigo, { tipo: "sys", texto: "Jogo salvo.", evento: "save" });
  res.json({ ok: true, id });
});

app.post("/api/mesa/:codigo/saves/:id/carregar", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  const mesa = codigo && db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  if (mesa.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa carrega um jogo salvo.");
  const nome = campanha.carregarSave(codigo, Number(req.params.id));
  if (!nome) return erro(res, 404, "Ponto de salvamento não encontrado.");
  registrar(codigo, { tipo: "sys", texto: `Jogo carregado: ${nome}.`, evento: "save" });
  broadcast(codigo, "atualizar", {});
  res.json({ ok: true });
});

app.delete("/api/mesa/:codigo/saves/:id", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  const mesa = codigo && db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!mesa) return erro(res, 404, "Mesa não encontrada.");
  if (mesa.dono !== req.uid) return erro(res, 403, "Só quem criou a mesa apaga um jogo salvo.");
  campanha.apagarSave(codigo, Number(req.params.id));
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
  const capAtual = Number(ctx.mesa.capitulo) || 0;
  if (r?.cena) {
    campos.cena = texto(r.cena, 60);
    // Fundo: reaproveita, usa a biblioteca ou gera uma imagem nova só para cena nova.
    if (!ctx.mesa?.fundo || campos.cena !== ctx.mesa.cena) atualizarFundo(ctx, campos.cena);
  }
  if (r?.resumo) campos.resumo = texto(r.resumo, 900);
  if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });

  // Memória do mundo: flags, NPCs e reputação.
  const novos = campanha.registrarMundo(codigo, r, campos.cena || ctx.mesa.cena, capAtual);
  for (const n of novos) {
    if (n.tipo === "rep") registrar(codigo, { tipo: "sys", texto: `Reputação com ${n.chave}: ${R.comSinal(n.delta)} (agora ${R.comSinal(n.valor)}).`, ok: n.delta > 0 ? 1 : 0, evento: "reputacao" });
    else if (n.tipo === "npc") registrar(codigo, { tipo: "sys", texto: `${n.chave} agora está ${n.valor}.`, evento: "npc" });
  }

  // XP por participação (pequeno: o grosso vem de vitórias e capítulos).
  if (r?.narracao) darXp(codigo, ctx.fichas, R.XP.narracao);

  const combateAtual = () => json(campos.combate) || json(ctx.mesa?.combate);
  for (const ef of Array.isArray(r?.efeitos) ? r.efeitos.slice(0, 6) : []) {
    const alvoId = ef?.alvo;
    let f = ctx.fichas[alvoId];
    if (!f) f = Object.values(ctx.fichas).find((x) => x.nome === alvoId);
    if (f) {
      if (ef.cura) { const v = R.rolar(String(ef.cura)).total; f.pv = Math.min(f.pvMax, f.pv + v); registrar(codigo, { tipo: "roll", texto: `${f.nome} recupera ${v} PV`, ok: 1, evento: "cura" }); }
      if (ef.dano) { const v = R.rolar(String(ef.dano)).total; f.pv = Math.max(0, f.pv - v); registrar(codigo, { tipo: "roll", texto: `${f.nome} sofre ${v} de dano`, ok: 0, evento: "acerto_inimigo" }); }
      if (ef.status && R.aplicarStatus(f, ef.status, ef.turnos)) registrar(codigo, { tipo: "sys", texto: `${f.nome} está ${R.STATUS[ef.status].nome.toLowerCase()} (${Math.max(1, Math.min(10, Number(ef.turnos) || 2))} turnos).`, ok: ["protegido", "regenerando", "abencoado"].includes(ef.status) ? 1 : 0, evento: "status", selo: R.STATUS[ef.status].nome.toUpperCase() });
      salvarFicha(codigo, f);
      continue;
    }
    // Se o alvo não for um jogador, pode ser um inimigo do combate
    const combate = combateAtual();
    if (combate?.inimigos) {
      const ini = combate.inimigos.find((i) => i.id === alvoId || i.nome === alvoId);
      if (ini && ef.dano) {
        const v = R.rolar(String(ef.dano)).total;
        ini.pv = Math.max(0, ini.pv - v);
        registrar(codigo, { tipo: "roll", texto: `${ini.nome} sofre ${v} de dano`, ok: 1, evento: "acerto" });
      }
      if (ini && ef.status && R.aplicarStatus(ini, ef.status, ef.turnos)) registrar(codigo, { tipo: "sys", texto: `${ini.nome} está ${R.STATUS[ef.status].nome.toLowerCase()}.`, ok: 1, evento: "status", selo: R.STATUS[ef.status].nome.toUpperCase() });
      if (ini) campos.combate = JSON.stringify(combate);
    }
  }

  if (Array.isArray(r?.combate?.inimigos) && r.combate.inimigos.length && !ctx.mesa.combate) {
    const jogadores = Object.values(ctx.fichas).filter((f) => f.pv > 0);
    const c = R.iniciarCombate(jogadores, r.combate.inimigos);
    campos.combate = JSON.stringify(c);
    registrar(codigo, { tipo: "sys", texto: "Combate! Iniciativa: " + c.ordem.map((o) => `${o.nome} ${o.ini}`).join(" · "), evento: "combate_inicio", selo: "COMBATE" });
    const primeiro = R.vezAtual(c);
    if (primeiro) registrar(codigo, { tipo: "sys", texto: primeiro.tipo === "ini" ? `${primeiro.nome} age primeiro.` : `${primeiro.nome} age primeiro.`, evento: "iniciativa" });
  }

  // Capítulo concluído: XP, novo objetivo, passagem do tempo e encontro de estrada.
  if (r?.capituloConcluido === true && Number(ctx.mesa.aventuraConcluida) !== 1) {
    const CAPS = AV.daMesa(ctx.mesa).capitulos;
    const prox = capAtual + 1;
    registrar(codigo, { tipo: "sys", texto: `Capítulo ${capAtual + 1} concluído: ${CAPS[capAtual]?.titulo || ""}.`, ok: 1, evento: "capitulo", selo: "CAPÍTULO" });
    darXp(codigo, ctx.fichas, R.XP.capitulo, "capítulo concluído");
    if (prox >= CAPS.length) {
      campos.aventuraConcluida = 1;
      registrar(codigo, { tipo: "sys", texto: "A aventura foi concluída! Quem criou a mesa pode pedir o epílogo na aba Mesa.", ok: 1, evento: "aventura_fim", selo: "FIM" });
    } else {
      campos.capitulo = prox;
      const periodoIdx = (R.PERIODOS.indexOf(ctx.mesa.periodo) + 1) % R.PERIODOS.length;
      campos.periodo = R.PERIODOS[Math.max(0, periodoIdx)];
      campos.clima = Math.random() < 0.6 ? "limpo" : R.CLIMAS[1 + Math.floor(Math.random() * (R.CLIMAS.length - 1))];
      // Metade das vezes, um encontro curto no caminho antes do próximo capítulo.
      if (Math.random() < 0.5) campos.encontro = M.SEMENTES_ENCONTRO[Math.floor(Math.random() * M.SEMENTES_ENCONTRO.length)];
      registrar(codigo, { tipo: "sys", texto: `Capítulo ${prox + 1}: ${CAPS[prox].titulo}. Objetivo: ${CAPS[prox].objetivo} (${R.NOME_CLIMA[campos.clima]}, ${R.NOME_PERIODO[campos.periodo].toLowerCase()}).`, evento: "capitulo" });
    }
  }

  let rolagem = null;
  const minha = ctx.fichas[uid || ctx.uid];
  if (permitirTeste && r?.teste && minha) {
    const combate = json(campos.combate) || json(ctx.mesa.combate);
    rolagem = R.montarRolagem(minha, r.teste, combate, String(agora()), { clima: campos.clima || ctx.mesa.clima, periodo: campos.periodo || ctx.mesa.periodo });
    if (rolagem) campos.rolagem = JSON.stringify(rolagem);
  }
  if (Object.keys(campos).length) salvarMesa(codigo, campos);
}

/** Fim do combate: XP, bestiário, saque 1 de 3 e efeitos na expedição. */
function encerrarCombate(ctx, combate) {
  const codigo = ctx.codigo;
  const resultado = R.resultadoCombate(combate, ctx.fichas) || "vitoria";
  salvarMesa(codigo, { combate: null });
  const derrotados = (combate.inimigos || []).filter((i) => i.pv <= 0);
  const fugiram = (combate.inimigos || []).filter((i) => i.fugiu && i.pv > 0);
  for (const i of derrotados) campanha.registrarDerrota(codigo, i, ctx.mesa.cena);
  // Status de combate acabam com o combate.
  for (const f of Object.values(ctx.fichas)) { if (f.status?.length) { f.status = []; salvarFicha(codigo, f); } }
  const exp = json(db.prepare("SELECT expedicao FROM mesas WHERE codigo = ?").get(codigo)?.expedicao);

  if (resultado === "derrota") {
    registrar(codigo, { tipo: "sys", texto: "O grupo caiu. O combate terminou em derrota.", ok: 0, evento: "derrota", selo: "DERROTA" });
    if (exp?.ativa) {
      registrar(codigo, { tipo: "sys", texto: `A expedição acabou no andar ${exp.andar}. O ouro acumulado (${exp.ouro}) se perdeu.`, ok: 0, evento: "expedicao_fim" });
      salvarMesa(codigo, { expedicao: null, votacao: null });
    }
    // Ninguém fica morto para sempre: todos voltam com 1 PV para a história continuar.
    for (const f of Object.values(ctx.fichas)) { if (f.pv <= 0) { f.pv = 1; salvarFicha(codigo, f); } }
    broadcast(codigo, "combate-fim", { resultado });
    return;
  }

  registrar(codigo, { tipo: "sys", texto: `Vitória!${fugiram.length ? ` ${fugiram.map((i) => i.nome).join(", ")} fugiu.` : ""}`, ok: 1, evento: "vitoria", selo: "VITÓRIA" });
  const xp = Math.max(R.XP.vitoriaMinima, derrotados.length * R.XP.porInimigo + derrotados.filter((i) => i.chefe).length * 40);
  darXp(codigo, ctx.fichas, xp, "vitória em combate");

  // Saque: cada personagem vivo escolhe 1 entre 3 itens.
  const sorte = (exp?.andar || 0) + (derrotados.some((i) => i.chefe) ? 3 : 0);
  const saque = {};
  for (const f of Object.values(ctx.fichas)) if (f.pv > 0) saque[f.uid] = R.gerarSaque(sorte);
  const ouroBase = 5 * derrotados.length + (derrotados.some((i) => i.chefe) ? 25 : 0);
  for (const f of Object.values(ctx.fichas)) {
    if (f.pv <= 0) continue;
    f.ouro = (f.ouro || 0) + Math.round(ouroBase * R.efeitos(f).ouroMult);
    salvarFicha(codigo, f);
  }
  if (ouroBase) registrar(codigo, { tipo: "sys", texto: `Cada um encontra ${ouroBase} peças de ouro.`, ok: 1, evento: "ouro" });
  if (Object.keys(saque).length) {
    registrar(codigo, { tipo: "sys", texto: "Saque! Cada um escolhe 1 entre 3 itens na aba Mesa.", ok: 1, evento: "saque", selo: "SAQUE" });
    salvarMesa(codigo, { saque: JSON.stringify(saque) });
  }

  if (exp?.ativa) {
    exp.ouro += campanha.recompensaDoAndar(exp);
    salvarMesa(codigo, { expedicao: JSON.stringify(exp) });
    abrirVotacaoExpedicao(codigo, exp);
  }
  broadcast(codigo, "combate-fim", { resultado });
}

function abrirVotacaoExpedicao(codigo, exp) {
  const pergunta = exp.modo === "torre"
    ? `Andar ${exp.andar} vencido. Ouro acumulado: ${exp.ouro}. Subir mais um andar ou parar e levar o ouro?`
    : `Sala ${exp.andar} vencida. Ouro acumulado: ${exp.ouro}. Descer mais ou voltar para a superfície?`;
  const v = campanha.abrirVotacao("expedicao", pergunta, ["continuar", "parar"]);
  salvarMesa(codigo, { votacao: JSON.stringify(v) });
  registrar(codigo, { tipo: "sys", texto: `Votação: ${pergunta}`, evento: "votacao", selo: "VOTAÇÃO" });
}

async function avancarCombate(ctx) {
  const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(ctx.codigo);
  const combate = json(m.combate);
  if (!combate) return;
  if (R.combateAcabou(combate, ctx.fichas)) { encerrarCombate(ctx, combate); return; }
  const antes = {};
  for (const f of Object.values(ctx.fichas)) antes[f.uid] = JSON.stringify([f.pv, f.status]);
  const ocorrido = R.passarVez(combate, ctx.fichas, ctx.uid);
  for (const f of Object.values(ctx.fichas)) {
    if (JSON.stringify([f.pv, f.status]) !== antes[f.uid]) salvarFicha(ctx.codigo, f);
  }
  salvarMesa(ctx.codigo, { combate: JSON.stringify(combate) });
  for (const o of ocorrido) registrar(ctx.codigo, { tipo: "roll", texto: o.log.texto, ok: o.log.ok ? 1 : 0, evento: o.log.evento, selo: o.log.selo });
  if (R.combateAcabou(combate, ctx.fichas)) { encerrarCombate(ctx, combate); return; }
  const prox = R.vezAtual(combate);
  if (prox) registrar(ctx.codigo, { tipo: "sys", texto: `Vez de ${prox.nome}.`, evento: "vez" });
  broadcast(ctx.codigo, "atualizar", {});
  const ataques = ocorrido.filter((o) => /ataca/.test(o.linha));
  if (!OPENROUTER_KEY || !ataques.length) return;
  // Tenta narrar o turno dos inimigos (com 1 retry se falhar)
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await chamarMestre({ ...ctx, mesa: m }, `${M.contexto({ ...m, combate }, Object.values(ctx.fichas), [], extraContexto({ ...ctx, mesa: m }))}\n\nTurno dos inimigos. Narre o que aconteceu, com base exatamente nestes resultados já rolados pelo código:\n${ocorrido.map((o) => o.linha).join("\n")}${prox ? `\nDepois disso é a vez de ${prox.nome}. A situação pede ação de ${prox.nome}.` : ""}\nNão peça testes. Deixe "teste", "combate" e "efeitos" vazios.`, m.qualidade || "rapido", 3000, 0.3 + tentativa * 0.2);
      if (r?.narracao) registrar(ctx.codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
      break;
    } catch (e) {
      if (e instanceof ErroCreditos) { registrar(ctx.codigo, { tipo: "sys", texto: e.message }); break; }
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