"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../regras");
const { lerJson } = require("../mestre");

const ficha = (uid, extra = {}) => R.normalizarFicha({
  nome: uid, classe: "Guerreiro", raca: "Anão", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 10, car: 10 },
  ca: 16, pericias: ["Atletismo"], ataques: [{ nome: "Machado", bonus: 5, dano: "1d8+3" }], ...extra,
}, uid);

test("sinal mostra o número com sinal", () => {
  assert.equal(R.sinal(3), "+3");
  assert.equal(R.sinal(-1), "-1");
  assert.equal(R.sinal(0), "+0");
});

test("ficha: PV 0 continua caído; XP e nível são preservados", () => {
  const f = ficha("a", { pv: 0, xp: 40, nivel: 2 });
  assert.equal(f.pv, 0);
  assert.equal(f.xp, 40);
  assert.equal(f.nivel, 2);
  assert.equal(ficha("b").pv, ficha("b").pvMax); // ficha nova começa com a vida cheia
});

test("rolagem de ataque aceita o nome com outras maiúsculas e acentos", () => {
  const f = ficha("a");
  const c = { inimigos: [{ id: "ini_0", nome: "Goblin", pv: 7, ca: 13 }] };
  const rol = R.montarRolagem(f, { tipo: "ataque", ataque: "MACHADO", alvo: "ini_0" }, c, "1");
  assert.equal(rol.rotulo, "Machado vs Goblin");
  assert.equal(rol.bonus, 5);
  const semNome = R.montarRolagem(f, { tipo: "ataque", ataque: "algo que não existe" }, c, "2");
  assert.equal(semNome.alvo, "ini_0"); // usa o primeiro ataque e o primeiro inimigo vivo
});

test("teste de perícia e salvaguarda", () => {
  const f = ficha("a");
  const p = R.montarRolagem(f, { tipo: "pericia", pericia: "atletismo", cd: 14 }, null, "1");
  assert.equal(p.rotulo, "Atletismo");
  assert.equal(p.bonus, 5);
  const s = R.montarRolagem(f, { tipo: "salvaguarda", atributo: "des", cd: 12 }, null, "2");
  assert.equal(s.rotulo, "Salvaguarda de Destreza");
  assert.equal(R.resolverRolagem(p, 9, null, "a").sucesso, true);   // 14
  assert.equal(R.resolverRolagem(p, 8, null, "a").sucesso, false);  // 13
  assert.equal(R.resolverRolagem({ ...p, cd: 30 }, 20, null, "a").sucesso, true); // 20 natural
  assert.equal(R.resolverRolagem({ ...p, cd: 2 }, 1, null, "a").sucesso, false);  // 1 natural
});

function combate(ordem, inimigos) { return { rodada: 1, vez: 0, ordem, inimigos }; }
const gob = (id) => ({ id, nome: id, pv: 7, pvMax: 7, ca: 13, ataque: 4, dano: "1d6", des: 0 });

test("passarVez: depois do jogador, cada inimigo ataca uma vez e a vez volta ao jogador", () => {
  const a = ficha("a", { pv: 100, ca: 30 }); // CA alta: os goblins quase nunca acertam
  const c = combate([{ id: "a", tipo: "pj", nome: "a" }, { id: "g1", tipo: "ini", nome: "g1" }, { id: "g2", tipo: "ini", nome: "g2" }], [gob("g1"), gob("g2")]);
  const ocorrido = R.passarVez(c, { a }, "a");
  assert.equal(ocorrido.length, 2);
  assert.equal(R.vezAtual(c).id, "a");
  assert.equal(c.rodada, 2);
});

test("passarVez no início do combate: inimigos com iniciativa maior agem antes do jogador", () => {
  const a = ficha("a", { pv: 100, ca: 30 });
  const c = combate([{ id: "g1", tipo: "ini", nome: "g1" }, { id: "a", tipo: "pj", nome: "a" }, { id: "g2", tipo: "ini", nome: "g2" }], [gob("g1"), gob("g2")]);
  const ocorrido = R.passarVez(c, { a }, null);
  assert.equal(ocorrido.length, 1);
  assert.equal(R.vezAtual(c).id, "a");
});

test("passarVez: jogador caído perde a vez; com dois jogadores a vez passa ao outro", () => {
  const a = ficha("a", { pv: 100, ca: 30 }), b = ficha("b", { pv: 0 }), d = ficha("d", { pv: 100, ca: 30 });
  const c = combate([{ id: "a", tipo: "pj", nome: "a" }, { id: "b", tipo: "pj", nome: "b" }, { id: "d", tipo: "pj", nome: "d" }, { id: "g1", tipo: "ini", nome: "g1" }], [gob("g1")]);
  const ocorrido = R.passarVez(c, { a, b, d }, "a");
  assert.equal(ocorrido.length, 0);
  assert.equal(R.vezAtual(c).id, "d");
});

test("ler o JSON da IA em vários formatos", () => {
  assert.deepEqual(lerJson('{"a":1}'), { a: 1 });
  assert.deepEqual(lerJson('Aqui está:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(lerJson('Claro! {"a":3} Pronto.'), { a: 3 });
  assert.throws(() => lerJson("sem json"));
});
