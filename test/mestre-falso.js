/**
 * Mestre falso para os testes: substitui só as chamadas ao openrouter.ai.
 * Responde de forma previsível a partir de palavras-chave da ação, sem gastar créditos.
 */
"use strict";

const contagem = { texto: 0, imagem: 0, arco: 0 };
// portaoImagem: se for uma Promise, as imagens esperam por ela (para testar imagem que chega atrasada)
const registro = { ultimoPrompt: "", imagens: [], portaoImagem: null };
const fetchReal = globalThis.fetch;
const resposta = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });

/** Arco previsível; os textos privados têm marcas (SEGREDO-, CENA-, DESFECHO-) para os testes procurarem vazamentos. */
function arcoFalso(prompt) {
  const tema = (prompt.match(/^TEMA: (.+?) \(/m) || [])[1] || "?";
  const semente = (prompt.match(/^ELEMENTO-SEMENTE[^:]*: (.+)$/m) || [])[1] || "";
  return {
    titulo: `O Sino Roubado (${tema})`,
    premissa: `Um sino sagrado sumiu. Semente: ${semente}`,
    vilao: { nome: "Vária Corvo", motivacao: "SEGREDO-VILAO quer silenciar a cidade." },
    atos: [
      { nome: "A Chegada", objetivo: "Descobrir quem roubou o sino.", segredo: "SEGREDO-1", cenas: ["CENA-1a", "CENA-1b"] },
      { nome: "O Cerco", objetivo: "Encontrar o esconderijo do ladrão.", segredo: "SEGREDO-2", cenas: ["CENA-2a"] },
      { nome: "O Último Toque", objetivo: "Recuperar o sino antes da meia-noite.", segredo: "SEGREDO-3", cenas: ["CENA-3a"] },
    ],
    desfechos: ["DESFECHO-vitoria", "DESFECHO-derrota", "DESFECHO-meio"],
  };
}

const GOBLINS = [{ nome: "Goblin 1", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2 }, { nome: "Goblin 2", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2 }];

/** Combate com mapa: o grupo na linha 13 (y=12), os goblins 4 casas acima (y=8), ao alcance de um avanço de 5 casas. */
function combateComMapa(ids) {
  return {
    inimigos: GOBLINS.map((g, i) => ({ ...g, alcance: "corpo", x: 4 + i, y: 8 })),
    mapa: { descricao: "Trilha de pedra entre pilares caídos", colunas: 10, linhas: 14, terreno: [
      { tipo: "obstaculo", x: 0, y: 4, l: 2, a: 2, nome: "Pilar caído" },
      { tipo: "cobertura", x: 8, y: 5, l: 1, a: 1, nome: "Caixotes" },
      { tipo: "agua", x: 0, y: 1, l: 3, a: 1, nome: "Poça funda" }] },
    posicoes: Object.fromEntries(ids.map((id, i) => [id, { x: 4 + i, y: 12 }])),
  };
}
/** Mapa errado de propósito: grade grande demais, tipo inválido, muralha que isola, posições fora e sobrepostas. */
function combateTorto(ids) {
  return {
    inimigos: GOBLINS.map((g) => ({ ...g, alcance: "longe", x: 3, y: 3 })),
    mapa: { descricao: "Muralha", colunas: 50, linhas: 2, terreno: [
      { tipo: "lava", x: 1, y: 1, l: 2, a: 2, nome: "Lava" },
      { tipo: "obstaculo", x: -2, y: 7, l: 30, a: 1, nome: "Muralha" },
      { tipo: "dificil", x: 20, y: 20, l: 2, a: 2, nome: "Fora" }] },
    posicoes: Object.fromEntries(ids.map((id) => [id, { x: 4, y: 40 }])),
  };
}

function decidir(prompt) {
  if (prompt.includes("TAREFA: CRIAR O ARCO DA AVENTURA")) {
    contagem.arco++;
    if (prompt.includes("arco-falha")) throw new Error("falha simulada do arco");
    if (prompt.includes("arco-torto")) return { titulo: "Sem atos" };
    return arcoFalso(prompt);
  }
  const ev = prompt.slice(prompt.lastIndexOf("EVENTO:"));
  const nomes = [...prompt.matchAll(/^- (.+?) \[id /gm)].map((m) => m[1]);
  const atoAtual = Number((prompt.match(/^- Ato atual: (\d)/m) || [])[1] || 1);
  if (prompt.includes("Conceito:") && !prompt.includes("EVENTO:")) {
    // uma maga com escolhas erradas de propósito: magia de 3º círculo, magia inventada, 3 truques e itens inválidos
    if (/Conceito: .*maga/.test(prompt)) {
      return { nome: "Lia Sombra-Clara", sexo: "Feminino", raca: "Elfo", classe: "Mago", antecedente: "Sábia",
        atributos: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, ca: 12, pericias: ["Arcanismo", "História"],
        ataques: [{ nome: "Cajado", bonus: 1, dano: "1d6-1", alcance: "corpo" }],
        magias: [{ nome: "Bola de Fogo", descricao: "fogo" }, { nome: "Mísseis Mágicos", descricao: "Dardos de luz azul." }, { nome: "Desejo Supremo" },
          { nome: "Mãos Mágicas" }, { nome: "Raio de Gelo" }, { nome: "Toque Chocante" }],
        inventario: [{ nome: "Grimório", qtd: 1, tipo: "equipamento", efeito: "cura 9d99" }, { nome: "Dinamite", qtd: 3, tipo: "explosivo", efeito: "dano 6d6" },
          { nome: "Tônico de cura", qtd: 1, tipo: "pocao", efeito: "cura 2d4+2", descricao: "Erva amarga." }], dica: "Fique longe da linha de frente." };
    }
    return { nome: "Thorin Pé-de-Ferro", sexo: "Masculino", raca: "Anão", classe: "Guerreiro", antecedente: "Ferreiro",
      atributos: { for: 16, des: 12, con: 15, int: 8, sab: 12, car: 9 }, ca: 16, pericias: ["Atletismo", "Intimidação"],
      ataques: [{ nome: "Machado de batalha", bonus: 5, dano: "1d8+3" }], dica: "Use a força para abrir caminho." };
  }
  if (prompt.includes("sugira 3 ações")) return ["Pergunto a Odila sobre a mina.", "Procuro rastros.", "Pago uma rodada."];
  if (ev.includes("Abertura da sessão")) return { narracao: `No começo da história, ${nomes.join(" e ")} ouvem passos.`, cena: "Praça do Sino", resumo: "O grupo chegou à praça.", ato: 3, fim: true };
  if (prompt.includes("Turno dos inimigos")) return { narracao: "Os goblins atacam com fúria." };
  if (ev.includes("Narre em UMA frase curta")) {
    if (ev.includes("Bomba de fumaça")) return { narracao: "A fumaça cinza cobre o campo.", elementos: ["fumaça espessa"] };
    return { narracao: "O efeito se espalha pela cena." };
  }
  if (ev.includes("Resultado de um teste")) {
    // uma ação com "torre do sino" cumpre o objetivo do ato no resultado da rolagem
    if (prompt.includes("torre do sino")) return { narracao: "Do alto da torre, vocês veem tudo.", ato: atoAtual + 1, ajuste_arco: "O grupo viu o esconderijo do alto da torre." };
    return { narracao: "O resultado se desenrola diante de todos." };
  }
  const m = ev.match(/^EVENTO: (.+?) \(id (\w+)\) declara a ação: "([\s\S]*?)"\n/);
  if (m) {
    const [, , uid, acao] = m;
    const a = acao.toLowerCase();
    const emCombate = prompt.includes("EM COMBATE");
    const linha = prompt.split("\n").find((l) => l.includes(`[id ${uid}]`)) || "";
    const ataque = (linha.match(/Ataques: (.+?) \(/) || [])[1] || "";
    const alvo = (prompt.match(/\[id (ini_\d+)\]: PV [1-9]/) || [])[1];
    if (a.includes("prefacio")) return "Claro! Aqui está:\n" + JSON.stringify({ narracao: "Você olha ao redor." });
    if (a.includes("falhar")) throw new Error("falha simulada");
    if (emCombate && a.includes("bazuca")) return { narracao: "Você procura a bazuca.", teste: { tipo: "ataque", ataque: "Bazuca", alvo } };
    if (emCombate && a.includes("bola de fogo")) return { narracao: "As chamas crescem nas suas mãos.", teste: { tipo: "ataque", ataque: "Bola de Fogo", alvo } };
    if (a.includes("durmo")) return { narracao: "Vocês dormem até o sol nascer.", novo_dia: true };
    if (a.includes("saqueio")) return { narracao: "No baú há poções e uma corda.", itens: [
      { alvo: uid, ganha: { nome: "Poção de cura", qtd: 2, tipo: "pocao", efeito: "cura 2d4+2", descricao: "Frasco vermelho" } },
      { alvo: uid, ganha: { nome: "Corda", qtd: 1, tipo: "equipamento", efeito: "", descricao: "15 metros" } },
      { alvo: uid, ganha: { nome: "Bomba de fumaça", qtd: 1, tipo: "rapido", efeito: "" } }] };
    if (a.includes("item invalido")) return { narracao: "Você acha coisas estranhas.", itens: [
      { alvo: uid, ganha: { nome: "Poção do dragão", qtd: 1, tipo: "pocao", efeito: "dano 9d9" } },
      { alvo: uid, ganha: { nome: "Poção enorme", qtd: 1, tipo: "pocao", efeito: "cura 50d100" } },
      { alvo: uid, ganha: { nome: "Flecha", qtd: 50, tipo: "municao" } },
      { alvo: uid, ganha: { nome: "Espada mágica", qtd: 1, tipo: "arma" } },
      { alvo: uid, ganha: { nome: "Pedra curativa", qtd: 1, tipo: "equipamento", efeito: "cura 1d4" } },
      { alvo: "ninguem", ganha: { nome: "Ouro", qtd: 1, tipo: "outro" } },
      { alvo: uid, ganha: { nome: "Moeda de prata", qtd: 3, tipo: "outro", efeito: "" } }] };
    if (a.includes("quebro a corda")) return { narracao: "A corda arrebenta.", itens: [{ alvo: uid, perde: { nome: "corda", qtd: 1 } }, { alvo: uid, perde: { nome: "Lança", qtd: 1 } }] };
    if (a.includes("dinamite")) return { narracao: "Você revira a mochila, mas não há dinamite nenhuma ali." };
    if (emCombate && a.includes("golpeio")) return { narracao: "Você golpeia!", teste: { tipo: "ataque", ataque: ataque.toUpperCase(), alvo } };
    if (emCombate && /atac|ataco/.test(a)) return { narracao: "Você avança!", teste: { tipo: "ataque", ataque, alvo } };
    const ids = [...prompt.matchAll(/^- .+? \[id (\w+)\]: /gm)].map((x) => x[1]).filter((id) => !id.startsWith("ini_"));
    if (!emCombate && a.includes("goblin") && a.includes("sem mapa")) return { narracao: "Dois goblins saltam das sombras!", combate: { inimigos: GOBLINS } };
    if (!emCombate && a.includes("goblin") && a.includes("torto")) return { narracao: "Dois goblins saltam do muro!", combate: combateTorto(ids) };
    if (!emCombate && a.includes("goblin")) return { narracao: "Dois goblins saltam das sombras!", combate: combateComMapa(ids) };
    if (emCombate && a.includes("refor")) return { narracao: "Mais goblins chegam!", combate: { inimigos: [...GOBLINS, { nome: "Goblin 3", pv: 7, ca: 13, ataque: 4, dano: "1d6+2", des: 2, alcance: "distancia", x: 9, y: 0 }] } };
    if (a.includes("cumpro o objetivo")) return { narracao: "A história dá uma virada.", ato: atoAtual + 1 };
    if (a.includes("salto para o fim")) return { narracao: "Tudo acontece de uma vez!", ato: 3 };
    if (a.includes("encerro a história")) return { narracao: "E assim a história termina.", fim: true };
    if (a.includes("mudo o rumo")) return { narracao: "O vilão hesita.", ajuste_arco: `Ajuste ${Date.now() % 100000}: o vilão agora deve um favor ao grupo.` };
    if (a.includes("escal")) return { narracao: "O muro é alto e úmido.", teste: { tipo: "pericia", pericia: "atletismo", cd: 12, motivo: "muro úmido" } };
    return { narracao: "A taverna reage ao que você fez.", cena: "Taverna Javali Cego" };
  }
  return { narracao: "..." };
}

globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://openrouter.ai/api/v1/images")) {
    const n = ++contagem.imagem;
    registro.imagens.push(JSON.parse(opts.body).prompt);
    if (registro.portaoImagem) await registro.portaoImagem;
    return resposta({ data: [{ url: `https://imagens.exemplo/img${n}.png` }] });
  }
  if (u.startsWith("https://openrouter.ai/api/v1/chat")) {
    contagem.texto++;
    const prompt = JSON.parse(opts.body).messages.map((x) => x.content).join("\n");
    registro.ultimoPrompt = prompt;
    let r;
    try { r = decidir(prompt); } catch { return new Response("erro", { status: 500 }); }
    return resposta({ choices: [{ message: { content: typeof r === "string" ? r : JSON.stringify(r) } }] });
  }
  return fetchReal(url, opts);
};

module.exports = { contagem, registro };
