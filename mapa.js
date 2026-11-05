/**
 * Mapa de batalha visto de cima — lógica pura de grade (sem servidor, sem banco).
 *
 * Grade de `colunas` × `linhas` casas (1 casa = 1,5 m). x: 0..colunas-1 (esquerda→direita),
 * y: 0..linhas-1 (cima→baixo). Rótulo legível: letra da coluna + linha a partir de 1 (x=2,y=3 → "C4").
 * Distância de Chebyshev (diagonal custa 1). Terreno em retângulos {tipo, x, y, l, a, nome}.
 *
 * As mesmas regras valem no app (contrato do mapa, seções 1 e 2).
 */
"use strict";

const COLUNAS_PADRAO = 10;
const LINHAS_PADRAO = 14;
const LIMITE_COLUNAS = [8, 12];
const LIMITE_LINHAS = [10, 16];
const MAX_TERRENO = 0.35;                  // fração máxima da grade coberta por terreno
const MAX_PECAS = 20;
const DESLOCAMENTO = 6;                    // casas por turno
const DESLOCAMENTO_CURTO = 5;              // Anão e Halfling
const PASSOS_INIMIGO = 6;
const ALCANCE_DISTANCIA = 12;
const LETRAS = "ABCDEFGHIJKLMNOP";

const TIPOS = ["obstaculo", "cobertura", "dificil", "agua", "abismo"];
const NOME_TIPO = { obstaculo: "obstáculo", cobertura: "cobertura", dificil: "terreno difícil", agua: "água", abismo: "abismo" };
const NOME_PADRAO = { obstaculo: "Obstáculo", cobertura: "Cobertura", dificil: "Terreno difícil", agua: "Água", abismo: "Abismo" };
// Quando dois retângulos se sobrepõem, vale o tipo mais forte
const PRIORIDADE = { abismo: 5, obstaculo: 4, cobertura: 3, agua: 2, dificil: 1 };

const PALAVRAS_DISTANCIA = ["arco", "besta", "funda", "dardo", "arremess", "pistola", "revolver", "rifle", "espingarda", "blaster", "laser",
  "disparo", "tiro", "raio", "missil", "misseis", "bola de fogo", "centelha", "luz sagrada", "chama sagrada", "magia", "feitico", "encanto", "rajada"];

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const inteiro = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN) : NaN);
const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
const chave = (x, y) => `${x},${y}`;
const deChave = (k) => { const [x, y] = k.split(",").map(Number); return { x, y }; };
const nomeCurto = (v, max) => (typeof v === "string" || typeof v === "number" ? String(v) : "")
  .replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// ── Básico ──

