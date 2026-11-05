/**
 * Testes das rotas com o mapa de batalha (servidor de verdade, banco temporário, Mestre falso).
 * Os combates que precisam de posições exatas são gravados direto no banco; o dano dos inimigos é fixo ("1"),
 * para nenhum resultado depender dos dados.
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-mapa-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
delete process.env.IMAGENS_DE_MAPA;
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
delete process.env.ADMIN_PASS;
const { contagem, registro } = require("./mestre-falso");
const { server, db } = require("../server");
const MP = require("../mapa");

let base;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const post = (rota, corpo, o = {}) => api("POST", rota, { ...o, corpo });
const get = (rota, o = {}) => api("GET", rota, o);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id, nome };
}
const fichaBase = (nome, extra = {}) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }], ...extra });

/** Mesa já em jogo (aventura começada). `fichas`: {nome: extra da ficha}. */
async function mesaEmJogo(jogadores, fichas = {}) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome, fichas[j.nome]) }, { token: j.token });
  assert.equal((await post("/api/comecar-aventura", { codigo: d.codigo }, { token: dono.token })).st, 200);
  return d.codigo;
}

const gob = (i, extra = {}) => ({ id: `ini_${i}`, nome: `Goblin ${i + 1}`, pv: 7, pvMax: 7, ca: 13, ataque: 4, dano: "1", des: 2, alcance: "corpo", ...extra });
const peca = (tipo, x, y, l = 1, a = 1, nome = tipo) => ({ tipo, x, y, l, a, nome });
/** Combate pronto, na vez do primeiro da ordem. `pjs`: [conta]; `posicoes`: {id: [x, y]}. */
function combateFixo({ pjs, inimigos, posicoes, terreno = [], linhas = 14, semMapa = false }) {
  const c = {
    rodada: 1, vez: 0, inicioVez: Date.now(),
    ordem: [...pjs.map((j) => ({ id: j.id, tipo: "pj", nome: j.nome, ini: 20 })), ...inimigos.map((i) => ({ id: i.id, tipo: "ini", nome: i.nome, ini: 5 }))],
    inimigos,
  };
  if (semMapa) return c;
  return { ...c, id: "fixo", mapa: { colunas: 10, linhas, descricao: "Campo de teste", terreno, imagem: "" },
    posicoes: Object.fromEntries(Object.entries(posicoes).map(([id, [x, y]]) => [id, { x, y }])), deslocamento: {} };
}
const injetar = (codigo, c) => db.prepare("UPDATE mesas SET combate = ?, rolagem = NULL WHERE codigo = ?").run(JSON.stringify(c), codigo);
const lerCombate = (codigo) => JSON.parse(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate || "null");
const diario = async (codigo, j) => (await get(`/api/mesa/${codigo}/log`, { token: j.token })).d;
const mover = (codigo, j, x, y) => post("/api/mover", { codigo, x, y }, { token: j.token });
const vez = (c) => c.ordem[c.vez % c.ordem.length].id;

async function esperarImagem(codigo, n = 40) {
  for (let i = 0; i < n; i++) { const c = lerCombate(codigo); if (c?.mapa?.imagem) return c.mapa.imagem; await esperar(10); }
  return "";
}

let mario, lucia;
before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  mario = await conta("Mário", "mario@mapa.br");
  lucia = await conta("Lúcia", "lucia@mapa.br");
});

// ── Começo do combate ──

