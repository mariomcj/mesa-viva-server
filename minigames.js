/**
 * Minigames como testes de perícia: o jogador pode jogar um desafio rápido antes de rolar o dado.
 * O resultado vira bônus ou penalidade na rolagem (de −1 a +2); o d20 continua decidindo.
 *
 *   - Prestidigitação → "fechadura": acertar os pinos no tempo certo.
 *   - Investigação    → "runas": repetir a sequência de símbolos.
 *
 * O minigame é opcional: quem não joga (ou usa um app antigo) rola o dado como sempre, sem bônus.
 * Desligar: MINIGAMES=0 no .env.
 */
"use strict";

const TIPOS = {
  fechadura: { pericia: "prestidigitacao", alvo: 3, nome: "a fechadura" },
  runas: { pericia: "investigacao", alvo: 5, nome: "o enigma das runas" },
};
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ligado = () => process.env.MINIGAMES !== "0";

/** O minigame que combina com a perícia da rolagem (pelo começo do rótulo), ou null. */
function tipoDaRolagem(rol) {
  if (!rol || rol.tipo !== "teste") return null;
  const k = chave(rol.rotulo);
  for (const [tipo, t] of Object.entries(TIPOS)) if (k.startsWith(t.pericia)) return tipo;
  return null;
}

/** Rolagem recém-montada: marca o minigame disponível. Chamar antes de qualquer texto extra entrar no rótulo. */
function aoMontarRolagem(rol) {
  if (!ligado()) return rol;
  const tipo = tipoDaRolagem(rol);
  if (tipo) rol.minigame = { tipo, alvo: TIPOS[tipo].alvo };
  return rol;
}

/** Bônus pelo desempenho: tudo certo +2, a maior parte +1, pouco 0, quase nada −1. */
function ajusteDoResultado(acertos, alvo) {
  const total = Math.max(1, Number(alvo) || 1);
  const n = Math.max(0, Math.min(total, Math.floor(Number(acertos)) || 0));
  const fracao = n / total;
  return fracao >= 1 ? 2 : fracao >= 0.6 ? 1 : fracao >= 0.3 ? 0 : -1;
}

/**
 * Liga a rota. `d`: { app, db, authMw, mesaDoMembro, salvarMesa, registrar, broadcast, erro, json, aoAjustar }.
 * `aoAjustar(rol)` (opcional) refaz o que depende do bônus, como a chance mostrada no rótulo.
 */
function instalar(d) {
  const { app, db, authMw, mesaDoMembro, salvarMesa, registrar, broadcast, erro, json } = d;

  app.post("/api/minigame", authMw, (req, res) => {
    const codigo = mesaDoMembro(req, res); if (!codigo) return;
    const mesa = db.prepare("SELECT rolagem, processando FROM mesas WHERE codigo = ?").get(codigo);
    const rol = json(mesa.rolagem);
    if (!rol || rol.jogador !== req.uid) return erro(res, 409, "Não há rolagem pendente para você.");
    if (!rol.minigame || !TIPOS[rol.minigame.tipo]) return erro(res, 409, "Esta rolagem não tem desafio.");
    if (rol.minigame.feito) return erro(res, 409, "Você já jogou o desafio desta rolagem.");
    const acertos = req.body?.acertos;
    if (!Number.isInteger(acertos) || acertos < 0 || acertos > 50) return erro(res, 400, "Resultado inválido.");
    const ajuste = ajusteDoResultado(acertos, rol.minigame.alvo);
    rol.bonus = (Number(rol.bonus) || 0) + ajuste;
    rol.minigame = { ...rol.minigame, feito: true, acertos: Math.min(acertos, rol.minigame.alvo), ajuste };
    if (d.aoAjustar) { try { d.aoAjustar(rol); } catch (e) { console.error("[minigame]", e.message); } }
    salvarMesa(codigo, { rolagem: rol });
    const nome = json(db.prepare("SELECT dados FROM fichas WHERE codigo = ? AND uid = ?").get(codigo, req.uid)?.dados)?.nome || "Alguém";
    const como = ajuste >= 2 ? "com perfeição" : ajuste === 1 ? "bem" : ajuste === 0 ? "por pouco" : "mal";
    registrar(codigo, { tipo: "sys", ok: ajuste > 0 ? true : ajuste < 0 ? false : null,
      texto: `${nome} enfrentou ${TIPOS[rol.minigame.tipo].nome} e se saiu ${como}: ${ajuste >= 0 ? "+" : "−"}${Math.abs(ajuste)} na rolagem.` });
    broadcast(codigo, "atualizar", {});
    res.json({ ok: true, ajuste, rolagem: rol });
  });

  return { aoMontarRolagem };
}

module.exports = { TIPOS, tipoDaRolagem, aoMontarRolagem, ajusteDoResultado, instalar };
