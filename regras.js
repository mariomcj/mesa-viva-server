/**
 * Motor de regras do Mesa Viva — d20 simplificado, inspirado no SRD 5.1 (CC-BY-4.0).
 *
 * Tudo aqui é determinístico a partir do dado (rng), para poder ser testado.
 * Campos novos (elementos, status, talentos, subclasses, itens) são opcionais:
 * fichas e combates antigos continuam funcionando.
 */
"use strict";

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
const SOMA_BASE_ATRIBUTOS = 72;

// ── Elementos ──
const ELEMENTOS = ["fisico", "fogo", "gelo", "raio", "sagrado", "sombrio", "veneno"];
const NOME_ELEMENTO = { fisico: "Físico", fogo: "Fogo", gelo: "Gelo", raio: "Raio", sagrado: "Sagrado", sombrio: "Sombrio", veneno: "Veneno" };

// ── Clima e período ──
const CLIMAS = ["limpo", "chuva", "neblina", "neve", "tempestade"];
const PERIODOS = ["manha", "tarde", "anoitecer", "noite"];
const NOME_CLIMA = { limpo: "Céu limpo", chuva: "Chuva", neblina: "Neblina", neve: "Neve", tempestade: "Tempestade" };
const NOME_PERIODO = { manha: "Manhã", tarde: "Tarde", anoitecer: "Anoitecer", noite: "Noite" };
/** Multiplicador de dano por elemento, conforme o clima. */
const CLIMA_ELEMENTO = {
  chuva: { fogo: 0.75, raio: 1.25 },
  tempestade: { fogo: 0.75, raio: 1.5 },
  neve: { gelo: 1.25, fogo: 0.75 },
};
/** Bônus de perícia por clima e período. */
const AMBIENTE_PERICIA = {
  neblina: { Percepção: -2, Furtividade: 2 },
  noite: { Percepção: -1, Furtividade: 2 },
  anoitecer: { Furtividade: 1 },
  tempestade: { Percepção: -2, Sobrevivência: -1 },
};

// ── Status com duração em turnos ──
const STATUS = {
  envenenado: { nome: "Envenenado", tick: { dano: "1d4" }, descricao: "Sofre 1d4 de dano no início da vez." },
  em_chamas: { nome: "Em chamas", tick: { dano: "1d6" }, descricao: "Sofre 1d6 de dano no início da vez." },
  sangrando: { nome: "Sangrando", tick: { dano: "1d3" }, descricao: "Sofre 1d3 de dano no início da vez." },
  atordoado: { nome: "Atordoado", perdeVez: true, descricao: "Perde a próxima vez." },
  protegido: { nome: "Protegido", ca: 2, descricao: "+2 na CA." },
  regenerando: { nome: "Regenerando", tick: { cura: "1d4" }, descricao: "Recupera 1d4 PV no início da vez." },
  abencoado: { nome: "Abençoado", ataque: 1, descricao: "+1 nos ataques." },
};

// ── Talentos (um a cada 2 níveis) ──
const TALENTOS = {
  aprendizado_rapido: { nome: "Aprendizado Rápido", descricao: "+25% de XP." },
  cacador_de_gigantes: { nome: "Caçador de Gigantes", descricao: "+2 de dano contra chefes." },
  sede_de_sangue: { nome: "Sede de Sangue", descricao: "Recupera 1 PV a cada ataque que acerta." },
  ultimo_suspiro: { nome: "Último Suspiro", descricao: "Uma vez por combate, fica com 1 PV em vez de cair." },
  pele_de_espinhos: { nome: "Pele de Espinhos", descricao: "Quem acerta você sofre 1d4 de dano." },
  olhar_atento: { nome: "Olhar Atento", descricao: "Crítico com 19 ou 20 no dado." },
  pes_ligeiros: { nome: "Pés Ligeiros", descricao: "+2 na iniciativa." },
  couraca: { nome: "Couraça", descricao: "+1 na CA." },
  negociador: { nome: "Negociador", descricao: "+20% de ouro nos saques." },
};

// ── Subclasses (escolhidas no nível 3) ──
const SUBCLASSES = {
  Guerreiro: {
    campeao: { nome: "Campeão", descricao: "Crítico com 19 ou 20 no dado.", critMin: 19 },
    guardiao: { nome: "Guardião", descricao: "+1 na CA.", ca: 1 },
  },
  Ladino: {
    assassino: { nome: "Assassino", descricao: "+2 de dano nos ataques.", dano: 2 },
    trapaceiro: { nome: "Trapaceiro", descricao: "+2 em Prestidigitação e Furtividade.", pericias: { Prestidigitação: 2, Furtividade: 2 } },
  },
  Mago: {
    evocador: { nome: "Evocador", descricao: "+2 de dano com ataques elementais.", danoElemental: 2 },
    abjurador: { nome: "Abjurador", descricao: "+1 na CA e +1 em Arcanismo.", ca: 1, pericias: { Arcanismo: 1 } },
  },
  Clérigo: {
    vida: { nome: "Domínio da Vida", descricao: "+2 em toda cura recebida pelo grupo vinda de você.", curaBonus: 2 },
    guerra: { nome: "Domínio da Guerra", descricao: "+1 nos ataques.", ataque: 1 },
  },
};