test("combate começa com o mapa da IA: terreno, posições, alcance, deslocamento, contexto e imagem do mapa", async () => {
  const codigo = await mesaEmJogo([mario, lucia]);
  const imagensAntes = contagem.imagem;
  assert.equal((await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, { token: mario.token })).st, 200);
  const m = (await get(`/api/mesa/${codigo}`, { token: lucia.token })).d;
  const c = m.combate;
  assert.deepEqual([c.mapa.colunas, c.mapa.linhas, c.mapa.descricao], [10, 14, "Trilha de pedra entre pilares caídos"]);
  assert.deepEqual(c.mapa.terreno.map((t) => t.nome), ["Pilar caído", "Caixotes", "Poça funda"]);
  assert.equal(typeof c.mapa.imagem, "string");
  // as casas pedidas pela IA valem (a ordem dos personagens no contexto pode variar)
  assert.deepEqual([c.posicoes[mario.id], c.posicoes[lucia.id]].map((p) => `${p.x},${p.y}`).sort(), ["4,12", "5,12"]);
  for (const i of c.inimigos) { assert.equal(i.alcance, "corpo"); assert.ok(c.posicoes[i.id], `${i.id} sem casa`); }
  const atual = vez(c);
  assert.deepEqual(c.deslocamento, { [atual]: { total: 5, usado: 0 } });                 // Anão: 5 casas
  // a imagem chega em segundo plano e fica no mapa
  assert.equal(contagem.imagem, imagensAntes + 1);
  assert.match(registro.imagens.at(-1), /^Top-down orthographic battle map seen directly from above, tabletop RPG style, Trilha de pedra/);
  assert.match(registro.imagens.at(-1), /solid obstacle "Pilar caído"/);
  assert.match(registro.imagens.at(-1), /no people, no creatures, no tokens, portrait orientation/);
  assert.match(await esperarImagem(codigo), /^https:\/\/imagens\.exemplo\/img\d+\.png$/);
  // o Mestre recebe a situação do mapa
  const quem = atual === mario.id ? mario : lucia;
  await post("/api/agir", { codigo, texto: "Olho em volta" }, { token: quem.token });
  assert.match(registro.ultimoPrompt, /Mapa 10×14 .*: Trilha de pedra entre pilares caídos\./);
  assert.match(registro.ultimoPrompt, /Terreno: Pilar caído \(A5–B6, obstáculo\); Caixotes \(I6, cobertura\); Poça funda \(A2–C2, água\)\./);
  assert.match(registro.ultimoPrompt, /Posições: (Mário|Lúcia) [A-J]\d+/);
  assert.match(registro.ultimoPrompt, /Goblin 1 \[id ini_0\]: PV \d+\/7, CA 13, corpo a corpo/);
});

test("IMAGENS_DE_MAPA=0 desliga a imagem do mapa", async () => {
  process.env.IMAGENS_DE_MAPA = "0";
  try {
    const codigo = await mesaEmJogo([mario]);
    const antes = contagem.imagem;
    await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, { token: mario.token });
    assert.ok(lerCombate(codigo).mapa);
    await esperar(30);
    assert.equal(contagem.imagem, antes);
    assert.equal(lerCombate(codigo)?.mapa?.imagem ?? "", "");
  } finally { delete process.env.IMAGENS_DE_MAPA; }
});

test("sem mapa da IA: o servidor monta um campo aberto com 2 a 4 peças, sem isolar ninguém", async () => {
  const codigo = await mesaEmJogo([mario, lucia]);
  await post("/api/agir", { codigo, texto: "Vejo um goblin sem mapa e ataco" }, { token: mario.token });
  const c = lerCombate(codigo);
  assert.deepEqual([c.mapa.colunas, c.mapa.linhas], [10, 14]);
  assert.ok(c.mapa.terreno.length >= 2 && c.mapa.terreno.length <= 4);
  assert.ok(MP.conectado(c.mapa, c.posicoes));
  for (const j of [mario, lucia]) assert.ok(c.posicoes[j.id].y >= 12, "jogador fora da largada");
  for (const i of c.inimigos) assert.ok(c.posicoes[i.id].y <= 2 + 6, "inimigo longe demais da largada");   // pode ter andado 6 casas
  const casas = Object.values(c.posicoes).map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(casas).size, casas.length);
});

test("mapa errado da IA é corrigido: grade, tipos, muralha que isola, posições fora e sobrepostas, alcance inválido", async () => {
  const codigo = await mesaEmJogo([mario, lucia]);
  await post("/api/agir", { codigo, texto: "Vejo um goblin torto e ataco" }, { token: mario.token });
  const c = lerCombate(codigo);
  assert.deepEqual([c.mapa.colunas, c.mapa.linhas], [12, 10]);
  assert.deepEqual(c.mapa.terreno, [], "lava (tipo inválido), muralha que isola e peça fora da grade saem");
  for (const j of [mario, lucia]) assert.ok(c.posicoes[j.id].y >= 8 && c.posicoes[j.id].y <= 9);
  for (const i of c.inimigos) { assert.equal(i.alcance, "corpo"); assert.ok(MP.dentro(c.mapa, c.posicoes[i.id].x, c.posicoes[i.id].y)); }
  const casas = Object.values(c.posicoes).map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(casas).size, casas.length);
});