function letra(x) { return LETRAS[x] || "?"; }
/** Rótulo legível de uma casa: rotulo(2, 3) ou rotulo({x:2, y:3}) → "C4". */
function rotulo(x, y) { if (typeof x === "object" && x) return rotulo(x.x, x.y); return `${letra(x)}${y + 1}`; }
/** Distância de Chebyshev: max(|dx|, |dy|). */
function distancia(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function dentro(mapa, x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < mapa.colunas && y < mapa.linhas; }
function casas(n) { return `${n} ${n === 1 ? "casa" : "casas"}`; }

/** Deslocamento por turno da ficha: 6 casas; Anão e Halfling, 5. */
function deslocamentoBase(ficha) {
  return ["anao", "halfling"].includes(semAcento(ficha?.raca)) ? DESLOCAMENTO_CURTO : DESLOCAMENTO;
}

/**
 * Alcance de um ataque ("corpo" | "distancia"): o campo `alcance` se existir; senão, palavras do nome.
 * Aceita o nome (string) ou o objeto do ataque.
 */
function alcanceDoAtaque(ataque) {
  if (ataque && typeof ataque === "object") {
    if (ataque.alcance === "corpo" || ataque.alcance === "distancia") return ataque.alcance;
    return alcanceDoAtaque(ataque.nome);
  }
  const n = semAcento(ataque);
  return PALAVRAS_DISTANCIA.some((p) => n.includes(p)) ? "distancia" : "corpo";
}

// ── Terreno ──

const _celulas = new WeakMap();
/** Tipo de terreno de cada casa (array linhas×colunas, null = livre). Guardado em cache por objeto de mapa. */
function celulas(mapa) {
  const assinatura = JSON.stringify([mapa.colunas, mapa.linhas, mapa.terreno]);
  const c = _celulas.get(mapa);
  if (c && c.assinatura === assinatura) return c.grade;
  const grade = new Array(mapa.colunas * mapa.linhas).fill(null);
  for (const t of mapa.terreno || []) {
    for (let y = t.y; y < t.y + t.a; y++) for (let x = t.x; x < t.x + t.l; x++) {
      if (!dentro(mapa, x, y)) continue;
      const i = y * mapa.colunas + x;
      if (!grade[i] || PRIORIDADE[t.tipo] > PRIORIDADE[grade[i]]) grade[i] = t.tipo;
    }
  }
  _celulas.set(mapa, { assinatura, grade });
  return grade;
}
function tipoEm(mapa, x, y) { return dentro(mapa, x, y) ? celulas(mapa)[y * mapa.colunas + x] : "abismo"; }
function bloqueia(tipo) { return tipo === "obstaculo" || tipo === "abismo"; }
/** Custo para ENTRAR numa casa: 1; difícil, água e cobertura 2; bloqueada = Infinity. */
function custoEntrar(tipo) { return bloqueia(tipo) ? Infinity : tipo === "dificil" || tipo === "agua" || tipo === "cobertura" ? 2 : 1; }
function passavel(mapa, x, y) { return dentro(mapa, x, y) && !bloqueia(tipoEm(mapa, x, y)); }
/** O retângulo de terreno (de maior prioridade) que cobre a casa, ou null. */
function pecaEm(mapa, x, y) {
  const tipo = tipoEm(mapa, x, y);
  if (!tipo || !dentro(mapa, x, y)) return null;
  return (mapa.terreno || []).find((t) => t.tipo === tipo && x >= t.x && x < t.x + t.l && y >= t.y && y < t.y + t.a) || null;
}

/** Casas cruzadas pela linha reta entre os centros de a e b (sem contar as pontas; tocar só um canto não conta). */
function casasNaLinha(mapa, a, b) {
  const x0 = a.x + 0.5, y0 = a.y + 0.5, dx = b.x - a.x, dy = b.y - a.y;
  const eps = 1e-6;
  const lista = [];
  for (let cy = Math.min(a.y, b.y); cy <= Math.max(a.y, b.y); cy++) {
    for (let cx = Math.min(a.x, b.x); cx <= Math.max(a.x, b.x); cx++) {
      if ((cx === a.x && cy === a.y) || (cx === b.x && cy === b.y)) continue;
      // Liang–Barsky: o segmento cruza o interior do quadrado (encolhido em eps)?
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q] of [[-dx, x0 - (cx + eps)], [dx, cx + 1 - eps - x0], [-dy, y0 - (cy + eps)], [dy, cy + 1 - eps - y0]]) {
        if (p === 0) { if (q < 0) { ok = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
      if (ok && t0 < t1) lista.push({ x: cx, y: cy });
    }
  }
  return lista;
}
/** Linha de visão: a linha entre os centros não cruza `obstaculo`. */
function linhaDeVisao(mapa, a, b) {
  return !casasNaLinha(mapa, a, b).some((c) => tipoEm(mapa, c.x, c.y) === "obstaculo");
}
/** O alvo tem cobertura contra um ataque à distância vindo de `de`: está NA cobertura ou logo atrás dela. */
function temCobertura(mapa, de, alvo) {
  if (tipoEm(mapa, alvo.x, alvo.y) === "cobertura") return true;
  return casasNaLinha(mapa, de, alvo).some((c) => tipoEm(mapa, c.x, c.y) === "cobertura" && distancia(c, alvo) === 1 && distancia(c, de) > 0);
}

// ── Caminhos (BFS com custos) ──

const VIZINHOS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/**
 * Quem ocupa o mapa: [{id, x, y, lado: "pj"|"ini"}]. Personagens com posição (mesmo caídos) e inimigos vivos.
 */
function ocupantes(c) {
  const vivos = new Set((c.inimigos || []).filter((i) => i.pv > 0).map((i) => i.id));
  const todosIni = new Set((c.inimigos || []).map((i) => i.id));
  const lista = [];
  for (const [id, p] of Object.entries(c.posicoes || {})) {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y)) continue;
    if (todosIni.has(id)) { if (vivos.has(id)) lista.push({ id, x: p.x, y: p.y, lado: "ini" }); }
    else lista.push({ id, x: p.x, y: p.y, lado: "pj" });
  }
  return lista;
}

/** Para quem se move: casas de adversários (não atravessa) e casas ocupadas por qualquer outro (não para). */
function restricoes(ocup, quemId) {
  const eu = ocup.find((o) => o.id === quemId);
  const lado = eu?.lado || (String(quemId).startsWith("ini_") ? "ini" : "pj");
  const adversarias = new Set(), ocupadas = new Set();
  for (const o of ocup) {
    if (o.id === quemId) continue;
    ocupadas.add(chave(o.x, o.y));
    if (o.lado !== lado) adversarias.add(chave(o.x, o.y));
  }
  return { adversarias, ocupadas };
}

