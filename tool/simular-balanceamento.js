#!/usr/bin/env node
/**
 * Simulação de balanceamento do Mesa Viva.
 *
 * Usa as funções reais de regras.js (iniciarCombate, montarRolagem, resolverRolagem, passarVez,
 * efeitos, gerarSaque...) para jogar milhares de combates sem IA e imprimir, para cada nível (1 a 10)
 * e tamanho de grupo (1 a 4 jogadores): taxa de vitória, rodadas médias, PV restante e personagens caídos.
 *
 * Uso:
 *   node tool/simular-balanceamento.js                 (todos os cenários, 1500 combates por célula)
 *   node tool/simular-balanceamento.js --n 4000 --seed 7
 *   node tool/simular-balanceamento.js --cenario tabela   (tabela | ia | expedicao | sequencia | todos)
 *   node tool/simular-balanceamento.js --ca antiga        (CA de criação antiga: 10 + DES + 2/1)
 *   node tool/simular-balanceamento.js --itens nenhum     (sem o saque acumulado)
 *
 * Metas: combate comum vencido em 85–95% das vezes, em 3–5 rodadas;
 *        chefe em 60–75%, em 5–8 rodadas; personagem caído possível, mas raro.
 */
"use strict";

const R = require("../regras");
const { criarCampanha } = require("../campanha");

// campanha.inimigosDaSala não usa o banco: um banco falso basta.
const campanha = criarCampanha({ exec() {}, prepare() { throw new Error("a simulação não usa banco"); } });

// ── Argumentos ──
const args = process.argv.slice(2);
const arg = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 && args[i + 1] ? args[i + 1] : padrao; };
const N_COMBATES = Math.max(50, Number(arg("n", 1500)));
const SEED = Number(arg("seed", 20261110));
const CENARIO = arg("cenario", "todos");
const CA_MODO = arg("ca", "nova");
const ITENS_MODO = arg("itens", "saque");
const NIVEIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GRUPOS = [1, 2, 3, 4];

/** Gerador pseudoaleatório com semente (mulberry32), para resultados repetíveis. */
function criarRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Personagens modelo (o que a IA cria seguindo o prompt de criação) ──
const MODELOS = {
  Guerreiro: {
    atributos: { for: 16, des: 12, con: 14, int: 10, sab: 10, car: 10 }, principal: "for",
    caNova: 16, caAntiga: 13,
    ataques: [{ nome: "Espada longa", bonus: 5, dano: "1d8+3", elemento: "fisico" }],
    subclasses: ["campeao", "guardiao"],
    talentos: ["couraca", "ultimo_suspiro", "olhar_atento", "cacador_de_gigantes", "sede_de_sangue"],
  },
  Clérigo: {
    atributos: { for: 12, des: 10, con: 14, int: 10, sab: 16, car: 10 }, principal: "sab",
    caNova: 15, caAntiga: 11,
    ataques: [{ nome: "Luz Sagrada", bonus: 5, dano: "1d6+3", elemento: "sagrado" }],
    subclasses: ["vida", "guerra"],
    talentos: ["couraca", "sede_de_sangue", "ultimo_suspiro", "pes_ligeiros", "olhar_atento"],
  },
  Ladino: {
    atributos: { for: 10, des: 16, con: 12, int: 12, sab: 12, car: 10 }, principal: "des",
    caNova: 14, caAntiga: 13,
    ataques: [{ nome: "Rapieira", bonus: 5, dano: "1d6+3", elemento: "fisico" }],
    subclasses: ["assassino", "trapaceiro"],
    talentos: ["olhar_atento", "sede_de_sangue", "pes_ligeiros", "ultimo_suspiro", "couraca"],
  },
  Mago: {
    atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, principal: "int",
    caNova: 12, caAntiga: 12,
    ataques: [{ nome: "Raio Arcano", bonus: 5, dano: "1d10", elemento: "raio" }],
    subclasses: ["evocador", "abjurador"],
    talentos: ["couraca", "ultimo_suspiro", "pes_ligeiros", "olhar_atento", "sede_de_sangue"],
  },
};
const ORDEM_CLASSES = ["Guerreiro", "Clérigo", "Ladino", "Mago"];

/** Quantos combates (e chefes) o grupo costuma ter vencido ao chegar a cada nível. */
function combatesAteNivel(nivel) {
  const comuns = 2 * (nivel - 1);
  const chefes = Math.floor((nivel - 1) / 2);
  return { comuns, chefes };
}

/** Pontuação de combate de uma ficha (ataque + CA vindos de itens, talentos e subclasse). */
function pontuacao(f) {
  const e = R.efeitos(f);
  return e.ataque + e.ca;
}

