"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { abrirBanco } = require("../sqlite-compat");
const { criarCreditos, CONFIG, PRODUTOS } = require("../creditos");

function montar() {
  const db = abrirBanco(":memory:");
  db.exec("CREATE TABLE mesas (codigo TEXT PRIMARY KEY, dono TEXT, donoConta TEXT, combate TEXT)");
  return { db, cr: criarCreditos(db) };
}

test("produtos e teste grátis continuam os mesmos", () => {
  assert.deepEqual(PRODUTOS.map((p) => p.id), ["creditos_taverna_5", "creditos_aventura_12", "creditos_campanha_30", "apoiador_mensal"]);
  assert.equal(CONFIG.testeDias, 14);
  assert.equal(CONFIG.cobrancaAtiva, false, "cobrança desligada por padrão");
});

test("cortesia de combate: o crédito acaba no meio da luta e a luta termina", (t) => {
  const { db, cr } = montar();
  const antes = { ...CONFIG };
  CONFIG.cobrancaAtiva = true;
  CONFIG.testeCreditos = 0; // sem teste
  t.after(() => Object.assign(CONFIG, antes));

  cr.garantir("ana");
  db.prepare("INSERT INTO mesas (codigo, dono, donoConta, combate) VALUES ('ABCDE', 'ana', 'ana', NULL)").run();
  // Fora de combate e sem crédito: bloqueia.
  assert.equal(cr.autorizar("ana", "rapido").ok, false);
  // Em combate: libera no modo Rápido, por conta da casa, até o limite.
  db.prepare("UPDATE mesas SET combate = '{\"rodada\":1}' WHERE codigo = 'ABCDE'").run();
  const a = cr.autorizar("ana", "caprichado");
  assert.equal(a.ok, true);
  assert.equal(a.cortesia, true);
  assert.equal(a.qualidade, "rapido");
  const chamadas = Math.ceil(CONFIG.cortesiaCombate / CONFIG.custo.rapido);
  for (let i = 0; i < chamadas; i++) cr.registrarUso("ana", { tipo: "texto", qualidade: "rapido" });
  assert.equal(cr.autorizar("ana", "rapido").ok, false, "a cortesia tem limite");
  // Comprar créditos renova a cortesia.
  cr.creditar("ana", 5);
  assert.equal(cr.situacao("ana").cortesiaCombate.restante, CONFIG.cortesiaCombate);
});

test("aviso quando falta menos de 1 hora de créditos", (t) => {
  const { cr } = montar();
  const antes = { ...CONFIG };
  CONFIG.cobrancaAtiva = true;
  CONFIG.testeCreditos = 0;
  t.after(() => Object.assign(CONFIG, antes));
  cr.creditar("bia", 0.5);
  assert.match(cr.situacao("bia").aviso, /menos de 1 hora/);
  cr.creditar("bia", 5);
  assert.equal(cr.situacao("bia").aviso, null);
});
