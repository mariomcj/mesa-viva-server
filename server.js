/**
 * Mesa Viva — Servidor (Express + SQLite + OpenRouter)
 *
 * Identidade: toda rota do jogo exige o token de login (Authorization: Bearer).
 * O jogador é o id da CONTA. O cabeçalho X-User-Id (id antigo do aparelho) só serve
 * para migrar, uma única vez, as mesas e fichas criadas antes do login para a conta.
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
const T = require("./temas");
const MP = require("./mapa");

// ── Config ──
// .env primeiro, para as variáveis valerem abaixo
try { const fs = require("fs"); if (fs.existsSync(".env")) { const e = fs.readFileSync(".env", "utf8"); for (const l of e.split("\n")) { const m = l.match(/^([^=#]+)=(.*)$/); if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim(); } } } catch (_) {}
const PORT = Number(process.env.PORT) || 3062;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
const DB_PATH = process.env.DB_PATH || "./mesa-viva.db";
const BASE_URL_FIXA = process.env.PUBLIC_BASE_URL || "";
let SERVER_BASE_URL = BASE_URL_FIXA || "https://download.proflow.online";
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_VALIDADE_MS = 90 * 24 * 3600_000;      // login vale 90 dias
const TRAVA_MS = 150_000;                          // tempo máximo de uma narração em andamento
const ONLINE_WINDOW_MS = 90_000;                   // 90 s sem atividade = offline
const TYPING_TTL_MS = 6_000;                       // 6 s sem batida = parou de digitar
const LIMITE_IA = { max: Number(process.env.LIMITE_IA_MAX) || 40, janelaMs: 10 * 60_000 }; // por conta: 40 pedidos à IA a cada 10 min

// ── Admin: sem ADMIN_PASS definido, o painel fica desligado (nunca uma senha padrão) ──
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "";
const _adminTokens = new Map(); // token -> expira
function adminMw(req, res, next) {
  const tok = req.headers["x-admin-token"];
  const exp = tok && _adminTokens.get(tok);
  if (!exp || exp < Date.now()) { if (tok) _adminTokens.delete(tok); return erro(res, 401, "Não autenticado."); }
  next();
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
    cena TEXT DEFAULT '',
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

// ── Migrations (idempotentes) ──
try { db.exec("ALTER TABLE membros ADD COLUMN ultimaAtividade INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN ultimaNarrativa INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN fundo TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS reacoes (codigo TEXT NOT NULL, logId INTEGER NOT NULL, uid TEXT NOT NULL, tipo TEXT NOT NULL, PRIMARY KEY (codigo, logId, uid))"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS sessoes (codigo TEXT NOT NULL, uid TEXT NOT NULL, resumo TEXT DEFAULT '', criadaEm INTEGER DEFAULT (strftime('%s','now')*1000), PRIMARY KEY (codigo, uid))"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, criadoEm INTEGER NOT NULL)"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, userId TEXT NOT NULL, criadoEm INTEGER NOT NULL)"); } catch (e) {}
try { db.exec("ALTER TABLE tokens ADD COLUMN expiraEm INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS aparelhos (deviceUid TEXT PRIMARY KEY, userId TEXT NOT NULL, vinculadoEm INTEGER NOT NULL)"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_log_codigo ON log (codigo, id)"); } catch (e) {}
// Temas e arco da história. Mesas antigas ficam com tema clássico e duração curta.
try { db.exec("ALTER TABLE mesas ADD COLUMN tema TEXT DEFAULT 'classico'"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN duracao TEXT DEFAULT 'curta'"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN desejos TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN arco TEXT"); } catch (e) {}                          // arco inteiro (privado), JSON
try { db.exec("ALTER TABLE mesas ADD COLUMN arcoAjustes TEXT DEFAULT '[]'"); } catch (e) {}       // últimos 6 ajustes do Mestre, JSON
try { db.exec("ALTER TABLE mesas ADD COLUMN ato INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN arcoConcluido INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE mesas ADD COLUMN atoInicio INTEGER DEFAULT 0"); } catch (e) {}          // id do diário em que o ato atual começou

// ── Helpers ──
function uid() { return crypto.randomUUID().slice(0, 8); }
function json(s) { if (!s) return null; if (typeof s === "object") return s; try { return JSON.parse(s); } catch { return null; } }
function agora() { return Date.now(); }

function texto(v, max) {
  let s = String(v ?? "").trim();
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿]/g, "");
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");
  if (s.length > max) {
    s = s.substring(0, max);
    const last = s.charCodeAt(max - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, max - 1);
  }
  return s;
}

function codigoValido(v) {
  const c = texto(v, 8).toUpperCase();
  return /^[A-Z0-9]{5}$/.test(c) ? c : null;
}

function erro(res, status, msg) { return res.status(status).json({ error: msg }); }

// ── Senhas (scrypt) e tokens ──
function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(senha), sal, 32).toString("hex");
  return `scrypt$${sal}$${h}`;
}
function conferirSenha(guardada, senha) {
  if (!guardada || !senha) return false;
  if (guardada.startsWith("scrypt$")) {
    const [, sal, h] = guardada.split("$");
    const calc = crypto.scryptSync(String(senha), sal, 32);
    const esp = Buffer.from(h, "hex");
    return esp.length === calc.length && crypto.timingSafeEqual(esp, calc);
  }
  // senha antiga em texto puro: compara em tempo constante; o login regrava como hash
  const a = Buffer.from(String(guardada)), b = Buffer.from(String(senha));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function emitirToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO tokens (token, userId, criadoEm, expiraEm) VALUES (?, ?, ?, ?)").run(token, userId, agora(), agora() + TOKEN_VALIDADE_MS);
  return token;
}
function usuarioDoToken(req) {
  const auth = String(req.headers["authorization"] || "");
  if (!auth.startsWith("Bearer ")) return null;
  const row = db.prepare("SELECT userId, criadoEm, expiraEm FROM tokens WHERE token = ?").get(auth.slice(7));
  if (!row) return null;
  const expira = row.expiraEm || row.criadoEm + TOKEN_VALIDADE_MS;
  if (expira < agora()) { db.prepare("DELETE FROM tokens WHERE token = ?").run(auth.slice(7)); return null; }
  return row.userId;
}

/**
 * Migração única: mesas e fichas criadas com o id do aparelho (antes do login) passam para a conta.
 * Só acontece se o aparelho ainda não foi vinculado a nenhuma conta. Depois disso o id do aparelho é ignorado.
 */
