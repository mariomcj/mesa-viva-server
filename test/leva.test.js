/**
 * Regras puras da leva do app: talentos, subclasses, redistribuição, votação, minigames e o QR da projeção.
 * Rodar: npm test
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

const R = require("../regras");
const PG = require("../progressao");
const VT = require("../votacao");
const MG = require("../minigames");
const PJ = require("../projecao");

const base = (extra = {}) => ({ nome: "Brakk", classe: "Guerreiro", atributos: { for: 16, des: 12, con: 14, int: 8, sab: 12, car: 10 }, ca: 16, ...extra });

/** Roda `f` com Math.random devolvendo os valores da lista, em ordem (depois repete o último). */
function comSorte(valores, f) {
  const real = Math.random;
  let i = 0;
  Math.random = () => valores[Math.min(i++, valores.length - 1)];
  try { return f(); } finally { Math.random = real; }
}
const dado = (n, faces = 20) => (n - 1) / faces + 0.001;   // Math.random que faz o dado cair em n

test("ficha sem progressão sai igual à de antes: nenhum campo novo", () => {
  const f = R.normalizarFicha(base(), "u1");
  for (const k of ["talentos", "subclasse", "redistribuicoes", "escolhas", "bonus"]) assert.equal(k in f, false, k);
  // nível 2 sem talento: só aparece a escolha pendente
  const g = R.normalizarFicha(base({ nivel: 2 }), "u1");
  assert.deepEqual(g.escolhas, { talentos: 1 });
  assert.equal("talentos" in g, false);
});

test("talentos: um a cada 2 níveis, sem repetir e sem inventar", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 20].map(PG.talentosDoNivel), [0, 1, 1, 2, 2, 10]);
  const f = R.normalizarFicha(base({ nivel: 4, talentos: ["couraca", "couraca", "voar", { id: "olhar_atento" }, "negociador"] }), "u1");
  assert.deepEqual(f.talentos, ["couraca", "olhar_atento"]);       // repetido e inventado caem; o terceiro passa do que o nível dá
  assert.equal(f.escolhas?.talentos, undefined);
  assert.deepEqual(f.bonus, { ca: 1, critMin: 19 });
  // nível 1 não guarda talento nenhum, mesmo que venha na ficha
  assert.equal("talentos" in R.normalizarFicha(base({ nivel: 1, talentos: ["couraca"] }), "u1"), false);
});

test("subclasse: só da própria classe e a partir do nível 3", () => {
  assert.equal(R.normalizarFicha(base({ nivel: 2, subclasse: "campeao" }), "u1").subclasse, undefined);
  assert.equal(R.normalizarFicha(base({ nivel: 3, subclasse: "assassino" }), "u1").subclasse, undefined);   // é do Ladino
  const f = R.normalizarFicha(base({ nivel: 3, subclasse: "guardiao" }), "u1");
  assert.equal(f.subclasse, "guardiao");
  assert.deepEqual(f.bonus, { ca: 1 });
  assert.deepEqual(R.normalizarFicha(base({ nivel: 3 }), "u1").escolhas, { talentos: 1, subclasse: true });
  // todas as classes têm duas opções, com nome e descrição nos dois idiomas
  for (const classe of R.CLASSES) {
    const subs = Object.values(PG.SUBCLASSES[classe]);
    assert.equal(subs.length, 2, classe);
    for (const s of subs) assert.ok(s.nome && s.nomeEn && s.descricao && s.descricaoEn, classe);
  }
  for (const t of Object.values(PG.TALENTOS)) assert.ok(t.nome && t.nomeEn && t.descricao && t.descricaoEn);
});

