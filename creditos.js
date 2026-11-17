/**
 * Créditos da mesa.
 *
 * - Só o líder da mesa (a conta que criou a mesa) gasta créditos. Quem entra na mesa joga de graça.
 * - 1 crédito ≈ 1 hora de mesa no modo Rápido, para o grupo inteiro. Cada chamada à IA desconta
 *   o custo real dela (o "usage.cost" que o provedor devolve) dividido pelo custo que vale 1 crédito
 *   (`creditoUsd`). Quando o provedor não informa o custo, vale uma estimativa fixa por chamada.
 * - Conta nova ganha `creditosIniciais` de boas-vindas.
 * - Enquanto a cobrança estiver desligada (o padrão), nada é bloqueado nem descontado: o uso só é medido.
 * - Pagamento: o app cria um pedido com um código; o jogador paga como as instruções do painel disserem
 *   (Pix, por exemplo) e o admin confirma o pedido no painel. O admin também pode dar créditos sem pedido.
 * - Sem créditos, o Mestre para, menos no meio de uma luta: o combate termina por conta da casa,
 *   até `cortesiaCombate` créditos (renovada a cada crédito que entra).
 *
 * As tabelas têm nomes novos (creditos_*, uso_ia_mesa): bancos de uma versão antiga podem ter
 * "contas_creditos", "compras" e "uso_ia" com outro formato, que ficam como estão.
 */
"use strict";

const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

const DIA_MS = 86_400_000;
const LACUNA_SESSAO_MS = 15 * 60_000;   // mais de 15 min sem chamar a IA: a sessão de jogo acabou
const MINIMO_SESSAO_MS = 3 * 60_000;    // uma sessão conta pelo menos 3 min (a primeira chamada também é jogo)
const GUARDAR_USO_DIAS = 180;
const PEDIDO_VALE_DIAS = 7;
const MAX_PEDIDOS_ABERTOS = 3;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const num = (v, padrao) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? padrao : Number(v));
const limitar = (v, min, max, padrao) => Math.min(max, Math.max(min, num(v, padrao)));
const arred = (v, casas = 3) => { const f = 10 ** casas; return Math.round((Number(v) || 0) * f) / f; };
const curto = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

/** Valores de partida. O .env só vale até alguém salvar a configuração no painel. */
function padrao() {
  return {
    cobrancaAtiva: String(process.env.COBRANCA_ATIVA || "").toLowerCase() === "true",
    creditosIniciais: limitar(process.env.CREDITOS_INICIAIS, 0, 100, 3),
    creditoUsd: limitar(process.env.CREDITO_USD, 0.001, 10, 0.15),
    cortesiaCombate: limitar(process.env.CREDITO_CORTESIA_COMBATE, 0, 5, 0.25),
    instrucoes: "",
    pacotes: [
      { id: "taverna", nome: "Taverna", creditos: 5, preco: 12.9, destaque: false },
      { id: "aventura", nome: "Aventura", creditos: 12, preco: 26.9, destaque: true },
      { id: "campanha", nome: "Campanha", creditos: 30, preco: 59.9, destaque: false },
    ],
  };
}

/** Confere e completa uma configuração (do banco ou do painel). */
function normalizarConfig(entrada, base = padrao()) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const c = { ...base };
  if (typeof e.cobrancaAtiva === "boolean") c.cobrancaAtiva = e.cobrancaAtiva;
  if (e.creditosIniciais !== undefined) c.creditosIniciais = arred(limitar(e.creditosIniciais, 0, 100, base.creditosIniciais), 2);
  if (e.creditoUsd !== undefined) c.creditoUsd = arred(limitar(e.creditoUsd, 0.001, 10, base.creditoUsd), 4);
  if (e.cortesiaCombate !== undefined) c.cortesiaCombate = arred(limitar(e.cortesiaCombate, 0, 5, base.cortesiaCombate), 3);
  if (typeof e.instrucoes === "string") c.instrucoes = curto(e.instrucoes.replace(/\r\n?/g, "\n"), 800);
  if (Array.isArray(e.pacotes)) {
    const vistos = new Set();
    const lista = [];
    for (const p of e.pacotes.slice(0, 6)) {
      if (!p || typeof p !== "object") continue;
      const nome = curto(p.nome, 30);
      const creditos = arred(limitar(p.creditos, 0, 1000, 0), 2);
      const preco = arred(limitar(p.preco, 0, 10000, 0), 2);
      if (!nome || creditos <= 0) continue;
      let id = curto(p.id, 30).toLowerCase().replace(/[^a-z0-9_-]/g, "") || nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "").slice(0, 30) || `p${lista.length + 1}`;
      while (vistos.has(id)) id = `${id}x`;
      vistos.add(id);
      lista.push({ id, nome, creditos, preco, destaque: p.destaque === true });
    }
    if (lista.length) c.pacotes = lista;
  }
  return c;
}

