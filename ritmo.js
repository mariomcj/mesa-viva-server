/**
 * Ritmo da mesa: percebe quando a história empaca e faz o mundo agir, para ela não travar.
 *
 * Duas peças:
 * 1. Detector (não gasta nada a mais): conta as narrações de ações em que a história não andou
 *    (sem cena nova, sem virada de ato, sem combate, sem item ganho…) e as ações vagas seguidas
 *    ("olho em volta", "espero", "o que eu faço?"). Quando passa do limite, a próxima narração recebe
 *    no contexto a ordem de o mundo agir (um NPC chega, a ameaça se mexe, a pista fica evidente).
 *    Depois do empurrão, a contagem recomeça.
 * 2. Evento de mesa parada (gasta uma chamada à IA, paga pelo líder como as outras): fora de combate,
 *    com alguém online, ninguém digitando e o Mestre tendo falado por último, se ninguém age há
 *    alguns minutos o Mestre narra algo que acontece na cena. No máximo um por cena.
 *    Liga, desliga e muda os minutos pelo painel (aba Mesas); vem ligado, com 4 minutos.
 *
 * Guarda o estado em `ritmo_mesas` e a configuração em `ritmo_config`.
 */
"use strict";

const LIMITE_SEM_AVANCO = { curta: 5, campanha: 8 };
const LIMITE_VAGAS = 2;
const PADRAO = { eventoAtivo: true, eventoMinutos: 4 };
const MINUTOS_MIN = 2, MINUTOS_MAX = 30;
/** Depois de tanto tempo sem nada na mesa, a sessão acabou: quem volta não recebe um evento logo de cara. */
const SESSAO_ENCERRADA_MS = 60 * 60_000;
const INTERVALO_MS = 30_000;

/** Minúsculas, sem acentos, sem pontuação e sem o "eu"/"I" do começo. */
function normal(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/^(eu|i) /, "");
}

const VAGAS = [
  /^(olho|olhar|observo|observar|examino|vejo|analiso|investigo|procuro|exploro|reparo)( (em volta|ao redor|tudo|o lugar|a sala|a area|o local|o ambiente|a cena|algo|alguma coisa|pistas?|o que tem aqui))?$/,
  /^(espero|esperar|aguardo|fico (parado|parada|esperando|quieto|quieta|aqui)|descanso|nao faco nada|nada|passo a vez|continuo|continuar|continua|prossigo|sigo|sigo em frente|avanco|vamos|bora)$/,
  /(o que (eu )?(faco|fazer|posso fazer|devo fazer|tem pra fazer)|nao sei( o que fazer)?|sei la|e agora|alguma ideia|me ajuda|estou perdid[oa]|to perdid[oa]|para onde (eu )?vou)$/,
  /^(look around|wait|continue|keep going|nothing|do nothing|what do (i|we) do|what now|(i )?dont know)$/,
];

/** A ação não diz o que o personagem quer (sinal de jogador perdido). */
function acaoVaga(t) {
  const n = normal(t);
  if (!n) return true;
  if (n.split(" ").length > 8) return false;
  return VAGAS.some((re) => re.test(n));
}

/** A narração moveu a história (cena, ato, rumo, dia, combate, item ganho ou votação do grupo). */
function houveProgresso(mesa, r) {
  if (!r || typeof r !== "object") return false;
  if (typeof r.cena === "string" && r.cena.trim() && normal(r.cena) !== normal(mesa?.cena)) return true;
  if (r.ato || r.fim === true || r.novo_dia === true) return true;
  if (typeof r.ajuste_arco === "string" && r.ajuste_arco.trim()) return true;
  if (Array.isArray(r.combate?.inimigos) && r.combate.inimigos.length) return true;
  if (Array.isArray(r.itens) && r.itens.some((i) => i && typeof i === "object" && i.ganha)) return true;
  if (r.votacao && typeof r.votacao === "object") return true;
  return false;
}

const limiteDe = (duracao) => LIMITE_SEM_AVANCO[duracao] || 6;
/** A mesa empacou? */
function parada(estado, duracao) {
  return (estado?.semAvanco || 0) >= limiteDe(duracao) || (estado?.vagas || 0) >= LIMITE_VAGAS;
}

/** Bloco do contexto quando a mesa empacou (só o Mestre lê). */
function blocoParado(estado, duracao) {
  const motivos = [];
  if ((estado?.semAvanco || 0) >= limiteDe(duracao)) motivos.push(`há ${estado.semAvanco} narrações a história não sai do lugar nesta cena`);
  if ((estado?.vagas || 0) >= LIMITE_VAGAS) motivos.push("as últimas ações foram vagas, como de quem não sabe o que fazer");
  return `\nMESA PARADA (só você sabe): ${motivos.join(" e ")}. Nesta narração, responda à ação e faça o mundo agir sem esperar o grupo. Escolha UMA: um NPC chega com uma pista, um pedido ou uma ameaça; o vilão ou o perigo dá um passo que se vê; a pista que faltava fica evidente; um prazo aperta. Ligue isso ao objetivo do ato atual e termine com um gancho claro, de preferência com dois caminhos possíveis. Não castigue o grupo por estar perdido.`;
}