const _aparelhosVistos = new Set();
function vincularAparelho(userId, deviceUid) {
  const d = texto(deviceUid, 36);
  if (!d || d === userId || _aparelhosVistos.has(d)) return;
  _aparelhosVistos.add(d);
  if (db.prepare("SELECT 1 FROM aparelhos WHERE deviceUid = ?").get(d)) return;
  if (db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(d)) return; // é id de outra conta, não de aparelho
  db.transaction(() => {
    db.prepare("INSERT INTO aparelhos (deviceUid, userId, vinculadoEm) VALUES (?, ?, ?)").run(d, userId, agora());
    for (const m of db.prepare("SELECT codigo, nome, ultimaAtividade FROM membros WHERE uid = ?").all(d)) {
      db.prepare("INSERT OR IGNORE INTO membros (codigo, uid, nome, ultimaAtividade) VALUES (?, ?, ?, ?)").run(m.codigo, userId, m.nome, m.ultimaAtividade || 0);
    }
    db.prepare("DELETE FROM membros WHERE uid = ?").run(d);
    for (const f of db.prepare("SELECT codigo, dados FROM fichas WHERE uid = ?").all(d)) {
      const dados = json(f.dados) || {};
      dados.uid = userId;
      db.prepare("INSERT OR IGNORE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(f.codigo, userId, JSON.stringify(dados));
    }
    db.prepare("DELETE FROM fichas WHERE uid = ?").run(d);
    db.prepare("UPDATE mesas SET dono = ? WHERE dono = ?").run(userId, d);
    db.prepare("UPDATE log SET autor = ? WHERE autor = ?").run(userId, d);
    db.prepare("UPDATE OR IGNORE reacoes SET uid = ? WHERE uid = ?").run(userId, d);
    for (const m of db.prepare("SELECT codigo, combate, rolagem, processando FROM mesas WHERE combate LIKE ? OR rolagem LIKE ? OR processando LIKE ?").all(`%${d}%`, `%${d}%`, `%${d}%`)) {
      const troca = (s) => (s ? s.split(`"${d}"`).join(`"${userId}"`) : s);
      db.prepare("UPDATE mesas SET combate = ?, rolagem = ?, processando = ? WHERE codigo = ?").run(troca(m.combate), troca(m.rolagem), troca(m.processando), m.codigo);
    }
  })();
  console.log(`[migração] aparelho ${d} vinculado à conta ${userId}`);
}

/** Toda rota do jogo: exige login. req.uid = id da conta. */
function authMw(req, res, next) {
  const userId = usuarioDoToken(req);
  if (!userId) return erro(res, 401, "Faça login novamente.");
  req.uid = userId;
  const aparelho = req.headers["x-user-id"];
  if (aparelho) vincularAparelho(userId, aparelho);
  const cod = codigoValido(req.body?.codigo || req.params?.codigo);
  if (cod) db.prepare("UPDATE membros SET ultimaAtividade = ? WHERE codigo = ? AND uid = ?").run(agora(), cod, userId);
  next();
}

function ehMembro(codigo, uid) {
  return !!db.prepare("SELECT 1 FROM membros WHERE codigo = ? AND uid = ?").get(codigo, uid);
}
/** Lê o código da mesa (corpo ou URL) e confere se quem chama é membro. Devolve o código ou null (resposta já enviada). */
function mesaDoMembro(req, res) {
  const codigo = codigoValido(req.params?.codigo || req.body?.codigo);
  if (!codigo) { erro(res, 400, "Código inválido."); return null; }
  if (!db.prepare("SELECT 1 FROM mesas WHERE codigo = ?").get(codigo)) { erro(res, 404, "Mesa não encontrada."); return null; }
  if (!ehMembro(codigo, req.uid)) { erro(res, 403, "Você não é membro desta mesa."); return null; }
  return codigo;
}

// Limite de pedidos à IA por conta (protege os créditos)
const _usoIA = new Map(); // uid -> [instantes]
function limiteIA(req, res, next) {
  const t = agora();
  const lista = (_usoIA.get(req.uid) || []).filter((x) => t - x < LIMITE_IA.janelaMs);
  if (lista.length >= LIMITE_IA.max) return erro(res, 429, "Muitos pedidos ao Mestre. Espere alguns minutos.");
  lista.push(t);
  _usoIA.set(req.uid, lista);
  next();
}
setInterval(() => { const t = agora(); for (const [k, v] of _usoIA) if (!v.some((x) => t - x < LIMITE_IA.janelaMs)) _usoIA.delete(k); }, 60_000).unref();

// Quem está digitando: Map<codigo, Map<uid, {nome, ate}>>
const digitando = new Map();
function atualizarDigitando(codigo, uid, nome, ativo) {
  if (!digitando.has(codigo)) digitando.set(codigo, new Map());
  const m = digitando.get(codigo);
  if (ativo) m.set(uid, { nome, ate: agora() + TYPING_TTL_MS });
  else { m.delete(uid); if (!m.size) digitando.delete(codigo); }
}
function limparDigitando(codigo) {
  if (!digitando.has(codigo)) return;
  const m = digitando.get(codigo);
  const t = agora();
  for (const [u, v] of m) if (v.ate < t) m.delete(u);
  if (!m.size) digitando.delete(codigo);
}

// Carrega mesa + fichas + log recente (null se a mesa não existe ou se uid não é membro)
function carregar(codigo, uid) {
  const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  if (!m || !ehMembro(codigo, uid)) return null;
  m.combate = json(m.combate);
  m.rolagem = json(m.rolagem);
  m.processando = json(m.processando);
  m.arco = json(m.arco);
  m.arcoAjustes = json(m.arcoAjustes) || [];
  m.tema = T.temaPorId(m.tema).id;
  m.duracao = T.duracaoValida(m.duracao);
  m._narracoesNoAto = db.prepare("SELECT COUNT(*) c FROM log WHERE codigo = ? AND tipo = 'narr' AND id > ?").get(codigo, m.atoInicio || 0).c;
  m.membros = Object.fromEntries(db.prepare("SELECT uid, nome FROM membros WHERE codigo = ?").all(codigo).map((r) => [r.uid, r.nome]));
  const fichas = {};
  for (const f of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) fichas[f.uid] = R.normalizarFicha(json(f.dados), f.uid);
  const recentes = db.prepare("SELECT * FROM log WHERE codigo = ? ORDER BY id DESC LIMIT 14").all(codigo).reverse();
  return { codigo, uid, mesa: m, fichas, recentes };
}

const COLUNAS_MESA = new Set(["fase", "tom", "vetos", "qualidade", "cdVisivel", "cena", "resumo", "combate", "rolagem", "processando", "inicio", "ultimaNarrativa", "fundo",
  "tema", "duracao", "desejos", "arco", "arcoAjustes", "ato", "arcoConcluido", "atoInicio"]);
function salvarMesa(codigo, campos) {
  // A imagem do mapa chega em segundo plano: quem grava um combate lido antes dela não pode apagá-la
  const c = campos.combate;
  if (c && typeof c === "object" && c.id && c.mapa && !c.mapa.imagem) {
    const atual = json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo)?.combate);
    if (atual?.id === c.id && atual.mapa?.imagem) c.mapa.imagem = atual.mapa.imagem;
  }
  const pares = Object.entries(campos).filter(([k]) => COLUNAS_MESA.has(k));
  if (!pares.length) return;
  const sets = pares.map(([k]) => `${k} = ?`).join(", ");
  const vals = pares.map(([, v]) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v));
  db.prepare(`UPDATE mesas SET ${sets} WHERE codigo = ?`).run(...vals, codigo);
}
function salvarFicha(codigo, f) {
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, f.uid);
}

/** Grava entradas no diário e devolve os ids criados. */
function registrar(codigo, ...entradas) {
  const stmt = db.prepare("INSERT INTO log (codigo, t, tipo, texto, autor, nome, res, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const t = agora();
  const ids = [];
  let narrou = false;
  for (const [i, e] of entradas.entries()) {
    const info = stmt.run(codigo, t + i, e.tipo, e.texto, e.autor || null, e.nome || null, e.res || null, e.ok != null ? (e.ok ? 1 : 0) : null);
    ids.push(Number(info.lastInsertRowid));
    if (e.tipo === "narr") narrou = true;
  }
  if (narrou) salvarMesa(codigo, { ultimaNarrativa: ids[ids.length - 1] });
  broadcast(codigo, narrou ? "narrativa" : "nova", {});
  return ids;
}

function broadcast(codigo, evento, dados) {
  const msg = JSON.stringify({ evento, dados });
  for (const ws of wss.clients) {
    if (ws.mesa === codigo && ws.readyState === 1) { try { ws.send(msg); } catch {} }
  }
}

/** Trava "o Mestre está narrando": só um pedido à IA por mesa de cada vez. Devolve mensagem de erro ou null. */
function travar(codigo, uid, nome) {
  const m = db.prepare("SELECT processando FROM mesas WHERE codigo = ?").get(codigo);
  const p = json(m?.processando);
  if (p && agora() - p.desde < TRAVA_MS) return p.por === uid ? "Sua ação já está sendo processada." : `O Mestre está narrando a ação de ${p.nome}. Espere um pouco.`;
  salvarMesa(codigo, { processando: { por: uid, nome, desde: agora() } });
  broadcast(codigo, "atualizar", {});
  return null;
}
function destravar(codigo) { salvarMesa(codigo, { processando: null }); broadcast(codigo, "atualizar", {}); }

const msgErro = (e) => (e instanceof M.ErroMestre ? e.message : "O Mestre não respondeu. Tente de novo.");

// ── Express ──
const app = express();
app.set("trust proxy", 1);
if (!BASE_URL_FIXA) {
  // Sem PUBLIC_BASE_URL, usa o host pelo qual o servidor foi acessado (exceto localhost)
  app.use((req, res, next) => {
    const host = String(req.headers["x-forwarded-host"] || req.headers["host"] || "");
    if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) SERVER_BASE_URL = `https://${host}`;
    next();
  });
}
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get(["/admin", "/admin/"], (req, res) => res.redirect(301, "/admin.html"));
app.use(express.static("public", {
  setHeaders(res, path) {
    if (path.endsWith(".apk")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  },
}));
if (process.env.LOG_REQUESTS !== "0") app.use((req, res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); next(); });

// ── Limite geral de requisições (por login ou IP, por rota) ──
const RATE_LIMIT = new Map();
const RATE_WIN = 60_000;
app.use((req, res, next) => {
  const quem = String(req.headers["authorization"] || "").slice(-16) || req.ip;
  const key = `${quem}:${req.method}:${req.path}`;
  const max = (req.method === "GET" ? 150 : 60) * (Number(process.env.RATE_MULTIPLICADOR) || 1); // o app consulta a mesa a cada 2 s
  const t = agora();
  const r = RATE_LIMIT.get(key);
  if (!r || t - r.win > RATE_WIN) RATE_LIMIT.set(key, { win: t, count: 1 });
  else if (r.count >= max) return erro(res, 429, "Muitas requisições. Aguarde um minuto.");
  else r.count++;
  next();
});
setInterval(() => { const t = agora(); for (const [k, v] of RATE_LIMIT) if (t - v.win > RATE_WIN) RATE_LIMIT.delete(k); }, 60_000).unref();

// ── Health ──
app.get("/api/ping", (_, res) => res.json({ status: "pong", server: "mesa-viva" }));

// ── API: Auth ──
function respostaLogin(req, res, user) {
  const aparelho = req.headers["x-user-id"];
  if (aparelho) vincularAparelho(user.id, aparelho);
  res.json({ token: emitirToken(user.id), usuario: { id: user.id, nome: user.nome, email: user.email } });
}

app.post("/api/auth/registrar", (req, res) => {
  const nome = texto(req.body?.nome, 30) || "Jogador";
  const email = texto(req.body?.email, 100).toLowerCase();
  const senha = String(req.body?.senha ?? "");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro(res, 400, "Email inválido.");
  if (senha.length < 6) return erro(res, 400, "A senha precisa ter pelo menos 6 caracteres.");
  const id = uid();
  try {
    db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, ?, ?)").run(id, nome, email, hashSenha(senha), agora());
  } catch (e) {
    if (e.message?.includes("UNIQUE")) return erro(res, 409, "Email já cadastrado.");
    return erro(res, 500, "Erro ao registrar.");
  }
  respostaLogin(req, res, { id, nome, email });
});

