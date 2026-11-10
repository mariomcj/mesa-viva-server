/**
 * Testes das novidades (aventuras, saque, loja, descanso, diário, bestiário, salvamentos e epílogo),
 * com o servidor de verdade (banco temporário) e o Mestre falso. Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-novidades-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
delete process.env.ADMIN_PASS;
const { registro } = require("./mestre-falso");
const { server, db } = require("../server");
const AV = require("../aventuras");
const T = require("../temas");

let base, ana, beto;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, idioma } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idioma) headers["X-Idioma"] = idioma;
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
  return { token: r.d.token, id: r.d.usuario.id, nome };
}
const fichaBase = (nome) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }] });
const lerFicha = (codigo, uid) => JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, uid).dados);
const gravarFicha = (codigo, uid, muda) => {
  const f = lerFicha(codigo, uid); muda(f);
  db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify(f), codigo, uid);
};
const mesaDb = (codigo) => db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);

async function mesaPronta(jogadores, extra = {}) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome, ...extra }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, { token: j.token });
  return d.codigo;
}

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ana = await conta("Ana", "ana@novidades.br");
  beto = await conta("Beto", "beto@novidades.br");
});

// ── Biblioteca de aventuras ──
test("aventuras: 4 por tema, ids estáveis e textos nos dois idiomas", () => {
  assert.equal(AV.AVENTURAS.length, T.TEMAS.length * 4);
  for (const t of T.TEMAS) assert.equal(AV.AVENTURAS.filter((a) => a.tema === t.id).length, 4, t.id);
  assert.equal(new Set(AV.AVENTURAS.map((a) => a.id)).size, AV.AVENTURAS.length);
  for (const a of AV.AVENTURAS) {
    for (const k of ["nome", "resumo", "gancho", "nomeEn", "resumoEn"]) assert.ok(a[k] && typeof a[k] === "string", `${a.id}.${k}`);
    assert.ok(a.resumo.length <= 90 && a.resumoEn.length <= 90, `${a.id}: resumo longo`);
  }
  assert.equal(AV.aventuraDoTema("piratas:2", "piratas"), "piratas:2");
  assert.equal(AV.aventuraDoTema("piratas:2", "tronos"), null);
  assert.equal(AV.aventuraDoTema("", "tronos"), "");
});

test("GET /api/aventuras: com login, por tema, só id/nome/resumo, no idioma do aparelho", async () => {
  assert.equal((await get("/api/aventuras")).st, 401);
  const pt = await get("/api/aventuras", { token: ana.token });
  assert.equal(pt.st, 200);
  assert.equal(Object.keys(pt.d.aventuras).length, T.TEMAS.length);
  assert.deepEqual(Object.keys(pt.d.aventuras.piratas[0]), ["id", "nome", "resumo"]);
  assert.equal(pt.d.aventuras.classico[0].nome, "A Mina de Pedra-Funda");
  const en = await get("/api/aventuras", { token: ana.token, idioma: "en" });
  assert.equal(en.d.aventuras.classico[0].nome, "The Deepstone Mine");
});

test("mesa com aventura: grava, mostra o nome, troca só no saguão e usa o gancho como semente do arco", async () => {
  const codigo = await mesaPronta([ana], { tema: "piratas", aventura: "piratas:3" });
  assert.equal(mesaDb(codigo).aventura, "piratas:3");
  let m = await get(`/api/mesa/${codigo}`, { token: ana.token });
  assert.equal(m.d.aventura, "piratas:3");
  assert.equal(m.d.aventuraNome, "Motim no Gaivota Rubra");
  assert.equal((await get(`/api/mesa/${codigo}`, { token: ana.token, idioma: "en" })).d.aventuraNome, "Mutiny on the Red Gull");

  // aventura de outro tema é recusada; trocar o tema sem aventura volta para "o Mestre sorteia"
  assert.equal((await post("/api/configurar-mesa", { codigo, aventura: "tronos:1" }, { token: ana.token })).st, 400);
  assert.equal((await post("/api/configurar-mesa", { codigo, tema: "tronos" }, { token: ana.token })).st, 200);
  assert.equal(mesaDb(codigo).aventura, "");
  assert.equal((await post("/api/configurar-mesa", { codigo, tema: "piratas", aventura: "piratas:1" }, { token: ana.token })).st, 200);
  assert.equal(mesaDb(codigo).aventura, "piratas:1");

  const r = await post("/api/comecar-aventura", { codigo }, { token: ana.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.match(JSON.parse(mesaDb(codigo).arco).semente, /O Mapa nas Costas/);
  // depois de começar não troca mais; mandar a mesma de novo não é troca
  assert.equal((await post("/api/configurar-mesa", { codigo, aventura: "piratas:2" }, { token: ana.token })).st, 409);
  assert.equal((await post("/api/configurar-mesa", { codigo, aventura: "piratas:1" }, { token: ana.token })).st, 200);
});

test("mesa sem aventura: nada muda (semente sorteada do tema)", async () => {
  const codigo = await mesaPronta([ana], { tema: "piratas" });
  assert.equal(mesaDb(codigo).aventura, "");
  await post("/api/comecar-aventura", { codigo }, { token: ana.token });
  assert.ok(T.temaPorId("piratas").sementes.includes(JSON.parse(mesaDb(codigo).arco).semente));
});

// ── Ouro, saque, loja, descanso, crônica, salvamentos e epílogo ──
const NV = require("../novidades");
const R = require("../regras");

/** Leva uma mesa solo até a vitória num combate (dado sempre 20; os goblins ficam com 1 PV). */
async function vencerCombate(codigo, j) {
  const o = { token: j.token };
  await post("/api/agir", { codigo, texto: "Vejo um goblin sem mapa e ataco" }, o);
  for (let k = 0; k < 30; k++) {
    const m = mesaDb(codigo);
    const c = JSON.parse(m.combate || "null");
    if (!c) return;
    for (const i of c.inimigos) if (i.pv > 1) i.pv = 1;
    // o mapa é sorteado: põe os goblins ao lado do personagem, para o golpe corpo a corpo sempre alcançar
    const eu = c.posicoes?.[j.id], col = c.mapa?.colunas || 10;
    if (eu) c.inimigos.forEach((ini, n) => {
      if (c.posicoes[ini.id]) c.posicoes[ini.id] = n === 0 ? { x: eu.x, y: eu.y > 0 ? eu.y - 1 : eu.y + 1 } : { x: eu.x + 1 < col ? eu.x + 1 : eu.x - 1, y: eu.y };
    });
    db.prepare("UPDATE mesas SET combate = ? WHERE codigo = ?").run(JSON.stringify(c), codigo);
    gravarFicha(codigo, j.id, (f) => { f.pv = f.pvMax; f.inventario = []; });
    const r = await post("/api/agir", { codigo, texto: "Golpeio o goblin" }, o);
    assert.equal(r.st, 200, JSON.stringify(r.d));
    if (r.d.rolagem) await post("/api/rolar", { codigo, valor: 20 }, o);
  }
  assert.fail("o combate não terminou");
}
const sys = (codigo) => db.prepare("SELECT texto FROM log WHERE codigo = ? AND tipo IN ('sys','roll') ORDER BY id").all(codigo).map((e) => e.texto);