test("efeitos na rolagem: bônus de ataque, crítico no 19, dano extra e perícias da subclasse", () => {
  const clerigo = R.normalizarFicha(base({ classe: "Clérigo", nivel: 4, subclasse: "combatente", talentos: ["olhar_atento", "cacador_de_gigantes"] }), "u1");
  const rol = PG.aoMontarRolagem(clerigo, { tipo: "ataque", rotulo: "Martelo vs Ogro", bonus: 4, cd: 12, dano: "1d1", alvo: "ini_0" });
  assert.deepEqual([rol.bonus, rol.critMin, rol.danoChefe, rol.danoExtra], [5, 19, 2, undefined]);
  const ladino = R.normalizarFicha(base({ classe: "Ladino", nivel: 3, subclasse: "trapaceiro" }), "u2");
  assert.equal(PG.aoMontarRolagem(ladino, { tipo: "teste", rotulo: "Prestidigitação", bonus: 3, cd: 13 }).bonus, 5);
  assert.equal(PG.aoMontarRolagem(ladino, { tipo: "teste", rotulo: "Atletismo", bonus: 3, cd: 13 }).bonus, 3);
  const mago = R.normalizarFicha(base({ classe: "Mago", nivel: 3, subclasse: "destruidor" }), "u3");
  assert.equal(PG.aoMontarRolagem(mago, { tipo: "ataque", rotulo: "Cajado vs Rato", bonus: 1 }).danoExtra, undefined);          // só magia
  assert.equal(PG.aoMontarRolagem(mago, { tipo: "ataque", rotulo: "Bola de Fogo vs Rato", bonus: 1 }, { magia: true }).danoExtra, 2);
  // ficha sem nada: a rolagem não muda
  const limpa = { tipo: "ataque", rotulo: "Machado vs Rato", bonus: 5, cd: 12, dano: "1d8" };
  assert.deepEqual(PG.aoMontarRolagem(R.normalizarFicha(base(), "u4"), { ...limpa }), limpa);
});

test("resolver a rolagem: 19 vira crítico só com o talento, chefe leva +2 e a Sede de Sangue cura", () => {
  const f = R.normalizarFicha(base({ nivel: 6, pv: 10, talentos: ["olhar_atento", "cacador_de_gigantes", "sede_de_sangue"] }), "u1");
  const combate = () => ({ inimigos: [{ id: "ini_0", nome: "Ogro", pv: 60, pvMax: 60, ca: 10 }, { id: "ini_1", nome: "Rato", pv: 9, pvMax: 9, ca: 10 }] });
  const rolAtaque = (alvo) => PG.aoMontarRolagem(f, { tipo: "ataque", rotulo: `Machado vs ${alvo}`, bonus: 5, cd: 10, dano: "1d1", alvo: alvo === "Ogro" ? "ini_0" : "ini_1" });
  const gravadas = [];
  const opcoes = PG.opcoesDeRolagem(f, {}, (x) => gravadas.push(x.uid));

  let c = combate();
  let r = R.resolverRolagem(rolAtaque("Ogro"), 19, c, f.nome, opcoes);
  assert.equal(r.dano, 4);                                    // crítico (2 dados de 1) + 2 de caçador de gigantes
  assert.match(r.descricao, /CRÍTICO!/);
  assert.equal(c.inimigos[0].pv, 56);
  assert.equal(f.pv, 11);                                     // sede de sangue
  assert.deepEqual(gravadas, ["u1"]);
  assert.deepEqual(r.avisos, ["Brakk recupera 1 PV (Sede de Sangue)."]);

  c = combate();
  r = R.resolverRolagem(rolAtaque("Rato"), 12, c, f.nome, opcoes);
  assert.equal(r.dano, 1);                                    // nem crítico, nem chefe
  assert.doesNotMatch(r.descricao, /CRÍTICO/);

  // sem o talento, 19 é um acerto comum (como sempre foi)
  const comum = R.resolverRolagem({ tipo: "ataque", rotulo: "Machado vs Rato", bonus: 5, cd: 10, dano: "1d1", alvo: "ini_1" }, 19, combate(), "Brakk");
  assert.equal(comum.dano, 1);
  // o ajuste de dano que já existia (elementos) continua valendo, e o bônus não fura imunidade
  const imune = PG.opcoesDeRolagem(f, { ajustarDano: () => ({ dano: 0, selo: "imune", nota: "é imune" }) });
  assert.equal(R.resolverRolagem(rolAtaque("Ogro"), 15, combate(), f.nome, imune).dano, 0);
});

