/**
 * Validação de compras da Google Play no servidor.
 *
 * Fica desligada até configurar:
 *   GOOGLE_PLAY_PACKAGE=mesa.viva
 *   GOOGLE_PLAY_SERVICE_ACCOUNT=/caminho/conta-de-servico.json   (ou o JSON inteiro)
 * A conta de serviço precisa de acesso ao app no Play Console (permissão de gerenciar pedidos).
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const PACOTE = process.env.GOOGLE_PLAY_PACKAGE || "mesa.viva";

function lerContaServico() {
  const v = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!v) return null;
  try {
    const texto = v.trim().startsWith("{") ? v : fs.readFileSync(v, "utf8");
    const j = JSON.parse(texto);
    if (!j.client_email || !j.private_key) return null;
    return j;
  } catch (e) {
    console.log(`[loja] Conta de serviço inválida: ${e.message}`);
    return null;
  }
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let _tokenCache = null;

async function tokenGoogle(conta) {
  if (_tokenCache && _tokenCache.expira > Date.now() + 60_000) return _tokenCache.token;
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora, exp: agora + 3600,
  }));
  const assinatura = b64url(crypto.createSign("RSA-SHA256").update(`${cab}.${corpo}`).sign(conta.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${corpo}.${assinatura}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Google OAuth: ${j.error_description || j.error || res.status}`);
  _tokenCache = { token: j.access_token, expira: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

function criarLoja(db, creditos) {
  const conta = lerContaServico();
  const configurada = !!conta;

  async function api(caminho, metodo = "GET", corpo) {
    const token = await tokenGoogle(conta);
    const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACOTE}/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Google Play ${res.status}: ${txt.slice(0, 200)}`);
    return txt ? JSON.parse(txt) : {};
  }

  /**
   * Confere a compra na Google Play, credita a conta e confirma a compra.
   * Idempotente: o mesmo purchaseToken nunca credita duas vezes.
   */
  async function validar(contaId, produtoId, purchaseToken) {
    const produto = creditos.PRODUTOS.find((p) => p.id === produtoId);
    if (!produto) return { ok: false, status: 400, erro: "Produto desconhecido." };
    if (!purchaseToken || String(purchaseToken).length > 4096) return { ok: false, status: 400, erro: "Compra inválida." };
    const ja = db.prepare("SELECT * FROM compras WHERE token = ?").get(purchaseToken);
    if (ja && ja.estado === "creditada") return { ok: true, repetida: true, situacao: creditos.situacao(ja.conta) };
    if (!configurada) return { ok: false, status: 503, erro: "Os pagamentos ainda não foram configurados no servidor." };

    if (produto.tipo === "assinatura") {
      const sub = await api(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
      const ativa = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"].includes(sub.subscriptionState);
      if (!ativa) return { ok: false, status: 402, erro: "A assinatura não está ativa." };
      const expira = Math.max(...(sub.lineItems || []).map((l) => Date.parse(l.expiryTime) || 0), 0);
      db.prepare("INSERT OR REPLACE INTO compras (token, conta, produto, creditos, estado, pedido, t) VALUES (?, ?, ?, ?, 'creditada', ?, ?)")
        .run(purchaseToken, contaId, produto.id, produto.creditos, sub.latestOrderId || null, Date.now());
      creditos.ativarApoiador(contaId, expira || Date.now() + 31 * 86_400_000);
      creditos.creditar(contaId, produto.creditos);
      if (sub.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
        await api(`purchases/subscriptions/${produto.id}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, "POST", {}).catch(() => {});
      }
      return { ok: true, situacao: creditos.situacao(contaId) };
    }

    const p = await api(`purchases/products/${produto.id}/tokens/${encodeURIComponent(purchaseToken)}`);
    if (p.purchaseState !== 0) return { ok: false, status: 402, erro: "A compra ainda não foi concluída." };
    db.prepare("INSERT OR REPLACE INTO compras (token, conta, produto, creditos, estado, pedido, t) VALUES (?, ?, ?, ?, 'creditada', ?, ?)")
      .run(purchaseToken, contaId, produto.id, produto.creditos, p.orderId || null, Date.now());
    creditos.creditar(contaId, produto.creditos);
    // Consome o produto para que possa ser comprado de novo.
    await api(`purchases/products/${produto.id}/tokens/${encodeURIComponent(purchaseToken)}:consume`, "POST", {}).catch((e) => console.log(`[loja] consume: ${e.message}`));
    return { ok: true, situacao: creditos.situacao(contaId) };
  }

  return { configurada, validar, PACOTE };
}

module.exports = { criarLoja };
