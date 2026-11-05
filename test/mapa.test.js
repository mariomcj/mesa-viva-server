/**
 * Testes do mapa de batalha (mapa.js), sem servidor.
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MP = require("../mapa");
const R = require("../regras");
const M = require("../mestre");

const mapa = (terreno = [], colunas = 10, linhas = 14) => ({ colunas, linhas, descricao: "Teste", terreno, imagem: "" });
const peca = (tipo, x, y, l = 1, a = 1, nome = tipo) => ({ tipo, x, y, l, a, nome });
const casasCobertas = (m) => new Set(m.terreno.flatMap((t) => Array.from({ length: t.l * t.a }, (_, i) => `${t.x + (i % t.l)},${t.y + Math.floor(i / t.l)}`))).size;
const ficha = (uid, extra = {}) => R.normalizarFicha({ nome: uid, classe: "Guerreiro", raca: "Humano", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 10, car: 10 },
  ca: 30, pv: 100, ataques: [{ nome: "Espada", bonus: 5, dano: "1d8+3" }], ...extra }, uid);

test("rótulos, distância de Chebyshev, deslocamento por raça e alcance pelo nome do ataque", () => {
  assert.equal(MP.rotulo(2, 3), "C4");
  assert.equal(MP.rotulo({ x: 0, y: 0 }), "A1");
  assert.equal(MP.rotulo(11, 15), "L16");
  assert.equal(MP.distancia({ x: 0, y: 0 }, { x: 3, y: 1 }), 3);
  assert.equal(MP.distancia({ x: 5, y: 5 }, { x: 4, y: 4 }), 1);
  assert.deepEqual(["Anão", "Halfling", "Elfo", "Humano", "Meio-orc"].map((raca) => MP.deslocamentoBase({ raca })), [5, 5, 6, 6, 6]);
  for (const n of ["Arco curto", "Besta leve", "Míssil Mágico", "Mísseis Mágicos", "Bola de Fogo", "Centelha Arcana", "Luz Sagrada", "Pistola de raios", "Revólver", "Rajada de gelo", "Feitiço de fogo", "Dardo"]) {
    assert.equal(MP.alcanceDoAtaque(n), "distancia", n);
  }
  for (const n of ["Espada longa", "Machado de batalha", "Adaga", "Cajado", "Martelo", "Golpe de escudo"]) assert.equal(MP.alcanceDoAtaque(n), "corpo", n);
  assert.equal(MP.alcanceDoAtaque({ nome: "Espada", alcance: "distancia" }), "distancia");   // o campo vale mais que o nome
  assert.equal(MP.alcanceDoAtaque({ nome: "Arco", alcance: "corpo" }), "corpo");
  assert.equal(MP.alcanceDoAtaque({ nome: "Arco", alcance: "longe" }), "distancia");        // campo inválido: palavras do nome
  // a ficha guarda o alcance só quando é válido; inimigo sem alcance é corpo a corpo
  const f = R.normalizarFicha({ ataques: [{ nome: "Sopro", bonus: 2, dano: "1d6", alcance: "distancia" }, { nome: "Soco", bonus: 1, dano: "1d4", alcance: "x" }] }, "a");
  assert.equal(f.ataques[0].alcance, "distancia");
  assert.ok(!("alcance" in f.ataques[1]));
  assert.equal(R.criarInimigo("ini_0", { nome: "G" }).alcance, "corpo");
  assert.equal(R.criarInimigo("ini_0", { nome: "G", alcance: "distancia" }).alcance, "distancia");
});

test("normalizarMapa: limites da grade, tipos, retângulos cortados na borda e no máximo 35% de terreno", () => {
  assert.equal(MP.normalizarMapa(null), null);
  assert.equal(MP.normalizarMapa("um mapa"), null);
  const m = MP.normalizarMapa({ colunas: 50, linhas: 3, descricao: "", terreno: [
    peca("lava", 1, 1), peca("Obstáculo", -1, -1, 3, 3, "Pilar"), { tipo: "agua", x: 11, y: 0 }, peca("dificil", 10, 2, 5, 1, "Lama"),
    peca("abismo", 12, 0), peca("cobertura", 2, 2, 0, 1), peca("difícil", "x", 2), "lixo",
  ] }, { cena: "Ponte velha" });
  assert.equal(m.colunas, 12);
  assert.equal(m.linhas, 10);
  assert.equal(m.descricao, "Ponte velha");
  assert.equal(m.imagem, "");
  assert.deepEqual(m.terreno, [
    { tipo: "obstaculo", x: 0, y: 0, l: 2, a: 2, nome: "Pilar" },
    { tipo: "agua", x: 11, y: 0, l: 1, a: 1, nome: "Água" },
    { tipo: "dificil", x: 10, y: 2, l: 2, a: 1, nome: "Lama" },
  ]);
  const padrao = MP.normalizarMapa({});
  assert.deepEqual([padrao.colunas, padrao.linhas], [10, 14]);
  // 35% de 10×14 = 49 casas: faixas de 10 casas entram até a 4ª; a 5ª passaria do limite; uma casa solta ainda cabe
  const cheio = MP.normalizarMapa({ terreno: [0, 1, 2, 3, 4, 5].map((y) => peca("dificil", 0, y * 2, 10, 1)).concat([peca("cobertura", 0, 13)]) });
  assert.equal(cheio.terreno.length, 5);
  assert.equal(casasCobertas(cheio), 41);
  assert.ok(casasCobertas(cheio) <= 140 * MP.MAX_TERRENO);
});

test("prepararCombate: posições fora da grade, sobrepostas ou em obstáculo são corrigidas; quem fica sem casa vai para a largada", () => {
  const c = {
    ordem: [{ id: "a", tipo: "pj" }, { id: "b", tipo: "pj" }, { id: "ini_0", tipo: "ini" }, { id: "ini_1", tipo: "ini" }, { id: "ini_2", tipo: "ini" }],
    inimigos: ["ini_0", "ini_1", "ini_2"].map((id) => ({ id, nome: id, pv: 7 })),
  };
  const bruto = { mapa: { colunas: 10, linhas: 14, terreno: [peca("obstaculo", 4, 4)] }, posicoes: { a: { x: 4, y: 12 }, b: { x: 4, y: 12 } } };
  MP.prepararCombate(c, bruto, { inimigosIA: [{ x: 4, y: 4 }, { x: 50, y: 2 }, { x: 7, y: 6 }] });
  const p = c.posicoes;
  assert.deepEqual(p.a, { x: 4, y: 12 });                                   // pedido válido: fica
  assert.deepEqual(p.ini_2, { x: 7, y: 6 });                                 // idem
  assert.ok(p.b.y >= 12 && p.b.y <= 13, "jogador recolocado nas 2 últimas linhas");
  for (const id of ["ini_0", "ini_1"]) assert.ok(p[id].y <= 2, `${id} recolocado nas 3 primeiras linhas`);
  const casas = Object.values(p).map((q) => `${q.x},${q.y}`);
  assert.equal(new Set(casas).size, casas.length, "duas figuras na mesma casa");
  for (const q of Object.values(p)) assert.ok(MP.passavel(c.mapa, q.x, q.y));
  // automático = casa livre mais perto do centro da largada
  assert.deepEqual(MP.casaLivre(mapa(), new Set(), "pj"), { x: 4, y: 13 });
  assert.deepEqual(MP.casaLivre(mapa(), new Set(), "ini"), { x: 4, y: 1 });
});

test("isolamento: muralha ou abismo de lado a lado sai; peças que não isolam ficam", () => {
  for (const tipo of ["obstaculo", "abismo"]) {
    const c = { ordem: [{ id: "a", tipo: "pj" }, { id: "ini_0", tipo: "ini" }], inimigos: [{ id: "ini_0", pv: 7 }] };
    MP.prepararCombate(c, { mapa: { terreno: [peca("cobertura", 3, 9, 2, 1, "Mureta"), peca(tipo, 0, 7, 10, 1, "Muralha"), peca("obstaculo", 7, 3, 1, 1, "Pilar")] } });
    assert.deepEqual(c.mapa.terreno.map((t) => t.nome), ["Mureta", "Pilar"], tipo);
    assert.ok(MP.conectado(c.mapa, c.posicoes));
  }
  // com uma passagem, a muralha fica
  const c = { ordem: [{ id: "a", tipo: "pj" }, { id: "ini_0", tipo: "ini" }], inimigos: [{ id: "ini_0", pv: 7 }] };
  MP.prepararCombate(c, { mapa: { terreno: [peca("obstaculo", 0, 7, 4, 1, "Muralha O"), peca("obstaculo", 5, 7, 5, 1, "Muralha L")] } });
  assert.equal(c.mapa.terreno.length, 2);
  // jogador num canto cercado por obstáculos também é liberado
  const d = { ordem: [{ id: "a", tipo: "pj" }, { id: "ini_0", tipo: "ini" }], inimigos: [{ id: "ini_0", pv: 7 }] };
  MP.prepararCombate(d, { mapa: { terreno: [peca("obstaculo", 1, 12, 1, 2, "Pedra 1"), peca("obstaculo", 0, 11, 2, 1, "Pedra 2")] }, posicoes: { a: { x: 0, y: 13 } } });
  assert.deepEqual(d.posicoes.a, { x: 0, y: 13 });
  assert.ok(MP.conectado(d.mapa, d.posicoes));
  assert.ok(d.mapa.terreno.length < 2);
});

test("mapa padrão: 2 a 4 peças no meio do campo, longe das largadas, reproduzível e sem isolar ninguém", () => {
  for (let semente = 1; semente <= 60; semente++) {
    const m = MP.mapaPadrao("Ponte velha", MP.rngComSemente(semente));
    assert.deepEqual(m, MP.mapaPadrao("Ponte velha", MP.rngComSemente(semente)));
    assert.deepEqual([m.colunas, m.linhas, m.imagem], [10, 14, ""]);
    assert.match(m.descricao, /^Ponte velha/);
    assert.ok(m.terreno.length >= 2 && m.terreno.length <= 4, `semente ${semente}: ${m.terreno.length} peças`);
    for (const t of m.terreno) {
      assert.ok(["obstaculo", "cobertura"].includes(t.tipo));
      assert.ok(t.y >= 3 && t.y + t.a - 1 <= m.linhas - 3, `semente ${semente}: peça na largada`);
      assert.ok(t.x >= 0 && t.x + t.l <= m.colunas);
    }
    const c = { ordem: [{ id: "a", tipo: "pj" }, { id: "b", tipo: "pj" }, { id: "ini_0", tipo: "ini" }, { id: "ini_1", tipo: "ini" }], inimigos: [{ id: "ini_0", pv: 7 }, { id: "ini_1", pv: 7 }] };
    MP.prepararCombate(c, null, { cena: "Ponte velha", rng: MP.rngComSemente(semente) });
    assert.ok(MP.conectado(c.mapa, c.posicoes));
    assert.ok(c.posicoes.a.y >= 12 && c.posicoes.ini_0.y <= 2);
  }
});

test("caminhos: difícil, água e cobertura custam 2; obstáculo bloqueia; atravessa aliado mas não inimigo; não para em casa ocupada", () => {
  const lama = mapa([peca("dificil", 0, 10, 10, 2, "Lama")]);
  const so = [{ id: "a", x: 4, y: 12, lado: "pj" }];
  assert.deepEqual(MP.planejarMovimento(lama, so, "a", { x: 4, y: 12 }, { x: 4, y: 10 }, 5).custo, 4);
  assert.deepEqual(MP.planejarMovimento(lama, so, "a", { x: 4, y: 12 }, { x: 4, y: 9 }, 5).custo, 5);
  assert.deepEqual(MP.planejarMovimento(lama, so, "a", { x: 4, y: 12 }, { x: 4, y: 8 }, 5), { ok: false, motivo: "longe", custo: 6 });
  assert.equal(MP.planejarMovimento(mapa([peca("agua", 4, 11)]), so, "a", { x: 4, y: 12 }, { x: 4, y: 11 }, 5).custo, 2);
  assert.equal(MP.planejarMovimento(mapa([peca("cobertura", 4, 11)]), so, "a", { x: 4, y: 12 }, { x: 4, y: 11 }, 5).custo, 2);
  assert.equal(MP.planejarMovimento(mapa([peca("obstaculo", 4, 11)]), so, "a", { x: 4, y: 12 }, { x: 4, y: 11 }, 5).motivo, "bloqueada");
  assert.equal(MP.planejarMovimento(mapa(), so, "a", { x: 4, y: 12 }, { x: 10, y: 12 }, 5).motivo, "fora");
  // diagonal custa 1
  assert.equal(MP.planejarMovimento(mapa(), so, "a", { x: 4, y: 12 }, { x: 0, y: 8 }, 5).custo, 4);

  // corredor: muralha na linha 10 com uma passagem em E11 (x=4)
  const corredor = mapa([peca("obstaculo", 0, 10, 4, 1), peca("obstaculo", 5, 10, 5, 1)]);
  const comAliado = [{ id: "a", x: 4, y: 12, lado: "pj" }, { id: "b", x: 4, y: 10, lado: "pj" }];
  const r1 = MP.planejarMovimento(corredor, comAliado, "a", { x: 4, y: 12 }, { x: 4, y: 9 }, 5);
  assert.deepEqual([r1.ok, r1.custo], [true, 3]);
  assert.deepEqual(r1.caminho.map(MP.rotulo), ["E13", "E12", "E11", "E10"]);
  assert.equal(MP.planejarMovimento(corredor, comAliado, "a", { x: 4, y: 12 }, { x: 4, y: 10 }, 5).motivo, "ocupada");
  const comInimigo = [{ id: "a", x: 4, y: 12, lado: "pj" }, { id: "ini_0", x: 4, y: 10, lado: "ini" }];
  assert.equal(MP.planejarMovimento(corredor, comInimigo, "a", { x: 4, y: 12 }, { x: 4, y: 9 }, 5).motivo, "sem-caminho");
  // as casas alcançáveis não incluem casas ocupadas, mas incluem as que só se alcançam passando pelo aliado
  const alc = MP.alcancaveis(corredor, comAliado, "a", { x: 4, y: 12 }, 5).map(MP.rotulo);
  assert.ok(alc.includes("E10") && !alc.includes("E11") && alc.includes("E13"));
  // inimigos mortos não ocupam o mapa
  const c = { posicoes: { a: { x: 1, y: 1 }, ini_0: { x: 2, y: 2 }, ini_1: { x: 3, y: 3 } }, inimigos: [{ id: "ini_0", pv: 0 }, { id: "ini_1", pv: 3 }] };
  assert.deepEqual(MP.ocupantes(c).map((o) => `${o.id}:${o.lado}`), ["a:pj", "ini_1:ini"]);
});

test("linha de visão e cobertura", () => {
  const m = mapa([peca("obstaculo", 4, 6), peca("cobertura", 7, 5), peca("obstaculo", 1, 0), peca("obstaculo", 0, 1)]);
  assert.equal(MP.linhaDeVisao(m, { x: 4, y: 10 }, { x: 4, y: 2 }), false);
  assert.equal(MP.linhaDeVisao(m, { x: 2, y: 10 }, { x: 2, y: 2 }), true);
  assert.equal(MP.linhaDeVisao(m, { x: 0, y: 0 }, { x: 2, y: 2 }), true, "passar raspando num canto não bloqueia");
  assert.equal(MP.linhaDeVisao(m, { x: 7, y: 10 }, { x: 7, y: 2 }), true, "cobertura não bloqueia a visão");
  assert.equal(MP.temCobertura(m, { x: 7, y: 10 }, { x: 7, y: 4 }), true, "logo atrás da cobertura");
  assert.equal(MP.temCobertura(m, { x: 7, y: 10 }, { x: 7, y: 5 }), true, "em cima da cobertura");
  assert.equal(MP.temCobertura(m, { x: 7, y: 10 }, { x: 7, y: 2 }), false, "longe atrás da cobertura");
  assert.equal(MP.temCobertura(m, { x: 7, y: 0 }, { x: 7, y: 4 }), false, "a cobertura está do outro lado");
});

test("inimigo corpo a corpo: anda até 6 casas rumo ao mais próximo e só ataca se terminar ao lado", () => {
  const m = mapa();
  const alvos = [{ id: "a", nome: "Ana", pv: 10, x: 4, y: 12 }];
  const ocup = (x, y) => [{ id: "a", x: 4, y: 12, lado: "pj" }, { id: "ini_0", x, y, lado: "ini" }];
  const longe = MP.turnoInimigo(m, ocup(4, 2), { id: "ini_0", alcance: "corpo" }, { x: 4, y: 2 }, alvos);
  assert.equal(longe.custo, 6);
  assert.equal(MP.distancia(longe.destino, alvos[0]), 4);
  assert.equal(longe.alvoId, null);
  const perto = MP.turnoInimigo(m, ocup(4, 6), { id: "ini_0", alcance: "corpo" }, { x: 4, y: 6 }, alvos);
  assert.equal(MP.distancia(perto.destino, alvos[0]), 1);
  assert.equal(perto.alvoId, "a");
  const junto = MP.turnoInimigo(m, ocup(5, 11), { id: "ini_0" }, { x: 5, y: 11 }, alvos);
  assert.deepEqual([junto.destino, junto.custo, junto.alvoId], [{ x: 5, y: 11 }, 0, "a"]);

  // pelo regras.passarVez com a tática do mapa: o longe só se move (sem ataque), o perto ataca; a vez volta ao jogador
  const a = ficha("a");
  const c = {
    rodada: 1, vez: 0, mapa: m,
    ordem: [{ id: "a", tipo: "pj", nome: "a" }, { id: "ini_0", tipo: "ini", nome: "Goblin 1" }, { id: "ini_1", tipo: "ini", nome: "Goblin 2" }],
    inimigos: [{ id: "ini_0", nome: "Goblin 1", pv: 7, ca: 13, ataque: 4, dano: "1", alcance: "corpo" }, { id: "ini_1", nome: "Goblin 2", pv: 7, ca: 13, ataque: 4, dano: "1", alcance: "corpo" }],
    posicoes: { a: { x: 4, y: 12 }, ini_0: { x: 4, y: 0 }, ini_1: { x: 7, y: 7 } },
  };
  const ocorrido = R.passarVez(c, { a }, "a", { tatica: MP.criarTatica(c) });
  const linhas = ocorrido.map((o) => o.linha);
  assert.ok(linhas.some((l) => /^Goblin 1 avança para [A-J]\d+\.$/.test(l)), linhas.join(" | "));
  assert.ok(!linhas.some((l) => l.startsWith("Goblin 1 ataca")));
  assert.ok(linhas.some((l) => /^Goblin 2 avança para .+, ao lado de a\.$/.test(l)));
  assert.ok(linhas.some((l) => l.startsWith("Goblin 2 ataca a:")));
  assert.equal(MP.distancia(c.posicoes.ini_0, c.posicoes.a), 6);
  assert.equal(MP.distancia(c.posicoes.ini_1, c.posicoes.a), 1);
  assert.equal(ocorrido.find((o) => o.linha.startsWith("Goblin 1")).log.ok, null);   // movimento é neutro no diário
  assert.equal(R.vezAtual(c).id, "a");
});

test("inimigo à distância: sem visão ou colado em alguém, reposiciona até ter visão e atira; cobertura dá +2", () => {
  const muralha = mapa([peca("obstaculo", 2, 6, 5, 1, "Muralha")]);
  const alvos = [{ id: "a", nome: "Ana", pv: 10, x: 4, y: 12 }];
  const ocup = [{ id: "a", x: 4, y: 12, lado: "pj" }, { id: "ini_0", x: 4, y: 2, lado: "ini" }];
  assert.equal(MP.linhaDeVisao(muralha, { x: 4, y: 2 }, alvos[0]), false);
  const r = MP.turnoInimigo(muralha, ocup, { id: "ini_0", alcance: "distancia" }, { x: 4, y: 2 }, alvos);
  assert.ok(r.custo > 0 && r.custo <= 6);
  assert.ok(MP.linhaDeVisao(muralha, r.destino, alvos[0]));
  assert.equal(r.alvoId, "a");
  // já vê o alvo e não está colado: fica onde está
  const fica = MP.turnoInimigo(mapa(), ocup, { id: "ini_0", alcance: "distancia" }, { x: 4, y: 2 }, alvos);
  assert.deepEqual([fica.custo, fica.alvoId], [0, "a"]);
  // colado no alvo: se afasta
  const colado = MP.turnoInimigo(mapa(), [ocup[0], { id: "ini_0", x: 4, y: 11, lado: "ini" }], { id: "ini_0", alcance: "distancia" }, { x: 4, y: 11 }, alvos);
  assert.ok(MP.distancia(colado.destino, alvos[0]) > 1);
  assert.equal(colado.alvoId, "a");

  // pelo passarVez: atira em quem está atrás da cobertura, contra CA +2
  const c = {
    rodada: 1, vez: 0, mapa: mapa([peca("cobertura", 4, 11, 1, 1, "Caixote")]),
    ordem: [{ id: "a", tipo: "pj", nome: "a" }, { id: "ini_0", tipo: "ini", nome: "Arqueiro" }],
    inimigos: [{ id: "ini_0", nome: "Arqueiro", pv: 7, ca: 13, ataque: 4, dano: "1", alcance: "distancia" }],
    posicoes: { a: { x: 4, y: 12 }, ini_0: { x: 4, y: 2 } },
  };
  const ocorrido = R.passarVez(c, { a: ficha("a") }, "a", { tatica: MP.criarTatica(c) });
  assert.equal(ocorrido.length, 1);
  assert.match(ocorrido[0].linha, /^Arqueiro ataca a: \d+\+4 = \d+ vs CA 32 \(cobertura \+2\) → /);
  assert.deepEqual(c.posicoes.ini_0, { x: 4, y: 2 });
});

test("reforços: os novos ganham casa sem mexer em quem já está no mapa", () => {
  const m = mapa();
  const posicoes = { a: { x: 4, y: 12 }, ini_0: { x: 4, y: 1 } };
  MP.posicionarNovos(m, posicoes, [{ id: "ini_1", lado: "ini", pedida: { x: 4, y: 1 } }, { id: "ini_2", lado: "ini", pedida: { x: 9, y: 0 } }, { id: "ini_0", lado: "ini", pedida: { x: 0, y: 0 } }]);
  assert.deepEqual(posicoes.a, { x: 4, y: 12 });
  assert.deepEqual(posicoes.ini_0, { x: 4, y: 1 });
  assert.deepEqual(posicoes.ini_2, { x: 9, y: 0 });
  assert.ok(posicoes.ini_1.y <= 2 && !(posicoes.ini_1.x === 4 && posicoes.ini_1.y === 1));
  // combate com mapa e alguém da ordem sem casa (dados antigos): completa sem mexer nos outros
  const c = { mapa: m, ordem: [{ id: "a", tipo: "pj" }, { id: "b", tipo: "pj" }, { id: "ini_0", tipo: "ini" }], inimigos: [{ id: "ini_0", pv: 7 }], posicoes: { a: { x: 4, y: 13 }, ini_0: { x: 4, y: 1 } } };
  MP.completarPosicoes(c);
  assert.deepEqual(c.posicoes.a, { x: 4, y: 13 });
  assert.ok(c.posicoes.b.y >= 12);
});

test("situação no mapa em texto para o Mestre e prompt da imagem do mapa", () => {
  const c = {
    mapa: { colunas: 10, linhas: 14, descricao: "Clareira com um riacho", terreno: [peca("obstaculo", 3, 2, 2, 2, "Pilar caído"), peca("agua", 0, 6, 10, 1, "Riacho")], imagem: "" },
    posicoes: { u1: { x: 2, y: 11 }, u2: { x: 6, y: 12 }, ini_0: { x: 5, y: 2 }, ini_1: { x: 0, y: 0 } },
    inimigos: [{ id: "ini_0", nome: "Goblin 1", pv: 7, pvMax: 7, ca: 13 }, { id: "ini_1", nome: "Goblin 2", pv: 0, pvMax: 7, ca: 13 }],
    ordem: [],
  };
  const txt = MP.descreverSituacao(c, [{ uid: "u1", nome: "Lia", pv: 10 }, { uid: "u2", nome: "Bruno", pv: 0 }]);
  assert.match(txt, /^Mapa 10×14 .*: Clareira com um riacho\./);
  assert.match(txt, /Terreno: Pilar caído \(D3–E4, obstáculo\); Riacho \(A7–J7, água\)\./);
  assert.match(txt, /Posições: Lia C12; Bruno G13 \(caído\); Goblin 1 F3 \(a 9 casas de Lia\)\./);
  assert.ok(!txt.includes("Goblin 2"), "derrotado não aparece");
  const p = M.promptImagemMapa("piratas", c.mapa);
  assert.match(p, /^Top-down orthographic battle map seen directly from above, tabletop RPG style, Clareira com um riacho, /);
  assert.match(p, /solid obstacle "Pilar caído" near the upper (left|center)/);
  assert.match(p, /shallow water "Riacho" crossing the middle/);
  assert.match(p, /no grid lines, no text, no people, no creatures, no tokens, portrait orientation/);
  // o contexto do Mestre em combate traz o mapa; combate antigo sem mapa, não
  const mesa = { tema: "classico", combate: { ...c, rodada: 1 }, resumo: "", cena: "" };
  const fichas = [R.normalizarFicha({ nome: "Lia" }, "u1")];
  assert.match(M.contexto(mesa, fichas, []), /EM COMBATE[\s\S]*Goblin 1 \[id ini_0\]: PV 7\/7, CA 13, corpo a corpo[\s\S]*Mapa 10×14/);
  const antigo = { ...mesa, combate: { rodada: 1, inimigos: [{ id: "ini_0", nome: "Goblin 1", pv: 7, pvMax: 7, ca: 13 }] } };
  const ctxAntigo = M.contexto(antigo, fichas, []);
  assert.match(ctxAntigo, /Goblin 1 \[id ini_0\]: PV 7\/7, CA 13\n/);
  assert.ok(!/Mapa \d+×/.test(ctxAntigo));
});
