/**
 * Testes do turno em etapas, magias com mana, inventário, dia na história, evolução de nível e ficha travada
 * (servidor de verdade, banco temporário, Mestre falso). Os combates são gravados direto no banco, com a ordem
 * fixa e o dano dos inimigos fixo ("1"); os dados do jogador vêm com valor fixo — nada depende da sorte.
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-turnos-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
delete process.env.ADMIN_PASS;
const { registro } = require("./mestre-falso");
const { server, db } = require("../server");
const R = require("../regras");
const C = require("../catalogo");
const M = require("../mestre");

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
const post = (rota, corpo, j) => api("POST", rota, { corpo, token: j?.token });
const get = (rota, j) => api("GET", rota, { token: j?.token });

async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id, nome };
}
const fichaBase = (nome) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }] });

/** Mesa em jogo. `extras`: {nome: campos gravados direto na ficha depois de salvar (classe, magias, inventário…)}. */
async function mesaEmJogo(jogadores, extras = {}) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome }, dono);
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, j);
  for (const j of jogadores) {
    db.prepare("DELETE FROM criacoes WHERE uid = ?").run(j.id);
    assert.equal((await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, j)).st, 200);
    // classe trocada direto no banco: sem "mana" guardada, a ficha começa com a mana cheia
    if (extras[j.nome]) editarFicha(d.codigo, j, (f) => { Object.assign(f, extras[j.nome]); if (!("mana" in extras[j.nome])) delete f.mana; });
  }
  assert.equal((await post("/api/comecar-aventura", { codigo: d.codigo }, dono)).st, 200);
  return d.codigo;
}
const lerFicha = (codigo, j) => R.normalizarFicha(JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, j.id).dados), j.id);
function editarFicha(codigo, j, fn) {
  const f = JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, j.id).dados);
  fn(f);
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, j.id);
}
const fichaApi = async (codigo, j) => (await get(`/api/mesa/${codigo}/fichas`, j)).d[j.id];

const gob = (i, extra = {}) => ({ id: `ini_${i}`, nome: `Goblin ${i + 1}`, pv: 7, pvMax: 7, ca: 13, ataque: 4, dano: "1", des: 2, alcance: "corpo", ...extra });
/** Combate com mapa, na vez do primeiro jogador; `posicoes`: {id: [x, y]}. */
function combateFixo({ pjs, inimigos, posicoes }) {
  return {
    rodada: 1, vez: 0, inicioVez: Date.now(), id: "fixo",
    ordem: [...pjs.map((j) => ({ id: j.id, tipo: "pj", nome: j.nome, ini: 20 })), ...inimigos.map((i) => ({ id: i.id, tipo: "ini", nome: i.nome, ini: 5 }))],
    inimigos,
    mapa: { colunas: 10, linhas: 14, descricao: "Campo de teste", terreno: [], imagem: "" },
    posicoes: Object.fromEntries(Object.entries(posicoes).map(([id, [x, y]]) => [id, { x, y }])), deslocamento: {},
  };
}
const injetar = (codigo, c) => db.prepare("UPDATE mesas SET combate = ?, rolagem = NULL WHERE codigo = ?").run(JSON.stringify(c), codigo);
const lerCombate = (codigo) => JSON.parse(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate || "null");
const estado = async (codigo, j) => (await get(`/api/mesa/${codigo}`, j)).d;
const diario = async (codigo, j) => (await get(`/api/mesa/${codigo}/log`, j)).d;
const vezDe = (c) => c.ordem[c.vez % c.ordem.length].id;
const acao = (codigo, j, tipo, nome, alvo) => post("/api/acao-combate", { codigo, tipo, nome, alvo }, j);
const usar = (codigo, j, item, alvo) => post("/api/usar-item", { codigo, item, alvo }, j);
const qtdDe = (f, nome) => f.inventario.find((i) => i.nome === nome)?.qtd ?? 0;

let mario, lucia;
before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  mario = await conta("Mário", "mario@turnos.br");
  lucia = await conta("Lúcia", "lucia@turnos.br");
});

// ── Turno em etapas ──