test("turno dos inimigos: CA dos talentos, Último Suspiro uma vez por combate e Pele de Espinhos", () => {
  const f = R.normalizarFicha(base({ nivel: 6, pv: 3, ca: 14, talentos: ["couraca", "ultimo_suspiro", "pele_de_espinhos"] }), "u1");
  const c = { rodada: 1, vez: 0, ordem: [{ id: "ini_0", tipo: "ini", nome: "Lobo" }, { id: "u1", tipo: "pj", nome: "Brakk" }],
    inimigos: [{ id: "ini_0", nome: "Lobo", pv: 20, pvMax: 20, ca: 12, ataque: 5, dano: "1d1+9", des: 2 }] };
  const opcoes = PG.opcoesDeTurno(() => 3);
  // d20 = 10: 10+5 = 15 contra CA 14+1 = 15 → acerta por um triz; 10 de dano derrubaria
  let ocorrido = comSorte([dado(10)], () => R.passarVez(c, { u1: f }, null, opcoes));
  const linhas = ocorrido.map((o) => o.linha);
  assert.match(linhas[0], /^Lobo ataca Brakk: 10\+5 = 15 vs CA 15 \(talentos \+1\) → acertou, 10 de dano$/);   // sem "cai"
  assert.equal(linhas[1], "Brakk resiste por um fio e fica com 1 PV (Último Suspiro).");
  assert.equal(linhas[2], "Lobo se fere nos espinhos de Brakk e perde 3 PV.");
  assert.equal(f.pv, 1);
  assert.equal(c.inimigos[0].pv, 17);
  assert.equal(ocorrido[1].log.tipo, "sys");                  // nunca "narr": o app leria em voz alta
  // d20 = 9: 14 contra CA 15 → erra (sem a couraça teria acertado)
  c.vez = 0;
  ocorrido = comSorte([dado(9)], () => R.passarVez(c, { u1: f }, null, opcoes));
  assert.match(ocorrido[0].linha, /→ errou$/);
  // segundo golpe fatal no mesmo combate: o Último Suspiro já foi usado
  c.vez = 0;
  ocorrido = comSorte([dado(15)], () => R.passarVez(c, { u1: f }, null, opcoes));
  assert.match(ocorrido[0].linha, /— Brakk cai$/);
  assert.equal(f.pv, 0);
  // sem opções, o turno dos inimigos é o de sempre
  const g = R.normalizarFicha(base({ pv: 30, ca: 14 }), "u2");
  const c2 = { rodada: 1, vez: 0, ordem: [{ id: "ini_0", tipo: "ini", nome: "Lobo" }, { id: "u2", tipo: "pj", nome: "Brakk" }], inimigos: [{ id: "ini_0", nome: "Lobo", pv: 20, pvMax: 20, ca: 12, ataque: 5, dano: "1d1", des: 2 }] };
  assert.equal(comSorte([dado(10)], () => R.passarVez(c2, { u2: g }, null))[0].linha, "Lobo ataca Brakk: 10+5 = 15 vs CA 14 → acertou, 1 de dano");
});

test("iniciativa: Pés Ligeiros soma 2", () => {
  const rapido = R.normalizarFicha(base({ nivel: 2, talentos: ["pes_ligeiros"] }), "u1");
  const comum = R.normalizarFicha(base({ nome: "Lia" }), "u2");
  const c = comSorte([dado(10)], () => R.iniciarCombate({ u1: rapido, u2: comum }, [{ nome: "Rato", pv: 3, des: 4 }]));
  const ini = Object.fromEntries(c.ordem.map((o) => [o.id, o.ini]));
  assert.deepEqual([ini.u1, ini.u2, ini.ini_0], [13, 11, 14]);     // 10 + DES 1 + 2 do talento; 10 + 1; 10 + 4
});