// ── Raridade de itens ──
const RARIDADES = ["comum", "incomum", "raro", "epico", "lendario"];
const NOME_RARIDADE = { comum: "Comum", incomum: "Incomum", raro: "Raro", epico: "Épico", lendario: "Lendário" };
const BONUS_RARIDADE = { comum: 0, incomum: 1, raro: 1, epico: 2, lendario: 3 };

function safeStr(v, def, max) {
  let s = String(v ?? def);
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿�]/g, "");
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");
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

/** Prefixo de sinal: "+" para zero ou positivo, "" para negativo (o número já traz o "-"). */
function sinal(n) {
  return n >= 0 ? "+" : "";
}

/** Número com sinal: 3 → "+3", -1 → "-1". */
function comSinal(n) {
  return `${sinal(n)}${n}`;
}

const d = (faces, rng = Math.random) => 1 + Math.floor(rng() * faces);

/** Rola expressão como "2d6+3" ou "1d8-1". Em crítico, dobra os dados (não o bônus). */
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

function elementoValido(e) {
  const v = String(e || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return ELEMENTOS.includes(v) ? v : null;
}

function listaElementos(v) {
  return (Array.isArray(v) ? v : []).map(elementoValido).filter(Boolean).slice(0, 7);
}

function normalizarStatus(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((s) => s && STATUS[s.tipo])
    .map((s) => ({ tipo: s.tipo, turnos: Math.max(1, Math.min(10, Number(s.turnos) || 2)) }))
    .slice(0, 6);
}

function aplicarStatus(alvo, tipo, turnos) {
  if (!STATUS[tipo]) return false;
  alvo.status = normalizarStatus(alvo.status);
  const existente = alvo.status.find((s) => s.tipo === tipo);
  const t = Math.max(1, Math.min(10, Number(turnos) || 2));
  if (existente) existente.turnos = Math.max(existente.turnos, t);
  else alvo.status.push({ tipo, turnos: t });
  return true;
}

function temStatus(alvo, tipo) {
  return (alvo?.status || []).some((s) => s.tipo === tipo && s.turnos > 0);
}

// ── Itens ──
function normalizarItem(it) {
  if (!it || typeof it !== "object") return null;
  const raridade = RARIDADES.includes(it.raridade) ? it.raridade : "comum";
  const tipo = ["arma", "armadura", "amuleto", "consumivel"].includes(it.tipo) ? it.tipo : "amuleto";
  return {
    id: safeStr(it.id, `it_${Math.random().toString(36).slice(2, 8)}`, 20),
    nome: safeStr(it.nome, "Item", 40),
    raridade,
    tipo,
    bonus: Math.max(0, Math.min(5, Number(it.bonus) || BONUS_RARIDADE[raridade])),
    elemento: elementoValido(it.elemento),
    descricao: safeStr(it.descricao, "", 160),
  };
}

const NOMES_ITEM = {
  arma: ["Lâmina", "Machadinha", "Maça", "Arco", "Cajado", "Adaga"],
  armadura: ["Gibão", "Cota", "Brunea", "Manto", "Elmo", "Escudo"],
  amuleto: ["Amuleto", "Anel", "Talismã", "Broche", "Pingente", "Medalhão"],
};
const QUALIFICADOR_ELEMENTO = { fogo: "Ardente", gelo: "Gélido", raio: "Trovejante", sagrado: "Bento", sombrio: "Sombrio", veneno: "Peçonhento" };

/** Sorteia uma raridade; quanto maior a sorte (andar, chefe), mais chance de itens melhores. */
function sortearRaridade(sorte = 0, rng = Math.random) {
  const r = rng() * 100 + sorte * 6;
  if (r > 118) return "lendario";
  if (r > 100) return "epico";
  if (r > 80) return "raro";
  if (r > 50) return "incomum";
  return "comum";
}

function gerarItem(sorte = 0, rng = Math.random) {
  const tipos = ["arma", "armadura", "amuleto"];
  const tipo = tipos[Math.floor(rng() * tipos.length)];
  const raridade = sortearRaridade(sorte, rng);
  const elementos = ELEMENTOS.filter((e) => e !== "fisico");
  const elemento = tipo !== "armadura" && raridade !== "comum" && rng() < 0.5 ? elementos[Math.floor(rng() * elementos.length)] : null;
  const base = NOMES_ITEM[tipo][Math.floor(rng() * NOMES_ITEM[tipo].length)];
  const nome = elemento ? `${base} ${QUALIFICADOR_ELEMENTO[elemento]}` : `${base} ${NOME_RARIDADE[raridade]}`;
  const bonus = BONUS_RARIDADE[raridade];
  const descricao = tipo === "arma"
    ? `+${bonus} nos ataques${elemento ? `, dano de ${NOME_ELEMENTO[elemento].toLowerCase()}` : ""}.`
    : tipo === "armadura" ? `+${bonus} na CA.` : `${elemento ? `Resistência a ${NOME_ELEMENTO[elemento].toLowerCase()}. ` : ""}+${bonus} nos testes de perícia.`;
  return normalizarItem({ id: `it_${Math.floor(rng() * 1e9).toString(36)}`, nome, raridade, tipo, bonus, elemento, descricao });
}

function gerarSaque(sorte = 0, rng = Math.random) {
  return [gerarItem(sorte, rng), gerarItem(sorte, rng), gerarItem(sorte + 1, rng)];
}

// ── Ataques ──
const ATAQUES_PADRAO = {
  Guerreiro: [
    { nome: "Espada longa", bonus: 3, dano: "1d8+2", elemento: "fisico" },
    { nome: "Golpe de escudo", bonus: 2, dano: "1d6+1", elemento: "fisico" },
  ],
  Ladino: [
    { nome: "Adaga", bonus: 3, dano: "1d6", elemento: "fisico" },
    { nome: "Arco curto", bonus: 2, dano: "1d6+1", elemento: "fisico" },
  ],
  Mago: [
    { nome: "Cajado", bonus: 1, dano: "1d4", elemento: "fisico" },
    { nome: "Centelha Arcana", bonus: 3, dano: "1d6", elemento: "raio" },
  ],
  Clérigo: [
    { nome: "Martelo", bonus: 2, dano: "1d6+1", elemento: "fisico" },
    { nome: "Luz Sagrada", bonus: 3, dano: "1d6", elemento: "sagrado" },
  ],
};

/** Elemento deduzido do nome quando a ficha não diz (fichas antigas). */
function elementoPeloNome(nome) {
  const n = String(nome || "").toLowerCase();
  if (/fogo|chama|brasa|incend/.test(n)) return "fogo";
  if (/gelo|frio|congel/.test(n)) return "gelo";
  if (/raio|trov|centelha|eletr|relâmp|relamp/.test(n)) return "raio";
  if (/sagrad|luz|divin|santo/.test(n)) return "sagrado";
  if (/sombr|trev|necro/.test(n)) return "sombrio";
  if (/venen|ácid|acid|peçonh/.test(n)) return "veneno";
  return "fisico";
}

function _ataquesPorClasse(classe, fornecidos) {
  const validos = fornecidos.map((a) => ({
    nome: safeStr(a.nome, "", 30),
    bonus: Math.max(-5, Math.min(15, Number(a.bonus) || 0)),
    dano: String(a.dano || "1d4"),
    elemento: elementoValido(a.elemento) || elementoPeloNome(a.nome),
  })).slice(0, 6);
  if (validos.length > 0) return validos;
  return (ATAQUES_PADRAO[classe] || ATAQUES_PADRAO.Guerreiro).map((a) => ({ ...a })).slice(0, 6);
}

function bonusProficiencia(nivel) {
  return Math.ceil(1 + nivel / 4);
}

function calcularPvMax(classe, nivel, con) {
  const dv = DADO_DE_VIDA[classe] || 8;
  return Math.max(1, dv + mod(con) + (nivel - 1) * (Math.floor(dv / 2) + 1 + mod(con)));
}

/**
 * Normaliza a ficha vinda da IA, do app ou do banco.
 * Preserva progressão (xp, nível, ouro, talentos, subclasse, itens, status).
 */
function normalizarFicha(dados, uid, conceito) {
  const v = dados || {};
  const classe = CLASSES.includes(v.classe) ? v.classe : "Guerreiro";
  const lvl = Math.max(1, Math.min(20, Number(v.nivel) || 1));
  const atributosGanhos = Math.max(0, Math.min(Math.floor(lvl / 4), Number(v.atributosGanhos) || 0));
  const at = {};
  for (const a of ATRIBUTOS) at[a] = Math.max(3, Math.min(20, Number(v.atributos?.[a]) || 10));
  // Soma máxima: 72 na criação, mais 1 por aumento de atributo ganho por nível.
  const maxSoma = SOMA_BASE_ATRIBUTOS + atributosGanhos;
  let soma = ATRIBUTOS.reduce((s, a) => s + at[a], 0);
  if (soma > maxSoma) {
    let excedente = soma - maxSoma;
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
  const pvMax = calcularPvMax(classe, lvl, at.con);
  const subclasse = SUBCLASSES[classe]?.[v.subclasse] && lvl >= 3 ? v.subclasse : "";
  const talentos = (Array.isArray(v.talentos) ? v.talentos : []).filter((t, i, arr) => TALENTOS[t] && arr.indexOf(t) === i).slice(0, Math.floor(lvl / 2));
  return {
    uid,
    xp: Math.max(0, Math.floor(Number(v.xp) || 0)),
    nome: safeStr(v.nome, "Herói", 30),
    sexo: SEXOS.includes(v.sexo) ? v.sexo : "Masculino",
    raca: RACAS.includes(v.raca) ? v.raca : "Humano",
    classe,
    antecedente: safeStr(v.antecedente, "", 30),
    nivel: lvl,
    proficiencia: bonusProficiencia(lvl),
    atributos: at,
    atributosGanhos,
    pvMax,
    pv: Math.max(0, Math.min(Number(v.pv) >= 0 && v.pv !== undefined && v.pv !== null && v.pv !== "" ? Number(v.pv) : pvMax, pvMax)),
    ca: Math.max(10, Number(v.ca) || 10),
    imagem: safeStr(v.imagem, "", 500),
    pericias: (Array.isArray(v.pericias) ? v.pericias : []).filter((p) => PERICIAS[p]).slice(0, Math.max(1, 2 + mod(at.int))),
    ataques: _ataquesPorClasse(classe, Array.isArray(v.ataques) ? v.ataques : []),
    magias: (Array.isArray(v.magias) ? v.magias : []).map((m) => ({ nome: safeStr(m.nome, "", 30), descricao: safeStr(m.descricao, "", 300) })).slice(0, 10),
    equipamento: (Array.isArray(v.equipamento) ? v.equipamento : []).map((s) => safeStr(s, "", 50)).slice(0, 12),
    itens: (Array.isArray(v.itens) ? v.itens : []).map(normalizarItem).filter(Boolean).slice(0, 8),
    ouro: Math.max(0, Math.floor(Number(v.ouro) || 0)),
    talentos,
    subclasse,
    status: normalizarStatus(v.status),
    respecUsado: v.respecUsado === true,
    tracos: {
      personalidade: safeStr(v.tracos?.personalidade, "", 200),
      ideal: safeStr(v.tracos?.ideal, "", 200),
      vinculo: safeStr(v.tracos?.vinculo, "", 200),
      defeito: safeStr(v.tracos?.defeito, "", 200),
    },
    dica: safeStr(v.dica, "", 200),
    conceito: conceito || safeStr(v.conceito, "", 300),
    notas: safeStr(v.notas, "", 1000),
  };
}

/** Campos que só o servidor altera. O app pode editar o resto da ficha. */
const CAMPOS_DO_SERVIDOR = ["xp", "nivel", "atributosGanhos", "ouro", "talentos", "subclasse", "itens", "status", "respecUsado"];

/** Junta a ficha editada no app com a progressão guardada no servidor. */
function mesclarFichaEditada(editada, antiga) {
  const out = { ...(editada || {}) };
  if (antiga) for (const k of CAMPOS_DO_SERVIDOR) if (antiga[k] !== undefined) out[k] = antiga[k];
  // Durante o jogo, atributos só mudam por subida de nível ou redistribuição.
  if (antiga?.atributos && antiga.nivel > 1) out.atributos = antiga.atributos;
  return out;
}

/** O que a ficha ainda pode escolher depois de subir de nível. */
function pendencias(f) {
  return {
    talentos: Math.max(0, Math.floor((f.nivel || 1) / 2) - (f.talentos || []).length),
    subclasse: (f.nivel || 1) >= 3 && !f.subclasse,
    atributos: Math.max(0, Math.floor((f.nivel || 1) / 4) - (f.atributosGanhos || 0)),
  };
}

/** Modificadores somados de subclasse, talentos, itens e status. */
function efeitos(f) {
  const e = { ca: 0, ataque: 0, dano: 0, danoElemental: 0, critMin: 20, curaBonus: 0, xpMult: 1, iniciativa: 0, ouroMult: 1, pericias: {}, resistencias: [] };
  const sub = SUBCLASSES[f?.classe]?.[f?.subclasse];
  if (sub) {
    e.ca += sub.ca || 0; e.ataque += sub.ataque || 0; e.dano += sub.dano || 0; e.danoElemental += sub.danoElemental || 0;
    e.curaBonus += sub.curaBonus || 0; if (sub.critMin) e.critMin = Math.min(e.critMin, sub.critMin);
    for (const [p, b] of Object.entries(sub.pericias || {})) e.pericias[p] = (e.pericias[p] || 0) + b;
  }
  const t = new Set(f?.talentos || []);
  if (t.has("couraca")) e.ca += 1;
  if (t.has("olhar_atento")) e.critMin = Math.min(e.critMin, 19);
  if (t.has("aprendizado_rapido")) e.xpMult = 1.25;
  if (t.has("pes_ligeiros")) e.iniciativa += 2;
  if (t.has("negociador")) e.ouroMult = 1.2;
  for (const it of f?.itens || []) {
    if (it.tipo === "arma") e.ataque += it.bonus || 0;
    else if (it.tipo === "armadura") e.ca += it.bonus || 0;
    else if (it.tipo === "amuleto") {
      e.pericias["*"] = (e.pericias["*"] || 0) + (it.bonus || 0);
      if (it.elemento) e.resistencias.push(it.elemento);
    }
  }
  for (const s of f?.status || []) {
    const def = STATUS[s.tipo];
    if (!def) continue;
    e.ca += def.ca || 0;
    e.ataque += def.ataque || 0;
  }
  // Teto para não quebrar o d20: no máximo +5 de itens e talentos em ataque e CA.
  e.ca = Math.min(5, e.ca);
  e.ataque = Math.min(5, e.ataque);
  e.pericias["*"] = Math.min(3, e.pericias["*"] || 0);
  return e;
}

function caEfetiva(f) {
  return (f.ca || 10) + efeitos(f).ca;
}

function bonusPericia(f, pericia, ambiente) {
  const atr = PERICIAS[pericia] ?? "sab";
  const treinada = (f.pericias || []).some((p) => p.toLowerCase() === String(pericia).toLowerCase());
  const ef = efeitos(f);
  let b = mod(f.atributos?.[atr]) + (treinada ? f.proficiencia || 2 : 0) + (ef.pericias[pericia] || 0) + (ef.pericias["*"] || 0);
  if (ambiente) {
    b += AMBIENTE_PERICIA[ambiente.clima]?.[pericia] || 0;
    b += AMBIENTE_PERICIA[ambiente.periodo]?.[pericia] || 0;
  }
  return b;
}

/** Chance de passar no teste com d20 + bônus contra a CD, em % (5 a 95). */
function chanceSucesso(bonus, cd) {
  const p = (21 - ((Number(cd) || 13) - (Number(bonus) || 0))) / 20;
  return Math.round(Math.max(0.05, Math.min(0.95, p)) * 100);
}

// ── XP e níveis ──
const XP = { narracao: 2, porInimigo: 10, vitoriaMinima: 20, capitulo: 50, epilogo: 100 };

function xpParaProximo(nivel) {
  return (nivel || 1) * 100;
}

/**
 * Soma XP e sobe de nível quantas vezes for preciso.
 * Recalcula PV máximo e proficiência; o PV atual sobe junto com o máximo.
 * Devolve a lista de níveis alcançados.
 */
function ganharXp(f, quantidade) {
  const mult = efeitos(f).xpMult;
  f.xp = Math.max(0, (f.xp || 0) + Math.round(quantidade * mult));
  const niveis = [];
  while (f.nivel < 20 && f.xp >= xpParaProximo(f.nivel)) {
    f.xp -= xpParaProximo(f.nivel);
    const pvMaxAntes = calcularPvMax(f.classe, f.nivel, f.atributos.con);
    f.nivel += 1;
    const pvMaxNovo = calcularPvMax(f.classe, f.nivel, f.atributos.con);
    f.pvMax = pvMaxNovo;
    f.pv = Math.min(pvMaxNovo, (f.pv || 0) + (pvMaxNovo - pvMaxAntes));
    f.proficiencia = bonusProficiencia(f.nivel);
    niveis.push(f.nivel);
  }
  return niveis;
}

// ── Inimigos e combate ──
function criarInimigo(id, dados) {
  const pv = Math.max(1, Math.min(500, Number(dados?.pv) || 7));
  const comportamento = ["agressivo", "covarde", "tatico"].includes(dados?.comportamento) ? dados.comportamento : "tatico";
  const statusAplica = STATUS[dados?.aplica?.status] ? { status: dados.aplica.status, chance: Math.max(0, Math.min(1, Number(dados.aplica.chance) || 0.3)), turnos: Math.max(1, Math.min(5, Number(dados.aplica.turnos) || 2)) } : null;
  return {
    id,
    nome: safeStr(dados?.nome, "Inimigo", 40),
    pv, pvMax: pv,
    ca: Math.max(8, Math.min(25, Number(dados?.ca) || 13)),
    ataque: Math.max(-2, Math.min(15, Number(dados?.ataque) || 4)),
    dano: String(dados?.dano || "1d6+2"),
    des: Math.max(-3, Math.min(8, Number(dados?.des) || 2)),
    elemento: elementoValido(dados?.elemento) || "fisico",
    fraquezas: listaElementos(dados?.fraquezas),
    resistencias: listaElementos(dados?.resistencias),
    imunidades: listaElementos(dados?.imunidades),
    chefe: dados?.chefe === true,
    comportamento,
    aplica: statusAplica,
    status: [],
  };
}

function inimigoAtivo(i) {
  return i && i.pv > 0 && !i.fugiu;
}

function iniciarCombate(jogadores, inimigosDados, rng = Math.random) {
  const ordem = [];
  for (const f of Object.values(jogadores)) {
    if (!f.pv || f.pv <= 0) continue;
    ordem.push({ id: f.uid, tipo: "pj", nome: f.nome, ini: d(20, rng) + mod(f.atributos.des) + efeitos(f).iniciativa });
  }
  const inimigos = (inimigosDados || []).slice(0, 8).map((dd, i) => criarInimigo(`ini_${i}`, dd));
  for (const i of inimigos) ordem.push({ id: i.id, tipo: "ini", nome: i.nome, ini: d(20, rng) + i.des });
  ordem.sort((a, b) => b.ini - a.ini || rng() - 0.5);
  return { rodada: 1, vez: 0, ordem, inimigos, inicioVez: Date.now(), suspiro: {} };
}

function vezAtual(combate) {
  if (!combate || !combate.ordem?.length) return null;
  return combate.ordem[combate.vez % combate.ordem.length];
}

function combateAcabou(combate, fichas) {
  if (!combate) return true;
  if (!combate.inimigos?.some(inimigoAtivo)) return true;
  if (fichas) {
    const pjsVivos = Object.values(fichas).filter((f) => f.pv > 0).length;
    if (pjsVivos === 0) return true;
  }
  return false;
}

/** Resultado final do combate: "vitoria", "derrota" ou null se ainda não acabou. */
function resultadoCombate(combate, fichas) {
  if (!combate) return null;
  const pjsVivos = Object.values(fichas || {}).filter((f) => f.pv > 0).length;
  if (fichas && pjsVivos === 0) return "derrota";
  if (!combate.inimigos?.some(inimigoAtivo)) return "vitoria";
  return null;
}

/** Multiplicador de dano de um elemento contra um alvo (fraqueza, resistência, imunidade). */
function multiplicadorElemento(elemento, alvo, ambiente) {
  const el = elemento || "fisico";
  let mult = 1, selo = null;
  if ((alvo?.imunidades || []).includes(el)) return { mult: 0, selo: "IMUNE" };
  if ((alvo?.fraquezas || []).includes(el)) { mult *= 1.5; selo = "FRACO"; }
  if ((alvo?.resistencias || []).includes(el)) { mult *= 0.5; selo = selo === "FRACO" ? null : "RESISTIU"; }
  const clima = CLIMA_ELEMENTO[ambiente?.clima]?.[el];
  if (clima) mult *= clima;
  return { mult, selo };
}

function montarRolagem(ficha, pedido, combate, id, ambiente) {
  const ef = efeitos(ficha);
  if (pedido.tipo === "ataque") {
    const a = (ficha.ataques || []).find((at) => at.nome === pedido.ataque) || (ficha.ataques || [])[0];
    if (!a) return null;
    const alvo = combate?.inimigos?.find((i) => (i.id === pedido.alvo || i.nome === pedido.alvo) && inimigoAtivo(i))
      || combate?.inimigos?.find(inimigoAtivo);
    const arma = (ficha.itens || []).find((it) => it.tipo === "arma" && it.elemento);
    const elemento = (a.elemento && a.elemento !== "fisico") ? a.elemento : (arma?.elemento || a.elemento || "fisico");
    const bonus = (a.bonus || 0) + ef.ataque;
    const cd = alvo?.ca ?? 13;
    return {
      id, jogador: ficha.uid, tipo: "ataque", rotulo: `${a.nome} vs ${alvo ? alvo.nome : "alvo"}`,
      bonus, cd, motivo: a.nome, dano: a.dano, alvo: alvo?.id, elemento,
      chance: chanceSucesso(bonus, cd),
    };
  }
  const bonus = pedido.tipo === "pericia"
    ? bonusPericia(ficha, pedido.pericia, ambiente)
    : mod(ficha.atributos[pedido.atributo] ?? 10) + (ef.pericias["*"] || 0);
  const rotulo = pedido.tipo === "pericia" ? pedido.pericia : `Salvaguarda de ${NOME_ATRIBUTO[pedido.atributo] || pedido.atributo}`;
  const cd = Math.max(5, Math.min(30, Number(pedido.cd) || 13));
  return {
    id, jogador: ficha.uid, tipo: pedido.tipo === "pericia" ? "teste" : "teste", pericia: pedido.pericia || null, rotulo,
    bonus, cd, motivo: safeStr(pedido.motivo, "", 120),
    chance: chanceSucesso(bonus, cd),
  };
}

/**
 * Resolve a rolagem do jogador. Pode receber um ajuste extra (minigame: +2 ou -2).
 * Devolve selo (CRÍTICO, POR POUCO, FRACO...) e evento para o app tocar o efeito certo.
 */
function resolverRolagem(rol, natural, combate, ficha, opcoes = {}) {
  const rng = opcoes.rng || Math.random;
  const ajuste = Number(opcoes.ajuste) || 0;
  const bonus = (rol.bonus || 0) + ajuste;
  const total = natural + bonus;
  const cd = rol.cd || 13;
  const ef = ficha ? efeitos(ficha) : { critMin: 20, dano: 0, danoElemental: 0 };
  const critico = rol.tipo === "ataque" ? natural >= ef.critMin : natural === 20;
  const falhaCritica = natural === 1;
  const sucesso = rol.tipo === "ataque" ? (critico || (!falhaCritica && total >= cd)) : total >= cd;
  const txtBonus = `${natural}${sinal(bonus)}${bonus} = ${total}`;
  let dano, descricao, selo = null, evento;
  if (rol.tipo === "ataque") {
    const alvo = combate?.inimigos?.find((i) => i.id === rol.alvo || i.nome === rol.alvo);
    if (sucesso) {
      const r = rolar(rol.dano || "1d4", critico, rng);
      const el = multiplicadorElemento(rol.elemento, alvo, opcoes.ambiente);
      let bruto = r.total + (ef.dano || 0) + ((rol.elemento && rol.elemento !== "fisico") ? (ef.danoElemental || 0) : 0);
      if (alvo?.chefe && (ficha?.talentos || []).includes("cacador_de_gigantes")) bruto += 2;
      dano = Math.max(el.mult === 0 ? 0 : 1, Math.floor(bruto * el.mult));
      if (alvo) {
        alvo.pv = Math.max(0, alvo.pv - dano);
        if (ficha && dano > 0 && (ficha.talentos || []).includes("sede_de_sangue")) ficha.pv = Math.min(ficha.pvMax, ficha.pv + 1);
      }
      selo = critico ? "CRÍTICO" : el.selo;
      if (critico && el.selo) selo = `CRÍTICO · ${el.selo}`;
      evento = critico ? "critico" : (el.selo === "IMUNE" ? "imune" : "acerto");
      const elTxt = rol.elemento && rol.elemento !== "fisico" ? ` de ${NOME_ELEMENTO[rol.elemento].toLowerCase()}` : "";
      descricao = `${rol.rotulo}: ${txtBonus} vs CA ${cd} — ${critico ? "CRÍTICO! " : ""}${dano} de dano${elTxt}${el.selo && el.selo !== "IMUNE" ? ` (${el.selo === "FRACO" ? "o alvo é fraco contra isso" : "o alvo resiste"})` : ""}${el.selo === "IMUNE" ? " (o alvo é imune)" : ""}.${alvo && alvo.pv <= 0 ? ` ${alvo.nome} cai.` : ""}`;
    } else {
      selo = falhaCritica ? "FALHA CRÍTICA" : (cd - total <= 2 ? "ERROU POR POUCO" : null);
      evento = "erro";
      descricao = `${rol.rotulo}: ${txtBonus} vs CA ${cd} — errou${falhaCritica ? " feio" : cd - total <= 2 ? " por pouco" : ""}.`;
    }
  } else {
    if (natural === 20 && sucesso) selo = "CRÍTICO";
    else if (falhaCritica && !sucesso) selo = "FALHA CRÍTICA";
    else if (!sucesso && cd - total <= 2) selo = "POR POUCO";
    evento = sucesso ? "sucesso" : "falha";
    descricao = `${rol.rotulo}: ${txtBonus} vs CD ${cd} — ${sucesso ? "sucesso" : "falha"}${selo ? ` (${selo.toLowerCase()})` : ""}.`;
  }
  if (ajuste) descricao += ajuste > 0 ? " O minigame deu +2." : " O minigame deu -2.";
  return { natural, total, sucesso, dano, descricao, selo, evento, critico };
}

function _avancar(c) {
  c.vez++;
  if (c.vez >= c.ordem.length) { c.vez = 0; c.rodada++; }
}

/**
 * Processa o início da vez de um participante: dano e cura de status, duração.
 * Devolve { linhas, perdeVez }.
 */
function processarInicioDaVez(alvo, nome, rng = Math.random) {
  const linhas = [];
  let perdeVez = false;
  alvo.status = normalizarStatus(alvo.status);
  for (const s of alvo.status) {
    const def = STATUS[s.tipo];
    if (def.tick?.dano && alvo.pv > 0) {
      const v = rolar(def.tick.dano, false, rng).total || 1;
      alvo.pv = Math.max(0, alvo.pv - v);
      linhas.push({ texto: `${nome} sofre ${v} de dano (${def.nome.toLowerCase()}).`, ok: false, evento: "status_dano", selo: def.nome.toUpperCase() });
    }
    if (def.tick?.cura && alvo.pv > 0) {
      const v = rolar(def.tick.cura, false, rng).total || 1;
      alvo.pv = Math.min(alvo.pvMax || alvo.pv + v, alvo.pv + v);
      linhas.push({ texto: `${nome} recupera ${v} PV (${def.nome.toLowerCase()}).`, ok: true, evento: "status_cura", selo: def.nome.toUpperCase() });
    }
    if (def.perdeVez && alvo.pv > 0) {
      perdeVez = true;
      linhas.push({ texto: `${nome} está atordoado e perde a vez.`, ok: false, evento: "atordoado", selo: "ATORDOADO" });
    }
    s.turnos -= 1;
    if (s.turnos <= 0) linhas.push({ texto: `${nome} não está mais ${def.nome.toLowerCase()}.`, ok: true, evento: "status_fim" });
  }
  alvo.status = alvo.status.filter((s) => s.turnos > 0);
  return { linhas, perdeVez };
}

/** Escolhe o alvo de um inimigo conforme o comportamento. */
function escolherAlvo(inimigo, alvos, rng = Math.random) {
  if (!alvos.length) return null;
  if (inimigo.comportamento === "agressivo" || rng() < 0.3) return alvos[Math.floor(rng() * alvos.length)];
  // Tático e covarde: atacam quem está mais fraco (menor fração de PV), evitando quem está protegido.
  const ordenados = [...alvos].sort((a, b) => {
    const pa = a.pv / (a.pvMax || 1) + (temStatus(a, "protegido") ? 0.5 : 0);
    const pb = b.pv / (b.pvMax || 1) + (temStatus(b, "protegido") ? 0.5 : 0);
    return pa - pb;
  });
  return ordenados[0];
}

/**
 * Avança o combate a partir do participante atual até chegar à vez de um jogador.
 * Processa status, fuga e ataques dos inimigos. `uidAtual` é quem acabou de agir.
 */
function passarVez(c, fichas, uidAtual, rng = Math.random) {
  const ocorrido = [];
  c.suspiro = c.suspiro || {};
  const registrar = (l) => ocorrido.push({ linha: l.texto, log: l });
  let seguranca = 0;
  let pulouQuemAgiu = false;
  while (seguranca < 40) {
    seguranca++;
    if (combateAcabou(c, fichas)) break;
    const atual = vezAtual(c);
    if (!atual) break;
    const chaveTick = `${c.rodada}:${c.vez}`;
    const primeiraVezAqui = c.ultimoTick !== chaveTick;

    if (atual.tipo === "pj") {
      const f = Object.values(fichas).find((ff) => ff.uid === atual.id);
      if (!f || f.pv <= 0) { _avancar(c); continue; }
      // Quem acabou de agir passa a vez uma única vez; se a ordem voltar a ele, é a nova vez dele.
      if (atual.id === uidAtual && !pulouQuemAgiu) { pulouQuemAgiu = true; c.ultimoTick = chaveTick; _avancar(c); continue; }
      if (primeiraVezAqui) {
        c.ultimoTick = chaveTick;
        const r = processarInicioDaVez(f, f.nome, rng);
        r.linhas.forEach(registrar);
        if (f.pv <= 0) { registrar({ texto: `${f.nome} cai.`, ok: false, evento: "caido" }); _avancar(c); continue; }
        if (r.perdeVez) { _avancar(c); continue; }
      }
      break; // é a vez deste jogador
    }

    // Vez de um inimigo
    const inimigo = c.inimigos.find((i) => i.id === atual.id);
    if (!inimigoAtivo(inimigo)) { _avancar(c); continue; }
    c.ultimoTick = chaveTick;
    const ini = processarInicioDaVez(inimigo, inimigo.nome, rng);
    ini.linhas.forEach(registrar);
    if (inimigo.pv <= 0) { registrar({ texto: `${inimigo.nome} cai.`, ok: true, evento: "inimigo_caido" }); _avancar(c); continue; }
    if (ini.perdeVez) { _avancar(c); continue; }
    if (inimigo.comportamento === "covarde" && inimigo.pv <= Math.ceil(inimigo.pvMax * 0.25) && !inimigo.chefe) {
      inimigo.fugiu = true;
      registrar({ texto: `${inimigo.nome} foge do combate.`, ok: true, evento: "fuga", selo: "FUGIU" });
      _avancar(c);
      continue;
    }
    const alvos = Object.values(fichas).filter((f) => f.pv > 0);
    const alvo = escolherAlvo(inimigo, alvos, rng);
    if (!alvo) break;
    const nat = d(20, rng);
    const total = nat + inimigo.ataque;
    const caBase = caEfetiva(alvo);
    const acertou = nat === 20 || (nat !== 1 && total >= caBase);
    let linha;
    if (acertou) {
      const critico = nat === 20;
      let dano = rolar(inimigo.dano, critico, rng).total;
      const resist = efeitos(alvo).resistencias.includes(inimigo.elemento) ? 0.5 : 1;
      dano = Math.max(1, Math.floor(dano * resist));
      alvo.pv = Math.max(0, alvo.pv - dano);
      let extra = "";
      if (alvo.pv <= 0 && (alvo.talentos || []).includes("ultimo_suspiro") && !c.suspiro[alvo.uid]) {
        c.suspiro[alvo.uid] = true;
        alvo.pv = 1;
        extra = ` ${alvo.nome} resiste com 1 PV (Último Suspiro).`;
      }
      linha = { texto: `${inimigo.nome} ataca ${alvo.nome}: ${nat} ${comSinal(inimigo.ataque)} = ${total} vs CA ${caBase} → ${critico ? "CRÍTICO, " : ""}acertou, ${dano} de dano${resist < 1 ? " (resistiu)" : ""}.${extra}`, ok: false, evento: critico ? "critico_inimigo" : "acerto_inimigo", selo: critico ? "CRÍTICO" : (resist < 1 ? "RESISTIU" : null) };
      registrar(linha);
      if ((alvo.talentos || []).includes("pele_de_espinhos")) {
        const v = rolar("1d4", false, rng).total;
        inimigo.pv = Math.max(0, inimigo.pv - v);
        registrar({ texto: `${inimigo.nome} se fere em ${alvo.nome}: ${v} de dano.`, ok: true, evento: "acerto" });
      }
      if (inimigo.aplica && alvo.pv > 0 && rng() < inimigo.aplica.chance) {
        aplicarStatus(alvo, inimigo.aplica.status, inimigo.aplica.turnos);
        registrar({ texto: `${alvo.nome} fica ${STATUS[inimigo.aplica.status].nome.toLowerCase()} por ${inimigo.aplica.turnos} turnos.`, ok: false, evento: "status", selo: STATUS[inimigo.aplica.status].nome.toUpperCase() });
      }
      if (alvo.pv <= 0) registrar({ texto: `${alvo.nome} cai.`, ok: false, evento: "caido" });
    } else {
      const protegido = temStatus(alvo, "protegido") && total >= caBase - 2;
      linha = { texto: `${inimigo.nome} ataca ${alvo.nome}: ${nat} ${comSinal(inimigo.ataque)} = ${total} vs CA ${caBase} → ${protegido ? "bloqueado" : "errou"}.`, ok: true, evento: protegido ? "bloqueio" : "esquiva", selo: protegido ? "BLOQUEOU" : "ESQUIVA" };
      registrar(linha);
    }
    _avancar(c);
  }
  c.inicioVez = Date.now();
  return ocorrido;
}

/** Catálogo enviado ao app para montar as telas de escolha. */
function catalogo() {
  return {
    elementos: NOME_ELEMENTO,
    status: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, { nome: v.nome, descricao: v.descricao }])),
    talentos: TALENTOS,
    subclasses: Object.fromEntries(Object.entries(SUBCLASSES).map(([c, subs]) => [c, Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, { nome: v.nome, descricao: v.descricao }]))])),
    raridades: NOME_RARIDADE,
    climas: NOME_CLIMA,
    periodos: NOME_PERIODO,
    xp: XP,
  };
}

module.exports = {
  ATRIBUTOS, NOME_ATRIBUTO, PERICIAS, RACAS, CLASSES, SEXOS, DADO_DE_VIDA,
  ELEMENTOS, NOME_ELEMENTO, STATUS, TALENTOS, SUBCLASSES, RARIDADES, NOME_RARIDADE,
  CLIMAS, PERIODOS, NOME_CLIMA, NOME_PERIODO, XP,
  mod, sinal, comSinal, d, rolar, bonusPericia, chanceSucesso, normalizarFicha, mesclarFichaEditada,
  pendencias, efeitos, caEfetiva, ganharXp, xpParaProximo, calcularPvMax, bonusProficiencia,
  criarInimigo, inimigoAtivo, iniciarCombate, vezAtual, combateAcabou, resultadoCombate,
  multiplicadorElemento, montarRolagem, resolverRolagem, passarVez, processarInicioDaVez, escolherAlvo,
  aplicarStatus, temStatus, normalizarStatus, normalizarItem, gerarItem, gerarSaque, catalogo,
  inicio: (f) => d(20) + mod(f.atributos.des),
};