test("turno em etapas: mover antes da ação, uma ação, mover depois recusado, um item, fim automático e encerrar", async () => {
  const codigo = await mesaEmJogo([mario]);
  assert.equal(qtdDe(lerFicha(codigo, mario), "Poção de cura"), 2, "ficha nova ganha 2 Poções de cura");
  editarFicha(codigo, mario, (f) => { f.inventario[0].qtd = 3; });
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 9] } }));
  let m = await estado(codigo, mario);
  assert.deepEqual(m.combate.turno, { id: mario.id, acaoUsada: false, itemUsado: false });

  // 1) mover
  assert.equal((await post("/api/mover", { codigo, x: 4, y: 11 }, mario)).st, 200);
  // 2) ação: ataque da ficha; o corpo a corpo avança sozinho até o goblin
  let r = await acao(codigo, mario, "ataque", "Machado de batalha", "ini_0");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.ok, true);
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.bonus, r.d.rolagem.cd, r.d.rolagem.dano, r.d.rolagem.alvo], ["Machado de batalha vs Goblin 1", 5, 13, "1d8+3", "ini_0"]);
  assert.deepEqual(lerCombate(codigo).posicoes[mario.id], { x: 4, y: 10 });
  assert.equal((await estado(codigo, mario)).combate.turno.acaoUsada, true);
  assert.equal((await post("/api/rolar", { codigo, valor: 2 }, mario)).d.sucesso, false);
  // tem poção: a vez NÃO passa sozinha depois da ação
  m = await estado(codigo, mario);
  assert.equal(vezDe(m.combate), mario.id);
  assert.equal(m.combate.rodada, 1);
  assert.deepEqual(m.combate.turno, { id: mario.id, acaoUsada: true, itemUsado: false });
  assert.equal((await post("/api/mover", { codigo, x: 3, y: 10 }, mario)).d.error, "Você já fez sua ação: não dá mais para se mover neste turno.");
  assert.equal((await acao(codigo, mario, "ataque", "Machado de batalha", "ini_0")).d.error, "Você já fez sua ação neste turno.");
  r = await post("/api/agir", { codigo, texto: "Olho em volta" }, mario);
  assert.deepEqual([r.st, r.d.error], [409, "Você já fez sua ação neste turno."]);
  // 3) item rápido: com a ação já feita, o turno acaba sozinho
  editarFicha(codigo, mario, (f) => { f.pv = 3; });
  r = await usar(codigo, mario, "Poção de cura");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.cura >= 4 && r.d.cura <= 10);
  let f = lerFicha(codigo, mario);
  assert.equal(qtdDe(f, "Poção de cura"), 2);
  assert.ok(f.pv >= 3 + 4 - 2 && f.pv <= f.pvMax, `PV ${f.pv}`);           // o goblin (dano 1) pode ter acertado até 2 vezes
  m = await estado(codigo, mario);
  assert.equal(m.combate.rodada, 2, "o turno acabou sozinho: ação e item feitos");
  assert.deepEqual(m.combate.turno, { id: mario.id, acaoUsada: false, itemUsado: false });
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "roll" && /^Mário usa Poção de cura: Mário recupera \d+ PV$/.test(e.texto)));

  // rodada 2: item antes da ação; um item só; mover ainda pode; encerrar à mão
  assert.equal((await usar(codigo, mario, "Poção de cura")).st, 200);
  assert.equal((await usar(codigo, mario, "Poção de cura")).d.error, "Você já usou um item neste turno.");
  assert.equal(qtdDe(lerFicha(codigo, mario), "Poção de cura"), 1);
  assert.equal((await estado(codigo, mario)).combate.rodada, 2, "item sem a ação não encerra o turno");
  assert.equal((await post("/api/mover", { codigo, x: 3, y: 10 }, mario)).st, 200);
  assert.equal((await post("/api/encerrar-turno", { codigo }, mario)).st, 200);
  m = await estado(codigo, mario);
  assert.equal(m.combate.rodada, 3);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && e.texto === "Mário encerra o turno."));

  // rodada 3: a última poção acaba e sai do inventário; item e depois a ação: fim automático
  assert.equal((await usar(codigo, mario, "Poção de cura")).st, 200);
  assert.equal(qtdDe(lerFicha(codigo, mario), "Poção de cura"), 0, "a poção acabou e saiu do inventário");
  assert.ok(!lerFicha(codigo, mario).inventario.some((i) => i.nome === "Poção de cura"));
  assert.equal((await acao(codigo, mario, "ataque", "Machado de batalha", "ini_0")).st, 200);
  await post("/api/rolar", { codigo, valor: 2 }, mario);
  assert.equal((await estado(codigo, mario)).combate.rodada, 4);
  // rodada 4: sem item rápido nenhum, a ação sozinha encerra o turno
  assert.equal((await usar(codigo, mario, "Poção de cura")).d.error, "Você não tem esse item.");
  assert.equal((await acao(codigo, mario, "ataque", "Machado de batalha", "ini_0")).st, 200);
  await post("/api/rolar", { codigo, valor: 2 }, mario);
  assert.equal((await estado(codigo, mario)).combate.rodada, 5);
});

test("encerrar turno: só na própria vez, sem rolagem pendente e só em combate; ação livre sem item encerra sozinha", async () => {
  const codigo = await mesaEmJogo([mario, lucia], { "Lúcia": { inventario: [] } });
  assert.equal((await post("/api/encerrar-turno", { codigo }, mario)).d.error, "Não há combate agora.");
  injetar(codigo, combateFixo({ pjs: [mario, lucia], inimigos: [gob(0)], posicoes: { [mario.id]: [3, 12], [lucia.id]: [5, 12], ini_0: [4, 0] } }));
  assert.equal((await post("/api/encerrar-turno", { codigo }, lucia)).d.error, "Não é a sua vez.");
  assert.equal((await post("/api/usar-item", { codigo, item: "Poção de cura" }, lucia)).d.error, "Você não tem esse item.");
  assert.match((await usar(codigo, lucia, "Poção")).d.error, /Você não tem esse item\./);
  db.prepare("UPDATE mesas SET rolagem = ? WHERE codigo = ?").run(JSON.stringify({ id: "1", jogador: mario.id, tipo: "teste", rotulo: "Atletismo", bonus: 0, cd: 10 }), codigo);
  assert.match((await post("/api/encerrar-turno", { codigo }, mario)).d.error, /^Há uma rolagem pendente/);
  db.prepare("UPDATE mesas SET rolagem = NULL WHERE codigo = ?").run(codigo);
  assert.equal((await post("/api/encerrar-turno", { codigo }, mario)).st, 200);
  let c = lerCombate(codigo);
  assert.equal(vezDe(c), lucia.id);
  assert.deepEqual(c.turno, { id: lucia.id, acaoUsada: false, itemUsado: false });
  // a Lúcia não tem item rápido: a ação livre (texto) já encerra o turno
  assert.equal((await post("/api/agir", { codigo, texto: "Olho em volta" }, lucia)).st, 200);
  c = lerCombate(codigo);
  assert.equal(vezDe(c), mario.id);
  assert.equal(c.rodada, 2);
});

// ── Lista fechada de ataques ──

test("ataque fora da ficha é recusado na rota e vindo do Mestre, sem gastar a ação; fora de alcance também", async () => {
  const codigo = await mesaEmJogo([mario]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));
  assert.deepEqual([(await acao(codigo, mario, "ataque", "Bazuca", "ini_0")).st, (await acao(codigo, mario, "ataque", "Bazuca", "ini_0")).d.error], [409, "Esse ataque não está na sua ficha."]);
  assert.equal((await acao(codigo, mario, "ataque", "Machado", "ini_0")).d.error, "Esse ataque não está na sua ficha.", "na rota o nome é exato");
  assert.equal((await acao(codigo, mario, "magia", "Bola de Fogo", "ini_0")).d.error, "Essa magia não está na sua ficha.");
  assert.equal((await acao(codigo, mario, "chute", "Machado de batalha", "ini_0")).st, 400);
  assert.equal((await acao(codigo, mario, "ataque", "Machado de batalha", "ini_9")).d.error, "Esse alvo não está de pé no combate.");
  let r = await acao(codigo, mario, "ataque", "Machado de batalha", "ini_0");
  assert.equal(r.st, 409);
  assert.equal(r.d.error, "Goblin 1 está a 10 casas: longe demais para um ataque corpo a corpo. Aproxime-se no mapa.");
  // vindo do Mestre: o teste de ataque com "Bazuca" não vira rolagem
  r = await post("/api/agir", { codigo, texto: "Disparo a bazuca no goblin" }, mario);
  assert.equal(r.st, 200);
  assert.equal(r.d.rolagem, null);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && e.texto === "Mário não tem “Bazuca” na ficha: não dá para usar."));
  const c = (await estado(codigo, mario)).combate;
  assert.deepEqual([vezDe(c), c.rodada, c.turno.acaoUsada], [mario.id, 1, false], "nada disso gastou a ação");
  assert.equal((await get(`/api/mesa/${codigo}`, mario)).d.rolagem, null);
  assert.match(registro.ultimoPrompt, /nome exato de um ataque da ficha de Mário/);
});

