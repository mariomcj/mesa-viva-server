/**
 * Conferência das compras da Google Play no servidor (Google Play Developer API).
 *
 * Fica desligada até configurar no .env:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT=/caminho/conta-de-servico.json   (ou o JSON inteiro numa linha)
 *   GOOGLE_PLAY_PACKAGE=mesa.viva                                 (padrão: mesa.viva, o applicationId do app)
 * A conta de serviço precisa de acesso ao app no Play Console, com a permissão de ver e gerenciar pedidos.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function lerContaServico(valor) {
  const v = String(valor || "").trim();
  if (!v) return null;
  try {
    const j = JSON.parse(v.startsWith("{") ? v : fs.readFileSync(v, "utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch (e) {
    console.log(`[google-play] conta de serviço inválida: ${e.message}`);
    return null;
  }
}

/**
 * Cliente da API. `opcoes.fetch` permite testar sem a internet.
 * Devolve null quando não há conta de serviço configurada.
 */
function criarGooglePlay({ contaServico = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT, pacote = process.env.GOOGLE_PLAY_PACKAGE || "mesa.viva", fetch: buscar } = {}) {
  const conta = typeof contaServico === "object" && contaServico ? contaServico : lerContaServico(contaServico);
  if (!conta) return null;
  const pedir = (...a) => (buscar || globalThis.fetch)(...a);
  let cache = null;

  async function token() {
    if (cache && cache.expira > Date.now() + 60_000) return cache.token;
    const agora = Math.floor(Date.now() / 1000);
    const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const corpo = b64url(JSON.stringify({ iss: conta.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 }));
    const assinatura = b64url(crypto.createSign("RSA-SHA256").update(`${cab}.${corpo}`).sign(conta.private_key));
    const res = await pedir("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${corpo}.${assinatura}` }).toString(),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.access_token) throw new Error(`Google OAuth: ${j.error_description || j.error || res.status}`);
    cache = { token: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return cache.token;
  }

  async function api(caminho, metodo = "GET") {
    const res = await pedir(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pacote)}/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: metodo === "POST" ? "{}" : undefined,
    });
    const txt = await res.text();
    if (!res.ok) { const e = new Error(`Google Play ${res.status}: ${txt.slice(0, 200)}`); e.status = res.status; throw e; }
    return txt ? JSON.parse(txt) : {};
  }

  const caminhoCompra = (produto, compra) => `purchases/products/${encodeURIComponent(produto)}/tokens/${encodeURIComponent(compra)}`;
  return {
    pacote,
    /** Compra de um produto avulso (purchaseState 0 = paga, 1 = cancelada, 2 = pendente). */
    compra: (produto, compra) => api(caminhoCompra(produto, compra)),
    /** Consome a compra para o jogador poder comprar o mesmo pacote de novo. */
    consumir: (produto, compra) => api(`${caminhoCompra(produto, compra)}:consume`, "POST"),
  };
}

module.exports = { criarGooglePlay, lerContaServico };
