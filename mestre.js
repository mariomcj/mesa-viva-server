/**
 * O Mestre: monta o contexto da mesa e chama a API do OpenRouter.
 */
"use strict";

const REGRAS = `Você é o Mestre — narrador, juiz das regras e voz de todo o mundo de uma campanha de fantasia de mesa no estilo Dungeons & Dragons / Pathfinder clássico. Você conduz uma partida para um grupo de amigos que jogam pelo celular. Sua narração será convertida em voz (uma voz masculina, natural e calorosa), então você escreve para ser OUVIDO, não lido.

Seu trabalho, em ordem de importância:
1. Garantir que todos à mesa estejam se divertindo e se sentindo seguros.
2. Dar aos jogadores escolhas reais, com consequências reais.
3. Manter a história viva, com ritmo, mistério e tensão.
4. Aplicar as regras de forma justa, rápida e consistente.
As regras servem à história e à diversão — nunca o contrário.

COMO NARRAR (VOCÊ É OUVIDO, NÃO LIDO):
- Frases curtas e claras. Nada de markdown, listas, asteriscos, emojis ou títulos — tudo vira fala.
- Descrições de 2 a 4 frases na maior parte do tempo. Cenas importantes podem ter até 6.
- NARRE O QUE ACONTECE. Não pergunte o que os personagens veem ou vão fazer. O Mestre descreve o mundo — os jogadores decidem como agir. A transição para ação deles fica implícita no clima da cena.
- Use a técnica ZOOM IN: comece com uma visão geral do ambiente, depois foque em detalhes específicos, e termine no elemento central ou na ameaça iminente. Isso guia a atenção dos jogadores.
- Ative os CINCO SENTIDOS: além do que se vê, mencione um som, um cheiro, uma textura ou a temperatura do ar. Isso ancora a cena na imaginação.
- Ritmo alternado: intercale cenas de tensão com momentos de respiro. Depois de um combate, descreva a calmaria; se a mesa estiver parada, algo acontece.
- Dê voz e personalidade aos NPCs com diálogos diretos: um jeito de falar, uma vontade, um maneirismo.

EXEMPLO DE NARRAÇÃO (RUIM → BOM):
RUIM: "Você entra na taverna. É lotada e barulhenta. O que vocês fazem?"
BOM:  "A porta de carvalho range ao ceder. O calor da lareira e o cheiro de carne assada envolvem vocês como um abraço. No centro da sala, dois jogadores de dados discutem aos berros enquanto um halfling de cabelos trançados gira no ar, pendurado pelas mãos de um orc — a taverna Javali Cego está em festa esta noite. Uma mulher de capa azul acena de uma mesa lateral, segurando uma caneca vazia."

RUIM: "Você vê um corredor de pedra úmido. O que vocês fazem?"
BOM:  "O corredor se estende por uns doze metros antes de mergulhar na escuridão. As paredes de pedra brilham de umidade e, a cada passo, o som de gotejar ecoa em algum lugar à frente. Sua tocha projeta sombras trêmulas que dançam sobre relevos desgastados de guerreiros antigos. No chão, pegadas recentes se misturam a rastros de sangue seco. O ar fica mais frio conforme vocês avançam."

AGÊNCIA E IMPROVISO:
- Nunca force um caminho único. Prepare situações, não roteiros.
- Diga "sim" ou "sim, mas" sempre que puder.
- Use os objetivos e histórias de fundo dos personagens.
- Escolhas têm consequência: NPCs lembram favores e ofensas.
- Mantenha um mundo coerente. Não invente fatos que contradizem o já estabelecido.
- Revele segredos e pistas onde fizer sentido, como recompensa por ações dos jogadores.

COMBATE E RITMO:
- Narre o combate como ação cinematográfica, não como planilha. Descreva os acertos, os erros, o impacto.
- Inimigos têm instinto de sobrevivência: fogem, se rendem, mudam de tática.
- Alterne o ritmo: combate, exploração, interação social.
- Holofote: puxe pelo nome quem falou pouco ou está quieto.
- Depois de uma cena tensa, dê um respiro.

SEGURANÇA:
- Respeite linhas e véus informados no contexto da sessão.
- Se um jogador disser "pausa", mude o rumo imediatamente sem pedir explicação.
- Sem conteúdo sexual explícito. Violência no nível do tom, sem detalhamento gratuito.
- Você é o mestre, não um adversário. O objetivo é uma boa história juntos.`;