/**
 * Menor custo da `origem` até cada casa (Dijkstra; custos 1 ou 2). Não entra em casa bloqueada nem de adversário;
 * atravessa aliados. Devolve { custo: Map<chave, n>, anterior: Map<chave, chave>, ocupadas }.
 */
function explorar(mapa, origem, { adversarias = new Set(), ocupadas = new Set(), limite = Infinity } = {}) {
  const custo = new Map([[chave(origem.x, origem.y), 0]]);
  const anterior = new Map();
  const baldes = [[chave(origem.x, origem.y)]];
  for (let d = 0; d < baldes.length; d++) {
    for (const k of baldes[d] || []) {
      if (custo.get(k) !== d) continue;
      const { x, y } = deChave(k);
      for (const [vx, vy] of VIZINHOS) {
        const nx = x + vx, ny = y + vy;
        if (!dentro(mapa, nx, ny)) continue;
        const nk = chave(nx, ny);
        if (adversarias.has(nk)) continue;
        const c = d + custoEntrar(tipoEm(mapa, nx, ny));
        if (!Number.isFinite(c) || c > limite) continue;
        if (custo.has(nk) && custo.get(nk) <= c) continue;
        custo.set(nk, c);
        anterior.set(nk, k);
        (baldes[c] ||= []).push(nk);
      }
    }
  }
  return { custo, anterior, ocupadas, origem: chave(origem.x, origem.y) };
}
/** Pode terminar o movimento nesta casa (a própria origem sempre pode). */
function podeParar(res, k) { return k === res.origem || !res.ocupadas.has(k); }
/** Caminho da origem até a casa `k` (lista de {x, y}, começando na origem). */
function caminho(res, k) {
  if (!res.custo.has(k)) return null;
  const lista = [];
  for (let c = k; c; c = res.anterior.get(c)) lista.unshift(deChave(c));
  return lista;
}

/** Casas onde quem está em `origem` pode terminar o movimento gastando até `limite`: [{x, y, custo}]. */
function alcancaveis(mapa, ocup, quemId, origem, limite) {
  const res = explorar(mapa, origem, { ...restricoes(ocup, quemId), limite });
  return [...res.custo].filter(([k]) => podeParar(res, k)).map(([k, custo]) => ({ ...deChave(k), custo }));
}

/**
 * Pedido de movimento de `quemId` até `destino` com `restante` casas. Devolve
 * { ok: true, custo, caminho } ou { ok: false, motivo: "fora"|"bloqueada"|"ocupada"|"sem-caminho"|"longe", custo? }.
 */
function planejarMovimento(mapa, ocup, quemId, origem, destino, restante) {
  if (!dentro(mapa, destino.x, destino.y)) return { ok: false, motivo: "fora" };
  if (origem.x === destino.x && origem.y === destino.y) return { ok: true, custo: 0, caminho: [origem] };
  if (bloqueia(tipoEm(mapa, destino.x, destino.y))) return { ok: false, motivo: "bloqueada" };
  const r = restricoes(ocup, quemId);
  if (r.ocupadas.has(chave(destino.x, destino.y))) return { ok: false, motivo: "ocupada" };
  const res = explorar(mapa, origem, r);
  const k = chave(destino.x, destino.y);
  if (!res.custo.has(k)) return { ok: false, motivo: "sem-caminho" };
  const custo = res.custo.get(k);
  if (custo > restante) return { ok: false, motivo: "longe", custo };
  return { ok: true, custo, caminho: caminho(res, k) };
}

/**
 * Melhor casa livre AO LADO de `alvo` que quem está em `origem` alcança com até `limite`.
 * Devolve { destino, custo, caminho } ou null. Se já está ao lado, custo 0.
 */
function aproximar(mapa, ocup, quemId, origem, alvo, limite = Infinity) {
  if (distancia(origem, alvo) === 1) return { destino: { ...origem }, custo: 0, caminho: [origem] };
  const res = explorar(mapa, origem, { ...restricoes(ocup, quemId), limite });
  let melhor = null;
  for (const [vx, vy] of VIZINHOS) {
    const x = alvo.x + vx, y = alvo.y + vy, k = chave(x, y);
    if (!res.custo.has(k) || !podeParar(res, k)) continue;
    const c = res.custo.get(k);
    if (!melhor || c < melhor.custo || (c === melhor.custo && distancia({ x, y }, origem) < distancia(melhor.destino, origem))) melhor = { destino: { x, y }, custo: c, k };
  }
  return melhor ? { destino: melhor.destino, custo: melhor.custo, caminho: caminho(res, melhor.k) } : null;
}