/** Escolhe 1 entre 3 do saque como um jogador faria: o que mais melhora ataque ou CA. */
function escolherDoSaque(f, opcoes) {
  const base = pontuacao(f);
  let melhor = null, ganhoMelhor = -1;
  for (const it of opcoes) {
    if (it.tipo === "consumivel") continue;
    let itens = [...(f.itens || []), it];
    if (itens.length > 8) {
      // Dispensa o item que menos faz falta.
      let pior = 0, menorPerda = Infinity;
      for (let i = 0; i < itens.length - 1; i++) {
        const sem = itens.filter((_, j) => j !== i);
        const perda = pontuacao({ ...f, itens: itens }) - pontuacao({ ...f, itens: sem });
        if (perda < menorPerda) { menorPerda = perda; pior = i; }
      }
      itens = itens.filter((_, j) => j !== pior);
    }
    const ganho = pontuacao({ ...f, itens }) - base + R.RARIDADES.indexOf(it.raridade) * 0.01;
    if (ganho > ganhoMelhor) { ganhoMelhor = ganho; melhor = itens; }
  }
  if (melhor) f.itens = melhor;
}

function criarPersonagem(classe, nivel, uid, rng) {
  const m = MODELOS[classe];
  const atributos = { ...m.atributos };
  const ganhos = Math.floor(nivel / 4);
  atributos[m.principal] = Math.min(20, atributos[m.principal] + ganhos);
  const nTalentos = Math.floor(nivel / 2);
  const f = R.normalizarFicha({
    nome: `${classe} ${uid}`, classe, nivel, atributos, atributosGanhos: ganhos,
    ca: CA_MODO === "antiga" ? m.caAntiga : m.caNova,
    ataques: m.ataques,
    subclasse: nivel >= 3 ? m.subclasses[Math.floor(rng() * 2)] : "",
    talentos: m.talentos.slice(0, nTalentos),
  }, uid);
  if (ITENS_MODO !== "nenhum") {
    const { comuns, chefes } = combatesAteNivel(nivel);
    for (let i = 0; i < comuns; i++) escolherDoSaque(f, R.gerarSaque(0, rng));
    for (let i = 0; i < chefes; i++) escolherDoSaque(f, R.gerarSaque(3, rng));
  }
  return f;
}

function criarGrupo(nivel, tamanho, rng) {
  const fichas = {};
  for (let i = 0; i < tamanho; i++) {
    const classe = ORDEM_CLASSES[i % ORDEM_CLASSES.length];
    const uid = `pj${i + 1}`;
    fichas[uid] = criarPersonagem(classe, nivel, uid, rng);
  }
  return fichas;
}

// ── Encontros ──
const GOBLIN = { nome: "Goblin", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2 };
const GARRA_TORTA = { nome: "Garra-Torta", pv: 18, ca: 15, ataque: 5, dano: "1d8+3", des: 1, chefe: true };

/** Como a IA monta os combates hoje (exemplos fixos do prompt, sem escalar por nível nem grupo). */
function encontroIA(tipo) {
  if (tipo === "chefe") return [{ ...GARRA_TORTA }, { ...GOBLIN, nome: "Goblin 1" }, { ...GOBLIN, nome: "Goblin 2" }];
  return [1, 2, 3].map((i) => ({ ...GOBLIN, nome: `Goblin ${i}` }));
}

/** Expedições (masmorra): sala de monstros no andar 2 e chefe no andar 5. */
function encontroExpedicao(tipo, fichas, rng) {
  const exp = { modo: "masmorra", andar: tipo === "chefe" ? 5 : 2, sala: tipo === "chefe" ? "chefe" : "monstro" };
  return campanha.inimigosDaSala(exp, Object.values(fichas), rng);
}

function encontroTabela(tipo, nivel, tamanho) {
  if (typeof R.encontroReferencia !== "function") return null;
  return R.encontroReferencia(nivel, tamanho, tipo);
}

// ── Um combate ──
function jogarCombate(fichas, inimigosDados, rng) {
  const c = R.iniciarCombate(fichas, inimigosDados, rng);
  R.passarVez(c, fichas, null, rng); // inimigos que ganharam a iniciativa agem
  let seguranca = 0;
  while (!R.combateAcabou(c, fichas) && c.rodada <= 30 && seguranca++ < 2000) {
    const atual = R.vezAtual(c);
    const f = fichas[atual.id];
    if (!f || atual.tipo !== "pj") { R.passarVez(c, fichas, null, rng); continue; }
    // O grupo concentra os ataques no inimigo mais ferido.
    const alvos = c.inimigos.filter(R.inimigoAtivo).sort((a, b) => a.pv - b.pv);
    const rol = R.montarRolagem(f, { tipo: "ataque", ataque: f.ataques[0].nome, alvo: alvos[0].id }, c, "sim", null);
    const natural = R.d(20, rng);
    R.resolverRolagem(rol, natural, c, f, { rng });
    R.passarVez(c, fichas, f.uid, rng);
  }
  const lista = Object.values(fichas);
  const pv = lista.reduce((s, f) => s + Math.max(0, f.pv), 0);
  const pvMax = lista.reduce((s, f) => s + f.pvMax, 0);
  return {
    vitoria: R.resultadoCombate(c, fichas) === "vitoria",
    rodadas: c.rodada,
    pvFrac: pv / pvMax,
    caidos: lista.filter((f) => f.pv <= 0).length,
  };
}

