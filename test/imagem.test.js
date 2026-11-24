/**
 * IA de imagem (mestre.gerarImagem): resposta sem imagem, erro da IA e falha de rede passam para a próxima
 * tentativa (com o segundo modelo) e vão para o log; chave recusada desiste na hora; depois de 3 falhas, a reserva.
 * A OpenRouter é simulada (sem internet).
 */
"use strict";
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const M = require("../mestre");

const fetchReal = globalThis.fetch;
const errorReal = console.error;
let fila = [], pedidos = [], logs = [];
globalThis.fetch = async (url, opts) => {
  assert.equal(String(url), "https://openrouter.ai/api/v1/images/generations");
  pedidos.push(JSON.parse(opts.body).model);
  const r = fila.shift();
  if (r instanceof Error) throw r;
  return new Response(typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo), { status: r.status || 200, headers: { "Content-Type": "application/json" } });
};
console.error = (...a) => logs.push(a.join(" "));
beforeEach(() => { fila = []; pedidos = []; logs = []; });
after(() => { globalThis.fetch = fetchReal; console.error = errorReal; });

const PNG = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");

test("resposta sem imagem tenta o segundo modelo e registra o motivo no log", async () => {
  fila = [{ corpo: { data: [], aviso: "só texto" } }, { corpo: { data: [{ url: "https://img.exemplo/mapa.png" }] } }];
  const url = await M.gerarImagem("chave", "mapa visto de cima", "", 1, "mapa");
  assert.equal(url, "https://img.exemplo/mapa.png");
  assert.deepEqual(pedidos, ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image"]);
  assert.ok(logs.some((l) => l.includes("[imagem] mapa") && l.includes("resposta sem imagem") && l.includes("só texto")), logs.join("\n"));
});

test("erro da IA (400) também passa para a próxima; a imagem em base64 vira arquivo com o prefixo", async () => {
  fila = [{ status: 400, corpo: { error: { message: "modelo recusou" } } }, { corpo: { data: [{ b64_json: PNG }] } }];
  const url = await M.gerarImagem("chave", "mapa", "https://base.exemplo", 1, "mapa");
  assert.match(url, /^https:\/\/base\.exemplo\/images\/mapa_\d+_[a-z0-9]+\.png$/);
  const arq = path.join(__dirname, "..", "public", "images", url.split("/images/")[1]);
  assert.equal(fs.readFileSync(arq).toString("base64"), PNG);
  fs.unlinkSync(arq);
  assert.ok(logs.some((l) => l.includes("HTTP 400") && l.includes("modelo recusou")), logs.join("\n"));
});

test("chave recusada (401) desiste na hora, com erro", async () => {
  fila = [{ status: 401, corpo: { error: { message: "chave inválida" } } }];
  await assert.rejects(M.gerarImagem("chave", "mapa", "", 1, "mapa"), (e) => e instanceof M.ErroMestre && /401/.test(e.message));
  assert.equal(pedidos.length, 1);
});

test("três falhas seguidas: fica a ilustração reserva, e cada falha vai para o log", async () => {
  fila = [{ status: 500, corpo: "erro interno" }, { corpo: { data: [{}] } }, new Error("rede caiu")];
  const url = await M.gerarImagem("chave", "mapa", "", 1, "mapa");
  assert.match(url, /^data:image\/svg\+xml;base64,/);
  assert.equal(pedidos.length, 3);
  for (const trecho of ["HTTP 500", "resposta sem imagem", "rede caiu", "depois de 3 tentativas"]) assert.ok(logs.some((l) => l.includes(trecho)), `falta no log: ${trecho}\n${logs.join("\n")}`);
});
