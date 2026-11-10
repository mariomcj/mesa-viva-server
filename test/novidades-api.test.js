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