test("regras: raridade, saque e venda", () => {
  for (const n of [1, 3, 5, 8]) assert.equal(Object.values(NV.chancesDeRaridade(n)).reduce((a, b) => a + b, 0), 100);
  assert.equal(NV.sortearRaridade(1, () => 0), "comum");
  assert.equal(NV.sortearRaridade(1, () => 0.999), "raro");        // nível 1 nunca passa de raro
  assert.equal(NV.sortearRaridade(8, () => 0.999), "lendario");
  const guerreiro = NV.gerarSaque({ nivel: 1, classe: "Guerreiro" }, () => 0);
  assert.deepEqual(guerreiro.map((x) => x.tipo), ["item", "ouro", "item"]);
  assert.equal(guerreiro[0].item.nome, "Poção de cura");
  assert.equal(guerreiro[2].item.tipo, "outro");                     // relíquia para vender
  assert.match(NV.gerarSaque({ nivel: 1, classe: "Mago" }, () => 0)[2].item.efeito, /^mana /);
  // todo item do saque e da loja passa pela validação de item do jogo sem perder nada
  for (const it of [...Object.values(NV.POCOES), ...Object.values(NV.TONICOS), ...NV.LOJA.map((l) => l.item)]) {
    const n = R.normalizarItem({ ...it, qtd: 1, raridade: "raro" });
    assert.equal(n.efeito, it.efeito, it.nome);
    assert.equal(n.raridade, "raro");
  }
  assert.equal(R.normalizarItem({ nome: "Corda", tipo: "equipamento" }).raridade, undefined);   // item antigo fica como era
  assert.equal(R.efeitoDeItem("mana 4"), "mana 4");
  assert.equal(R.efeitoDeItem("mana 99"), null);
  assert.equal(NV.valorDeVenda({ nome: "Estatueta de jade" }), 70);
  assert.equal(NV.valorDeVenda({ nome: "Poção de cura" }), 10);
  assert.equal(NV.valorDeVenda({ nome: "Corda" }), 0);
  assert.equal(NV.especie("Goblin 2"), "Goblin");
});

