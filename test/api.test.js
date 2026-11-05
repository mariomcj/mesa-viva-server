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
const { contagem, registro } = require("./mestre-falso");
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
  // Os dados são de verdade: se os goblins da iniciativa derrubarem o Mário (a Lúcia já está caída), o grupo
  // inteiro cai e o combate acaba antes da conferência. Nesse caso, tenta de novo numa mesa nova.
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const codigo = await mesaPronta([mario, lucia]);
    const o = { token: mario.token };
    await post("/api/comecar-aventura", { codigo }, o);
    const f = JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, lucia.id).dados);
    f.pv = 0;
    db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, lucia.id);
    assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).d[lucia.id].pv, 0);
    assert.match((await post("/api/agir", { codigo, texto: "Levanto" }, { token: lucia.token })).d.error, /caído/);
    await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, o);
    if (!(await get(`/api/mesa/${codigo}`, o)).d.combate) continue;
    const ficha = (await get(`/api/mesa/${codigo}/fichas`, o)).d[mario.id];
    await post("/api/salvar-ficha", { codigo, ficha: { ...ficha, pv: ficha.pv + 1 } }, o);
    assert.equal((await get(`/api/mesa/${codigo}/fichas`, o)).d[mario.id].pv, ficha.pv);
    return;
  }
  assert.fail("o combate nunca continuou depois da iniciativa");
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

// ── Temas e arco da história ──
const T = require("../temas");
const IDS_TEMAS = T.TEMAS.map((t) => t.id);
const estado = async (codigo, o = { token: mario.token }) => (await get(`/api/mesa/${codigo}`, o)).d;
async function mesaComTema(corpo, jogadores = [mario]) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome, ...corpo }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, { token: j.token });
  return d.codigo;
}
const sysDoLog = async (codigo) => (await get(`/api/mesa/${codigo}/log`, { token: mario.token })).d.filter((e) => e.tipo === "sys").map((e) => e.texto);

test("GET /api/temas: com login, surpresa primeiro, só campos públicos e as durações", async () => {
  assert.equal((await get("/api/temas")).st, 401);
  const r = await get("/api/temas", { token: mario.token });
  assert.equal(r.st, 200);
  assert.equal(r.d.temas.length, 21);
  assert.equal(r.d.temas[0].id, "surpresa");
  assert.equal(r.d.temas[0].icone, "dado");
  assert.deepEqual(r.d.temas[2], { id: "escola-magia", nome: "Escola de Magia", inspiracao: "Inspirado em Harry Potter", resumo: "Um castelo-escola, casas rivais e um segredo proibido.", icone: "varinha" });
  assert.ok(!JSON.stringify(r.d).includes("ambientacao") && !JSON.stringify(r.d).includes("sementes"));
  assert.deepEqual(r.d.duracoes.map((x) => x.id), ["curta", "campanha"]);
});

test("criar mesa com tema e duração; inválidos viram clássico e curta", async () => {
  const codigo = await mesaComTema({ tema: "escola-magia", duracao: "campanha" });
  const m = await estado(codigo);
  assert.equal(m.tema, "escola-magia");
  assert.equal(m.temaNome, "Escola de Magia");
  assert.equal(m.temaInspiracao, "Inspirado em Harry Potter");
  assert.equal(m.temaIcone, "varinha");
  assert.equal(m.duracao, "campanha");
  assert.equal(m.desejos, "");
  assert.equal(m.arco, null);
  assert.equal(m.cena, "");
  const lista = (await get("/api/user/mesas", { token: mario.token })).d.mesas.find((x) => x.codigo === codigo);
  assert.deepEqual({ tema: lista.tema, temaNome: lista.temaNome, temaIcone: lista.temaIcone, titulo: lista.titulo },
    { tema: "escola-magia", temaNome: "Escola de Magia", temaIcone: "varinha", titulo: "" });

  const outra = await estado(await mesaComTema({ tema: "star-wars", duracao: "eterna" }));
  assert.equal(outra.tema, "classico");
  assert.equal(outra.duracao, "curta");
  assert.equal((await estado(await mesaComTema({}))).tema, "classico");
});

test("tema surpresa: o servidor sorteia e grava um tema de verdade", async () => {
  for (let i = 0; i < 5; i++) {
    const m = await estado(await mesaComTema({ tema: "surpresa" }));
    assert.ok(IDS_TEMAS.includes(m.tema), m.tema);
    assert.notEqual(m.temaNome, "Surpresa");
  }
});

