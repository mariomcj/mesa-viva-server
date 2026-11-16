/**
 * Leva do app com o servidor de verdade (banco temporário) e o Mestre falso:
 * talentos, subclasse, redistribuição, votação do grupo, minigame e projeção da mesa.
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-leva-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.LIMITE_IA_MAX = "100000";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.CHANCE_VISIVEL = "1";          // como na produção
const { registro } = require("./mestre-falso");

const falso = globalThis.fetch;
const RESPOSTAS = {
  "abro a fechadura": () => ({ narracao: "A fechadura é velha, mas teimosa.", teste: { tipo: "pericia", pericia: "Prestidigitação", cd: 13, motivo: "abrir a porta" } }),
  "leio as runas": () => ({ narracao: "As runas brilham fracas.", teste: { tipo: "pericia", pericia: "Investigação", cd: 13, motivo: "entender o enigma" } }),
  "escalo o muro": () => ({ narracao: "O muro é alto.", teste: { tipo: "pericia", pericia: "Atletismo", cd: 12, motivo: "subir" } }),
  "chego na escada": () => ({ narracao: "A escada desce para o escuro.", votacao: { pergunta: "Descer mais um andar?", opcoes: ["Descer", "Voltar"] } }),
  "olho em volta": () => ({ narracao: "Nada se move.", votacao: { pergunta: "Outra votação?", opcoes: ["Sim", "Não"] } }),
  "acordo o ogro": (uid) => ({ narracao: "O ogro se levanta.", combate: {
    inimigos: [{ nome: "Ogro", pv: 60, ca: 10, ataque: 30, dano: "1d1+40", des: 40, alcance: "corpo", x: 4, y: 11 }],
    mapa: { descricao: "Salão vazio", colunas: 10, linhas: 14, terreno: [] }, posicoes: { [uid]: { x: 4, y: 12 } } } }),
};
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://openrouter.ai/api/v1/chat")) {
    const prompt = JSON.parse(opts.body).messages.map((x) => x.content).join("\n");
    const m = prompt.slice(prompt.lastIndexOf("EVENTO:")).match(/^EVENTO: .+? \(id (\w+)\) declara a ação: "([\s\S]*?)"\n/);
    const chave = m && Object.keys(RESPOSTAS).find((k) => m[2].toLowerCase().includes(k));
    if (chave) {
      registro.ultimoPrompt = prompt;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESPOSTAS[chave](m[1], m[2])) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  return falso(url, opts);
};
const { server, db } = require("../server");
const WebSocket = require("ws");

let base, ana, beto, caio;
const abertos = [];
after(() => { for (const w of abertos) { try { w.terminate(); } catch {} } server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

// Por padrão os pedidos saem como os do app novo (que sabe votar); `antigo: true` imita o app que está nos celulares hoje.
async function api(metodo, rota, { corpo, token, cabecalhos, antigo } = {}) {
  const headers = { "Content-Type": "application/json", ...(antigo ? {} : { "x-app-versao": "2" }), ...(cabecalhos || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
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
const fichaBase = (nome, extra = {}) => ({ nome, raca: "Humano", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }], ...extra });
const lerFicha = (codigo, uid) => JSON.parse(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, uid).dados);
const mudarFicha = (codigo, uid, campos) => db.prepare("UPDATE fichas SET dados = ? WHERE codigo = ? AND uid = ?").run(JSON.stringify({ ...lerFicha(codigo, uid), ...campos }), codigo, uid);
const mesaDb = (codigo) => db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(codigo);
const mesaDe = async (codigo, j) => (await get(`/api/mesa/${codigo}`, { token: j.token })).d;
const textos = async (codigo, j) => (await get(`/api/mesa/${codigo}/log`, { token: j.token })).d.map((e) => e.texto);
const agir = async (codigo, j, texto) => { const r = await post("/api/agir", { codigo, texto }, { token: j.token }); assert.equal(r.st, 200, JSON.stringify(r.d)); return r.d; };

async function mesaEmJogo(jogadores, fichaDe = (j) => fichaBase(j.nome)) {
  const [dono, ...outros] = jogadores;
  const { d } = await post("/api/mesa/criar", { nome: dono.nome }, { token: dono.token });
  for (const j of outros) await post(`/api/mesa/entrar/${d.codigo}`, { nome: j.nome }, { token: j.token });
  for (const j of jogadores) await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaDe(j) }, { token: j.token });
  const r = await post("/api/comecar-aventura", { codigo: d.codigo }, { token: dono.token });
  assert.equal(r.st, 200, JSON.stringify(r.d));
  return d.codigo;
}

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ana = await conta("Ana", "ana-leva@teste.com");
  beto = await conta("Beto", "beto-leva@teste.com");
  caio = await conta("Caio", "caio-leva@teste.com");
});

test("talentos: recusa no nível 1, escolhe no nível 4, não repete e não passa do que o nível dá", async () => {
  const codigo = await mesaEmJogo([ana]);
  const o = { token: ana.token };
  let p = (await get(`/api/mesa/${codigo}/progressao`, o)).d;
  assert.deepEqual([p.nivel, p.talentos.vagas, p.subclasse.podeEscolher, p.redistribuir.gratis], [1, 0, false, true]);
  assert.equal((await post("/api/talento", { codigo, id: "couraca" }, o)).st, 409);
  assert.equal((await post("/api/subclasse", { codigo, id: "campeao" }, o)).st, 409);

  mudarFicha(codigo, ana.id, { nivel: 4 });
  const fichas = (await get(`/api/mesa/${codigo}/fichas`, o)).d;
  assert.deepEqual(fichas[ana.id].escolhas, { talentos: 2, subclasse: true });
  assert.equal((await post("/api/talento", { codigo, id: "voar" }, o)).st, 400);
  let r = await post("/api/talento", { codigo, id: "couraca" }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual(r.d.ficha.talentos, ["couraca"]);
  assert.deepEqual(r.d.ficha.bonus, { ca: 1 });
  assert.equal(r.d.progressao.talentos.vagas, 1);
  assert.equal((await post("/api/talento", { codigo, id: "couraca" }, o)).st, 409);          // repetido
  assert.equal((await post("/api/talento", { codigo, id: "olhar_atento" }, o)).st, 200);
  assert.equal((await post("/api/talento", { codigo, id: "negociador" }, o)).st, 409);       // acabaram as vagas
  assert.deepEqual(lerFicha(codigo, ana.id).talentos, ["couraca", "olhar_atento"]);
  assert.ok((await textos(codigo, ana)).includes("Ana aprendeu o talento Couraça: +1 na CA."));

  // subclasse: só da classe, uma vez
  assert.equal((await post("/api/subclasse", { codigo, id: "assassino" }, o)).st, 400);
  r = await post("/api/subclasse", { codigo, id: "guardiao" }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual(r.d.ficha.bonus, { ca: 2, critMin: 19 });
  assert.equal(r.d.ficha.escolhas, undefined);
  assert.equal((await post("/api/subclasse", { codigo, id: "campeao" }, o)).st, 409);
  // em inglês, a lista vem em inglês
  p = (await get(`/api/mesa/${codigo}/progressao`, { ...o, cabecalhos: { "x-idioma": "en" } })).d;
  assert.equal(p.subclasse.lista[1].nome, "Guardian");
  assert.equal(p.subclasse.atual, "guardiao");

  // editar a aparência depois não apaga a progressão, e a ficha mandada pelo app não a inventa
  r = await post("/api/salvar-ficha", { codigo, ficha: { ...fichaBase("Ana Maria"), talentos: ["negociador", "sede_de_sangue", "pes_ligeiros"], subclasse: "campeao" } }, o);
  assert.equal(r.d.ficha.nome, "Ana Maria");
  assert.deepEqual([r.d.ficha.talentos, r.d.ficha.subclasse], [["couraca", "olhar_atento"], "guardiao"]);
});

test("no saguão o app não inventa talentos nem subclasse", async () => {
  const { d } = await post("/api/mesa/criar", { nome: "Ana" }, { token: ana.token });
  await post("/api/salvar-ficha", { codigo: d.codigo, ficha: fichaBase("Ana") }, { token: ana.token });
  mudarFicha(d.codigo, ana.id, { nivel: 6 });
  const r = await post("/api/salvar-ficha", { codigo: d.codigo, ficha: { ...fichaBase("Ana"), nivel: 6, talentos: ["couraca", "negociador"], subclasse: "campeao", redistribuicoes: 0 } }, { token: ana.token });
  assert.equal(r.st, 200);
  assert.equal(r.d.ficha.talentos, undefined);
  assert.equal(r.d.ficha.subclasse, undefined);
  assert.deepEqual(r.d.ficha.escolhas, { talentos: 3, subclasse: true });
});

test("redistribuir: grátis uma vez, depois custa ouro; recusa no combate e com a soma errada", async () => {
  const codigo = await mesaEmJogo([ana]);
  const o = { token: ana.token };
  const novos = { for: 12, des: 16, con: 14, int: 8, sab: 12, car: 10 };
  assert.equal((await post("/api/redistribuir", { codigo, atributos: { ...novos, for: 13 } }, o)).st, 400);
  let r = await post("/api/redistribuir", { codigo, atributos: novos }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual(r.d.ficha.atributos, novos);
  assert.equal(r.d.ficha.redistribuicoes, 1);
  assert.equal(r.d.ficha.ouro, 15);                                     // a primeira é grátis
  assert.deepEqual([r.d.progressao.redistribuir.gratis, r.d.progressao.redistribuir.custo], [false, 75]);
  // a segunda custa 50 + 25 × nível, e sem ouro não sai
  const volta = { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 };
  r = await post("/api/redistribuir", { codigo, atributos: volta }, o);
  assert.equal(r.st, 409);
  assert.match(r.d.error, /Falta ouro: redistribuir custa 75/);
  mudarFicha(codigo, ana.id, { ouro: 100 });
  r = await post("/api/redistribuir", { codigo, atributos: { ...volta, con: 16, for: 14 } }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.ficha.ouro, r.d.ficha.redistribuicoes], [25, 2]);
  assert.equal(r.d.ficha.pv, r.d.ficha.pvMax);                          // a vida acompanha a Constituição nova
  assert.ok((await textos(codigo, ana)).includes("Ana redistribuiu os atributos (−75 de ouro)."));
  // em combate, não
  await agir(codigo, ana, "acordo o ogro");
  assert.equal((await post("/api/redistribuir", { codigo, atributos: volta }, o)).st, 409);
});

test("combate: a CA dos talentos aparece no ataque do inimigo e o Último Suspiro segura o personagem", async () => {
  const codigo = await mesaEmJogo([ana]);
  mudarFicha(codigo, ana.id, { nivel: 4, talentos: ["couraca", "ultimo_suspiro"], pv: 20 });
  await agir(codigo, ana, "acordo o ogro");                             // o ogro ganha a iniciativa e bate primeiro: 41 de dano
  let linhas = await textos(codigo, ana);
  assert.match(linhas.find((l) => l.startsWith("Ogro ataca Ana")), /vs CA 17 \(talentos \+1\) → /);
  // só um 1 natural faz o ogro errar: se errou, Ana passa a vez até ele acertar
  for (let i = 0; i < 12 && !linhas.some((l) => /^Ogro ataca Ana.*acertou/.test(l)); i++) {
    assert.equal((await post("/api/encerrar-turno", { codigo }, { token: ana.token })).st, 200);
    linhas = await textos(codigo, ana);
  }
  assert.match(linhas.find((l) => /^Ogro ataca Ana.*acertou/.test(l)), /vs CA 17 \(talentos \+1\) → (crítico, )?acertou, \d+ de dano$/);
  assert.ok(linhas.includes("Ana resiste por um fio e fica com 1 PV (Último Suspiro)."));
  assert.equal(lerFicha(codigo, ana.id).pv, 1);
  assert.equal(JSON.parse(mesaDb(codigo).combate).suspiro[ana.id], true);
});

test("votação: abre, todos votam, o resultado vai para o diário e para o Mestre", async () => {
  const codigo = await mesaEmJogo([ana, beto, caio]);
  const o = (j) => ({ token: j.token });
  assert.equal((await post(`/api/mesa/${codigo}/votacao`, { pergunta: "Vamos?", opcoes: ["Sim"] }, o(ana))).st, 400);
  for (const j of [ana, beto, caio]) await mesaDe(codigo, j);                    // os três estão com o app novo aberto na mesa
  let r = await post(`/api/mesa/${codigo}/votacao`, { pergunta: "Aceitamos o acordo do barão?", opcoes: ["Aceitar", "Recusar"] }, o(ana));
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal((await post(`/api/mesa/${codigo}/votacao`, { pergunta: "Outra?", opcoes: ["a", "b"] }, o(beto))).st, 409);
  let m = await mesaDe(codigo, beto);
  assert.deepEqual([m.votacao.pergunta, m.votacao.opcoes, m.votacao.nomePor, m.votacao.origem], ["Aceitamos o acordo do barão?", ["Aceitar", "Recusar"], "Ana", "jogador"]);
  assert.equal("votacaoGrupo" in m, false);
  assert.ok(m.votacao.restante > 80_000 && m.votacao.restante <= 90_000);

  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 5 }, o(ana))).st, 400);
  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 1 }, o(ana))).d.encerrada, false);
  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 0 }, o(beto))).d.encerrada, false);
  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 1 }, o(beto))).d.encerrada, false);   // Beto muda de ideia
  r = await post(`/api/mesa/${codigo}/votar`, { opcao: 1 }, o(caio));
  assert.deepEqual([r.d.encerrada, r.d.vencedora], [true, 1]);
  m = await mesaDe(codigo, ana);
  assert.equal(m.votacao, undefined);
  const linhas = await textos(codigo, ana);
  assert.ok(linhas.includes('Votação aberta por Ana: "Aceitamos o acordo do barão?" (Aceitar / Recusar)'));
  assert.ok(linhas.includes('Votação encerrada: "Aceitamos o acordo do barão?" — o grupo escolheu "Recusar". Placar: Aceitar: 0 · Recusar: 3.'));
  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 0 }, o(ana))).st, 409);
  // o Mestre lê o resultado no histórico da próxima ação
  await agir(codigo, ana, "escalo o muro");
  assert.ok(registro.ultimoPrompt.includes('(Votação encerrada: "Aceitamos o acordo do barão?" — o grupo escolheu "Recusar".'));
  assert.ok(registro.ultimoPrompt.includes("VOTAÇÃO DO GRUPO:"));
});

test("votação: o Mestre abre, quem abriu ou o dono encerra, e o prazo fecha sozinho", async () => {
  const codigo = await mesaEmJogo([ana, beto]);
  // Beto ainda está com o app antigo: o Mestre não abre votação (ninguém ficaria esperando 90 s por um voto que não vem)
  await mesaDe(codigo, ana);
  await get(`/api/mesa/${codigo}`, { token: beto.token, antigo: true });
  await agir(codigo, beto, "chego na escada");
  assert.equal((await mesaDe(codigo, ana)).votacao, undefined);
  assert.equal(registro.ultimoPrompt.includes("VOTAÇÃO DO GRUPO"), false);
  // Beto atualiza o app: agora o Mestre pode
  await mesaDe(codigo, beto);
  await agir(codigo, beto, "chego na escada");
  let m = await mesaDe(codigo, ana);
  assert.deepEqual([m.votacao.pergunta, m.votacao.origem, m.votacao.opcoes], ["Descer mais um andar?", "mestre", ["Descer", "Voltar"]]);
  assert.ok((await textos(codigo, ana)).includes('Votação aberta pelo Mestre: "Descer mais um andar?" (Descer / Voltar)'));
  // com uma votação aberta o Mestre não abre outra, e é avisado disso
  await agir(codigo, ana, "olho em volta");
  assert.equal((await mesaDe(codigo, ana)).votacao.pergunta, "Descer mais um andar?");
  assert.ok(registro.ultimoPrompt.includes('há uma votação aberta ("Descer mais um andar?")'));
  // Beto não abriu nem é o dono; Ana é a dona
  assert.equal((await post(`/api/mesa/${codigo}/votacao/encerrar`, {}, { token: beto.token })).st, 403);
  await post(`/api/mesa/${codigo}/votar`, { opcao: 0 }, { token: beto.token });
  const r = await post(`/api/mesa/${codigo}/votacao/encerrar`, {}, { token: ana.token });
  assert.deepEqual([r.st, r.d.vencedora], [200, 0]);
  // prazo vencido: a leitura da mesa fecha a votação (sem votos, só cancela)
  await post(`/api/mesa/${codigo}/votacao`, { pergunta: "Dormimos aqui?", opcoes: ["Sim", "Não"] }, { token: ana.token });
  const v = JSON.parse(mesaDb(codigo).votacaoGrupo);
  db.prepare("UPDATE mesas SET votacaoGrupo = ? WHERE codigo = ?").run(JSON.stringify({ ...v, ate: Date.now() - 1 }), codigo);
  m = await mesaDe(codigo, ana);
  assert.equal(m.votacao, undefined);
  assert.equal(mesaDb(codigo).votacaoGrupo, null);
  assert.ok((await textos(codigo, ana)).includes('Votação encerrada sem votos: "Dormimos aqui?"'));
  // nenhuma linha de votação é narração (o app leria em voz alta)
  const log = (await get(`/api/mesa/${codigo}/log`, { token: ana.token })).d;
  assert.ok(log.filter((e) => e.texto.startsWith("Votação")).every((e) => e.tipo === "sys"));
});

test("minigame: aparece em Prestidigitação e Investigação, soma o bônus uma vez e o dado segue valendo", async () => {
  const codigo = await mesaEmJogo([ana, beto]);
  const o = { token: ana.token };
  let d = await agir(codigo, ana, "abro a fechadura");
  assert.deepEqual(d.rolagem.minigame, { tipo: "fechadura", alvo: 3 });
  const bonusAntes = d.rolagem.bonus;
  assert.match(d.rolagem.rotulo, /^Prestidigitação \(chance \d+%\)$/);
  assert.equal((await post("/api/minigame", { codigo, acertos: 3 }, { token: beto.token })).st, 409);   // a rolagem é da Ana
  assert.equal((await post("/api/minigame", { codigo, acertos: -1 }, o)).st, 400);
  let r = await post("/api/minigame", { codigo, acertos: 3 }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.deepEqual([r.d.ajuste, r.d.rolagem.bonus, r.d.rolagem.minigame.feito], [2, bonusAntes + 2, true]);
  const chance = (rotulo) => Number(rotulo.match(/chance (\d+)%/)[1]);
  assert.equal(chance(r.d.rolagem.rotulo), chance(d.rolagem.rotulo) + 10);                               // +2 no bônus = +10% de chance
  assert.equal((await post("/api/minigame", { codigo, acertos: 3 }, o)).st, 409);                        // só uma vez por rolagem
  assert.ok((await textos(codigo, ana)).includes("Ana enfrentou a fechadura e se saiu com perfeição: +2 na rolagem."));
  r = await post("/api/rolar", { codigo, valor: 10 }, o);
  assert.equal(r.st, 200, JSON.stringify(r.d));
  assert.equal(r.d.total, 10 + bonusAntes + 2);

  d = await agir(codigo, ana, "leio as runas");
  assert.deepEqual(d.rolagem.minigame, { tipo: "runas", alvo: 5 });
  r = await post("/api/minigame", { codigo, acertos: 0 }, o);
  assert.equal(r.d.ajuste, -1);
  await post("/api/rolar", { codigo, valor: 10 }, o);
  // outras perícias não têm desafio, e quem não joga rola como sempre
  d = await agir(codigo, ana, "escalo o muro");
  assert.equal(d.rolagem.minigame, undefined);
  assert.equal((await post("/api/minigame", { codigo, acertos: 3 }, o)).st, 409);
  assert.equal((await post("/api/rolar", { codigo, valor: 10 }, o)).st, 200);
});

const abrirWs = () => new Promise((ok, falha) => { const ws = new WebSocket(base.replace("http", "ws")); abertos.push(ws); ws.on("open", () => ok(ws)); ws.on("error", falha); });
/** Próxima mensagem do WebSocket com esse evento (até 2 s). */
function esperar(ws, evento) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => { ws.off("message", ouvir); falha(new Error(`sem "${evento}"`)); }, 2000);
    const ouvir = (data) => { const m = JSON.parse(data); if (m.evento === evento) { clearTimeout(t); ws.off("message", ouvir); ok(m); } };
    ws.on("message", ouvir);
  });
}