app.post("/api/auth/login", (req, res) => {
  const email = texto(req.body?.email, 100).toLowerCase();
  const senha = String(req.body?.senha ?? "");
  if (!email || !senha) return erro(res, 400, "Email e senha obrigatórios.");
  const user = db.prepare("SELECT id, nome, email, senha FROM usuarios WHERE lower(email) = ?").get(email);
  if (!user || !conferirSenha(user.senha, senha)) return erro(res, 401, "Email ou senha incorretos.");
  if (!user.senha.startsWith("scrypt$")) db.prepare("UPDATE usuarios SET senha = ? WHERE id = ?").run(hashSenha(senha), user.id);
  respostaLogin(req, res, user);
});

app.post("/api/auth/sair", (req, res) => {
  const auth = String(req.headers["authorization"] || "");
  if (auth.startsWith("Bearer ")) db.prepare("DELETE FROM tokens WHERE token = ?").run(auth.slice(7));
  res.json({ ok: true });
});

app.get("/api/user/dados", authMw, (req, res) => {
  const user = db.prepare("SELECT id, nome, email, criadoEm FROM usuarios WHERE id = ?").get(req.uid);
  if (!user) return erro(res, 404, "Usuário não encontrado.");
  res.json(user);
});

app.get("/api/user/mesas", authMw, (req, res) => {
  const linhas = db.prepare(`
    SELECT me.codigo, me.fase, me.criadaEm, CASE WHEN me.dono = ? THEN 'dono' ELSE 'membro' END as papel, me.tema, me.arco
    FROM membros m JOIN mesas me ON m.codigo = me.codigo
    WHERE m.uid = ? ORDER BY me.criadaEm DESC
  `).all(req.uid, req.uid);
  const mesas = linhas.map(({ arco, tema, ...m }) => {
    const t = T.temaPorId(tema);
    return { ...m, tema: t.id, temaNome: t.nome, temaIcone: t.icone, titulo: M.arcoPublico({ fase: m.fase, tema: t.id, arco })?.titulo || "" };
  });
  res.json({ mesas });
});

// ── API: Temas da história ──
app.get("/api/temas", authMw, (req, res) => res.json(T.listaPublica()));

// ── API: Mesa (criar / entrar / sair) ──
function criarMesa(req, res) {
  const nome = texto(req.body?.nome, 30) || "Jogador";
  const tema = T.resolverTema(req.body?.tema);          // "surpresa" sorteia; inválido = clássico
  const duracao = T.duracaoValida(req.body?.duracao);   // inválida = curta
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = Array.from({ length: 5 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
    if (db.prepare("SELECT 1 FROM mesas WHERE codigo = ?").get(codigo)) continue;
    db.prepare("INSERT INTO mesas (codigo, dono, criadaEm, tema, duracao, cena) VALUES (?, ?, ?, ?, ?, '')").run(codigo, req.uid, agora(), tema, duracao);
    db.prepare("INSERT INTO membros (codigo, uid, nome, ultimaAtividade) VALUES (?, ?, ?, ?)").run(codigo, req.uid, nome, agora());
    return res.json({ codigo, uid: req.uid });
  }
  erro(res, 503, "Não consegui criar a mesa.");
}
function entrarMesa(codigoBruto, req, res) {
  const codigo = codigoValido(codigoBruto);
  if (!codigo) return erro(res, 400, "Código inválido.");
  const nome = texto(req.body?.nome, 30) || "Jogador";
  if (!db.prepare("SELECT 1 FROM mesas WHERE codigo = ?").get(codigo)) return erro(res, 404, "Mesa não encontrada.");
  if (!ehMembro(codigo, req.uid)) {
    const total = db.prepare("SELECT COUNT(*) as c FROM membros WHERE codigo = ?").get(codigo).c;
    if (total >= 6) return erro(res, 409, "Mesa cheia (6 jogadores).");
    db.prepare("INSERT INTO membros (codigo, uid, nome, ultimaAtividade) VALUES (?, ?, ?, ?)").run(codigo, req.uid, nome, agora());
  } else {
    db.prepare("UPDATE membros SET nome = ? WHERE codigo = ? AND uid = ?").run(nome, codigo, req.uid);
  }
  broadcast(codigo, "membro", { uid: req.uid, nome });
  res.json({ codigo, uid: req.uid });
}

app.post("/api/mesa/criar", authMw, criarMesa);
app.post("/api/criar-mesa", authMw, criarMesa);                                 // rota antiga
app.post("/api/mesa/entrar/:codigo", authMw, (req, res) => entrarMesa(req.params.codigo, req, res));
app.post("/api/entrar-mesa", authMw, (req, res) => entrarMesa(req.body?.codigo, req, res)); // rota antiga

app.post("/api/mesa/:codigo/sair", authMw, (req, res) => {
  const codigo = codigoValido(req.params.codigo);
  if (!codigo) return erro(res, 400, "Código inválido.");
  db.prepare("DELETE FROM membros WHERE codigo = ? AND uid = ?").run(codigo, req.uid);
  broadcast(codigo, "saiu", { uid: req.uid });
  res.json({ ok: true });
});

// ── API: Google OAuth (PKCE com Web Application) ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "SUA_GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "SUA_GOOGLE_CLIENT_SECRET";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://download.proflow.online/auth/google/callback";
const _pkceStates = {}; // state -> { codeVerifier, criadoEm } | { token, usuario, criadoEm }
setInterval(() => { const t = agora(); for (const k in _pkceStates) if (t - _pkceStates[k].criadoEm > 15 * 60_000) delete _pkceStates[k]; }, 60_000).unref();
const escaparHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.post("/api/auth/google/iniciar", async (req, res) => {
  try {
    const state = crypto.randomBytes(12).toString("base64url");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    _pkceStates[state] = { codeVerifier, criadoEm: agora() };
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, response_type: "code", redirect_uri: GOOGLE_REDIRECT_URI,
      scope: "openid email profile", state, code_challenge: codeChallenge, code_challenge_method: "S256", access_type: "offline",
    });
    res.json({ auth_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params, state });
  } catch (e) {
    erro(res, 502, "Erro ao iniciar o login com Google.");
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.type("html").send("<h2>Faltam parâmetros (code, state).</h2>");
  const dados = _pkceStates[state];
  if (!dados || !dados.codeVerifier) return res.type("html").send("<h2>Login expirado. Volte ao app e tente de novo.</h2>");
  delete _pkceStates[state];
  try {
    const tr = await (await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, code, code_verifier: dados.codeVerifier, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }),
    })).json();
    if (tr.error) return res.type("html").send("<h2>Erro do Google: " + escaparHtml(tr.error_description || tr.error) + "</h2>");
    const userR = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + tr.access_token } })).json();
    if (userR.error || !userR.email) return res.type("html").send("<h2>Erro ao obter os dados da conta Google.</h2>");
    const email = String(userR.email).toLowerCase();
    const nome = texto(userR.name || userR.given_name || "Jogador", 30);
    let user = db.prepare("SELECT id, nome, email FROM usuarios WHERE lower(email) = ?").get(email);
    if (!user) {
      const id = uid();
      db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, '', ?)").run(id, nome, email, agora());
      user = { id, nome, email };
    }
    _pkceStates[state] = { token: emitirToken(user.id), usuario: user, criadoEm: agora() };
    res.type("html").send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Login OK</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a1a;color:#e0e0e0;text-align:center}.card{background:#1a1a3a;border-radius:16px;padding:40px 32px;max-width:400px}.ok{font-size:48px}</style></head><body><div class="card"><div class="ok">✓</div><h2>Login com Google concluído</h2><p>Pode voltar para o app: ele entra sozinho em alguns segundos.</p></div></body></html>`);
  } catch (e) {
    console.error("[google]", e);
    res.type("html").send("<h2>Erro interno no login com Google. Tente de novo.</h2>");
  }
});

app.post("/api/auth/google/verificar", (req, res) => {
  const state = texto(req.body?.state, 40);
  if (!state) return erro(res, 400, "state obrigatório.");
  const dados = _pkceStates[state];
  if (!dados || !dados.token) return res.json({ status: "pending" });
  delete _pkceStates[state];
  const aparelho = req.headers["x-user-id"];
  if (aparelho) vincularAparelho(dados.usuario.id, aparelho);
  res.json({ status: "done", token: dados.token, usuario: dados.usuario });
});