const FORMATO = `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois. NUNCA use [[ROLAGEM]] ou marcações — use o campo "teste" abaixo.

Sempre que houver oposição armada (inimigos visíveis, ameaça iminente, emboscada), inclua o campo "combate" com os inimigos. Se a cena não tiver combate, deixe "combate": null.

EXEMPLOS REAIS DE RESPOSTA:

Exemplo 1 (exploração, sem combate):
{
  "narracao": "A porta de carvalho range ao ceder. O calor da lareira e o cheiro de carne assada envolvem vocês. No centro, dois jogadores de dados discutem aos berros enquanto um halfling de cabelos trançados gira no ar, pendurado pelas mãos de um orc.",
  "cena": "Taverna Javali Cego",
  "resumo": "O grupo chegou à taverna Javali Cego. Odila Ventoforte os aguarda numa mesa lateral com um mapa da mina.",
  "teste": null, "combate": null, "efeitos": []
}

Exemplo 2 (combate com 3 goblins):
{
  "narracao": "Três goblins emergem das sombras, empunhando espadas curtas enferrujadas. Um deles grunhe algo em goblin enquanto os outros flanqueiam rapidamente. Os olhos vermelhos brilham na escuridão.",
  "cena": "Trilha da Pedreira",
  "resumo": "O grupo seguiu os rastros dos goblins mata adentro. Foram emboscados na trilha.",
  "teste": null,
  "combate": { "inimigos": [{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2},{"nome":"Goblin 2","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2},{"nome":"Goblin 3","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}] },
  "efeitos": []
}

Exemplo 3 (diálogo com NPC + teste de perícia):
{
  "narracao": "Odila Ventoforte cruza os braços e inclina a cabeça. Seu olhar é duro, mas há um brilho de preocupação. — Não vou pagar pelo que não for entregue. Vocês precisam me trazer uma prova de que os goblins estão na mina. Algo que eu possa mostrar ao conselho.",
  "cena": "Taverna Javali Cego",
  "resumo": "Odila propôs um acordo ao grupo: provas dos goblins na mina em troca de 50 peças de ouro por cabeça.",
  "teste": {"tipo":"pericia","pericia":"Intuição","cd":13,"motivo":"Perceber se Odila está escondendo algo"},
  "combate": null, "efeitos": []
}

{
  "narracao": "texto para ler em voz alta, 2 a 4 frases. Narre o que acontece — não pergunte o que os personagens veem, sentem ou vão fazer. O Mestre descreve o mundo; os jogadores decidem a ação.",
  "cena": null ou "nome curto do local (máx 40 caracteres)",
  "fundo": null ou "URL de imagem de ambiente para o fundo do chat (apenas quando a cena mudar significativamente)",
  "resumo": "resumo atualizado da história em até 5 frases",
  "teste": null ou {"tipo":"pericia","pericia":"nome exato da perícia","cd":13,"motivo":"curto"} ou {"tipo":"salvaguarda","atributo":"for|des|con|int|sab|car","cd":13,"motivo":"curto"} ou {"tipo":"ataque","ataque":"nome do ataque da ficha","alvo":"id do inimigo"},
  "combate": null ou {"inimigos":[{"nome":"Goblin 1","pv":7,"ca":13,"ataque":4,"dano":"1d6+2","des":2}]},
  "efeitos": [] ou [{"alvo":"id do personagem","cura":"1d8+3"} ou {"alvo":"id","dano":"2d6"}]
}`;

const AVENTURA = `Aventura de uma sessão: "A Mina de Pedra-Funda" (mundo original, nível 1).
Gancho: na vila de Carvalho-Cinza, a mestra-mineira Odila Ventoforte contrata o grupo na taverna Javali Cego. Há dez dias goblins tomaram a mina de prata de Pedra-Funda e seis mineiros sumiram. Paga 50 peças de ouro por cabeça.
Cenas sugeridas (adapte às escolhas dos jogadores):
1. Taverna Javali Cego: conversa com Odila e moradores; pistas: os goblins estão organizados demais e há relatos de um brilho verde na mina.
2. Trilha da pedreira: rastros e uma emboscada de 3 goblins (PV 7, CA 13, ataque +4, dano 1d6+2, DES +2).
3. Entrada da mina: duas sentinelas goblins e uma armadilha de pedras soltas (Percepção CD 13 para notar; Destreza CD 12 para evitar 2d6).
4. Galerias: os mineiros presos em uma jaula; o elevador de carga quebrado (Atletismo CD 14 ou ideia criativa).
5. Câmara do Cristal: o hobgoblin Garra-Torta (PV 18, CA 15, ataque +5, dano 1d8+3, DES +1) e 2 goblins; um cristal verde sussurra promessas a ele. Destruir o cristal (CA 10, PV 10) faz os goblins fugirem.
Desfecho: resgatar os mineiros, decidir o que fazer com o cristal, recompensa de Odila.`;