/** Pedido para o evento de mesa parada (vai depois do contexto). */
function promptEvento() {
  return `EVENTO: Ninguém age há alguns minutos. O mundo não espera: narre algo que acontece agora na cena, sem agir pelos personagens nem decidir o que eles fazem. Um NPC chega ou fala, a ameaça se mexe, um som ou um sinal aponta um caminho ligado ao objetivo do ato atual. Até 3 frases curtas, terminando com um gancho claro. Não peça testes, não inicie combate e não abra votação. Deixe "teste", "combate", "efeitos", "itens", "ato", "fim" e "novo_dia" vazios.`;
}

/** Tira da resposta do evento tudo o que não pode acontecer sem uma ação dos jogadores. */
function limparEvento(r) {
  if (!r || typeof r !== "object") return null;
  const saida = { ...r };
  for (const k of ["teste", "combate", "efeitos", "itens", "novo_dia", "ato", "fim", "votacao"]) delete saida[k];
  return typeof saida.narracao === "string" && saida.narracao.trim() ? saida : null;
}

function normalizarConfig(c) {
  const saida = { ...PADRAO };
  if (c && typeof c === "object") {
    if (c.eventoAtivo !== undefined) saida.eventoAtivo = c.eventoAtivo === true || c.eventoAtivo === "1" || c.eventoAtivo === 1;
    const m = Math.round(Number(c.eventoMinutos));
    if (Number.isFinite(m)) saida.eventoMinutos = Math.min(MINUTOS_MAX, Math.max(MINUTOS_MIN, m));
  }
  return saida;
}

