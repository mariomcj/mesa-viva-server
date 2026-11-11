/**
 * Testes das métricas do painel de administração (GET /api/admin/metricas) com o servidor de verdade e banco temporário,
 * mais a função de consulta sozinha num banco em memória mínimo (sem `uso_ia_diario` e sem as colunas novas).
 * Rodar: npm test
 */
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-painel-"));
process.env.DB_PATH = path.join(pasta, "teste.db");
process.env.OPENROUTER_API_KEY = "chave-falsa";
process.env.LOG_REQUESTS = "0";
process.env.IMAGENS_DE_FUNDO = "0";
process.env.IMAGENS_DE_MAPA = "0";
process.env.RATE_MULTIPLICADOR = "1000";
process.env.ADMIN_PASS = "senha-do-admin-de-teste";
delete process.env.FUSO_MINUTOS;                       // os testes valem para o padrão (Brasília, -180)
require("./mestre-falso");
const Database = require("better-sqlite3");
const P = require("../painel");
const { server, db } = require("../server");

const FUSO = -180, DIA_MS = 86_400_000;
const CHAVES = {
  raiz: ["dias", "desde", "ate", "geradoEm", "totais", "periodo", "anterior", "serie", "horas", "temas", "idiomas", "niveis", "classes", "modelos", "mesasMaisAtivas"],
  totais: ["usuarios", "mesas", "mesasEmJogo", "mesasNoSaguao", "aventurasConcluidas", "fichas", "narracoes", "acoes", "rolagens", "jogadoresAtivos7d", "usuariosNovos7d", "mesasAtivas7d"],
  periodo: ["usuariosNovos", "mesasNovas", "narracoes", "acoes", "rolagens", "chamadasIA", "tokensEntrada", "tokensSaida", "custo", "imagens", "fundosReaproveitados"],
  serie: ["dia", "usuariosNovos", "mesasNovas", "narracoes", "acoes", "rolagens", "jogadoresAtivos", "chamadasIA", "tokensEntrada", "tokensSaida", "custo", "imagens", "fundosReaproveitados"],
};
const ordenadas = (o) => Object.keys(o).sort();

let base, admin;
after(() => { server.close(); server.closeAllConnections?.(); db.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

async function get(rota, token) {
  const r = await fetch(base + rota, { headers: token ? { "X-Admin-Token": token } : {} });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = txt; }
  return { st: r.status, d };
}

// Dias de referência: hoje no fuso de Brasília e o meio-dia de `n` dias atrás (longe da virada do dia)
const hoje = P.diaDoFuso(Date.now(), FUSO);
const dia = (n) => P.somarDias(hoje, -n);
const meioDia = (n) => P.inicioDoDia(dia(n), FUSO) + 12 * 3_600_000;
const hora = (n, h) => P.inicioDoDia(dia(n), FUSO) + h * 3_600_000 + 60_000;

before(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "admin", pass: "senha-do-admin-de-teste" }) });
  assert.equal(r.status, 200);
  admin = (await r.json()).token;
});

test("sem login, 401; com token inválido, 401", async () => {
  assert.equal((await get("/api/admin/metricas")).st, 401);
  assert.equal((await get("/api/admin/metricas?dias=7", "token-que-nao-existe")).st, 401);
});

test("banco vazio: contrato completo, série com um item por dia em ordem crescente e tudo zerado", async () => {
  const { st, d } = await get("/api/admin/metricas", admin);
  assert.equal(st, 200, JSON.stringify(d));
  assert.deepEqual(ordenadas(d), [...CHAVES.raiz].sort());
  assert.deepEqual(ordenadas(d.totais), [...CHAVES.totais].sort());
  assert.deepEqual(ordenadas(d.periodo), [...CHAVES.periodo].sort());
  assert.deepEqual(ordenadas(d.anterior), [...CHAVES.periodo].sort());
  assert.deepEqual([d.dias, d.ate, d.desde], [30, hoje, dia(29)]);
  assert.ok(Math.abs(d.geradoEm - Date.now()) < 60_000);

  assert.equal(d.serie.length, 30);
  assert.deepEqual(d.serie.map((s) => s.dia), Array.from({ length: 30 }, (_, i) => dia(29 - i)));
  for (const s of d.serie) {
    assert.deepEqual(ordenadas(s), [...CHAVES.serie].sort());
    assert.ok(CHAVES.serie.filter((k) => k !== "dia").every((k) => s[k] === 0), JSON.stringify(s));
  }
  assert.ok(Object.values(d.totais).every((v) => v === 0));
  assert.ok(Object.values(d.periodo).every((v) => v === 0) && Object.values(d.anterior).every((v) => v === 0));
  assert.deepEqual(d.horas, new Array(24).fill(0));
  assert.deepEqual(d.idiomas, { pt: 0, en: 0 });
  assert.deepEqual([d.temas, d.niveis, d.classes, d.modelos, d.mesasMaisAtivas], [[], [], [], [], []]);
});