// ── API: configuração da mesa ──
app.post("/api/configurar-mesa", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const d = req.body || {};
  const campos = {};
  if (["epico", "humor", "sombrio"].includes(d.tom)) campos.tom = d.tom;
  if (typeof d.vetos === "string") campos.vetos = texto(d.vetos, 300);
  if (["rapido", "caprichado"].includes(d.qualidade)) campos.qualidade = d.qualidade;
  if (typeof d.cdVisivel === "boolean") campos.cdVisivel = d.cdVisivel ? 1 : 0;
  if (typeof d.desejos === "string") campos.desejos = texto(d.desejos, 300);   // "Rumo da história": vale em qualquer fase
  // Tema e duração só antes de começar. Mandar o mesmo valor de novo não é troca (o app pode reenviar tudo).
  const atual = db.prepare("SELECT fase, tema, duracao FROM mesas WHERE codigo = ?").get(codigo);
  const temaAtual = T.temaPorId(atual.tema).id, duracaoAtual = T.duracaoValida(atual.duracao);
  const trocaTema = T.ehTemaValido(d.tema) && d.tema !== temaAtual;
  const trocaDuracao = T.ehDuracaoValida(d.duracao) && d.duracao !== duracaoAtual;
  if (trocaTema || trocaDuracao) {
    if (atual.fase !== "lobby") return erro(res, 409, "A aventura já começou: o tema não muda mais.");
    if (trocaTema) campos.tema = T.resolverTema(d.tema);
    if (trocaDuracao) campos.duracao = d.duracao;
  }
  if (Object.keys(campos).length) { salvarMesa(codigo, campos); broadcast(codigo, "atualizar", {}); }
  res.json({ ok: true });
});

app.post("/api/reiniciar-mesa", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const mesa = db.prepare("SELECT dono FROM mesas WHERE codigo = ?").get(codigo);
  if (mesa.dono !== req.uid) return erro(res, 403, "Só o dono pode reiniciar.");
  db.transaction(() => {
    db.prepare("DELETE FROM log WHERE codigo = ?").run(codigo);
    for (const f of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) {
      const ficha = R.normalizarFicha(json(f.dados), f.uid);
      ficha.pv = ficha.pvMax;
      salvarFicha(codigo, ficha);
    }
    // tema, duração e rumo da história ficam; o arco é apagado e será criado de novo no próximo começo
    salvarMesa(codigo, { fase: "lobby", combate: null, rolagem: null, processando: null, resumo: "", inicio: null, cena: "", fundo: "",
      arco: null, arcoAjustes: [], ato: 1, arcoConcluido: 0, atoInicio: 0 });
  })();
  broadcast(codigo, "reinicio", {});
  res.json({ ok: true });
});

// ── API: Personagem ──
/**
 * Tema para pedidos fora do jogo (criar personagem, gerar imagem): o da mesa, se vier o código
 * de uma mesa da qual a pessoa é membro; senão o `tema` do corpo; senão o clássico.
 */
function temaDoPedido(req) {
  const cod = codigoValido(req.body?.codigo);
  if (cod && ehMembro(cod, req.uid)) return T.temaPorId(db.prepare("SELECT tema FROM mesas WHERE codigo = ?").get(cod)?.tema);
  return T.temaPorId(req.body?.tema);
}

app.post("/api/criar-personagem", authMw, limiteIA, async (req, res) => {
  const conceito = texto(req.body?.conceito, 300);
  if (!conceito) return erro(res, 400, "Descreva seu personagem.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const tema = temaDoPedido(req);
  try {
    const r = await M.perguntar(OPENROUTER_KEY, M.promptCriacao(tema, conceito), "rapido", 2000);
    const ficha = R.normalizarFicha({ ...r, pv: undefined, xp: 0, nivel: 1 }, req.uid, conceito);
    res.json({ ficha });
  } catch (e) { erro(res, 502, msgErro(e)); }
});

app.post("/api/salvar-ficha", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const recebida = req.body?.ficha || {};
  const antigaRow = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, req.uid);
  const antiga = antigaRow ? R.normalizarFicha(json(antigaRow.dados), req.uid) : null;
  const mesa = db.prepare("SELECT fase, combate FROM mesas WHERE codigo = ?").get(codigo);
  // XP e nível são do servidor: o app não os altera
  const nova = R.normalizarFicha({ ...recebida, xp: antiga?.xp ?? 0, nivel: antiga?.nivel ?? 1 }, req.uid);
  if (!antiga || mesa.fase === "lobby") {
    // fora da sessão: vida cheia, a não ser que o jogador mande outra
    if (recebida.pv === undefined || recebida.pv === null) nova.pv = nova.pvMax;
  } else {
    // durante a sessão, o jogador só ajusta a vida de 1 em 1 (botões −1/+1) e nunca durante um combate
    const pedida = Number(recebida.pv);
    const ajusteManual = !json(mesa.combate) && Number.isFinite(pedida) && Math.abs(pedida - antiga.pv) <= 1;
    nova.pv = ajusteManual ? Math.max(0, Math.min(nova.pvMax, pedida)) : Math.min(antiga.pv, nova.pvMax);
  }
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(codigo, req.uid, JSON.stringify(nova));
  broadcast(codigo, "ficha", { uid: req.uid });
  res.json({ ficha: nova });
});

app.post("/api/gerar-imagem", authMw, limiteIA, async (req, res) => {
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const prompt = texto(req.body?.prompt, 500);
  if (!prompt) return erro(res, 400, "Descreva a imagem.");
  try {
    const url = await M.gerarImagem(OPENROUTER_KEY, `Ilustração para RPG de mesa, ${temaDoPedido(req).estiloImagem}: ${prompt}`, SERVER_BASE_URL);
    if (!url) return erro(res, 502, "Não foi possível gerar a imagem agora.");
    res.json({ url });
  } catch (e) { erro(res, 502, "Não foi possível gerar a imagem agora."); }
});

// ── API: Admin (desligado se ADMIN_PASS não estiver definido) ──
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASS) return erro(res, 503, "Painel desativado. Defina ADMIN_PASS no .env do servidor.");
  const { user, pass } = req.body || {};
  const ok = typeof user === "string" && typeof pass === "string" && user === ADMIN_USER &&
    pass.length === ADMIN_PASS.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASS));
  if (!ok) return erro(res, 401, "Usuário ou senha inválidos.");
  const token = crypto.randomBytes(24).toString("hex");
  _adminTokens.set(token, agora() + 24 * 3600_000);
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
  const fichas = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(cod).map((r) => {
    try { return { uid: r.uid, ...JSON.parse(r.dados) }; } catch { return { uid: r.uid }; }
  });
  const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(cod);
  res.json({ mesa, fichas, membros });
});

