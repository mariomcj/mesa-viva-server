"use strict";
/**
 * Teste de ponta a ponta: sobe o servidor com um OpenRouter falso e joga uma sessão
 * (mesa, personagens, combate, saque, nível, expedição, votação, epílogo, diário, saves, créditos).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function respostaIA(promptCompleto) {
  // Decide pela parte do EVENTO (o histórico traz ações antigas). Mantém o contexto de combate.
  const evento = promptCompleto.split("EVENTO:").pop();
  const prompt = (promptCompleto.includes("EM COMBATE") ? "EM COMBATE " : "") + (promptCompleto.includes("Crie uma ficha") || promptCompleto.includes("EPÍLOGO") || promptCompleto.includes("sugira 3 ações") ? promptCompleto : evento) + (promptCompleto.match(/\[id ini_\d+\]/g) || []).join(" ");
  const r = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage: { prompt_tokens: 4700, completion_tokens: 900, cost: 0.0009 }, model: "mock" });
  if (prompt.includes("Crie uma ficha")) {
    return r({ nome: "Brom", raca: "Anão", classe: "Guerreiro", atributos: { for: 15, des: 12, con: 15, int: 10, sab: 10, car: 10 }, ca: 16, pericias: ["Atletismo", "Percepção"], ataques: [{ nome: "Machado", bonus: 4, dano: "1d8+2" }], equipamento: ["Corda"] });
  }
  if (prompt.includes("sugira 3 ações")) return r(["Eu examino a porta", "Eu chamo Odila", "Eu preparo o machado"]);
  if (prompt.includes("EPÍLOGO")) return r({ narracao: "A vila celebrou. Odila nunca esqueceu o grupo." });
  if (prompt.includes("declara a ação") && prompt.includes("procuro briga") && !prompt.includes("EM COMBATE")) {
    return r({ narracao: "Dois goblins saltam das sombras.", cena: "Trilha da Pedreira", resumo: "Emboscada.", teste: null,
      combate: { inimigos: [{ nome: "Goblin 1", pv: 1, ca: 5, ataque: 0, dano: "1", fraquezas: ["fogo"] }, { nome: "Goblin 2", pv: 1, ca: 5, ataque: 0, dano: "1" }] },
      efeitos: [], flags: { emboscada_na_trilha: true }, npcs: { Odila: "preocupada" }, reputacao: { "Vila de Carvalho-Cinza": 1 } });
  }
  if (prompt.includes("declara a ação") && prompt.includes("EM COMBATE")) {
    const alvo = (prompt.match(/\[id (ini_\d+)\]/) || [])[1] || "ini_0";
    return r({ narracao: "Você avança.", teste: { tipo: "ataque", ataque: "Machado", alvo }, combate: null, efeitos: [] });
  }
  if (prompt.includes("declara a ação") && prompt.includes("cumpro o objetivo")) {
    return r({ narracao: "Missão cumprida.", cena: "Taverna Javali Cego", resumo: "Aceitaram.", teste: null, combate: null, efeitos: [], capituloConcluido: true });
  }
  if (prompt.includes("declara a ação")) {
    return r({ narracao: "A taverna ferve.", cena: "Taverna Javali Cego", resumo: "Conversaram.", teste: { tipo: "pericia", pericia: "Percepção", cd: 12, motivo: "notar" }, combate: null, efeitos: [] });
  }
  return r({ narracao: "O Mestre narra a cena.", cena: null, resumo: "Segue.", teste: null, combate: null, efeitos: [] });
}

function iniciarMock() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        if (req.url.endsWith("/images/generations")) return res.end(JSON.stringify({ data: [{ b64_json: PNG_1PX }] }));
        const j = JSON.parse(body || "{}");
        res.end(JSON.stringify(respostaIA(j.messages?.[0]?.content || "")));
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function iniciarServidor(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mesaviva-"));
  const porta = 30000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(porta), DB_PATH: path.join(dir, "t.db"), OPENROUTER_API_KEY: "teste", PUBLIC_BASE_URL: `http://127.0.0.1:${porta}`, IMAGENS_DIR: path.join(dir, "imagens"), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let saida = "";
  proc.stdout.on("data", (d) => (saida += d));
  proc.stderr.on("data", (d) => (saida += d));
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${porta}/api/ping`); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { proc, base: `http://127.0.0.1:${porta}`, saida: () => saida };
}

function cliente(base, uid, token) {
  const h = { "Content-Type": "application/json", "X-User-Id": uid, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return {
    post: async (p, b = {}) => { const r = await fetch(base + p, { method: "POST", headers: h, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; },
    get: async (p) => { const r = await fetch(base + p, { headers: h }); return { status: r.status, j: await r.json() }; },
    put: async (p, b, extra = {}) => { const r = await fetch(base + p, { method: "PUT", headers: { ...h, ...extra }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json() }; },
  };
}

test("sessão completa com IA simulada", { timeout: 60_000 }, async (t) => {
  const mock = await iniciarMock();
  const s = await iniciarServidor({ OPENROUTER_URL: `http://127.0.0.1:${mock.address().port}` });
  t.after(() => { s.proc.kill(); mock.close(); });

  const reg = await fetch(`${s.base}/api/auth/registrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Ana", email: "ana@teste.local", senha: "1234" }) }).then((r) => r.json());
  const a = cliente(s.base, "dev-ana", reg.token);
  const b = cliente(s.base, "dev-bia");

  const v = await a.get("/api/versao");
  assert.equal(v.status, 200);
  assert.ok(v.j.appMinimo >= 1);

  const { j: { codigo } } = await a.post("/api/mesa/criar", { nome: "Ana" });
  assert.match(codigo, /^[A-Z0-9]{5}$/);
  assert.equal((await b.post(`/api/mesa/entrar/${codigo}`, { nome: "Bia" })).status, 200);

  // Personagens
  for (const c of [a, b]) {
    const p = await c.post("/api/criar-personagem", { conceito: "anão guerreiro" });
    assert.equal(p.status, 200, JSON.stringify(p.j));
    assert.equal(p.j.ficha.ataques[0].elemento, "fisico");
    assert.equal((await c.post("/api/salvar-ficha", { codigo, ficha: p.j.ficha })).status, 200);
  }

  // Créditos: teste grátis ativo para a dona da mesa
  const cr = await a.get("/api/conta/creditos");
  assert.equal(cr.j.teste.ativo, true);
  assert.equal(cr.j.cobrancaAtiva, false);
  assert.equal(cr.j.produtos.length, 4);

  assert.equal((await a.post("/api/comecar-aventura", { codigo })).status, 200);
  let mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  assert.equal(mesa.fase, "jogo");
  assert.equal(mesa.capituloTitulo, "A taverna Javali Cego");
  assert.ok(mesa.objetivo.length > 5);
  assert.equal(typeof mesa.cdVisivel, "boolean");

  // Teste de perícia com chance visível e minigame
  const ag = await a.post("/api/agir", { codigo, texto: "olho em volta" });
  assert.equal(ag.status, 200, JSON.stringify(ag.j));
  assert.ok(ag.j.rolagem.chance >= 5);
  const rol = await a.post("/api/rolar", { codigo, valor: 10, minigame: "ok" });
  assert.equal(rol.status, 200, JSON.stringify(rol.j));
  assert.equal(rol.j.total, 10 + ag.j.rolagem.bonus + 2);

  // Combate: flags, NPCs e reputação registrados; ataque com selo; vitória; saque
  const ag2 = await a.post("/api/agir", { codigo, texto: "procuro briga" });
  assert.equal(ag2.status, 200, JSON.stringify(ag2.j));
  mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  let guarda = 0;
  while (mesa.combate && guarda++ < 12) {
    const vez = mesa.combate.ordem[mesa.combate.vez % mesa.combate.ordem.length];
    const c = vez.id === "dev-ana" ? a : b;
    if (!mesa.rolagem) {
      const r = await c.post("/api/agir", { codigo, texto: "ataco" });
      assert.equal(r.status, 200, JSON.stringify(r.j));
    }
    mesa = (await a.get(`/api/mesa/${codigo}`)).j;
    if (mesa.rolagem) {
      const quem = mesa.rolagem.jogador === "dev-ana" ? a : b;
      const r = await quem.post("/api/rolar", { codigo, valor: 20 });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      assert.match(r.j.selo || "", /CRÍTICO/);
    }
    mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  }
  assert.equal(mesa.combate, null, "o combate deveria ter acabado");
  assert.ok(mesa.saque && mesa.saque["dev-ana"]?.length === 3, "saque 1 de 3 para cada jogador");
  assert.equal((await a.post("/api/saque/escolher", { codigo, indice: 1 })).status, 200);

  let fichas = (await a.get(`/api/mesa/${codigo}/fichas`)).j;
  assert.equal(fichas["dev-ana"].itens.length, 1);
  assert.ok(fichas["dev-ana"].xp > 0 || fichas["dev-ana"].nivel > 1, "ganhou XP na vitória");
  assert.ok(fichas["dev-ana"].ouro > 0);

  // XP não some quando o app salva a ficha (bug antigo)
  const xpAntes = fichas["dev-ana"].xp, nivelAntes = fichas["dev-ana"].nivel;
  await a.post("/api/salvar-ficha", { codigo, ficha: { ...fichas["dev-ana"], xp: 0, nivel: 1, notas: "editei" } });
  fichas = (await a.get(`/api/mesa/${codigo}/fichas`)).j;
  assert.equal(fichas["dev-ana"].xp, xpAntes);
  assert.equal(fichas["dev-ana"].nivel, nivelAntes);
  assert.equal(fichas["dev-ana"].notas, "editei");

  // Log com selo e evento
  const log = (await a.get(`/api/mesa/${codigo}/log`)).j;
  assert.ok(log.some((e) => e.evento === "combate_inicio"));
  assert.ok(log.some((e) => e.evento === "vitoria"));
  assert.ok(!log.some((e) => e.tipo === "narr" && e.evento), "eventos nunca usam tipo narr");

  // Capítulo concluído
  await a.post("/api/agir", { codigo, texto: "cumpro o objetivo" });
  mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  assert.equal(mesa.capitulo, 1);
  assert.equal(mesa.capituloTitulo, "A trilha da pedreira");

  // Diário com flags, NPCs, reputação e bestiário
  const diario = (await a.get(`/api/mesa/${codigo}/diario`)).j;
  assert.equal(diario.flags.emboscada_na_trilha, "true");
  assert.equal(diario.npcs.Odila, "preocupada");
  assert.equal(diario.reputacao["Vila de Carvalho-Cinza"], 1);
  assert.ok(diario.bestiario.some((x) => x.nome === "Goblin" && x.derrotados >= 2));
  assert.ok(diario.capitulos[0].concluido);

  // Ponto de salvamento
  const sv = await a.post(`/api/mesa/${codigo}/saves`, { nome: "Antes da trilha" });
  assert.equal(sv.status, 200, JSON.stringify(sv.j));
  assert.equal((await b.post(`/api/mesa/${codigo}/saves`, {})).status, 403, "só o dono salva");
  assert.equal((await a.get(`/api/mesa/${codigo}/saves`)).j.saves.length, 1);

  // Expedição na torre + votação "parar"
  const ex = await a.post("/api/expedicao/iniciar", { codigo, modo: "torre" });
  assert.equal(ex.status, 200, JSON.stringify(ex.j));
  mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  assert.equal(mesa.expedicao.andar, 1);
  guarda = 0;
  while (mesa.combate && guarda++ < 20) {
    const vez = mesa.combate.ordem[mesa.combate.vez % mesa.combate.ordem.length];
    const c = vez.id === "dev-ana" ? a : b;
    if (!mesa.rolagem) await c.post("/api/agir", { codigo, texto: "ataco" });
    mesa = (await a.get(`/api/mesa/${codigo}`)).j;
    if (mesa.rolagem) await (mesa.rolagem.jogador === "dev-ana" ? a : b).post("/api/rolar", { codigo, valor: 20 });
    mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  }
  if (mesa.votacao) {
    await a.post("/api/votar", { codigo, opcao: "parar" });
    const vt = await b.post("/api/votar", { codigo, opcao: "parar" });
    assert.equal(vt.status, 200);
    mesa = (await a.get(`/api/mesa/${codigo}`)).j;
    assert.equal(mesa.expedicao, null);
  }

  // Escolhas de nível (força XP pelo admin)
  const adm = await fetch(`${s.base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "admin", pass: "mesaviva2026" }) }).then((r) => r.json());
  await a.put(`/api/admin/fichas/${codigo}/dev-ana`, { nivel: 4 }, { "x-admin-token": adm.token });
  fichas = (await a.get(`/api/mesa/${codigo}/fichas`)).j;
  assert.equal(fichas["dev-ana"].pendencias.subclasse, true);
  assert.equal((await a.post("/api/ficha/escolher", { codigo, tipo: "subclasse", valor: "guardiao" })).status, 200);
  assert.equal((await a.post("/api/ficha/escolher", { codigo, tipo: "talento", valor: "couraca" })).status, 200);
  assert.equal((await a.post("/api/ficha/escolher", { codigo, tipo: "atributo", valor: "con" })).status, 200);
  fichas = (await a.get(`/api/mesa/${codigo}/fichas`)).j;
  assert.equal(fichas["dev-ana"].caEfetiva, fichas["dev-ana"].ca + 2);

  // Redistribuir: grátis na primeira vez
  const at = fichas["dev-ana"].atributos;
  const rd = await a.post("/api/ficha/redistribuir", { codigo, atributos: { ...at, for: at.for - 1, des: at.des + 1 } });
  assert.equal(rd.status, 200, JSON.stringify(rd.j));
  assert.deepEqual(rd.j.ficha.talentos, []);

  // Epílogo
  await a.put(`/api/admin/mesas/${codigo}`, { aventuraConcluida: 1 }, { "x-admin-token": adm.token });
  const ep = await a.post("/api/epilogo", { codigo });
  assert.equal(ep.status, 200, JSON.stringify(ep.j));
  assert.equal((await a.post("/api/epilogo", { codigo })).status, 400, "epílogo só uma vez");

  // Carregar o jogo salvo volta o capítulo
  const saves = (await a.get(`/api/mesa/${codigo}/saves`)).j.saves;
  assert.equal((await a.post(`/api/mesa/${codigo}/saves/${saves[0].id}/carregar`)).status, 200);
  mesa = (await a.get(`/api/mesa/${codigo}`)).j;
  assert.equal(mesa.capitulo, 1);
  assert.equal(Number(mesa.aventuraConcluida), 0);

  // Uso medido para o painel admin
  const uso = await fetch(`${s.base}/api/admin/uso`, { headers: { "x-admin-token": adm.token } }).then((r) => r.json());
  assert.ok(uso.ultimos30dias.find((u) => u.tipo === "texto").chamadas > 3);

  // Loja sem conta de serviço: responde 503 sem quebrar
  assert.equal((await a.post("/api/loja/validar", { produto: "creditos_taverna_5", purchaseToken: "abc" })).status, 503);

  // Reação (rota que estava quebrada)
  assert.equal((await a.post(`/api/mesa/${codigo}/reacao`, { codigo, logId: log[0].id, tipo: "gostei" })).status, 200);
});

test("com cobrança ativa, mesa sem créditos e sem teste é bloqueada com 402", { timeout: 30_000 }, async (t) => {
  const mock = await iniciarMock();
  const s = await iniciarServidor({ OPENROUTER_URL: `http://127.0.0.1:${mock.address().port}`, COBRANCA_ATIVA: "true", TESTE_CREDITOS: "0.02" });
  t.after(() => { s.proc.kill(); mock.close(); });
  const a = cliente(s.base, "dev-caio");
  const { j: { codigo } } = await a.post("/api/mesa/criar", { nome: "Caio" });
  const p = await a.post("/api/criar-personagem", { conceito: "mago" });
  await a.post("/api/salvar-ficha", { codigo, ficha: p.j.ficha });
  assert.equal((await a.post("/api/comecar-aventura", { codigo })).status, 200); // usa 0,012 do teste
  await a.post("/api/agir", { codigo, texto: "converso" }); // passa do limite de 0,02
  const bloqueio = await a.post("/api/ideias", { codigo });
  assert.equal(bloqueio.status, 402);
  assert.match(bloqueio.j.error, /créditos/);
  // Admin dá créditos e o jogo volta
  const adm = await fetch(`${s.base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "admin", pass: "mesaviva2026" }) }).then((r) => r.json());
  await fetch(`${s.base}/api/admin/creditos`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adm.token }, body: JSON.stringify({ conta: "dev-caio", quantidade: 5 }) });
  assert.equal((await a.post("/api/ideias", { codigo })).status, 200);
});