test("configurar: tema e duração só no saguão (409 depois); rumo da história em qualquer fase", async () => {
  const codigo = await mesaComTema({ tema: "piratas" });
  const o = { token: mario.token };
  assert.equal((await post("/api/configurar-mesa", { codigo, tema: "olimpo", duracao: "campanha" }, o)).st, 200);
  let m = await estado(codigo);
  assert.equal(m.tema, "olimpo");
  assert.equal(m.duracao, "campanha");
  await post("/api/configurar-mesa", { codigo, tema: "surpresa" }, o);
  assert.ok(IDS_TEMAS.includes((await estado(codigo)).tema));
  await post("/api/configurar-mesa", { codigo, tema: "samurais", desejos: "um duelo na ponte" }, o);
  assert.equal((await post("/api/comecar-aventura", { codigo }, o)).st, 200);

  const r = await post("/api/configurar-mesa", { codigo, tema: "cyberpunk" }, o);
  assert.equal(r.st, 409);
  assert.equal(r.d.error, "A aventura já começou: o tema não muda mais.");
  assert.equal((await post("/api/configurar-mesa", { codigo, duracao: "curta", vetos: "aranhas" }, o)).st, 409);
  m = await estado(codigo);
  assert.equal(m.tema, "samurais");
  assert.equal(m.duracao, "campanha");
  assert.equal(m.vetos, "", "pedido recusado não grava nada");
  // reenviar o mesmo tema e duração não é troca
  assert.equal((await post("/api/configurar-mesa", { codigo, tema: "samurais", duracao: "campanha", desejos: "x".repeat(400) }, o)).st, 200);
  assert.equal((await estado(codigo)).desejos.length, 300);
  await post("/api/configurar-mesa", { codigo, desejos: "mais mistério e um vilão que volta" }, o);
  assert.equal((await estado(codigo)).desejos, "mais mistério e um vilão que volta");
  await post("/api/agir", { codigo, texto: "Olho em volta" }, o);
  assert.match(registro.ultimoPrompt, /Rumo da história desejado pelo grupo: mais mistério e um vilão que volta/);
  assert.match(registro.ultimoPrompt, /TEMA DA AVENTURA: Era dos Samurais/);
  assert.equal((await post("/api/ideias", { codigo }, o)).d.ideias.length, 3);
  assert.match(registro.ultimoPrompt, /sugira 3 ações[^\n]*no clima do tema Era dos Samurais/);
  assert.match(registro.ultimoPrompt, /objetivo do ato atual/);
});

test("começar: gera o arco com tema, semente e desejos; o estado só mostra o arco público", async () => {
  const codigo = await mesaComTema({ tema: "lendas-brasil" }, [mario, lucia]);
  const o = { token: mario.token };
  await post("/api/configurar-mesa", { codigo, desejos: "o Saci como aliado" }, o);
  const antes = contagem.arco;
  assert.equal((await post("/api/comecar-aventura", { codigo }, o)).st, 200);
  assert.equal(contagem.arco, antes + 1);
  const m = await estado(codigo, { token: lucia.token });
  assert.deepEqual(m.arco, { titulo: "O Sino Roubado (Lendas do Brasil)", ato: 1, totalAtos: 3, nomeAto: "A Chegada", objetivo: "Descobrir quem roubou o sino.", concluido: false });
  assert.equal(m.cena, "Praça do Sino");
  const bruto = JSON.stringify(m) + JSON.stringify((await get("/api/user/mesas", o)).d);
  for (const segredo of ["SEGREDO", "CENA-", "DESFECHO", "semente", "Semente", "premissa", "arcoAjustes", "atoInicio", "arcoConcluido"]) assert.ok(!bruto.includes(segredo), `vazou ${segredo}`);
  assert.equal((await get("/api/user/mesas", o)).d.mesas.find((x) => x.codigo === codigo).titulo, "O Sino Roubado (Lendas do Brasil)");
  assert.deepEqual(await sysDoLog(codigo), ["A sessão começou.", "Ato 1 — A Chegada"]);
  // a semente veio da lista do tema e foi guardada no arco privado
  const arco = JSON.parse(db.prepare("SELECT arco FROM mesas WHERE codigo = ?").get(codigo).arco);
  assert.ok(T.temaPorId("lendas-brasil").sementes.includes(arco.semente));
  assert.equal(arco.atos[1].segredo, "SEGREDO-2");
  // a abertura não avança ato nem encerra a história, e não há taverna fixa
  const log = (await get(`/api/mesa/${codigo}/log`, o)).d;
  assert.ok(!log.some((e) => /Javali Cego/.test(e.texto)));
});

