/**
 * Motor de regras do Mesa Viva — d20 simplificado, inspirado no SRD 5.1 (CC-BY-4.0).
 * Portado de TypeScript para JavaScript.
 */
"use strict";

const C = require("./catalogo");
const MP = require("./mapa");

const ATRIBUTOS = ["for", "des", "con", "int", "sab", "car"];
const NOME_ATRIBUTO = { for: "Força", des: "Destreza", con: "Constituição", int: "Inteligência", sab: "Sabedoria", car: "Carisma" };
const PERICIAS = {
  Acrobacia: "des", "Adestrar Animais": "sab", Arcanismo: "int", Atletismo: "for", Atuação: "car",
  Enganação: "car", Furtividade: "des", História: "int", Intimidação: "car", Intuição: "sab",
  Investigação: "int", Medicina: "sab", Natureza: "int", Percepção: "sab", Persuasão: "car",
  Prestidigitação: "des", Religião: "int", Sobrevivência: "sab",
};
const RACAS = ["Humano", "Anão", "Elfo", "Halfling", "Meio-orc"];
const CLASSES = ["Guerreiro", "Ladino", "Mago", "Clérigo"];
const SEXOS = ["Masculino", "Feminino", "Outro"];
const DADO_DE_VIDA = { Guerreiro: 10, Clérigo: 8, Ladino: 8, Mago: 6 };

const PADRAO_ATAQUES = {
  Guerreiro: [
    { nome: "Espada longa", bonus: 3, dano: "1d8+2" },
    { nome: "Golpe de escudo", bonus: 2, dano: "1d6+1" },
  ],
  Ladino: [
    { nome: "Adaga", bonus: 3, dano: "1d6" },
    { nome: "Arco curto", bonus: 2, dano: "1d6+1" },
  ],
  Mago: [
    { nome: "Cajado", bonus: 1, dano: "1d4" },
    { nome: "Centelha Arcana", bonus: 3, dano: "1d6" },
  ],
  Clérigo: [
    { nome: "Martelo", bonus: 2, dano: "1d6+1" },
    { nome: "Luz Sagrada", bonus: 3, dano: "1d6" },
  ],
};
const MAX_ATAQUES = 16;

/**
 * Ataques da ficha, sempre com "alcance" (corpo|distancia): o campo, se válido; senão a regra das palavras do nome.
 * Técnicas do catálogo são recalculadas pelo nível e atributos (bônus = proficiência + mod + extra; dano + mod).
 */
function _ataquesPorClasse(classe, fornecidos, at, prof) {
  const vistos = new Set();
  const validos = [];
  for (const a of fornecidos) {
    if (!a || typeof a !== "object") continue;
    const nome = safeStr(a.nome, "", 30).trim();
    if (!nome || vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    const tec = C.tecnicaDoCatalogo(nome);
    if (tec) { validos.push(ataqueDaTecnica(tec, at, prof)); continue; }
    validos.push({ nome, bonus: Math.max(-5, Math.min(15, Number(a.bonus) || 0)), dano: safeStr(a.dano || "1d4", "1d4", 30) || "1d4", alcance: MP.alcanceDoAtaque(a) });
  }
  const lista = validos.length ? validos : (PADRAO_ATAQUES[classe] || PADRAO_ATAQUES.Guerreiro).map((a) => ({ ...a, alcance: MP.alcanceDoAtaque(a) }));
  return lista.slice(0, MAX_ATAQUES);
}

/** Técnica do catálogo como ataque da ficha. */
function ataqueDaTecnica(t, at, prof) {
  const m = mod(at?.[t.atributo]);
  return { nome: t.nome, bonus: Math.max(-5, Math.min(25, prof + m + (t.bonusExtra || 0))), dano: m ? `${t.dano}${sinal(m)}` : t.dano, alcance: t.alcance };
}

function safeStr(v, def, max) {
  let s = String(v ?? def);
  // Remove control chars
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uFFFE\uFFFF\uFFFD]/g, "");
  // Remove lone surrogates (high without low, low without high)
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");
  // Truncate preserving surrogate pairs
  if (s.length > max) {
    s = s.substring(0, max);
    const last = s.charCodeAt(max - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.substring(0, max - 1);
  }
  return s;
}

function mod(valor) {
  const n = Number(valor ?? 10);
  return Math.floor((n - 10) / 2);
}

