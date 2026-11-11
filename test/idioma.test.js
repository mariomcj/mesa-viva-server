/**
 * Testes do idioma da narração (sem servidor): em português os prompts ficam exatamente como eram;
 * em inglês ganham, no fim, a instrução de idioma.
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../mestre");

const mesa = (idioma) => ({ tema: "classico", duracao: "curta", tom: "epico", ato: 1, fase: "jogo", ...(idioma === undefined ? {} : { idioma }) });
const arco = (idioma) => M.promptArco({ tema: "classico", duracao: "curta", fichas: [], tom: "epico", vetos: "", desejos: "", semente: "um sino", tempero: "", idioma });

test("idioma válido: pt e en; qualquer outra coisa vira pt", () => {
  assert.deepEqual(M.IDIOMAS, ["pt", "en"]);
  assert.equal(M.idiomaValido("en"), "en");
  assert.equal(M.idiomaValido("EN-us"), "en");
  assert.equal(M.idiomaValido("pt-BR"), "pt");
  for (const v of [undefined, null, "", "xx", 5, {}]) assert.equal(M.idiomaValido(v), "pt");
});

test("português: nenhum prompt muda (mesa antiga, sem a coluna, também)", () => {
  assert.equal(M.blocoIdioma("pt"), "");
  assert.equal(M.blocoIdioma(undefined), "");
  assert.equal(M.contexto(mesa("pt"), [], []), M.contexto(mesa(undefined), [], []));
  assert.ok(!M.contexto(mesa("pt"), [], []).includes("LANGUAGE"));
  assert.equal(M.promptCriacao("classico", "um anão ferreiro", "pt"), M.promptCriacao("classico", "um anão ferreiro"));
  assert.equal(arco("pt"), arco(undefined));
});

test("inglês: narração, criação de ficha e arco pedem texto em inglês, no fim do prompt", () => {
  const bloco = M.blocoIdioma("en");
  assert.match(bloco, /English/);
  assert.match(bloco, /Do NOT translate/);
  for (const p of [M.contexto(mesa("en"), [], []), M.promptCriacao("classico", "a dwarf blacksmith", "en"), arco("en")]) {
    assert.ok(p.endsWith(bloco), "a instrução de idioma fecha o prompt");
  }
  // o resto do prompt é o mesmo do português
  assert.equal(M.contexto(mesa("en"), [], []).slice(0, -bloco.length), M.contexto(mesa("pt"), [], []));
});
