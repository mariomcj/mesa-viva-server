/**
 * Projeção da mesa: uma TV ou projetor abre /projecao.html, mostra um QR Code, e um jogador da mesa lê esse
 * QR pelo app. A partir daí a tela mostra a mesa em tempo real (cena, tabuleiro, personagens e o diário),
 * só para leitura. É opcional: sem projeção, nada muda no jogo.
 *
 * Segurança:
 *   - a tela não tem login. Ela recebe um `id` (mostrado no QR) e uma `chave` secreta que só ela conhece;
 *   - só um membro da mesa, logado no app, liga uma tela à mesa (POST /api/projecao/parear);
 *   - a tela só lê o estado público: nada de arco, segredos, memória do Mestre, e-mails ou tokens;
 *   - telas sem uso expiram sozinhas (15 min sem parear; 12 h depois de pareadas e paradas).
 */
"use strict";

const crypto = require("crypto");
let qrcode = null;
try { qrcode = require("qrcode-generator"); } catch (e) { /* sem o pacote, a tela mostra só o código */ }

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAMANHO_ID = 6;
const PREFIXO_QR = "MESAVIVA-TV:";
const VALIDADE_SEM_PAREAR_MS = 15 * 60_000;
const VALIDADE_PAREADA_MS = 12 * 3600_000;
const MAX_TELAS_ESPERANDO = 400;
const MAX_TELAS_POR_MESA = 4;
const LINHAS_DO_DIARIO = 40;

function idNovo() {
  const b = crypto.randomBytes(TAMANHO_ID);
  let s = "";
  for (let i = 0; i < TAMANHO_ID; i++) s += ALFABETO[b[i] % ALFABETO.length];
  return s;
}
/** Id de tela lido de um QR ("MESAVIVA-TV:ABC234") ou digitado ("abc234"), ou null. */
function idValido(v) {
  const t = String(v ?? "").trim().toUpperCase().replace(/^MESAVIVA-TV:/, "");
  return new RegExp(`^[${ALFABETO}]{${TAMANHO_ID}}$`).test(t) ? t : null;
}
const conteudoDoQr = (id) => `${PREFIXO_QR}${id}`;