/** Custo estimado (US$) de uma chamada sem custo informado pelo provedor. */
function estimativa(tipo, modelo) {
  if (tipo === "imagem") return 0.04;
  const m = String(modelo || "").toLowerCase();
  const caprichado = (process.env.MODELO_CAPRICHADO && m === String(process.env.MODELO_CAPRICHADO).toLowerCase()) || m.includes("anthropic/") || m.includes("sonnet") || m.includes("opus");
  return caprichado ? 0.02 : 0.0015;
}
const ehCaprichado = (modelo) => estimativa("texto", modelo) > 0.01;

/**
 * Horas de jogo e custo por hora, a partir das chamadas de cada mesa: chamadas com menos de 15 min
 * entre elas são a mesma sessão. Uma sessão é "caprichada" quando usou o modelo Caprichado.
 */
function medirSessoes(linhas) {
  const vazio = () => ({ sessoes: 0, ms: 0, custo: 0, chamadas: 0, imagens: 0 });
  const total = vazio(), modos = { rapido: vazio(), caprichado: vazio() };
  const mesas = new Set();
  let estimado = 0;
  let atual = null;
  const fechar = () => {
    if (!atual) return;
    const ms = Math.max(MINIMO_SESSAO_MS, atual.fim - atual.ini);
    for (const alvo of [total, modos[atual.caprichado ? "caprichado" : "rapido"]]) {
      alvo.sessoes++; alvo.ms += ms; alvo.custo += atual.custo; alvo.chamadas += atual.chamadas; alvo.imagens += atual.imagens;
    }
    atual = null;
  };
  for (const l of linhas) {
    if (!l.codigo) continue;
    if (!atual || atual.codigo !== l.codigo || l.t - atual.fim > LACUNA_SESSAO_MS) {
      fechar();
      atual = { codigo: l.codigo, ini: l.t, fim: l.t, custo: 0, chamadas: 0, imagens: 0, caprichado: false };
    }
    mesas.add(l.codigo);
    atual.fim = l.t;
    atual.custo += Number(l.custo) || 0;
    if (l.tipo === "imagem") atual.imagens++; else { atual.chamadas++; if (ehCaprichado(l.modelo)) atual.caprichado = true; }
    if (l.estimado) estimado += Number(l.custo) || 0;
  }
  fechar();
  const resumo = (x) => {
    const horas = x.ms / 3_600_000;
    return { sessoes: x.sessoes, horas: arred(horas, 2), custo: arred(x.custo, 4), chamadas: x.chamadas, imagens: x.imagens,
      custoHora: horas > 0 ? arred(x.custo / horas, 4) : null, chamadasHora: horas > 0 ? arred(x.chamadas / horas, 1) : null };
  };
  return { ...resumo(total), mesas: mesas.size, parteEstimada: total.custo > 0 ? arred(estimado / total.custo, 3) : 0,
    rapido: resumo(modos.rapido), caprichado: resumo(modos.caprichado) };
}