test("projeção: a TV pede o QR, o jogador pareia, a tela recebe a mesa e os avisos em tempo real", async () => {
  const codigo = await mesaEmJogo([ana, beto]);
  const nova = await post("/api/projecao/nova", {});
  assert.equal(nova.st, 200, JSON.stringify(nova.d));
  const { id, chave } = nova.d;
  assert.match(id, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(nova.d.conteudo, `MESAVIVA-TV:${id}`);
  assert.match(nova.d.qr, /^<svg /);
  const tela = { cabecalhos: { "x-projecao-chave": chave } };
  // antes de parear: nada da mesa; sem a chave certa, nem isso
  assert.deepEqual(Object.keys((await get(`/api/projecao/${id}/estado`, tela)).d).sort(), ["agora", "pareada"]);
  assert.equal((await get(`/api/projecao/${id}/estado`)).st, 404);
  assert.equal((await get(`/api/projecao/${id}/estado`, { cabecalhos: { "x-projecao-chave": "errada" } })).st, 404);
  assert.notEqual(db.prepare("SELECT chave FROM projecoes WHERE id = ?").get(id).chave, chave);          // no banco só fica o hash

  // a tela conecta pelo WebSocket com a chave dela; quem não tem a chave é recusado
  const ws = await abrirWs();
  let espera = esperar(ws, "pronto");
  ws.send(JSON.stringify({ projecao: id, chave }));
  assert.equal((await espera).dados.pareada, false);
  const intruso = await abrirWs();
  espera = esperar(intruso, "recusado");
  intruso.send(JSON.stringify({ projecao: id, chave: "x" }));
  await espera;
  intruso.close();

  // só um jogador da mesa, logado, pareia
  assert.equal((await post("/api/projecao/parear", { codigo, id })).st, 401);
  assert.equal((await post("/api/projecao/parear", { codigo, id }, { token: caio.token })).st, 403);
  assert.equal((await post("/api/projecao/parear", { codigo, id: "ZZZZZZ" }, { token: ana.token })).st, 404);
  espera = esperar(ws, "pareada");
  let r = await post("/api/projecao/parear", { codigo, id: `mesaviva-tv:${id.toLowerCase()}` }, { token: ana.token });
  assert.deepEqual([r.st, r.d.telas], [200, 1]);
  await espera;
  assert.deepEqual((await mesaDe(codigo, beto)).projecoes, [id]);

  // a tela agora lê a mesa: cena, personagens, diário — e nenhum segredo
  let e = (await get(`/api/projecao/${id}/estado`, tela)).d;
  assert.equal(e.pareada, true);
  assert.deepEqual([e.mesa.codigo, e.mesa.fase, e.combate], [codigo, "jogo", null]);
  assert.deepEqual(e.fichas.map((f) => f.nome).sort(), ["Ana", "Beto"]);
  assert.ok(e.log.some((l) => l.tipo === "narr"));
  const bruto = JSON.stringify(e);
  for (const segredo of ["SEGREDO-", "CENA-1", "DESFECHO-", "@teste.com", ana.token, "anotacoes", "arco"]) assert.equal(bruto.includes(segredo), false, segredo);

  // combate: a tela recebe o aviso na hora e passa a ver o tabuleiro
  espera = esperar(ws, "narrativa");
  await agir(codigo, ana, "acordo o ogro");
  await espera;
  e = (await get(`/api/projecao/${id}/estado`, tela)).d;
  assert.deepEqual([e.combate.mapa.colunas, e.combate.mapa.linhas, e.combate.inimigos[0].nome], [10, 14, "Ogro"]);
  assert.ok(e.combate.posicoes[ana.id] && e.combate.posicoes.ini_0);
  assert.ok(e.log.some((l) => l.texto.startsWith("Ogro ataca ")));

  // uma tela não vai para duas mesas; encerrar desliga a tela e apaga o acesso
  const outra = await mesaEmJogo([caio]);
  assert.equal((await post("/api/projecao/parear", { codigo: outra, id }, { token: caio.token })).st, 409);
  espera = esperar(ws, "encerrada");
  r = await post("/api/projecao/encerrar", { codigo }, { token: beto.token });
  assert.deepEqual([r.st, r.d.encerradas], [200, 1]);
  await espera;
  assert.equal((await get(`/api/projecao/${id}/estado`, tela)).st, 404);
  assert.equal((await mesaDe(codigo, ana)).projecoes, undefined);
  ws.close();
});

test("projeção: telas esquecidas expiram e a página da TV existe", async () => {
  const nova = (await post("/api/projecao/nova", {})).d;
  db.prepare("UPDATE projecoes SET criadaEm = ? WHERE id = ?").run(Date.now() - 16 * 60_000, nova.id);
  assert.equal((await get(`/api/projecao/${nova.id}/estado`, { cabecalhos: { "x-projecao-chave": nova.chave } })).st, 404);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM projecoes WHERE id = ?").get(nova.id).n, 0);
  const pagina = await fetch(`${base}/projecao.html`);
  assert.equal(pagina.status, 200);
  const html = await pagina.text();
  assert.ok(html.includes("/api/projecao/nova"));
  // a página não carrega nada de fora do próprio servidor
  assert.equal(/(src|href)\s*=\s*["']https?:\/\//i.test(html), false);
});

test("votação aberta por jogador em mesa mista: fecha quando votam todos os que têm o app novo", async () => {
  const codigo = await mesaEmJogo([ana, beto, caio]);
  await mesaDe(codigo, ana);
  await mesaDe(codigo, beto);
  await get(`/api/mesa/${codigo}`, { token: caio.token, antigo: true });         // Caio não tem a tela de votar
  await post(`/api/mesa/${codigo}/votacao`, { pergunta: "Atravessamos a ponte?", opcoes: ["Sim", "Não"] }, { token: ana.token });
  assert.equal((await post(`/api/mesa/${codigo}/votar`, { opcao: 0 }, { token: ana.token })).d.encerrada, false);
  const r = await post(`/api/mesa/${codigo}/votar`, { opcao: 0 }, { token: beto.token });
  assert.deepEqual([r.d.encerrada, r.d.vencedora], [true, 0]);                   // não fica esperando o Caio
});

test("app antigo: a mesa e a ficha de quem não usa nada disso não ganham campos novos", async () => {
  const codigo = await mesaEmJogo([ana]);
  const m = (await get(`/api/mesa/${codigo}`, { token: ana.token, antigo: true })).d;
  for (const k of ["votacao", "votacaoGrupo", "projecoes"]) assert.equal(k in m, false, k);
  const f = (await get(`/api/mesa/${codigo}/fichas`, { token: ana.token })).d[ana.id];
  for (const k of ["talentos", "subclasse", "redistribuicoes", "escolhas", "bonus"]) assert.equal(k in f, false, k);
});