test("ficha: ouro inicial, e o celular não consegue mudar o ouro", async () => {
  const codigo = await mesaPronta([ana]);
  assert.equal(lerFicha(codigo, ana.id).ouro, R.OURO_INICIAL);
  const r = await post("/api/salvar-ficha", { codigo, ficha: { ...fichaBase("Ana"), ouro: 9999 } }, { token: ana.token });
  assert.equal(r.d.ficha.ouro, R.OURO_INICIAL);
  await post("/api/comecar-aventura", { codigo }, { token: ana.token });
  const r2 = await post("/api/salvar-ficha", { codigo, ficha: { ...fichaBase("Ana"), ouro: 9999 } }, { token: ana.token });
  assert.equal(r2.d.ficha.ouro, R.OURO_INICIAL);
});

test("vitória: ouro, saque para escolher uma opção e bestiário", async () => {
  const codigo = await mesaPronta([ana, beto]);
  const o = { token: ana.token };
  await post("/api/comecar-aventura", { codigo }, o);
  assert.equal((await get(`/api/mesa/${codigo}`, o)).d.saque, null);
  gravarFicha(codigo, beto.id, (f) => { f.pv = 0; });               // Beto caído: fica fora da ordem e do saque
  await vencerCombate(codigo, ana);
  assert.ok(sys(codigo).some((t) => /^Combate encerrado\. Vitória/.test(t)));
  assert.ok(sys(codigo).some((t) => /^Ouro encontrado: Ana \+\d+/.test(t)));
  assert.ok(lerFicha(codigo, ana.id).ouro > R.OURO_INICIAL);
  assert.equal(lerFicha(codigo, beto.id).ouro, R.OURO_INICIAL);

  // cada um só vê o próprio saque; o bestiário não vai na mesa
  const m = (await get(`/api/mesa/${codigo}`, o)).d;
  assert.equal(m.saque.length, 3);
  assert.equal(m.bestiario, undefined);
  assert.equal((await get(`/api/mesa/${codigo}`, { token: beto.token })).d.saque, null);
  assert.equal((await post("/api/saque", { codigo, indice: 0 }, { token: beto.token })).st, 409);
  assert.equal((await post("/api/saque", { codigo, indice: 7 }, o)).st, 400);

  const ouroAntes = lerFicha(codigo, ana.id).ouro;
  const r = await post("/api/saque", { codigo, indice: 0 }, o);        // a poção
  assert.equal(r.st, 200, JSON.stringify(r.d));
  const f = lerFicha(codigo, ana.id);
  const pocao = f.inventario.find((i) => i.tipo === "pocao");
  assert.ok(pocao && NV.RARIDADES.includes(pocao.raridade));
  assert.equal(f.ouro, ouroAntes);
  assert.equal((await get(`/api/mesa/${codigo}`, o)).d.saque, null);
  assert.equal((await post("/api/saque", { codigo, indice: 1 }, o)).st, 409);   // só uma escolha

  const cr = (await get(`/api/mesa/${codigo}/cronica`, o)).d;
  assert.deepEqual(cr.bestiario.map((b) => [b.nome, b.vistos, b.derrotados]), [["Goblin", 2, 2]]);
  assert.ok(cr.bestiario[0].pvMax > 0 && cr.bestiario[0].ca > 0);
  assert.ok(cr.marcos.some((x) => x.tipo === "combate"));
  assert.ok(cr.marcos.some((x) => x.tipo === "historia" && /^Ato 1/.test(x.texto)));
});