// ── /api/mover ──

test("/api/mover: só na própria vez, sem pausa nem rolagem pendente; casa ocupada, obstáculo e fora do mapa são recusados", async () => {
  const codigo = await mesaEmJogo([mario, lucia]);
  injetar(codigo, combateFixo({ pjs: [mario, lucia], inimigos: [gob(0)], terreno: [peca("obstaculo", 3, 11, 1, 1, "Pilar")],
    posicoes: { [mario.id]: [4, 12], [lucia.id]: [5, 12], ini_0: [4, 2] } }));
  let r = await mover(codigo, lucia, 5, 11);
  assert.deepEqual([r.st, r.d.error], [409, "Não é a sua vez."]);
  assert.equal((await mover(codigo, mario, 5, 12)).d.error, "Essa casa está ocupada.");
  assert.equal((await mover(codigo, mario, 4, 2)).d.error, "Essa casa está ocupada.");
  assert.equal((await mover(codigo, mario, 3, 11)).d.error, "Não dá para passar por ali.");
  assert.equal((await mover(codigo, mario, -1, 12)).d.error, "Essa casa fica fora do mapa.");
  assert.equal((await mover(codigo, mario, 10, 12)).d.error, "Essa casa fica fora do mapa.");
  assert.equal((await post("/api/mover", { codigo, x: "4", y: 11 }, { token: mario.token })).st, 400);
  assert.equal((await post("/api/mover", { codigo, x: 4, y: 11 }, { token: (await conta("Intruso", "intruso@mapa.br")).token })).st, 403);

  await post(`/api/mesa/${codigo}/combate/pausar`, {}, { token: lucia.token });
  assert.equal((await mover(codigo, mario, 4, 11)).d.error, "O combate está pausado.");
  await post(`/api/mesa/${codigo}/combate/pausar`, {}, { token: lucia.token });
  db.prepare("UPDATE mesas SET rolagem = ? WHERE codigo = ?").run(JSON.stringify({ id: "1", jogador: mario.id, tipo: "teste", rotulo: "Atletismo", bonus: 0, cd: 10 }), codigo);
  assert.match((await mover(codigo, mario, 4, 11)).d.error, /^Há uma rolagem pendente/);
  db.prepare("UPDATE mesas SET rolagem = NULL WHERE codigo = ?").run(codigo);

  r = await mover(codigo, mario, 4, 11);
  assert.deepEqual([r.st, r.d], [200, { ok: true, posicao: { x: 4, y: 11 }, restante: 4 }]);
  const c = lerCombate(codigo);
  assert.deepEqual(c.posicoes[mario.id], { x: 4, y: 11 });
  assert.deepEqual(c.deslocamento[mario.id], { total: 5, usado: 1 });
  assert.deepEqual(c.posicoes[lucia.id], { x: 5, y: 12 });
  // personagem caído não se move
  const f = JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, mario.id).dados);
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify({ ...f, pv: 0 }), codigo, mario.id);
  assert.match((await mover(codigo, mario, 4, 10)).d.error, /caído/);
});

test("/api/mover: terreno difícil custa 2, várias etapas no mesmo turno, longe demais, e o deslocamento zera na vez seguinte", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], terreno: [peca("dificil", 0, 10, 10, 2, "Lama")],
    posicoes: { [mario.id]: [4, 12], ini_0: [4, 0] } }));
  assert.deepEqual((await mover(codigo, mario, 4, 10)).d, { ok: true, posicao: { x: 4, y: 10 }, restante: 1 });   // 2 casas de lama: 4
  assert.deepEqual((await mover(codigo, mario, 4, 9)).d, { ok: true, posicao: { x: 4, y: 9 }, restante: 0 });
  assert.equal((await mover(codigo, mario, 4, 8)).d.error, "Longe demais: você ainda tem 0 casas de deslocamento.");
  assert.deepEqual((await mover(codigo, mario, 4, 9)).d, { ok: true, posicao: { x: 4, y: 9 }, restante: 0 });   // ficar onde está não gasta
  // passa a vez: o goblin anda (sem atacar, está longe) e o Mário volta com o deslocamento inteiro
  await post("/api/agir", { codigo, texto: "Olho em volta" }, { token: mario.token });
  const c = lerCombate(codigo);
  assert.equal(vez(c), mario.id);
  assert.equal(c.rodada, 2);
  assert.deepEqual(c.deslocamento, { [mario.id]: { total: 5, usado: 0 } });
  assert.deepEqual(c.posicoes.ini_0, { x: 4, y: 6 });
  const log = await diario(codigo, mario);
  assert.ok(log.some((e) => e.tipo === "sys" && e.texto === "Goblin 1 avança para E7." && e.ok === null), JSON.stringify(log.slice(-4)));
  assert.ok(!log.some((e) => / ataca /.test(e.texto)));
  assert.match(registro.ultimoPrompt, /Turno dos inimigos[\s\S]*Goblin 1 avança para E7\./);
  assert.deepEqual((await mover(codigo, mario, 4, 8)).d, { ok: true, posicao: { x: 4, y: 8 }, restante: 4 });
  const r = await mover(codigo, mario, 4, 3);
  assert.equal(r.d.error, "Longe demais: você ainda tem 4 casas de deslocamento.");
});

