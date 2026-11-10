"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../regras");

/** Gerador previsível: devolve os valores em sequência (0 a 1). */
function seq(...vals) { let i = 0; return () => vals[i++ % vals.length]; }
const fichaBase = (extra = {}) => R.normalizarFicha({ nome: "Aria", classe: "Guerreiro", atributos: { for: 14, des: 12, con: 14, int: 10, sab: 10, car: 10 }, ca: 15, ...extra }, "u1");

test("sinal e comSinal não duplicam o sinal", () => {
  assert.equal(`${R.sinal(3)}${3}`, "+3");
  assert.equal(`${R.sinal(-2)}${-2}`, "-2");
  assert.equal(R.comSinal(0), "+0");
});

test("normalizarFicha preserva XP, nível, ouro e talentos (antes zerava o XP)", () => {
  const f = R.normalizarFicha({ classe: "Mago", nivel: 3, xp: 150, ouro: 40, talentos: ["couraca"], subclasse: "evocador", atributos: { con: 12 } }, "u");
  assert.equal(f.xp, 150);
  assert.equal(f.nivel, 3);
  assert.equal(f.ouro, 40);
  assert.deepEqual(f.talentos, ["couraca"]);
  assert.equal(f.subclasse, "evocador");
  assert.equal(f.proficiencia, 2);
});

test("ficha antiga sem campos novos continua válida", () => {
  const f = R.normalizarFicha({ nome: "Velho", classe: "Ladino", atributos: { for: 10, des: 16, con: 12, int: 12, sab: 10, car: 12 }, ataques: [{ nome: "Bola de Fogo", bonus: 4, dano: "2d6" }] }, "x");
  assert.equal(f.ataques[0].elemento, "fogo");
  assert.deepEqual(f.status, []);
  assert.deepEqual(f.itens, []);
  assert.equal(f.xp, 0);
});

test("subir de nível recalcula PV máximo e proficiência e registra cada nível", () => {
  const f = fichaBase();
  const pvMax1 = f.pvMax;
  const niveis = R.ganharXp(f, 350); // 100 (1→2) + 200 (2→3) = 300, sobram 50
  assert.deepEqual(niveis, [2, 3]);
  assert.equal(f.nivel, 3);
  assert.equal(f.xp, 50);
  assert.ok(f.pvMax > pvMax1);
  assert.equal(f.pvMax, R.calcularPvMax("Guerreiro", 3, 14));
  assert.equal(R.pendencias(f).subclasse, true);
  assert.equal(R.pendencias(f).talentos, 1);
});

test("Aprendizado Rápido dá +25% de XP", () => {
  const f = fichaBase({ nivel: 2, talentos: ["aprendizado_rapido"] });
  R.ganharXp(f, 40);
  assert.equal(f.xp, 50);
});

test("mesclarFichaEditada impede o app de zerar a progressão", () => {
  const antiga = fichaBase({ nivel: 4, xp: 90, ouro: 33, talentos: ["couraca"] });
  const editada = { nome: "Aria Nova", classe: "Guerreiro", atributos: { for: 18, des: 18, con: 18, int: 18, sab: 18, car: 18 } };
  const f = R.normalizarFicha(R.mesclarFichaEditada(editada, antiga), "u1");
  assert.equal(f.nome, "Aria Nova");
  assert.equal(f.nivel, 4);
  assert.equal(f.xp, 90);
  assert.equal(f.ouro, 33);
  assert.deepEqual(f.atributos, antiga.atributos);
});

test("chance de sucesso fica entre 5% e 95%", () => {
  assert.equal(R.chanceSucesso(3, 13), 55);
  assert.equal(R.chanceSucesso(20, 5), 95);
  assert.equal(R.chanceSucesso(-5, 30), 5);
});

