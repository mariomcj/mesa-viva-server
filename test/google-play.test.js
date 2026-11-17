/**
 * Compras pela Google Play: o servidor confere a compra na Google Play Developer API, credita uma vez só,
 * consome a compra e recusa compra de outra conta. A Google é simulada (OAuth e androidpublisher), sem internet.
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-gplay-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
delete process.env.COBRANCA_ATIVA;
delete process.env.GOOGLE_PLAY_PACKAGE;

// conta de serviço de mentira, com uma chave gerada agora
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = JSON.stringify({
  client_email: "teste@projeto-teste.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
require("./mestre-falso");

// A Google Play simulada: compras por token
const COMPRAS = new Map();
const CHAMADAS = { oauth: 0, consumir: [], conferir: 0, falharConsumo: false };
const original = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === "https://oauth2.googleapis.com/token") {
    CHAMADAS.oauth++;
    const jwt = new URLSearchParams(opts.body).get("assertion");
    const [cab, corpo, ass] = jwt.split(".");
    const valido = crypto.createVerify("RSA-SHA256").update(`${cab}.${corpo}`).verify(publicKey, Buffer.from(ass, "base64url"));
    const c = JSON.parse(Buffer.from(corpo, "base64url").toString());
    if (!valido || c.scope !== "https://www.googleapis.com/auth/androidpublisher") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    return new Response(JSON.stringify({ access_token: "token-de-acesso", expires_in: 3600 }), { status: 200 });
  }
  const m = u.match(/^https:\/\/androidpublisher\.googleapis\.com\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/products\/([^/]+)\/tokens\/([^/:]+)(:consume)?$/);
  if (m) {
    assert.equal(opts.headers.Authorization, "Bearer token-de-acesso");
    assert.equal(decodeURIComponent(m[1]), "mesa.viva");
    const compra = COMPRAS.get(decodeURIComponent(m[3]));
    if (!compra || compra.produto !== decodeURIComponent(m[2])) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    if (m[4]) {
      if (CHAMADAS.falharConsumo) return new Response("{}", { status: 503 });
      CHAMADAS.consumir.push(decodeURIComponent(m[3]));
      compra.consumptionState = 1;
      return new Response(null, { status: 204 });
    }
    CHAMADAS.conferir++;
    return new Response(JSON.stringify({ kind: "androidpublisher#productPurchase", orderId: compra.orderId, purchaseState: compra.estado,
      consumptionState: compra.consumptionState || 0, obfuscatedExternalAccountId: compra.conta }), { status: 200 });
  }
  return original(url, opts);
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
async function conta(nome, email) {
  const r = await post("/api/auth/registrar", { nome, email, senha: "senha123" });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return { token: r.d.token, id: r.d.usuario.id };
}
const saldoDe = (j) => db.prepare("SELECT saldo FROM creditos_saldos WHERE conta = ?").get(j.id)?.saldo;
const comprar = (j, produto, token) => post("/api/conta/creditos/google", { produto, token }, { token: j.token });

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  lia = await conta("Lia", "lia-gplay@teste.com");
  rui = await conta("Rui", "rui-gplay@teste.com");
  adm = (await post("/api/admin/login", { user: "admin", pass: "senha-do-admin-de-teste" })).d.token;
});

test("vendas pela Google Play: desligadas por padrão; o painel liga e o pedido manual some do app", async () => {
  const painel = (await get("/api/admin/creditos", { admin: adm })).d;
  assert.deepEqual(painel.googlePlay, { configurado: true, pacote: "mesa.viva" });
  assert.equal(painel.config.vendasGooglePlay, false);
  assert.deepEqual(painel.config.pacotes.map((p) => p.produto), ["creditos_taverna_5", "creditos_aventura_12", "creditos_campanha_30"]);
  await api("PUT", "/api/admin/creditos/config", { admin: adm, corpo: { instrucoes: "Pix: chave-de-teste" } });
  let c = (await get("/api/conta/creditos", { token: lia.token })).d;
  assert.deepEqual([c.googlePlay.ativo, c.lojaAberta], [false, true]);
  assert.equal(c.googlePlay.conta, CR.contaOfuscada(lia.id));
  assert.match(c.googlePlay.conta, /^[0-9a-f]{64}$/, "sem e-mail nem ID na Google");

  const r = await api("PUT", "/api/admin/creditos/config", { admin: adm, corpo: { vendasGooglePlay: true } });
  assert.equal(r.st, 200);
  assert.equal(r.d.config.cobrancaAtiva, false, "ligar as vendas não liga a cobrança");
  c = (await get("/api/conta/creditos", { token: lia.token })).d;
  assert.deepEqual([c.googlePlay.ativo, c.lojaAberta, c.instrucoes], [true, false, ""]);
  assert.equal((await post("/api/conta/creditos/pedido", { pacote: "aventura" }, { token: lia.token })).st, 409, "sem pedido manual com a Google Play ligada");
});

test("compra paga: confere, credita uma vez só, consome e aparece no painel", async () => {
  COMPRAS.set("tok-lia-1", { produto: "creditos_aventura_12", orderId: "GPA.1111-2222-3333-44444", estado: 0, conta: CR.contaOfuscada(lia.id) });
  const antes = saldoDe(lia);
  const r = await comprar(lia, "creditos_aventura_12", "tok-lia-1");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.saldo, antes + 12);
  assert.ok(r.d.extrato.some((e) => e.tipo === "compra" && e.descricao === "Pacote Aventura (Google Play)" && e.quantidade === 12));
  assert.deepEqual(CHAMADAS.consumir, ["tok-lia-1"]);

  const de_novo = await comprar(lia, "creditos_aventura_12", "tok-lia-1");
  assert.deepEqual([de_novo.st, de_novo.d.repetida, saldoDe(lia)], [200, true, antes + 12], "o mesmo token não credita duas vezes");
  assert.equal((await comprar(rui, "creditos_aventura_12", "tok-lia-1")).st, 409, "o token de outra conta é recusado");
  // duas chamadas ao mesmo tempo com um token novo: credita uma vez
  COMPRAS.set("tok-lia-2", { produto: "creditos_taverna_5", orderId: "GPA.2", estado: 0, conta: CR.contaOfuscada(lia.id) });
  const [a, b] = await Promise.all([comprar(lia, "creditos_taverna_5", "tok-lia-2"), comprar(lia, "creditos_taverna_5", "tok-lia-2")]);
  assert.deepEqual([a.st, b.st], [200, 200]);
  assert.equal(saldoDe(lia), antes + 17);

  const painel = (await get("/api/admin/creditos", { admin: adm })).d;
  assert.equal(painel.google.length, 2);
  assert.deepEqual([painel.google[1].pedido, painel.google[1].pacote, painel.google[1].usuario, painel.google[1].consumida], ["GPA.1111-2222-3333-44444", "Aventura", "Lia", true]);
  assert.equal(painel.totais.vendas.valor, 26.9 + 12.9);
  assert.equal(CHAMADAS.oauth, 1, "o token de acesso da Google fica guardado");
});

test("compra pendente, cancelada, de outra conta, desconhecida ou com produto trocado não credita", async () => {
  const antes = saldoDe(rui) ?? 3;
  COMPRAS.set("tok-pend", { produto: "creditos_taverna_5", orderId: "GPA.P", estado: 2, conta: CR.contaOfuscada(rui.id) });
  const p = await comprar(rui, "creditos_taverna_5", "tok-pend");
  assert.deepEqual([p.st, p.d.pendente], [202, true]);
  COMPRAS.set("tok-canc", { produto: "creditos_taverna_5", orderId: "GPA.C", estado: 1, conta: CR.contaOfuscada(rui.id) });
  assert.equal((await comprar(rui, "creditos_taverna_5", "tok-canc")).st, 402);
  COMPRAS.set("tok-outra", { produto: "creditos_taverna_5", orderId: "GPA.O", estado: 0, conta: CR.contaOfuscada(lia.id) });
  assert.equal((await comprar(rui, "creditos_taverna_5", "tok-outra")).st, 403, "comprada pela conta da Lia");
  assert.equal((await comprar(rui, "creditos_taverna_5", "tok-que-nao-existe")).st, 400);
  assert.equal((await comprar(rui, "creditos_campanha_30", "tok-pend")).st, 400, "token de outro produto");
  assert.equal((await comprar(rui, "produto_que_nao_vende", "tok-pend")).st, 400);
  assert.equal((await comprar(rui, "creditos_taverna_5", "")).st, 400);
  assert.equal((await comprar(rui, "creditos_taverna_5", "x".repeat(5000))).st, 400);
  assert.equal(saldoDe(rui) ?? 3, antes);
  // a pendente foi paga depois: o app manda de novo e agora credita
  COMPRAS.get("tok-pend").estado = 0;
  const pago = await comprar(rui, "creditos_taverna_5", "tok-pend");
  assert.equal(pago.st, 200);
  assert.equal(saldoDe(rui), antes + 5);
});

test("vendas desligadas: compra já feita ainda é creditada; consumo que falhou fica pendente", async () => {
  await api("PUT", "/api/admin/creditos/config", { admin: adm, corpo: { vendasGooglePlay: false } });
  const c = (await get("/api/conta/creditos", { token: rui.token })).d;
  assert.deepEqual([c.googlePlay.ativo, c.lojaAberta], [false, true], "o pedido manual volta");
  CHAMADAS.falharConsumo = true;
  COMPRAS.set("tok-tarde", { produto: "creditos_campanha_30", orderId: "GPA.T", estado: 0, conta: CR.contaOfuscada(rui.id) });
  const antes = saldoDe(rui);
  const r = await comprar(rui, "creditos_campanha_30", "tok-tarde");
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(saldoDe(rui), antes + 30, "o jogador recebe mesmo se a Google não confirmar o consumo");
  assert.equal(db.prepare("SELECT consumida FROM creditos_google WHERE token = 'tok-tarde'").get().consumida, 0);
  CHAMADAS.falharConsumo = false;
  // produto renomeado no painel: o ID do Play Console é o que vale
  const cfg = await api("PUT", "/api/admin/creditos/config", { admin: adm, corpo: { pacotes: [{ id: "taverna", nome: "Taverna", creditos: 5, preco: 12.9, produto: " Creditos.Taverna_V2 " }, { nome: "Sem ID", creditos: 2, preco: 5, produto: "inválido!" }] } });
  assert.deepEqual(cfg.d.config.pacotes.map((p) => p.produto), ["creditos.taverna_v2", "creditos_semid"]);
});

test("unidade: cliente da Google Play sem conta de serviço fica desligado", () => {
  const { criarGooglePlay, lerContaServico } = require("../google-play");
  assert.equal(criarGooglePlay({ contaServico: "" }), null);
  assert.equal(lerContaServico("{\"client_email\":\"x\"}"), null, "sem chave privada");
  assert.equal(lerContaServico(path.join(pasta, "nao-existe.json")), null);
  assert.equal(CR.idProdutoValido("Creditos_X"), "creditos_x");
  assert.equal(CR.idProdutoValido("_x"), "");
});
