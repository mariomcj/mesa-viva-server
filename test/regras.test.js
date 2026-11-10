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

test("itens somam bônus com teto", () => {
  const f = fichaBase({ itens: [{ nome: "A", tipo: "armadura", raridade: "lendario", bonus: 3 }, { nome: "B", tipo: "armadura", raridade: "lendario", bonus: 3 }] });
  assert.equal(R.efeitos(f).ca, 5);
  assert.equal(R.caEfetiva(f), 20);
});

test("clima: chuva enfraquece fogo; neblina atrapalha Percepção", () => {
  assert.equal(R.multiplicadorElemento("fogo", {}, { clima: "chuva" }).mult, 0.75);
  const f = fichaBase();
  assert.equal(R.bonusPericia(f, "Percepção", { clima: "neblina" }), R.bonusPericia(f, "Percepção") - 2);
});