// ── Magias e mana ──

test("mana: magia de dano gasta mana e rola; sem mana é recusada; truque é grátis; o Mestre também respeita a mana", async () => {
  const maga = { classe: "Mago", raca: "Elfo", atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, inventario: [],
    magias: [{ nome: "Bola de Fogo", descricao: "fogo" }, { nome: "Raio de Gelo" }, { nome: "Escudo Arcano" }], mana: 5 };
  const codigo = await mesaEmJogo([mario], { "Mário": maga });
  let f = await fichaApi(codigo, mario);
  assert.deepEqual([f.manaMax, f.mana], [7, 5]);                                     // max(2, 2 + 2×1 + 3)
  assert.deepEqual(f.magias.map((m) => [m.nome, m.circulo, m.custo, m.tipo, m.efeito, m.alcance]),
    [["Bola de Fogo", 3, 4, "dano", "8d6", "distancia"], ["Raio de Gelo", 0, 0, "dano", "1d8", "distancia"], ["Escudo Arcano", 1, 2, "utilidade", "", "pessoal"]]);
  injetar(codigo, combateFixo({ pjs: [mario], inimigos: [gob(0, { pv: 99, pvMax: 99 })], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } }));

  let r = await acao(codigo, mario, "magia", "bola de fogo", "ini_0");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.rolagem.rotulo, r.d.rolagem.bonus, r.d.rolagem.dano], ["Bola de Fogo vs Goblin 1", 5, "8d6"]);   // prof 2 + INT 3; dano sem atributo
  assert.equal(lerFicha(codigo, mario).mana, 1);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "acao" && e.texto === "Conjura Bola de Fogo em Goblin 1."));
  await post("/api/rolar", { codigo, valor: 2 }, mario);
  assert.equal(lerCombate(codigo).rodada, 2, "sem item rápido, a ação encerra o turno");

  r = await acao(codigo, mario, "magia", "Bola de Fogo", "ini_0");
  assert.deepEqual([r.st, r.d.error], [409, "Mana insuficiente: Bola de Fogo custa 4 e você tem 1."]);
  assert.equal(lerCombate(codigo).turno.acaoUsada, false);
  r = await acao(codigo, mario, "magia", "Raio de Gelo", "ini_0");
  assert.equal(r.st, 200);
  assert.equal(r.d.rolagem.dano, "1d8");
  assert.equal(lerFicha(codigo, mario).mana, 1, "truque não gasta mana");
  await post("/api/rolar", { codigo, valor: 2 }, mario);

  // pelo Mestre: "teste" de ataque com o nome da magia
  r = await post("/api/agir", { codigo, texto: "Lanço a bola de fogo" }, mario);
  assert.equal(r.d.rolagem, null);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && e.texto === "Mana insuficiente: Bola de Fogo custa 4 e você tem 1."));
  assert.equal(lerCombate(codigo).turno.acaoUsada, false);
  editarFicha(codigo, mario, (x) => { x.mana = 7; });
  r = await post("/api/agir", { codigo, texto: "Lanço a bola de fogo" }, mario);
  assert.equal(r.d.rolagem.rotulo, "Bola de Fogo vs Goblin 1");
  assert.equal(lerFicha(codigo, mario).mana, 3);
  // o contexto do Mestre mostra a mana e o custo de cada magia
  assert.match(registro.ultimoPrompt, /Magias: Bola de Fogo \(3º círculo, custo 4, dano 8d6, à distância\); Raio de Gelo \(truque, sem custo, dano 1d8, à distância\)/);
  assert.match(registro.ultimoPrompt, /Mana 7\/7\./);
  // utilidade fora de combate: gasta a mana e o Mestre narra; magia de dano fora de combate não
  injetar(codigo, null);
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Bola de Fogo" }, mario)).d.error, "Magia de dano só no combate.");
  r = await post("/api/usar-magia", { codigo, nome: "Escudo Arcano" }, mario);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(lerFicha(codigo, mario).mana, 1);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "narr" && e.texto === "O efeito se espalha pela cena."));
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Escudo Arcano" }, mario)).d.error, "Mana insuficiente: Escudo Arcano custa 2 e você tem 1.");
});