/** Número com sinal: 3 -> "+3", -1 -> "-1". */
function sinal(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

/** Compara nomes sem diferenciar maiúsculas, acentos e espaços extras. */
function chave(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const d = (faces, rng = Math.random) => 1 + Math.floor(rng() * faces);

/**
 * Rola expressão como "2d6+3" ou "1d8-1". Em crítico, dobra dados (não bônus).
 */
function rolar(expr, critico = false, rng = Math.random) {
  const s = String(expr || "1d4").replace(/\s/g, "").toLowerCase();
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  let total = 0;
  const dados = [];
  let m;
  while ((m = re.exec(s))) {
    if (m[3]) {
      const qtd = Math.min(40, Number(m[2] || 1) * (critico ? 2 : 1));
      const faces = Math.max(1, Math.min(100, Number(m[3])));
      const sg = m[1] === "-" ? -1 : 1;
      for (let i = 0; i < qtd; i++) { const r = d(faces, rng); dados.push(r); total += sg * r; }
    } else if (m[5]) {
      total += (m[4] === "-" ? -1 : 1) * Number(m[5]);
    }
  }
  return { total: Math.max(0, total), dados };
}

function bonusPericia(f, pericia) {
  const atr = PERICIAS[pericia] ?? "sab";
  const treinada = (f.pericias || []).some((p) => p.toLowerCase() === pericia.toLowerCase());
  return mod(f.atributos?.[atr]) + (treinada ? f.proficiencia || 2 : 0);
}

// ── Magias, mana, inventário e evolução ──
const CONJURADORES = { Mago: "int", Clérigo: "sab" };     // classe que conjura → atributo da magia
const NIVEIS_PONTOS = [4, 8, 12, 16, 19];                    // +2 pontos de atributo
const NIVEIS_TECNICA = [2, 3, 5, 7, 9, 11, 13, 15, 17, 19];  // Guerreiro e Ladino: +1 técnica
const MAGIAS_POR_NIVEL = { Mago: 2, Clérigo: 1 };
const MAGIAS_INICIAIS = { Mago: 3, Clérigo: 2 };
const NIVEL_MAXIMO = 20;
const MAX_SOMA_ATRIBUTOS = 72;                               // na criação; cada nível de pontos soma +2
const TIPOS_ITEM = ["pocao", "rapido", "equipamento", "municao", "outro"];
const TIPOS_RAPIDOS = ["pocao", "rapido"];
const RARIDADES_ITEM = ["comum", "incomum", "raro", "epico", "lendario"];
const OURO_INICIAL = 15;
const MAX_ITENS = 30;
const MAX_QTD = 99;
const MAX_MAGIAS = 40;
const POCAO_DE_CURA = { nome: "Poção de cura", qtd: 2, tipo: "pocao", efeito: "cura 2d4+2", descricao: "Um frasco que fecha ferimentos." };

const circuloMaximo = (nivel) => Math.min(5, Math.ceil(Math.max(1, nivel) / 2));
const pontosGanhos = (nivel) => 2 * NIVEIS_PONTOS.filter((n) => n <= nivel).length;
const ehConjurador = (classe) => !!CONJURADORES[classe];
function manaMaxima(classe, nivel, at) {
  const atr = CONJURADORES[classe];
  return atr ? Math.max(2, 2 + 2 * nivel + mod(at?.[atr])) : 0;
}
/** Bônus de ataque mágico = proficiência + mod(atributo da classe). */
function bonusMagia(f) { return (f.proficiencia || 2) + mod(f.atributos?.[CONJURADORES[f.classe] || "int"]); }

/**
 * Efeito de item que o servidor aplica: "cura NdM+K" (N 1–10, M 4/6/8/10/12, K 0–20). Devolve o texto limpo,
 * "" para vazio, ou null se for inválido.
 */
function efeitoDeItem(v) {
  const s = String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return "";
  // "mana N" (1 a 30): devolve energia de conjurar
  const mm = s.match(/^mana (\d{1,2})$/);
  if (mm) return Number(mm[1]) >= 1 && Number(mm[1]) <= 30 ? `mana ${Number(mm[1])}` : null;
  const m = s.match(/^cura (\d{1,2})d(\d{1,2})(?: ?\+ ?(\d{1,2}))?$/);
  if (!m) return null;
  const n = Number(m[1]), faces = Number(m[2]), k = Number(m[3] || 0);
  if (n < 1 || n > 10 || ![4, 6, 8, 10, 12].includes(faces) || k > 20) return null;
  return `cura ${n}d${faces}${k ? `+${k}` : ""}`;
}

/** Item guardado na ficha (leitura tolerante: tipo inválido vira "outro", efeito inválido some). null se não tem nome. */
function normalizarItem(it) {
  if (!it || typeof it !== "object") return null;
  const nome = safeStr(it.nome, "", 40).trim();
  if (!nome) return null;
  const qtd = Math.max(1, Math.min(MAX_QTD, Math.floor(Number(it.qtd)) || 1));
  const tipo = TIPOS_ITEM.includes(it.tipo) ? it.tipo : "outro";
  const efeito = TIPOS_RAPIDOS.includes(tipo) ? efeitoDeItem(it.efeito) || "" : "";   // só poção e item rápido têm efeito
  // raridade (itens do saque e da loja): só entra quando existe, para os itens antigos ficarem como eram
  const raridade = RARIDADES_ITEM.includes(it.raridade) ? it.raridade : null;
  return { nome, qtd, tipo, efeito, descricao: safeStr(it.descricao, "", 200), ...(raridade ? { raridade } : {}) };
}

/** Junta itens de mesmo nome (soma as quantidades) e limita a 30. */
function juntarItens(lista) {
  const saida = [];
  for (const bruto of lista) {
    const it = normalizarItem(bruto);
    if (!it) continue;
    const igual = saida.find((x) => chave(x.nome) === chave(it.nome));
    if (igual) igual.qtd = Math.min(MAX_QTD, igual.qtd + it.qtd);
    else if (saida.length < MAX_ITENS) saida.push(it);
  }
  return saida;
}

/** Inventário: o da ficha; ficha antiga (sem inventário) converte o equipamento e ganha 2 Poções de cura, uma vez. */
function inventarioDe(v) {
  if (Array.isArray(v.inventario)) return juntarItens(v.inventario);
  const equip = (Array.isArray(v.equipamento) ? v.equipamento : []).map((s) => ({ nome: safeStr(s, "", 40), qtd: 1, tipo: "equipamento" }));
  return juntarItens([...equip, { ...POCAO_DE_CURA }]);
}

/** Lista de textos para os apps antigos, derivada do inventário. */
const equipamentoDerivado = (inv) => inv.map((i) => (i.qtd > 1 ? `${i.nome} (×${i.qtd})` : i.nome)).slice(0, MAX_ITENS);

/** Magia guardada: as do catálogo valem pelo catálogo; as desconhecidas (fichas antigas) viram utilidade de 1º círculo. */
function normalizarMagia(m, nivel) {
  if (!m || typeof m !== "object") return null;
  const nome = safeStr(m.nome, "", 30).trim();
  if (!nome) return null;
  const desc = safeStr(m.descricao, "", 300);
  const cat = C.magiaDoCatalogo(nome);
  if (cat) return C.magiaParaFicha(cat, nivel, desc);
  return { nome, circulo: 1, tipo: "utilidade", efeito: "", alcance: "pessoal", custo: C.custoDe(1), descricao: desc };
}

/** Quantas pendências guardadas (aceita o formato público, com "quantas"). */
const qtdPendencia = (p) => Math.max(0, Math.floor(Number(typeof p === "object" && p ? p.quantas : p)) || 0);

/** Opções de evolução para a ficha: magias da classe até o círculo do nível e técnicas até o nível, sem as já conhecidas. */
function opcoesDeMagia(f) {
  const conhecidas = new Set((f.magias || []).map((m) => chave(m.nome)));
  return C.magiasDaClasse(f.classe, circuloMaximo(f.nivel)).filter((m) => !conhecidas.has(chave(m.nome))).map((m) => C.magiaParaFicha(m, f.nivel));
}
function opcoesDeAtaque(f) {
  const conhecidos = new Set((f.ataques || []).map((a) => chave(a.nome)));
  return C.tecnicasDaClasse(f.classe, f.nivel).filter((t) => !conhecidos.has(chave(t.nome)))
    .map((t) => ({ ...ataqueDaTecnica(t, f.atributos, f.proficiencia), nivelMinimo: t.nivelMinimo, descricao: t.descricao }));
}

/** Pendências públicas (null quando não há): pontos e as opções prontas de magias e técnicas. */
function pendenciasDe(guardadas, f) {
  const p = guardadas && typeof guardadas === "object" ? guardadas : {};
  const saida = {};
  const folga = ATRIBUTOS.reduce((s, a) => s + (20 - f.atributos[a]), 0);
  const pontos = Math.min(qtdPendencia(p.pontos), folga);
  if (pontos > 0) saida.pontos = pontos;
  const om = opcoesDeMagia(f), qm = Math.min(qtdPendencia(p.magias), om.length);
  if (qm > 0) saida.magias = { quantas: qm, opcoes: om };
  const oa = opcoesDeAtaque(f), qa = Math.min(qtdPendencia(p.ataques), oa.length);
  if (qa > 0) saida.ataques = { quantas: qa, opcoes: oa };
  return Object.keys(saida).length ? saida : null;
}

/** O que um personagem ganha ao chegar no nível `nivel`: { pontos, magias, ataques }. */
function ganhosDoNivel(classe, nivel) {
  return {
    pontos: NIVEIS_PONTOS.includes(nivel) ? 2 : 0,
    magias: MAGIAS_POR_NIVEL[classe] || 0,
    ataques: (classe === "Guerreiro" || classe === "Ladino") && NIVEIS_TECNICA.includes(nivel) ? 1 : 0,
  };
}
/** Soma os ganhos do nível às pendências guardadas (formato interno: só as quantidades). */
function somarPendencias(guardadas, ganhos) {
  const p = guardadas && typeof guardadas === "object" ? guardadas : {};
  return {
    pontos: qtdPendencia(p.pontos) + ganhos.pontos,
    magias: qtdPendencia(p.magias) + ganhos.magias,
    ataques: qtdPendencia(p.ataques) + ganhos.ataques,
  };
}

/**
 * Gera ficha a partir do JSON da IA + conceito. Também converte fichas antigas na leitura (sem gravar nada):
 * equipamento → inventário (+2 Poções de cura), magias {nome, descricao} → formato do catálogo, mana e alcance dos ataques.
 */
function normalizarFicha(dados, uid, conceito) {
  const v = dados || {};
  const lvl = Math.max(1, Math.min(NIVEL_MAXIMO, Math.floor(Number(v.nivel)) || 1));
  const at = {};
  for (const a of ATRIBUTOS) at[a] = Math.max(3, Math.min(20, Number(v.atributos?.[a]) || 10));
  // Soma máxima: 72 na criação, mais os pontos ganhos por nível — reduz aos poucos a partir dos maiores atributos
  const MAX_SOMA = MAX_SOMA_ATRIBUTOS + pontosGanhos(lvl);
  let soma = ATRIBUTOS.reduce((s, a) => s + at[a], 0);
  if (soma > MAX_SOMA) {
    let excedente = soma - MAX_SOMA;
    while (excedente > 0) {
      const ordem = [...ATRIBUTOS].sort((a, b) => at[b] - at[a]);
      let mexeu = false;
      for (const a of ordem) {
        if (excedente <= 0) break;
        if (at[a] > 3) { at[a]--; excedente--; mexeu = true; }
      }
      if (!mexeu) break;
    }
  }
  const classe = CLASSES.includes(v.classe) ? v.classe : "Guerreiro";
  const prof = Math.ceil(1 + lvl / 4);
  const dv = DADO_DE_VIDA[classe] || 8;
  const pvMax = dv + mod(at.con) + (lvl - 1) * (Math.floor(dv / 2) + 1 + mod(at.con));
  const pvMaxFinal = Math.max(1, pvMax);
  // PV guardado vale, inclusive 0 (personagem caído). Só uma ficha nova, sem PV, começa com a vida cheia.
  const pvGuardado = v.pv === undefined || v.pv === null || v.pv === "" ? NaN : Number(v.pv);
  const pv = Number.isFinite(pvGuardado) ? Math.max(0, Math.min(Math.round(pvGuardado), pvMaxFinal)) : pvMaxFinal;
  const manaMax = manaMaxima(classe, lvl, at);
  const manaGuardada = v.mana === undefined || v.mana === null || v.mana === "" ? NaN : Number(v.mana);
  const mana = Number.isFinite(manaGuardada) ? Math.max(0, Math.min(Math.round(manaGuardada), manaMax)) : manaMax;
  const vistas = new Set();
  const magias = (Array.isArray(v.magias) ? v.magias : []).map((m) => normalizarMagia(m, lvl))
    .filter((m) => m && !vistas.has(chave(m.nome)) && vistas.add(chave(m.nome))).slice(0, MAX_MAGIAS);
  const inventario = inventarioDe(v);
  const anotacoes = safeStr(v.anotacoes ?? v.notas, "", 1000);
  const f = {
    uid,
    xp: Math.max(0, Math.floor(Number(v.xp)) || 0),
    nome: safeStr(v.nome, "Herói", 30),
    sexo: SEXOS.includes(v.sexo) ? v.sexo : "Masculino",
    raca: RACAS.includes(v.raca) ? v.raca : "Humano",
    classe,
    antecedente: safeStr(v.antecedente, "", 30),
    nivel: lvl,
    proficiencia: prof,
    atributos: at,
    pvMax: pvMaxFinal,
    pv,
    manaMax,
    mana,
    ca: Math.max(10, Number(v.ca) || 10),
    imagem: safeStr(v.imagem, "", 500),
    pericias: (Array.isArray(v.pericias) ? v.pericias : []).filter((p) => PERICIAS[p]).slice(0, Math.max(1, 2 + mod(at.int))),
    ataques: _ataquesPorClasse(classe, Array.isArray(v.ataques) ? v.ataques : [], at, prof),
    magias,
    inventario,
    equipamento: equipamentoDerivado(inventario),
    tracos: {
      personalidade: safeStr(v.tracos?.personalidade, "", 200),
      ideal: safeStr(v.tracos?.ideal, "", 200),
      vinculo: safeStr(v.tracos?.vinculo, "", 200),
      defeito: safeStr(v.tracos?.defeito, "", 200),
    },
    dica: safeStr(v.dica, "", 200),
    conceito: conceito || safeStr(v.conceito, "", 300),
    notas: anotacoes,
    anotacoes,
    // Ouro (loja da vila e saque) e o ato em que o descanso curto já foi usado. Ficha antiga começa com o ouro inicial.
    ouro: v.ouro === undefined || v.ouro === null ? OURO_INICIAL : Math.max(0, Math.min(99999, Math.floor(Number(v.ouro)) || 0)),
    descanso: Math.max(0, Math.min(3, Math.floor(Number(v.descanso)) || 0)),
  };
  f.pendencias = pendenciasDe(v.pendencias, f);
  return f;
}

/** O ataque da ficha com esse nome (lista fechada: sem cair no primeiro). Aceita parte do nome com 4+ letras. */
function ataqueDaFicha(ficha, nome) {
  const k = chave(nome);
  if (!k) return null;
  const ataques = ficha.ataques || [];
  return ataques.find((a) => chave(a.nome) === k)
    || (k.length >= 4 ? ataques.find((a) => chave(a.nome).includes(k) || k.includes(chave(a.nome))) : null)
    || null;
}
/** A magia da ficha com esse nome (só nome exato, sem acentos/maiúsculas). */
function magiaDaFicha(ficha, nome) {
  const k = chave(nome);
  return k ? (ficha.magias || []).find((m) => chave(m.nome) === k) || null : null;
}
/** O item do inventário com esse nome. */
function itemDaFicha(ficha, nome) {
  const k = chave(nome);
  return k ? (ficha.inventario || []).find((i) => chave(i.nome) === k) || null : null;
}
const temItemRapido = (ficha) => (ficha.inventario || []).some((i) => TIPOS_RAPIDOS.includes(i.tipo) && i.qtd > 0);

/**
 * Rolagem de iniciativa (d20 + DES).
 */
function iniciativa(ficha) {
  return d(20) + mod(ficha.atributos.des);
}

function criarInimigo(id, dados) {
  return {
    id, nome: dados.nome, pv: Math.max(1, dados.pv || 7),
    pvMax: Math.max(1, dados.pv || 7), ca: Math.max(10, dados.ca || 13),
    ataque: Number(dados.ataque) || 4, dano: dados.dano || "1d6+2", des: Number(dados.des) || 2,
    alcance: dados.alcance === "distancia" ? "distancia" : "corpo",
  };
}

function iniciarCombate(jogadores, inimigosDados) {
  const ordem = [];
  for (const f of Object.values(jogadores)) {
    if (!f.pv || f.pv <= 0) continue;
    ordem.push({ id: f.uid, tipo: "pj", nome: f.nome, ini: d(20) + mod(f.atributos.des) });
  }
  const inimigos = inimigosDados.map((d, i) => criarInimigo(`ini_${i}`, d));
  for (const i of inimigos) ordem.push({ id: i.id, tipo: "ini", nome: i.nome, ini: d(20) + i.des });
  ordem.sort((a, b) => b.ini - a.ini || Math.random() - 0.5);
  return { rodada: 1, vez: 0, ordem, inimigos, inicioVez: Date.now() };
}

function vezAtual(combate) {
  if (!combate || !combate.ordem?.length) return null;
  return combate.ordem[combate.vez % combate.ordem.length];
}

function combateAcabou(combate, fichas) {
  if (!combate) return true;
  if (!combate.inimigos?.some((i) => i.pv > 0)) return true;
  if (fichas) {
    const pjsVivos = Object.values(fichas).filter((f) => f.pv > 0).length;
    if (pjsVivos === 0) return true;
  }
  return false;
}

/** O ataque da ficha com esse nome (sem diferenciar maiúsculas e acentos); senão o primeiro; senão golpe desarmado. */
function acharAtaque(ficha, nome) {
  const ataques = ficha.ataques || [];
  const k = chave(nome);
  return ataques.find((at) => chave(at.nome) === k)
    || (k ? ataques.find((at) => chave(at.nome).includes(k) || k.includes(chave(at.nome))) : null)
    || ataques[0]
    || { nome: "Golpe desarmado", bonus: mod(ficha.atributos?.for) + 2, dano: "1d4" };
}

function montarRolagem(ficha, pedido, combate, id) {
  if (!pedido || typeof pedido !== "object") return null;
  if (pedido.tipo === "ataque") {
    const a = acharAtaque(ficha, pedido.ataque);
    const vivos = (combate?.inimigos || []).filter((i) => i.pv > 0);
    const alvo = vivos.find((i) => i.id === pedido.alvo || chave(i.nome) === chave(pedido.alvo)) || vivos[0];
    return {
      id, jogador: ficha.uid, tipo: "ataque", rotulo: `${a.nome} vs ${alvo ? alvo.nome : "alvo"}`,
      bonus: a.bonus, cd: alvo?.ca ?? 13, motivo: pedido.ataque, dano: a.dano, alvo: alvo?.id,
    };
  }
  const cd = Math.max(5, Math.min(25, Math.round(Number(pedido.cd)) || 13));
  if (pedido.tipo === "salvaguarda") {
    const atr = ATRIBUTOS.includes(pedido.atributo) ? pedido.atributo : "des";
    return { id, jogador: ficha.uid, tipo: "teste", rotulo: `Salvaguarda de ${NOME_ATRIBUTO[atr]}`,
      bonus: mod(ficha.atributos?.[atr]), cd, motivo: safeStr(pedido.motivo, "", 120) };
  }
  const pericia = Object.keys(PERICIAS).find((p) => chave(p) === chave(pedido.pericia)) || "Percepção";
  return { id, jogador: ficha.uid, tipo: "teste", rotulo: pericia,
    bonus: bonusPericia(ficha, pericia), cd, motivo: safeStr(pedido.motivo, "", 120) };
}

function resolverRolagem(rol, natural, combate, nomeAtacante) {
  natural = Math.max(1, Math.min(20, Math.round(Number(natural)) || 1));
  const total = natural + (rol.bonus || 0);
  const sucesso = natural === 20 || (natural !== 1 && total >= (rol.cd || 13));
  let dano, descricao;
  if (rol.tipo === "ataque") {
    if (sucesso) {
      const critico = natural === 20;
      const r = rolar(rol.dano || "1d4", critico);
      dano = r.total;
      const alvo = combate?.inimigos?.find((i) => i.id === rol.alvo || i.nome === rol.alvo);
      if (alvo) alvo.pv = Math.max(0, alvo.pv - dano);
      descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)} = ${total} vs CA ${rol.cd} — ${critico ? "CRÍTICO! " : ""}${dano} de dano.`;
    } else {
      descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)} = ${total} vs CA ${rol.cd} — errou.`;
    }
  } else {
    descricao = `${rol.rotulo}: ${natural}${sinal(rol.bonus)} = ${total} vs CD ${rol.cd} — ${sucesso ? "sucesso" : "falha"}.`;
  }
  return { natural, total, sucesso, dano, descricao };
}

