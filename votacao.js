/**
 * Votação do grupo: nas escolhas de risco, cada jogador vota e a maioria decide.
 *
 * Quem abre: qualquer jogador com personagem na mesa, ou o Mestre (campo "votacao" na resposta da IA).
 * Fecha quando todos os jogadores online votaram, quando o tempo acaba (90 s) ou quando quem abriu encerra.
 * O resultado vira uma linha "sys" no diário — o Mestre lê essa linha no histórico e segue a escolha do grupo.
 * Nunca usa tipo "narr" (o app leria em voz alta).
 *
 * App antigo não tem a tela de votar. O servidor sabe quem tem o app novo pelo cabeçalho `x-app-versao`
 * (2 ou mais) que o app manda ao consultar a mesa: o Mestre só abre votação quando todos os jogadores
 * online conseguem votar, e uma votação fecha assim que todos os que conseguem votar já votaram.
 *
 * Guarda em `mesas.votacaoGrupo` (o nome `votacao` já existe em bancos antigos, com outro formato).
 * Desligar a votação aberta pelo Mestre: VOTACAO_DO_MESTRE=0 no .env.
 */
"use strict";

const DURACAO_MS = 90_000;
const MAX_PERGUNTA = 120;
const MAX_OPCAO = 60;
const VERSAO_COM_VOTACAO = 2;
const VALIDADE_DA_VERSAO_MS = 5 * 60_000;      // depois disso sem consultar a mesa, o app deixa de contar como novo

/** Pergunta e opções conferidas: { pergunta, opcoes } ou { erro }. 2 a 4 opções diferentes. */
function conferirPedido(bruto, texto) {
  const pergunta = texto(bruto?.pergunta, MAX_PERGUNTA);
  if (!pergunta) return { erro: "Escreva a pergunta da votação." };
  const vistas = new Set(), opcoes = [];
  for (const o of Array.isArray(bruto?.opcoes) ? bruto.opcoes : []) {
    const t = texto(typeof o === "string" || typeof o === "number" ? o : "", MAX_OPCAO);
    const k = t.toLowerCase();
    if (!t || vistas.has(k)) continue;
    vistas.add(k);
    opcoes.push(t);
  }
  if (opcoes.length < 2) return { erro: "A votação precisa de pelo menos 2 opções diferentes." };
  return { pergunta, opcoes: opcoes.slice(0, 4) };
}

/** Conta os votos: { contagem, vencedora (índice), empate, total }. Empate: decide a sorte entre as empatadas. */
function apurar(v, rng = Math.random) {
  const contagem = v.opcoes.map(() => 0);
  for (const i of Object.values(v.votos || {})) if (Number.isInteger(i) && i >= 0 && i < contagem.length) contagem[i]++;
  const total = contagem.reduce((s, n) => s + n, 0);
  const maior = Math.max(...contagem);
  const lideres = contagem.map((n, i) => (n === maior ? i : -1)).filter((i) => i >= 0);
  const vencedora = lideres[Math.floor(rng() * lideres.length)] ?? 0;
  return { contagem, vencedora, empate: lideres.length > 1, total };
}

/** O que sai para o app e para a projeção (os votos de cada um ficam visíveis: é uma mesa entre amigos). */
function publica(v, agora) {
  if (!v || typeof v !== "object" || !Array.isArray(v.opcoes)) return null;
  return { id: v.id, pergunta: v.pergunta, opcoes: v.opcoes, votos: v.votos || {}, por: v.por || "", nomePor: v.nomePor || "", origem: v.origem || "jogador",
    desde: v.desde, ate: v.ate, restante: Math.max(0, (v.ate || 0) - agora) };
}

/**
 * Liga as rotas e devolve os ganchos { aoNarrar, mesaPublica, aoReiniciar }.
 * `d`: { app, db, authMw, mesaDoMembro, salvarMesa, registrar, broadcast, erro, json, texto, agora, M, janelaOnlineMs }.
 */
