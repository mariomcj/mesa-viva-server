/**
 * Motor de regras do Mesa Viva — d20 simplificado, inspirado no SRD 5.1 (CC-BY-4.0).
 * Portado de TypeScript para JavaScript.
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

function _ataquesPorClasse(classe, fornecidos) {
  // "alcance" (corpo|distancia) é opcional: sem ele, vale a regra das palavras do nome (mapa.alcanceDoAtaque)
  const validos = fornecidos.map((a) => ({ nome: safeStr(a.nome, "", 30), bonus: Math.max(-5, Math.min(15, Number(a.bonus) || 0)), dano: String(a.dano || "1d4"),
    ...(a.alcance === "corpo" || a.alcance === "distancia" ? { alcance: a.alcance } : {}) })).slice(0, 6);
  if (validos.length > 0) return validos;
  const PADRAO = {
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
  return (PADRAO[classe] || PADRAO.Guerreiro).slice(0, 6);
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

/**
 * Gera ficha a partir do JSON da IA + conceito.
 */
function normalizarFicha(dados, uid, conceito) {
  const v = dados || {};
  const at = {};
  for (const a of ATRIBUTOS) at[a] = Math.max(3, Math.min(20, Number(v.atributos?.[a]) || 10));
  // Enforce sum ≤ 72 — scale down progressively from highest attributes
  const MAX_SOMA = 72;
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
  const lvl = Math.max(1, Math.min(20, Math.floor(Number(v.nivel)) || 1));
  const dv = DADO_DE_VIDA[classe] || 8;
  const pvMax = dv + mod(at.con) + (lvl - 1) * (Math.floor(dv / 2) + 1 + mod(at.con));
  const pvMaxFinal = Math.max(1, pvMax);
  // PV guardado vale, inclusive 0 (personagem caído). Só uma ficha nova, sem PV, começa com a vida cheia.
  const pvGuardado = v.pv === undefined || v.pv === null || v.pv === "" ? NaN : Number(v.pv);
  const pv = Number.isFinite(pvGuardado) ? Math.max(0, Math.min(Math.round(pvGuardado), pvMaxFinal)) : pvMaxFinal;
  return {
    uid,
    xp: Math.max(0, Math.floor(Number(v.xp)) || 0),
    nome: safeStr(v.nome, "Herói", 30),
    sexo: SEXOS.includes(v.sexo) ? v.sexo : "Masculino",
    raca: RACAS.includes(v.raca) ? v.raca : "Humano",
    classe,
    antecedente: safeStr(v.antecedente, "", 30),
    nivel: lvl,
    proficiencia: Math.ceil(1 + lvl / 4),
    atributos: at,
    pvMax: pvMaxFinal,
    pv,
    ca: Math.max(10, Number(v.ca) || 10),
    imagem: safeStr(v.imagem, "", 500),
    pericias: (Array.isArray(v.pericias) ? v.pericias : []).filter((p) => PERICIAS[p]).slice(0, Math.max(1, 2 + mod(at.int))),
    ataques: _ataquesPorClasse(classe, Array.isArray(v.ataques) ? v.ataques : []),
    magias: (Array.isArray(v.magias) ? v.magias : []).map((m) => ({ nome: safeStr(m.nome, "", 30), descricao: safeStr(m.descricao, "", 300) })).slice(0, 10),
    equipamento: (Array.isArray(v.equipamento) ? v.equipamento : []).map((s) => safeStr(s, "", 50)).slice(0, 12),
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
};