/** QR Code em SVG (texto). "" se o pacote não está instalado. */
function svgDoQr(conteudo) {
  if (!qrcode) return "";
  try {
    const q = qrcode(0, "M");
    q.addData(conteudo, "Alphanumeric");
    q.make();
    const n = q.getModuleCount(), margem = 4, lado = n + margem * 2;
    let caminho = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) caminho += `M${x + margem} ${y + margem}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
  } catch (e) { return ""; }
}

/** Ficha como a tela precisa: só o que aparece para todos. */
function fichaPublica(f, online) {
  return { uid: f.uid, nome: f.nome, classe: f.classe, raca: f.raca, nivel: f.nivel, pv: f.pv, pvMax: f.pvMax, mana: f.mana, manaMax: f.manaMax,
    ca: f.ca, imagem: f.imagem || "", status: Array.isArray(f.status) ? f.status : [], online: !!online };
}

/** Combate como a tela precisa (o mesmo que o app recebe, sem campos internos). */
function combatePublico(c) {
  if (!c || typeof c !== "object") return null;
  return {
    id: c.id || "", rodada: c.rodada || 1, vez: c.vez || 0, pausado: !!c.pausado,
    ordem: (c.ordem || []).map((o) => ({ id: o.id, tipo: o.tipo, nome: o.nome, ini: o.ini })),
    inimigos: (c.inimigos || []).map((i) => ({ id: i.id, nome: i.nome, pv: i.pv, pvMax: i.pvMax, ca: i.ca, alcance: i.alcance, fugiu: !!i.fugiu,
      status: Array.isArray(i.status) ? i.status : [], fraquezas: i.fraquezas || [], resistencias: i.resistencias || [], imunidades: i.imunidades || [] })),
    mapa: c.mapa ? { colunas: c.mapa.colunas, linhas: c.mapa.linhas, descricao: c.mapa.descricao || "", imagem: c.mapa.imagem || "", terreno: c.mapa.terreno || [] } : null,
    posicoes: c.posicoes || {},
  };
}

/**
 * Liga as rotas e devolve { mesaPublica, aoConectar, aoReiniciar }.
 * `d`: { app, db, authMw, mesaDoMembro, erro, json, texto, agora, broadcast, clientes, R, T, M, votacao, mundo, janelaOnlineMs, travaMs }.
 * `clientes()` devolve as conexões WebSocket abertas; `votacao(codigo)` e `mundo(mesa)` são opcionais.
 */
function instalar(d) {
  const { app, db, authMw, mesaDoMembro, erro, json, texto, agora, broadcast, R, T } = d;
  const janela = d.janelaOnlineMs || 90_000, travaMs = d.travaMs || 150_000;
  db.exec("CREATE TABLE IF NOT EXISTS projecoes (id TEXT PRIMARY KEY, chave TEXT NOT NULL, codigo TEXT, por TEXT, criadaEm INTEGER NOT NULL, vistaEm INTEGER NOT NULL)");
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_projecoes_codigo ON projecoes (codigo)"); } catch (e) {}

  const hash = (chave) => crypto.createHash("sha256").update(String(chave)).digest("hex");
  const buscar = (id) => db.prepare("SELECT * FROM projecoes WHERE id = ?").get(id);
  const confere = (p, chave) => {
    if (!p || typeof chave !== "string" || !chave) return false;
    const a = Buffer.from(p.chave), b = Buffer.from(hash(chave));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  function limpar() {
    const t = agora();
    db.prepare("DELETE FROM projecoes WHERE (codigo IS NULL AND criadaEm < ?) OR (codigo IS NOT NULL AND vistaEm < ?)").run(t - VALIDADE_SEM_PAREAR_MS, t - VALIDADE_PAREADA_MS);
  }
  setInterval(() => { try { limpar(); } catch (e) {} }, 5 * 60_000).unref();

  /** Avisa as telas conectadas por WebSocket com esse id. */
  function avisarTela(id, evento, dados, mesa) {
    for (const ws of d.clientes ? d.clientes() : []) {
      if (ws.proj !== id) continue;
      if (mesa !== undefined) ws.mesa = mesa;
      if (ws.readyState === 1) { try { ws.send(JSON.stringify({ evento, dados: dados || {} })); } catch {} }
    }
  }

  app.get(["/projecao", "/tv"], (req, res) => res.redirect(302, "/projecao.html"));

  /** A tela pede um id novo e o QR para mostrar. Sem login: quem autoriza é o jogador que lê o QR. */
  app.post("/api/projecao/nova", (req, res) => {
    limpar();
    const esperando = db.prepare("SELECT COUNT(*) n FROM projecoes WHERE codigo IS NULL").get().n;
    if (esperando >= MAX_TELAS_ESPERANDO) return erro(res, 503, "Muitas telas esperando. Tente de novo em alguns minutos.");
    let id = "";
    for (let i = 0; i < 8 && !id; i++) { const c = idNovo(); if (!buscar(c)) id = c; }
    if (!id) return erro(res, 503, "Não consegui criar a projeção. Tente de novo.");
    const chave = crypto.randomBytes(24).toString("hex");
    const t = agora();
    db.prepare("INSERT INTO projecoes (id, chave, codigo, por, criadaEm, vistaEm) VALUES (?, ?, NULL, NULL, ?, ?)").run(id, hash(chave), t, t);
    res.json({ id, chave, qr: svgDoQr(conteudoDoQr(id)), conteudo: conteudoDoQr(id), expiraEm: t + VALIDADE_SEM_PAREAR_MS });
  });

  /** O jogador leu o QR: liga a tela à mesa dele. */
  app.post("/api/projecao/parear", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const id = idValido(req.body?.id);
    if (!id) return erro(res, 400, "Código da tela inválido.");
    limpar();
    const p = buscar(id);
    if (!p) return erro(res, 404, "Não achei essa tela. Atualize a página na TV e leia o QR Code de novo.");
    if (p.codigo && p.codigo !== codigo) return erro(res, 409, "Essa tela já está mostrando outra mesa.");
    if (!p.codigo) {
      const n = db.prepare("SELECT COUNT(*) n FROM projecoes WHERE codigo = ?").get(codigo).n;
      if (n >= MAX_TELAS_POR_MESA) return erro(res, 409, `Esta mesa já está em ${MAX_TELAS_POR_MESA} telas. Encerre uma antes de abrir outra.`);
    }
    db.prepare("UPDATE projecoes SET codigo = ?, por = ?, vistaEm = ? WHERE id = ?").run(codigo, req.uid, agora(), id);
    avisarTela(id, "pareada", {}, codigo);
    broadcast(codigo, "atualizar", {});
    res.json({ ok: true, telas: db.prepare("SELECT COUNT(*) n FROM projecoes WHERE codigo = ?").get(codigo).n });
  });

  /** Encerra a projeção da mesa: uma tela (`id`) ou todas. Qualquer jogador da mesa pode. */
  app.post("/api/projecao/encerrar", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const id = req.body?.id === undefined || req.body?.id === null || req.body?.id === "" ? null : idValido(req.body.id);
    if (req.body?.id && !id) return erro(res, 400, "Código da tela inválido.");
    const telas = db.prepare(id ? "SELECT id FROM projecoes WHERE codigo = ? AND id = ?" : "SELECT id FROM projecoes WHERE codigo = ?").all(...(id ? [codigo, id] : [codigo]));
    for (const t of telas) {
      db.prepare("DELETE FROM projecoes WHERE id = ?").run(t.id);
      avisarTela(t.id, "encerrada", {}, null);
    }
    broadcast(codigo, "atualizar", {});
    res.json({ ok: true, encerradas: telas.length });
  });

  /** O que a tela mostra. Cabeçalho `x-projecao-chave`: a chave que só a tela conhece. */
  app.get("/api/projecao/:id/estado", (req, res) => {
    const id = idValido(req.params.id);
    const p = id && buscar(id);
    if (!confere(p, req.get("x-projecao-chave"))) return erro(res, 404, "Projeção não encontrada.");
    res.setHeader("Cache-Control", "no-store");
    const t = agora();
    if (!p.codigo) {
      if (t - p.criadaEm > VALIDADE_SEM_PAREAR_MS) { db.prepare("DELETE FROM projecoes WHERE id = ?").run(id); return erro(res, 404, "Projeção não encontrada."); }
      return res.json({ pareada: false, agora: t });
    }
    const mesa = db.prepare("SELECT * FROM mesas WHERE codigo = ?").get(p.codigo);
    if (!mesa) { db.prepare("DELETE FROM projecoes WHERE id = ?").run(id); return erro(res, 404, "Projeção não encontrada."); }
    db.prepare("UPDATE projecoes SET vistaEm = ? WHERE id = ?").run(t, id);
    res.json(estado(mesa, t));
  });

  function estado(mesa, t) {
    const codigo = mesa.codigo;
    const tema = T.temaPorId(mesa.tema);
    const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(codigo);
    const online = new Set(membros.filter((m) => m.ultimaAtividade && t - m.ultimaAtividade < janela).map((m) => m.uid));
    const fichas = db.prepare("SELECT uid, dados FROM fichas WHERE codigo = ?").all(codigo).map((r) => {
      const f = fichaPublica(R.normalizarFicha(json(r.dados), r.uid), online.has(r.uid));
      try { f.classe = T.nomeNoTema(tema.id, f.classe) || f.classe; } catch (e) {}
      return f;
    });
    const nomeDe = (uid) => fichas.find((f) => f.uid === uid)?.nome || membros.find((m) => m.uid === uid)?.nome || "";
    const proc = json(mesa.processando);
    const rol = json(mesa.rolagem);
    const cdVisivel = mesa.cdVisivel !== 0;
    const mundo = d.mundo ? d.mundo(mesa) : {};
    const log = db.prepare("SELECT id, t, tipo, texto, nome, res, ok FROM log WHERE codigo = ? ORDER BY id DESC LIMIT ?").all(codigo, LINHAS_DO_DIARIO).reverse();
    for (const e of log) e.ok = e.ok == null ? null : e.ok === 1;
    return {
      pareada: true, agora: t,
      mesa: {
        codigo, fase: mesa.fase, cena: mesa.cena || "", fundo: mesa.fundo || "", idioma: mesa.idioma === "en" ? "en" : "pt",
        tema: tema.id, temaNome: tema.nome, dia: Math.max(1, Number(mesa.dia) || 1), clima: mundo.clima || "", periodo: mundo.periodo || "",
        narrando: proc && t - proc.desde < travaMs ? (proc.nome || nomeDe(proc.por) || "") : "",
        rolagem: rol ? { jogador: rol.jogador, nome: nomeDe(rol.jogador), tipo: rol.tipo, rotulo: rol.rotulo, bonus: rol.bonus, ...(cdVisivel ? { cd: rol.cd } : {}) } : null,
        votacao: d.votacao ? d.votacao(codigo) : null,
        nomes: Object.fromEntries(fichas.map((f) => [f.uid, f.nome])),
      },
      fichas,
      combate: combatePublico(json(mesa.combate)),
      log,
    };
  }

  /** Mesa que vai para o app: quantas telas estão projetando (o campo só existe quando há alguma). */
  function mesaPublica(mesa, codigo) {
    const telas = db.prepare("SELECT id FROM projecoes WHERE codigo = ?").all(codigo).map((r) => r.id);
    if (telas.length) mesa.projecoes = telas;
  }

  /**
   * Mensagem de WebSocket de uma tela: { projecao: id, chave }. Devolve true se a mensagem era de projeção
   * (o servidor então não a trata como login de jogador).
   */
  function aoConectar(ws, msg) {
    if (!msg || msg.projecao === undefined) return false;
    const id = idValido(msg.projecao);
    const p = id && buscar(id);
    if (!confere(p, typeof msg.chave === "string" ? msg.chave : "")) { try { ws.send(JSON.stringify({ evento: "recusado", dados: {} })); } catch {} return true; }
    ws.proj = id;
    ws.mesa = p.codigo || null;
    try { ws.send(JSON.stringify({ evento: "pronto", dados: { pareada: !!p.codigo } })); } catch {}
    return true;
  }

  const aoApagarMesa = (codigo) => {
    for (const t of db.prepare("SELECT id FROM projecoes WHERE codigo = ?").all(codigo)) { db.prepare("DELETE FROM projecoes WHERE id = ?").run(t.id); avisarTela(t.id, "encerrada", {}, null); }
  };

  return { mesaPublica, aoConectar, aoApagarMesa, estado };
}

module.exports = { instalar, idValido, conteudoDoQr, svgDoQr, fichaPublica, combatePublico, PREFIXO_QR, TAMANHO_ID };