test("loja: comprar, vender, estalagem; fechada no saguão e em combate", async () => {
  const codigo = await mesaPronta([ana]);
  const o = { token: ana.token };
  assert.equal((await post("/api/loja/comprar", { codigo, id: "pocao" }, o)).st, 409);   // ainda no saguão
  await post("/api/comecar-aventura", { codigo }, o);
  gravarFicha(codigo, ana.id, (f) => { f.ouro = 100; f.inventario = [{ nome: "Estatueta de jade", qtd: 1, tipo: "outro" }]; f.pv = 3; });

  const loja = (await get(`/api/mesa/${codigo}/loja`, o)).d;
  assert.equal(loja.ouro, 100);
  assert.equal(loja.aberta, true);
  assert.ok(loja.itens.some((i) => i.id === "pocao" && i.preco === 25));
  assert.deepEqual(loja.vender.map((v) => [v.item, v.valor]), [["Estatueta de jade", 70]]);
  assert.equal((await get(`/api/mesa/${codigo}/loja`, { ...o, idioma: "en" })).d.itens.find((i) => i.id === "pocao").nome, "Healing potion");

  assert.equal((await post("/api/loja/comprar", { codigo, id: "pocao" }, o)).d.ouro, 75);
  assert.equal((await post("/api/loja/comprar", { codigo, id: "nada" }, o)).st, 400);
  assert.equal((await post("/api/loja/comprar", { codigo, id: "pocao-superior" }, o)).st, 409);   // falta ouro
  assert.equal((await post("/api/loja/vender", { codigo, item: "Estatueta de jade" }, o)).d.ouro, 145);
  assert.equal((await post("/api/loja/vender", { codigo, item: "Estatueta de jade" }, o)).st, 409);

  const est = await post("/api/loja/comprar", { codigo, id: "estalagem" }, o);
  assert.equal(est.st, 200);
  const f = lerFicha(codigo, ana.id);
  assert.equal(f.pv, f.pvMax);
  assert.equal(f.ouro, 145 - NV.precoDaEstalagem(f));
  assert.equal((await post("/api/loja/comprar", { codigo, id: "estalagem" }, o)).st, 409);        // já descansado
  assert.deepEqual(f.inventario.map((i) => [i.nome, i.qtd, i.raridade]), [["Poção de cura", 1, "comum"]]);

  // a poção comprada funciona no sistema de itens que já existia
  gravarFicha(codigo, ana.id, (x) => { x.pv = 1; });
  assert.equal((await post("/api/usar-item", { codigo, item: "Poção de cura" }, o)).st, 200);
  assert.ok(lerFicha(codigo, ana.id).pv > 1);

  await post("/api/agir", { codigo, texto: "Vejo um goblin sem mapa" }, o);
  assert.equal((await post("/api/loja/comprar", { codigo, id: "pocao" }, o)).st, 409);
  assert.equal((await get(`/api/mesa/${codigo}/loja`, o)).d.aberta, false);
});

test("descanso curto: uma vez por ato, metade da vida", async () => {
  const codigo = await mesaPronta([ana]);
  const o = { token: ana.token };
  await post("/api/comecar-aventura", { codigo }, o);
  assert.equal((await post("/api/descanso-curto", { codigo }, o)).st, 409);        // vida cheia
  gravarFicha(codigo, ana.id, (f) => { f.pv = 1; });
  const pvMax = lerFicha(codigo, ana.id).pvMax;
  const r = await post("/api/descanso-curto", { codigo }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.pv, Math.ceil(pvMax / 2));
  assert.equal(lerFicha(codigo, ana.id).pv, 1 + Math.ceil(pvMax / 2));
  gravarFicha(codigo, ana.id, (f) => { f.pv = 1; });
  assert.equal((await post("/api/descanso-curto", { codigo }, o)).st, 409);        // já usou neste ato
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);            // ato 2
  assert.equal((await post("/api/descanso-curto", { codigo }, o)).st, 200);
});