/** Preço sugerido: custo de 1 crédito × câmbio × margem, mais a taxa do meio de pagamento; pacotes maiores com desconto. */
function sugerirPrecos({ creditoUsd, cambio = 5.5, margem = 3, taxa = 0.01, pacotes = [5, 12, 30], descontos = [0, 0.1, 0.2] } = {}) {
  const porCredito = (Number(creditoUsd) || 0) * cambio * margem / Math.max(0.5, 1 - taxa);
  const redondo = (v) => Math.max(0.9, Math.ceil(v) - 0.1);   // R$ 12,38 → R$ 12,90
  return {
    porCredito: arred(porCredito, 2),
    pacotes: pacotes.map((creditos, i) => ({ creditos, preco: arred(redondo(creditos * porCredito * (1 - (descontos[i] || 0))), 2) })),
  };
}

const MSG = {
  lider: ["Seus créditos acabaram. Adicione mais em Ajustes → Créditos para o Mestre continuar.", "You are out of credits. Add more in Settings → Credits so the Game Master can continue."],
  grupo: ["Os créditos do líder desta mesa acabaram. Assim que o líder adicionar mais, o Mestre continua.", "The table leader is out of credits. As soon as the leader adds more, the Game Master continues."],
  cortesia: ["Os créditos acabaram: este combate termina por conta da casa.", "Credits ran out: this fight is on the house."],
  pouco: ["Resta menos de 1 hora de mesa nos seus créditos.", "Less than 1 hour of play left in your credits."],
};
const msg = (chave, idioma) => MSG[chave][idioma === "en" ? 1 : 0];

// ── Contexto do pedido: diz a quem cobrar cada chamada à IA, mesmo depois de vários `await` ──
const als = new AsyncLocalStorage();
/** Middleware: registrar logo depois do express.json, antes das rotas. */
function contextoMw(req, res, next) { als.run({ req }, next); }

let api = null;   // preenchido por instalar()

