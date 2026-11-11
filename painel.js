/**
 * Métricas do painel de administração: GET /api/admin/metricas?dias=30 (de 7 a 180 dias).
 *
 * Só leitura: nenhuma tabela, coluna ou linha é criada aqui. Cada bloco de consulta é independente e tolerante:
 * se uma tabela ou coluna não existir (banco de versão antiga, ou sem a `uso_ia_diario`), o bloco devolve zeros
 * e o resto da resposta sai normalmente.
 *
 * Os dias do diário, das contas e das mesas são agrupados no fuso de Brasília (deslocamento fixo de -180 minutos,
 * configurável por FUSO_MINUTOS). A `uso_ia_diario` já guarda o dia em UTC e é usada como está.
 */
"use strict";

const DIA_MS = 86_400_000;
const DIAS_MIN = 7, DIAS_MAX = 180, DIAS_PADRAO = 30;
const MESAS_MAIS_ATIVAS = 8;
/** Tipos da `uso_ia_diario` que contam fundo reaproveitado (não são chamadas a um modelo). */
const TIPOS_DE_FUNDO = ["fundo-reaproveitado", "fundo-biblioteca"];

const inteiro = (v, min, max, padrao = min) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao; };
const num = (v) => Number(v) || 0;
/** Custo com 6 casas: somas de REAL deixam ruído (0.30000000000000004). */
const dinheiro = (v) => Math.round(num(v) * 1e6) / 1e6;

/** Quantidade de dias pedida, dentro do limite (padrão 30). */
const limitarDias = (v) => (v === undefined || v === null || v === "" ? DIAS_PADRAO : inteiro(v, DIAS_MIN, DIAS_MAX, DIAS_PADRAO));
/** Deslocamento do fuso em minutos (FUSO_MINUTOS no ambiente; padrão -180, Brasília). */
function fusoDoAmbiente() {
  const bruto = process.env.FUSO_MINUTOS;
  return bruto === undefined || String(bruto).trim() === "" ? -180 : inteiro(bruto, -840, 840, -180);
}
/** Dia (AAAA-MM-DD) de um instante em ms, no fuso dado. */
const diaDoFuso = (t, fusoMin = -180) => new Date(num(t) + fusoMin * 60_000).toISOString().slice(0, 10);
/** Instante (ms) em que o dia AAAA-MM-DD começa no fuso dado. */
const inicioDoDia = (dia, fusoMin = -180) => Date.parse(`${dia}T00:00:00Z`) - fusoMin * 60_000;
/** Dia AAAA-MM-DD somado de `n` dias (n pode ser negativo). */
const somarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

const periodoVazio = () => ({ usuariosNovos: 0, mesasNovas: 0, narracoes: 0, acoes: 0, rolagens: 0, chamadasIA: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, imagens: 0, fundosReaproveitados: 0 });
const diaVazio = (dia) => ({ dia, usuariosNovos: 0, mesasNovas: 0, narracoes: 0, acoes: 0, rolagens: 0, jogadoresAtivos: 0, chamadasIA: 0, tokensEntrada: 0, tokensSaida: 0, custo: 0, imagens: 0, fundosReaproveitados: 0 });
const CAMPO_DO_LOG = { narr: "narracoes", acao: "acoes", roll: "rolagens" };

/**
 * Monta a resposta inteira de métricas. Função pura sobre o banco (só SELECT).
 * `o`: { dias, agora (ms), fusoMin, T (temas.js, opcional: sem ele o nome do tema é o próprio id) }.
 */
