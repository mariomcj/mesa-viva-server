/**
 * Testes de fluxo da API, com o servidor de verdade (banco temporário) e o Mestre falso.
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-teste-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
delete process.env.ADMIN_PASS;
const { contagem } = require("./mestre-falso");
const { server, db } = require("../server");

let base;

after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, aparelho } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (aparelho) headers["X-User-Id"] = aparelho;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const post = (rota, corpo, o = {}) => api("POST", rota, { ...o, corpo });
const get = (rota, o = {}) => api("GET", rota, o);

async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id };
}
const fichaBase = (nome) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }] });

async function mesaPronta(jogadores) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, { token: j.token });
  return d.codigo;
}

let mario, lucia;
before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  mario = { ...(await conta("Mário", "mario@teste.br")), nome: "Mário" };
  lucia = { ...(await conta("Lúcia", "lucia@teste.br")), nome: "Lúcia" };
});

// ── Conta ──
test("senha é guardada com hash e o login funciona", async () => {
  const row = db.prepare("SELECT senha FROM usuarios WHERE email = ?").get("mario@teste.br");
  assert.match(row.senha, /^scrypt\$/);
  assert.equal((await post("/api/auth/login", { email: "MARIO@teste.br", senha: "senha123" })).st, 200);
  assert.equal((await post("/api/auth/login", { email: "mario@teste.br", senha: "errada" })).st, 401);
});

test("senha antiga em texto puro ainda entra e é convertida para hash", async () => {
  db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES ('antigo01', 'Ana', 'ana@teste.br', 'velha123', 0)").run();
  assert.equal((await post("/api/auth/login", { email: "ana@teste.br", senha: "velha123" })).st, 200);
  assert.match(db.prepare("SELECT senha FROM usuarios WHERE id = 'antigo01'").get().senha, /^scrypt\$/);
});

test("token vencido não entra", async () => {
  const { token } = (await post("/api/auth/login", { email: "mario@teste.br", senha: "senha123" })).d;
  db.prepare("UPDATE tokens SET expiraEm = 1 WHERE token = ?").run(token);
  assert.equal((await get("/api/user/mesas", { token })).st, 401);
});

// ── Segurança ──
test("o X-User-Id sozinho não identifica ninguém", async () => {
  const codigo = await mesaPronta([mario]);
  assert.equal((await get("/api/user/mesas", { aparelho: mario.id })).st, 401);
  assert.equal((await post("/api/configurar-mesa", { codigo, tom: "humor" }, { aparelho: mario.id })).st, 401);
  // com o token de outra pessoa + X-User-Id do Mário: age como a dona do token, não como o Mário
  const r = await post("/api/configurar-mesa", { codigo, tom: "humor" }, { token: lucia.token, aparelho: mario.id });
  assert.equal(r.st, 403);
});

test("quem não é da mesa não lê, não configura, não salva ficha, não começa, não age", async () => {
  const codigo = await mesaPronta([mario]);
  const o = { token: lucia.token };
  assert.equal((await get(`/api/mesa/${codigo}`, o)).st, 403);
  assert.equal((await get(`/api/mesa/${codigo}/log`, o)).st, 403);
  assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).st, 403);
  assert.equal((await get(`/api/mesa/${codigo}`)).st, 401);
  assert.equal((await post("/api/configurar-mesa", { codigo, tom: "humor" }, o)).st, 403);
  assert.equal((await post("/api/salvar-ficha", { codigo, ficha: fichaBase("Intrusa") }, o)).st, 403);
  assert.equal((await post("/api/comecar-aventura", { codigo }, o)).st, 403);
  assert.equal((await post("/api/agir", { codigo, texto: "oi" }, o)).st, 403);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM log WHERE codigo = ?").get(codigo).c, 0);
});

test("IA só para quem tem login", async () => {
  const antes = contagem.texto;
  assert.equal((await post("/api/criar-personagem", { conceito: "um bardo" }, { aparelho: "qualquer" })).st, 401);
  assert.equal(contagem.texto, antes);
});

test("painel admin fica desligado sem ADMIN_PASS", async () => {
  assert.equal((await post("/api/admin/login", { user: "admin", pass: "mesaviva2026" })).st, 503);
});

test("aparelho antigo: mesas e fichas criadas antes do login passam para a conta", async () => {
  const dev = "dev12345";
  db.prepare("INSERT INTO mesas (codigo, dono, criadaEm) VALUES ('VELHA', ?, 0)").run(dev);
  db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES ('VELHA', ?, 'Mário')").run(dev);
  db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES ('VELHA', ?, ?)").run(dev, JSON.stringify({ ...fichaBase("Thorin"), uid: dev, xp: 30 }));
  const { d } = await post("/api/auth/login", { email: "mario@teste.br", senha: "senha123" }, { aparelho: dev });
  const mesas = (await get("/api/user/mesas", { token: d.token })).d.mesas;
  assert.ok(mesas.some((m) => m.codigo === "VELHA" && m.papel === "dono"));
  const fichas = (await get("/api/mesa/VELHA/fichas", { token: d.token })).d;
  assert.equal(fichas[mario.id].nome, "Thorin");
  assert.equal(fichas[mario.id].xp, 30);
  // o mesmo id de aparelho não pode ser reaproveitado por outra conta
  await post("/api/auth/login", { email: "lucia@teste.br", senha: "senha123" }, { aparelho: dev });
  assert.equal(db.prepare("SELECT userId FROM aparelhos WHERE deviceUid = ?").get(dev).userId, mario.id);
});

// ── Fluxo do jogo ──
test("fluxo completo: começar, agir, teste, rolar, diário com sucesso/falha em true/false", async () => {
  const codigo = await mesaPronta([mario, lucia]);
  const o = { token: mario.token };
  assert.equal((await post("/api/comecar-aventura", { codigo }, o)).st, 200);
  assert.equal((await post("/api/comecar-aventura", { codigo }, { token: lucia.token })).st, 409); // já começou
  const mesa = (await get(`/api/mesa/${codigo}`, o)).d;
  assert.equal(mesa.fase, "jogo");
  assert.equal(typeof mesa.cdVisivel, "boolean");
  assert.equal(typeof mesa.agora, "number");

  const r = await post("/api/agir", { codigo, texto: "Escalo o muro 🧗 com cuidado" }, o);
  assert.equal(r.st, 200);
  assert.equal(r.d.rolagem.rotulo, "Atletismo");
  assert.equal((await post("/api/agir", { codigo, texto: "eu também" }, { token: lucia.token })).d.error, "Há uma rolagem pendente.");
  const rol = await post("/api/rolar", { codigo, valor: 15 }, o);
  assert.equal(rol.d.sucesso, true);
  const log = (await get(`/api/mesa/${codigo}/log`, o)).d;
  assert.ok(log.some((e) => e.tipo === "acao" && e.texto === "Escalo o muro 🧗 com cuidado"));
  const roll = log.find((e) => e.tipo === "roll");
  assert.equal(roll.ok, true);
  assert.match(roll.texto, /15\+5 = 20/);

  await post("/api/configurar-mesa", { codigo, cdVisivel: false }, o);
  assert.equal((await get(`/api/mesa/${codigo}`, o)).d.cdVisivel, false);
});

test("resposta da IA com texto antes do JSON é aceita; falha da IA não deixa ação órfã", async () => {
  const codigo = await mesaPronta([mario]);
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  assert.equal((await post("/api/agir", { codigo, texto: "prefacio: olho ao redor" }, o)).st, 200);
  const r = await post("/api/agir", { codigo, texto: "isso vai falhar" }, o);
  assert.equal(r.st, 502);
  const log = (await get(`/api/mesa/${codigo}/log`, o)).d;
  assert.ok(!log.some((e) => e.texto === "isso vai falhar"));
  assert.equal((await get(`/api/mesa/${codigo}`, o)).d.processando, null);
});

test("XP acumula entre ações", async () => {
  const codigo = await mesaPronta([mario]);
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  await post("/api/agir", { codigo, texto: "Converso com Odila" }, o);
  await post("/api/agir", { codigo, texto: "Converso com o taverneiro" }, o);
  assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).d[mario.id].xp, 10);
});

test("reação a uma narração é salva", async () => {
  const codigo = await mesaPronta([mario]);
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  const narr = (await get(`/api/mesa/${codigo}/log`, o)).d.find((e) => e.tipo === "narr");
  assert.equal((await post(`/api/mesa/${codigo}/reacao`, { logId: narr.id, tipo: "gostei" }, o)).st, 200);
});

// ── Combate ──
async function vezDe(codigo, o) {
  const m = (await get(`/api/mesa/${codigo}`, o)).d;
  return m.combate ? m.combate.ordem[m.combate.vez % m.combate.ordem.length] : null;
}

test("combate solo: a vez sempre volta ao jogador e o combate termina", async () => {
  for (let k = 0; k < 6; k++) {
    const codigo = await mesaPronta([mario]);
    const o = { token: mario.token };
    await post("/api/comecar-aventura", { codigo }, o);
    await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, o);
    for (let turno = 0; turno < 40; turno++) {
      const vez = await vezDe(codigo, o);
      if (!vez) break;
      assert.equal(vez.tipo, "pj", "a vez parou num inimigo");
      const logAntes = (await get(`/api/mesa/${codigo}/log`, o)).d.length;
      const r = await post("/api/agir", { codigo, texto: "Golpeio o goblin" }, o); // nome do ataque em MAIÚSCULAS
      assert.equal(r.st, 200, JSON.stringify(r.d));
      assert.ok(r.d.rolagem, "o ataque foi perdido");
      await post("/api/rolar", { codigo }, o);
      const novos = (await get(`/api/mesa/${codigo}/log`, o)).d.slice(logAntes);
      assert.ok(novos.filter((e) => / ataca /.test(e.texto)).length <= 2, "goblins atacaram mais de uma vez cada");
    }
    assert.equal(await vezDe(codigo, o), null, "o combate não terminou");
  }
});

test("personagem a 0 PV fica caído e não age; o −1 da ficha não mexe na vida durante o combate", async () => {
  const codigo = await mesaPronta([mario, lucia]);
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  const f = JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, lucia.id).dados);
  f.pv = 0;
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, lucia.id);
  assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).d[lucia.id].pv, 0);
  assert.match((await post("/api/agir", { codigo, texto: "Levanto" }, { token: lucia.token })).d.error, /caído/);
  await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, o);
  const ficha = (await get(`/api/mesa/${codigo}/fichas`, o)).d[mario.id];
  await post("/api/salvar-ficha", { codigo, ficha: { ...ficha, pv: ficha.pv + 1 } }, o);
  assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).d[mario.id].pv, ficha.pv);
});

test("dois jogadores: fora da vez é recusado", async () => {
  const codigo = await mesaPronta([mario, lucia]);
  await post("/api/comecar-aventura", { codigo }, { token: mario.token });
  await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, { token: mario.token });
  const vez = await vezDe(codigo, { token: mario.token });
  assert.equal(vez.tipo, "pj");
  const outro = vez.id === mario.id ? lucia : mario;
  assert.match((await post("/api/agir", { codigo, texto: "Ataco" }, { token: outro.token })).d.error, /^Vez de /);
});