test("avanço de ato: só +1 por vez e nunca além do 3", async () => {
  const codigo = await mesaComTema({ tema: "faroeste" });
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  await post("/api/agir", { codigo, texto: "Eu salto para o fim" }, o);              // pede ato 3 estando no 1
  let m = await estado(codigo);
  assert.equal(m.arco.ato, 2);
  assert.equal(m.arco.nomeAto, "O Cerco");
  assert.equal(m.arco.objetivo, "Encontrar o esconderijo do ladrão.");
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);
  assert.equal((await estado(codigo)).arco.ato, 3);
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);              // pede ato 4
  m = await estado(codigo);
  assert.equal(m.arco.ato, 3);
  assert.equal(m.arco.concluido, false);
  assert.deepEqual((await sysDoLog(codigo)).filter((x) => x.startsWith("Ato")), ["Ato 1 — A Chegada", "Ato 2 — O Cerco", "Ato 3 — O Último Toque"]);
  assert.match(registro.ultimoPrompt, /ATO 3 — "O Último Toque" \[ATO ATUAL\]/);
});

test("ato também avança no resultado de uma rolagem; ajustes do arco ficam (os 6 últimos) e entram no contexto", async () => {
  const codigo = await mesaComTema({ tema: "tavola-redonda" });
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  const r = await post("/api/agir", { codigo, texto: "Escalo a torre do sino" }, o);
  assert.ok(r.d.rolagem);
  await post("/api/rolar", { codigo, valor: 10 }, o);
  assert.equal((await estado(codigo)).arco.ato, 2);
  for (let i = 0; i < 7; i++) await post("/api/agir", { codigo, texto: "Eu mudo o rumo da conversa" }, o);
  const ajustes = JSON.parse(db.prepare("SELECT arcoAjustes FROM mesas WHERE codigo = ?").get(codigo).arcoAjustes);
  assert.equal(ajustes.length, 6);
  assert.ok(!ajustes.includes("O grupo viu o esconderijo do alto da torre."), "o mais antigo saiu");
  await post("/api/agir", { codigo, texto: "Olho em volta" }, o);
  assert.ok(registro.ultimoPrompt.includes(ajustes[5]));
  assert.ok(!JSON.stringify(await estado(codigo)).includes("favor ao grupo"), "ajustes não vão para o app");
});

test("fim: só vale no ato 3, marca concluído, permite epílogo; reiniciar apaga o arco e mantém o tema", async () => {
  const codigo = await mesaComTema({ tema: "olimpo", duracao: "campanha" });
  const o = { token: mario.token };
  await post("/api/comecar-aventura", { codigo }, o);
  await post("/api/agir", { codigo, texto: "Eu encerro a história" }, o);             // no ato 1: ignorado
  assert.equal((await estado(codigo)).arco.concluido, false);
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);
  await post("/api/agir", { codigo, texto: "Eu encerro a história" }, o);
  const m = await estado(codigo);
  assert.equal(m.arco.ato, 3);
  assert.equal(m.arco.concluido, true);
  assert.ok((await sysDoLog(codigo)).includes("Fim da aventura: O Sino Roubado (Heróis do Olimpo)"));
  // epílogo: o jogo continua, sem novos atos nem outro "fim"
  assert.equal((await post("/api/agir", { codigo, texto: "Eu encerro a história" }, o)).st, 200);
  assert.equal((await sysDoLog(codigo)).filter((x) => x.startsWith("Fim da aventura")).length, 1);
  assert.match(registro.ultimoPrompt, /epílogo/);

  assert.equal((await post("/api/reiniciar-mesa", { codigo }, o)).st, 200);
  const z = await estado(codigo);
  assert.equal(z.fase, "lobby");
  assert.equal(z.arco, null);
  assert.equal(z.tema, "olimpo");
  assert.equal(z.duracao, "campanha");
  assert.equal(z.cena, "");
  // e começa de novo, com arco novo no ato 1
  await post("/api/comecar-aventura", { codigo }, o);
  assert.deepEqual([(await estado(codigo)).arco.ato, (await estado(codigo)).arco.concluido], [1, false]);
});