// ── Validação e correção do mapa da IA ──

const TIPO_POR_PALAVRA = { obstaculo: "obstaculo", parede: "obstaculo", cobertura: "cobertura", dificil: "dificil", "terreno dificil": "dificil", agua: "agua", abismo: "abismo" };

/** Limpa o retângulo de terreno; devolve null se não serve. */
function normalizarPeca(t, colunas, linhas) {
  if (!t || typeof t !== "object") return null;
  const tipo = TIPO_POR_PALAVRA[semAcento(t.tipo)];
  if (!tipo) return null;
  let x = inteiro(t.x), y = inteiro(t.y), l = inteiro(t.l ?? 1), a = inteiro(t.a ?? 1);
  if (![x, y, l, a].every(Number.isFinite) || l < 1 || a < 1) return null;
  // corta o que sai da grade
  if (x < 0) { l += x; x = 0; }
  if (y < 0) { a += y; y = 0; }
  l = Math.min(l, colunas - x);
  a = Math.min(a, linhas - y);
  if (l < 1 || a < 1 || x >= colunas || y >= linhas) return null;
  return { tipo, x, y, l, a, nome: nomeCurto(t.nome, 40) || NOME_PADRAO[tipo] };
}

/**
 * Confere e corrige o mapa vindo da IA: limites da grade, tipos, retângulos dentro, no máximo 35% coberto.
 * Devolve null se não veio mapa (use mapaPadrao). Não trata isolamento (ver prepararCombate).
 */
function normalizarMapa(bruto, { cena = "" } = {}) {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const col = inteiro(bruto.colunas), lin = inteiro(bruto.linhas);
  const colunas = Number.isFinite(col) ? limitar(col, ...LIMITE_COLUNAS) : COLUNAS_PADRAO;
  const linhas = Number.isFinite(lin) ? limitar(lin, ...LIMITE_LINHAS) : LINHAS_PADRAO;
  const mapa = { colunas, linhas, descricao: nomeCurto(bruto.descricao, 200) || nomeCurto(cena, 60) || "Campo de batalha", terreno: [], imagem: "" };
  const maxCasas = Math.floor(colunas * linhas * MAX_TERRENO);
  const cobertas = new Set();
  for (const t of (Array.isArray(bruto.terreno) ? bruto.terreno : []).slice(0, MAX_PECAS * 2)) {
    if (mapa.terreno.length >= MAX_PECAS) break;
    const p = normalizarPeca(t, colunas, linhas);
    if (!p) continue;
    const novas = [];
    for (let y = p.y; y < p.y + p.a; y++) for (let x = p.x; x < p.x + p.l; x++) if (!cobertas.has(chave(x, y))) novas.push(chave(x, y));
    if (cobertas.size + novas.length > maxCasas) continue;      // passaria de 35%: fica de fora
    for (const k of novas) cobertas.add(k);
    mapa.terreno.push(p);
  }
  return mapa;
}