test("redistribuir: mesma soma, de 8 a 20, grátis na primeira vez", () => {
  const f = R.normalizarFicha(base({ nivel: 3, atributos: { for: 16, des: 12, con: 14, int: 6, sab: 12, car: 10 } }), "u1");
  const ok = PG.conferirRedistribuicao(f, { for: 12, des: 16, con: 14, int: 6, sab: 12, car: 10 });
  assert.deepEqual(ok.atributos, { for: 12, des: 16, con: 14, int: 6, sab: 12, car: 10 });
  assert.match(PG.conferirRedistribuicao(f, { for: 17, des: 12, con: 14, int: 6, sab: 12, car: 10 }).erro, /soma/);
  assert.match(PG.conferirRedistribuicao(f, { for: 16, des: 12, con: 14, int: 6, sab: 12, car: 10 }).erro, /iguais/);
  assert.match(PG.conferirRedistribuicao(f, { for: 22, des: 12, con: 8, int: 6, sab: 12, car: 10 }).erro, /passar de 20/);
  assert.match(PG.conferirRedistribuicao(f, { for: 20, des: 12, con: 14, int: 6, sab: 12, car: 6 }).erro, /abaixo de 8/);
  assert.match(PG.conferirRedistribuicao(f, { for: 17, des: 12, con: 14, int: 5, sab: 12, car: 10 }).erro, /abaixo de 6/);   // já estava abaixo de 8: não desce mais
  assert.match(PG.conferirRedistribuicao(f, { for: 16.5, des: 12, con: 14, int: 6, sab: 12, car: 9.5 }).erro, /inteiros/);
  assert.match(PG.conferirRedistribuicao(f, [16, 12]).erro, /seis atributos/);
  assert.equal(PG.custoDeRedistribuir(f), 0);
  assert.equal(PG.custoDeRedistribuir({ ...f, redistribuicoes: 1 }), 125);
});

test("painel de progressão: lista no idioma pedido, vagas e próxima etapa", () => {
  const f = R.normalizarFicha(base({ nivel: 3, talentos: ["couraca"] }), "u1");
  const pt = PG.painel(f), en = PG.painel(f, "en");
  assert.deepEqual([pt.talentos.vagas, pt.talentos.total, pt.talentos.proximoNivel], [0, 1, 4]);
  assert.equal(pt.talentos.lista.find((t) => t.id === "couraca").tem, true);
  assert.equal(pt.talentos.lista.find((t) => t.id === "couraca").nome, "Couraça");
  assert.equal(en.talentos.lista.find((t) => t.id === "couraca").nome, "Thick Skin");
  assert.deepEqual(pt.subclasse.lista.map((s) => s.id), ["campeao", "guardiao"]);
  assert.equal(pt.subclasse.podeEscolher, true);
  assert.equal(pt.redistribuir.gratis, true);
});

test("votação: pedido conferido e apuração, com empate decidido na sorte", () => {
  const texto = (v, max) => String(v ?? "").trim().slice(0, max);
  assert.match(VT.conferirPedido({ opcoes: ["a", "b"] }, texto).erro, /pergunta/);
  assert.match(VT.conferirPedido({ pergunta: "Descemos?", opcoes: ["Sim", "sim", ""] }, texto).erro, /2 opções/);
  assert.deepEqual(VT.conferirPedido({ pergunta: " Descemos? ", opcoes: ["Sim", "Não", "Talvez", "Depois", "Nunca", { x: 1 }] }, texto),
    { pergunta: "Descemos?", opcoes: ["Sim", "Não", "Talvez", "Depois"] });
  const v = { opcoes: ["Sim", "Não"], votos: { a: 0, b: 0, c: 1, d: 7, e: "x" } };
  assert.deepEqual(VT.apurar(v), { contagem: [2, 1], vencedora: 0, empate: false, total: 3 });
  const empate = { opcoes: ["Sim", "Não"], votos: { a: 0, b: 1 } };
  assert.equal(VT.apurar(empate, () => 0.99).vencedora, 1);
  assert.equal(VT.apurar(empate, () => 0).empate, true);
  assert.equal(VT.publica(null, 0), null);
  assert.equal(VT.publica({ id: "x", pergunta: "?", opcoes: ["a", "b"], votos: {}, ate: 1500 }, 1000).restante, 500);
});