test("pontos de salvamento: um por ato, manual só do dono, voltar desfaz o que veio depois", async () => {
  const codigo = await mesaPronta([ana, beto]);
  const o = { token: ana.token };
  await post("/api/comecar-aventura", { codigo }, o);
  let cr = (await get(`/api/mesa/${codigo}/cronica`, o)).d;
  assert.deepEqual(cr.salvamentos.map((s) => s.rotulo), ["Ato 1 — A Chegada"]);
  assert.equal(cr.podeRestaurar, true);
  assert.equal((await get(`/api/mesa/${codigo}/cronica`, { token: beto.token })).d.podeRestaurar, false);
  const ponto1 = cr.salvamentos[0].id;

  gravarFicha(codigo, ana.id, (f) => { f.ouro = 500; });
  await post("/api/agir", { codigo, texto: "Eu cumpro o objetivo" }, o);            // ato 2: ponto novo
  cr = (await get(`/api/mesa/${codigo}/cronica`, o)).d;
  assert.deepEqual(cr.salvamentos.map((s) => s.rotulo), ["Ato 2 — O Cerco", "Ato 1 — A Chegada"]);
  assert.equal((await post("/api/salvamento/criar", { codigo }, { token: beto.token })).st, 403);
  assert.equal((await post("/api/salvamento/criar", { codigo }, o)).st, 200);
  assert.equal((await post("/api/salvamento/restaurar", { codigo, id: ponto1 }, { token: beto.token })).st, 403);
  assert.equal((await post("/api/salvamento/restaurar", { codigo, id: 999999 }, o)).st, 404);

  const logNoPonto1 = db.prepare("SELECT logId FROM salvamentos WHERE id = ?").get(ponto1).logId;
  const r = await post("/api/salvamento/restaurar", { codigo, id: ponto1 }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(mesaDb(codigo).ato, 1);
  assert.equal(lerFicha(codigo, ana.id).ouro, R.OURO_INICIAL);
  const depois = db.prepare("SELECT texto FROM log WHERE codigo = ? AND id > ?").all(codigo, logNoPonto1).map((e) => e.texto);
  assert.deepEqual(depois, ["O grupo voltou ao ponto de salvamento: Ato 1 — A Chegada."]);
  assert.deepEqual((await get(`/api/mesa/${codigo}/cronica`, o)).d.salvamentos.map((s) => s.id), [ponto1]);
  // e a história segue normalmente dali
  assert.equal((await post("/api/agir", { codigo, texto: "Olho em volta" }, o)).st, 200);
});

test("epílogo: só depois do fim, uma entrada por personagem, guardado na mesa", async () => {
  const codigo = await mesaPronta([ana, beto]);
  const o = { token: ana.token };
  await post("/api/comecar-aventura", { codigo }, o);
  assert.equal((await post("/api/epilogo", { codigo }, o)).st, 409);
  for (const t of ["Eu cumpro o objetivo", "Eu cumpro o objetivo", "Eu encerro a história"]) await post("/api/agir", { codigo, texto: t }, o);
  const r = await post("/api/epilogo", { codigo }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.epilogo.geral.length > 0);
  assert.deepEqual(r.d.epilogo.personagens.map((p) => p.nome).sort(), ["Ana", "Beto"]);
  assert.match(registro.ultimoPrompt, /EPÍLOGO/);
  const m = (await get(`/api/mesa/${codigo}`, { token: beto.token })).d;
  assert.deepEqual(m.epilogo, r.d.epilogo);
  // pedir de novo devolve o mesmo, sem chamar o Mestre outra vez
  registro.ultimoPrompt = "";
  assert.deepEqual((await post("/api/epilogo", { codigo }, { token: beto.token })).d.epilogo, r.d.epilogo);
  assert.equal(registro.ultimoPrompt, "");
  // reiniciar a mesa apaga saque, bestiário, epílogo e pontos de salvamento
  await post("/api/reiniciar-mesa", { codigo }, o);
  const cr = (await get(`/api/mesa/${codigo}/cronica`, o)).d;
  assert.deepEqual([cr.epilogo, cr.salvamentos.length, cr.bestiario.length], [null, 0, 0]);
});
