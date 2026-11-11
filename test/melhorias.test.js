/**
 * Testes das regras das melhorias só de servidor (sem servidor nem IA): memória, clima, chance, elementos,
 * condições, fuga, selos, fundos reaproveitados e medição de uso. Rodar: npm test
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const ML = require("../melhorias");
const R = require("../regras");

test("memória: fatos, NPCs e reputação entram, mudam, apagam e respeitam os limites", () => {
  const mundo = ML.normalizarMundo(null);
  const linhas = ML.aplicarMemoria(mundo, {
    fatos: { "Ponte Restaurada": "o grupo consertou a ponte", poupou_o_bandido: true, vazio: "" },
    npcs: { Odila: "grata" }, reputacao: { "Guarda da Cidade": 2, Ladrões: -9, nada: 0 } }, 1);
  assert.deepEqual(Object.keys(mundo.fatos), ["ponte_restaurada", "poupou_o_bandido"]);
  assert.equal(mundo.fatos.poupou_o_bandido.v, "sim");
  assert.equal(mundo.npcs.Odila.v, "grata");
  assert.deepEqual(mundo.reputacao, { "Guarda da Cidade": 2, Ladrões: -2 });          // cada mudança vale de -2 a +2
  assert.deepEqual(linhas, ["Reputação com Guarda da Cidade: +2 (agora +2, bem-vistos).", "Reputação com Ladrões: -2 (agora -2, malvistos)."]);
  ML.aplicarMemoria(mundo, { fatos: { ponte_restaurada: null }, npcs: { Odila: "desconfiada" } }, 2);
  assert.deepEqual(Object.keys(mundo.fatos), ["poupou_o_bandido"]);
  assert.equal(mundo.npcs.Odila.v, "desconfiada");
  // limite de fatos: os mais antigos saem; a reputação para em ±10
  for (let i = 0; i < 60; i++) ML.aplicarMemoria(mundo, { fatos: { [`fato ${i}`]: "x" }, reputacao: { "Guarda da Cidade": 2 } }, 10 + i);
  assert.equal(Object.keys(mundo.fatos).length, 40);
  assert.ok(!("poupou_o_bandido" in mundo.fatos) && "fato_59" in mundo.fatos);
  assert.equal(mundo.reputacao["Guarda da Cidade"], 10);
  // o que vem do banco é sempre normalizado; lixo vira mundo vazio
  assert.deepEqual(ML.normalizarMundo(JSON.stringify(mundo)), mundo);
  assert.deepEqual(ML.normalizarMundo("{torto"), ML.normalizarMundo({ clima: "granizo", periodo: 3, fatos: [1], reputacao: "x" }));
  assert.equal(ML.aplicarMemoria(mundo, "lixo").length, 0);
});

test("clima e período: ajuste de -2 a +2 só nas perícias afetadas", () => {
  assert.deepEqual(ML.ajusteDoAmbiente({ clima: "", periodo: "noite" }, "Furtividade"), { valor: 2, motivo: "noite" });
  assert.deepEqual(ML.ajusteDoAmbiente({ clima: "neblina", periodo: "noite" }, "Percepção"), { valor: -2, motivo: "neblina e noite" });
  assert.deepEqual(ML.ajusteDoAmbiente({ clima: "chuva", periodo: "tarde" }, "Atletismo"), { valor: -2, motivo: "chuva" });
  assert.equal(ML.ajusteDoAmbiente({ clima: "chuva", periodo: "noite" }, "Persuasão"), null);
  assert.equal(ML.ajusteDoAmbiente({ clima: "limpo", periodo: "manha" }, "Furtividade"), null);
});

test("chance de sucesso: (21 - (CD - bônus)) / 20, entre 5% e 95%", () => {
  assert.equal(ML.chanceDeSucesso(3, 13), 55);
  assert.equal(ML.chanceDeSucesso(0, 10), 55);
  assert.equal(ML.chanceDeSucesso(5, 13), 65);
  assert.equal(ML.chanceDeSucesso(15, 10), 95);          // 1 natural sempre falha
  assert.equal(ML.chanceDeSucesso(-2, 25), 5);           // 20 natural sempre passa
});

test("elementos: pelo nome do ataque; fraqueza ×1,5, resistência metade, imunidade zero; chuva enfraquece o fogo", () => {
  const nomes = { "Bola de Fogo": "fogo", "Mãos Flamejantes": "fogo", "Raio Ardente": "fogo", "Raio de Gelo": "gelo", "Cone de Frio": "gelo",
    "Toque Chocante": "raio", "Relâmpago": "raio", "Chama Sagrada": "fogo", "Arma Espiritual": "luz", "Lâmina na sombra": "sombra",
    "Machado de batalha": "", "Mísseis Mágicos": "", "Golpe poderoso": "", "": "" };
  for (const [nome, el] of Object.entries(nomes)) assert.equal(ML.elementoDoNome(nome), el, nome);
  const troll = { nome: "Troll", pv: 40, fraquezas: ["fogo"], resistencias: ["gelo"], imunidades: ["veneno"] };
  assert.deepEqual(ML.danoComElemento(9, "fogo", troll, {}), { dano: 14, selo: "fraqueza", nota: "Troll é fraco a fogo: dano ×1,5" });
  assert.equal(ML.danoComElemento(9, "gelo", troll, {}).dano, 4);
  assert.deepEqual(ML.danoComElemento(9, "veneno", troll, {}), { dano: 0, selo: "imune", nota: "Troll é imune a veneno" });
  assert.deepEqual(ML.danoComElemento(9, "raio", troll, {}), { dano: 9, selo: "", nota: "" });
  assert.deepEqual(ML.danoComElemento(9, "", troll, {}), { dano: 9, selo: "", nota: "" });
  const goblin = { nome: "Goblin", pv: 7 };
  assert.equal(ML.danoComElemento(9, "fogo", goblin, { clima: "chuva" }).dano, 4);
  assert.equal(ML.danoComElemento(9, "fogo", troll, { clima: "tempestade" }).dano, 14);          // fraqueza vale mais que a chuva
  assert.equal(ML.danoComElemento(1, "gelo", troll, {}).dano, 1);                                  // acerto nunca vira zero por resistência
  // o inimigo só guarda elementos válidos, e só quando o Mestre mandou algum
  assert.deepEqual(R.criarInimigo("ini_0", { nome: "Troll", fraquezas: ["Fogo", "fogo", "lama"], resistencias: "gelo" }).fraquezas, ["fogo"]);
  assert.ok(!("resistencias" in R.criarInimigo("ini_0", { nome: "Troll", resistencias: "gelo" })));
  assert.deepEqual(Object.keys(R.criarInimigo("ini_0", { nome: "Goblin" })), ["id", "nome", "pv", "pvMax", "ca", "ataque", "dano", "des", "alcance"]);
});

test("rolagem com opções: dano pelo elemento, selo do resultado e condição deixada pelo crítico; sem opções, tudo como antes", () => {
  const opcoes = {
    ajustarDano(rol, alvo, dano, critico) {
      const r = ML.danoComElemento(dano, rol.elemento, alvo, {});
      const avisos = [];
      return { ...r, avisos, depois: critico ? () => avisos.push(ML.aplicarStatus(alvo, "em_chamas", 2)) : null };
    },
    selo: ML.seloDaRolagem,
  };
  const combate = () => ({ inimigos: [{ id: "ini_0", nome: "Troll", pv: 200, pvMax: 200, ca: 12, fraquezas: ["fogo"], resistencias: ["gelo"], imunidades: ["veneno"] }] });
  const rol = (extra) => ({ tipo: "ataque", rotulo: "Tocha vs Troll", bonus: 4, cd: 12, dano: "10", alvo: "ini_0", ...extra });

  let c = combate();
  let r = R.resolverRolagem(rol({ elemento: "fogo" }), 15, c, "Ana", opcoes);
  assert.deepEqual([r.dano, r.selo, c.inimigos[0].pv], [15, "fraqueza: 15 de dano", 185]);
  assert.match(r.descricao, /15 de dano\. \(Troll é fraco a fogo: dano ×1,5\)$/);

  c = combate();
  r = R.resolverRolagem(rol({ elemento: "fogo" }), 20, c, "Ana", opcoes);          // crítico: dado dobrado não muda um dano fixo
  assert.equal(r.selo, "crítico! fraqueza: 15 de dano");
  assert.deepEqual(c.inimigos[0].status, [{ tipo: "em_chamas", turnos: 2 }]);
  assert.deepEqual(r.avisos, ["Troll fica em chamas por 2 turnos."]);

  assert.equal(R.resolverRolagem(rol({ elemento: "gelo" }), 15, combate(), "Ana", opcoes).selo, "resistiu: 5 de dano");
  c = combate();
  r = R.resolverRolagem(rol({ elemento: "veneno" }), 15, c, "Ana", opcoes);
  assert.deepEqual([r.dano, r.selo, c.inimigos[0].pv, r.sucesso], [0, "imune: 0 de dano", 200, true]);
  assert.equal(R.resolverRolagem(rol(), 20, combate(), "Ana", opcoes).selo, "crítico! 10 de dano");
  assert.equal(R.resolverRolagem(rol(), 15, combate(), "Ana", opcoes).selo, undefined);          // acerto comum: o selo de sempre
  assert.equal(R.resolverRolagem(rol(), 7, combate(), "Ana", opcoes).selo, "errou por pouco");   // 11 contra CA 12
  assert.equal(R.resolverRolagem(rol(), 3, combate(), "Ana", opcoes).selo, undefined);
  assert.equal(R.resolverRolagem(rol(), 1, combate(), "Ana", opcoes).selo, "falha crítica");
  const teste = { tipo: "teste", rotulo: "Atletismo", bonus: 3, cd: 13 };
  assert.equal(R.resolverRolagem(teste, 20, null, "Ana", opcoes).selo, "sucesso crítico");
  assert.equal(R.resolverRolagem(teste, 9, null, "Ana", opcoes).selo, "falha por pouco");
  assert.equal(R.resolverRolagem(teste, 10, null, "Ana", opcoes).selo, undefined);
  assert.equal(R.resolverRolagem(teste, 4, null, "Ana", opcoes).selo, undefined);

  // sem opções: o mesmo resultado de antes das melhorias
  c = combate();
  r = R.resolverRolagem(rol({ elemento: "fogo" }), 15, c, "Ana");
  assert.deepEqual(Object.keys(r), ["natural", "total", "sucesso", "dano", "descricao"]);
  assert.deepEqual([r.dano, c.inimigos[0].pv], [10, 190]);
});

test("condições: aplicam, renovam, contam turnos, causam dano ou cura e fazem perder a vez", () => {
  const ana = { nome: "Ana", pv: 10, pvMax: 12 };
  assert.equal(ML.aplicarStatus(ana, "envenenado", 2), "Ana fica envenenado por 2 turnos.");
  assert.equal(ML.aplicarStatus(ana, "envenenado", 1), "");                                  // já tem por mais tempo
  assert.equal(ML.aplicarStatus(ana, "voando", 2), "");
  assert.equal(ML.aplicarStatus(ana, "atordoado", 99), "Ana fica atordoado por 5 turnos.");  // no máximo 5
  assert.equal(ML.aplicarStatus({ nome: "Caído", pv: 0 }, "protegido", 2), "");
  ana.status = [{ tipo: "envenenado", turnos: 2 }, { tipo: "atordoado", turnos: 1 }, { tipo: "regenerando", turnos: 1 }];
  let r = ML.processarStatus(ana);
  assert.deepEqual(r.linhas, ["Ana sofre 2 de dano por estar envenenado.", "Ana está atordoado e perde a vez.", "Ana não está mais atordoado.",
    "Ana recupera 2 PV por estar regenerando.", "Ana não está mais regenerando."]);
  assert.deepEqual([r.pula, ana.pv, ana.status], [true, 10, [{ tipo: "envenenado", turnos: 1 }]]);
  r = ML.processarStatus(ana);
  assert.deepEqual([r.pula, ana.pv, ana.status], [false, 8, []]);
  assert.deepEqual(ML.processarStatus(ana), { linhas: [], pula: false, mudou: false });
  const fraco = { nome: "Beto", pv: 2, pvMax: 10, status: [{ tipo: "em_chamas", turnos: 3 }] };
  assert.deepEqual(ML.processarStatus(fraco).linhas, ["Beto sofre 3 de dano por estar em chamas e cai."]);
  assert.deepEqual([fraco.pv, fraco.status], [0, []]);
  // a ficha guarda só condições válidas, e só enquanto valem
  const f = R.normalizarFicha({ nome: "Ana", status: [{ tipo: "protegido", turnos: 9 }, { tipo: "protegido", turnos: 1 }, { tipo: "x", turnos: 2 }, null] }, "u1");
  assert.deepEqual(f.status, [{ tipo: "protegido", turnos: 5 }]);
  assert.ok(!("status" in R.normalizarFicha({ nome: "Ana" }, "u1")));
  assert.ok(!("status" in R.normalizarFicha({ nome: "Ana", pv: 0, status: [{ tipo: "protegido", turnos: 2 }] }, "u1")));
});

test("turnos com opções: condições no começo do turno, CA de quem está protegido e inimigo ferido que foge", () => {
  const ficha = (uid, nome, extra = {}) => ({ uid, nome, pv: 20, pvMax: 20, ca: 30, atributos: { des: 10 }, ...extra });
  const inimigo = (id, extra = {}) => ({ id, nome: `Goblin ${id}`, pv: 8, pvMax: 8, ca: 13, ataque: 4, dano: "1d4", des: 0, alcance: "corpo", ...extra });
  const opcoes = (mudadas = new Set()) => ({
    inicioDoTurno: (alvo, tipo) => { const r = ML.processarStatus(alvo); if (r.mudou && tipo === "pj") mudadas.add(alvo); return r; },
    foge: (ini, c, alvos) => ML.inimigoFoge(ini, c, alvos.length, () => 0),
    bonusCA: (alvo) => (ML.temStatus(alvo, "protegido") ? 2 : 0),
  });

  // inimigo em chamas sofre o dano; inimigo atordoado perde a vez; o personagem envenenado sofre quando a vez chega nele
  const fichas = { a: ficha("a", "Ana", { status: [{ tipo: "envenenado", turnos: 2 }, { tipo: "protegido", turnos: 2 }] }) };
  const c = { rodada: 1, vez: 0, inimigos: [inimigo("ini_0", { status: [{ tipo: "em_chamas", turnos: 1 }] }), inimigo("ini_1", { status: [{ tipo: "atordoado", turnos: 1 }] })],
    ordem: [{ id: "a", tipo: "pj", nome: "Ana" }, { id: "ini_0", tipo: "ini", nome: "Goblin ini_0" }, { id: "ini_1", tipo: "ini", nome: "Goblin ini_1" }] };
  const mudadas = new Set();
  const ocorrido = R.passarVez(c, fichas, "a", opcoes(mudadas));
  const linhas = ocorrido.map((o) => o.linha);
  assert.equal(linhas[0], "Goblin ini_0 sofre 3 de dano por estar em chamas.");
  assert.equal(linhas[1], "Goblin ini_0 não está mais em chamas.");
  assert.match(linhas[2], /^Goblin ini_0 ataca Ana: .* vs CA 32 \(protegido \+2\) → /);
  assert.equal(linhas[3], "Goblin ini_1 está atordoado e perde a vez.");
  assert.equal(linhas[5], "Ana sofre 2 de dano por estar envenenado.");
  assert.ok(ocorrido.filter((o) => !o.linha.includes(" ataca ")).every((o) => o.log.tipo === "sys" && o.log.ok === null));
  assert.equal(c.inimigos[0].pv, 5);
  assert.deepEqual([R.vezAtual(c).id, c.rodada, mudadas.has(fichas.a)], ["a", 2, true]);
  assert.deepEqual(fichas.a.status, [{ tipo: "envenenado", turnos: 1 }, { tipo: "protegido", turnos: 1 }]);
  // a vez não mudou: chamar de novo não desconta as condições outra vez
  R.passarVez(c, fichas, null, opcoes());
  assert.deepEqual(fichas.a.status, [{ tipo: "envenenado", turnos: 1 }, { tipo: "protegido", turnos: 1 }]);

  // fuga: 1/4 da vida ou menos e em desvantagem; chefes, criaturas pequenas e quem não está em desvantagem ficam
  const dois = { a: ficha("a", "Ana"), b: ficha("b", "Beto") };
  const luta = { rodada: 1, vez: 0, inimigos: [inimigo("ini_0", { pv: 2 })],
    ordem: [{ id: "a", tipo: "pj", nome: "Ana" }, { id: "ini_0", tipo: "ini", nome: "Goblin ini_0" }, { id: "b", tipo: "pj", nome: "Beto" }] };
  assert.deepEqual(R.passarVez(luta, dois, "a", opcoes()).map((o) => o.linha), ["Goblin ini_0 está muito ferido e foge do combate."]);
  assert.deepEqual([luta.inimigos[0].pv, luta.inimigos[0].fugiu, R.combateAcabou(luta, dois)], [0, true, true]);
  const c1 = { inimigos: [inimigo("x", { pv: 2 })] };
  assert.equal(ML.inimigoFoge(c1.inimigos[0], c1, 2, () => 0), true);
  assert.equal(ML.inimigoFoge(c1.inimigos[0], c1, 2, () => 0.9), false);          // metade das vezes resolve lutar
  assert.equal(ML.inimigoFoge(c1.inimigos[0], c1, 1, () => 0), false);            // um contra um: não foge
  assert.equal(ML.inimigoFoge(inimigo("x", { pv: 3 }), c1, 2, () => 0), false);   // ainda tem mais de 1/4 da vida
  assert.equal(ML.inimigoFoge(inimigo("x", { pv: 1, pvMax: 5 }), c1, 2, () => 0), false);
  assert.equal(ML.inimigoFoge(inimigo("x", { pv: 5, pvMax: 60 }), c1, 2, () => 0), false);
  process.env.FUGA_DE_INIMIGOS = "0";
  assert.equal(ML.inimigoFoge(c1.inimigos[0], c1, 2, () => 0), false);
  delete process.env.FUGA_DE_INIMIGOS;
});

test("fundos: biblioteca primeiro, mesma cena sempre, mesmo tipo de lugar depois de 2 variantes; arquivo apagado sai da lista; uso contado", () => {
  assert.equal(ML.tipoDeLugar("Taverna Javali Cego"), "taverna");
  assert.equal(ML.tipoDeLugar("Galerias da Mina"), "caverna");
  assert.equal(ML.tipoDeLugar("Ponte de Comando"), "nave");
  assert.equal(ML.tipoDeLugar("Barbearia do Zé"), "");          // "bar" só vale como palavra inteira
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-viva-fundos-"));
  const db = new Database(":memory:");
  db.exec("CREATE TABLE mesas (codigo TEXT PRIMARY KEY)");
  try {
    fs.mkdirSync(path.join(pasta, "images"));
    const imagem = (nome) => { fs.writeFileSync(path.join(pasta, "images", nome), "x"); return `https://jogo.exemplo/images/${nome}`; };
    const M = { definirExtraDoContexto() {}, definirMedidor() {}, numAto: (v) => Number(v) || 1 };
    const MH = ML.instalar({ db, M, json: (s) => s, texto: (v) => String(v), salvarMesa() {}, salvarFicha() {}, registrar() {}, broadcast() {}, erro() {},
      baseUrl: () => "https://novo.exemplo", pastaPublica: pasta });
    const tema = { id: "classico" }, outro = { id: "piratas" };
    assert.equal(MH.fundoPronto(tema, "Taverna Javali Cego"), "");
    MH.guardarFundo(tema, "Taverna Javali Cego", imagem("a.png"));
    MH.guardarFundo(tema, "Taverna Javali Cego", "https://fora.exemplo/x.png");          // não é arquivo deste servidor: não guarda
    MH.guardarFundo(tema, "Taverna Javali Cego", "data:image/svg+xml;base64,AAAA");
    // a mesma cena reaproveita (com o endereço atual do servidor); outro tema não
    assert.equal(MH.fundoPronto(tema, "taverna  javali cego"), "https://novo.exemplo/images/a.png");
    assert.equal(MH.fundoPronto(outro, "Taverna Javali Cego"), "");
    // mesmo tipo de lugar: só depois de haver 2 variantes
    assert.equal(MH.fundoPronto(tema, "Taverna do Porto Velho"), "");
    MH.guardarFundo(tema, "Estalagem da Lua", imagem("b.png"));
    assert.equal(MH.fundoPronto(tema, "Taverna do Porto Velho", () => 0), "https://novo.exemplo/images/b.png");
    assert.equal(MH.fundoPronto(tema, "Taverna do Porto Velho", () => 0.99), "https://novo.exemplo/images/a.png");
    assert.equal(MH.fundoPronto(tema, "Sala sem nome conhecido"), "");
    process.env.REAPROVEITAR_FUNDOS = "exato";
    assert.equal(MH.fundoPronto(tema, "Taverna do Porto Velho"), "");
    assert.equal(MH.fundoPronto(tema, "Estalagem da Lua"), "https://novo.exemplo/images/b.png");
    process.env.REAPROVEITAR_FUNDOS = "0";
    assert.equal(MH.fundoPronto(tema, "Estalagem da Lua"), "");
    delete process.env.REAPROVEITAR_FUNDOS;
    // arquivo apagado do disco sai da lista
    fs.rmSync(path.join(pasta, "images", "b.png"));
    assert.equal(MH.fundoPronto(tema, "Estalagem da Lua"), "");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM fundos WHERE url = '/images/b.png'").get().n, 0);
    // biblioteca de fundos prontos: pelo nome da cena ou pelo tipo de lugar, no tema ou em "geral"; vale mesmo com o reaproveitamento desligado
    fs.mkdirSync(path.join(pasta, "fundos", "classico"), { recursive: true });
    fs.mkdirSync(path.join(pasta, "fundos", "geral"), { recursive: true });
    fs.writeFileSync(path.join(pasta, "fundos", "classico", "taverna.webp"), "x");
    fs.writeFileSync(path.join(pasta, "fundos", "geral", "floresta.jpg"), "x");
    fs.writeFileSync(path.join(pasta, "fundos", "geral", "praca-do-sino.png"), "x");
    process.env.REAPROVEITAR_FUNDOS = "0";
    assert.equal(MH.fundoPronto(tema, "Taverna Javali Cego"), "https://novo.exemplo/fundos/classico/taverna.webp");
    assert.equal(MH.fundoPronto(outro, "Bosque dos Enforcados"), "https://novo.exemplo/fundos/geral/floresta.jpg");
    assert.equal(MH.fundoPronto(outro, "Praça do Sino"), "https://novo.exemplo/fundos/geral/praca-do-sino.png");
    delete process.env.REAPROVEITAR_FUNDOS;
    // uso: chamadas, tokens e custo somados por dia, tipo e modelo
    MH.medir({ tipo: "texto", modelo: "m/rapido", uso: { prompt_tokens: 4700, completion_tokens: 900, cost: 0.001 } });
    MH.medir({ tipo: "texto", modelo: "m/rapido", uso: { prompt_tokens: 300, completion_tokens: 100, cost: 0.002 } });
    MH.medir({ tipo: "imagem", modelo: "m/imagem", uso: null });
    const uso = Object.fromEntries(db.prepare("SELECT tipo, chamadas, entrada, saida, custo FROM uso_ia").all().map((l) => [l.tipo, l]));
    assert.deepEqual([uso.texto.chamadas, uso.texto.entrada, uso.texto.saida], [2, 5000, 1000]);
    assert.ok(Math.abs(uso.texto.custo - 0.003) < 1e-9);
    assert.equal(uso.imagem.chamadas, 1);
    assert.equal(uso["fundo-reaproveitado"].chamadas, 4);
    assert.equal(uso["fundo-biblioteca"].chamadas, 3);
  } finally { db.close(); fs.rmSync(pasta, { recursive: true, force: true }); }
});