test("/api/mover: atravessa a casa de um aliado, mas não a de um inimigo", async () => {
  const muralha = [peca("obstaculo", 0, 10, 4, 1, "Muralha O"), peca("obstaculo", 5, 10, 5, 1, "Muralha L")];   // passagem em E11
  const codigo = await mesaEmJogo([mario, lucia]);
  injetar(codigo, combateFixo({ pjs: [mario, lucia], inimigos: [gob(0)], terreno: muralha,
    posicoes: { [mario.id]: [4, 12], [lucia.id]: [4, 10], ini_0: [4, 0] } }));
  assert.equal((await mover(codigo, mario, 4, 10)).d.error, "Essa casa está ocupada.");
  assert.deepEqual((await mover(codigo, mario, 4, 9)).d, { ok: true, posicao: { x: 4, y: 9 }, restante: 2 });

  const outra = await mesaEmJogo([mario]);
  injetar(outra, combateFixo({ pjs: [mario], inimigos: [gob(0)], terreno: muralha, posicoes: { [mario.id]: [4, 12], ini_0: [4, 10] } }));
  assert.equal((await mover(outra, mario, 4, 9)).d.error, "Não dá para passar por ali.");
  assert.deepEqual(lerCombate(outra).posicoes[mario.id], { x: 4, y: 12 });
});

// ── Ataques dos jogadores ──

test("ataque corpo a corpo: avança sozinho até o alvo; longe demais, cancela e a vez continua", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 8] } }));
  let r = await post("/api/agir", { codigo, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.st, 200);
  assert.equal(r.d.rolagem.rotulo, "Machado de batalha vs Goblin 1");
  let c = lerCombate(codigo);
  assert.deepEqual(c.posicoes[mario.id], { x: 4, y: 9 });
  assert.deepEqual(c.deslocamento[mario.id], { total: 5, usado: 3 });
  let log = await diario(codigo, mario);
  const iNarr = log.findLastIndex((e) => e.tipo === "narr"), iSys = log.findIndex((e) => e.texto === "Mário avança até Goblin 1.");
  assert.ok(iSys > iNarr && iNarr >= 0, "a narração vem antes do aviso");

  const longe = await mesaEmJogo([mario]);
  injetar(longe, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));
  r = await post("/api/agir", { codigo: longe, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.st, 200);
  assert.equal(r.d.rolagem, null);
  log = await diario(longe, mario);
  assert.ok(log.some((e) => e.tipo === "sys" && e.texto === "Goblin 1 está a 10 casas: longe demais para um ataque corpo a corpo. Aproxime-se no mapa."));
  assert.ok(log.some((e) => e.tipo === "narr" && e.texto === "Você avança!"), "a narração do Mestre continua");
  c = lerCombate(longe);
  assert.equal(vez(c), mario.id, "a vez continua com o Mário para ele se aproximar");
  assert.deepEqual([c.posicoes[mario.id], c.posicoes.ini_0], [{ x: 4, y: 12 }, { x: 4, y: 2 }]);
  assert.equal((await get(`/api/mesa/${longe}`, { token: mario.token })).d.rolagem, null);
  // continua na vez dele: pode se aproximar no mapa, com o deslocamento inteiro
  assert.deepEqual((await mover(longe, mario, 4, 7)).d, { ok: true, posicao: { x: 4, y: 7 }, restante: 0 });
});