function instalar(d) {
  const { app, db, authMw, adminMw, erro, codigoValido, ehMembro, M } = d;

  db.exec(`
    CREATE TABLE IF NOT EXISTS creditos_config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS creditos_saldos (conta TEXT PRIMARY KEY, saldo REAL NOT NULL DEFAULT 0, cortesiaUsada REAL NOT NULL DEFAULT 0, criadoEm INTEGER NOT NULL, atualizadoEm INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS creditos_extrato (id INTEGER PRIMARY KEY AUTOINCREMENT, conta TEXT NOT NULL, t INTEGER NOT NULL, tipo TEXT NOT NULL, quantidade REAL NOT NULL, saldo REAL NOT NULL, descricao TEXT NOT NULL DEFAULT '', ref TEXT);
    CREATE INDEX IF NOT EXISTS idx_creditos_extrato ON creditos_extrato (conta, id);
    CREATE TABLE IF NOT EXISTS creditos_pedidos (id TEXT PRIMARY KEY, conta TEXT NOT NULL, pacote TEXT NOT NULL, nome TEXT NOT NULL, creditos REAL NOT NULL, preco REAL NOT NULL, estado TEXT NOT NULL, criadoEm INTEGER NOT NULL, resolvidoEm INTEGER, obs TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS idx_creditos_pedidos ON creditos_pedidos (conta, criadoEm);
    CREATE TABLE IF NOT EXISTS uso_ia_mesa (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, uid TEXT, conta TEXT, codigo TEXT, tipo TEXT NOT NULL, modelo TEXT,
      entrada INTEGER NOT NULL DEFAULT 0, saida INTEGER NOT NULL DEFAULT 0, custo REAL NOT NULL DEFAULT 0, estimado INTEGER NOT NULL DEFAULT 0, creditos REAL NOT NULL DEFAULT 0, cobrado INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_uso_ia_mesa_t ON uso_ia_mesa (t);
    CREATE INDEX IF NOT EXISTS idx_uso_ia_mesa_conta ON uso_ia_mesa (conta, t);
  `);
  const agora = () => Date.now();

  // ── Configuração ──
  let _config = null;
  function config() {
    if (_config) return _config;
    let salvo = null;
    try { salvo = JSON.parse(db.prepare("SELECT valor FROM creditos_config WHERE chave = 'config'").get()?.valor || "null"); } catch {}
    _config = normalizarConfig(salvo);
    return _config;
  }
  function salvarConfig(mudancas) {
    _config = normalizarConfig(mudancas, config());
    db.prepare("INSERT INTO creditos_config (chave, valor) VALUES ('config', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(_config));
    return _config;
  }

  // ── Contas e saldo ──
  const ehConta = (conta) => !!conta && !!db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(conta);
  const liderDaMesa = (codigo) => db.prepare("SELECT dono FROM mesas WHERE codigo = ?").get(codigo)?.dono || null;
  function emCombate(codigo) {
    const c = db.prepare("SELECT combate FROM mesas WHERE codigo = ?").get(codigo)?.combate;
    return !!c && c !== "null" && c !== "";
  }
  /** Linha do saldo; a primeira vez cria com os créditos de boas-vindas. */
  function garantir(conta) {
    let s = db.prepare("SELECT * FROM creditos_saldos WHERE conta = ?").get(conta);
    if (s) return s;
    const ini = config().creditosIniciais;
    db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO creditos_saldos (conta, saldo, cortesiaUsada, criadoEm, atualizadoEm) VALUES (?, ?, 0, ?, ?)").run(conta, ini, agora(), agora());
      if (ini > 0) db.prepare("INSERT INTO creditos_extrato (conta, t, tipo, quantidade, saldo, descricao) VALUES (?, ?, 'boas-vindas', ?, ?, ?)").run(conta, agora(), ini, ini, "Créditos de boas-vindas");
    })();
    return db.prepare("SELECT * FROM creditos_saldos WHERE conta = ?").get(conta);
  }
  function situacao(conta) {
    const cfg = config();
    const s = garantir(conta);
    const saldo = arred(Math.max(0, s.saldo), 3);
    return { cobrancaAtiva: cfg.cobrancaAtiva, saldo, podeJogar: !cfg.cobrancaAtiva || saldo > 0,
      cortesiaRestante: arred(Math.max(0, cfg.cortesiaCombate - (s.cortesiaUsada || 0)), 3) };
  }
  /** Põe ou tira créditos (quantidade negativa tira) e anota no extrato. */
  function creditar(conta, quantidade, tipo, descricao, ref) {
    const q = arred(Number(quantidade) || 0, 3);
    db.transaction(() => {
      const s = garantir(conta);
      const novo = arred(Math.max(0, s.saldo + q), 3);
      db.prepare("UPDATE creditos_saldos SET saldo = ?, cortesiaUsada = CASE WHEN ? > 0 THEN 0 ELSE cortesiaUsada END, atualizadoEm = ? WHERE conta = ?").run(novo, q, agora(), conta);
      db.prepare("INSERT INTO creditos_extrato (conta, t, tipo, quantidade, saldo, descricao, ref) VALUES (?, ?, ?, ?, ?, ?, ?)").run(conta, agora(), tipo, arred(novo - s.saldo, 3), novo, curto(descricao, 200), ref || null);
    })();
    return situacao(conta);
  }

  /** Mensagem de bloqueio para uma chamada à IA nesta mesa, ou null quando pode. */
  function bloqueio(codigo, uid, idioma) {
    const cfg = config();
    if (!cfg.cobrancaAtiva || !codigo) return null;
    const conta = liderDaMesa(codigo);
    if (!ehConta(conta)) return null;           // mesas do painel e de contas que não existem mais não pagam
    const s = garantir(conta);
    if (s.saldo > 0.0005) return null;
    if (emCombate(codigo) && (s.cortesiaUsada || 0) < cfg.cortesiaCombate) return null;
    return msg(conta === uid ? "lider" : "grupo", idioma);
  }

  /** Mesa do pedido atual, só se quem pede é membro dela (ninguém faz outra mesa pagar). */
  function mesaDoPedido(req) {
    if (!req || !req.uid) return null;
    const bruto = req.params?.codigo || req.body?.codigo || (String(req.path || "").match(/^\/api\/mesa\/([^/]+)/) || [])[1];
    const codigo = codigoValido(bruto);
    return codigo && ehMembro(codigo, req.uid) ? codigo : null;
  }
  const idiomaDo = (req) => (String(req?.get?.("x-idioma") || "").toLowerCase().startsWith("en") ? "en" : "pt");

  /** Para as rotas que chamam a IA (antes de travar a mesa): mensagem de bloqueio ou null. */
  function bloqueioDoPedido(req) {
    const m = bloqueio(mesaDoPedido(req), req.uid, idiomaDo(req));
    const store = als.getStore();
    if (!m && store) store.liberado = true;
    return m;
  }
  /**
   * Para o mestre.js, logo antes de cada chamada à IA. Um pedido que já passou segue até o fim
   * (a narração não para no meio porque a primeira chamada levou o último crédito).
   */
  function bloqueioDoContexto() {
    const store = als.getStore();
    if (!store || store.liberado) return null;
    const m = bloqueio(mesaDoPedido(store.req), store.req?.uid, idiomaDo(store.req));
    if (!m) store.liberado = true;
    return m;
  }

  // ── Medição: cada chamada à IA vira uma linha; com a cobrança ligada, o líder paga ──
  const inserirUso = db.prepare(`INSERT INTO uso_ia_mesa (t, uid, conta, codigo, tipo, modelo, entrada, saida, custo, estimado, creditos, cobrado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  function aoMedir({ tipo, modelo, uso }) {
    if (tipo !== "texto" && tipo !== "imagem") return;     // fundos reaproveitados não custam nada
    const req = als.getStore()?.req;
    const codigo = mesaDoPedido(req);
    const conta = codigo ? liderDaMesa(codigo) : null;
    const informado = Number(uso?.cost);
    const estimado = !(informado > 0);
    const custo = estimado ? estimativa(tipo, modelo) : informado;
    const cfg = config();
    const creditos = arred(custo / cfg.creditoUsd, 5);
    let cobrado = 0;
    if (cfg.cobrancaAtiva && conta && ehConta(conta)) {
      db.transaction(() => {
        const s = garantir(conta);
        if (s.saldo > 0) {
          db.prepare("UPDATE creditos_saldos SET saldo = MAX(0, saldo - ?), atualizadoEm = ? WHERE conta = ?").run(creditos, agora(), conta);
          cobrado = 1;
        } else {
          db.prepare("UPDATE creditos_saldos SET cortesiaUsada = cortesiaUsada + ?, atualizadoEm = ? WHERE conta = ?").run(creditos, agora(), conta);
          cobrado = 2;   // por conta da casa (fim de combate)
        }
      })();
    }
    const n = (v) => Math.max(0, Math.round(Number(v)) || 0);
    inserirUso.run(agora(), req?.uid || null, conta, codigo, tipo, curto(modelo, 80) || null, n(uso?.prompt_tokens), n(uso?.completion_tokens), custo, estimado ? 1 : 0, creditos, cobrado);
  }

  // ── Pedidos de compra ──
  function novoIdPedido() {
    for (;;) {
      const b = crypto.randomBytes(6);
      const id = `MV-${[...b].map((x) => ALFABETO[x % ALFABETO.length]).join("")}`;
      if (!db.prepare("SELECT 1 FROM creditos_pedidos WHERE id = ?").get(id)) return id;
    }
  }
  function expirarPedidos() {
    db.prepare("UPDATE creditos_pedidos SET estado = 'expirado', resolvidoEm = ? WHERE estado = 'aguardando' AND criadoEm < ?").run(agora(), agora() - PEDIDO_VALE_DIAS * DIA_MS);
  }
  const pedidoPublico = (p) => ({ id: p.id, pacote: p.pacote, nome: p.nome, creditos: p.creditos, preco: p.preco, estado: p.estado, criadoEm: p.criadoEm,
    resolvidoEm: p.resolvidoEm || null, expiraEm: p.estado === "aguardando" ? p.criadoEm + PEDIDO_VALE_DIAS * DIA_MS : null });

  function extratoDa(conta, limite = 30) {
    const mov = db.prepare("SELECT t, tipo, quantidade, saldo, descricao, ref FROM creditos_extrato WHERE conta = ? ORDER BY id DESC LIMIT ?").all(conta, limite);
    // o uso vira uma linha por dia e por mesa (uma por chamada seria demais)
    const uso = db.prepare(`SELECT codigo, MIN(t) AS t, SUM(creditos) AS creditos, COUNT(*) AS chamadas FROM uso_ia_mesa
      WHERE conta = ? AND cobrado = 1 AND t >= ? GROUP BY codigo, CAST(t / 86400000 AS INTEGER) ORDER BY t DESC LIMIT ?`).all(conta, agora() - 60 * DIA_MS, limite);
    return [
      ...mov.map((m) => ({ t: m.t, tipo: m.tipo, quantidade: m.quantidade, saldo: m.saldo, descricao: m.descricao })),
      ...uso.map((u) => ({ t: u.t, tipo: "uso", quantidade: -arred(u.creditos, 3), codigo: u.codigo, chamadas: u.chamadas, descricao: `Mesa ${u.codigo}` })),
    ].sort((a, b) => b.t - a.t).slice(0, limite);
  }

  function consumo(dias) {
    const linhas = db.prepare("SELECT t, codigo, tipo, modelo, custo, estimado FROM uso_ia_mesa WHERE t >= ? AND codigo IS NOT NULL ORDER BY codigo, t").all(agora() - dias * DIA_MS);
    const foraDeMesa = db.prepare("SELECT COUNT(*) AS chamadas, COALESCE(SUM(custo), 0) AS custo FROM uso_ia_mesa WHERE t >= ? AND codigo IS NULL").get(agora() - dias * DIA_MS);
    const desde = db.prepare("SELECT MIN(t) AS t FROM uso_ia_mesa").get()?.t || null;
    return { dias, medindoDesde: desde, ...medirSessoes(linhas), foraDeMesa: { chamadas: foraDeMesa.chamadas, custo: arred(foraDeMesa.custo, 4) } };
  }

  function limpar() {
    try {
      db.prepare("DELETE FROM uso_ia_mesa WHERE t < ?").run(agora() - GUARDAR_USO_DIAS * DIA_MS);
      expirarPedidos();
    } catch (e) { console.error("[creditos] limpeza:", e.message); }
  }
  limpar();
  setInterval(limpar, 12 * 3_600_000).unref();

  // ── Ganchos no Mestre ──
  if (M?.acrescentarMedidor) M.acrescentarMedidor((m) => { try { aoMedir(m); } catch (e) { console.error("[creditos] medição:", e.message); } });
  if (M?.definirPorteiro) M.definirPorteiro(() => { try { return bloqueioDoContexto(); } catch (e) { console.error("[creditos] porteiro:", e.message); return null; } });

  // ── Rotas do app ──
  const paraApp = (conta) => {
    expirarPedidos();
    const cfg = config();
    const s = situacao(conta);
    const pedidos = db.prepare("SELECT * FROM creditos_pedidos WHERE conta = ? ORDER BY criadoEm DESC LIMIT 10").all(conta).map(pedidoPublico);
    const mesas = db.prepare(`SELECT u.codigo, SUM(u.creditos) AS creditos, COUNT(*) AS chamadas, MAX(u.t) AS ultima FROM uso_ia_mesa u
      WHERE u.conta = ? AND u.t >= ? AND u.codigo IS NOT NULL GROUP BY u.codigo ORDER BY ultima DESC LIMIT 10`).all(conta, agora() - 30 * DIA_MS)
      .map((m) => ({ codigo: m.codigo, creditos: arred(m.creditos, 3), chamadas: m.chamadas, ultima: m.ultima }));
    return { ...s, creditosIniciais: cfg.creditosIniciais, lojaAberta: !!cfg.instrucoes, instrucoes: cfg.instrucoes,
      pacotes: cfg.pacotes, pedidos, extrato: extratoDa(conta, 30), mesas };
  };
  app.get("/api/conta/creditos", authMw, (req, res) => res.json(paraApp(req.uid)));
  app.post("/api/conta/creditos/pedido", authMw, (req, res) => {
    const cfg = config();
    if (!cfg.instrucoes) return erro(res, 409, "As compras de créditos ainda não estão abertas.");
    const p = cfg.pacotes.find((x) => x.id === String(req.body?.pacote || ""));
    if (!p) return erro(res, 400, "Pacote desconhecido.");
    expirarPedidos();
    const abertos = db.prepare("SELECT COUNT(*) AS n FROM creditos_pedidos WHERE conta = ? AND estado = 'aguardando'").get(req.uid).n;
    if (abertos >= MAX_PEDIDOS_ABERTOS) return erro(res, 429, `Você já tem ${abertos} pedidos esperando pagamento. Cancele um ou espere a confirmação.`);
    const id = novoIdPedido();
    db.prepare("INSERT INTO creditos_pedidos (id, conta, pacote, nome, creditos, preco, estado, criadoEm) VALUES (?, ?, ?, ?, ?, ?, 'aguardando', ?)").run(id, req.uid, p.id, p.nome, p.creditos, p.preco, agora());
    res.json({ pedido: pedidoPublico(db.prepare("SELECT * FROM creditos_pedidos WHERE id = ?").get(id)), instrucoes: cfg.instrucoes, creditos: paraApp(req.uid) });
  });
  app.post("/api/conta/creditos/pedido/:id/cancelar", authMw, (req, res) => {
    const p = db.prepare("SELECT * FROM creditos_pedidos WHERE id = ? AND conta = ?").get(String(req.params.id || "").toUpperCase(), req.uid);
    if (!p) return erro(res, 404, "Pedido não encontrado.");
    if (p.estado !== "aguardando") return erro(res, 409, "Este pedido não está mais esperando pagamento.");
    db.prepare("UPDATE creditos_pedidos SET estado = 'cancelado', resolvidoEm = ? WHERE id = ?").run(agora(), p.id);
    res.json(paraApp(req.uid));
  });

  // ── Rotas do painel ──
  if (adminMw) {
    const contaPor = (v) => {
      const s = curto(v, 200);
      if (!s) return null;
      return db.prepare("SELECT id, nome, email FROM usuarios WHERE id = ? OR lower(email) = lower(?)").get(s, s) || null;
    };
    app.get("/api/admin/creditos", adminMw, (req, res) => {
      expirarPedidos();
      const dias = Math.round(limitar(req.query.dias, 1, 365, 30));
      const desde = agora() - dias * DIA_MS;
      const pedidos = db.prepare(`SELECT p.*, u.nome AS usuario, u.email AS email FROM creditos_pedidos p LEFT JOIN usuarios u ON u.id = p.conta
        WHERE p.estado = 'aguardando' OR p.criadoEm >= ? ORDER BY CASE p.estado WHEN 'aguardando' THEN 0 ELSE 1 END, p.criadoEm DESC LIMIT 100`).all(desde)
        .map((p) => ({ ...pedidoPublico(p), conta: p.conta, usuario: p.usuario || null, email: p.email || null, obs: p.obs || "" }));
      const contas = db.prepare(`SELECT s.conta, s.saldo, s.atualizadoEm, u.nome, u.email,
          (SELECT COALESCE(SUM(creditos), 0) FROM uso_ia_mesa x WHERE x.conta = s.conta AND x.t >= ?) AS usados
        FROM creditos_saldos s LEFT JOIN usuarios u ON u.id = s.conta ORDER BY s.atualizadoEm DESC LIMIT 300`).all(desde)
        .map((c) => ({ conta: c.conta, nome: c.nome || null, email: c.email || null, saldo: arred(c.saldo, 3), usados: arred(c.usados, 3), atualizadoEm: c.atualizadoEm }));
      const tot = db.prepare("SELECT COUNT(*) AS contas, COALESCE(SUM(saldo), 0) AS saldo FROM creditos_saldos").get();
      const vendas = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(preco), 0) AS valor, COALESCE(SUM(creditos), 0) AS creditos FROM creditos_pedidos WHERE estado = 'pago' AND resolvidoEm >= ?").get(desde);
      const dados = db.prepare("SELECT COALESCE(SUM(quantidade), 0) AS q FROM creditos_extrato WHERE tipo IN ('admin', 'boas-vindas') AND quantidade > 0 AND t >= ?").get(desde).q;
      res.json({
        config: config(), consumo: consumo(dias), pedidos, contas,
        totais: { contas: tot.contas, emCirculacao: arred(tot.saldo, 2), aguardando: pedidos.filter((p) => p.estado === "aguardando").length,
          vendas: { pedidos: vendas.n, valor: arred(vendas.valor, 2), creditos: arred(vendas.creditos, 2) }, dados: arred(dados, 2) },
        sugestao: sugerirPrecos({ creditoUsd: config().creditoUsd }),
      });
    });
    app.put("/api/admin/creditos/config", adminMw, (req, res) => res.json({ config: salvarConfig(req.body || {}) }));
    app.post("/api/admin/creditos/adicionar", adminMw, (req, res) => {
      const u = contaPor(req.body?.conta);
      if (!u) return erro(res, 404, "Conta não encontrada. Use o e-mail ou o ID do usuário.");
      const q = Number(req.body?.quantidade);
      if (!Number.isFinite(q) || q === 0 || Math.abs(q) > 1000) return erro(res, 400, "Quantidade inválida (de -1000 a 1000, diferente de zero).");
      const motivo = curto(req.body?.motivo, 200) || (q > 0 ? "Créditos dados pelo administrador" : "Créditos retirados pelo administrador");
      res.json({ conta: u.id, nome: u.nome, email: u.email, ...creditar(u.id, q, "admin", motivo) });
    });
    app.get("/api/admin/creditos/conta/:conta", adminMw, (req, res) => {
      const u = contaPor(req.params.conta);
      if (!u) return erro(res, 404, "Conta não encontrada.");
      res.json({ conta: u.id, nome: u.nome, email: u.email, ...situacao(u.id), extrato: extratoDa(u.id, 60) });
    });
    const resolver = (estado) => (req, res) => {
      const p = db.prepare("SELECT * FROM creditos_pedidos WHERE id = ?").get(String(req.params.id || "").toUpperCase());
      if (!p) return erro(res, 404, "Pedido não encontrado.");
      if (!["aguardando", "expirado"].includes(p.estado)) return erro(res, 409, `Este pedido já está ${p.estado}.`);
      db.transaction(() => {
        db.prepare("UPDATE creditos_pedidos SET estado = ?, resolvidoEm = ?, obs = ? WHERE id = ?").run(estado, agora(), curto(req.body?.obs, 200), p.id);
        if (estado === "pago") creditar(p.conta, p.creditos, "compra", `Pacote ${p.nome} (pedido ${p.id})`, p.id);
      })();
      res.json({ pedido: pedidoPublico(db.prepare("SELECT * FROM creditos_pedidos WHERE id = ?").get(p.id)), situacao: situacao(p.conta) });
    };
    app.post("/api/admin/creditos/pedidos/:id/confirmar", adminMw, resolver("pago"));
    app.post("/api/admin/creditos/pedidos/:id/recusar", adminMw, resolver("recusado"));
  }

  /** Acrescenta à mesa que vai para o app o estado dos créditos (só com a cobrança ligada). */
  function mesaPublica(mesa, codigo, uid, idioma) {
    const cfg = config();
    if (!cfg.cobrancaAtiva) return;
    const conta = mesa.dono || liderDaMesa(codigo);
    if (!ehConta(conta)) return;
    const s = situacao(conta);
    const lider = conta === uid;
    let aviso = null;
    if (s.saldo <= 0) aviso = emCombate(codigo) && s.cortesiaRestante > 0 ? msg("cortesia", idioma) : msg(lider ? "lider" : "grupo", idioma);
    else if (lider && s.saldo < 1) aviso = msg("pouco", idioma);
    mesa.creditos = { lider, podeJogar: s.saldo > 0 || (emCombate(codigo) && s.cortesiaRestante > 0), aviso, ...(lider ? { saldo: s.saldo } : {}) };
  }

  api = { config, salvarConfig, situacao, creditar, bloqueio, bloqueioDoPedido, bloqueioDoContexto, aoMedir, consumo, mesaPublica, extratoDa };
  return api;
}

module.exports = {
  instalar, contextoMw, normalizarConfig, padrao, estimativa, medirSessoes, sugerirPrecos,
  /** Usado pelo limiteIA do server.js: null antes de instalar() (nada bloqueia). */
  bloqueioDoPedido: (req) => (api ? api.bloqueioDoPedido(req) : null),
};
