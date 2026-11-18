/**
 * Dados de cada rolagem para o app animar: o d20 e cada dado de dano (ou cura), dos jogadores e dos inimigos.
 * Rodar: npm test
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../regras");

const soma = (d) => d.pecas.reduce((s, [, v]) => s + v, 0) + d.fixo;

test("rolar guarda faces e valor de cada dado; resumoDano fecha com o total", () => {
  const r = R.rolar("2d6+3");
  assert.equal(r.pecas.length, 2);
  for (const [faces, v] of r.pecas) { assert.equal(faces, 6); assert.ok(v >= 1 && v <= 6); }
  const d = R.resumoDano(r, r.total);
  assert.equal(d.fixo, 3);
  assert.equal(soma(d), r.total);
  // crítico dobra os dados, não o bônus
  assert.equal(R.rolar("1d8+2", true).pecas.length, 2);
  // dano ajustado depois (elementos, talentos): a diferença vai para o fixo
  const ajustado = R.resumoDano(r, r.total + 4, true);
  assert.equal(soma(ajustado), r.total + 4);
  assert.equal(ajustado.critico, true);
  // dado negativo mantém o sinal
  const neg = R.rolar("1d4-1d4");
  assert.ok(neg.pecas[1][1] <= -1);
});

test("resolverRolagem: ataque que acerta traz o d20, a CA e os dados de dano; teste traz a CD", () => {
  const ataque = { tipo: "ataque", rotulo: "Machado vs g1", bonus: 5, cd: 13, dano: "1d8+3", alvo: "g1" };
  const combate = { inimigos: [{ id: "g1", nome: "g1", pv: 50, pvMax: 50, ca: 13 }] };
  const acerto = R.resolverRolagem(ataque, 15, combate, "a");
  assert.deepEqual({ ...acerto.dados, dano: undefined }, { d20: 15, bonus: 5, alvo: 13, contra: "CA", total: 20, dano: undefined });
  assert.equal(acerto.dados.dano.total, acerto.dano);
  assert.equal(soma(acerto.dados.dano), acerto.dano);
  assert.equal(acerto.dados.dano.pecas[0][0], 8);

  const erro = R.resolverRolagem(ataque, 2, combate, "a");
  assert.equal(erro.dados.dano, undefined);
  assert.equal(erro.dados.total, 7);

  const critico = R.resolverRolagem(ataque, 20, combate, "a");
  assert.equal(critico.dados.dano.pecas.length, 2);
  assert.equal(critico.dados.dano.critico, true);

  const teste = R.resolverRolagem({ tipo: "teste", rotulo: "Atletismo", bonus: 2, cd: 12 }, 9, null, "a");
  assert.deepEqual(teste.dados, { d20: 9, bonus: 2, alvo: 12, contra: "CD", total: 11 });
});

test("passarVez: o ataque de cada inimigo traz o d20 e, se acertar, os dados de dano", () => {
  const a = R.normalizarFicha({ nome: "a", classe: "Guerreiro", raca: "Anão", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 10, car: 10 },
    ca: 10, pericias: [], ataques: [{ nome: "Machado", bonus: 5, dano: "1d8+3" }], pv: 500 }, "a");
  a.pvMax = 500; a.pv = 500;
  const c = { rodada: 1, vez: 0, ordem: [{ id: "a", tipo: "pj", nome: "a" }, { id: "g1", tipo: "ini", nome: "g1" }],
    inimigos: [{ id: "g1", nome: "g1", pv: 7, pvMax: 7, ca: 13, ataque: 4, dano: "1d6+1", des: 0 }] };
  let viu = { acerto: false, erro: false };
  for (let i = 0; i < 60 && !(viu.acerto && viu.erro); i++) {
    const [o] = R.passarVez(c, { a }, "a").filter((x) => x.log.dados);
    const d = o.log.dados;
    assert.equal(d.contra, "CA");
    assert.equal(d.bonus, 4);
    assert.equal(d.total, d.d20 + 4);
    if (o.log.ok) {
      viu.acerto = true;
      assert.equal(d.dano.pecas[0][0], 6);
      assert.match(o.linha, new RegExp(`acertou, ${d.dano.total} de dano`));
      assert.equal(soma(d.dano), d.dano.total);
    } else {
      viu.erro = true;
      assert.equal(d.dano, undefined);
    }
  }
  assert.ok(viu.acerto && viu.erro, "em 60 turnos com CA 10 o goblin acerta e erra");
});