/** Gerador pseudoaleatório com semente (para testes e mapas reproduzíveis). */
function rngComSemente(semente) {
  let s = (Number(semente) >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PECAS_PADRAO = [
  { tipo: "obstaculo", nome: "Rocha grande", l: 2, a: 1 },
  { tipo: "obstaculo", nome: "Pilar de pedra", l: 1, a: 1 },
  { tipo: "obstaculo", nome: "Destroços", l: 1, a: 2 },
  { tipo: "cobertura", nome: "Mureta baixa", l: 2, a: 1 },
  { tipo: "cobertura", nome: "Caixotes", l: 1, a: 1 },
  { tipo: "cobertura", nome: "Barricada", l: 2, a: 1 },
];

/** Mapa padrão (quando a IA não manda): campo aberto com 2 a 4 obstáculos/coberturas no meio, longe das bordas de largada. */
function mapaPadrao(cena = "", rng = Math.random) {
  const colunas = COLUNAS_PADRAO, linhas = LINHAS_PADRAO;
  const n = 2 + Math.floor(rng() * 3);
  const terreno = [];
  const usadas = new Set();
  for (let tentativa = 0; terreno.length < n && tentativa < 40; tentativa++) {
    const modelo = PECAS_PADRAO[Math.floor(rng() * PECAS_PADRAO.length)];
    const x = Math.floor(rng() * (colunas - modelo.l + 1));
    const y = 4 + Math.floor(rng() * (linhas - 7 - modelo.a + 1));     // linhas 4..linhas-4: longe das largadas
    const proprias = [];
    for (let yy = y - 1; yy <= y + modelo.a; yy++) for (let xx = x - 1; xx <= x + modelo.l; xx++) proprias.push(chave(xx, yy));
    if (proprias.some((k) => usadas.has(k))) continue;                  // sem encostar uma peça na outra
    for (let yy = y; yy < y + modelo.a; yy++) for (let xx = x; xx < x + modelo.l; xx++) usadas.add(chave(xx, yy));
    terreno.push({ tipo: modelo.tipo, x, y, l: modelo.l, a: modelo.a, nome: modelo.nome });
  }
  const lugar = nomeCurto(cena, 60);
  return { colunas, linhas, descricao: lugar ? `${lugar}: terreno aberto com alguns obstáculos` : "Campo aberto com alguns obstáculos", terreno, imagem: "" };
}

// ── Posições ──

/** Zona de largada: jogadores nas 2 últimas linhas, inimigos nas 3 primeiras. */
function zona(mapa, lado) { return lado === "pj" ? [mapa.linhas - 2, mapa.linhas - 1] : [0, 2]; }

/** Casa livre (passável, não ocupada) mais próxima do centro da zona; se a zona estiver cheia, a mais próxima no mapa todo. */
function casaLivre(mapa, ocupadas, lado) {
  const [y0, y1] = zona(mapa, lado);
  const cx = (mapa.colunas - 1) / 2, cy = (y0 + y1) / 2;
  const candidatas = [];
  for (let y = 0; y < mapa.linhas; y++) for (let x = 0; x < mapa.colunas; x++) {
    if (!passavel(mapa, x, y) || ocupadas.has(chave(x, y))) continue;
    const naZona = y >= y0 && y <= y1 ? 0 : 1;
    candidatas.push({ x, y, naZona, d: (x - cx) ** 2 + (y - cy) ** 2 });
  }
  candidatas.sort((a, b) => a.naZona - b.naZona || a.d - b.d || (lado === "pj" ? b.y - a.y : a.y - b.y) || a.x - b.x);
  return candidatas[0] ? { x: candidatas[0].x, y: candidatas[0].y } : null;
}

/** Posição pedida é usável: inteira, dentro, passável e livre. */
function posicaoValida(mapa, p, ocupadas) {
  if (!p || typeof p !== "object") return null;
  const x = inteiro(p.x), y = inteiro(p.y);
  if (!passavel(mapa, x, y) || ocupadas.has(chave(x, y))) return null;
  return { x, y };
}

/**
 * Coloca os novos participantes sem mexer nos que já têm casa. `novos`: [{id, lado, pedida?: {x, y}}].
 * Altera e devolve `posicoes`.
 */
function posicionarNovos(mapa, posicoes, novos) {
  const ocupadas = new Set(Object.values(posicoes).filter(Boolean).map((p) => chave(p.x, p.y)));
  // primeiro os que pediram uma casa válida, depois os automáticos (assim um pedido não é tomado por um automático)
  const automaticos = [];
  for (const n of novos) {
    if (posicoes[n.id]) continue;
    const p = posicaoValida(mapa, n.pedida, ocupadas);
    if (p) { posicoes[n.id] = p; ocupadas.add(chave(p.x, p.y)); } else automaticos.push(n);
  }
  for (const n of automaticos) {
    const p = casaLivre(mapa, ocupadas, n.lado);
    if (p) { posicoes[n.id] = p; ocupadas.add(chave(p.x, p.y)); }
  }
  return posicoes;
}

/** Todas as posições estão na mesma região ligada (ignorando quem ocupa)? */
function conectado(mapa, posicoes) {
  const lista = Object.values(posicoes).filter(Boolean);
  if (lista.length < 2) return true;
  const res = explorar(mapa, lista[0]);
  return lista.every((p) => res.custo.has(chave(p.x, p.y)));
}

/**
 * Tira peças que bloqueiam até ninguém ficar isolado, mexendo o mínimo: primeiro procura uma peça que,
 * sozinha, resolve (da última para a primeira); senão tira a que mais abre caminho e repete. Altera o mapa.
 */
function garantirConexao(mapa, posicoes) {
  let tiradas = 0;
  const lista = Object.values(posicoes).filter(Boolean);
  const alcancados = () => { const res = explorar(mapa, lista[0]); return lista.filter((p) => res.custo.has(chave(p.x, p.y))).length * 1000 + res.custo.size; };
  while (!conectado(mapa, posicoes)) {
    const bloqueadoras = mapa.terreno.map((t, i) => (bloqueia(t.tipo) ? i : -1)).filter((i) => i >= 0).reverse();
    if (!bloqueadoras.length) break;
    let escolhida = -1, melhor = -1;
    for (const i of bloqueadoras) {
      const [peca] = mapa.terreno.splice(i, 1);
      const ok = conectado(mapa, posicoes), nota = ok ? Infinity : alcancados();
      mapa.terreno.splice(i, 0, peca);
      if (nota > melhor) { melhor = nota; escolhida = i; }
      if (ok) break;
    }
    mapa.terreno.splice(escolhida, 1);
    tiradas++;
  }
  return tiradas;
}

/**
 * Monta mapa e posições de um combate novo a partir do que a IA mandou (`bruto` = r.combate).
 * `c`: combate de regras.iniciarCombate (ordem + inimigos ini_0..). `inimigosIA`: a lista da IA na mesma ordem dos ids.
 * Altera `c` (mapa, posicoes) e devolve `c`.
 */
function prepararCombate(c, bruto, { cena = "", rng = Math.random, inimigosIA = [] } = {}) {
  const b = bruto && typeof bruto === "object" ? bruto : {};
  c.mapa = normalizarMapa(b.mapa, { cena }) || mapaPadrao(cena, rng);
  const pedidas = b.posicoes && typeof b.posicoes === "object" && !Array.isArray(b.posicoes) ? b.posicoes : {};
  const novos = [];
  for (const o of c.ordem || []) {
    if (o.tipo === "pj") novos.push({ id: o.id, lado: "pj", pedida: pedidas[o.id] });
  }
  (c.inimigos || []).forEach((ini, i) => {
    const d = inimigosIA[i] || {};
    novos.push({ id: ini.id, lado: "ini", pedida: Number.isFinite(inteiro(d.x)) ? { x: d.x, y: d.y } : pedidas[ini.id] });
  });
  c.posicoes = posicionarNovos(c.mapa, {}, novos);
  garantirConexao(c.mapa, c.posicoes);
  return c;
}

/** Combate com mapa onde falta a posição de alguém da ordem (ex.: dados antigos): coloca automaticamente. */
function completarPosicoes(c) {
  if (!c?.mapa) return c;
  c.posicoes ||= {};
  const ini = new Set((c.inimigos || []).map((i) => i.id));
  const faltam = (c.ordem || []).filter((o) => !c.posicoes[o.id]).map((o) => ({ id: o.id, lado: ini.has(o.id) ? "ini" : "pj" }));
  if (faltam.length) posicionarNovos(c.mapa, c.posicoes, faltam);
  return c;
}

// ── Inimigos ──

/**
 * Decide o turno de um inimigo. `alvos`: personagens conscientes [{id, nome, x, y, pv}].
 * Devolve { destino: {x,y} (igual à origem se não anda), custo, alvoId: id|null, cobertura: bool }.
 * corpo: anda até 6 casas rumo ao personagem mais próximo, para ao lado; só ataca se terminar ao lado.
 * distancia: se não vê ninguém ou está colado em alguém, reposiciona até 6 casas para uma casa com visão; ataca o visível mais próximo.
 */
function turnoInimigo(mapa, ocup, inimigo, origem, alvos, passos = PASSOS_INIMIGO) {
  const parado = { destino: { ...origem }, custo: 0, alvoId: null, cobertura: false };
  if (!alvos.length) return parado;
  const r = restricoes(ocup, inimigo.id);
  const res = explorar(mapa, origem, r);
  const menorPv = (lista) => [...lista].sort((a, b) => a.pv - b.pv || distancia(a, origem) - distancia(b, origem))[0];
  const visiveis = (p) => alvos.filter((a) => distancia(a, p) <= ALCANCE_DISTANCIA && linhaDeVisao(mapa, p, a))
    .sort((a, b) => distancia(a, p) - distancia(b, p) || a.pv - b.pv);
  const colado = (p) => alvos.some((a) => distancia(a, p) === 1);
  const pararEm = (k) => ({ ...deChave(k), custo: res.custo.get(k) });

  /** Anda pelo caminho mais curto até `k`, parando na última casa livre alcançável com `passos`. */
  const andarRumo = (k) => {
    const cam = caminho(res, k) || [origem];
    let fim = { ...origem, custo: 0 };
    for (const p of cam) {
      const pk = chave(p.x, p.y), c = res.custo.get(pk);
      if (c > passos) break;
      if (podeParar(res, pk)) fim = { x: p.x, y: p.y, custo: c };
    }
    return fim;
  };
  /** Destino para chegar perto: casa ao lado do alvo mais barata; sem caminho, a casa alcançável mais perto de alguém. */
  const aproximacao = () => {
    let melhor = null;
    for (const a of alvos) for (const [vx, vy] of VIZINHOS) {
      const k = chave(a.x + vx, a.y + vy);
      if (!res.custo.has(k) || !podeParar(res, k)) continue;
      const c = res.custo.get(k);
      if (!melhor || c < melhor.c || (c === melhor.c && a.pv < melhor.a.pv)) melhor = { k, c, a };
    }
    if (melhor) return { fim: andarRumo(melhor.k), alvo: melhor.a };
    let fim = { ...origem, custo: 0 }, dMin = Math.min(...alvos.map((a) => distancia(a, origem)));
    for (const [k, c] of res.custo) {
      if (c > passos || !podeParar(res, k)) continue;
      const p = deChave(k), d = Math.min(...alvos.map((a) => distancia(a, p)));
      if (d < dMin || (d === dMin && c < fim.custo)) { fim = { ...p, custo: c }; dMin = d; }
    }
    return { fim, alvo: null };
  };

  if ((inimigo.alcance || "corpo") !== "distancia") {
    const juntos = alvos.filter((a) => distancia(a, origem) === 1);
    if (juntos.length) return { ...parado, alvoId: menorPv(juntos).id };
    const { fim, alvo } = aproximacao();
    const destino = { x: fim.x, y: fim.y };
    const aoLado = alvos.filter((a) => distancia(a, destino) === 1);
    const atacado = alvo && aoLado.includes(alvo) ? alvo : aoLado.length ? menorPv(aoLado) : null;
    return { destino, custo: fim.custo, alvoId: atacado?.id || null, cobertura: false };
  }

  // à distância
  const ataqueDe = (p) => { const v = visiveis(p)[0]; return v ? { alvoId: v.id, cobertura: temCobertura(mapa, p, v) } : { alvoId: null, cobertura: false }; };
  if (visiveis(origem).length && !colado(origem)) return { ...parado, ...ataqueDe(origem) };
  let melhor = null;
  for (const [k, c] of res.custo) {
    if (c > passos || !podeParar(res, k)) continue;
    const p = deChave(k);
    if (colado(p) || !visiveis(p).length) continue;
    const dPerto = Math.min(...alvos.map((a) => distancia(a, p)));
    if (!melhor || c < melhor.custo || (c === melhor.custo && dPerto > melhor.dPerto)) melhor = { ...p, custo: c, dPerto };
  }
  if (melhor) { const destino = { x: melhor.x, y: melhor.y }; return { destino, custo: melhor.custo, ...ataqueDe(destino) }; }
  if (visiveis(origem).length) return { ...parado, ...ataqueDe(origem) };      // encurralado: atira de onde está
  const { fim } = aproximacao();
  const destino = { x: fim.x, y: fim.y };
  return { destino, custo: fim.custo, ...ataqueDe(destino) };
}

/**
 * Tática dos inimigos para regras.passarVez: move o inimigo no mapa (altera c.posicoes) e diz quem ele ataca.
 * Devolve (inimigo, alvosVivos) => { alvo: ficha|null, linhas: [texto], bonusCA }.
 */
function criarTatica(c) {
  return (inimigo, fichasVivas) => {
    completarPosicoes(c);
    const origem = c.posicoes[inimigo.id];
    const alvos = fichasVivas.filter((f) => c.posicoes[f.uid]).map((f) => ({ id: f.uid, nome: f.nome, pv: f.pv, ...c.posicoes[f.uid] }));
    if (!origem || !alvos.length) return { alvo: null, linhas: [], bonusCA: 0 };
    const plano = turnoInimigo(c.mapa, ocupantes(c), inimigo, origem, alvos);
    const linhas = [];
    const andou = plano.destino.x !== origem.x || plano.destino.y !== origem.y;
    if (andou) {
      c.posicoes[inimigo.id] = { ...plano.destino };
      const aoLado = alvos.filter((a) => distancia(a, plano.destino) === 1);
      const verbo = inimigo.alcance === "distancia" ? "se reposiciona em" : "avança para";
      linhas.push(`${inimigo.nome} ${verbo} ${rotulo(plano.destino)}${aoLado.length ? `, ao lado de ${aoLado.map((a) => a.nome).join(" e ")}` : ""}.`);
    }
    const alvo = plano.alvoId ? fichasVivas.find((f) => f.uid === plano.alvoId) : null;
    if (!alvo && !andou) {
      const perto = alvos.reduce((m, a) => (!m || distancia(a, origem) < distancia(m, origem) ? a : m), null);
      linhas.push(`${inimigo.nome} não encontra caminho até ${perto.nome} e espera em ${rotulo(origem)}.`);
    }
    return { alvo, linhas, bonusCA: alvo && plano.cobertura ? 2 : 0 };
  };
}

// ── Texto ──

function areaDaPeca(t) {
  const a = rotulo(t.x, t.y), b = rotulo(t.x + t.l - 1, t.y + t.a - 1);
  return a === b ? a : `${a}–${b}`;
}

/**
 * Situação no mapa em texto curto, para o contexto do Mestre.
 * `fichas`: [{uid, nome, pv}]. Ex.: "Mapa 10×14: Clareira… Terreno: Pilar caído (D3–E4, obstáculo). Posições: Lia C12; Goblin 1 F3 (a 9 casas de Lia)."
 */
function descreverSituacao(c, fichas = []) {
  const m = c?.mapa;
  if (!m) return "";
  const pos = c.posicoes || {};
  const terreno = (m.terreno || []).map((t) => `${t.nome} (${areaDaPeca(t)}, ${NOME_TIPO[t.tipo]})`).join("; ") || "campo aberto";
  const pjs = fichas.filter((f) => pos[f.uid]).map((f) => ({ nome: f.nome, pv: f.pv, ...pos[f.uid] }));
  const conscientes = pjs.filter((p) => p.pv > 0);
  const partes = pjs.map((p) => `${p.nome} ${rotulo(p)}${p.pv <= 0 ? " (caído)" : ""}`);
  for (const i of (c.inimigos || []).filter((x) => x.pv > 0 && pos[x.id])) {
    const p = pos[i.id];
    const perto = conscientes.reduce((mm, a) => (!mm || distancia(a, p) < distancia(mm, p) ? a : mm), null);
    partes.push(`${i.nome} ${rotulo(p)}${perto ? ` (a ${casas(distancia(perto, p))} de ${perto.nome})` : ""}`);
  }
  return `Mapa ${m.colunas}×${m.linhas} (casas de 1,5 m; colunas ${letra(0)}–${letra(m.colunas - 1)} da esquerda para a direita, linhas 1–${m.linhas} de cima para baixo): ${m.descricao}.
Terreno: ${terreno}.
Posições: ${partes.join("; ") || "(ninguém)"}.`;
}

/** Onde fica uma peça, em inglês, para o prompt da imagem. */
function ondeEmIngles(mapa, t) {
  if (t.l >= mapa.colunas * 0.8) return t.y + t.a / 2 < mapa.linhas / 3 ? "crossing the upper part" : t.y + t.a / 2 > (mapa.linhas * 2) / 3 ? "crossing the lower part" : "crossing the middle";
  if (t.a >= mapa.linhas * 0.8) return t.x + t.l / 2 < mapa.colunas / 3 ? "running down the left side" : t.x + t.l / 2 > (mapa.colunas * 2) / 3 ? "running down the right side" : "running down the middle";
  const cx = (t.x + t.l / 2) / mapa.colunas, cy = (t.y + t.a / 2) / mapa.linhas;
  const v = cy < 1 / 3 ? "upper" : cy > 2 / 3 ? "lower" : "middle";
  const h = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "center";
  if (v === "middle" && h === "center") return "in the center";
  return `near the ${v} ${h}`;
}
const TIPO_EM_INGLES = {
  obstaculo: "solid obstacle", cobertura: "low cover", dificil: "rough difficult ground", agua: "shallow water", abismo: "deep chasm",
};
function terrenoEmIngles(mapa) {
  return (mapa.terreno || []).map((t) => `${TIPO_EM_INGLES[t.tipo]} "${t.nome}" ${ondeEmIngles(mapa, t)}`).join(", ");
}

module.exports = {
  COLUNAS_PADRAO, LINHAS_PADRAO, LIMITE_COLUNAS, LIMITE_LINHAS, MAX_TERRENO, DESLOCAMENTO, DESLOCAMENTO_CURTO, PASSOS_INIMIGO, ALCANCE_DISTANCIA,
  TIPOS, NOME_TIPO,
  letra, rotulo, distancia, dentro, casas, deslocamentoBase, alcanceDoAtaque,
  celulas, tipoEm, bloqueia, custoEntrar, passavel, pecaEm, casasNaLinha, linhaDeVisao, temCobertura,
  ocupantes, restricoes, explorar, podeParar, caminho, alcancaveis, planejarMovimento, aproximar,
  normalizarMapa, mapaPadrao, rngComSemente, casaLivre, posicionarNovos, conectado, garantirConexao, prepararCombate, completarPosicoes,
  turnoInimigo, criarTatica, descreverSituacao, terrenoEmIngles,
};