test("cura por magia (alcance corpo e distância) e por poção (em aliado só ao lado); usar-magia não vale no combate", async () => {
  const clerigo = { classe: "Clérigo", atributos: { for: 12, des: 10, con: 12, int: 10, sab: 14, car: 12 },
    magias: [{ nome: "Curar Ferimentos Leves" }, { nome: "Palavra Curativa" }] };
  const codigo = await mesaEmJogo([lucia, mario], { "Lúcia": clerigo });
  assert.equal(lerFicha(codigo, lucia).manaMax, 6);                                   // 2 + 2 + SAB 2
  // fora de combate
  editarFicha(codigo, mario, (f) => { f.pv = 1; });
  let r = await post("/api/usar-magia", { codigo, nome: "Curar Ferimentos Leves", alvo: mario.id }, lucia);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.cura >= 4 && r.d.cura <= 11);
  assert.equal(lerFicha(codigo, mario).pv, Math.min(lerFicha(codigo, mario).pvMax, 1 + r.d.cura));
  assert.equal(lerFicha(codigo, lucia).mana, 4);
  assert.ok((await diario(codigo, lucia)).some((e) => e.tipo === "roll" && e.texto === `Lúcia conjura Curar Ferimentos Leves: Mário recupera ${r.d.cura} PV`));
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Curar Ferimentos Leves", alvo: "ninguém" }, lucia)).d.error, "Esse aliado não está na mesa.");
  // poção fora de combate, em si mesmo, a qualquer hora
  editarFicha(codigo, mario, (f) => { f.pv = 1; });
  r = await usar(codigo, mario, "poção de cura");
  assert.equal(r.st, 200);
  assert.equal(lerFicha(codigo, mario).pv, 1 + r.d.cura);
  assert.equal(qtdDe(lerFicha(codigo, mario), "Poção de cura"), 1);

  // no combate: a Lúcia está a 5 casas do Mário
  editarFicha(codigo, mario, (f) => { f.pv = 1; });
  injetar(codigo, combateFixo({ pjs: [lucia, mario], inimigos: [gob(0)], posicoes: { [lucia.id]: [2, 12], [mario.id]: [7, 12], ini_0: [4, 0] } }));
  assert.equal((await post("/api/usar-magia", { codigo, nome: "Palavra Curativa", alvo: mario.id }, lucia)).d.error, "Em combate, conjure na sua vez, como a ação do turno.");
  r = await acao(codigo, lucia, "magia", "Curar Ferimentos Leves", mario.id);
  assert.deepEqual([r.st, r.d.error], [409, "Fora de alcance: chegue ao lado de Mário (está a 5 casas)."]);
  r = await acao(codigo, lucia, "magia", "Palavra Curativa", mario.id);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.cura >= 4 && r.d.cura <= 7);
  assert.equal(lerFicha(codigo, mario).pv, 1 + r.d.cura);
  assert.equal(lerFicha(codigo, lucia).mana, 2);
  let c = lerCombate(codigo);
  assert.deepEqual([vezDe(c), c.turno.acaoUsada, c.turno.itemUsado], [lucia.id, true, false], "tem poção: o turno espera o item");
  assert.equal((await usar(codigo, lucia, "Poção de cura", mario.id)).d.error, "Fora de alcance: chegue ao lado de Mário (está a 5 casas).");
  r = await usar(codigo, lucia, "Poção de cura");
  assert.equal(r.st, 200);
  c = lerCombate(codigo);
  assert.equal(vezDe(c), mario.id, "ação e item feitos: a vez passou sozinha");
  // a poção em aliado ao lado vale
  c.posicoes[lucia.id] = { x: 6, y: 12 };
  injetar(codigo, { ...c, vez: 0, ordem: [c.ordem[1], c.ordem[0], c.ordem[2]], turno: null });
  editarFicha(codigo, lucia, (f) => { f.pv = 1; });
  r = await usar(codigo, mario, "Poção de cura", lucia.id);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(lerFicha(codigo, lucia).pv, Math.min(lerFicha(codigo, lucia).pvMax, 1 + r.d.cura));
});

// ── Inventário ──

test("inventário: o Mestre dá e tira itens; inválidos recusados; item rápido sem efeito o Mestre narra; só usa o que tem", async () => {
  const codigo = await mesaEmJogo([mario]);
  let r = await post("/api/agir", { codigo, texto: "Saqueio o baú" }, mario);
  assert.equal(r.st, 200);
  let f = await fichaApi(codigo, mario);
  assert.deepEqual(f.inventario.map((i) => [i.nome, i.qtd, i.tipo, i.efeito]),
    [["Poção de cura", 4, "pocao", "cura 2d4+2"], ["Corda", 1, "equipamento", ""], ["Bomba de fumaça", 1, "rapido", ""]]);
  assert.deepEqual(f.equipamento, ["Poção de cura (×4)", "Corda", "Bomba de fumaça"], "equipamento derivado para os apps antigos");
  const sys = (await diario(codigo, mario)).filter((e) => e.tipo === "sys").map((e) => e.texto);
  for (const t of ["Mário ganhou 2× Poção de cura.", "Mário ganhou 1× Corda.", "Mário ganhou 1× Bomba de fumaça."]) assert.ok(sys.includes(t), t);

  // inválidos: efeito de dano, cura exagerada, quantidade fora de 1–10, tipo inventado, efeito em equipamento, alvo inexistente
  await post("/api/agir", { codigo, texto: "Pego o item invalido" }, mario);
  f = await fichaApi(codigo, mario);
  assert.deepEqual(f.inventario.map((i) => i.nome), ["Poção de cura", "Corda", "Bomba de fumaça", "Moeda de prata"]);
  assert.equal(qtdDe(f, "Moeda de prata"), 3);

  await post("/api/agir", { codigo, texto: "Quebro a corda" }, mario);              // perde a Corda; a "Lança" que não existe é ignorada
  f = await fichaApi(codigo, mario);
  assert.ok(!f.inventario.some((i) => i.nome === "Corda"));
  assert.ok((await diario(codigo, mario)).some((e) => e.texto === "Mário perdeu 1× Corda."));

  assert.equal((await usar(codigo, mario, "Moeda de prata")).d.error, "Moeda de prata não é poção nem item rápido.");
  assert.equal((await usar(codigo, mario, "Dinamite")).d.error, "Você não tem esse item.");
  // item rápido sem efeito de cura: é gasto e o Mestre narra
  r = await usar(codigo, mario, "Bomba de fumaça");
  assert.equal(r.st, 200);
  assert.equal(r.d.cura, undefined);
  assert.ok(!(await fichaApi(codigo, mario)).inventario.some((i) => i.nome === "Bomba de fumaça"));
  const log = await diario(codigo, mario);
  assert.ok(log.some((e) => e.tipo === "acao" && e.texto === "Usa Bomba de fumaça."));
  assert.ok(log.some((e) => e.tipo === "narr" && e.texto === "A fumaça cinza cobre o campo."));
  assert.match(registro.ultimoPrompt, /usa Bomba de fumaça/);

  // o Mestre recebe o inventário, os limites e os elementos da cena
  r = await post("/api/agir", { codigo, texto: "Acendo a dinamite" }, mario);
  assert.equal(r.d.rolagem, null);
  assert.equal(qtdDe(await fichaApi(codigo, mario), "Poção de cura"), 4);
  assert.match(registro.ultimoPrompt, /Inventário: Poção de cura ×4 \(cura 2d4\+2\); Moeda de prata ×3\./);
  assert.match(registro.ultimoPrompt, /LIMITES DE AÇÃO/);
  assert.match(registro.ultimoPrompt, /Elementos da cena atual \(o que está visível e pode ser usado\): fumaça espessa/);
  assert.match(registro.ultimoPrompt, /"itens":/);
  assert.match(registro.ultimoPrompt, /"novo_dia":/);
});

// ── Dia na história ──