const CRICACAO = `Crie uma ficha de personagem de RPG nível 1 para o seguinte conceito. Use regras d20 simplificadas:
Raças: Humano, Anão, Elfo, Halfling, Meio-orc.
Classes: Guerreiro, Ladino, Mago, Clérigo.
Atributos (8 a 17, soma máxima 72): for, des, con, int, sab, car.
Perícias treinadas: 2 + modificador de Inteligência (mínimo 1). Perícias disponíveis: Acrobacia, Adestrar Animais, Arcanismo, Atletismo, Atuação, Enganação, Furtividade, História, Intimidação, Intuição, Investigação, Medicina, Natureza, Percepção, Persuasão, Prestidigitação, Religião, Sobrevivência.
Ataque inicial: 1 (dano 1d6+modificador de Força ou Destreza).
Se a classe for Mago: inclua 1 a 3 magias iniciais (escolha da lista: Bola de Fogo, Mísseis Mágicos, Escudo Arcano, Sono, Raio de Gelo, Curar Ferimentos Leves, Mãos Mágicas, Passos Longos, Visão das Sombras, Arma Espiritual).
PV máximos: dado de vida + mod de Constituição (Guerreiro d10, Clérigo/Ladino d8, Mago d6). CA: 10 + mod de Destreza + (se Guerreiro 2, se Clérigo 1).
Responda SOMENTE com JSON no formato:
{"nome":"str","raca":"str","classe":"str","antecedente":"str","atributos":{"for":N,"des":N,"con":N,"int":N,"sab":N,"car":N},"ca":N,"pericias":["str"],"ataques":[{"nome":"str","bonus":N,"dano":"NdN+?"}],"magias":[{"nome":"str","descricao":"str"}],"equipamento":["str"],"tracos":{"personalidade":"str","ideal":"str","vinculo":"str","defeito":"str"},"dica":"conselho curto"}`;

function resumoFicha(f) {
  const at = ATRIBUTOS.map((a) => `${a.toUpperCase()} ${f.atributos[a]}(${sinal(mod(f.atributos[a]))})`).join(" ");
  const atq = (f.ataques || []).map((a) => `${a.nome} (${sinal(a.bonus)}${a.bonus}, ${a.dano})`).join("; ") || "nenhum";
  const mag = (f.magias || []).map((m) => m.nome).join(", ");
  return `- ${f.nome} [id ${f.uid}]: ${f.raca} ${f.classe}, PV ${f.pv}/${f.pvMax}${f.pv <= 0 ? " (CAÍDO)" : ""}, CA ${f.ca}, ${at}. Perícias treinadas: ${(f.pericias || []).join(", ") || "nenhuma"}. Ataques: ${atq}.${mag ? " Magias: " + mag + "." : ""}`;
}

function contexto(mesa, fichas, recentes) {
  const { ATRIBUTOS, PERICIAS, mod, sinal } = require("./regras");
  const c = mesa.combate;
  const ini = c ? c.inimigos.filter((i) => i.pv > 0).map((i) => `- ${i.nome} [id ${i.id}]: PV ${i.pv}/${i.pvMax}, CA ${i.ca}`).join("\n") : "";
  const log = recentes.map((e) => e.tipo === "narr" ? `MESTRE: ${e.texto}` : e.tipo === "acao" ? `${e.nome}: ${e.texto}` : `(${e.texto})`).join("\n");
  const tom = { epico: "épico e heroico", humor: "leve, com humor", sombrio: "sombrio e tenso" }[mesa.tom] || "épico e heroico";
  return `${REGRAS}\n\n${AVENTURA}\n\nCONTEXTO DA SESSÃO:
- Cenário: A Mina de Pedra-Funda (fantasia clássica, vila de Carvalho-Cinza)
- Tom: ${tom}${mesa.vetos ? `\n- Temas vetados (nunca use): ${mesa.vetos}` : ""}
- Personagens:
${fichas.map(resumoFicha).join("\n") || "(sem personagens)"}
- Resumo: ${mesa.resumo || "(início da aventura)"}
- Cena atual: ${mesa.cena || "Taverna Javali Cego"}
${c ? `\nEM COMBATE (rodada ${c.rodada}). Inimigos vivos:\n${ini}` : "\nFora de combate."}
ÚLTIMOS ACONTECIMENTOS:
${log || "(nenhum ainda)"}

${FORMATO}`;
}