test("fraqueza dobra metade a mais e mostra selo FRACO; imunidade zera", () => {
  const combate = { inimigos: [R.criarInimigo("ini_0", { nome: "Esqueleto", pv: 30, ca: 10, fraquezas: ["sagrado"], imunidades: ["veneno"] })] };
  const f = fichaBase();
  const rol = { tipo: "ataque", rotulo: "Luz", bonus: 5, cd: 10, dano: "1d4+3", alvo: "ini_0", elemento: "sagrado" };
  const r = R.resolverRolagem(rol, 15, combate, f, { rng: seq(0.99) }); // 1d4 = 4, +3 = 7, x1,5 = 10
  assert.equal(r.dano, 10);
  assert.equal(r.selo, "FRACO");
  const r2 = R.resolverRolagem({ ...rol, elemento: "veneno" }, 15, combate, f, { rng: seq(0.99) });
  assert.equal(r2.dano, 0);
  assert.equal(r2.selo, "IMUNE");
});

test("crítico com Olhar Atento acontece no 19", () => {
  const combate = { inimigos: [R.criarInimigo("ini_0", { nome: "Goblin", pv: 50, ca: 30 })] };
  const f = fichaBase({ nivel: 2, talentos: ["olhar_atento"] });
  const r = R.resolverRolagem({ tipo: "ataque", rotulo: "Espada", bonus: 0, cd: 30, dano: "1d8", alvo: "ini_0" }, 19, combate, f, { rng: seq(0.5) });
  assert.equal(r.critico, true);
  assert.equal(r.sucesso, true);
  assert.match(r.selo, /CRÍTICO/);
});

test("teste que falha por 2 ou menos ganha o selo POR POUCO; minigame soma +2", () => {
  const f = fichaBase();
  const rol = { tipo: "teste", rotulo: "Atletismo", bonus: 2, cd: 15 };
  assert.equal(R.resolverRolagem(rol, 11, null, f).selo, "POR POUCO");
  assert.equal(R.resolverRolagem(rol, 11, null, f, { ajuste: 2 }).sucesso, true);
});

test("status: veneno causa dano no início da vez e expira", () => {
  const alvo = { nome: "X", pv: 10, pvMax: 10, status: [{ tipo: "envenenado", turnos: 1 }] };
  const r = R.processarInicioDaVez(alvo, "X", seq(0.99)); // 1d4 = 4
  assert.equal(alvo.pv, 6);
  assert.equal(alvo.status.length, 0);
  assert.ok(r.linhas.some((l) => l.evento === "status_dano"));
});

test("atordoado perde a vez", () => {
  const alvo = { nome: "X", pv: 10, status: [{ tipo: "atordoado", turnos: 1 }] };
  assert.equal(R.processarInicioDaVez(alvo, "X").perdeVez, true);
});

test("inimigo tático ataca quem está mais ferido", () => {
  const ini = R.criarInimigo("i", { nome: "Lobo", comportamento: "tatico" });
  const a = { uid: "a", pv: 10, pvMax: 10 }, b = { uid: "b", pv: 2, pvMax: 10 };
  assert.equal(R.escolherAlvo(ini, [a, b], seq(0.9)).uid, "b");
});

test("passarVez não dá várias rodadas seguidas aos inimigos quando só há um jogador", () => {
  const f = fichaBase({ pv: 200 });
  f.pvMax = 200; f.pv = 200;
  const c = R.iniciarCombate({ u1: f }, [{ nome: "Goblin", pv: 50, ca: 12, ataque: 0, dano: "1" }], seq(0.99, 0.01));
  // Força a ordem: jogador primeiro, depois o goblin.
  c.ordem = [{ id: "u1", tipo: "pj", nome: f.nome, ini: 20 }, { id: "ini_0", tipo: "ini", nome: "Goblin", ini: 1 }];
  c.vez = 0;
  const ocorrido = R.passarVez(c, { u1: f }, "u1", seq(0.5));
  const ataques = ocorrido.filter((o) => /ataca/.test(o.linha));
  assert.equal(ataques.length, 1);
  assert.equal(R.vezAtual(c).id, "u1");
  assert.equal(c.rodada, 2);
});