test("novo dia: todos recuperam vida e mana (até os caídos); só fora de combate; não repete seguido", async () => {
  const clerigo = { classe: "Clérigo", atributos: { for: 12, des: 10, con: 12, int: 10, sab: 14, car: 12 }, magias: [{ nome: "Palavra Curativa" }] };
  const codigo = await mesaEmJogo([mario, lucia], { "Lúcia": clerigo });
  assert.equal((await estado(codigo, mario)).dia, 1);
  editarFicha(codigo, mario, (f) => { f.pv = 2; });
  editarFicha(codigo, lucia, (f) => { f.pv = 0; f.mana = 0; });
  await post("/api/agir", { codigo, texto: "Durmo na estalagem" }, mario);
  assert.equal((await estado(codigo, mario)).dia, 2);
  let fm = lerFicha(codigo, mario), fl = lerFicha(codigo, lucia);
  assert.deepEqual([fm.pv, fl.pv, fl.mana], [fm.pvMax, fl.pvMax, fl.manaMax]);
  assert.ok((await diario(codigo, mario)).some((e) => e.tipo === "sys" && e.texto === "Dia 2 começa: vida e mana recuperadas."));

  editarFicha(codigo, mario, (f) => { f.pv = 2; });
  await post("/api/agir", { codigo, texto: "Durmo de novo" }, mario);                 // logo depois: recusado
  assert.equal((await estado(codigo, mario)).dia, 2);
  assert.equal(lerFicha(codigo, mario).pv, 2);
  await post("/api/agir", { codigo, texto: "Olho em volta" }, mario);                 // a história anda
  await post("/api/agir", { codigo, texto: "Durmo de novo" }, mario);
  assert.equal((await estado(codigo, mario)).dia, 3);
  assert.equal(lerFicha(codigo, mario).pv, lerFicha(codigo, mario).pvMax);
  assert.match(registro.ultimoPrompt, /Dia na história: 2/);                          // o prompt é de antes desta resposta

  // em combate: recusado
  editarFicha(codigo, mario, (f) => { f.pv = 2; });
  injetar(codigo, combateFixo({ pjs: [mario, lucia], inimigos: [gob(0)], posicoes: { [mario.id]: [3, 12], [lucia.id]: [5, 12], ini_0: [4, 0] } }));
  await post("/api/agir", { codigo, texto: "Durmo no meio da luta" }, mario);
  assert.equal((await estado(codigo, mario)).dia, 3);
  assert.equal(lerFicha(codigo, mario).pv, 2);
  // reiniciar volta ao dia 1
  assert.equal((await post("/api/reiniciar-mesa", { codigo }, mario)).st, 200);
  assert.equal((await estado(codigo, mario)).dia, 1);
});

// ── Evolução de nível ──