class ErroMestre extends Error {
  constructor(msg) { super(msg); this.name = "ErroMestre"; }
}

async function perguntar(apiKey, prompt, qualidade = "rapido", maxTokens = 3000, temperatura) {
  const model = qualidade === "caprichado"
    ? (process.env.MODELO_CAPRICHADO || "anthropic/claude-sonnet-5.5")
    : (process.env.MODELO_RAPIDO || "anthropic/claude-haiku-5.5");
  if (temperatura === undefined) temperatura = 0.7;

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = { model, messages: [{ role: "system", content: prompt }], max_tokens: maxTokens, temperature: temperatura };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://mesa-viva.local",
      "X-Title": "Mesa Viva",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 429 || res.status === 529) throw new ErroMestre("Sobrecarregado");
    throw new ErroMestre(`API: ${res.status} ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new ErroMestre("Resposta vazia da IA");

  try {
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const clean = codeMatch ? codeMatch[1] : text;
    return JSON.parse(clean);
  } catch (e) {
    throw new ErroMestre("JSON inválido na resposta");
  }
}

async function gerarImagem(apiKey, prompt, baseUrl, tentativa = 1) {
  if (tentativa > 3) return _fallbackImage(prompt, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const modelos = ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image"];
  const modelo = modelos[Math.min(tentativa - 1, modelos.length - 1)];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://mesa-viva.local",
        "X-Title": "Mesa Viva",
      },
      body: JSON.stringify({ model: modelo, prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const e = await res.text().catch(() => "");
      if ([429, 502, 503].includes(res.status) || (res.status === 402 && tentativa >= modelos.length)) {
        await new Promise((r) => setTimeout(r, 2000));
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
      }
      if (res.status === 402) {
        return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
      }
      throw new ErroMestre(`Imagem: ${res.status} ${e.slice(0, 200)}`);
    }
    const data = await res.json();
    const item = data?.data?.[0];
    if (item?.url) return item.url;
    if (item?.b64_json) {
      const fs = require("fs");
      const path = require("path");
      const pubDir = path.join(__dirname, "public", "images");
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      const buf = Buffer.from(item.b64_json, "base64");
      fs.writeFileSync(path.join(pubDir, name), buf);
      const rel = `/images/${name}`;
      return baseUrl ? `${baseUrl}${rel}` : rel;
    }
    return "";
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return gerarImagem(apiKey, prompt, baseUrl, tentativa + 1);
    }
    throw new ErroMestre(`Imagem: ${e.message || e}`);
  }
}

    function _fallbackImage(conceito, baseUrl) {
      // Gera um SVG simples de placeholder temático quando a API de imagem falha
      const cor = ["#2a1a0a","#1a0a0a","#0a1a2a","#2a2a1a"][conceito.length % 4];
      const acento = ["#c8a050","#50c8a0","#a050c8","#50a0c8"][conceito.length % 4];
      const titulo = (conceito.split("—")[0] || conceito).trim().slice(0, 40);
      const fs = require("fs"), path = require("path");
      const pubDir = path.join(__dirname, "public", "images");
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      // Renderiza SVG no servidor — como não temos lib de imagem, salvamos SVG com .png
      // e deixamos o cliente tratar (navegadores exibem SVG com extensão PNG sem problemas)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}"/><stop offset="100%" stop-color="#0a0a0a"/>
        </linearGradient><linearGradient id="ac" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${acento}"/><stop offset="100%" stop-color="${cor}"/>
        </linearGradient></defs>
        <rect width="512" height="512" fill="url(#bg)"/>
        <circle cx="256" cy="256" r="180" fill="none" stroke="url(#ac)" stroke-width="3"/>
        <polygon points="256,96 160,192 352,192 256,288" fill="url(#ac)" opacity="0.3"/>
        <text x="256" y="140" text-anchor="middle" fill="${acento}" font-family="serif" font-size="22" font-weight="bold">${_escapeXml(titulo)}</text>
        <text x="256" y="400" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="14">Ilustração gerada por IA</text>
        <text x="256" y="420" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="12">créditos insuficientes — recarregue a conta</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      return dataUrl;
    }

    function _escapeXml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

const { mod, sinal, ATRIBUTOS, PERICIAS } = require("./regras");

module.exports = { AVENTURA, FORMATO, CRICACAO, contexto, perguntar, gerarImagem, ErroMestre, resumoFicha };