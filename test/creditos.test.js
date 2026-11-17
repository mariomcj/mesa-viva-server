/**
 * Créditos da mesa: só o líder paga, boas-vindas, bloqueio sem créditos, cortesia de combate,
 * pedidos confirmados no painel e créditos manuais. Servidor de verdade, banco temporário e Mestre falso.
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-creditos-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
delete process.env.COBRANCA_ATIVA;
delete process.env.CREDITOS_INICIAIS;
require("./mestre-falso");

// Cada chamada ao Mestre falso custa CUSTO.usd (como o provedor informa em usage.cost)
const CUSTO = { usd: 0.5 };
const falso = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const r = await falso(url, opts);
  if (!String(url).startsWith("https://openrouter.ai/api/v1/chat")) return r;
  const j = await r.json();
  j.usage = { prompt_tokens: 1000, completion_tokens: 200, cost: CUSTO.usd };
  return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
};

const CR = require("../creditos");
const { server, db } = require("../server");

let base, lia, rui, adm;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, admin } = {}) {
  const headers = { "Content-Type": "application/json", "x-app-versao": "2" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers["X-Admin-Token"] = admin;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const post = (rota, corpo, o = {}) => api("POST", rota, { ...o, corpo });
const get = (rota, o = {}) => api("GET", rota, o);
const put = (rota, corpo, o = {}) => api("PUT", rota, { ...o, corpo });

async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id, nome, email };
}
const ficha = (nome) => ({ nome, raca: "Humano", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado", bonus: 5, dano: "1d8+3" }] });
async function mesaEmJogo(dono, ...outros) {
  const { d } = await post("/api/mesa/criar", { nome: dono.nome }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of [dono, ...outros]) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: ficha(j.nome) }, { token: j.token });
  const r = await post("/api/comecar-aventura", { codigo: d.codigo }, { token: dono.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return d.codigo;
}
const saldoDe = (j) => db.prepare("SELECT saldo FROM creditos_saldos WHERE conta = ?").get(j.id)?.saldo;
const configurar = (c) => put("/api/admin/creditos/config", c, { admin: adm });

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  lia = await conta("Lia", "lia-cred@teste.com");
  rui = await conta("Rui", "rui-cred@teste.com");
  adm = (await post("/api/admin/login", { user: "admin", pass: "senha-do-admin-de-teste" })).d.token;
  assert.ok(adm);
});

test("unidade: configuração, sessões de jogo e preço sugerido", () => {
  const c = CR.normalizarConfig({ creditosIniciais: 500, creditoUsd: -1, cobrancaAtiva: "sim", instrucoes: "  Pix: chave  ",
    pacotes: [{ nome: "Mini", creditos: 2, preco: 5 }, { nome: "", creditos: 3 }, { nome: "Mini", creditos: 0 }, { id: "mini", nome: "Outro", creditos: 4, preco: 9 }] });
  assert.deepEqual([c.creditosIniciais, c.creditoUsd, c.cobrancaAtiva, c.instrucoes], [100, 0.001, false, "Pix: chave"]);
  assert.deepEqual(c.pacotes.map((p) => [p.id, p.nome, p.creditos]), [["mini", "Mini", 2], ["minix", "Outro", 4]]);
  assert.equal(CR.normalizarConfig({ pacotes: [] }).pacotes.length, 3, "lista vazia mantém os pacotes de antes");

  const min = 60_000;
  const s = CR.medirSessoes([
    { t: 0, codigo: "AAAAA", tipo: "texto", modelo: "deepseek/x", custo: 0.01 },
    { t: 10 * min, codigo: "AAAAA", tipo: "texto", modelo: "deepseek/x", custo: 0.01 },
    { t: 60 * min, codigo: "AAAAA", tipo: "imagem", modelo: "img", custo: 0.04, estimado: 1 },   // sessão nova (lacuna > 15 min), conta 3 min
    { t: 0, codigo: "BBBBB", tipo: "texto", modelo: "anthropic/claude-sonnet-5.5", custo: 0.02 },
  ].sort((a, b) => a.codigo.localeCompare(b.codigo) || a.t - b.t));
  assert.equal(s.sessoes, 3);
  assert.equal(s.mesas, 2);
  assert.equal(s.horas, Math.round(((10 + 3 + 3) / 60) * 100) / 100);
  assert.equal(s.caprichado.sessoes, 1);
  assert.equal(s.rapido.horas, Math.round((13 / 60) * 100) / 100);
  assert.equal(s.parteEstimada, Math.round((0.04 / 0.08) * 1000) / 1000);

  const p = CR.sugerirPrecos({ creditoUsd: 0.15, cambio: 5.5, margem: 3, taxa: 0 });
  assert.equal(p.porCredito, 2.47);
  assert.deepEqual(p.pacotes.map((x) => x.preco), [12.9, 26.9, 59.9]);
  assert.equal(CR.estimativa("texto", "anthropic/claude-sonnet-5.5") > CR.estimativa("texto", "deepseek/deepseek-v4-flash"), true);
});

test("cobrança desligada (padrão): mede no líder, não desconta e não bloqueia", async () => {
  const codigo = await mesaEmJogo(lia, rui);
  const r = await post("/api/agir", { codigo, texto: "olho a taverna" }, { token: rui.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  const linhas = db.prepare("SELECT uid, conta, cobrado FROM uso_ia_mesa WHERE codigo = ?").all(codigo);
  assert.ok(linhas.length >= 2);
  assert.ok(linhas.every((l) => l.conta === lia.id && l.cobrado === 0), "quem paga é sempre o líder, e nada é cobrado");
  assert.ok(linhas.some((l) => l.uid === rui.id), "a ação do convidado também conta na mesa do líder");
  const c = (await get("/api/conta/creditos", { token: lia.token })).d;
  assert.deepEqual([c.cobrancaAtiva, c.saldo, c.creditosIniciais, c.lojaAberta], [false, 3, 3, false]);
  assert.ok(c.extrato.some((e) => e.tipo === "boas-vindas" && e.quantidade === 3));
  assert.equal((await get(`/api/mesa/${codigo}`, { token: lia.token })).d.creditos, undefined, "sem cobrança a mesa não muda");
});

test("cobrança ligada: só o líder gasta; sem créditos o Mestre para (402) e o convidado vê o aviso do grupo", async () => {
  const codigo = await mesaEmJogo(lia, rui);
  assert.equal((await configurar({ cobrancaAtiva: true, creditoUsd: 0.25 })).st, 200);   // cada chamada (US$ 0,50) = 2 créditos
  const antesRui = (await get("/api/conta/creditos", { token: rui.token })).d.saldo;
  assert.equal(saldoDe(lia), 3);
  assert.equal((await post("/api/agir", { codigo, texto: "abro a porta" }, { token: rui.token })).st, 200);
  assert.equal(saldoDe(lia), 1);
  assert.equal((await post("/api/agir", { codigo, texto: "subo a escada" }, { token: lia.token })).st, 200, "com saldo positivo ainda pode");
  assert.equal(saldoDe(lia), 0);
  assert.equal((await get("/api/conta/creditos", { token: rui.token })).d.saldo, antesRui, "o convidado não gasta nada");

  const r1 = await post("/api/agir", { codigo, texto: "abro a janela" }, { token: rui.token });
  assert.equal(r1.st, 402);
  assert.equal(r1.d.semCreditos, true);
  assert.match(r1.d.error, /líder desta mesa/);
  const r2 = await post("/api/agir", { codigo, texto: "abro a janela" }, { token: lia.token });
  assert.equal(r2.st, 402);
  assert.match(r2.d.error, /Ajustes → Créditos/);
  assert.equal(mesaDbProc(codigo), null, "a mesa não fica travada");

  const mLia = (await get(`/api/mesa/${codigo}`, { token: lia.token })).d.creditos;
  const mRui = (await get(`/api/mesa/${codigo}`, { token: rui.token })).d.creditos;
  assert.deepEqual([mLia.lider, mLia.podeJogar, mLia.saldo], [true, false, 0]);
  assert.deepEqual([mRui.lider, mRui.podeJogar, mRui.saldo], [false, false, undefined]);
  assert.match(mRui.aviso, /líder/);

  // em combate, a luta termina por conta da casa
  db.prepare("UPDATE mesas SET combate = ? WHERE codigo = ?").run(JSON.stringify({ id: "x", rodada: 1, inimigos: [], ordem: [], vez: 0 }), codigo);
  const mc = (await get(`/api/mesa/${codigo}`, { token: rui.token })).d.creditos;
  assert.equal(mc.podeJogar, true);
  assert.match(mc.aviso, /por conta da casa/);
  db.prepare("UPDATE mesas SET combate = NULL WHERE codigo = ?").run(codigo);

  // o admin dá créditos pelo e-mail: o Mestre volta
  const dado = await post("/api/admin/creditos/adicionar", { conta: lia.email.toUpperCase(), quantidade: 5, motivo: "Cortesia de lançamento" }, { admin: adm });
  assert.equal(dado.st, 200, JSON.stringify(dado.d));
  assert.equal(dado.d.saldo, 5);
  assert.equal((await post("/api/agir", { codigo, texto: "abro a janela" }, { token: rui.token })).st, 200);
  const ext = (await get(`/api/admin/creditos/conta/${lia.id}`, { admin: adm })).d.extrato;
  assert.ok(ext.some((e) => e.tipo === "admin" && e.descricao === "Cortesia de lançamento" && e.quantidade === 5));
  assert.ok(ext.some((e) => e.tipo === "uso" && e.codigo === codigo));
  assert.equal((await post("/api/admin/creditos/adicionar", { conta: "ninguem@x.com", quantidade: 5 }, { admin: adm })).st, 404);
  assert.equal((await post("/api/admin/creditos/adicionar", { conta: lia.id, quantidade: 0 }, { admin: adm })).st, 400);
  assert.equal((await get("/api/admin/creditos")).st, 401, "o painel exige login");
  await configurar({ cobrancaAtiva: false });
});
const mesaDbProc = (codigo) => db.prepare("SELECT processando FROM mesas WHERE codigo = ?").get(codigo).processando;

test("pedidos: loja fechada sem instruções; pedir, cancelar, confirmar no painel e não creditar duas vezes", async () => {
  assert.equal((await post("/api/conta/creditos/pedido", { pacote: "aventura" }, { token: rui.token })).st, 409);
  await configurar({ instrucoes: "Pix: chave-de-teste. Coloque o código do pedido na descrição." });
  assert.equal((await post("/api/conta/creditos/pedido", { pacote: "nada" }, { token: rui.token })).st, 400);
  const p1 = await post("/api/conta/creditos/pedido", { pacote: "aventura" }, { token: rui.token });
  assert.equal(p1.st, 200, JSON.stringify(p1.d));
  assert.match(p1.d.pedido.id, /^MV-[A-Z2-9]{6}$/);
  assert.deepEqual([p1.d.pedido.estado, p1.d.pedido.creditos, p1.d.pedido.preco], ["aguardando", 12, 26.9]);
  assert.match(p1.d.instrucoes, /Pix/);
  const p2 = (await post("/api/conta/creditos/pedido", { pacote: "taverna" }, { token: rui.token })).d.pedido;
  await post("/api/conta/creditos/pedido", { pacote: "taverna" }, { token: rui.token });
  assert.equal((await post("/api/conta/creditos/pedido", { pacote: "taverna" }, { token: rui.token })).st, 429, "no máximo 3 esperando");
  assert.equal((await post(`/api/conta/creditos/pedido/${p2.id}/cancelar`, {}, { token: lia.token })).st, 404, "só o dono do pedido cancela");
  assert.equal((await post(`/api/conta/creditos/pedido/${p2.id}/cancelar`, {}, { token: rui.token })).st, 200);

  const painel = (await get("/api/admin/creditos", { admin: adm })).d;
  const noPainel = painel.pedidos.find((p) => p.id === p1.d.pedido.id);
  assert.deepEqual([noPainel.usuario, noPainel.email, noPainel.nome, noPainel.estado], ["Rui", rui.email, "Aventura", "aguardando"]);
  assert.equal(painel.totais.aguardando, 2);
  assert.ok(painel.consumo.horas > 0 && painel.consumo.custoHora > 0, JSON.stringify(painel.consumo));
  assert.ok(painel.sugestao.pacotes.length === 3);

  const antes = saldoDe(rui);
  const ok = await post(`/api/admin/creditos/pedidos/${p1.d.pedido.id}/confirmar`, {}, { admin: adm });
  assert.equal(ok.st, 200, JSON.stringify(ok.d));
  assert.equal(ok.d.pedido.estado, "pago");
  assert.equal(saldoDe(rui), antes + 12);
  assert.equal((await post(`/api/admin/creditos/pedidos/${p1.d.pedido.id}/confirmar`, {}, { admin: adm })).st, 409, "não credita duas vezes");
  assert.equal((await post(`/api/admin/creditos/pedidos/${p2.id}/confirmar`, {}, { admin: adm })).st, 409, "pedido cancelado não vira crédito");
  const c = (await get("/api/conta/creditos", { token: rui.token })).d;
  assert.ok(c.extrato.some((e) => e.tipo === "compra" && /Aventura/.test(e.descricao)));
  assert.equal(c.pedidos.find((p) => p.id === p1.d.pedido.id).estado, "pago");
  assert.equal((await get("/api/admin/creditos", { admin: adm })).d.totais.vendas.valor, 26.9);
});

test("configuração do painel fica salva e vale para contas novas", async () => {
  await configurar({ cobrancaAtiva: true, creditosIniciais: 0, pacotes: [{ nome: "Único", creditos: 10, preco: 20 }] });
  const cfg = (await get("/api/admin/creditos", { admin: adm })).d.config;
  assert.deepEqual([cfg.cobrancaAtiva, cfg.creditosIniciais, cfg.pacotes.length, cfg.pacotes[0].id], [true, 0, 1, "unico"]);
  const nova = await conta("Zeca", "zeca-cred@teste.com");
  assert.equal((await get("/api/conta/creditos", { token: nova.token })).d.saldo, 0, "boas-vindas zeradas no painel");
  await configurar({ cobrancaAtiva: false, creditosIniciais: 3 });
});