test("ataque à distância: sem linha de visão cancela; além de 12 casas cancela; atrás da cobertura, CA +2", async () => {
  const arqueiro = { "Mário": { ataques: [{ nome: "Arco longo", bonus: 4, dano: "1d8" }] } };
  const muralha = [peca("obstaculo", 2, 6, 5, 1, "Muralha")];
  const semVisao = await mesaEmJogo([mario], arqueiro);
  injetar(semVisao, combateFixo({ pjs: [mario], inimigos: [gob(0)], terreno: muralha, posicoes: { [mario.id]: [4, 12], ini_0: [4, 4] } }));
  let r = await post("/api/agir", { codigo: semVisao, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.d.rolagem, null);
  assert.ok((await diario(semVisao, mario)).some((e) => e.texto === "Sem linha de visão até Goblin 1."));
  assert.equal(vez(lerCombate(semVisao)), mario.id);

  const longe = await mesaEmJogo([mario], arqueiro);
  injetar(longe, combateFixo({ pjs: [mario], inimigos: [gob(0)], linhas: 16, posicoes: { [mario.id]: [4, 15], ini_0: [4, 1] } }));
  r = await post("/api/agir", { codigo: longe, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.d.rolagem, null);
  assert.ok((await diario(longe, mario)).some((e) => e.texto === "Goblin 1 está a 14 casas: longe demais para Arco longo (alcance de 12 casas)."));

  const coberto = await mesaEmJogo([mario], arqueiro);
  injetar(coberto, combateFixo({ pjs: [mario], inimigos: [gob(0)], terreno: [peca("cobertura", 4, 5, 1, 1, "Caixote")], posicoes: { [mario.id]: [4, 12], ini_0: [4, 4] } }));
  r = await post("/api/agir", { codigo: coberto, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.d.rolagem.rotulo, "Arco longo vs Goblin 1 (cobertura +2)");
  assert.equal(r.d.rolagem.cd, 15);
  assert.deepEqual(lerCombate(coberto).posicoes[mario.id], { x: 4, y: 12 }, "à distância não precisa andar");
  const rol = await post("/api/rolar", { codigo: coberto, valor: 10 }, { token: mario.token });   // 10+4 = 14 < 15
  assert.equal(rol.d.sucesso, false);
  assert.ok((await diario(coberto, mario)).some((e) => e.tipo === "roll" && /Arco longo vs Goblin 1 \(cobertura \+2\): 10\+4 = 14 vs CA 15/.test(e.texto)));

  const aberto = await mesaEmJogo([mario], arqueiro);
  injetar(aberto, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 4] } }));
  r = await post("/api/agir", { codigo: aberto, texto: "Ataco o goblin" }, { token: mario.token });
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.cd], ["Arco longo vs Goblin 1", 13]);
});

// ── Turno dos inimigos ──

test("turno dos inimigos: quem está longe só anda; quem chega ao lado ataca; à distância atira de onde vê", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0), gob(1), gob(2, { nome: "Arqueiro", alcance: "distancia" })],
    posicoes: { [mario.id]: [4, 12], ini_0: [4, 0], ini_1: [6, 7], ini_2: [9, 2] } }));
  await post("/api/agir", { codigo, texto: "Olho em volta" }, { token: mario.token });
  const c = lerCombate(codigo);
  assert.equal(vez(c), mario.id);
  assert.equal(MP.distancia(c.posicoes.ini_0, c.posicoes[mario.id]), 6);
  assert.equal(MP.distancia(c.posicoes.ini_1, c.posicoes[mario.id]), 1);
  assert.deepEqual(c.posicoes.ini_2, { x: 9, y: 2 });
  const log = (await diario(codigo, mario)).map((e) => e.texto);
  assert.ok(log.includes("Goblin 1 avança para E7."));
  assert.ok(!log.some((t) => t.startsWith("Goblin 1 ataca")));
  assert.ok(log.some((t) => /^Goblin 2 avança para [A-J]\d+, ao lado de Mário\.$/.test(t)));
  assert.ok(log.some((t) => t.startsWith("Goblin 2 ataca Mário:")));
  assert.ok(log.some((t) => t.startsWith("Arqueiro ataca Mário:")));
  assert.match(registro.ultimoPrompt, /Turno dos inimigos[\s\S]*Goblin 2 avança[\s\S]*Goblin 2 ataca Mário/);
});