/**
 * Passa a vez depois que `quemAgiu` terminou (null = ninguém agiu ainda, ex.: combate acabou de começar)
 * e resolve os turnos dos inimigos até chegar a um jogador de pé. Altera `c` e a vida em `fichas`.
 * `opcoes.tatica(inimigo, alvosVivos)` (combate com mapa): move o inimigo e devolve { alvo|null, linhas, bonusCA };
 * sem alvo, o inimigo só se move. Sem tática (combate antigo), ataca um personagem de pé ao acaso.
 * Cada item de `ocorrido`: { linha, log: { texto, ok, tipo? } } (ok null = movimento, neutro).
 */
function passarVez(c, fichas, quemAgiu, opcoes = {}) {
  const ocorrido = [];
  const lista = Object.values(fichas);
  const avancar = () => { c.vez = (Number(c.vez) || 0) + 1; if (c.vez >= c.ordem.length) { c.vez = 0; c.rodada = (c.rodada || 1) + 1; } };
  if (!c.ordem?.length) return ocorrido;
  c.vez = (Number(c.vez) || 0) % c.ordem.length;
  if (quemAgiu && vezAtual(c)?.id === quemAgiu) avancar();
  for (let seguranca = 0; seguranca < c.ordem.length * 2 + 2; seguranca++) {
    if (!c.inimigos?.some((i) => i.pv > 0)) break;
    const atual = vezAtual(c);
    if (!atual) break;
    if (atual.tipo === "pj") {
      const f = lista.find((ff) => ff.uid === atual.id);
      if (f && f.pv > 0) break;          // vez de um jogador de pé: para aqui
      if (!lista.some((ff) => ff.pv > 0)) break;
      avancar();                          // jogador caído ou que saiu da mesa perde a vez
      continue;
    }
    const inimigo = c.inimigos.find((i) => i.id === atual.id);
    if (!inimigo || inimigo.pv <= 0) { avancar(); continue; }
    const alvos = lista.filter((f) => f.pv > 0);
    if (!alvos.length) break;
    let alvo, bonusCA = 0;
    if (opcoes.tatica) {
      const plano = opcoes.tatica(inimigo, alvos) || {};
      for (const l of plano.linhas || []) ocorrido.push({ linha: l, log: { texto: l, ok: null, tipo: "sys" } });
      alvo = plano.alvo;
      bonusCA = Number(plano.bonusCA) || 0;
      if (!alvo) { avancar(); continue; }   // não chegou perto: só se moveu
    } else {
      alvo = alvos[Math.floor(Math.random() * alvos.length)];
    }
    const ca = alvo.ca + bonusCA;
    const nat = d(20);
    const total = nat + inimigo.ataque;
    const acertou = nat === 20 || (nat !== 1 && total >= ca);
    let dano = 0;
    if (acertou) {
      dano = rolar(inimigo.dano, nat === 20).total;
      alvo.pv = Math.max(0, alvo.pv - dano);
    }
    const linha = `${inimigo.nome} ataca ${alvo.nome}: ${nat}${sinal(inimigo.ataque)} = ${total} vs CA ${ca}${bonusCA ? ` (cobertura +${bonusCA})` : ""} → ${acertou ? `${nat === 20 ? "crítico, " : ""}acertou, ${dano} de dano${alvo.pv <= 0 ? ` — ${alvo.nome} cai` : ""}` : "errou"}`;
    ocorrido.push({ linha, log: { texto: linha, ok: acertou } });
    avancar();
  }
  c.inicioVez = Date.now();
  return ocorrido;
}

module.exports = {
  ATRIBUTOS, NOME_ATRIBUTO, PERICIAS, RACAS, CLASSES, SEXOS, DADO_DE_VIDA,
  mod, sinal, d, rolar, bonusPericia, normalizarFicha, inicio: iniciativa,
  criarInimigo, iniciarCombate, vezAtual, combateAcabou,
  montarRolagem, resolverRolagem, passarVez, chave, acharAtaque,
  CONJURADORES, NIVEIS_PONTOS, NIVEIS_TECNICA, NIVEL_MAXIMO, TIPOS_ITEM, TIPOS_RAPIDOS, MAX_ITENS, MAX_QTD, POCAO_DE_CURA, MAGIAS_INICIAIS,
  circuloMaximo, manaMaxima, bonusMagia, ehConjurador, efeitoDeItem, normalizarItem, juntarItens, equipamentoDerivado,
  RARIDADES_ITEM, OURO_INICIAL,
  ganhosDoNivel, somarPendencias, qtdPendencia, ataqueDaTecnica, ataqueDaFicha, magiaDaFicha, itemDaFicha, temItemRapido,
};