function instalar(d) {
  const { app, db, adminMw, erro, json, agora, M } = d;
  db.exec(`CREATE TABLE IF NOT EXISTS ritmo_mesas (codigo TEXT PRIMARY KEY, semAvanco INTEGER NOT NULL DEFAULT 0, vagas INTEGER NOT NULL DEFAULT 0,
      eventoCena TEXT, eventoEm INTEGER NOT NULL DEFAULT 0, empurroes INTEGER NOT NULL DEFAULT 0, eventos INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS ritmo_config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);`);

  const vazio = (codigo) => ({ codigo, semAvanco: 0, vagas: 0, eventoCena: null, eventoEm: 0, empurroes: 0, eventos: 0 });
  const ler = (codigo) => db.prepare("SELECT * FROM ritmo_mesas WHERE codigo = ?").get(codigo) || vazio(codigo);
  const gravar = (e) => db.prepare(`INSERT INTO ritmo_mesas (codigo, semAvanco, vagas, eventoCena, eventoEm, empurroes, eventos) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(codigo) DO UPDATE SET semAvanco = excluded.semAvanco, vagas = excluded.vagas, eventoCena = excluded.eventoCena,
      eventoEm = excluded.eventoEm, empurroes = excluded.empurroes, eventos = excluded.eventos`)
    .run(e.codigo, e.semAvanco, e.vagas, e.eventoCena, e.eventoEm, e.empurroes, e.eventos);

  function config() {
    const c = {};
    for (const r of db.prepare("SELECT chave, valor FROM ritmo_config").all()) c[r.chave] = r.chave === "eventoAtivo" ? r.valor : Number(r.valor);
    return normalizarConfig(c);
  }
  function salvarConfig(mudancas) {
    const nova = normalizarConfig({ ...config(), ...mudancas });
    const st = db.prepare("INSERT INTO ritmo_config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
    st.run("eventoAtivo", nova.eventoAtivo ? "1" : "0");
    st.run("eventoMinutos", String(nova.eventoMinutos));
    return nova;
  }

  const emCombate = (mesa) => { const c = typeof mesa?.combate === "string" ? json(mesa.combate) : mesa?.combate; return !!c; };

  /** Antes de mandar a ação ao Mestre: conta as ações vagas seguidas. */
  function antesDaAcao(codigo, acao, mesa) {
    const e = ler(codigo);
    if (emCombate(mesa)) { e.vagas = 0; e.semAvanco = 0; }
    else e.vagas = acaoVaga(acao) ? e.vagas + 1 : 0;
    gravar(e);
  }

  /** Depois de cada narração: zera quando a história andou ou quando já houve o empurrão; senão, conta. */
  function aoNarrar(ctx, r, { combate = null, porAcao = false } = {}) {
    if (!r?.narracao) return;
    const e = ler(ctx.codigo);
    const empurrou = !combate && parada(e, ctx.mesa.duracao);
    if (combate || houveProgresso(ctx.mesa, r)) { e.semAvanco = 0; e.vagas = 0; }
    else if (empurrou) { e.semAvanco = 0; e.vagas = 0; }
    else if (porAcao) e.semAvanco += 1;
    if (empurrou) e.empurroes += 1;
    gravar(e);
  }

  M.acrescentarAoContexto?.((mesa) => {
    if (!mesa?.codigo || mesa.fase !== "jogo" || emCombate(mesa) || Number(mesa.arcoConcluido)) return "";
    const e = ler(mesa.codigo);
    return parada(e, mesa.duracao) ? blocoParado(e, mesa.duracao) : "";
  });

  // ── Evento de mesa parada ──
  /** Confere as mesas e dispara o evento nas que estão paradas. Devolve os códigos disparados (para os testes). */
  function verificar(t = agora()) {
    const cfg = config();
    if (!cfg.eventoAtivo || !d.narrarParado) return [];
    const espera = cfg.eventoMinutos * 60_000;
    const disparadas = [];
    const mesas = db.prepare("SELECT codigo, cena, combate, rolagem, processando, votacaoGrupo, arcoConcluido FROM mesas WHERE fase = 'jogo'").all();
    for (const m of mesas) {
      try {
        if (json(m.combate) || json(m.rolagem) || json(m.votacaoGrupo) || Number(m.arcoConcluido)) continue;
        const p = json(m.processando);
        if (p && t - (p.desde || 0) < (d.travaMs || 150_000)) continue;
        const ultimo = db.prepare("SELECT t FROM log WHERE codigo = ? ORDER BY id DESC LIMIT 1").get(m.codigo);
        if (!ultimo || t - ultimo.t < espera || t - ultimo.t > SESSAO_ENCERRADA_MS) continue;
        const fala = db.prepare("SELECT tipo FROM log WHERE codigo = ? AND tipo IN ('acao', 'narr') ORDER BY id DESC LIMIT 1").get(m.codigo);
        if (fala?.tipo !== "narr") continue;                                   // o Mestre falou por último e ninguém respondeu
        const e = ler(m.codigo);
        const cena = String(m.cena || "");
        if (e.eventoCena !== null && e.eventoCena === cena) continue;          // um evento por cena
        if (d.digitando?.(m.codigo)) continue;
        const online = d.online?.(m.codigo) || [];
        if (!online.length) continue;
        e.eventoCena = cena; e.eventoEm = t; e.eventos += 1;
        gravar(e);
        disparadas.push(m.codigo);
        Promise.resolve(d.narrarParado(m.codigo, online[0])).catch((err) => console.error("[ritmo] evento:", err?.message || err));
      } catch (err) { console.error("[ritmo] verificar:", err.message); }
    }
    return disparadas;
  }
  if (d.temporizador !== false) setInterval(() => { try { verificar(); } catch (e) { console.error("[ritmo]", e.message); } }, INTERVALO_MS).unref();

  const aoReiniciar = (codigo) => db.prepare("DELETE FROM ritmo_mesas WHERE codigo = ?").run(codigo);

  // ── Painel ──
  if (app && adminMw) {
    const resposta = () => {
      const tot = db.prepare("SELECT COALESCE(SUM(empurroes), 0) empurroes, COALESCE(SUM(eventos), 0) eventos FROM ritmo_mesas").get();
      return { config: config(), totais: { empurroes: tot.empurroes, eventos: tot.eventos }, limites: { minutosMin: MINUTOS_MIN, minutosMax: MINUTOS_MAX } };
    };
    app.get("/api/admin/ritmo", adminMw, (req, res) => res.json(resposta()));
    app.put("/api/admin/ritmo", adminMw, (req, res) => {
      const b = req.body || {};
      const m = {};
      if (b.eventoAtivo !== undefined) {
        if (typeof b.eventoAtivo !== "boolean") return erro(res, 400, "eventoAtivo deve ser verdadeiro ou falso.");
        m.eventoAtivo = b.eventoAtivo;
      }
      if (b.eventoMinutos !== undefined) {
        const n = Number(b.eventoMinutos);
        if (!Number.isInteger(n) || n < MINUTOS_MIN || n > MINUTOS_MAX) return erro(res, 400, `Os minutos vão de ${MINUTOS_MIN} a ${MINUTOS_MAX}.`);
        m.eventoMinutos = n;
      }
      salvarConfig(m);
      res.json(resposta());
    });
  }

  return { antesDaAcao, aoNarrar, verificar, aoReiniciar, config, salvarConfig, ler };
}

module.exports = { instalar, acaoVaga, houveProgresso, parada, blocoParado, promptEvento, limparEvento, normalizarConfig, LIMITE_SEM_AVANCO, LIMITE_VAGAS, PADRAO };