test("se o arco falha duas vezes: Pedra-Funda no clássico, arco mínimo nos outros; a aventura começa", async () => {
  const o = { token: mario.token };
  const classica = await mesaComTema({ tema: "classico" });
  await post("/api/configurar-mesa", { codigo: classica, desejos: "arco-falha" }, o);
  let antes = contagem.arco;
  assert.equal((await post("/api/comecar-aventura", { codigo: classica }, o)).st, 200);
  assert.equal(contagem.arco, antes + 2);
  let m = await estado(classica);
  assert.equal(m.fase, "jogo");
  assert.deepEqual([m.arco.titulo, m.arco.nomeAto], ["A Mina de Pedra-Funda", "O Contrato"]);

  const pirata = await mesaComTema({ tema: "piratas" });
  await post("/api/configurar-mesa", { codigo: pirata, desejos: "arco-falha" }, o);
  assert.equal((await post("/api/comecar-aventura", { codigo: pirata }, o)).st, 200);
  m = await estado(pirata);
  assert.deepEqual([m.arco.titulo, m.arco.nomeAto, m.arco.ato], ["Mares de Piratas", "O Começo", 1]);

  const torta = await mesaComTema({ tema: "cyberpunk" });                           // a IA responde, mas sem os 3 atos
  await post("/api/configurar-mesa", { codigo: torta, desejos: "arco-torto" }, o);
  antes = contagem.arco;
  await post("/api/comecar-aventura", { codigo: torta }, o);
  assert.equal(contagem.arco, antes + 2);
  assert.equal((await estado(torta)).arco.titulo, "Neon e Cromo");
});

test("mesas antigas (sem tema): clássico, curta, Pedra-Funda como arco, e o ato avança", async () => {
  db.prepare("INSERT INTO mesas (codigo, dono, fase, tema, duracao, arco, ato, cena, criadaEm) VALUES ('ANTIG', ?, 'jogo', NULL, NULL, NULL, NULL, 'Taverna Javali Cego', 1)").run(mario.id);
  db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES ('ANTIG', ?, 'Mário')").run(mario.id);
  db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES ('ANTIG', ?, ?)").run(mario.id, JSON.stringify({ ...fichaBase("Thorin"), uid: mario.id }));
  db.prepare("INSERT INTO mesas (codigo, dono, tema, duracao, criadaEm) VALUES ('ANTI2', ?, NULL, NULL, 1)").run(mario.id);
  db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES ('ANTI2', ?, 'Mário')").run(mario.id);
  const m = await estado("ANTIG");
  assert.deepEqual([m.tema, m.temaNome, m.temaIcone, m.duracao, m.desejos], ["classico", "Fantasia Clássica", "espada", "curta", ""]);
  assert.deepEqual(m.arco, { titulo: "A Mina de Pedra-Funda", ato: 1, totalAtos: 3, nomeAto: "O Contrato", objetivo: "Aceitar o trabalho de Odila e chegar à mina de Pedra-Funda.", concluido: false });
  assert.equal((await estado("ANTI2")).arco, null);                                   // antiga, ainda no saguão
  const lista = (await get("/api/user/mesas", { token: mario.token })).d.mesas;
  assert.equal(lista.find((x) => x.codigo === "ANTIG").titulo, "A Mina de Pedra-Funda");
  assert.equal(lista.find((x) => x.codigo === "ANTI2").temaNome, "Fantasia Clássica");
  assert.equal((await post("/api/agir", { codigo: "ANTIG", texto: "Eu cumpro o objetivo" }, { token: mario.token })).st, 200);
  assert.equal((await estado("ANTIG")).arco.nomeAto, "As Galerias");
  assert.equal(JSON.parse(db.prepare("SELECT arco FROM mesas WHERE codigo = 'ANTIG'").get().arco).titulo, "A Mina de Pedra-Funda");
});

test("criar personagem usa o tema da mesa", async () => {
  const codigo = await mesaComTema({ tema: "escola-magia" });
  assert.equal((await post("/api/criar-personagem", { codigo, conceito: "uma aluna curiosa" }, { token: mario.token })).st, 200);
  assert.match(registro.ultimoPrompt, /TEMA DA MESA: Escola de Magia/);
  await post("/api/criar-personagem", { tema: "samurais", conceito: "um ronin" }, { token: mario.token });
  assert.match(registro.ultimoPrompt, /TEMA DA MESA: Era dos Samurais/);
  await post("/api/criar-personagem", { codigo, conceito: "um intruso" }, { token: lucia.token });   // não é membro: tema da mesa não vale
  assert.match(registro.ultimoPrompt, /TEMA DA MESA: Fantasia Clássica/);
});