test("covarde foge com pouca vida e o combate termina em vitória", () => {
  const f = fichaBase();
  const c = R.iniciarCombate({ u1: f }, [{ nome: "Rato", pv: 8, comportamento: "covarde" }]);
  c.inimigos[0].pv = 1;
  c.ordem = [{ id: "u1", tipo: "pj", nome: f.nome, ini: 20 }, { id: "ini_0", tipo: "ini", nome: "Rato", ini: 1 }];
  c.vez = 0;
  R.passarVez(c, { u1: f }, "u1");
  assert.equal(c.inimigos[0].fugiu, true);
  assert.equal(R.resultadoCombate(c, { u1: f }), "vitoria");
});

test("Último Suspiro salva o personagem uma vez por combate", () => {
  const f = fichaBase({ nivel: 2, talentos: ["ultimo_suspiro"] });
  f.pv = 1;
  const c = R.iniciarCombate({ u1: f }, [{ nome: "Ogro", pv: 50, ataque: 30, dano: "10" }]);
  c.ordem = [{ id: "ini_0", tipo: "ini", nome: "Ogro", ini: 20 }, { id: "u1", tipo: "pj", nome: f.nome, ini: 1 }];
  c.vez = 0;
  R.passarVez(c, { u1: f }, null, seq(0.5));
  assert.equal(f.pv, 1);
  assert.equal(c.suspiro.u1, true);
});

test("saque gera 3 itens válidos com raridade", () => {
  const s = R.gerarSaque(2, seq(0.1, 0.5, 0.9, 0.3));
  assert.equal(s.length, 3);
  for (const it of s) assert.ok(R.RARIDADES.includes(it.raridade));
});

test("itens do mesmo tipo não se somam: vale o melhor de cada tipo, com teto", () => {
  // Antes: duas armaduras +3 davam +5 (teto). Agora vale só a melhor armadura.
  const f = fichaBase({ itens: [{ nome: "A", tipo: "armadura", raridade: "lendario", bonus: 3 }, { nome: "B", tipo: "armadura", raridade: "lendario", bonus: 3 }] });
  assert.equal(R.efeitos(f).ca, 3);
  assert.equal(R.caEfetiva(f), 18);
  // Arma e armadura somam entre si; o teto de +5 continua valendo com subclasse e talentos.
  const g = fichaBase({ nivel: 4, subclasse: "guardiao", talentos: ["couraca"], itens: [
    { nome: "C", tipo: "armadura", raridade: "lendario", bonus: 3 }, { nome: "D", tipo: "arma", raridade: "raro", bonus: 2 }, { nome: "E", tipo: "arma", raridade: "incomum", bonus: 1 },
  ] });
  assert.equal(R.efeitos(g).ca, 5);
  assert.equal(R.efeitos(g).ataque, 2);
});

// ── Balanceamento (design/GAME-DESIGN.md; números calibrados por tool/simular-balanceamento.js) ──

test("escala por nível: acerto pela proficiência, dano +1 a cada 2 níveis", () => {
  assert.deepEqual([1, 4, 5, 9, 10].map(R.bonusAtaqueNivel), [0, 0, 1, 2, 2]);
  assert.deepEqual([1, 2, 3, 5, 9, 10].map(R.bonusDanoNivel), [0, 0, 1, 2, 4, 4]);
  const combate = { inimigos: [R.criarInimigo("ini_0", { nome: "Alvo", pv: 100, ca: 10 })] };
  const f1 = fichaBase({ ataques: [{ nome: "Espada", bonus: 5, dano: "1d8+3" }] });
  const f5 = fichaBase({ nivel: 5, ataques: [{ nome: "Espada", bonus: 5, dano: "1d8+3" }] });
  assert.equal(R.montarRolagem(f1, { tipo: "ataque", ataque: "Espada" }, combate, "x").bonus, 5);
  const rol5 = R.montarRolagem(f5, { tipo: "ataque", ataque: "Espada" }, combate, "x");
  assert.equal(rol5.bonus, 6);
  // 1d8 com rng 0,99 = 8, +3, +2 do nível 5 = 13
  assert.equal(R.resolverRolagem(rol5, 15, combate, f5, { rng: seq(0.99) }).dano, 13);
});

