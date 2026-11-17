/**
 * Sugestões dos jogadores: o app manda, o painel lê e marca como lida.
 * Servidor de verdade (banco temporário). Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-sugestoes-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
require("./mestre-falso");
const { server, db } = require("../server");
const SG = require("../sugestoes");

let base, ana, beto, adm;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, admin, cabecalhos } = {}) {
  const headers = { "Content-Type": "application/json", ...(cabecalhos || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers["x-admin-token"] = admin;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const conta = async (nome, email) => { const r = await api("POST", "/api/auth/registrar", { corpo: { nome, email, senha: "senha123" } }); return { token: r.d.token, id: r.d.usuario.id }; };

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ana = await conta("Ana", "ana-sug@teste.com");
  beto = await conta("Beto", "beto-sug@teste.com");
  adm = (await api("POST", "/api/admin/login", { corpo: { user: "admin", pass: "senha-do-admin-de-teste" } })).d.token;
});

test("conferir: limpa espaços, exige um mínimo e corta o contato", () => {
  assert.deepEqual(SG.conferir({ texto: "  Mais   temas\r\n\r\n\r\n\r\nde terror  " }), { texto: "Mais temas\n\nde terror", contato: "" });
  assert.ok(SG.conferir({ texto: "oi" }).erro);
  assert.ok(SG.conferir({ texto: 42 }).erro);
  assert.ok(SG.conferir({ texto: "x".repeat(SG.MAX + 1) }).erro);
  assert.equal(SG.conferir({ texto: "Gostei muito", contato: "a".repeat(200) }).contato.length, 120);
});

test("o jogador manda; o painel lista com nome, email e versão, marca como lida e desmarca", async () => {
  assert.equal((await api("POST", "/api/sugestao", { corpo: { texto: "Quero mais temas" } })).st, 401, "sem login, não");
  assert.equal((await api("POST", "/api/sugestao", { token: ana.token, corpo: { texto: "ok" } })).st, 400);
  const r = await api("POST", "/api/sugestao", { token: ana.token, corpo: { texto: "Quero um tema de faroeste!", contato: "@ana" }, cabecalhos: { "x-app-versao": "2", "x-idioma": "pt" } });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.ok(r.d.id > 0);

  assert.equal((await api("GET", "/api/admin/sugestoes", { token: ana.token })).st, 401, "jogador não lê o painel");
  let p = await api("GET", "/api/admin/sugestoes", { admin: adm });
  assert.equal(p.st, 200);
  assert.equal(p.d.naoLidas, 1);
  assert.deepEqual(
    (({ texto, contato, versao, idioma, lida, usuario, email }) => ({ texto, contato, versao, idioma, lida, usuario, email }))(p.d.sugestoes[0]),
    { texto: "Quero um tema de faroeste!", contato: "@ana", versao: "2", idioma: "pt", lida: false, usuario: "Ana", email: "ana-sug@teste.com" });

  assert.equal((await api("POST", `/api/admin/sugestoes/${r.d.id}/lida`, { admin: adm, corpo: { lida: true } })).st, 200);
  p = await api("GET", "/api/admin/sugestoes", { admin: adm });
  assert.deepEqual([p.d.naoLidas, p.d.sugestoes[0].lida], [0, true]);
  assert.equal((await api("POST", `/api/admin/sugestoes/${r.d.id}/lida`, { admin: adm, corpo: { lida: false } })).d.lida, false);
  assert.equal((await api("POST", "/api/admin/sugestoes/999999/lida", { admin: adm })).st, 404);
  assert.equal((await api("POST", "/api/admin/sugestoes/abc/lida", { admin: adm })).st, 400);
});

test("limite: até 5 por conta a cada 24 horas, sem atrapalhar as outras contas", async () => {
  for (let i = 0; i < SG.LIMITE_DIA; i++) assert.equal((await api("POST", "/api/sugestao", { token: beto.token, corpo: { texto: `Sugestão número ${i}` } })).st, 200);
  const r = await api("POST", "/api/sugestao", { token: beto.token, corpo: { texto: "Mais uma sugestão" } });
  assert.equal(r.st, 429);
  assert.match(r.d.erro || r.d.mensagem || JSON.stringify(r.d), /amanhã/);
  assert.equal((await api("POST", "/api/sugestao", { token: ana.token, corpo: { texto: "Ana ainda pode mandar" } })).st, 200);
  // a conta de Beto volta a poder quando as antigas passam de 24 horas
  db.prepare("UPDATE sugestoes SET t = t - 25 * 60 * 60 * 1000 WHERE uid = ?").run(beto.id);
  assert.equal((await api("POST", "/api/sugestao", { token: beto.token, corpo: { texto: "Voltei no outro dia" } })).st, 200);
});
