/**
 * Testes das melhorias só de servidor com o servidor de verdade (banco temporário) e o Mestre falso:
 * memória da campanha, clima, chance de sucesso, selos, elementos, condições, XP, encontros, uso da IA e depuração no admin.
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-melhorias-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
// o que a produção liga no .env
process.env.XP_POR_ACAO = "2";
process.env.CHANCE_VISIVEL = "1";
const { registro } = require("./mestre-falso");

// Respostas próprias destes testes, por palavra-chave da ação; o resto segue o Mestre falso de sempre.
const falso = globalThis.fetch;
const RESPOSTAS = {
  "salvo a odila": () => ({ narracao: "Odila respira aliviada.", memoria: { fatos: { "Odila Salva": "o grupo tirou Odila do incêndio" }, npcs: { Odila: "grata" }, reputacao: { "Guarda da Cidade": 1 } } }),
  "traio a guarda": () => ({ narracao: "O capitão cospe no chão.", memoria: { fatos: { odila_salva: null }, reputacao: { "Guarda da Cidade": -2 } } }),
  "anoitece": () => ({ narracao: "A neblina desce com a noite.", clima: "neblina", periodo: "noite" }),
  "me escondo": () => ({ narracao: "Você se encolhe atrás do muro.", teste: { tipo: "pericia", pericia: "Furtividade", cd: 12, motivo: "passar pelo vigia" } }),
  "piso na armadilha": (uid) => ({ narracao: "Um dardo fino espeta o seu braço.", efeitos: [{ alvo: uid, status: "envenenado", turnos: 2 }, { alvo: uid, status: "voando", turnos: 2 }] }),
  // o troll aparece ao lado do personagem, num mapa sem obstáculos
  "acordo o troll": (uid) => ({ narracao: "O troll se levanta do lodo.", combate: {
    inimigos: [{ nome: "Troll", pv: 90, ca: 10, ataque: -5, dano: "1", des: -9, alcance: "corpo", x: 4, y: 11, fraquezas: ["Fogo", "lama"], resistencias: ["gelo"] }],
    mapa: { descricao: "Charco raso", colunas: 10, linhas: 14, terreno: [] }, posicoes: { [uid]: { x: 4, y: 12 } } } }),
  "sigo viagem": (uid, acao) => ({ narracao: "A estrada se abre adiante.", cena: `Estrada ${acao.replace(/\D/g, "") || "1"}` }),
};
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://openrouter.ai/api/v1/chat")) {
    const prompt = JSON.parse(opts.body).messages.map((x) => x.content).join("\n");
    const m = prompt.slice(prompt.lastIndexOf("EVENTO:")).match(/^EVENTO: .+? \(id (\w+)\) declara a ação: "([\s\S]*?)"\n/);
    const chave = m && Object.keys(RESPOSTAS).find((k) => m[2].toLowerCase().includes(k));
    if (chave) {
      registro.ultimoPrompt = prompt;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESPOSTAS[chave](m[1], m[2])) } }], usage: { prompt_tokens: 4700, completion_tokens: 60, cost: 0.001 } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  return falso(url, opts);
};
const { server, db } = require("../server");

let base, ana, beto;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function api(metodo, rota, { corpo, token, admin } = {}) {
  const headers = { "Content-Type": "application/json" };
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
  return { token: r.d.token, id: r.d.usuario.id, nome };
}
const fichaBase = (nome) => ({ nome, raca: "Anão", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }, { nome: "Tocha flamejante", bonus: 5, dano: "1d6+3" }] });
const lerFicha = (codigo, uid) => JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, uid).dados);
const mesaDb = (codigo) => db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
const mundo = (codigo) => JSON.parse(mesaDb(codigo).mundo || "null");
const diario = async (codigo, j) => (await get(`/api/mesa/${codigo}/log`, { token: j.token })).d;
const textos = async (codigo, j) => (await diario(codigo, j)).map((e) => e.texto);
const agir = async (codigo, j, texto) => { const r = await post("/api/agir", { codigo, texto }, { token: j.token }); assert.equal(r.st, 200, JSON.stringify(r.d)); return r.d; };

async function mesaEmJogo(jogadores, extra = {}) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome, ...extra }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase(j.nome) }, { token: j.token });
  const r = await post("/api/comecar-aventura", { codigo: d.codigo }, { token: dono.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return d.codigo;
}

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ana = await conta("Ana", "ana@melhorias.br");
  beto = await conta("Beto", "beto@melhorias.br");
});

test("memória da campanha: o Mestre anota, o servidor guarda, o próximo prompt leva e o app não recebe os segredos", async () => {
  const codigo = await mesaEmJogo([ana]);
  assert.ok(!registro.ultimoPrompt.includes("MEMÓRIA DA CAMPANHA"));
  assert.ok(registro.ultimoPrompt.includes("CAMPOS EXTRAS DO JSON"));
  await agir(codigo, ana, "Salvo a Odila do incêndio");
  let m = mundo(codigo);
  assert.equal(m.fatos.odila_salva.v, "o grupo tirou Odila do incêndio");
  assert.equal(m.npcs.Odila.v, "grata");
  assert.deepEqual(m.reputacao, { "Guarda da Cidade": 1 });
  assert.ok((await textos(codigo, ana)).includes("Reputação com Guarda da Cidade: +1 (agora +1, neutros)."));
  // nenhuma linha nova é narração (o app leria em voz alta)
  assert.ok((await diario(codigo, ana)).filter((e) => e.texto.startsWith("Reputação")).every((e) => e.tipo === "sys"));

  await agir(codigo, ana, "Olho em volta");
  const p = registro.ultimoPrompt;
  assert.match(p, /MEMÓRIA DA CAMPANHA[^\n]*\n- Fatos: odila_salva = o grupo tirou Odila do incêndio\n- NPCs e o que sentem pelo grupo: Odila = grata\n- Reputação com grupos \(de -10 a \+10\): Guarda da Cidade \+1 \(neutros\)/);
  assert.ok(p.indexOf("MEMÓRIA DA CAMPANHA") > p.indexOf("Responda SOMENTE com um objeto JSON"));          // acréscimo no fim: o prompt de sempre vem inteiro antes

  await agir(codigo, ana, "Traio a guarda");
  m = mundo(codigo);
  assert.deepEqual([Object.keys(m.fatos), m.reputacao], [[], { "Guarda da Cidade": -1 }]);
  assert.ok((await textos(codigo, ana)).includes("Reputação com Guarda da Cidade: -2 (agora -1, neutros)."));

  // o app recebe só o clima e o período; a memória fica no servidor
  const pub = (await get(`/api/mesa/${codigo}`, { token: ana.token })).d;
  assert.ok(!("mundo" in pub));
  assert.deepEqual([pub.clima, pub.periodo], ["", ""]);
  assert.ok(!JSON.stringify(pub).includes("Guarda da Cidade"));

  // ponto de salvamento guarda a memória; reiniciar a mesa apaga
  const ponto = await post("/api/salvamento/criar", { codigo }, { token: ana.token });
  assert.equal(ponto.st, 200, JSON.stringify(ponto.d));
  await agir(codigo, ana, "Salvo a Odila de novo");
  assert.equal(mundo(codigo).reputacao["Guarda da Cidade"], 0);
  const volta = await post("/api/salvamento/restaurar", { codigo, id: ponto.d.id }, { token: ana.token });
  assert.equal(volta.st, 200, JSON.stringify(volta.d));
  assert.equal(mundo(codigo).reputacao["Guarda da Cidade"], -1);
  assert.equal((await post("/api/reiniciar-mesa", { codigo }, { token: ana.token })).st, 200);
  assert.equal(mesaDb(codigo).mundo, null);
});

test("clima e período: o Mestre muda, o teste de perícia recebe o ajuste e a chance aparece no rótulo; o dia novo traz a manhã", async () => {
  const codigo = await mesaEmJogo([ana]);
  await agir(codigo, ana, "Espero até que anoitece");
  assert.deepEqual([mundo(codigo).clima, mundo(codigo).periodo], ["neblina", "noite"]);
  const pub = (await get(`/api/mesa/${codigo}`, { token: ana.token })).d;
  assert.deepEqual([pub.clima, pub.periodo], ["neblina", "noite"]);

  // Furtividade: DES 12 (+1), sem treino; neblina e noite somam +2 (o teto) → +3 contra CD 12 = 60%
  const { rolagem } = await agir(codigo, ana, "Me escondo do vigia");
  assert.equal(rolagem.rotulo, "Furtividade (neblina e noite +2) (chance 60%)");
  assert.deepEqual([rolagem.bonus, rolagem.cd], [3, 12]);
  assert.match(registro.ultimoPrompt, /CLIMA E PERÍODO DO DIA: neblina, noite\./);
  // 9 no dado: 9+3 = 12, passa por causa do clima; a linha do diário continua no formato que o app lê
  const r = await post("/api/rolar", { codigo, valor: 9 }, { token: ana.token });
  assert.deepEqual([r.d.total, r.d.sucesso], [12, true]);
  const linha = (await diario(codigo, ana)).find((e) => e.tipo === "roll");
  assert.equal(linha.texto, "Ana · Furtividade (neblina e noite +2) (chance 60%): 9+3 = 12 vs CD 12 (dado real)");
  assert.equal(linha.res, "sucesso");

  // selos novos só nos casos novos: por pouco e críticos
  const selo = async (valor) => {
    await agir(codigo, ana, "Me escondo de novo");
    await post("/api/rolar", { codigo, valor }, { token: ana.token });
    return (await diario(codigo, ana)).filter((e) => e.tipo === "roll").pop().res;
  };
  assert.equal(await selo(8), "falha por pouco");
  assert.equal(await selo(3), "falha");
  assert.equal(await selo(20), "sucesso crítico");
  assert.equal(await selo(1), "falha crítica");

  // com a dificuldade escondida, a chance não aparece
  assert.equal((await post("/api/configurar-mesa", { codigo, cdVisivel: false }, { token: ana.token })).st, 200);
  assert.equal((await agir(codigo, ana, "Me escondo outra vez")).rolagem.rotulo, "Furtividade (neblina e noite +2)");
  await post("/api/rolar", { codigo, valor: 10 }, { token: ana.token });

  await agir(codigo, ana, "Durmo até de manhã");
  assert.deepEqual([mundo(codigo).clima, mundo(codigo).periodo], ["neblina", "manha"]);
});

test("elementos e condições no combate: fraqueza no dano, selo, aviso no diário, crítico deixa em chamas e o fogo queima a cada turno", async () => {
  const codigo = await mesaEmJogo([ana]);
  await agir(codigo, ana, "Acordo o troll");
  let c = JSON.parse(mesaDb(codigo).combate);
  assert.deepEqual([c.inimigos[0].fraquezas, c.inimigos[0].resistencias, "imunidades" in c.inimigos[0]], [["fogo"], ["gelo"], false]);
  assert.match(registro.ultimoPrompt, /CAMPOS EXTRAS DO JSON/);

  let r = await post("/api/acao-combate", { codigo, tipo: "ataque", nome: "Tocha flamejante", alvo: "ini_0" }, { token: ana.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.rolagem.elemento, "fogo");
  assert.equal(r.d.rolagem.rotulo, "Tocha flamejante vs Troll (chance 80%)");          // +5 contra CA 10
  r = await post("/api/rolar", { codigo, valor: 20 }, { token: ana.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  let d = await diario(codigo, ana);
  const rolagem = d.filter((e) => e.tipo === "roll" && e.texto.startsWith("Ana · Tocha flamejante")).pop();
  assert.match(rolagem.res, /^crítico! fraqueza: \d+ de dano$/);
  assert.equal(Number(rolagem.res.match(/(\d+) de dano/)[1]), r.d.dano);
  let t = d.map((e) => e.texto);
  assert.ok(t.includes("Troll é fraco a fogo: dano ×1,5."));
  assert.ok(t.includes("Troll fica em chamas por 2 turnos."));
  // a vez passa para o troll: o fogo queima antes de ele agir
  assert.equal((await post("/api/encerrar-turno", { codigo }, { token: ana.token })).st, 200);
  d = await diario(codigo, ana);
  t = d.map((e) => e.texto);
  assert.ok(t.includes("Troll sofre 3 de dano por estar em chamas."));
  c = JSON.parse(mesaDb(codigo).combate);
  assert.equal(c.inimigos[0].pv, 90 - r.d.dano - 3);
  assert.deepEqual(c.inimigos[0].status, [{ tipo: "em_chamas", turnos: 1 }]);
  assert.ok(d.filter((e) => /fica em chamas|sofre 3 de dano por estar|é fraco a fogo/.test(e.texto)).every((e) => e.tipo === "sys"));

  // ataque sem elemento: o selo de sempre
  r = await post("/api/acao-combate", { codigo, tipo: "ataque", nome: "Machado de batalha", alvo: "ini_0" }, { token: ana.token });
  assert.equal(r.d.rolagem.elemento, undefined);
  r = await post("/api/rolar", { codigo, valor: 12 }, { token: ana.token });
  d = await diario(codigo, ana);
  assert.equal(d.filter((e) => e.tipo === "roll" && e.texto.startsWith("Ana · Machado")).pop().res, `acertou, ${r.d.dano} de dano`);
});

test("condição mandada pelo Mestre: vai para a ficha, aparece no diário e no prompt, some no dia seguinte; condição inventada é ignorada", async () => {
  const codigo = await mesaEmJogo([ana]);
  await agir(codigo, ana, "Piso na armadilha");
  assert.deepEqual(lerFicha(codigo, ana.id).status, [{ tipo: "envenenado", turnos: 2 }]);
  assert.ok((await textos(codigo, ana)).includes("Ana fica envenenado por 2 turnos."));
  const fichas = (await get(`/api/mesa/${codigo}/fichas`, { token: ana.token })).d;
  assert.deepEqual(fichas[ana.id].status, [{ tipo: "envenenado", turnos: 2 }]);
  await agir(codigo, ana, "Olho em volta");
  assert.match(registro.ultimoPrompt, /CONDIÇÕES ATIVAS[^\n]*: Ana: envenenado \(2 turnos\)/);
  // salvar a ficha pelo app não apaga nem inventa condição
  await post("/api/salvar-ficha", { codigo, ficha: { ...fichaBase("Ana"), status: [{ tipo: "protegido", turnos: 5 }] } }, { token: ana.token });
  assert.deepEqual(lerFicha(codigo, ana.id).status, [{ tipo: "envenenado", turnos: 2 }]);
  await agir(codigo, ana, "Durmo até de manhã");
  assert.ok(!("status" in lerFicha(codigo, ana.id)));
});

test("XP: por ação vem do .env (2 aqui) e a virada de ato dá o marco a todos, com o aviso no diário", async () => {
  const codigo = await mesaEmJogo([ana, beto]);
  await agir(codigo, ana, "Olho em volta");
  assert.deepEqual([lerFicha(codigo, ana.id).xp, lerFicha(codigo, beto.id).xp], [2, 0]);
  await agir(codigo, ana, "Cumpro o objetivo do ato");
  assert.deepEqual([lerFicha(codigo, ana.id).xp, lerFicha(codigo, beto.id).xp], [44, 40]);
  const t = await textos(codigo, ana);
  assert.ok(t.includes("Marco da história: +40 XP para cada personagem."));
  assert.ok(t.some((x) => x.startsWith("Ato 2 — ")));
  // sem virada de ato não há marco
  await agir(codigo, beto, "Olho em volta");
  assert.deepEqual([lerFicha(codigo, ana.id).xp, lerFicha(codigo, beto.id).xp], [44, 42]);
});

test("encontro de estrada: depois de 6 narrações e de uma mudança de cena, o Mestre recebe uma semente, uma vez só", async () => {
  const codigo = await mesaEmJogo([ana]);
  for (let i = 1; i <= 5; i++) await agir(codigo, ana, `Sigo viagem ${i}`);
  assert.deepEqual([mundo(codigo).narr, mundo(codigo).encontro], [5, ""]);
  await agir(codigo, ana, "Sigo viagem 6");
  const semente = mundo(codigo).encontro;
  assert.ok(require("../melhorias").ENCONTROS.includes(semente));
  assert.ok(!registro.ultimoPrompt.includes("ENCONTRO DE ESTRADA"));
  await agir(codigo, ana, "Sigo viagem 7");
  assert.ok(registro.ultimoPrompt.includes(`ENCONTRO DE ESTRADA (use agora, se o grupo estiver a caminho de algum lugar ou entre uma cena e outra; adapte ao tema e à história): ${semente}.`));
  assert.deepEqual([mundo(codigo).narr, mundo(codigo).encontro], [0, ""]);
  await agir(codigo, ana, "Sigo viagem 8");
  assert.ok(!registro.ultimoPrompt.includes("ENCONTRO DE ESTRADA"));
});

test("admin: uso da IA por dia e depuração do mundo da mesa (clima, período, ato, fatos, reputação, encontro); sem login, 401", async () => {
  const codigo = await mesaEmJogo([ana]);
  await agir(codigo, ana, "Salvo a Odila");
  assert.equal((await get("/api/admin/uso")).st, 401);
  assert.equal((await get(`/api/admin/mesas/${codigo}/mundo`)).st, 401);
  assert.equal((await api("PUT", `/api/admin/mesas/${codigo}/mundo`, { corpo: { clima: "chuva" } })).st, 401);
  const login = await post("/api/admin/login", { user: "admin", pass: "senha-do-admin-de-teste" });
  assert.equal(login.st, 200, JSON.stringify(login.d));
  const admin = login.d.token;

  const uso = (await get("/api/admin/uso?dias=7", { admin })).d;
  assert.equal(uso.dias, 7);
  assert.ok(uso.total.texto.chamadas >= 1 && uso.total.texto.entrada >= 4700 && uso.total.texto.saida >= 60 && uso.total.texto.custo > 0);
  assert.ok(uso.linhas.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.dia) && l.modelo));

  let m = (await get(`/api/admin/mesas/${codigo}/mundo`, { admin })).d;
  assert.deepEqual([m.fase, m.ato, m.mundo.npcs.Odila.v], ["jogo", 1, "grata"]);
  m = (await api("PUT", `/api/admin/mesas/${codigo}/mundo`, { admin, corpo: { clima: "tempestade", periodo: "madrugada", ato: 3, fatos: { "Chave Achada": "na cripta" },
    reputacao: { Ladrões: -7, "Guarda da Cidade": null }, encontro: true } })).d;
  assert.deepEqual([m.ato, m.mundo.clima, m.mundo.periodo, m.mundo.fatos.chave_achada.v, m.mundo.reputacao], [3, "tempestade", "madrugada", "na cripta", { Ladrões: -7 }]);
  assert.ok(m.encontros.includes(m.mundo.encontro));
  assert.equal(mesaDb(codigo).ato, 3);
  // valores inválidos são recusados sem estragar o resto; "limpar" zera
  m = (await api("PUT", `/api/admin/mesas/${codigo}/mundo`, { admin, corpo: { clima: "granizo", ato: 99 } })).d;
  assert.deepEqual([m.mundo.clima, m.ato, m.mundo.periodo], ["", 3, "madrugada"]);
  m = (await api("PUT", `/api/admin/mesas/${codigo}/mundo`, { admin, corpo: { limpar: true } })).d;
  assert.deepEqual([m.mundo.fatos, m.mundo.npcs, m.mundo.reputacao, m.mundo.periodo], [{}, {}, {}, ""]);
  assert.equal((await get("/api/admin/mesas/NADA1/mundo", { admin })).st, 404);
});