test("`dias` fora do limite é ajustado (7 a 180; sem valor ou com lixo, 30)", async () => {
  const pedir = async (q) => { const { d } = await get(`/api/admin/metricas${q}`, admin); return [d.dias, d.serie.length, d.desde]; };
  assert.deepEqual(await pedir("?dias=1"), [7, 7, dia(6)]);
  assert.deepEqual(await pedir("?dias=-5"), [7, 7, dia(6)]);
  assert.deepEqual(await pedir("?dias=9999"), [180, 180, dia(179)]);
  assert.deepEqual(await pedir("?dias=14"), [14, 14, dia(13)]);
  assert.deepEqual(await pedir("?dias=abc"), [30, 30, dia(29)]);
  assert.deepEqual(await pedir("?dias="), [30, 30, dia(29)]);
  assert.deepEqual([P.limitarDias(undefined), P.limitarDias("45"), P.limitarDias(6.6), P.limitarDias(181)], [30, 45, 7, 180]);
});

test("contagens com dados conhecidos: totais, período, período anterior, série, horas, temas, personagens, modelos e mesas mais ativas", async () => {
  // contas: 2 hoje, 1 há 3 dias, 1 há 10 dias (fora dos 7 dias), 1 no período anterior (há 40 dias), 1 antes de tudo (há 100 dias)
  const conta = db.prepare("INSERT INTO usuarios (id, nome, email, senha, criadoEm) VALUES (?, ?, ?, '', ?)");
  [["u1", 0], ["u2", 0], ["u3", 3], ["u4", 10], ["u5", 40], ["u6", 100]].forEach(([id, n]) => conta.run(id, `Conta ${id}`, `${id}@painel.test`, meioDia(n)));

  // mesas: temas e idiomas variados; uma com tema que não existe mais (conta como o clássico)
  const mesa = db.prepare("INSERT INTO mesas (codigo, dono, fase, cena, tema, idioma, arcoConcluido, criadaEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  mesa.run("AAAAA", "u1", "jogo", "Taverna do Javali", "classico", "pt", 0, meioDia(2));
  mesa.run("BBBBB", "u2", "jogo", "Convés do Albatroz", "piratas", "en", 1, meioDia(5));
  mesa.run("CCCCC", "u3", "lobby", "", "piratas", "pt", 0, meioDia(0));
  mesa.run("DDDDD", "u4", "jogo", "Beco de Neon", "tema-que-sumiu", "pt", 1, meioDia(45));
  const membro = db.prepare("INSERT INTO membros (codigo, uid, nome, ultimaAtividade) VALUES (?, ?, ?, ?)");
  membro.run("AAAAA", "u1", "Ana", meioDia(1));
  membro.run("AAAAA", "u2", "Beto", meioDia(20));
  membro.run("BBBBB", "u2", "Beto", meioDia(20));
  membro.run("BBBBB", "u5", "Caio", meioDia(3));          // não agiu, mas esteve na mesa nos últimos 7 dias
  membro.run("BBBBB", "u6", "Dora", 0);

  const ficha = db.prepare("INSERT INTO fichas (codigo, uid, dados) VALUES (?, ?, ?)");
  ficha.run("AAAAA", "u1", JSON.stringify({ nome: "Ana", classe: "Guerreiro", nivel: 3 }));
  ficha.run("AAAAA", "u2", JSON.stringify({ nome: "Beto", classe: "Mago", nivel: 1 }));
  ficha.run("BBBBB", "u2", JSON.stringify({ nome: "Beto", classe: "Guerreiro", nivel: 3 }));
  ficha.run("BBBBB", "u5", JSON.stringify({ nome: "Caio", classe: "Guerreiro" }));            // sem nível: conta como 1
  ficha.run("BBBBB", "u6", "isto não é JSON");                                                 // ficha estragada não derruba nada

  // diário: (mesa, tipo, autor, quando)
  const linha = db.prepare("INSERT INTO log (codigo, t, tipo, texto, autor, nome) VALUES (?, ?, ?, 'x', ?, ?)");
  const log = (codigo, tipo, autor, t, vezes = 1) => { for (let i = 0; i < vezes; i++) linha.run(codigo, t + i, tipo, autor, autor ? `Nome ${autor}` : null); };
  log("AAAAA", "narr", null, hora(0, 20), 3);            // hoje, 20h
  log("AAAAA", "narr", null, hora(1, 9), 2);             // ontem, 9h
  log("BBBBB", "narr", null, hora(1, 20), 1);            // ontem, 20h
  log("BBBBB", "narr", null, hora(12, 0), 4);            // há 12 dias, meia-noite (fora dos 7 dias)
  log("DDDDD", "narr", null, meioDia(35), 5);            // período anterior
  log("DDDDD", "narr", null, meioDia(70), 6);            // antes de tudo: só entra nos totais
  log("AAAAA", "acao", "u1", hora(0, 19), 2);
  log("AAAAA", "acao", "u2", hora(0, 19), 1);
  log("AAAAA", "acao", "u1", hora(1, 9), 1);
  log("BBBBB", "acao", "u6", hora(12, 0), 3);
  log("DDDDD", "acao", "u4", meioDia(35), 2);
  log("AAAAA", "roll", "u1", hora(0, 19), 2);
  log("DDDDD", "roll", "u4", meioDia(35), 1);
  log("AAAAA", "sys", null, hora(0, 21), 7);             // avisos do sistema não contam
  log("BBBBB", "chat", "u2", hora(0, 22), 1);            // nem conversa (mas vale como última atividade da mesa)

  // uso da IA (dia em UTC, como a tabela guarda)
  const uso = db.prepare("INSERT INTO uso_ia_diario (dia, tipo, modelo, chamadas, entrada, saida, custo) VALUES (?, ?, ?, ?, ?, ?, ?)");
  uso.run(dia(0), "texto", "barato/rapido", 10, 40000, 3000, 0.1);
  uso.run(dia(0), "texto", "caro/caprichado", 2, 9000, 800, 0.2);
  uso.run(dia(1), "texto", "barato/rapido", 5, 20000, 1500, 0.05);
  uso.run(dia(0), "imagem", "google/imagem", 3, 0, 0, 0.12);
  uso.run(dia(4), "mapa", "google/imagem", 1, 0, 0, 0);
  uso.run(dia(0), "fundo-reaproveitado", "-", 4, 0, 0, 0);
  uso.run(dia(1), "fundo-biblioteca", "-", 2, 0, 0, 0);
  uso.run(dia(33), "texto", "barato/rapido", 7, 30000, 2000, 0.07);      // período anterior
  uso.run(dia(33), "imagem", "google/imagem", 1, 0, 0, 0.04);
  uso.run(dia(33), "fundo-reaproveitado", "-", 9, 0, 0, 0);
  uso.run(dia(90), "texto", "barato/rapido", 99, 1, 1, 9);               // antes de tudo: fora

  const { st, d } = await get("/api/admin/metricas?dias=30", admin);
  assert.equal(st, 200, JSON.stringify(d));

  assert.deepEqual(d.totais, { usuarios: 6, mesas: 4, mesasEmJogo: 3, mesasNoSaguao: 1, aventurasConcluidas: 2, fichas: 5,
    narracoes: 21, acoes: 9, rolagens: 3,
    jogadoresAtivos7d: 3,          // u1 e u2 agiram; u5 esteve na mesa
    usuariosNovos7d: 3, mesasAtivas7d: 2 });
  assert.deepEqual(d.periodo, { usuariosNovos: 4, mesasNovas: 3, narracoes: 10, acoes: 7, rolagens: 2,
    chamadasIA: 17, tokensEntrada: 69000, tokensSaida: 5300, custo: 0.47, imagens: 3, fundosReaproveitados: 6 });
  assert.deepEqual(d.anterior, { usuariosNovos: 1, mesasNovas: 1, narracoes: 5, acoes: 2, rolagens: 1,
    chamadasIA: 7, tokensEntrada: 30000, tokensSaida: 2000, custo: 0.11, imagens: 1, fundosReaproveitados: 9 });          // o custo inclui a imagem

  // série: um item por dia; os dias com dados batem e os outros ficam zerados
  assert.equal(d.serie.length, 30);
  const s = Object.fromEntries(d.serie.map((x) => [x.dia, x]));
  assert.deepEqual(s[dia(0)], { dia: dia(0), usuariosNovos: 2, mesasNovas: 1, narracoes: 3, acoes: 3, rolagens: 2, jogadoresAtivos: 2,
    chamadasIA: 12, tokensEntrada: 49000, tokensSaida: 3800, custo: 0.42, imagens: 3, fundosReaproveitados: 4 });
  assert.deepEqual(s[dia(1)], { dia: dia(1), usuariosNovos: 0, mesasNovas: 0, narracoes: 3, acoes: 1, rolagens: 0, jogadoresAtivos: 1,
    chamadasIA: 5, tokensEntrada: 20000, tokensSaida: 1500, custo: 0.05, imagens: 0, fundosReaproveitados: 2 });
  assert.deepEqual([s[dia(12)].narracoes, s[dia(12)].acoes, s[dia(12)].jogadoresAtivos], [4, 3, 1]);
  assert.deepEqual([s[dia(2)].mesasNovas, s[dia(5)].mesasNovas, s[dia(3)].usuariosNovos, s[dia(10)].usuariosNovos], [1, 1, 1, 1]);
  const comDados = new Set([0, 1, 2, 3, 5, 10, 12].map(dia));
  for (const x of d.serie.filter((x) => !comDados.has(x.dia))) assert.ok(CHAVES.serie.filter((k) => k !== "dia").every((k) => x[k] === 0), JSON.stringify(x));
  // a soma da série é o total do período
  for (const k of CHAVES.periodo.filter((k) => k !== "custo")) assert.equal(d.serie.reduce((a, x) => a + x[k], 0), d.periodo[k], k);

  // narrações por hora, no fuso de Brasília
  const horas = new Array(24).fill(0); horas[20] = 4; horas[9] = 2; horas[0] = 4;
  assert.deepEqual(d.horas, horas);

  assert.deepEqual(d.temas, [{ id: "classico", nome: "Fantasia Clássica", mesas: 2 }, { id: "piratas", nome: require("../temas").temaPorId("piratas").nome, mesas: 2 }]
    .sort((a, b) => b.mesas - a.mesas || a.nome.localeCompare(b.nome)));
  assert.deepEqual(d.idiomas, { pt: 3, en: 1 });
  assert.deepEqual(d.niveis, [{ nivel: 1, personagens: 2 }, { nivel: 3, personagens: 2 }]);
  assert.deepEqual(d.classes, [{ classe: "Guerreiro", personagens: 3 }, { classe: "Mago", personagens: 1 }]);

  // modelos do período, por custo e depois por chamadas; os fundos reaproveitados não são modelo
  assert.deepEqual(d.modelos, [
    { modelo: "caro/caprichado", tipo: "texto", chamadas: 2, entrada: 9000, saida: 800, custo: 0.2 },
    { modelo: "barato/rapido", tipo: "texto", chamadas: 15, entrada: 60000, saida: 4500, custo: 0.15 },
    { modelo: "google/imagem", tipo: "imagem", chamadas: 3, entrada: 0, saida: 0, custo: 0.12 },
    { modelo: "google/imagem", tipo: "mapa", chamadas: 1, entrada: 0, saida: 0, custo: 0 },
  ]);

  // mesas com mais narrações no período (a DDDDD só narrou antes dele)
  assert.deepEqual(d.mesasMaisAtivas, [
    { codigo: "AAAAA", cena: "Taverna do Javali", tema: "Fantasia Clássica", fase: "jogo", narracoes: 5, jogadores: 2, ultimaAtividade: hora(0, 21) + 6 },
    { codigo: "BBBBB", cena: "Convés do Albatroz", tema: require("../temas").temaPorId("piratas").nome, fase: "jogo", narracoes: 5, jogadores: 3, ultimaAtividade: hora(0, 22) },
  ]);

  // 7 dias: só o que cabe na janela
  const sete = (await get("/api/admin/metricas?dias=7", admin)).d;
  assert.deepEqual([sete.periodo.narracoes, sete.periodo.usuariosNovos, sete.periodo.mesasNovas, sete.periodo.chamadasIA], [6, 3, 3, 17]);
  assert.deepEqual([sete.anterior.narracoes, sete.anterior.usuariosNovos, sete.anterior.acoes], [4, 1, 3]);      // dos 7 aos 13 dias atrás
  assert.deepEqual(sete.totais, d.totais);
});

test("mais de 8 mesas com narração: só as 8 mais ativas, em ordem", async () => {
  const linha = db.prepare("INSERT INTO log (codigo, t, tipo, texto) VALUES (?, ?, 'narr', 'x')");
  for (let i = 1; i <= 9; i++) for (let k = 0; k < 10 + i; k++) linha.run(`MESA${i}`, hora(2, 15) + k);
  const { d } = await get("/api/admin/metricas", admin);
  assert.equal(d.mesasMaisAtivas.length, 8);
  assert.deepEqual(d.mesasMaisAtivas.map((m) => [m.codigo, m.narracoes]), [9, 8, 7, 6, 5, 4, 3, 2].map((i) => [`MESA${i}`, 10 + i]));
  // mesa que só existe no diário (apagada pela metade): campos vazios, sem erro
  assert.deepEqual([d.mesasMaisAtivas[0].cena, d.mesasMaisAtivas[0].fase, d.mesasMaisAtivas[0].jogadores], ["", "", 0]);
  db.prepare("DELETE FROM log WHERE codigo LIKE 'MESA%'").run();
});

test("o fuso decide o dia: 23h de Brasília (2h UTC do dia seguinte) fica no dia de Brasília", () => {
  const t = Date.parse("2026-03-11T02:00:00Z");
  assert.equal(P.diaDoFuso(t, -180), "2026-03-10");
  assert.equal(P.diaDoFuso(t, 0), "2026-03-11");
  assert.equal(P.inicioDoDia("2026-03-10", -180), Date.parse("2026-03-10T03:00:00Z"));
  assert.equal(P.somarDias("2026-03-01", -1), "2026-02-28");

  const banco = new Database(":memory:");
  banco.exec("CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, t INTEGER, tipo TEXT, texto TEXT, autor TEXT)");
  banco.prepare("INSERT INTO log (codigo, t, tipo, texto) VALUES ('X', ?, 'narr', 'x')").run(t);
  const agora = Date.parse("2026-03-12T15:00:00Z");
  const br = P.calcularMetricas(banco, { dias: 7, agora, fusoMin: -180, avisar: false });
  assert.deepEqual([br.ate, br.serie.find((s) => s.narracoes).dia, br.horas[23]], ["2026-03-12", "2026-03-10", 1]);
  const utc = P.calcularMetricas(banco, { dias: 7, agora, fusoMin: 0, avisar: false });
  assert.deepEqual([utc.serie.find((s) => s.narracoes).dia, utc.horas[2]], ["2026-03-11", 1]);
  // FUSO_MINUTOS no ambiente
  process.env.FUSO_MINUTOS = "0";
  try { assert.equal(P.calcularMetricas(banco, { dias: 7, agora, avisar: false }).horas[2], 1); } finally { delete process.env.FUSO_MINUTOS; }
  assert.equal(P.fusoDoAmbiente(), -180);
  banco.close();
});

test("banco mínimo, sem `uso_ia_diario` nem as colunas novas: não quebra, uso zerado e o resto contado", () => {
  const banco = new Database(":memory:");
  banco.exec(`
    CREATE TABLE usuarios (id TEXT PRIMARY KEY, nome TEXT, email TEXT, senha TEXT, criadoEm INTEGER NOT NULL);
    CREATE TABLE mesas (codigo TEXT PRIMARY KEY, dono TEXT, fase TEXT DEFAULT 'lobby', cena TEXT DEFAULT '', criadaEm INTEGER);
    CREATE TABLE membros (codigo TEXT, uid TEXT, nome TEXT);
    CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, t INTEGER, tipo TEXT, texto TEXT, autor TEXT);
    CREATE TABLE uso_ia (data TEXT, total INTEGER);
  `);
  const agora = Date.parse("2026-06-15T15:00:00Z");
  banco.prepare("INSERT INTO usuarios VALUES ('a', 'A', 'a@painel.test', '', ?)").run(agora - DIA_MS);
  banco.prepare("INSERT INTO mesas (codigo, dono, fase, criadaEm) VALUES ('VELHA', 'a', 'jogo', ?)").run(agora - 2 * DIA_MS);
  banco.prepare("INSERT INTO membros VALUES ('VELHA', 'a', 'A')").run();
  const linha = banco.prepare("INSERT INTO log (codigo, t, tipo, texto, autor) VALUES ('VELHA', ?, ?, 'x', ?)");
  linha.run(agora - 3_600_000, "narr", null);
  linha.run(agora - 3_600_000, "acao", "a");

  const d = P.calcularMetricas(banco, { dias: 7, agora, fusoMin: -180, avisar: false });
  assert.deepEqual(Object.keys(d).sort(), [...CHAVES.raiz].sort());
  assert.deepEqual([d.dias, d.desde, d.ate, d.geradoEm, d.serie.length], [7, "2026-06-09", "2026-06-15", agora, 7]);
  assert.deepEqual(d.totais, { usuarios: 1, mesas: 1, mesasEmJogo: 1, mesasNoSaguao: 0, aventurasConcluidas: 0, fichas: 0,
    narracoes: 1, acoes: 1, rolagens: 0, jogadoresAtivos7d: 1, usuariosNovos7d: 1, mesasAtivas7d: 1 });
  assert.deepEqual(d.periodo, { usuariosNovos: 1, mesasNovas: 1, narracoes: 1, acoes: 1, rolagens: 0,
    chamadasIA: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, imagens: 0, fundosReaproveitados: 0 });
  assert.deepEqual([d.modelos, d.temas, d.niveis, d.classes, d.idiomas], [[], [], [], [], { pt: 0, en: 0 }]);
  // sem as colunas `tema` e `idioma`, a mesa mais ativa sai com o tema padrão (sem temas.js, o próprio id)
  assert.deepEqual(d.mesasMaisAtivas, [{ codigo: "VELHA", cena: "", tema: "classico", fase: "jogo", narracoes: 1, jogadores: 1, ultimaAtividade: agora - 3_600_000 }]);
  banco.close();

  // banco sem tabela nenhuma: tudo zerado, sem exceção
  const vazio = new Database(":memory:");
  const z = P.calcularMetricas(vazio, { dias: 7, agora, fusoMin: -180, avisar: false });
  assert.ok(Object.values(z.totais).every((v) => v === 0) && z.serie.length === 7 && z.horas.length === 24);
  vazio.close();
});

test("uso da IA à noite: o dia UTC já virou, mas o uso conta no último dia do período (não some até a meia-noite)", () => {
  const banco = new Database(":memory:");
  banco.exec("CREATE TABLE uso_ia_diario (dia TEXT NOT NULL, tipo TEXT NOT NULL, modelo TEXT NOT NULL, chamadas INTEGER NOT NULL DEFAULT 0, entrada INTEGER NOT NULL DEFAULT 0, saida INTEGER NOT NULL DEFAULT 0, custo REAL NOT NULL DEFAULT 0, PRIMARY KEY (dia, tipo, modelo))");
  const uso = banco.prepare("INSERT INTO uso_ia_diario (dia, tipo, modelo, chamadas, entrada, saida, custo) VALUES (?, ?, ?, ?, ?, ?, ?)");
  uso.run("2026-11-11", "texto", "m/rapido", 3, 300, 30, 0.03);
  uso.run("2026-11-12", "texto", "m/rapido", 2, 200, 20, 0.02);          // 22h30 de Brasília do dia 11 = 01h30 UTC do dia 12
  uso.run("2026-11-12", "imagem", "m/imagem", 1, 0, 0, 0.04);
  const d = P.calcularMetricas(banco, { dias: 7, agora: Date.parse("2026-11-12T01:30:00Z"), fusoMin: -180, avisar: false });
  assert.equal(d.ate, "2026-11-11");
  assert.deepEqual([d.periodo.chamadasIA, d.periodo.tokensEntrada, d.periodo.imagens, d.periodo.custo], [5, 500, 1, 0.09]);
  const ultimo = d.serie[d.serie.length - 1];
  assert.deepEqual([ultimo.dia, ultimo.chamadasIA, ultimo.imagens, ultimo.custo], ["2026-11-11", 5, 1, 0.09]);
  assert.equal(d.modelos.reduce((a, m) => a + m.chamadas, 0), 6);
  banco.close();
});

test("sair do painel invalida o token no servidor", async () => {
  const entrar = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "admin", pass: "senha-do-admin-de-teste" }) });
  const token = (await entrar.json()).token;
  assert.equal((await get("/api/admin/metricas", token)).st, 200);
  const sair = await fetch(`${base}/api/admin/sair`, { method: "POST", headers: { "X-Admin-Token": token } });
  assert.equal(sair.status, 200);
  assert.equal((await get("/api/admin/metricas", token)).st, 401);
  assert.equal((await get("/api/admin/metricas", admin)).st, 200);          // as outras sessões continuam valendo
  assert.equal((await fetch(`${base}/api/admin/sair`, { method: "POST" })).status, 200);          // sem token: nada acontece
});