function instalar(d) {
  const { app, db, authMw, mesaDoMembro, salvarMesa, registrar, broadcast, erro, json, texto, agora, M } = d;
  const janela = d.janelaOnlineMs || 90_000;
  try { db.exec("ALTER TABLE mesas ADD COLUMN votacaoGrupo TEXT"); } catch (e) {}
  const temporizadores = new Map();   // codigo -> timer do fim do prazo
  const capazes = new Map();          // uid -> última vez em que consultou a mesa com um app que sabe votar

  /** Anota que este jogador está com um app que sabe votar (chamado a cada consulta da mesa). */
  function anotarApp(uid, versao) {
    if (!uid) return;
    if (Number(versao) >= VERSAO_COM_VOTACAO) capazes.set(uid, agora());
    else capazes.delete(uid);
  }
  const sabeVotar = (uid) => agora() - (capazes.get(uid) || 0) < VALIDADE_DA_VERSAO_MS;
  setInterval(() => { for (const [u, t] of capazes) if (agora() - t >= VALIDADE_DA_VERSAO_MS) capazes.delete(u); }, 10 * 60_000).unref();

  const ler = (codigo) => json(db.prepare("SELECT votacaoGrupo FROM mesas WHERE codigo = ?").get(codigo)?.votacaoGrupo);
  const idNovo = () => Math.random().toString(36).slice(2, 10);

  /** Quem pode votar: jogadores com personagem na mesa. `online`: os que jogaram há pouco. */
  function eleitores(codigo) {
    const comFicha = new Set(db.prepare("SELECT uid FROM fichas WHERE codigo = ?").all(codigo).map((r) => r.uid));
    const t = agora();
    const membros = db.prepare("SELECT uid, nome, ultimaAtividade FROM membros WHERE codigo = ?").all(codigo).filter((m) => comFicha.has(m.uid));
    const online = membros.filter((m) => m.ultimaAtividade && t - m.ultimaAtividade < janela).map((m) => m.uid);
    return { todos: membros.map((m) => m.uid), online, votantes: online.filter(sabeVotar) };
  }
  /** Todos os jogadores online desta mesa estão com um app que sabe votar (e há pelo menos um). */
  function todosSabemVotar(codigo) {
    const e = eleitores(codigo);
    return e.online.length > 0 && e.votantes.length === e.online.length;
  }

  function agendar(codigo, v) {
    clearTimeout(temporizadores.get(codigo));
    const t = setTimeout(() => { try { fecharSeVenceu(codigo); } catch (e) { console.error("[votacao]", e.message); } }, Math.max(1000, v.ate - agora() + 500));
    t.unref?.();
    temporizadores.set(codigo, t);
  }

  function abrir(codigo, pedido, quem) {
    const v = { id: idNovo(), pergunta: pedido.pergunta, opcoes: pedido.opcoes, votos: {}, por: quem.uid || "", nomePor: quem.nome || "", origem: quem.origem || "jogador",
      desde: agora(), ate: agora() + DURACAO_MS };
    salvarMesa(codigo, { votacaoGrupo: v });
    registrar(codigo, { tipo: "sys", texto: `Votação aberta${quem.origem === "mestre" ? " pelo Mestre" : quem.nome ? ` por ${quem.nome}` : ""}: "${v.pergunta}" (${v.opcoes.join(" / ")})` });
    agendar(codigo, v);
    broadcast(codigo, "votacao", { id: v.id });
    return v;
  }

  /** Encerra e grava o resultado no diário. Sem nenhum voto, a votação é só cancelada. */
  function fechar(codigo, v, motivo = "") {
    clearTimeout(temporizadores.get(codigo));
    temporizadores.delete(codigo);
    salvarMesa(codigo, { votacaoGrupo: null });
    const r = apurar(v);
    if (!r.total) {
      registrar(codigo, { tipo: "sys", texto: `Votação encerrada sem votos: "${v.pergunta}"` });
    } else {
      const placar = v.opcoes.map((o, i) => `${o}: ${r.contagem[i]}`).join(" · ");
      registrar(codigo, { tipo: "sys", ok: true,
        texto: `Votação encerrada: "${v.pergunta}" — o grupo escolheu "${v.opcoes[r.vencedora]}"${r.empate ? " (empate, decidido na sorte)" : ""}. Placar: ${placar}.${motivo ? ` ${motivo}` : ""}` });
    }
    broadcast(codigo, "votacao", { id: v.id, fim: true });
    return r;
  }

  /** Fecha se o prazo acabou (chamado pelo temporizador e a cada leitura da mesa: sobrevive a um reinício do servidor). */
  function fecharSeVenceu(codigo) {
    const v = ler(codigo);
    if (v && agora() >= (v.ate || 0)) fechar(codigo, v);
  }

  app.post("/api/mesa/:codigo/votacao", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const mesa = db.prepare("SELECT fase FROM mesas WHERE codigo = ?").get(codigo);
    if (mesa.fase !== "jogo") return erro(res, 409, "A votação é para durante a aventura.");
    const ficha = json(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, req.uid)?.dados);
    if (!ficha) return erro(res, 400, "Crie seu personagem.");
    fecharSeVenceu(codigo);
    if (ler(codigo)) return erro(res, 409, "Já existe uma votação aberta.");
    const p = conferirPedido(req.body, texto);
    if (p.erro) return erro(res, 400, p.erro);
    const v = abrir(codigo, p, { uid: req.uid, nome: texto(ficha.nome, 30), origem: "jogador" });
    res.json({ ok: true, votacao: publica(v, agora()) });
  });

  app.post("/api/mesa/:codigo/votar", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    fecharSeVenceu(codigo);
    const v = ler(codigo);
    if (!v) return erro(res, 409, "Não há votação aberta.");
    const i = req.body?.opcao;
    if (!Number.isInteger(i) || i < 0 || i >= v.opcoes.length) return erro(res, 400, "Opção inválida.");
    const e = eleitores(codigo);
    if (!e.todos.includes(req.uid)) return erro(res, 403, "Só quem tem personagem na mesa vota.");
    v.votos = { ...(v.votos || {}), [req.uid]: i };
    anotarApp(req.uid, VERSAO_COM_VOTACAO);          // quem votou, sabe votar
    // todos os que estão jogando agora e conseguem votar já votaram: não precisa esperar o relógio
    const pendentes = eleitores(codigo).votantes.filter((u) => v.votos[u] === undefined);
    if (!pendentes.length) { const r = fechar(codigo, v); return res.json({ ok: true, encerrada: true, vencedora: r.vencedora }); }
    salvarMesa(codigo, { votacaoGrupo: v });
    broadcast(codigo, "votacao", { id: v.id });
    res.json({ ok: true, encerrada: false, votacao: publica(v, agora()) });
  });

  app.post("/api/mesa/:codigo/votacao/encerrar", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const v = ler(codigo);
    if (!v) return erro(res, 409, "Não há votação aberta.");
    const dono = db.prepare("SELECT dono FROM mesas WHERE codigo = ?").get(codigo)?.dono;
    if (v.por !== req.uid && dono !== req.uid) return erro(res, 403, "Só quem abriu a votação ou quem criou a mesa pode encerrar.");
    const r = fechar(codigo, v);
    res.json({ ok: true, encerrada: true, vencedora: r.total ? r.vencedora : null });
  });

  // ── Mestre ──
  const doMestre = (codigo) => process.env.VOTACAO_DO_MESTRE !== "0" && !!codigo && todosSabemVotar(codigo);
  M.acrescentarAoContexto?.((mesa) => {
    if (mesa?.fase === "lobby" || !doMestre(mesa?.codigo)) return "";
    const aberta = json(mesa?.votacaoGrupo);
    if (aberta) return `\nVOTAÇÃO DO GRUPO: há uma votação aberta ("${aberta.pergunta}"). Não abra outra e não decida por eles.`;
    return `\nVOTAÇÃO DO GRUPO: quando o grupo inteiro precisa escolher junto entre caminhos de risco (descer mais fundo, aceitar um acordo, se dividir), você pode acrescentar ao JSON o campo "votacao": {"pergunta": "até 100 caracteres", "opcoes": ["2 a 4 opções curtas"]}. Use raramente, nunca em combate nem junto com "teste". O resultado aparece no histórico como "(Votação encerrada: ...)": siga a escolha do grupo.`;
  });

  /** Resposta do Mestre com "votacao": abre, se não houver combate, rolagem pendente nem outra votação. */
  function aoNarrar(ctx, r, { combate = null, rolagem = null } = {}) {
    if (!r?.votacao || typeof r.votacao !== "object" || combate || rolagem || r.combate?.inimigos?.length || !doMestre(ctx.codigo)) return null;
    if (ler(ctx.codigo)) return null;
    const p = conferirPedido(r.votacao, texto);
    if (p.erro) return null;
    return abrir(ctx.codigo, p, { origem: "mestre" });
  }

  /** Troca a coluna guardada pelo formato público (ou tira o campo, quando não há votação). */
  function mesaPublica(mesa, codigo, quem) {
    if (quem) anotarApp(quem.uid, quem.versao);
    let v = json(mesa.votacaoGrupo);
    delete mesa.votacaoGrupo;
    if (v && agora() >= (v.ate || 0)) { fechar(codigo, v); v = null; }
    if (v) mesa.votacao = publica(v, agora());
  }

  const aoReiniciar = (codigo) => { clearTimeout(temporizadores.get(codigo)); temporizadores.delete(codigo); salvarMesa(codigo, { votacaoGrupo: null }); };

  return { aoNarrar, mesaPublica, aoReiniciar, anotarApp, todosSabemVotar, ler: (codigo) => publica(ler(codigo), agora()) };
}

module.exports = { instalar, conferirPedido, apurar, publica, DURACAO_MS };