test("PV de herói: +4 em todos os níveis (Mago nível 1 com CON 10 tem 10 PV)", () => {
  assert.equal(R.PV_HEROI, 4);
  assert.equal(R.calcularPvMax("Mago", 1, 10), 10);
  assert.equal(R.calcularPvMax("Guerreiro", 1, 14), 16);
  assert.equal(R.calcularPvMax("Guerreiro", 5, 14), 16 + 4 * 8);
});

test("tabela de inimigos de referência por nível e papel", () => {
  assert.deepEqual(R.inimigoReferencia(1, "comum"), { pv: 10, ca: 12, ataque: 3, dano: "1d6+1", des: 2 });
  assert.deepEqual(R.inimigoReferencia(5, "comum"), { pv: 19, ca: 13, ataque: 5, dano: "2d6+3", des: 2 });
  assert.deepEqual(R.inimigoReferencia(10, "comum"), { pv: 30, ca: 15, ataque: 7, dano: "3d6+7", des: 2 });
  assert.equal(R.inimigoReferencia(1, "lacaio").pv, 5);
  // Chefe: PV do comum × (1,25 + 0,75 por jogador); dano × (1,3 + 0,15 por jogador além do primeiro).
  assert.deepEqual(R.inimigoReferencia(5, "chefe", 3), { pv: 66, ca: 14, ataque: 6, dano: "3d6+6", des: 1 });
  assert.equal(R.inimigoReferencia(5, "chefe", 1).pv, 38);
  assert.ok(R.inimigoReferencia(5, "chefe", 4).pv > R.inimigoReferencia(5, "chefe", 2).pv);
});

test("encontro de referência: um comum por jogador; chefe com capangas", () => {
  for (const n of [1, 2, 3, 4]) assert.equal(R.encontroReferencia(3, n, "comum").length, n);
  assert.equal(R.encontroReferencia(3, 1, "chefe").length, 1);
  assert.equal(R.encontroReferencia(3, 2, "chefe").length, 3); // chefe + capanga + lacaio
  const quatro = R.encontroReferencia(3, 4, "chefe");
  assert.equal(quatro.length, 4);
  assert.equal(quatro.filter((i) => i.chefe).length, 1);
});

test("dano médio e expressão de dano com média pedida", () => {
  assert.equal(R.danoMedio("2d6+3"), 10);
  assert.equal(R.danoMedio("1d8-1"), 3.5);
  assert.equal(R.danoComMedia(4), "1d6+1");
  assert.equal(R.danoComMedia(10), "2d6+3");
  assert.equal(R.danoComMedia(2), "1d4");
});

test("trilhos de segurança: o servidor corta inimigos exagerados da IA, sem mexer nos fracos", () => {
  const grupo = [fichaBase()]; // 1 jogador, nível 1
  const [ogro, fraco, vazio] = R.limitarInimigos([
    { nome: "Ogro", pv: 200, ca: 25, ataque: 15, dano: "6d10" },
    { nome: "Rato", pv: 1, ca: 5, ataque: 0, dano: "1" },
    { nome: "Sem números" },
  ], grupo);
  assert.equal(ogro.pv, 20); // 2 × PV de referência (10)
  assert.equal(ogro.ca, 14); // referência 12 + 2
  assert.equal(ogro.ataque, 5); // referência 3 + 2
  assert.equal(ogro.dano, R.danoComMedia(4 * 1.5));
  assert.deepEqual([fraco.pv, fraco.ca, fraco.ataque, fraco.dano], [1, 5, 0, "1"]);
  assert.deepEqual([vazio.pv, vazio.ca, vazio.ataque, vazio.dano], [10, 12, 3, "1d6+1"]);
  // No máximo 2 inimigos por jogador + 2
  assert.equal(R.limitarInimigos(Array.from({ length: 8 }, () => ({ nome: "G" })), grupo).length, 4);
  // Chefe tem teto próprio (1,5 × referência de chefe)
  const chefe = R.limitarInimigos([{ nome: "Rei", pv: 999, chefe: true }], grupo)[0];
  assert.equal(chefe.pv, Math.round(R.inimigoReferencia(1, "chefe", 1).pv * 1.5));
});

