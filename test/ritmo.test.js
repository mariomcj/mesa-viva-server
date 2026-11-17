/**
 * Ritmo da mesa: ganchos nas regras do Mestre, empurrão quando a história empaca e evento de mesa parada.
 * Servidor de verdade (banco temporário) com o Mestre falso. Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-ritmo-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
const { registro } = require("./mestre-falso");

// O evento de mesa parada tenta trazer combate, teste e itens: nada disso pode passar
const falso = globalThis.fetch;
const eventosPedidos = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://openrouter.ai/api/v1/chat")) {
    const prompt = JSON.parse(opts.body).messages.map((x) => x.content).join("\n");
    if (prompt.includes("Ninguém age há alguns minutos")) {
      eventosPedidos.push(prompt);
      const r = { narracao: "Um corvo pousa no balcão com um bilhete preso à pata.", elementos: ["corvo com bilhete"],
        combate: { inimigos: [{ nome: "Corvo", pv: 3, ca: 10, ataque: 1, dano: "1d1", des: 1 }] },
        teste: { tipo: "pericia", pericia: "Percepção", cd: 10, motivo: "x" }, itens: [{ alvo: "x", ganha: { nome: "Ouro", qtd: 1, tipo: "outro" } }], ato: 2, fim: true };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(r) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  return falso(url, opts);
};
const { server, db, ritmo } = require("../server");
const RT = require("../ritmo");
const M = require("../mestre");

let base, ana, adm;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, admin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers["x-admin-token"] = admin;
  const r = await fetch(base + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}
const post = (rota, corpo, o = {}) => api("POST", rota, { ...o, corpo });
const ficha = (nome) => ({ nome, raca: "Humano", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }] });
async function mesaEmJogo(j) {
  const { d } = await post("/api/mesa/criar", { nome: j.nome }, { token: j.token });
  await post("/api/salvar-ficha", { codigo: d.codigo, ficha: ficha(j.nome) }, { token: j.token });
  const r = await post("/api/comecar-aventura", { codigo: d.codigo }, { token: j.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return d.codigo;
}
const agir = async (codigo, texto) => { const r = await post("/api/agir", { codigo, texto }, { token: ana.token }); assert.equal(r.st, 200, JSON.stringify(r.d)); };
const estado = (codigo) => ritmo().ler(codigo);
const narracoes = (codigo) => db.prepare("SELECT texto FROM log WHERE codigo = ? AND tipo = 'narr' ORDER BY id").all(codigo).map((r) => r.texto);
const esperar = async (cond, ms = 3000) => { const fim = Date.now() + ms; while (!cond()) { if (Date.now() > fim) throw new Error("tempo esgotado"); await new Promise((ok) => setTimeout(ok, 20)); } };

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await post("/api/auth/registrar", { nome: "Ana", email: "ana-ritmo@teste.com", senha: "senha123" });
  ana = { token: r.d.token, id: r.d.usuario.id, nome: "Ana" };
  adm = (await post("/api/admin/login", { user: "admin", pass: "senha-do-admin-de-teste" })).d.token;
});

test("regras do Mestre: cada narração fecha com um gancho, e falha nunca é beco sem saída", () => {
  assert.match(M.REGRAS, /GANCHOS \(a história nunca para\)/);
  assert.match(M.REGRAS, /Falha que avança/);
  assert.doesNotMatch(M.REGRAS, /o que mudou na cena\. Nada mais\./);
  assert.match(M.REGRAS, /Não pergunte o que os personagens fazem/);          // o gancho é o mundo chamando, não uma pergunta
  assert.match(M.FORMATO, /na última frase, o gancho/);
});

test("ação vaga: reconhece quem está perdido e deixa passar ações com intenção", () => {
  for (const t of ["Olho em volta.", "eu espero", "O que eu faço?", "não sei", "Sigo em frente", "look around", "Investigo", "procuro pistas", ""])
    assert.equal(RT.acaoVaga(t), true, t);
  for (const t of ["Pergunto a Odila sobre a mina", "Ataco o goblin com o machado", "Olho em volta procurando a saída secreta atrás do quadro da lareira", "Sigo o rastro de sangue até o rio"])
    assert.equal(RT.acaoVaga(t), false, t);
});

test("progresso: cena nova, virada, rumo, combate, item ganho e votação contam; repetir a cena não", () => {
  const mesa = { cena: "Taverna Javali Cego" };
  assert.equal(RT.houveProgresso(mesa, { narracao: "x", cena: "Taverna Javali Cego" }), false);
  assert.equal(RT.houveProgresso(mesa, { narracao: "x", cena: "taverna javali cego" }), false);
  assert.equal(RT.houveProgresso(mesa, { narracao: "x", elementos: ["algo novo"] }), false);
  assert.equal(RT.houveProgresso(mesa, { narracao: "x", itens: [{ alvo: "a", perde: { nome: "Corda", qtd: 1 } }] }), false);
  for (const r of [{ cena: "Mina" }, { ato: 2 }, { fim: true }, { novo_dia: true }, { ajuste_arco: "O vilão foge." }, { combate: { inimigos: [{ nome: "G" }] } },
    { itens: [{ alvo: "a", ganha: { nome: "Ouro" } }] }, { votacao: { pergunta: "?", opcoes: ["a", "b"] } }])
    assert.equal(RT.houveProgresso(mesa, { narracao: "x", ...r }), true, JSON.stringify(r));
});

test("limites e textos: duração curta empurra antes da campanha; o evento não traz combate nem teste", () => {
  assert.equal(RT.parada({ semAvanco: 4, vagas: 0 }, "curta"), false);
  assert.equal(RT.parada({ semAvanco: 5, vagas: 0 }, "curta"), true);
  assert.equal(RT.parada({ semAvanco: 5, vagas: 0 }, "campanha"), false);
  assert.equal(RT.parada({ semAvanco: 0, vagas: 2 }, "campanha"), true);
  assert.match(RT.blocoParado({ semAvanco: 0, vagas: 2 }, "curta"), /ações foram vagas/);
  assert.deepEqual(Object.keys(RT.limparEvento({ narracao: "a", combate: {}, teste: {}, itens: [], efeitos: [], ato: 2, fim: true, novo_dia: true, votacao: {}, cena: "c" })).sort(), ["cena", "narracao"]);
  assert.equal(RT.limparEvento({ narracao: "  " }), null);
  assert.equal(RT.limparEvento("texto"), null);
  assert.deepEqual(RT.normalizarConfig({ eventoMinutos: 99 }), { eventoAtivo: true, eventoMinutos: 30 });
  assert.deepEqual(RT.normalizarConfig({ eventoAtivo: "0", eventoMinutos: 1 }), { eventoAtivo: false, eventoMinutos: 2 });
});

test("empurrão: depois de 5 narrações sem a história andar, o Mestre recebe a ordem de o mundo agir, uma vez", async () => {
  const codigo = await mesaEmJogo(ana);
  await agir(codigo, "Entro na taverna");                         // o Mestre falso troca a cena: conta como avanço
  assert.equal(estado(codigo).semAvanco, 0);
  for (let i = 1; i <= 5; i++) {
    await agir(codigo, `Converso com o taverneiro sobre o tempo ${i}`);
    assert.doesNotMatch(registro.ultimoPrompt, /MESA PARADA/, `narração ${i}`);
  }
  assert.equal(estado(codigo).semAvanco, 5);
  await agir(codigo, "Converso com o taverneiro de novo");
  assert.match(registro.ultimoPrompt, /MESA PARADA \(só você sabe\): há 5 narrações/);
  assert.match(registro.ultimoPrompt, /faça o mundo agir/);
  assert.deepEqual([estado(codigo).semAvanco, estado(codigo).empurroes], [0, 1]);
  await agir(codigo, "Peço uma bebida");
  assert.doesNotMatch(registro.ultimoPrompt, /MESA PARADA/);
});

test("empurrão: duas ações vagas seguidas já bastam; uma ação com intenção zera a conta", async () => {
  const codigo = await mesaEmJogo(ana);
  await agir(codigo, "Entro na taverna");
  await agir(codigo, "Olho em volta");
  assert.doesNotMatch(registro.ultimoPrompt, /MESA PARADA/);
  await agir(codigo, "Pergunto ao taverneiro sobre a mina");
  assert.equal(estado(codigo).vagas, 0);
  await agir(codigo, "Espero");
  await agir(codigo, "O que eu faço?");
  assert.match(registro.ultimoPrompt, /MESA PARADA[^\n]*ações foram vagas/);
  assert.equal(estado(codigo).vagas, 0);
});

test("empurrão: em combate não há bloco nem contagem", async () => {
  const codigo = await mesaEmJogo(ana);
  await agir(codigo, "Espero");
  await agir(codigo, "Chamo os goblin para a luta");              // o Mestre falso começa um combate
  assert.ok(db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo).combate);
  assert.deepEqual([estado(codigo).semAvanco, estado(codigo).vagas], [0, 0]);
});

test("evento de mesa parada: um por cena, sem combate nem teste, na conta da mesa; o painel desliga e muda os minutos", async () => {
  const codigo = await mesaEmJogo(ana);
  await agir(codigo, "Entro na taverna");
  const daqui = (min) => Date.now() + min * 60_000;
  assert.deepEqual(ritmo().verificar(daqui(3)), [], "antes dos 4 minutos, nada");
  assert.deepEqual(ritmo().verificar(daqui(90)), [], "sessão encerrada há mais de uma hora, nada");
  const antes = narracoes(codigo).length;
  assert.ok(ritmo().verificar(daqui(5)).includes(codigo));
  await esperar(() => narracoes(codigo).length > antes && !db.prepare("SELECT processando FROM mesas WHERE codigo = ?").get(codigo).processando);
  assert.equal(narracoes(codigo).at(-1), "Um corvo pousa no balcão com um bilhete preso à pata.");
  const m = db.prepare("SELECT combate, rolagem, arcoConcluido, ato, elementos FROM mesas WHERE codigo = ?").get(codigo);
  assert.deepEqual([m.combate, m.rolagem, Number(m.arcoConcluido), Number(m.ato)], [null, null, 0, 1]);
  assert.match(m.elementos, /corvo com bilhete/);
  assert.match(eventosPedidos.at(-1), /CONTEXTO DA SESSÃO/);
  const uso = db.prepare("SELECT codigo FROM uso_ia_mesa ORDER BY id DESC LIMIT 1").get();
  assert.equal(uso.codigo, codigo, "a chamada do evento conta para a mesa (o líder paga)");
  assert.equal(estado(codigo).eventos, 1);
  assert.deepEqual(ritmo().verificar(daqui(10)), [], "a mesma cena não recebe outro evento");

  // alguém agiu e o Mestre respondeu: ainda a mesma cena, então nada; ação esperando resposta também não dispara
  await agir(codigo, "Leio o bilhete");
  assert.deepEqual(ritmo().verificar(daqui(10)), []);

  // painel
  let r = await api("GET", "/api/admin/ritmo", { admin: adm });
  assert.equal(r.st, 200);
  assert.deepEqual(r.d.config, { eventoAtivo: true, eventoMinutos: 4 });
  assert.ok(r.d.totais.eventos >= 1 && r.d.totais.empurroes >= 0);
  assert.equal((await api("PUT", "/api/admin/ritmo", { admin: adm, corpo: { eventoMinutos: 1 } })).st, 400);
  assert.equal((await api("PUT", "/api/admin/ritmo", { admin: adm, corpo: { eventoAtivo: "sim" } })).st, 400);
  assert.equal((await api("GET", "/api/admin/ritmo", { token: ana.token })).st, 401);          // jogador não é admin
  r = await api("PUT", "/api/admin/ritmo", { admin: adm, corpo: { eventoAtivo: false, eventoMinutos: 10 } });
  assert.deepEqual(r.d.config, { eventoAtivo: false, eventoMinutos: 10 });

  const outra = await mesaEmJogo(ana);
  assert.deepEqual(ritmo().verificar(daqui(20)), [], "desligado, nenhuma mesa recebe evento");
  await api("PUT", "/api/admin/ritmo", { admin: adm, corpo: { eventoAtivo: true } });
  assert.deepEqual(ritmo().verificar(daqui(5)), [], "religado com 10 minutos: 5 não bastam");
  assert.ok(ritmo().verificar(daqui(11)).includes(outra));
  await esperar(() => !db.prepare("SELECT processando FROM mesas WHERE codigo = ?").get(outra).processando && narracoes(outra).length > 1);
});

test("reiniciar a aventura apaga a contagem do ritmo", async () => {
  const codigo = await mesaEmJogo(ana);
  await agir(codigo, "Entro na taverna");
  await agir(codigo, "Espero");
  assert.equal(estado(codigo).vagas, 1);
  const r = await post("/api/reiniciar-mesa", { codigo }, { token: ana.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(estado(codigo).vagas, 0);
});