test("evolução: ganhos por nível e classe (pontos nos níveis 4, 8, 12, 16 e 19), círculo e mana", () => {
  const pontos = [], tecnicas = [];
  for (let n = 1; n <= 20; n++) {
    const g = R.ganhosDoNivel("Guerreiro", n);
    if (g.pontos) pontos.push(n);
    if (g.ataques) tecnicas.push(n);
    assert.equal(g.magias, 0);
    assert.deepEqual(R.ganhosDoNivel("Ladino", n).ataques, g.ataques);
    assert.deepEqual([R.ganhosDoNivel("Mago", n).magias, R.ganhosDoNivel("Mago", n).ataques], [2, 0]);
    assert.deepEqual([R.ganhosDoNivel("Clérigo", n).magias, R.ganhosDoNivel("Clérigo", n).pontos], [1, g.pontos]);
  }
  assert.deepEqual(pontos, [4, 8, 12, 16, 19]);
  assert.deepEqual(tecnicas, [2, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  assert.deepEqual([1, 2, 3, 5, 9, 10, 20].map(R.circuloMaximo), [1, 1, 2, 3, 5, 5, 5]);
  assert.equal(R.manaMaxima("Mago", 1, { int: 8 }), 3);
  assert.equal(R.manaMaxima("Clérigo", 20, { sab: 20 }), 47);
  assert.equal(R.manaMaxima("Guerreiro", 20, { int: 20 }), 0);
  assert.equal(R.manaMaxima("Mago", 1, { int: 1 }), 2, "mínimo 2");
  // catálogo: nomes únicos, custo por círculo, efeitos que o motor rola, técnicas de Guerreiro e Ladino
  const nomes = [...C.MAGIAS, ...C.TECNICAS].map((x) => R.chave(x.nome));
  assert.equal(new Set(nomes).size, nomes.length);
  assert.ok(C.MAGIAS.length >= 24 && C.TECNICAS.length >= 12);
  for (const m of C.MAGIAS) {
    assert.equal(C.custoDe(m.circulo), m.circulo ? m.circulo + 1 : 0);
    if (m.tipo !== "utilidade") assert.ok(R.rolar(m.efeito).total > 0, m.nome); else assert.equal(m.efeito, "");
  }
  for (let c = 0; c <= 5; c++) for (const cl of ["Mago", "Clérigo"]) assert.ok(C.MAGIAS.some((m) => m.classes.includes(cl) && m.circulo === c), `${cl} sem círculo ${c}`);
  assert.equal(C.efeitoNoNivel(C.magiaDoCatalogo("Raio de Gelo"), 11), "3d8");
  const f = R.normalizarFicha({ classe: "Guerreiro", nivel: 5, atributos: { for: 16 }, ataques: [{ nome: "Golpe poderoso", bonus: 0, dano: "1" }] }, "a");
  assert.deepEqual(f.ataques[0], { nome: "Golpe poderoso", bonus: 6, dano: "1d10+3", alcance: "corpo" }, "técnica recalculada: prof 3 + FOR 3");
});

test("evolução: pendências ao subir de nível, escolhas inválidas recusadas, resolução parcial e limite no nível 20", async () => {
  const maga = { classe: "Mago", raca: "Elfo", atributos: { for: 8, des: 14, con: 13, int: 17, sab: 12, car: 8 }, inventario: [],
    magias: [{ nome: "Raio de Gelo" }, { nome: "Mísseis Mágicos" }, { nome: "Escudo Arcano" }], nivel: 3, xp: 299 };
  const codigo = await mesaEmJogo([mario, lucia], { "Mário": maga, "Lúcia": { nivel: 1, xp: 99 } });
  const antes = lerFicha(codigo, mario);
  assert.equal(antes.pendencias, null);
  await post("/api/agir", { codigo, texto: "Olho em volta" }, mario);                 // +5 XP: nível 4
  let f = await fichaApi(codigo, mario);
  assert.equal(f.nivel, 4);
  assert.deepEqual(Object.keys(f.pendencias).sort(), ["magias", "pontos"]);
  assert.equal(f.pendencias.pontos, 2);
  assert.equal(f.pendencias.magias.quantas, 2);
  const opcoes = f.pendencias.magias.opcoes.map((m) => m.nome);
  assert.ok(opcoes.includes("Raio Ardente") && opcoes.includes("Sono") && !opcoes.includes("Bola de Fogo") && !opcoes.includes("Mísseis Mágicos"), opcoes.join());
  assert.deepEqual(f.pendencias.magias.opcoes.find((m) => m.nome === "Raio Ardente"), { nome: "Raio Ardente", circulo: 2, tipo: "dano", efeito: "4d6", alcance: "distancia", custo: 3, descricao: C.magiaDoCatalogo("Raio Ardente").descricao });
  assert.deepEqual([f.manaMax, f.mana], [antes.manaMax + 2, antes.mana + 2], "mana máxima sobe e a atual sobe junto");
  assert.ok((await diario(codigo, mario)).some((e) => e.texto === "Mário subiu para o nível 4!"));

  const evoluir = (corpo, j = mario) => post("/api/evoluir", { codigo, ...corpo }, j);
  assert.deepEqual([(await evoluir({ atributos: { for: 3 } })).st, (await evoluir({ atributos: { for: 3 } })).d.error], [409, "Você tem 2 pontos para distribuir."]);
  assert.equal((await evoluir({ atributos: { sorte: 1 } })).st, 400);
  assert.equal((await evoluir({ atributos: { for: 1.5 } })).st, 400);
  assert.equal((await evoluir({ atributos: { for: -1, des: 3 } })).st, 400);
  editarFicha(codigo, mario, (x) => { x.atributos.des = 19; x.atributos.car = 3; });     // soma dentro do limite do nível
  assert.equal((await evoluir({ atributos: { des: 2 } })).d.error, "Destreza passaria de 20.");
  editarFicha(codigo, mario, (x) => { x.atributos.des = 14; x.atributos.car = 8; });
  assert.equal((await evoluir({ magias: ["Bola de Fogo"] })).d.error, "Bola de Fogo não está entre as opções.");
  assert.equal((await evoluir({ magias: ["Mísseis Mágicos"] })).d.error, "Mísseis Mágicos não está entre as opções.", "trocar não, só acrescentar");
  assert.equal((await evoluir({ magias: ["Sono", "Raio Ardente", "Passo Nebuloso"] })).d.error, "Você pode escolher 2 magias agora.");
  assert.equal((await evoluir({ magias: ["Sono", "sono"] })).d.error, "Sono foi escolhido duas vezes.");
  assert.equal((await evoluir({ ataques: ["Golpe poderoso"] })).d.error, "Você não tem técnicas para escolher agora.");
  assert.equal((await evoluir({ magias: "Sono" })).st, 400);
  assert.equal((await evoluir({})).st, 400);
  assert.deepEqual(lerFicha(codigo, mario).pendencias.pontos, 2, "nada mudou com as recusas");

  // parcial: um ponto agora
  let r = await evoluir({ atributos: { int: 1 } });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.ficha.atributos.int, 18);
  assert.equal(r.d.ficha.manaMax, f.manaMax + 1, "INT 18: modificador +4");
  assert.equal(r.d.ficha.mana, f.mana + 1);
  assert.deepEqual([r.d.ficha.pendencias.pontos, r.d.ficha.pendencias.magias.quantas], [1, 2]);
  // o resto depois
  r = await evoluir({ atributos: { con: 1 }, magias: ["Raio Ardente", "passo nebuloso"] });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  f = r.d.ficha;
  assert.equal(f.pendencias, null);
  assert.equal(f.atributos.con, 14);
  assert.equal(f.pvMax, antes.pvMax + 5 + 4, "nível 4 (d6: 3 + 1 + CON 1) e CON 14 (+1 em cada um dos 4 níveis)");
  assert.deepEqual(f.magias.map((m) => m.nome), ["Raio de Gelo", "Mísseis Mágicos", "Escudo Arcano", "Raio Ardente", "Passo Nebuloso"]);
  const log = (await diario(codigo, mario)).map((e) => e.texto);
  assert.ok(log.includes("Mário evoluiu: +1 INT."));
  assert.ok(log.includes("Mário evoluiu: +1 CON, aprendeu Raio Ardente, Passo Nebuloso."));
  assert.equal((await evoluir({ atributos: { con: 1 } })).d.error, "Não há nada para evoluir agora.");

  // Guerreiro no nível 2: uma técnica do catálogo (também vale no combate, sem gastar a ação)
  await post("/api/agir", { codigo, texto: "Olho em volta" }, lucia);
  let g = await fichaApi(codigo, lucia);
  assert.equal(g.nivel, 2);
  assert.deepEqual(Object.keys(g.pendencias), ["ataques"]);
  assert.deepEqual(g.pendencias.ataques.opcoes.map((a) => [a.nome, a.nivelMinimo]), [["Golpe poderoso", 2], ["Arremesso de lança", 2]]);
  injetar(codigo, combateFixo({ pjs: [lucia, mario], inimigos: [gob(0)], posicoes: { [lucia.id]: [3, 12], [mario.id]: [5, 12], ini_0: [4, 0] } }));
  assert.equal((await evoluir({ ataques: ["Investida"] }, lucia)).d.error, "Investida não está entre as opções.", "nível mínimo 3");
  r = await evoluir({ ataques: ["Golpe poderoso"] }, lucia);
  assert.equal(r.st, 200);
  assert.deepEqual(r.d.ficha.ataques.at(-1), { nome: "Golpe poderoso", bonus: 5, dano: "1d10+3", alcance: "corpo" });
  assert.equal((await estado(codigo, lucia)).combate.turno.acaoUsada, false);
  assert.equal((await acao(codigo, lucia, "ataque", "Golpe poderoso", "ini_0")).st, 409, "longe: mas a técnica está na ficha");
  assert.match((await acao(codigo, lucia, "ataque", "Golpe poderoso", "ini_0")).d.error, /longe demais/);

  // vários níveis de uma vez somam as pendências; nível 20 é o limite
  injetar(codigo, null);
  editarFicha(codigo, lucia, (x) => { x.nivel = 3; x.xp = 695; x.pendencias = null; });
  await post("/api/agir", { codigo, texto: "Olho em volta" }, lucia);
  g = await fichaApi(codigo, lucia);
  assert.deepEqual([g.nivel, g.xp, g.pendencias.pontos, g.pendencias.ataques.quantas], [5, 0, 2, 1]);
  editarFicha(codigo, lucia, (x) => { x.nivel = 19; x.xp = 5000; x.pendencias = null; });
  await post("/api/agir", { codigo, texto: "Olho em volta" }, lucia);
  g = await fichaApi(codigo, lucia);
  assert.deepEqual([g.nivel, g.xp], [20, 5000 + 5 - 1900]);
  assert.equal(g.pendencias, null, "o nível 20 não dá pontos nem técnica");
  assert.equal((await diario(codigo, lucia)).filter((e) => /subiu para o nível 2[01]!/.test(e.texto)).length, 1, "não passa do 20");
});

// ── Ficha travada e criação ──

test("ficha travada depois de começar: vida, atributos, mana, magias, inventário, raça e classe ignorados; aparência e história aceitas", async () => {
  const codigo = await mesaEmJogo([mario]);
  editarFicha(codigo, mario, (f) => { f.pv = 5; });
  const antes = lerFicha(codigo, mario);
  const r = await post("/api/salvar-ficha", { codigo, ficha: { ...antes, pv: antes.pvMax, atributos: { for: 20, des: 20, con: 20, int: 20, sab: 20, car: 20 },
    mana: 99, classe: "Mago", raca: "Elfo", ca: 25, ataques: [{ nome: "Bazuca", bonus: 15, dano: "10d10" }], magias: [{ nome: "Bola de Fogo" }],
    inventario: [{ nome: "Dinamite", qtd: 9, tipo: "rapido" }, { nome: "Poção de cura", qtd: 9, tipo: "pocao", efeito: "cura 2d4+2" }], pericias: ["Furtividade"],
    nome: "Mário Novo", sexo: "Outro", imagem: "https://imagens.exemplo/eu.png", antecedente: "Marinheiro",
    tracos: { personalidade: "Calmo" }, anotacoes: "Devo um favor a Odila." } }, mario);
  assert.equal(r.st, 200);
  const f = await fichaApi(codigo, mario);
  for (const k of ["pv", "pvMax", "atributos", "mana", "manaMax", "classe", "raca", "ca", "ataques", "magias", "inventario", "pericias", "xp", "nivel"]) assert.deepEqual(f[k], antes[k], k);
  assert.deepEqual([f.nome, f.sexo, f.imagem, f.antecedente, f.tracos.personalidade, f.tracos.ideal, f.anotacoes, f.notas],
    ["Mário Novo", "Outro", "https://imagens.exemplo/eu.png", "Marinheiro", "Calmo", antes.tracos.ideal, "Devo um favor a Odila.", "Devo um favor a Odila."]);
  // app antigo: manda "notas"
  await post("/api/salvar-ficha", { codigo, ficha: { ...f, notas: "Nota do app antigo", anotacoes: f.anotacoes } }, mario);
  assert.equal((await fichaApi(codigo, mario)).anotacoes, "Nota do app antigo");
});

test("criação: magias só do catálogo de nível 1 (Mago 3, com 1–2 truques), 2 poções sempre; no saguão o jogador não inventa itens", async () => {
  const { d } = await post("/api/mesa/criar", { nome: "Mário" }, mario);
  const codigo = d.codigo;
  db.prepare("DELETE FROM criacoes WHERE uid = ?").run(mario.id);
  // sem ficha do Mestre: itens inventados não entram; ganha as 2 poções
  let r = await post("/api/salvar-ficha", { codigo, ficha: { ...fichaBase("Mário"), inventario: [{ nome: "Dinamite", qtd: 5, tipo: "rapido" }, { nome: "Poção de cura", qtd: 9, tipo: "pocao", efeito: "cura 2d4+2" }] } }, mario);
  assert.deepEqual(r.d.ficha.inventario.map((i) => [i.nome, i.qtd]), [["Poção de cura", 2]]);

  r = await post("/api/criar-personagem", { codigo, conceito: "uma maga curiosa" }, mario);
  assert.equal(r.st, 200);
  const criada = r.d.ficha;
  assert.equal(criada.classe, "Mago");
  assert.deepEqual(criada.magias.map((m) => m.nome), ["Mãos Mágicas", "Raio de Gelo", "Mísseis Mágicos"]);
  assert.equal(criada.magias[2].descricao, "Dardos de luz azul.", "a descrição do tema fica");
  assert.deepEqual(criada.inventario.map((i) => [i.nome, i.qtd, i.tipo, i.efeito]),
    [["Grimório", 1, "equipamento", ""], ["Dinamite", 3, "outro", ""], ["Tônico de cura", 2, "pocao", "cura 2d4+2"]]);
  assert.deepEqual([criada.mana, criada.manaMax, criada.pv, criada.pvMax, criada.nivel, criada.pendencias], [7, 7, 7, 7, 1, null]);
  assert.match(registro.ultimoPrompt, /Mago: exatamente 3 magias, sendo 1 ou 2 truques/);
  assert.match(registro.ultimoPrompt, /SEMPRE com 2 Poções de cura/);

  // salva a ficha criada com um item e uma magia a mais: só o que o Mestre criou entra
  r = await post("/api/salvar-ficha", { codigo, ficha: { ...criada, inventario: [...criada.inventario, { nome: "Varinha do dragão", qtd: 1, tipo: "rapido", efeito: "cura 10d12+20" }],
    magias: [...criada.magias, { nome: "Bola de Fogo" }, { nome: "Sono" }] } }, mario);
  assert.deepEqual(r.d.ficha.inventario.map((i) => i.nome), ["Grimório", "Dinamite", "Tônico de cura"]);
  assert.deepEqual(r.d.ficha.magias.map((m) => m.nome), ["Mãos Mágicas", "Raio de Gelo", "Mísseis Mágicos"], "no máximo 3; Bola de Fogo é de 3º círculo");
  // pode tirar um item ou trocar uma magia por outra de nível 1 da classe
  r = await post("/api/salvar-ficha", { codigo, ficha: { ...criada, inventario: criada.inventario.slice(2), magias: [criada.magias[0], { nome: "Sono" }] } }, mario);
  assert.deepEqual(r.d.ficha.inventario.map((i) => i.nome), ["Tônico de cura"]);
  assert.deepEqual(r.d.ficha.magias.map((m) => m.nome), ["Mãos Mágicas", "Sono"]);
  // Guerreiro criado pelo Mestre: sem magias, com as 2 poções
  r = await post("/api/criar-personagem", { codigo, conceito: "um anão ferreiro" }, mario);
  assert.deepEqual([r.d.ficha.classe, r.d.ficha.magias, r.d.ficha.manaMax, qtdDe(r.d.ficha, "Poção de cura")], ["Guerreiro", [], 0, 2]);
});

// ── Conversão de fichas e mesas antigas ──

test("fichas e mesas antigas são convertidas na leitura, sem mexer no banco; as poções vêm uma vez só", async () => {
  const velha = { uid: mario.id, nome: "Thorin", classe: "Mago", raca: "Anão", atributos: { for: 10, des: 12, con: 12, int: 16, sab: 10, car: 8 }, pv: 3, xp: 40, nivel: 1,
    equipamento: ["Cajado", "Grimório"], magias: [{ nome: "Bola de Fogo", descricao: "Fogo de forja." }, { nome: "Voo do Corvo", descricao: "Asas negras." }],
    ataques: [{ nome: "Arco curto", bonus: 2, dano: "1d6" }], notas: "Notas antigas" };
  db.prepare("INSERT INTO mesas (codigo, dono, fase, dia, criadaEm) VALUES ('VELHA', ?, 'jogo', NULL, 1)").run(mario.id);
  db.prepare("INSERT INTO membros (codigo, uid, nome) VALUES ('VELHA', ?, 'Mário')").run(mario.id);
  db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES ('VELHA', ?, ?)").run(mario.id, JSON.stringify(velha));
  const combateVelho = combateFixo({ pjs: [mario], inimigos: [gob(0)], posicoes: { [mario.id]: [4, 12], ini_0: [4, 2] } });
  delete combateVelho.id;
  injetar("VELHA", combateVelho);

  const f = await fichaApi("VELHA", mario);
  assert.deepEqual(f.inventario, [
    { nome: "Cajado", qtd: 1, tipo: "equipamento", efeito: "", descricao: "" },
    { nome: "Grimório", qtd: 1, tipo: "equipamento", efeito: "", descricao: "" },
    { nome: "Poção de cura", qtd: 2, tipo: "pocao", efeito: "cura 2d4+2", descricao: R.POCAO_DE_CURA.descricao }]);
  assert.deepEqual(f.equipamento, ["Cajado", "Grimório", "Poção de cura (×2)"]);
  assert.deepEqual(f.magias, [
    { nome: "Bola de Fogo", circulo: 3, tipo: "dano", efeito: "8d6", alcance: "distancia", custo: 4, descricao: "Fogo de forja." },
    { nome: "Voo do Corvo", circulo: 1, tipo: "utilidade", efeito: "", alcance: "pessoal", custo: 2, descricao: "Asas negras." }]);
  assert.deepEqual([f.mana, f.manaMax, f.pv, f.xp, f.pendencias, f.anotacoes], [7, 7, 3, 40, null, "Notas antigas"]);
  assert.deepEqual(f.ataques, [{ nome: "Arco curto", bonus: 2, dano: "1d6", alcance: "distancia" }]);
  assert.deepEqual(await fichaApi("VELHA", mario), f, "a leitura é sempre igual");
  assert.equal(JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = 'VELHA'").get().dados).inventario, undefined, "nada foi gravado só por ler");
  const m = await estado("VELHA", mario);
  assert.equal(m.dia, 1);
  assert.deepEqual(m.combate.turno, { id: mario.id, acaoUsada: false, itemUsado: false });
  assert.ok(!("diaNarr" in m) && !("elementos" in m));
  // ao gravar, o inventário fica e as poções não são dadas de novo
  await post("/api/salvar-ficha", { codigo: "VELHA", ficha: { nome: "Thorin" } }, mario);
  assert.ok(Array.isArray(JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = 'VELHA'").get().dados).inventario));
  await usar("VELHA", mario, "Poção de cura");
  assert.equal(qtdDe(await fichaApi("VELHA", mario), "Poção de cura"), 1);
  // o Mestre consegue usar a magia antiga convertida (com mana)
  injetar("VELHA", { ...lerCombate("VELHA"), rodada: 9, turno: null });
  const r = await post("/api/agir", { codigo: "VELHA", texto: "Lanço a bola de fogo" }, mario);
  assert.equal(r.d.rolagem?.rotulo, "Bola de Fogo vs Goblin 1");
});

// ── Mestre: narração direta ──

test("prompt do Mestre: narração direta, limites de ação, formato com itens, novo dia e elementos; criação no formato novo", () => {
  const ficha = R.normalizarFicha({ nome: "Lia", classe: "Clérigo", atributos: { sab: 14 }, magias: [{ nome: "Palavra Curativa" }] }, "u1");
  const c = M.contexto({ fase: "jogo", tema: "classico", duracao: "curta", dia: 4, cena: "Ponte", elementos: JSON.stringify(["corda solta", "barril de óleo"]) }, [ficha], []);
  for (const trecho of ["De 1 a 3 frases curtas", "Não invente pessoas, objetos ou lugares", "Não repita o que já foi dito", "só usa o que está no próprio inventário",
    "não tem ou não encontra", "Dia na história: 4", "Elementos da cena atual (o que está visível e pode ser usado): corda solta; barril de óleo",
    "Mana 6/6.", "Palavra Curativa (1º círculo, custo 2, cura 1d4+3, à distância)", "Inventário: Poção de cura ×2 (cura 2d4+2).",
    '"itens":', '"novo_dia":', '"elementos":', "MAPA DE BATALHA", "ajuste_arco", "REFORÇOS", "SEGURANÇA", "TEMA DA AVENTURA"]) assert.ok(c.includes(trecho), `sem "${trecho}"`);
  assert.ok(!/cinco sentidos/i.test(c), "a regra antiga dos cinco sentidos saiu");
  const cr = M.promptCriacao("piratas", "um pirata");
  assert.match(cr, /"inventario":\[\{"nome":"str","qtd":N/);
  assert.match(cr, /Clérigo: exatamente 2 magias\. Lista: Chama Sagrada/);
});