function calcularMetricas(db, o = {}) {
  const dias = limitarDias(o.dias);
  const agora = Number.isFinite(o.agora) ? o.agora : Date.now();
  const fuso = Number.isFinite(o.fusoMin) ? o.fusoMin : fusoDoAmbiente();
  const T = o.T;

  const ate = diaDoFuso(agora, fuso);
  const desde = somarDias(ate, -(dias - 1));
  const desdeAnterior = somarDias(desde, -dias);
  const inicio = inicioDoDia(desde, fuso), fim = inicio + dias * DIA_MS;           // período: [inicio, fim)
  const inicioAnterior = inicio - dias * DIA_MS;                                  // período anterior: [inicioAnterior, inicio)
  const inicio7d = inicioDoDia(somarDias(ate, -6), fuso);                         // últimos 7 dias, contando hoje

  /** Uma consulta que falha (tabela ou coluna que não existe) vira o valor padrão; o resto da resposta segue. */
  const tentar = (nome, f, padrao) => {
    try { return f(); } catch (e) { if (o.avisar !== false) console.error(`[painel] ${nome}: ${e.message}`); return padrao; }
  };
  const contar = (sql, ...p) => num(db.prepare(sql).get(...p)?.n);
  /** Dia no fuso, calculado no SQLite a partir de uma coluna em ms. */
  const diaSql = (coluna) => `strftime('%Y-%m-%d', (${coluna} + ${fuso * 60_000}) / 1000, 'unixepoch')`;

  const serie = [];
  for (let i = 0; i < dias; i++) serie.push(diaVazio(somarDias(desde, i)));
  const porDia = new Map(serie.map((s) => [s.dia, s]));
  const periodo = periodoVazio(), anterior = periodoVazio();
  /** Soma `n` no campo do dia (se o dia é do período) e no total do período certo. */
  const somar = (dia, campo, n, noPeriodo) => {
    const alvo = noPeriodo ? periodo : anterior;
    alvo[campo] += n;
    if (noPeriodo && porDia.has(dia)) porDia.get(dia)[campo] += n;
  };

  // ── Totais de sempre ──
  const totais = { usuarios: 0, mesas: 0, mesasEmJogo: 0, mesasNoSaguao: 0, aventurasConcluidas: 0, fichas: 0,
    narracoes: 0, acoes: 0, rolagens: 0, jogadoresAtivos7d: 0, usuariosNovos7d: 0, mesasAtivas7d: 0 };
  totais.usuarios = tentar("total de usuários", () => contar("SELECT COUNT(*) AS n FROM usuarios"), 0);
  totais.mesas = tentar("total de mesas", () => contar("SELECT COUNT(*) AS n FROM mesas"), 0);
  totais.mesasEmJogo = tentar("mesas em jogo", () => contar("SELECT COUNT(*) AS n FROM mesas WHERE fase = 'jogo'"), 0);
  totais.mesasNoSaguao = tentar("mesas no saguão", () => contar("SELECT COUNT(*) AS n FROM mesas WHERE fase = 'lobby'"), 0);
  totais.aventurasConcluidas = tentar("aventuras concluídas", () => contar("SELECT COUNT(*) AS n FROM mesas WHERE arcoConcluido = 1"), 0);
  totais.fichas = tentar("total de fichas", () => contar("SELECT COUNT(*) AS n FROM fichas"), 0);
  tentar("totais do diário", () => {
    for (const l of db.prepare("SELECT tipo, COUNT(*) AS n FROM log WHERE tipo IN ('narr', 'acao', 'roll') GROUP BY tipo").all()) totais[CAMPO_DO_LOG[l.tipo]] = num(l.n);
  });
  totais.usuariosNovos7d = tentar("usuários novos em 7 dias", () => contar("SELECT COUNT(*) AS n FROM usuarios WHERE criadoEm >= ?", inicio7d), 0);
  totais.mesasAtivas7d = tentar("mesas ativas em 7 dias", () => contar("SELECT COUNT(DISTINCT codigo) AS n FROM log WHERE tipo = 'narr' AND t >= ?", inicio7d), 0);
  // quem agiu ou esteve numa mesa nos últimos 7 dias; sem a coluna `ultimaAtividade`, vale só quem agiu
  totais.jogadoresAtivos7d = tentar("jogadores ativos em 7 dias", () => {
    const ativos = new Set();
    for (const l of db.prepare("SELECT DISTINCT autor FROM log WHERE tipo = 'acao' AND t >= ? AND autor IS NOT NULL AND autor <> ''").all(inicio7d)) ativos.add(l.autor);
    tentar("atividade dos membros", () => {
      for (const l of db.prepare("SELECT DISTINCT uid FROM membros WHERE ultimaAtividade >= ?").all(inicio7d)) ativos.add(l.uid);
    });
    return ativos.size;
  }, 0);

  // ── Contas e mesas novas por dia (período e período anterior) ──
  // o apelido é `diaLocal`, e não `dia`: a tabela `mesas` tem uma coluna `dia` (o dia na história) e o GROUP BY agruparia por ela
  tentar("usuários novos por dia", () => {
    const linhas = db.prepare(`SELECT ${diaSql("criadoEm")} AS diaLocal, COUNT(*) AS n FROM usuarios WHERE criadoEm >= ? AND criadoEm < ? GROUP BY diaLocal`).all(inicioAnterior, fim);
    for (const l of linhas) somar(l.diaLocal, "usuariosNovos", num(l.n), l.diaLocal >= desde);
  });
  tentar("mesas novas por dia", () => {
    const linhas = db.prepare(`SELECT ${diaSql("criadaEm")} AS diaLocal, COUNT(*) AS n FROM mesas WHERE criadaEm >= ? AND criadaEm < ? GROUP BY diaLocal`).all(inicioAnterior, fim);
    for (const l of linhas) somar(l.diaLocal, "mesasNovas", num(l.n), l.diaLocal >= desde);
  });

  // ── Diário: narrações, ações e rolagens por dia; jogadores ativos por dia; narrações por hora ──
  tentar("diário por dia", () => {
    const linhas = db.prepare(`SELECT ${diaSql("t")} AS diaLocal, tipo, COUNT(*) AS n FROM log
      WHERE t >= ? AND t < ? AND tipo IN ('narr', 'acao', 'roll') GROUP BY diaLocal, tipo`).all(inicioAnterior, fim);
    for (const l of linhas) somar(l.diaLocal, CAMPO_DO_LOG[l.tipo], num(l.n), l.diaLocal >= desde);
  });
  tentar("jogadores ativos por dia", () => {
    const linhas = db.prepare(`SELECT ${diaSql("t")} AS diaLocal, COUNT(DISTINCT autor) AS n FROM log
      WHERE t >= ? AND t < ? AND tipo = 'acao' AND autor IS NOT NULL AND autor <> '' GROUP BY diaLocal`).all(inicio, fim);
    for (const l of linhas) if (porDia.has(l.diaLocal)) porDia.get(l.diaLocal).jogadoresAtivos = num(l.n);
  });
  const horas = new Array(24).fill(0);
  tentar("narrações por hora", () => {
    const linhas = db.prepare(`SELECT CAST(strftime('%H', (t + ${fuso * 60_000}) / 1000, 'unixepoch') AS INTEGER) AS hora, COUNT(*) AS n FROM log
      WHERE t >= ? AND t < ? AND tipo = 'narr' GROUP BY hora`).all(inicio, fim);
    for (const l of linhas) if (l.hora >= 0 && l.hora < 24) horas[l.hora] = num(l.n);
  });

  // ── Uso da IA (o dia já está em UTC na tabela; se a tabela não existe, fica tudo zerado) ──
  const modelos = [];
  tentar("uso da IA", () => {
    const linhas = db.prepare("SELECT dia, tipo, modelo, chamadas, entrada, saida, custo FROM uso_ia_diario WHERE dia >= ?").all(desdeAnterior);
    const porModelo = new Map();
    for (const l of linhas) {
      const noPeriodo = l.dia >= desde;
      // A tabela guarda o dia em UTC: das 21h à meia-noite de Brasília o uso já cai no "amanhã" de UTC. Esse uso conta no último dia do período.
      const diaUso = l.dia > ate ? ate : l.dia;
      somar(diaUso, "custo", num(l.custo), noPeriodo);          // o custo soma tudo o que foi pago: texto, imagem e qualquer outro tipo
      if (l.tipo === "texto") {
        somar(diaUso, "chamadasIA", num(l.chamadas), noPeriodo);
        somar(diaUso, "tokensEntrada", num(l.entrada), noPeriodo);
        somar(diaUso, "tokensSaida", num(l.saida), noPeriodo);
      } else if (l.tipo === "imagem") somar(diaUso, "imagens", num(l.chamadas), noPeriodo);
      else if (TIPOS_DE_FUNDO.includes(l.tipo)) somar(diaUso, "fundosReaproveitados", num(l.chamadas), noPeriodo);
      if (!noPeriodo || TIPOS_DE_FUNDO.includes(l.tipo)) continue;
      const chave = `${l.modelo}\n${l.tipo}`;
      const m = porModelo.get(chave) || { modelo: String(l.modelo), tipo: String(l.tipo), chamadas: 0, entrada: 0, saida: 0, custo: 0 };
      m.chamadas += num(l.chamadas); m.entrada += num(l.entrada); m.saida += num(l.saida); m.custo += num(l.custo);
      porModelo.set(chave, m);
    }
    modelos.push(...[...porModelo.values()].map((m) => ({ ...m, custo: dinheiro(m.custo) }))
      .sort((a, b) => b.custo - a.custo || b.chamadas - a.chamadas || a.modelo.localeCompare(b.modelo)));
  });
  for (const alvo of [periodo, anterior, ...serie]) alvo.custo = dinheiro(alvo.custo);

  // ── Mesas: temas e idiomas ──
  const nomeDoTema = (id) => tentar("nome do tema", () => T?.temaPorId?.(id)?.nome, "") || String(id || "");
  const idDoTema = (id) => tentar("id do tema", () => T?.temaPorId?.(id)?.id, "") || String(id || "classico");
  const temas = tentar("temas", () => {
    const porTema = new Map();
    for (const l of db.prepare("SELECT tema, COUNT(*) AS n FROM mesas GROUP BY tema").all()) {
      const id = idDoTema(l.tema || "classico");                                  // tema que não existe mais conta como o clássico, como no jogo
      const t = porTema.get(id) || { id, nome: nomeDoTema(id), mesas: 0 };
      t.mesas += num(l.n);
      porTema.set(id, t);
    }
    return [...porTema.values()].sort((a, b) => b.mesas - a.mesas || a.nome.localeCompare(b.nome));
  }, []);
  const idiomas = { pt: 0, en: 0 };
  tentar("idiomas", () => {
    for (const l of db.prepare("SELECT idioma, COUNT(*) AS n FROM mesas GROUP BY idioma").all()) {
      const id = String(l.idioma || "pt");
      idiomas[id] = (idiomas[id] || 0) + num(l.n);
    }
  });

  // ── Personagens: níveis e classes (do JSON de cada ficha) ──
  const niveis = [], classes = [];
  tentar("fichas", () => {
    const porNivel = new Map(), porClasse = new Map();
    for (const l of db.prepare("SELECT dados FROM fichas").iterate()) {
      let f; try { f = JSON.parse(l.dados); } catch { continue; }
      if (!f || typeof f !== "object") continue;
      const nivel = inteiro(f.nivel, 1, 99, 1);
      const classe = (typeof f.classe === "string" && f.classe.trim().slice(0, 40)) || "Sem classe";
      porNivel.set(nivel, (porNivel.get(nivel) || 0) + 1);
      porClasse.set(classe, (porClasse.get(classe) || 0) + 1);
    }
    niveis.push(...[...porNivel].map(([nivel, personagens]) => ({ nivel, personagens })).sort((a, b) => a.nivel - b.nivel));
    classes.push(...[...porClasse].map(([classe, personagens]) => ({ classe, personagens })).sort((a, b) => b.personagens - a.personagens || a.classe.localeCompare(b.classe)));
  });

  // ── Mesas com mais narrações no período ──
  const mesasMaisAtivas = tentar("mesas mais ativas", () => {
    const linhas = db.prepare(`SELECT codigo, COUNT(*) AS n, MAX(t) AS ultima FROM log WHERE t >= ? AND t < ? AND tipo = 'narr'
      GROUP BY codigo ORDER BY n DESC, ultima DESC LIMIT ${MESAS_MAIS_ATIVAS}`).all(inicio, fim);
    return linhas.map((l) => {
      // "SELECT *": em banco antigo a coluna `tema` pode não existir, e a consulta não pode falhar por isso
      const m = tentar("mesa ativa", () => db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(l.codigo), null) || {};
      return {
        codigo: l.codigo,
        cena: m.cena || "",
        tema: nomeDoTema(idDoTema(m.tema || "classico")),
        fase: m.fase || "",
        narracoes: num(l.n),
        jogadores: tentar("jogadores da mesa", () => contar("SELECT COUNT(*) AS n FROM membros WHERE codigo = ?", l.codigo), 0),
        // última linha do diário da mesa, de qualquer tipo (usa o índice por código)
        ultimaAtividade: tentar("última atividade", () => num(db.prepare("SELECT t FROM log WHERE codigo = ? ORDER BY id DESC LIMIT 1").get(l.codigo)?.t), 0) || num(l.ultima),
      };
    });
  }, []);

  return { dias, desde, ate, geradoEm: agora, totais, periodo, anterior, serie, horas, temas, idiomas, niveis, classes, modelos, mesasMaisAtivas };
}

/**
 * Liga o painel ao servidor. `d` traz o que o server.js já tem: { app, db, adminMw, erro, json, T }.
 */
function instalar(d) {
  const { app, db, adminMw, erro, T } = d;
  if (app && adminMw) {
    /** Métricas para os gráficos do painel: totais, série por dia, horas, temas, personagens, modelos e mesas mais ativas. */
    app.get("/api/admin/metricas", adminMw, (req, res) => {
      try { res.json(calcularMetricas(db, { dias: req.query.dias, T })); }
      catch (e) { console.error("[painel] métricas:", e.message); erro(res, 500, "Não foi possível calcular as métricas agora."); }
    });
  }
  return { metricas: (o = {}) => calcularMetricas(db, { T, ...o }) };
}

module.exports = { DIAS_MIN, DIAS_MAX, DIAS_PADRAO, limitarDias, fusoDoAmbiente, diaDoFuso, inicioDoDia, somarDias, calcularMetricas, instalar };