test("minigames: só Prestidigitação e Investigação, bônus de −1 a +2", () => {
  assert.equal(MG.tipoDaRolagem({ tipo: "teste", rotulo: "Prestidigitação" }), "fechadura");
  assert.equal(MG.tipoDaRolagem({ tipo: "teste", rotulo: "Investigação (chuva −2)" }), "runas");
  assert.equal(MG.tipoDaRolagem({ tipo: "teste", rotulo: "Atletismo" }), null);
  assert.equal(MG.tipoDaRolagem({ tipo: "ataque", rotulo: "Prestidigitação vs Rato" }), null);
  assert.deepEqual(MG.aoMontarRolagem({ tipo: "teste", rotulo: "Investigação" }).minigame, { tipo: "runas", alvo: 5 });
  assert.equal("minigame" in MG.aoMontarRolagem({ tipo: "teste", rotulo: "Furtividade" }), false);
  assert.deepEqual([0, 1, 2, 3, 9].map((n) => MG.ajusteDoResultado(n, 3)), [-1, 0, 1, 2, 2]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => MG.ajusteDoResultado(n, 5)), [-1, -1, 0, 1, 1, 2]);
  process.env.MINIGAMES = "0";
  try { assert.equal("minigame" in MG.aoMontarRolagem({ tipo: "teste", rotulo: "Investigação" }), false); } finally { delete process.env.MINIGAMES; }
});

test("projeção: id do QR, digitado ou lido, e o QR em SVG", () => {
  assert.equal(PJ.idValido("MESAVIVA-TV:ABC234"), "ABC234");
  assert.equal(PJ.idValido(" abc234 "), "ABC234");
  for (const ruim of ["ABC23", "ABC2345", "ABC23O", "ABC231", "", null, "mesaviva:ABC23"]) assert.equal(PJ.idValido(ruim), null, String(ruim));
  assert.equal(PJ.conteudoDoQr("ABC234"), "MESAVIVA-TV:ABC234");
  const svg = PJ.svgDoQr(PJ.conteudoDoQr("ABC234"));
  assert.match(svg, /^<svg [^>]*viewBox="0 0 (\d+) \1"/);
  assert.ok(svg.includes("<path d=\"M"));
  // a ficha e o combate que a tela recebe não levam nada além do que todos veem
  const f = PJ.fichaPublica(R.normalizarFicha(base({ anotacoes: "segredo meu", conceito: "história longa" }), "u1"), true);
  assert.deepEqual(Object.keys(f).sort(), ["ca", "classe", "imagem", "mana", "manaMax", "nivel", "nome", "online", "pv", "pvMax", "raca", "status", "uid"]);
  const c = PJ.combatePublico({ id: "x", rodada: 2, vez: 1, ordem: [{ id: "u1", tipo: "pj", nome: "Brakk", ini: 12 }], suspiro: { u1: true }, statusVez: "2:1",
    inimigos: [{ id: "ini_0", nome: "Lobo", pv: 3, pvMax: 9, ca: 12, ataque: 5, dano: "1d6", des: 2 }], posicoes: { u1: { x: 1, y: 2 } }, mapa: { colunas: 10, linhas: 14, terreno: [] } });
  assert.equal("suspiro" in c, false);
  assert.equal("ataque" in c.inimigos[0], false);
  assert.equal(PJ.combatePublico(null), null);
});