test("iniciarCombate aplica os trilhos e respeita ataque 0 (antes virava +4)", () => {
  const f = fichaBase();
  const c = R.iniciarCombate({ u1: f }, [{ nome: "Ogro", pv: 300, ataque: 0 }]);
  assert.equal(c.inimigos[0].pv, 20);
  assert.equal(c.inimigos[0].ataque, 0);
});

test("tetos da ficha base: CA 18, ataque +7, dano médio 13", () => {
  const f = R.normalizarFicha({ classe: "Guerreiro", ca: 25, ataques: [{ nome: "Espada", bonus: 12, dano: "10d10" }, { nome: "Bola de Fogo", bonus: 4, dano: "2d6" }] }, "u");
  assert.equal(f.ca, 18);
  assert.equal(f.ataques[0].bonus, 7);
  assert.equal(f.ataques[0].dano, "2d6+6");
  assert.equal(f.ataques[1].dano, "2d6");
});

test("XP: a primeira vitória depois do capítulo 1 leva ao nível 2; narração dá só 1", () => {
  assert.equal(R.XP.narracao, 1);
  const f = fichaBase();
  const niveis = R.ganharXp(f, R.XP.capitulo + 10 * R.XP.narracao + Math.max(R.XP.vitoriaMinima, 3 * R.XP.porInimigo));
  assert.deepEqual(niveis, [2]);
  // A aventura inteira (5 capítulos, ~6 combates, ~90 narrações, epílogo) fica entre o nível 4 e o 5.
  const g = fichaBase();
  R.ganharXp(g, 5 * R.XP.capitulo + 6 * 3 * R.XP.porInimigo + 40 + 90 * R.XP.narracao + R.XP.epilogo);
  assert.equal(g.nivel, 4);
});

test("raridade: Raro vale +2, Épico e Lendário sempre têm elemento em arma e amuleto", () => {
  assert.equal(R.BONUS_RARIDADE.raro, 2);
  assert.equal(R.sortearRaridade(0, () => 0.84), "incomum");
  assert.equal(R.sortearRaridade(0, () => 0.86), "raro");
  assert.equal(R.sortearRaridade(0, () => 0.999), "raro"); // sem sorte não sai Épico
  assert.equal(R.sortearRaridade(3, () => 0.9), "epico");
  // tipo arma (0,1), raridade lendária (0,99 + sorte 5), elemento (0,5), nome (0,1)
  const it = R.gerarItem(5, seq(0.1, 0.99, 0.5, 0.1, 0.1));
  assert.equal(it.raridade, "lendario");
  assert.equal(it.bonus, 3);
  assert.ok(it.elemento);
});

test("expedição usa a tabela: andar 1 a 5 no nível do grupo, +1 a cada bloco de 5 andares", () => {
  const { criarCampanha } = require("../campanha");
  const camp = criarCampanha({ exec() {} });
  const grupo = [fichaBase(), fichaBase()];
  const sala = camp.inimigosDaSala({ modo: "masmorra", andar: 2, sala: "monstro" }, grupo, seq(0.5));
  assert.equal(sala.length, 2);
  assert.equal(sala[0].pv, R.inimigoReferencia(1, "comum", 2).pv);
  const chefe = camp.inimigosDaSala({ modo: "torre", andar: 5, sala: "chefe" }, grupo, seq(0.5));
  assert.equal(chefe[0].chefe, true);
  assert.equal(chefe[0].pv, R.inimigoReferencia(1, "chefe", 2).pv);
  assert.equal(camp.nivelDaSala({ andar: 6 }, grupo), 2);
  assert.equal(camp.nivelDaSala({ andar: 11 }, grupo), 3);
});