test("reforços entram no mapa sem mexer em quem já está; nomes repetidos não duplicam inimigos", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0), gob(1)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 11], ini_1: [5, 11] } }));
  await post("/api/agir", { codigo, texto: "Ouço reforços chegando" }, { token: mario.token });
  const c = lerCombate(codigo);
  assert.deepEqual(c.inimigos.map((i) => `${i.id}:${i.nome}:${i.alcance}`), ["ini_0:Goblin 1:corpo", "ini_1:Goblin 2:corpo", "ini_2:Goblin 3:distancia"]);
  assert.ok(c.ordem.some((o) => o.id === "ini_2"));
  assert.deepEqual([c.posicoes[mario.id], c.posicoes.ini_0, c.posicoes.ini_1, c.posicoes.ini_2], [{ x: 4, y: 12 }, { x: 4, y: 11 }, { x: 5, y: 11 }, { x: 9, y: 0 }]);
  assert.ok((await diario(codigo, mario)).some((e) => e.texto === "Reforços: Goblin 3 entra no combate."));
  assert.equal(vez(c), mario.id);
});

// ── Imagem do mapa ──

test("a imagem do mapa só é gravada se ainda for o mesmo combate", async () => {
  let abrir;
  registro.portaoImagem = new Promise((ok) => { abrir = ok; });
  try {
    const codigo = await mesaEmJogo([mario]);
    const antes = contagem.imagem;
    await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, { token: mario.token });
    assert.equal(contagem.imagem, antes + 1);                       // pedido feito, resposta presa no portão
    const outro = { ...lerCombate(codigo), id: "outro-combate" };   // o combate acabou e começou outro
    outro.mapa.imagem = "";
    injetar(codigo, outro);
    // e numa segunda mesa o combate simplesmente acabou
    const segunda = await mesaEmJogo([mario]);
    await post("/api/agir", { codigo: segunda, texto: "Vejo um goblin e ataco" }, { token: mario.token });
    injetar(segunda, null);
    abrir();
    await esperar(60);
    assert.equal(lerCombate(codigo).mapa.imagem, "");
    assert.equal(lerCombate(segunda), null);
  } finally { registro.portaoImagem = null; }
  // a imagem que chega depois não é apagada por quem grava o combate lido antes dela
  const codigo = await mesaEmJogo([mario]);
  await post("/api/agir", { codigo, texto: "Vejo um goblin e ataco" }, { token: mario.token });
  const url = await esperarImagem(codigo);
  assert.ok(url);
  const c = lerCombate(codigo);
  if (vez(c) === mario.id) await post("/api/agir", { codigo, texto: "Olho em volta" }, { token: mario.token });
  assert.equal(lerCombate(codigo)?.mapa?.imagem ?? url, url);
});

// ── Compatibilidade ──

test("combate antigo, sem mapa: atacar, rolar e o turno dos inimigos funcionam como antes; /api/mover recusa", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], semMapa: true }));
  assert.equal((await mover(codigo, mario, 4, 11)).d.error, "Este combate não tem mapa.");
  const r = await post("/api/agir", { codigo, texto: "Ataco o goblin" }, { token: mario.token });
  assert.equal(r.d.rolagem.rotulo, "Machado de batalha vs Goblin 1");
  assert.ok(!/Mapa \d+×/.test(registro.ultimoPrompt));
  assert.equal((await post("/api/rolar", { codigo, valor: 2 }, { token: mario.token })).d.sucesso, false);
  const c = lerCombate(codigo);
  assert.equal(c.mapa, undefined);
  assert.equal(c.posicoes, undefined);
  assert.equal(c.deslocamento, undefined);
  assert.equal(vez(c), mario.id);
  assert.ok((await diario(codigo, mario)).some((e) => e.texto.startsWith("Goblin 1 ataca Mário:")));
  assert.equal((await get(`/api/mesa/${codigo}`, { token: mario.token })).st, 200);
  // sem combate
  const calma = await mesaEmJogo([mario]);
  assert.equal((await mover(calma, mario, 4, 11)).d.error, "Não há combate agora.");
});