app.post("/api/admin/mesas", adminMw, (req, res) => {
  const { codigo, cena, tom } = req.body || {};
  const cod = String(codigo || Math.random().toString(36).slice(2, 7)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (cod.length < 3) return erro(res, 400, "Código inválido.");
  if (db.prepare("SELECT codigo FROM mesas WHERE codigo = ?").get(cod)) return erro(res, 409, "Código já existe.");
  db.prepare("INSERT INTO mesas (codigo, dono, cena, tom) VALUES (?, 'admin', ?, ?)").run(cod, cena || "", tom || "epico");
  res.json({ ok: true, codigo: cod });
});

app.put("/api/admin/mesas/:codigo", adminMw, (req, res) => {
  const campos = [], params = [];
  for (const k of ["cena", "fase", "tom", "resumo", "fundo"]) {
    if (req.body[k] !== undefined) { campos.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (!campos.length) return erro(res, 400, "Nada a alterar.");
  params.push(req.params.codigo);
  db.prepare(`UPDATE mesas SET ${campos.join(", ")} WHERE codigo = ?`).run(...params);
  res.json({ ok: true });
});

app.delete("/api/admin/mesas/:codigo", adminMw, (req, res) => {
  const cod = req.params.codigo;
  if (cod === (process.env.MESA_PROTEGIDA || "J6T5N")) return erro(res, 403, "Mesa principal protegida.");
  db.transaction(() => {
    for (const t of ["log", "fichas", "membros", "reacoes", "sessoes", "mesas"]) db.prepare(`DELETE FROM ${t} WHERE codigo = ?`).run(cod);
  })();
  res.json({ ok: true });
});

app.post("/api/admin/fichas/:codigo", adminMw, (req, res) => {
  const f = req.body || {};
  if (!f.nome) return erro(res, 400, "Nome obrigatório.");
  const fuid = f.uid || `admin_${Math.random().toString(36).slice(2, 8)}`;
  const ficha = R.normalizarFicha({ nome: f.nome, raca: f.raca, classe: f.classe, pv: f.pv, nivel: f.nivel, xp: f.xp }, fuid);
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(req.params.codigo, fuid, JSON.stringify(ficha));
  res.json({ ok: true, uid: fuid });
});

app.put("/api/admin/fichas/:codigo/:uid", adminMw, (req, res) => {
  const cod = req.params.codigo, fuid = req.params.uid;
  const existente = db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(cod, fuid);
  const f = existente ? json(existente.dados) || {} : {};
  for (const k of ["nome", "raca", "classe"]) if (req.body[k] !== undefined) f[k] = req.body[k];
  for (const k of ["pv", "nivel", "xp"]) if (req.body[k] !== undefined) f[k] = Math.max(0, Number(req.body[k]) || 0);
  db.prepare("INSERT OR REPLACE INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)").run(cod, fuid, JSON.stringify(R.normalizarFicha(f, fuid)));
  res.json({ ok: true });
});

app.delete("/api/admin/fichas/:codigo/:uid", adminMw, (req, res) => {
  db.prepare("DELETE FROM fichas WHERE codigo = ? AND uid = ?").run(req.params.codigo, req.params.uid);
  res.json({ ok: true });
});

// ── API: Jogo ──

app.post("/api/comecar-aventura", authMw, limiteIA, async (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const ctx = carregar(codigo, req.uid);
  if (ctx.mesa.fase === "jogo") return erro(res, 409, "A aventura já começou.");
  if (!Object.keys(ctx.fichas).length) return erro(res, 400, "Crie pelo menos um personagem.");
  const msgTrava = travar(codigo, req.uid, ctx.mesa.membros[req.uid] || "alguém");
  if (msgTrava) return erro(res, 409, msgTrava);
  try {
    const fichas = Object.values(ctx.fichas);
    const tema = T.temaPorId(ctx.mesa.tema);
    // 1) o arco da história (começo, meio e fim), privado
    const arco = await gerarArco(ctx.mesa, fichas);
    salvarMesa(codigo, { processando: { por: req.uid, nome: ctx.mesa.membros[req.uid] || "alguém", desde: agora() } }); // renova a trava
    // 2) a abertura, narrada a partir do ato 1
    const a1 = arco.atos[0];
    const mesaAbertura = { ...ctx.mesa, resumo: "", combate: null, cena: "", arco, ato: 1, arcoConcluido: 0, arcoAjustes: [], _narracoesNoAto: 0 };
    const prompt = `${M.contexto(mesaAbertura, fichas, [])}\n\nEVENTO: Abertura da sessão. Comece a história pelo ato 1, "${a1.nome}" (objetivo: ${a1.objetivo})${a1.cenas?.[0] ? `, a partir desta cena sugerida: ${a1.cenas[0]}` : ""}.\nFaça uma abertura curta e marcante: situe o lugar com os sentidos, apresente cada personagem do grupo pelo nome, já do jeito do tema, e termine com o gancho da história acontecendo diante deles. Não pergunte o que fazem — apenas narre a cena. Dê um nome curto à cena em "cena".\nNão peça testes nem inicie combate. Deixe "ato", "ajuste_arco" e "fim" vazios.`;
    const r = await M.perguntar(OPENROUTER_KEY, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.8);
    const cena = texto(r?.cena, 60) || tema.nome;
    salvarMesa(codigo, { fase: "jogo", inicio: agora(), cena, fundo: "", resumo: texto(r?.resumo, 900), combate: null, rolagem: null,
      arco, arcoAjustes: [], ato: 1, arcoConcluido: 0 });
    registrar(codigo, { tipo: "sys", texto: "A sessão começou." });
    const [idAto] = registrar(codigo, { tipo: "sys", texto: `Ato 1 — ${a1.nome}` });
    salvarMesa(codigo, { atoInicio: idAto });
    if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
    gerarFundo(codigo, tema, cena);
    res.json({ ok: true });
  } catch (e) { erro(res, 502, msgErro(e)); }
  finally { destravar(codigo); }
});

app.post("/api/agir", authMw, limiteIA, async (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const acao = texto(req.body?.texto, 500);
  if (!acao) return erro(res, 400, "Diga o que faz.");
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const ctx = carregar(codigo, req.uid);
  const f = ctx.fichas[req.uid];
  if (!f) return erro(res, 400, "Crie seu personagem.");
  if (ctx.mesa.fase !== "jogo") return erro(res, 400, "A aventura ainda não começou.");
  if (ctx.mesa.rolagem) return erro(res, 400, "Há uma rolagem pendente.");
  const combate = ctx.mesa.combate;
  const vez = R.vezAtual(combate);
  if (vez) {
    if (combate.pausado) return erro(res, 400, "Combate pausado. Retome para agir.");
    const atu = ctx.fichas[vez.id];
    const expirou = combate.inicioVez && agora() - combate.inicioVez > 600_000;
    // Vez travada (inimigo, jogador caído/que saiu, ou 10 min sem jogar): resolve e devolve o controle
    if (vez.tipo !== "pj" || !atu || atu.pv <= 0 || (expirou && vez.id !== req.uid)) {
      registrar(codigo, { tipo: "sys", texto: vez.tipo === "pj" ? `${vez.nome} não pode agir agora — o combate segue.` : "O combate segue." });
      await avancarCombate(ctx, vez.tipo === "pj" ? vez.id : null);
      return erro(res, 409, "A vez mudou. Confira de quem é a vez e tente de novo.");
    }
    if (vez.id !== req.uid) return erro(res, 400, `Vez de ${vez.nome}.`);
  }
  if (f.pv <= 0) return erro(res, 400, `${f.nome} está caído.`);
  const msgTrava = travar(codigo, req.uid, ctx.mesa.membros[req.uid] || f.nome);
  if (msgTrava) return erro(res, 409, msgTrava);
  const [idAcao] = registrar(codigo, { tipo: "acao", autor: req.uid, nome: f.nome, texto: acao });
  try {
    const extra = combate ? `É o turno de ${f.nome} no combate. Se for um ataque, peça um teste do tipo "ataque" usando o nome exato de um ataque da ficha e o id do inimigo.${combate.mapa ? " O código confere o mapa: corpo a corpo só contra quem está ao lado (se der, o personagem avança sozinho até o alvo); à distância precisa de linha de visão. Narre a tentativa sem decidir se acerta." : ""}` : "";
    const r = await M.perguntar(OPENROUTER_KEY, `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nEVENTO: ${f.nome} (id ${req.uid}) declara a ação: "${acao.replace(/"/g, "'")}"\n${extra}`, ctx.mesa.qualidade || "rapido", 3000, 0.7);
    const { rolagem, combateNovo, ataqueCancelado } = await aplicar(ctx, r, true, req.uid);
    if (combateNovo) await avancarCombate(ctx, null);          // inimigos que ganharam a iniciativa agem já
    else if (!rolagem && combate && !ataqueCancelado) await avancarCombate(ctx, req.uid); // ataque fora de alcance: a vez continua, para se aproximar
    res.json({ rolagem });
  } catch (e) {
    // a IA falhou: tira a ação do diário para o jogador poder tentar de novo
    db.prepare("DELETE FROM log WHERE id = ?").run(idAcao);
    broadcast(codigo, "nova", {});
    erro(res, 502, msgErro(e));
  } finally { destravar(codigo); }
});

app.post("/api/rolar", authMw, limiteIA, async (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const valor = req.body?.valor === undefined || req.body?.valor === null ? null : Number(req.body.valor);
  if (valor !== null && !(Number.isInteger(valor) && valor >= 1 && valor <= 20)) return erro(res, 400, "O d20 vai de 1 a 20.");
  const ctx = carregar(codigo, req.uid);
  const rol = ctx.mesa.rolagem;
  if (!rol || rol.jogador !== req.uid) return erro(res, 400, "Não há rolagem pendente para você.");
  const f = ctx.fichas[req.uid];
  if (!f) return erro(res, 400, "Personagem não encontrado.");
  const msgTrava = travar(codigo, req.uid, ctx.mesa.membros[req.uid] || f.nome);
  if (msgTrava) return erro(res, 409, msgTrava);
  try {
    const natural = valor ?? R.d(20);
    const combate = ctx.mesa.combate;
    const r2 = R.resolverRolagem(rol, natural, combate, f.nome);
    registrar(codigo, {
      tipo: "roll", texto: `${f.nome} · ${rol.rotulo}: ${r2.natural}${R.sinal(rol.bonus)} = ${r2.total} vs ${rol.tipo === "ataque" ? "CA" : "CD"} ${rol.cd}${valor !== null ? " (dado real)" : ""}`,
      res: r2.dano !== undefined ? `acertou, ${r2.dano} de dano` : r2.sucesso ? "sucesso" : "falha",
      ok: r2.sucesso,
    });
    salvarMesa(codigo, combate ? { rolagem: null, combate } : { rolagem: null });
    ctx.mesa.combate = combate;
    const fim = combate && R.combateAcabou(combate, ctx.fichas);
    if (OPENROUTER_KEY) {
      try {
        const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nEVENTO: Resultado de um teste. Narre a consequência.\n${r2.descricao}${fim ? "\nTodos os inimigos foram derrotados: narre o fim do combate." : ""}\nNão peça outro teste agora (deixe "teste" nulo).`;
        const r = await M.perguntar(OPENROUTER_KEY, prompt, ctx.mesa.qualidade || "rapido", 3000, 0.5);
        await aplicar(ctx, { ...r, combate: null, efeitos: [] }, false, req.uid);
      } catch (e) {
        registrar(codigo, { tipo: "sys", texto: "O Mestre não conseguiu narrar este resultado, mas ele vale." });
      }
    }
    if (combate) await avancarCombate(ctx, req.uid);
    res.json({ natural: r2.natural, total: r2.total, sucesso: r2.sucesso, dano: r2.dano ?? null });
  } catch (e) { console.error("[rolar]", e); erro(res, 502, msgErro(e)); }
  finally { destravar(codigo); }
});

app.post("/api/ideias", authMw, limiteIA, async (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  if (!OPENROUTER_KEY) return erro(res, 503, "API key não configurada.");
  const ctx = carregar(codigo, req.uid);
  const f = ctx.fichas[req.uid];
  if (!f) return erro(res, 400, "Crie seu personagem.");
  try {
    const tema = T.temaPorId(ctx.mesa.tema);
    const arco = M.arcoEfetivo(ctx.mesa);
    const rumo = arco && !Number(ctx.mesa.arcoConcluido) ? ` Pelo menos uma delas deve aproximar o grupo do objetivo do ato atual ("${arco.atos[M.numAto(ctx.mesa.ato) - 1]?.objetivo || ""}"), sem revelar segredos.` : "";
    const prompt = `${M.contexto(ctx.mesa, Object.values(ctx.fichas), ctx.recentes)}\n\nO jogador de ${f.nome} pediu ajuda: sugira 3 ações úteis e diferentes para ${f.nome} agora, usando as habilidades e o jeito do personagem, no clima do tema ${tema.nome}.${rumo} Cada uma em primeira pessoa, até 15 palavras, pronta para ser dita.\nResponda SOMENTE com um array JSON de 3 strings.`;
    const r = await M.perguntar(OPENROUTER_KEY, prompt, "rapido", 2000);
    const lista = Array.isArray(r) ? r : Array.isArray(r?.ideias) ? r.ideias : [];
    res.json({ ideias: lista.slice(0, 3).map((s) => texto(s, 160)).filter(Boolean) });
  } catch (e) { erro(res, 502, msgErro(e)); }
});

// ── API: Mapa de batalha ──

/** Move a ficha de quem chama no mapa do combate (só na própria vez, até o deslocamento restante). */
app.post("/api/mover", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const x = req.body?.x, y = req.body?.y;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return erro(res, 400, "Casa inválida.");
  const ctx = carregar(codigo, req.uid);
  const c = ctx.mesa.combate;
  if (!c) return erro(res, 409, "Não há combate agora.");
  if (!c.mapa) return erro(res, 409, "Este combate não tem mapa.");
  if (c.pausado) return erro(res, 409, "O combate está pausado.");
  const vez = R.vezAtual(c);
  if (!vez || vez.id !== req.uid) return erro(res, 409, "Não é a sua vez.");
  if (ctx.mesa.rolagem) return erro(res, 409, "Há uma rolagem pendente: role o dado antes de se mover.");
  const p = ctx.mesa.processando;
  if (p && agora() - p.desde < TRAVA_MS) return erro(res, 409, "O Mestre está narrando. Espere um pouco.");
  const f = ctx.fichas[req.uid];
  if (!f) return erro(res, 409, "Crie seu personagem.");
  if (f.pv <= 0) return erro(res, 409, `${f.nome} está caído e não pode se mover.`);
  MP.completarPosicoes(c);
  const origem = c.posicoes[req.uid];
  if (!origem) return erro(res, 409, "Seu personagem não está no mapa.");
  const d = deslocamentoDe(c, f);
  const restante = Math.max(0, d.total - d.usado);
  const plano = MP.planejarMovimento(c.mapa, MP.ocupantes(c), req.uid, origem, { x, y }, restante);
  if (!plano.ok) {
    const msg = {
      fora: "Essa casa fica fora do mapa.",
      bloqueada: "Não dá para passar por ali.",
      "sem-caminho": "Não dá para passar por ali.",
      ocupada: "Essa casa está ocupada.",
      longe: `Longe demais: você ainda tem ${MP.casas(restante)} de deslocamento.`,
    }[plano.motivo] || "Não dá para ir até lá.";
    return erro(res, 409, msg);
  }
  if (plano.custo > 0) {
    c.posicoes[req.uid] = { x, y };
    d.usado += plano.custo;
    salvarMesa(codigo, { combate: c });
    broadcast(codigo, "atualizar", {});
  }
  res.json({ ok: true, posicao: { x, y }, restante: Math.max(0, d.total - d.usado) });
});

// ── API: Leitura (polling do app) ──

app.get("/api/mesa/:codigo", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  mesa.combate = json(mesa.combate);
  mesa.rolagem = json(mesa.rolagem);
  mesa.processando = json(mesa.processando);
  if (mesa.processando && agora() - mesa.processando.desde >= TRAVA_MS) mesa.processando = null;
  mesa.cdVisivel = mesa.cdVisivel !== 0;
  const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(codigo);
  const t = agora();
  mesa.membros = Object.fromEntries(membros.map((mb) => [mb.uid, mb.nome]));
  mesa.online = membros.filter((mb) => mb.ultimaAtividade && t - mb.ultimaAtividade < ONLINE_WINDOW_MS).map((mb) => mb.uid);
  limparDigitando(codigo);
  mesa.digitando = {};
  if (digitando.has(codigo)) for (const [u, v] of digitando.get(codigo)) mesa.digitando[u] = v.nome;
  mesa.agora = t; // relógio do servidor, para o app não depender do relógio do celular
  // Tema e arco PÚBLICO: os segredos, cenas, desfechos e ajustes do arco nunca saem do servidor
  const tema = T.temaPorId(mesa.tema);
  const arco = M.arcoPublico(mesa);
  for (const k of ["arco", "arcoAjustes", "ato", "arcoConcluido", "atoInicio"]) delete mesa[k];
  Object.assign(mesa, { tema: tema.id, temaNome: tema.nome, temaInspiracao: tema.inspiracao, temaIcone: tema.icone,
    duracao: T.duracaoValida(mesa.duracao), desejos: mesa.desejos || "", arco });
  res.json(mesa);
});

app.get("/api/mesa/:codigo/fichas", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const fichas = {};
  for (const r of db.prepare("SELECT * FROM fichas WHERE codigo = ?").all(codigo)) fichas[r.uid] = R.normalizarFicha(json(r.dados), r.uid);
  res.json(fichas);
});

app.get("/api/mesa/:codigo/log", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const log = db.prepare("SELECT id, t, tipo, texto, autor, nome, res, ok FROM log WHERE codigo = ? ORDER BY id DESC LIMIT 60").all(codigo).reverse();
  for (const e of log) e.ok = e.ok == null ? null : e.ok === 1;
  res.json(log);
});

// ── API: Online / Digitando / Reações / Pausa ──

app.post("/api/mesa/:codigo/typing", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const ativo = req.body?.digitando === true;
  const nome = texto(req.body?.nome, 30);
  limparDigitando(codigo);
  atualizarDigitando(codigo, req.uid, nome, ativo);
  broadcast(codigo, "typing", { uid: req.uid, nome, ativo });
  res.json({ ok: true });
});

app.post("/api/mesa/:codigo/reacao", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const logId = Number(req.body?.logId);
  const tipo = String(req.body?.tipo || "");
  if (!logId || !["gostei", "nao_gostei", "desisti"].includes(tipo)) return erro(res, 400, "Tipo inválido.");
  if (!db.prepare("SELECT 1 FROM log WHERE id = ? AND codigo = ?").get(logId, codigo)) return erro(res, 404, "Entrada não encontrada.");
  db.prepare("INSERT OR REPLACE INTO reacoes (codigo, logId, uid, tipo) VALUES (?, ?, ?, ?)").run(codigo, logId, req.uid, tipo);
  res.json({ ok: true });
});

app.post("/api/mesa/:codigo/combate/pausar", authMw, (req, res) => {
  const codigo = mesaDoMembro(req, res); if (!codigo) return;
  const combate = json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo)?.combate);
  if (!combate) return erro(res, 400, "Não há combate ativo.");
  if (combate.pausado) {
    const t = agora();
    combate.inicioVez = (combate.inicioVez || t) + (t - (combate.pausadoEm || t));
    delete combate.pausado;
    delete combate.pausadoEm;
    salvarMesa(codigo, { combate });
    registrar(codigo, { tipo: "sys", texto: "Combate retomado." });
  } else {
    combate.pausado = true;
    combate.pausadoEm = agora();
    salvarMesa(codigo, { combate });
    registrar(codigo, { tipo: "sys", texto: "Combate pausado." });
  }
  broadcast(codigo, "atualizar", {});
  res.json({ ok: true, pausado: !!combate.pausado });
});

// ── Helpers de jogo ──

/** Aplica a resposta do Mestre. Devolve { rolagem, combateNovo, ataqueCancelado }. */
async function aplicar(ctx, r, permitirTeste, uidAtor) {
  const codigo = ctx.codigo;
  const campos = {};
  if (r?.cena) campos.cena = texto(r.cena, 60);
  // Imagem de fundo só quando a cena muda (cada imagem custa créditos)
  if (r?.cena && (!ctx.mesa?.fundo || campos.cena !== ctx.mesa.cena)) gerarFundo(codigo, T.temaPorId(ctx.mesa.tema), campos.cena);
  if (r?.resumo) campos.resumo = texto(r.resumo, 900);
  if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
  aplicarArco(codigo, r);

  // XP: +5 para quem agiu, a cada ação narrada
  const ator = ctx.fichas[uidAtor];
  if (ator && r?.narracao && permitirTeste) ganharXp(ctx, ator, 5);

  let combate = ctx.mesa.combate;
  for (const ef of Array.isArray(r?.efeitos) ? r.efeitos.slice(0, 6) : []) {
    const alvoId = ef?.alvo;
    const f = ctx.fichas[alvoId] || Object.values(ctx.fichas).find((x) => R.chave(x.nome) === R.chave(alvoId));
    if (f) {
      if (ef.cura) { const v = R.rolar(String(ef.cura)).total; f.pv = Math.min(f.pvMax, f.pv + v); registrar(codigo, { tipo: "roll", texto: `${f.nome} recupera ${v} PV`, ok: true }); }
      if (ef.dano) { const v = R.rolar(String(ef.dano)).total; f.pv = Math.max(0, f.pv - v); registrar(codigo, { tipo: "roll", texto: `${f.nome} sofre ${v} de dano${f.pv <= 0 ? " e cai" : ""}`, ok: false }); }
      salvarFicha(codigo, f);
      continue;
    }
    const ini = combate?.inimigos?.find((i) => i.id === alvoId || R.chave(i.nome) === R.chave(alvoId));
    if (ini && ef.dano) {
      const v = R.rolar(String(ef.dano)).total;
      ini.pv = Math.max(0, ini.pv - v);
      registrar(codigo, { tipo: "roll", texto: `${ini.nome} sofre ${v} de dano`, ok: true });
      campos.combate = combate;
    }
  }

  let combateNovo = false;
  const inimigosIA = Array.isArray(r?.combate?.inimigos) ? r.combate.inimigos.filter((i) => i && typeof i === "object" && !Array.isArray(i)) : [];
  if (inimigosIA.length && !combate) {
    const jogadores = Object.values(ctx.fichas).filter((f) => f.pv > 0);
    if (jogadores.length) {
      const lista = inimigosIA.slice(0, 8).map((i) => ({ ...i, nome: texto(i.nome, 40) || "Inimigo" }));
      combate = R.iniciarCombate(jogadores, lista);
      combate.id = uid();                                   // a imagem do mapa só vale para este combate
      MP.prepararCombate(combate, r.combate, { cena: campos.cena || ctx.mesa.cena, inimigosIA: lista });
      zerarDeslocamento(combate, ctx.fichas);
      campos.combate = combate;
      combateNovo = true;
      registrar(codigo, { tipo: "sys", texto: "Combate! Iniciativa: " + combate.ordem.map((o) => `${o.nome} ${o.ini}`).join(" · ") });
    }
  } else if (inimigosIA.length && combate) {
    const novos = acrescentarReforcos(combate, inimigosIA);
    if (novos.length) {
      campos.combate = combate;
      registrar(codigo, { tipo: "sys", texto: `Reforços: ${novos.map((i) => i.nome).join(", ")} ${novos.length > 1 ? "entram" : "entra"} no combate.` });
    }
  }

  let rolagem = null, ataqueCancelado = false;
  const minha = ctx.fichas[uidAtor];
  // Um teste de ataque só faz sentido com o combate já em andamento e na vez de quem agiu
  if (permitirTeste && r?.teste && minha && !(combateNovo && r.teste.tipo === "ataque")) {
    rolagem = R.montarRolagem(minha, r.teste, combate, String(agora()));
    if (rolagem?.tipo === "ataque" && combate?.mapa) {
      const conf = conferirAtaqueNoMapa(combate, minha, r.teste, rolagem);
      if (conf.cancelar) { registrar(codigo, { tipo: "sys", texto: conf.cancelar }); rolagem = null; ataqueCancelado = true; }
      else if (conf.aviso) { registrar(codigo, { tipo: "sys", texto: conf.aviso }); campos.combate = combate; }
    }
    if (rolagem) campos.rolagem = rolagem;
  }
  if (Object.keys(campos).length) salvarMesa(codigo, campos);
  ctx.mesa.combate = combate;
  if (campos.cena) ctx.mesa.cena = campos.cena;
  if (combateNovo) gerarImagemMapa(codigo, T.temaPorId(ctx.mesa.tema), combate);
  return { rolagem, combateNovo, ataqueCancelado };
}

// ── Mapa de batalha (a lógica de grade fica em mapa.js) ──

/** Deslocamento do personagem neste turno ({total, usado}); cria se faltar. */
function deslocamentoDe(c, ficha) {
  c.deslocamento ||= {};
  if (!c.deslocamento[ficha.uid]) c.deslocamento[ficha.uid] = { total: MP.deslocamentoBase(ficha), usado: 0 };
  return c.deslocamento[ficha.uid];
}
/** Zera o deslocamento: só quem está na vez (se for um personagem) tem um, inteiro. */
function zerarDeslocamento(c, fichas) {
  if (!c.mapa) return;
  const v = R.vezAtual(c);
  c.deslocamento = {};
  if (v?.tipo === "pj" && fichas[v.id]) deslocamentoDe(c, fichas[v.id]);
}

/**
 * Inimigos que a IA mandou durante um combate: entram só os de nome novo (a IA costuma repetir os que já lutam),
 * com iniciativa própria, sem mexer na vez atual nem nas posições de quem já está no mapa. Devolve os novos.
 */
function acrescentarReforcos(c, lista) {
  const nomes = new Set((c.inimigos || []).map((i) => R.chave(i.nome)));
  let prox = Math.max(-1, ...(c.inimigos || []).map((i) => Number(String(i.id).replace(/^ini_/, "")) || 0)) + 1;
  const novos = [];
  for (const dados of lista) {
    if ((c.inimigos || []).length >= 12) break;
    const nome = texto(dados.nome, 40);
    if (!nome || nomes.has(R.chave(nome))) continue;
    nomes.add(R.chave(nome));
    const ini = R.criarInimigo(`ini_${prox++}`, { ...dados, nome });
    c.inimigos.push(ini);
    const ordem = c.ordem || (c.ordem = []);
    const atual = ordem.length ? (Number(c.vez) || 0) % ordem.length : 0;
    const item = { id: ini.id, tipo: "ini", nome: ini.nome, ini: R.d(20) + ini.des };
    let pos = ordem.findIndex((o) => o.ini < item.ini);
    if (pos < 0) pos = ordem.length;
    ordem.splice(pos, 0, item);
    c.vez = ordem.length > 1 && pos <= atual ? atual + 1 : atual;   // quem está na vez continua na vez
    novos.push({ ini, pedida: { x: dados.x, y: dados.y } });
  }
  if (c.mapa && novos.length) MP.posicionarNovos(c.mapa, c.posicoes || (c.posicoes = {}), novos.map((n) => ({ id: n.ini.id, lado: "ini", pedida: n.pedida })));
  return novos.map((n) => n.ini);
}

/**
 * Confere um ataque de jogador no mapa. Corpo a corpo longe do alvo: avança sozinho se der (gasta deslocamento),
 * senão cancela. À distância: até 12 casas e com linha de visão; alvo com cobertura dá CA +2 nesta rolagem.
 * Devolve { cancelar: texto } | { aviso: texto } | {}. Altera `c` e `rol`.
 */
function conferirAtaqueNoMapa(c, ficha, pedido, rol) {
  MP.completarPosicoes(c);
  const alvo = (c.inimigos || []).find((i) => i.id === rol.alvo);
  const pa = c.posicoes?.[ficha.uid], pb = alvo && c.posicoes?.[alvo.id];
  if (!alvo || !pa || !pb) return {};
  const ataque = R.acharAtaque(ficha, pedido.ataque);
  const dist = MP.distancia(pa, pb);
  if (MP.alcanceDoAtaque(ataque) === "corpo") {
    if (dist <= 1) return {};
    const d = deslocamentoDe(c, ficha);
    const ap = MP.aproximar(c.mapa, MP.ocupantes(c), ficha.uid, pa, pb, Math.max(0, d.total - d.usado));
    if (!ap) return { cancelar: `${alvo.nome} está a ${MP.casas(dist)}: longe demais para um ataque corpo a corpo. Aproxime-se no mapa.` };
    c.posicoes[ficha.uid] = { ...ap.destino };
    d.usado += ap.custo;
    return { aviso: `${ficha.nome} avança até ${alvo.nome}.` };
  }
  if (dist > MP.ALCANCE_DISTANCIA) return { cancelar: `${alvo.nome} está a ${MP.casas(dist)}: longe demais para ${ataque.nome} (alcance de ${MP.ALCANCE_DISTANCIA} casas).` };
  if (!MP.linhaDeVisao(c.mapa, pa, pb)) return { cancelar: `Sem linha de visão até ${alvo.nome}.` };
  if (MP.temCobertura(c.mapa, pa, pb)) { rol.cd += 2; rol.rotulo += " (cobertura +2)"; }
  return {};
}

/** Imagem do mapa visto de cima (em segundo plano, como o fundo da cena). Só grava se ainda for o mesmo combate. */
function gerarImagemMapa(codigo, tema, c) {
  if (!c?.mapa || !c.id || !OPENROUTER_KEY || process.env.IMAGENS_DE_MAPA === "0") return;
  const id = c.id;
  M.gerarImagem(OPENROUTER_KEY, M.promptImagemMapa(tema, c.mapa), SERVER_BASE_URL, 1, "mapa")
    .then((url) => {
      if (!url) return;
      const atual = json(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo)?.combate);
      if (!atual || atual.id !== id || !atual.mapa) return;     // o combate acabou ou é outro: a imagem não serve mais
      atual.mapa.imagem = url;
      salvarMesa(codigo, { combate: atual });
      broadcast(codigo, "atualizar", {});
    })
    .catch(() => {});
}

/** Imagem de fundo da cena, no estilo do tema (em segundo plano; cada imagem custa créditos). */
function gerarFundo(codigo, tema, cena) {
  if (!cena || !OPENROUTER_KEY || process.env.IMAGENS_DE_FUNDO === "0") return;
  M.gerarImagem(OPENROUTER_KEY, M.promptImagem(tema, cena), SERVER_BASE_URL)
    .then((url) => { if (url) { salvarMesa(codigo, { fundo: url }); broadcast(codigo, "atualizar", {}); } })
    .catch(() => {});
}

const QUALIDADE_ARCO = process.env.QUALIDADE_ARCO === "rapido" ? "rapido" : "caprichado";

/**
 * Gera o arco da história com a IA (temperatura alta + semente e tempero sorteados, para variar).
 * Duas tentativas; se ambas falharem (ou a primeira estourar o tempo), usa o arco de reserva:
 * "A Mina de Pedra-Funda" no tema clássico, um arco mínimo de improviso nos outros.
 */
async function gerarArco(mesa, fichas) {
  const tema = T.temaPorId(mesa.tema);
  const semente = T.sortearSemente(tema), tempero = T.sortearTempero();
  const prompt = M.promptArco({ tema, duracao: mesa.duracao, fichas, tom: mesa.tom, vetos: mesa.vetos, desejos: mesa.desejos, semente, tempero });
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const arco = M.normalizarArco(await M.perguntar(OPENROUTER_KEY, prompt, QUALIDADE_ARCO, 3000, 1.0));
      if (arco) return { ...arco, semente, tempero };
      console.log(`[arco] tentativa ${tentativa}: arco incompleto`);
    } catch (e) {
      console.log(`[arco] tentativa ${tentativa} falhou: ${e.message}`);
      if (/demorou demais/.test(e.message)) break; // não há tempo para outra tentativa antes de o app desistir
    }
  }
  const reserva = tema.id === "classico" ? M.arcoPedraFunda() : M.arcoMinimo(tema, semente);
  return { ...reserva, semente, tempero, reserva: true };
}

/**
 * Campos do arco na resposta do Mestre: "ato" (avança só +1), "ajuste_arco" (guarda os 6 últimos)
 * e "fim" (só no ato 3). Chamado em toda resposta narrada do Mestre durante o jogo.
 */
function aplicarArco(codigo, r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return;
  const m = db.prepare("SELECT fase, tema, arco, arcoAjustes, ato, arcoConcluido FROM mesas WHERE codigo = ?").get(codigo);
  if (!m || m.fase !== "jogo") return;
  const campos = {};
  let arco = json(m.arco);
  if (!arco) { arco = M.arcoEfetivo(m); campos.arco = arco; }   // mesa antiga, sem arco gravado: fixa o de reserva
  const ato = M.numAto(m.ato);
  const concluido = !!Number(m.arcoConcluido);
  const entradas = [];

  const ajuste = typeof r.ajuste_arco === "string" ? texto(r.ajuste_arco, 240) : "";
  if (ajuste) campos.arcoAjustes = [...(json(m.arcoAjustes) || []), ajuste].slice(-6);

  let novoAto = null;
  if (!concluido) {
    const pedido = Number(r.ato);
    if (Number.isFinite(pedido) && pedido > ato && ato < 3) {
      novoAto = ato + 1;                                          // nunca pula atos
      campos.ato = novoAto;
      entradas.push({ tipo: "sys", texto: `Ato ${novoAto} — ${arco.atos[novoAto - 1]?.nome || ["O Começo", "O Meio", "O Fim"][novoAto - 1]}` });
    } else if ((r.fim === true || r.fim === "true") && ato === 3) {
      campos.arcoConcluido = 1;
      entradas.push({ tipo: "sys", texto: `Fim da aventura: ${arco.titulo}` });
    }
  }
  if (Object.keys(campos).length) salvarMesa(codigo, campos);
  if (entradas.length) {
    const ids = registrar(codigo, ...entradas);
    if (novoAto) salvarMesa(codigo, { atoInicio: ids[0] });
  }
}

function ganharXp(ctx, f, quanto) {
  f.xp = (f.xp || 0) + quanto;
  while (f.xp >= (f.nivel || 1) * 100) {
    f.xp -= (f.nivel || 1) * 100;
    f.nivel = (f.nivel || 1) + 1;
    const nova = R.normalizarFicha(f, f.uid);  // recalcula PV máximo e proficiência do novo nível
    Object.assign(f, nova, { pv: Math.min(nova.pvMax, f.pv + (nova.pvMax - f.pvMax)) });
    registrar(ctx.codigo, { tipo: "sys", texto: `${f.nome} subiu para o nível ${f.nivel}!`, ok: true });
  }
  salvarFicha(ctx.codigo, f);
}

/** Passa a vez depois de `quemAgiu` (null = ninguém), resolve os turnos dos inimigos e narra. */
async function avancarCombate(ctx, quemAgiu) {
  const codigo = ctx.codigo;
  const m = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
  const combate = json(m.combate);
  if (!combate) return;
  // fichas atualizadas (o turno pode ter mudado a vida de alguém)
  for (const f of db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo)) ctx.fichas[f.uid] = R.normalizarFicha(json(f.dados), f.uid);

  if (!R.combateAcabou(combate, ctx.fichas)) {
    const antes = Object.fromEntries(Object.values(ctx.fichas).map((f) => [f.uid, f.pv]));
    const chaveVez = () => `${combate.rodada}:${(Number(combate.vez) || 0) % (combate.ordem?.length || 1)}`;
    const vezAntes = chaveVez();
    if (combate.mapa) MP.completarPosicoes(combate);
    const ocorrido = R.passarVez(combate, ctx.fichas, quemAgiu, combate.mapa ? { tatica: MP.criarTatica(combate) } : {});
    if (chaveVez() !== vezAntes || (combate.mapa && !combate.deslocamento)) zerarDeslocamento(combate, ctx.fichas); // a vez mudou: deslocamento novo
    for (const f of Object.values(ctx.fichas)) if (f.pv !== antes[f.uid]) salvarFicha(codigo, f);
    salvarMesa(codigo, { combate });
    ctx.mesa.combate = combate;
    // ok = bom para o grupo; movimentos (ok null) são neutros
    for (const o of ocorrido) registrar(codigo, { tipo: o.log.tipo || "roll", texto: o.log.texto, ok: o.log.ok == null ? null : !o.log.ok });
    if (ocorrido.length && OPENROUTER_KEY) {
      const prox = R.vezAtual(combate);
      try {
        const r = await M.perguntar(OPENROUTER_KEY, `${M.contexto({ ...m, combate }, Object.values(ctx.fichas), [])}\n\nTurno dos inimigos. Narre o que aconteceu, com base exatamente nestes resultados (movimentos no mapa e ataques) já resolvidos pelo código:\n${ocorrido.map((o) => o.linha).join("\n")}${prox && prox.tipo === "pj" ? `\nDepois disso é a vez de ${prox.nome}.` : ""}\nNão peça testes. Deixe "teste", "combate" e "efeitos" vazios.`, m.qualidade || "rapido", 3000, 0.4);
        if (r?.narracao) registrar(codigo, { tipo: "narr", texto: texto(r.narracao, 2000) });
        aplicarArco(codigo, r);
      } catch (e) {
        console.log(`[avancarCombate] narração falhou: ${e.message}`);
      }
    }
  }

  if (R.combateAcabou(combate, ctx.fichas)) {
    const vivos = Object.values(ctx.fichas).filter((f) => f.pv > 0);
    salvarMesa(codigo, { combate: null });
    ctx.mesa.combate = null;
    if (vivos.length) {
      registrar(codigo, { tipo: "sys", texto: "Combate encerrado. Vitória do grupo!" });
      for (const f of vivos) ganharXp(ctx, f, 25);
    } else {
      // ninguém fica preso numa mesa sem jogadores de pé
      for (const f of Object.values(ctx.fichas)) { f.pv = 1; salvarFicha(codigo, f); }
      registrar(codigo, { tipo: "sys", texto: "O grupo caiu. Vocês despertam mais tarde, feridos, com 1 PV cada." });
    }
    broadcast(codigo, "combate-fim", {});
  }
  broadcast(codigo, "atualizar", {});
}

// ── WebSocket: avisos em tempo real (o app consulta o estado ao receber qualquer aviso) ──
const server = http.createServer(app);
server.timeout = 120_000; // 2 min — Cloudflare tunnel proxyReadTimeout
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.vivo = true;
  ws.on("pong", () => { ws.vivo = true; });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      const codigo = codigoValido(msg.mesa);
      const userId = codigo && usuarioDoToken({ headers: { authorization: `Bearer ${String(msg.token || "")}` } });
      if (codigo && userId && ehMembro(codigo, userId)) { ws.mesa = codigo; ws.uid = userId; ws.send(JSON.stringify({ evento: "pronto", dados: {} })); }
      else ws.send(JSON.stringify({ evento: "recusado", dados: {} }));
    } catch {}
  });
});
// Mantém a conexão viva atrás do túnel (que derruba conexões ociosas)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.vivo) { ws.terminate(); continue; }
    ws.vivo = false;
    try { ws.ping(); } catch {}
  }
}, 25_000).unref();

// ── Start ──
if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🎲 Mesa Viva — Servidor rodando em http://0.0.0.0:${PORT}`);
    console.log(`   API key: ${OPENROUTER_KEY ? "✅ configurada" : "❌ OPENROUTER_API_KEY não encontrada"}`);
    console.log(`   Painel admin: ${ADMIN_PASS ? "✅ ativo" : "⛔ desativado (defina ADMIN_PASS)"}`);
    console.log(`   DB: ${DB_PATH}\n`);
    setInterval(() => { try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch (e) {} }, 600_000).unref();
  });
}

module.exports = { app, server, db };