test("clima: chuva enfraquece fogo; neblina atrapalha Percepção", () => {
  assert.equal(R.multiplicadorElemento("fogo", {}, { clima: "chuva" }).mult, 0.75);
  const f = fichaBase();
  assert.equal(R.bonusPericia(f, "Percepção", { clima: "neblina" }), R.bonusPericia(f, "Percepção") - 2);
});

test("loja: ferreiro sobe a raridade, redistribuir custa 25 × nível, curas", () => {
  const R = require("../regras");
  const m = R.melhorarItem({ id: "x", nome: "Cota Raro", raridade: "raro", tipo: "armadura", bonus: 2, descricao: "+2 na CA." });
  assert.equal(m.preco, 400);
  assert.equal(m.item.raridade, "epico");
  assert.equal(m.item.nome, "Cota Épico");
  assert.equal(R.melhorarItem({ id: "y", nome: "Anel", raridade: "epico", tipo: "amuleto" }), null);
  assert.equal(R.custoRedistribuir({ respecUsado: false, nivel: 5 }), 0);
  assert.equal(R.custoRedistribuir({ respecUsado: true, nivel: 5 }), 125);
  const f = { pv: 1, pvMax: 10, nivel: 3 };
  assert.equal(R.curar(f, 50), 9);
  assert.equal(f.pv, 10);
  const pocao = R.curaPocao({ nivel: 1 }, () => 0);
  assert.equal(pocao, 5);
  const ficha = R.normalizarFicha({ pocoes: 9, descansoCapitulo: 2 }, "u");
  assert.equal(ficha.pocoes, 3);
  assert.equal(ficha.descansoCapitulo, 2);
});

test("i18n: mensagens do servidor em inglês e sem mexer no português", () => {
  const I = require("../i18n");
  const en = (t) => I.traduzir(t, "en");
  assert.equal(I.traduzir("Vez de Aria.", "pt"), "Vez de Aria.");
  assert.equal(en("Vez de Aria."), "Aria's turn.");
  assert.equal(en("Goblin 1 ataca Aria: 15 +4 = 19 vs CA 16 → CRÍTICO, acertou, 7 de dano (resistiu)."), "Goblin 1 attacks Aria: 15 +4 = 19 vs AC 16 → CRITICAL, hit, 7 damage (resisted).");
  assert.equal(en("Aria · Percepção: 12+3 = 15 vs CD 13"), "Aria · Perception: 12+3 = 15 vs DC 13");
  assert.equal(en("Aria ficou com Lâmina Ardente (Épico)."), "Aria took Blazing Blade (Epic).");
  assert.equal(en("Mesa não encontrada."), "Table not found.");
  assert.equal(en("texto que ninguém traduziu"), "texto que ninguém traduziu");
  assert.equal(I.idiomaDe({ headers: { "x-idioma": "en-US" } }), "en");
  assert.equal(I.idiomaDe({ headers: {} }), "pt");
  // Todas as aventuras têm 5 capítulos com título e objetivo nos dois idiomas, terminando em chefe
  const AV = require("../aventuras");
  assert.equal(AV.AVENTURAS.length, 4);
  for (const a of AV.AVENTURAS) {
    assert.equal(a.capitulos.length, 5, a.id);
    assert.equal(a.capitulos[4].combate, "chefe", a.id);
    for (const c of a.capitulos) assert.ok(c.titulo && c.tituloEn && c.objetivo && c.objetivoEn && c.ritmo, a.id);
    assert.ok(a.texto.includes(a.titulo) && a.abertura && a.cenaInicialEn, a.id);
  }
  assert.equal(AV.daMesa({}).id, "mina");
  assert.equal(AV.daMesa({ aventura: "xyz" }).id, "mina");
});