function simularCelula(cenario, tipo, nivel, tamanho, rngBase) {
  let vit = 0, rod = 0, pv = 0, caidos = 0, algumCaido = 0;
  for (let i = 0; i < N_COMBATES; i++) {
    const rng = criarRng(Math.floor(rngBase() * 2 ** 32));
    if (cenario === "sequencia") {
      // Dia de aventura: 2 combates comuns e o chefe, sem descanso entre eles.
      const fichas = criarGrupo(nivel, tamanho, rng);
      let ok = true, r;
      for (const t of ["comum", "comum", "chefe"]) {
        for (const f of Object.values(fichas)) f.status = [];
        r = jogarCombate(fichas, encontroTabela(t, nivel, tamanho) || encontroIA(t), rng);
        if (!r.vitoria) { ok = false; break; }
        // Quem caiu levanta com 1 PV (a IA costuma curar no fim da cena).
        for (const f of Object.values(fichas)) if (f.pv <= 0) f.pv = 1;
      }
      if (ok) vit++;
      rod += r.rodadas; pv += r.pvFrac; caidos += r.caidos; if (r.caidos) algumCaido++;
      continue;
    }
    const fichas = criarGrupo(nivel, tamanho, rng);
    const inimigos = cenario === "ia" ? encontroIA(tipo)
      : cenario === "expedicao" ? encontroExpedicao(tipo, fichas, rng)
      : encontroTabela(tipo, nivel, tamanho);
    if (!inimigos) return null;
    const r = jogarCombate(fichas, inimigos, rng);
    if (r.vitoria) vit++;
    rod += r.rodadas; pv += r.pvFrac; caidos += r.caidos; if (r.caidos) algumCaido++;
  }
  return { vit: vit / N_COMBATES, rod: rod / N_COMBATES, pv: pv / N_COMBATES, caidos: caidos / N_COMBATES, algumCaido: algumCaido / N_COMBATES };
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
// Meta do pedido original e meta adotada (ver design/GAME-DESIGN.md, seção 4: no Mesa Viva
// a derrota derruba o grupo inteiro e o PV não volta sozinho entre cenas, então a tensão
// deve vir de "alguém caiu", e não de perder a luta).
const METAS = {
  pedido: {
    comum: { vit: [0.85, 0.95], rod: [3, 5], cai: [0, 1] },
    chefe: { vit: [0.6, 0.75], rod: [5, 8], cai: [0, 1] },
    sequencia: { vit: [0.6, 0.85], rod: [4, 9], cai: [0, 1] },
  },
  adotada: {
    comum: { vit: [0.9, 1], rod: [3, 5], cai: [0, 0.25] },
    chefe: { vit: [0.75, 1], rod: [5, 8], cai: [0.2, 0.6] },
    sequencia: { vit: [0.7, 0.95], rod: [4, 9], cai: [0, 1] },
  },
};
const dentroDa = (m, r) => r.vit >= m.vit[0] - 0.001 && r.vit <= m.vit[1] + 0.001 && r.rod >= m.rod[0] && r.rod <= m.rod[1] && r.algumCaido >= m.cai[0] - 0.001 && r.algumCaido <= m.cai[1] + 0.001;

function imprimirCenario(cenario, tipo) {
  const titulo = {
    ia: "Encontros fixos dos exemplos do prompt (como a IA monta hoje)",
    expedicao: "Expedição (campanha.inimigosDaSala): andar 2 e chefe do andar 5",
    tabela: "Tabela de referência (regras.encontroReferencia)",
    sequencia: "Sequência sem descanso: comum, comum e chefe (tabela)",
  }[cenario];
  console.log(`\n### ${titulo} — ${cenario === "sequencia" ? "dia de aventura" : tipo}`);
  console.log("Célula: vitória | rodadas | PV restante do grupo | chance de alguém cair");
  console.log(`| Nível | ${GRUPOS.map((g) => `${g} jogador${g > 1 ? "es" : ""}`).join(" | ")} |`);
  console.log(`|---|${GRUPOS.map(() => "---").join("|")}|`);
  const rngBase = criarRng(SEED + cenario.length * 97 + (tipo === "chefe" ? 13 : 0));
  let dentroPedido = 0, dentroAdotada = 0, total = 0;
  const chave = cenario === "sequencia" ? "sequencia" : tipo;
  const mp = METAS.pedido[chave], ma = METAS.adotada[chave];
  for (const nivel of NIVEIS) {
    const cels = [];
    for (const g of GRUPOS) {
      const r = simularCelula(cenario, tipo, nivel, g, rngBase);
      if (!r) { console.log("(regras.js ainda não tem encontroReferencia)"); return; }
      total++;
      if (dentroDa(mp, r)) dentroPedido++;
      const ok = dentroDa(ma, r);
      if (ok) dentroAdotada++;
      cels.push(`${pct(r.vit)} ${r.rod.toFixed(1)}r ${pct(r.pv)} ${pct(r.algumCaido)}${ok ? " ✓" : ""}`);
    }
    console.log(`| ${nivel} | ${cels.join(" | ")} |`);
  }
  const txt = (m) => `vitória ${m.vit.map((x) => `${Math.round(x * 100)}%`).join("–")}, ${m.rod.join("–")} rodadas${m.cai[1] < 1 ? `, alguém cai ${m.cai.map((x) => `${Math.round(x * 100)}%`).join("–")}` : ""}`;
  console.log(`Meta do pedido (${txt(mp)}): ${dentroPedido} de ${total} células.`);
  console.log(`Meta adotada, marcada com ✓ (${txt(ma)}): ${dentroAdotada} de ${total} células.`);
}

function imprimirSaque() {
  console.log("\n### Raridade do saque (cada opção do 1 entre 3; a 3ª opção tem +1 de sorte)");
  console.log("| Sorte | Comum | Incomum | Raro | Épico | Lendário |");
  console.log("|---|---|---|---|---|---|");
  const rng = criarRng(SEED + 5);
  for (const sorte of [0, 1, 3, 5, 8]) {
    const cont = Object.fromEntries(R.RARIDADES.map((r) => [r, 0]));
    const n = 20000;
    for (let i = 0; i < n; i++) cont[R.gerarItem(sorte, rng).raridade]++;
    console.log(`| ${sorte} | ${R.RARIDADES.map((r) => pct(cont[r] / n).trim()).join(" | ")} |`);
  }
}

function imprimirProgressao() {
  // Ritmo estimado de uma mesa de 4 no modo normal (ver design/GAME-DESIGN.md):
  // por hora, ~35 ações narradas, ~2 combates de ~3 inimigos, ~2 capítulos; epílogo a cada ~2,5 h de aventura.
  const X = R.XP;
  const porHoraAventura = 35 * X.narracao + 2 * Math.max(X.vitoriaMinima, 3 * X.porInimigo) + 2 * X.capitulo + X.epilogo / 2.5;
  // Depois da aventura: expedições (~4 salas/h, 2 a 3 combates, retorno com andar × 10).
  const porHoraExpedicao = 25 * X.narracao + 2.5 * Math.max(X.vitoriaMinima, 3 * X.porInimigo) + 0.5 * 40 + 4 * 10;
  console.log(`\n### Progressão (XP por hora estimado: aventura ${Math.round(porHoraAventura)}, expedições ${Math.round(porHoraExpedicao)})`);
  console.log("| Nível | XP para o próximo | XP acumulado | Horas de jogo (estimativa) |");
  console.log("|---|---|---|---|");
  let acumulado = 0;
  const xpAventura = 5 * X.capitulo + X.epilogo + 2.5 * 35 * X.narracao + 5 * Math.max(X.vitoriaMinima, 3 * X.porInimigo) + 40;
  for (let n = 1; n <= 10; n++) {
    // Horas até chegar ao nível n: a aventura principal (~2,5 h) primeiro, expedições depois.
    let horas;
    if (acumulado <= xpAventura) horas = acumulado / porHoraAventura;
    else horas = xpAventura / porHoraAventura + (acumulado - xpAventura) / porHoraExpedicao;
    console.log(`| ${n} | ${n < 10 ? R.xpParaProximo(n) : "-"} | ${acumulado} | ${horas.toFixed(1)} h |`);
    acumulado += R.xpParaProximo(n);
  }
  console.log(`XP da aventura principal inteira (5 capítulos + epílogo), por personagem: ~${Math.round(xpAventura)}.`);
}

const inicio = Date.now();
console.log(`# Simulação de balanceamento — ${N_COMBATES} combates por célula, semente ${SEED}, CA ${CA_MODO}, itens: ${ITENS_MODO}`);
const cenarios = CENARIO === "todos" ? ["ia", "expedicao", "tabela", "sequencia"] : [CENARIO];
for (const c of cenarios) {
  if (c === "sequencia") imprimirCenario(c, "comum");
  else for (const t of ["comum", "chefe"]) imprimirCenario(c, t);
}
imprimirSaque();
imprimirProgressao();
console.log(`\n(${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
