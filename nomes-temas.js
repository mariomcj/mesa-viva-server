/**
 * Nomes do tema: como raças, classes, magias e técnicas APARECEM em cada tema (só a exibição).
 *
 * A mecânica não muda: a ficha, as rotas e o catálogo continuam com os nomes mecânicos
 * ("Elfo", "Mago", "Bola de Fogo"); o app e os textos do servidor mostram o nome do tema
 * ("Modelo de Luxo", "Hacker", "Granada Incendiária"). Cada tema segue o texto `fichas` de temas.js.
 *
 * Formato final de cada tema (contrato servidor ↔ app):
 *   { racas: { "Humano": {nome, descricao}, … }, classes: { "Guerreiro": {nome, descricao}, … },
 *     magias: { "<nome mecânico>": "nome no tema" }, tecnicas: { … }, atributoMagia: "Mana" | "Bateria" | … }
 * `nome` até 22 caracteres; `descricao` uma frase (até 90) com a mecânica entre parênteses.
 *
 * Aqui os dados ficam compactos: raça e classe como [nome, frase sem a mecânica]; a mecânica
 * entre parênteses é acrescentada por `montar`, igual em todos os temas.
 *
 * Propriedade intelectual: só nomes originais ou de domínio público (mitologias, folclore,
 * contos de fadas, lendas arturianas). Nada de termos próprios de obras protegidas.
 */
"use strict";

const C = require("./catalogo");

const SUFIXO_RACA = (mec) => `(como ${mec})`;
const SUFIXO_CLASSE = {
  Guerreiro: "(luta como Guerreiro)",
  Ladino: "(age como Ladino, por Destreza)",
  Mago: "(conjura como Mago, por Inteligência)",
  Clérigo: "(conjura como Clérigo, por Sabedoria)",
};

const DADOS = {
  // ── Fantasia Clássica: os próprios nomes de D&D ──
  classico: {
    racas: {
      Humano: ["Humano", "Gente versátil e ambiciosa dos reinos e das vilas (raça clássica)"],
      Anão: ["Anão", "Povo robusto das montanhas, mestre da pedra e do metal (raça clássica)"],
      Elfo: ["Elfo", "Povo gracioso e longevo das florestas antigas (raça clássica)"],
      Halfling: ["Halfling", "Gente pequena, ágil e de sorte, amiga do conforto (raça clássica)"],
      "Meio-orc": ["Meio-orc", "Forte e resistente, filho de dois povos (raça clássica)"],
    },
    classes: {
      Guerreiro: ["Guerreiro", "Mestre das armas e das armaduras (luta com armas)"],
      Ladino: ["Ladino", "Furtivo, ágil e cheio de truques (age por Destreza)"],
      Mago: ["Mago", "Estudioso dos segredos arcanos (conjura por Inteligência)"],
      Clérigo: ["Clérigo", "Servo de um deus, cura e protege (conjura por Sabedoria)"],
    },
    magias: null,   // os nomes mecânicos
    tecnicas: null,
    atributoMagia: "Mana",
  },

  // ── Escola de Magia ──
  "escola-magia": {
    racas: {
      Humano: ["Linhagem Comum", "De família comum ou de magos, aprendeu tudo do zero"],
      Anão: ["Ourives das Minas", "De uma família de ourives das minas encantadas"],
      Elfo: ["Linhagem Feérica", "Descende de um povo feérico antigo, de olhos brilhantes"],
      Halfling: ["Cria da Cozinha", "De uma família de cozinheiros e herbalistas da escola"],
      "Meio-orc": ["Guardião da Serra", "Bolsista de uma linhagem de guardiões das montanhas"],
    },
    classes: {
      Guerreiro: ["Campeão de Duelos", "Campeão de duelos e de esportes mágicos da escola"],
      Ladino: ["Mestre das Passagens", "Conhece toda passagem secreta e toda travessura"],
      Mago: ["Estudioso de Feitiços", "Aluno aplicado dos feitiços de varinha"],
      Clérigo: ["Aprendiz de Curandeiro", "Estuda cura e magia de proteção na enfermaria"],
    },
    magias: {
      "Raio de Gelo": "Feitiço de Geada", "Toque Chocante": "Toque de Faísca", "Mãos Mágicas": "Levitar Objetos",
      "Mísseis Mágicos": "Dardos Cintilantes", "Mãos Flamejantes": "Leque de Chamas", "Escudo Arcano": "Feitiço de Bloqueio",
      "Sono": "Feitiço de Sonolência", "Passos Longos": "Passos Ligeiros", "Raio Ardente": "Raio Escarlate",
      "Passo Nebuloso": "Sumiço de Fumaça", "Visão das Sombras": "Olhos de Gato", "Bola de Fogo": "Feitiço de Chama",
      "Relâmpago": "Trovão de Varinha", "Contramágica": "Feitiço Desfazedor", "Tempestade de Gelo": "Nevasca de Inverno",
      "Porta Dimensional": "Atalho Encantado", "Cone de Frio": "Sopro Glacial", "Muralha de Pedra": "Muro Conjurado",
      "Chama Sagrada": "Chispa de Luz", "Orientação": "Palavra de Incentivo", "Curar Ferimentos Leves": "Remendo Rápido",
      "Palavra Curativa": "Sussurro Curativo", "Infligir Ferimentos": "Toque Murchante", "Bênção": "Feitiço de Ânimo",
      "Arma Espiritual": "Espada Conjurada", "Oração Curativa": "Canção da Enfermaria", "Restauração Menor": "Feitiço Restaurador",
      "Espíritos Guardiões": "Fantasmas da Escola", "Revivificar": "Despertar Profundo", "Guardião da Fé": "Gárgula Guardiã",
      "Curar Ferimentos Graves": "Cura de Enfermaria", "Coluna de Chamas": "Pilar de Fogo Branco", "Cura Divina": "Cura Plena",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Bastão", "Arremesso de lança": "Arremesso de Disco", "Investida": "Avanço de Duelista",
      "Golpe giratório": "Pirueta de Duelo", "Golpe esmagador": "Pancada de Escudo", "Fúria do campeão": "Final de Campeonato",
      "Golpe devastador": "Jogada Decisiva", "Ataque furtivo": "Travessura Certeira", "Tiro furtivo": "Bolinha de Estilingue",
      "Golpe nas costas": "Rasteira Traiçoeira", "Disparo preciso": "Pontaria de Monitor", "Golpe mortal": "Golpe Proibido",
      "Lâmina na sombra": "Sumiço e Ataque",
    },
    atributoMagia: "Magia",
  },

  // ── A Grande Jornada ──
  "grande-jornada": {
    racas: {
      Humano: ["Guardião da Fronteira", "Guardião de fronteira ou herdeiro de um reino caído"],
      Anão: ["Filho da Pedra", "Guerreiro dos salões de pedra sob a montanha"],
      Elfo: ["Viajante do Ocaso", "De uma floresta antiga cujo povo está partindo"],
      Halfling: ["Gente dos Vales", "Gente pequena e pacata de vales verdes, sem gosto por aventura"],
      "Meio-orc": ["Fugitivo da Horda", "Fugiu das hordas do senhor sombrio e busca outro caminho"],
    },
    classes: {
      Guerreiro: ["Capitão da Guarda", "Escudeiro, capitão ou batedor das terras livres"],
      Ladino: ["Andarilho", "Andarilho das trilhas ou ladrão arrependido"],
      Mago: ["Sábio das Runas", "Sábio itinerante, estudioso de runas antigas"],
      Clérigo: ["Guardião do Santuário", "Guardião de um santuário e curandeiro de ervas"],
    },
    magias: {
      "Raio de Gelo": "Sopro do Inverno", "Toque Chocante": "Toque de Trovão", "Mãos Mágicas": "Mão do Vento",
      "Mísseis Mágicos": "Setas de Luz", "Mãos Flamejantes": "Labareda das Mãos", "Escudo Arcano": "Runa de Proteção",
      "Sono": "Canto do Sono", "Passos Longos": "Passo do Viajante", "Raio Ardente": "Lança de Brasa",
      "Passo Nebuloso": "Passo da Névoa", "Visão das Sombras": "Olhos de Coruja", "Bola de Fogo": "Estrela de Fogo",
      "Relâmpago": "Ira da Tempestade", "Contramágica": "Palavra de Desfazer", "Tempestade de Gelo": "Granizo da Montanha",
      "Porta Dimensional": "Caminho Oculto", "Cone de Frio": "Vento das Geleiras", "Muralha de Pedra": "Ossos da Terra",
      "Chama Sagrada": "Chama Pura", "Orientação": "Conselho dos Antigos", "Curar Ferimentos Leves": "Ervas de Cura",
      "Palavra Curativa": "Palavra de Alívio", "Infligir Ferimentos": "Toque da Sombra", "Bênção": "Canto de Coragem",
      "Arma Espiritual": "Espada de Luz", "Oração Curativa": "Canção de Cura", "Restauração Menor": "Bálsamo Antigo",
      "Espíritos Guardiões": "Sentinelas Antigas", "Revivificar": "Chamado de Volta", "Guardião da Fé": "Vigia do Santuário",
      "Curar Ferimentos Graves": "Mãos do Curador", "Coluna de Chamas": "Fogo do Céu", "Cura Divina": "Luz da Aurora",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe Firme", "Arremesso de lança": "Lança Arremessada", "Investida": "Carga da Fronteira",
      "Golpe giratório": "Roda de Aço", "Golpe esmagador": "Golpe de Martelo", "Fúria do campeão": "Fúria dos Reis",
      "Golpe devastador": "Golpe da Última Hora", "Ataque furtivo": "Ataque de Emboscada", "Tiro furtivo": "Flecha da Moita",
      "Golpe nas costas": "Faca na Trilha", "Disparo preciso": "Flecha Certeira", "Golpe mortal": "Golpe Sem Volta",
      "Lâmina na sombra": "Lâmina do Crepúsculo",
    },
    atributoMagia: "Luz",
  },

  // ── Tronos e Traições ──
  tronos: {
    racas: {
      Humano: ["Gente do Reino", "Nobre menor, servo ou soldado do reino"],
      Anão: ["Senhor das Minas", "Mestre de minas e cobrador de dívidas das montanhas"],
      Elfo: ["Último dos Antigos", "De um povo quase extinto, visto com desconfiança"],
      Halfling: ["Criado da Corte", "Criado, cozinheiro ou espião nos corredores da corte"],
      "Meio-orc": ["Filho do Gelo", "De um povo selvagem das terras geladas"],
    },
    classes: {
      Guerreiro: ["Cavaleiro Juramentado", "Cavaleiro juramentado, mercenário ou guarda"],
      Ladino: ["Mestre de Segredos", "Espião e envenenador que vive de segredos"],
      Mago: ["Alquimista da Corte", "Sábio da corte, raro e temido"],
      Clérigo: ["Sacerdote da Fé", "Sacerdote de uma fé antiga ou de uma fé nova"],
    },
    magias: {
      "Raio de Gelo": "Frasco de Geada", "Toque Chocante": "Toque da Enguia", "Mãos Mágicas": "Fios de Seda",
      "Mísseis Mágicos": "Dardos Envenenados", "Mãos Flamejantes": "Sopro de Nafta", "Escudo Arcano": "Égide de Mercúrio",
      "Sono": "Pó Sonífero", "Passos Longos": "Elixir da Pressa", "Raio Ardente": "Jato de Vitríolo",
      "Passo Nebuloso": "Fumaça e Espelhos", "Visão das Sombras": "Gotas de Beladona", "Bola de Fogo": "Fogo Alquímico",
      "Relâmpago": "Raio Engarrafado", "Contramágica": "Sal Neutralizante", "Tempestade de Gelo": "Bomba de Geada",
      "Porta Dimensional": "Passagem Secreta", "Cone de Frio": "Névoa Gélida", "Muralha de Pedra": "Muro de Argamassa",
      "Chama Sagrada": "Fogo do Juízo", "Orientação": "Conselho do Altar", "Curar Ferimentos Leves": "Unguento de Ervas",
      "Palavra Curativa": "Prece Breve", "Infligir Ferimentos": "Toque da Peste", "Bênção": "Bênção do Altar",
      "Arma Espiritual": "Espada do Juramento", "Oração Curativa": "Litania de Cura", "Restauração Menor": "Sangria Purificadora",
      "Espíritos Guardiões": "Coro dos Ancestrais", "Revivificar": "Rito da Volta", "Guardião da Fé": "Sentinela do Templo",
      "Curar Ferimentos Graves": "Cirurgia Sagrada", "Coluna de Chamas": "Pira do Julgamento", "Cura Divina": "Milagre do Altar",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Espada Longa", "Arremesso de lança": "Dardo de Caça", "Investida": "Carga de Cavalaria",
      "Golpe giratório": "Molinete", "Golpe esmagador": "Golpe de Maça", "Fúria do campeão": "Fúria do Torneio",
      "Golpe devastador": "Golpe de Misericórdia", "Ataque furtivo": "Adaga na Manga", "Tiro furtivo": "Virote na Penumbra",
      "Golpe nas costas": "Punhal nas Costas", "Disparo preciso": "Virote Certeiro", "Golpe mortal": "Beijo do Veneno",
      "Lâmina na sombra": "Lâmina do Conselho",
    },
    atributoMagia: "Alquimia",
  },

  // ── Horror Cósmico ──
  "horror-cosmico": {
    racas: {
      Humano: ["Pessoa Comum", "Qualquer pessoa que viu o que não devia"],
      Anão: ["Estivador Robusto", "Baixo e robusto, mineiro ou estivador"],
      Elfo: ["Herdeiro Recluso", "De beleza estranha, de família antiga e reclusa"],
      Halfling: ["Jornaleiro Esquecido", "Pessoa miúda e esquecida, criado ou jornaleiro"],
      "Meio-orc": ["Marinheiro Rude", "De aparência rude, marinheiro ou boxeador"],
    },
    classes: {
      Guerreiro: ["Veterano de Guerra", "Veterano da Grande Guerra ou policial"],
      Ladino: ["Detetive Particular", "Jornalista, detetive ou contrabandista de bebida"],
      Mago: ["Professor de Ocultismo", "Estudioso de línguas mortas e livros proibidos"],
      Clérigo: ["Médico de Plantão", "Padre, médico ou enfermeira que cuida dos feridos"],
    },
    magias: {
      "Raio de Gelo": "Toque do Vazio", "Toque Chocante": "Faísca de Ozônio", "Mãos Mágicas": "Mão Invisível",
      "Mísseis Mágicos": "Dardos do Abismo", "Mãos Flamejantes": "Chama Pálida", "Escudo Arcano": "Sinal de Giz",
      "Sono": "Sussurro Entorpecente", "Passos Longos": "Passo Apressado", "Raio Ardente": "Olhar Abrasador",
      "Passo Nebuloso": "Dobra no Espaço", "Visão das Sombras": "Olhos que Veem Demais", "Bola de Fogo": "Fogo Estelar",
      "Relâmpago": "Descarga Etérea", "Contramágica": "Palavra de Silêncio", "Tempestade de Gelo": "Frio do Além",
      "Porta Dimensional": "Portal Angular", "Cone de Frio": "Hálito do Vácuo", "Muralha de Pedra": "Muro de Basalto",
      "Chama Sagrada": "Luz da Vela Benta", "Orientação": "Pressentimento", "Curar Ferimentos Leves": "Bandagem e Prece",
      "Palavra Curativa": "Palavra de Conforto", "Infligir Ferimentos": "Toque Pestilento", "Bênção": "Medalha Benta",
      "Arma Espiritual": "Lâmina Fantasma", "Oração Curativa": "Terço Rezado", "Restauração Menor": "Sais Aromáticos",
      "Espíritos Guardiões": "Círculo de Sal", "Revivificar": "Volta do Limiar", "Guardião da Fé": "Anjo da Guarda",
      "Curar Ferimentos Graves": "Cirurgia de Campo", "Coluna de Chamas": "Fogo Purificador", "Cura Divina": "Milagre Inexplicável",
    },
    tecnicas: {
      "Golpe poderoso": "Coronhada", "Arremesso de lança": "Faca Arremessada", "Investida": "Avanço de Trincheira",
      "Golpe giratório": "Golpe em Arco", "Golpe esmagador": "Golpe de Pé-de-Cabra", "Fúria do campeão": "Fúria do Sobrevivente",
      "Golpe devastador": "Tiro à Queima-Roupa", "Ataque furtivo": "Navalhada", "Tiro furtivo": "Tiro no Escuro",
      "Golpe nas costas": "Golpe Traiçoeiro", "Disparo preciso": "Tiro Calculado", "Golpe mortal": "Golpe Silencioso",
      "Lâmina na sombra": "Lâmina na Penumbra",
    },
    atributoMagia: "Vontade",
  },

  // ── Mares de Piratas ──
  piratas: {
    racas: {
      Humano: ["Marujo de Porto", "Marinheiro de qualquer porto"],
      Anão: ["Mestre-Artilheiro", "Mestre-artilheiro ou carpinteiro de bordo"],
      Elfo: ["Filho das Ilhas", "Navegador de olhos cor de tempestade, nascido entre as ilhas"],
      Halfling: ["Grumete", "Grumete, cozinheiro ou batedor de carteiras do porto"],
      "Meio-orc": ["Arpoador", "Arpoador ou brutamontes de abordagem"],
    },
    classes: {
      Guerreiro: ["Espadachim", "Espadachim, artilheiro ou contramestre"],
      Ladino: ["Contrabandista", "Contrabandista, trapaceiro ou ladrão do cais"],
      Mago: ["Feiticeiro do Mar", "Lê mapas encantados e fala com as marés"],
      Clérigo: ["Devoto das Marés", "Curandeiro de bordo, devoto de uma deusa do mar"],
    },
    magias: {
      "Raio de Gelo": "Jato do Fundo do Mar", "Toque Chocante": "Choque de Enguia", "Mãos Mágicas": "Mão da Maresia",
      "Mísseis Mágicos": "Chuva de Conchas", "Mãos Flamejantes": "Sopro de Pólvora", "Escudo Arcano": "Escudo de Espuma",
      "Sono": "Canto de Sereia", "Passos Longos": "Correr sobre Ondas", "Raio Ardente": "Bala Incandescente",
      "Passo Nebuloso": "Sumir na Neblina", "Visão das Sombras": "Luneta Encantada", "Bola de Fogo": "Barril de Pólvora",
      "Relâmpago": "Raio da Tormenta", "Contramágica": "Corte de Maldição", "Tempestade de Gelo": "Granizo de Alto-Mar",
      "Porta Dimensional": "Corrente Secreta", "Cone de Frio": "Vagalhão Gelado", "Muralha de Pedra": "Recife Erguido",
      "Chama Sagrada": "Fogo-de-Santelmo", "Orientação": "Vento a Favor", "Curar Ferimentos Leves": "Rum e Atadura",
      "Palavra Curativa": "Reza do Marujo", "Infligir Ferimentos": "Mordida do Escorbuto", "Bênção": "Bênção da Deusa",
      "Arma Espiritual": "Sabre Fantasma", "Oração Curativa": "Canção de Bordo", "Restauração Menor": "Remédio de Bordo",
      "Espíritos Guardiões": "Tripulação Fantasma", "Revivificar": "Devolvido pelo Mar", "Guardião da Fé": "Guardiã das Marés",
      "Curar Ferimentos Graves": "Cirurgião de Bordo", "Coluna de Chamas": "Tromba de Fogo", "Cura Divina": "Graça da Deusa",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Sabre", "Arremesso de lança": "Arpão", "Investida": "Abordagem",
      "Golpe giratório": "Giro no Convés", "Golpe esmagador": "Golpe de Âncora", "Fúria do campeão": "Fúria do Capitão",
      "Golpe devastador": "Golpe da Tempestade", "Ataque furtivo": "Facada no Cais", "Tiro furtivo": "Pistola na Manga",
      "Golpe nas costas": "Punhal de Motim", "Disparo preciso": "Tiro de Mosquete", "Golpe mortal": "Corte de Corsário",
      "Lâmina na sombra": "Lâmina da Neblina",
    },
    atributoMagia: "Maré",
  },

  // ── Faroeste Sobrenatural ──
  faroeste: {
    racas: {
      Humano: ["Colono", "Colono, vaqueiro ou imigrante em busca de terra"],
      Anão: ["Minerador Turrão", "Minerador baixinho e cabeça-dura"],
      Elfo: ["Forasteiro sem Idade", "Viajante de feições estranhas que parece nunca envelhecer"],
      Halfling: ["Telegrafista", "Jogador de cartas, telegrafista ou garoto de recados"],
      "Meio-orc": ["Braço da Ferrovia", "Boxeador de feira, peão da ferrovia ou caçador do ermo"],
    },
    classes: {
      Guerreiro: ["Pistoleiro", "Pistoleiro, xerife ou ex-soldado"],
      Ladino: ["Ladrão de Trem", "Trapaceiro de cartas, ladrão de trem ou batedor"],
      Mago: ["Bruxo da Encruzilhada", "Vendedor de elixires, cartomante ou mago de pactos"],
      Clérigo: ["Pregador Itinerante", "Pregador, curandeira ou médico de cidade pequena"],
    },
    magias: {
      "Raio de Gelo": "Sopro da Nevasca", "Toque Chocante": "Toque Elétrico", "Mãos Mágicas": "Laço Fantasma",
      "Mísseis Mágicos": "Cartas Afiadas", "Mãos Flamejantes": "Lufada de Querosene", "Escudo Arcano": "Ferradura da Sorte",
      "Sono": "Elixir do Sono", "Passos Longos": "Passo do Coiote", "Raio Ardente": "Bala de Brasa",
      "Passo Nebuloso": "Sumiço na Poeira", "Visão das Sombras": "Olhos de Coiote", "Bola de Fogo": "Dinamite Encantada",
      "Relâmpago": "Raio do Deserto", "Contramágica": "Quebra de Pacto", "Tempestade de Gelo": "Tempestade de Granizo",
      "Porta Dimensional": "Porta da Encruzilhada", "Cone de Frio": "Vento do Norte", "Muralha de Pedra": "Paredão de Rocha",
      "Chama Sagrada": "Fogo do Sermão", "Orientação": "Palavra do Pregador", "Curar Ferimentos Leves": "Oração do Pregador",
      "Palavra Curativa": "Aleluia", "Infligir Ferimentos": "Mão da Febre", "Bênção": "Bênção da Estrada",
      "Arma Espiritual": "Revólver Fantasma", "Oração Curativa": "Hino de Cura", "Restauração Menor": "Tônico Milagroso",
      "Espíritos Guardiões": "Cavaleiros Fantasmas", "Revivificar": "Volta da Cova", "Guardião da Fé": "Anjo do Deserto",
      "Curar Ferimentos Graves": "Bisturi do Doutor", "Coluna de Chamas": "Fogo e Enxofre", "Cura Divina": "Milagre na Fronteira",
    },
    tecnicas: {
      "Golpe poderoso": "Murro de Saloon", "Arremesso de lança": "Machadinha Lançada", "Investida": "Carga a Cavalo",
      "Golpe giratório": "Coronhada em Roda", "Golpe esmagador": "Cadeirada", "Fúria do campeão": "Fúria do Xerife",
      "Golpe devastador": "Duelo ao Meio-Dia", "Ataque furtivo": "Faca na Bota", "Tiro furtivo": "Tiro da Janela",
      "Golpe nas costas": "Tiro nas Costas", "Disparo preciso": "Tiro de Rifle", "Golpe mortal": "Saque Relâmpago",
      "Lâmina na sombra": "Punhal do Pôr do Sol",
    },
    atributoMagia: "Fé",
  },

  // ── Neon e Cromo ──
  cyberpunk: {
    racas: {
      Humano: ["Pele Limpa", "Pessoa comum, com poucos implantes"],
      Anão: ["Operário Reforçado", "Ex-operário de plataforma de mineração, compacto e reforçado"],
      Elfo: ["Modelo de Luxo", "Modelo genético de luxo, belo e rápido"],
      Halfling: ["Rato de Duto", "Criança de rua que cresceu e entra onde não cabe"],
      "Meio-orc": ["Brutamontes Cromado", "Lutador de músculos sintéticos e cromo à mostra"],
    },
    classes: {
      Guerreiro: ["Mercenário", "Mercenário, segurança ou ex-policial"],
      Ladino: ["Infiltrador", "Ladrão, motorista de fuga ou invasor de sistemas"],
      Mago: ["Hacker", "Hacker de interface neural"],
      Clérigo: ["Médico de Beco", "Médico clandestino ou tecnoxamã das quebradas"],
    },
    magias: {
      "Raio de Gelo": "Jato Criogênico", "Toque Chocante": "Luva de Choque", "Mãos Mágicas": "Braço Remoto",
      "Mísseis Mágicos": "Enxame de Microdrones", "Mãos Flamejantes": "Lança-Chamas de Pulso", "Escudo Arcano": "Campo de Dispersão",
      "Sono": "Pulso Neural", "Passos Longos": "Pernas Turbinadas", "Raio Ardente": "Laser de Corte",
      "Passo Nebuloso": "Camuflagem Óptica", "Visão das Sombras": "Ótica Térmica", "Bola de Fogo": "Granada Incendiária",
      "Relâmpago": "Canhão de Arco", "Contramágica": "Contra-Hack", "Tempestade de Gelo": "Chuva de Nitrogênio",
      "Porta Dimensional": "Salto de Gancho", "Cone de Frio": "Nuvem Criogênica", "Muralha de Pedra": "Barreira de Espuma",
      "Chama Sagrada": "Raio Ultravioleta", "Orientação": "Assistente Tático", "Curar Ferimentos Leves": "Nanocurativo",
      "Palavra Curativa": "Injeção Remota", "Infligir Ferimentos": "Toxina de Contato", "Bênção": "Rede de Estímulo",
      "Arma Espiritual": "Drone de Combate", "Oração Curativa": "Névoa de Nanitos", "Restauração Menor": "Purga de Sistema",
      "Espíritos Guardiões": "Enxame Guardião", "Revivificar": "Desfibrilador", "Guardião da Fé": "Torre Sentinela",
      "Curar Ferimentos Graves": "Cirurgia Expressa", "Coluna de Chamas": "Raio de Satélite", "Cura Divina": "Regeneração Total",
    },
    tecnicas: {
      "Golpe poderoso": "Soco Hidráulico", "Arremesso de lança": "Lâmina Arremessada", "Investida": "Arrancada Turbo",
      "Golpe giratório": "Giro de Lâminas", "Golpe esmagador": "Martelo Pneumático", "Fúria do campeão": "Overclock de Combate",
      "Golpe devastador": "Golpe Sobrecarga", "Ataque furtivo": "Golpe no Ponto Fraco", "Tiro furtivo": "Tiro Silenciado",
      "Golpe nas costas": "Ponto Cego", "Disparo preciso": "Tiro Inteligente", "Golpe mortal": "Corte Monofio",
      "Lâmina na sombra": "Lâmina Invisível",
    },
    atributoMagia: "Bateria",
  },

  // ── Ópera Espacial ──
  "opera-espacial": {
    racas: {
      Humano: ["Humano das Colônias", "Humano de qualquer mundo da galáxia"],
      Anão: ["Brontari", "Espécie atarracada de mundo de alta gravidade, mecânica nata"],
      Elfo: ["Velari", "Espécie esguia e longeva, sensível à Corrente"],
      Halfling: ["Lodrin", "Espécie pequena de um mundo pantanoso, curiosa e ágil"],
      "Meio-orc": ["Torvak", "Espécie grande de pele grossa, de um mundo guerreiro"],
    },
    classes: {
      Guerreiro: ["Soldado Estelar", "Soldado, piloto de caça ou caçador de recompensa"],
      Ladino: ["Contrabandista", "Contrabandista, espiã ou ladrão de naves"],
      Mago: ["Sensitivo da Corrente", "Sensitivo da Corrente ou cientista de engenhocas"],
      Clérigo: ["Médico de Campo", "Médico de campo ou guardião da ordem antiga"],
    },
    magias: {
      "Raio de Gelo": "Disparo Criogênico", "Toque Chocante": "Toque Iônico", "Mãos Mágicas": "Mover com a Mente",
      "Mísseis Mágicos": "Micromísseis", "Mãos Flamejantes": "Jato de Plasma", "Escudo Arcano": "Escudo de Energia",
      "Sono": "Toque Calmante", "Passos Longos": "Botas de Propulsão", "Raio Ardente": "Feixe Térmico",
      "Passo Nebuloso": "Salto de Fase", "Visão das Sombras": "Visor Infravermelho", "Bola de Fogo": "Granada de Plasma",
      "Relâmpago": "Descarga Iônica", "Contramágica": "Pulso Anulador", "Tempestade de Gelo": "Tempestade de Cristais",
      "Porta Dimensional": "Salto Quântico", "Cone de Frio": "Onda de Vácuo", "Muralha de Pedra": "Barreira Gravitacional",
      "Chama Sagrada": "Luz da Ordem", "Orientação": "Intuição da Corrente", "Curar Ferimentos Leves": "Spray Regenerador",
      "Palavra Curativa": "Dose Remota", "Infligir Ferimentos": "Toque Entrópico", "Bênção": "Elo da Corrente",
      "Arma Espiritual": "Lâmina Flutuante", "Oração Curativa": "Pulso Regenerador", "Restauração Menor": "Antitoxina",
      "Espíritos Guardiões": "Vórtice Protetor", "Revivificar": "Reanimação", "Guardião da Fé": "Sentinela Estelar",
      "Curar Ferimentos Graves": "Cirurgia a Laser", "Coluna de Chamas": "Raio Orbital", "Cura Divina": "Luz das Estrelas",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe Eletrificado", "Arremesso de lança": "Disco Arremessado", "Investida": "Salto com Jetpack",
      "Golpe giratório": "Giro de Lâmina", "Golpe esmagador": "Punho Blindado", "Fúria do campeão": "Fúria do Veterano",
      "Golpe devastador": "Golpe de Gravidade", "Ataque furtivo": "Faca Térmica", "Tiro furtivo": "Tiro Silencioso",
      "Golpe nas costas": "Golpe Camuflado", "Disparo preciso": "Tiro de Precisão", "Golpe mortal": "Golpe Neural",
      "Lâmina na sombra": "Lâmina Fantasma",
    },
    atributoMagia: "Energia",
  },

  // ── Terra Devastada ──
  "terra-devastada": {
    racas: {
      Humano: ["Sobrevivente", "Sobrevivente comum das ruínas"],
      Anão: ["Cria dos Túneis", "Nascido nos túneis, baixo e resistente à radiação"],
      Elfo: ["Filho do Abrigo", "Nascido num abrigo lacrado, pálido e de reflexos rápidos"],
      Halfling: ["Catador Miúdo", "Catador miúdo que entra em qualquer ruína"],
      "Meio-orc": ["Mutante", "Mutante forte, de pele marcada pela radiação"],
    },
    classes: {
      Guerreiro: ["Guarda de Comboio", "Guarda de comboio, atirador ou motorista de guerra"],
      Ladino: ["Catador", "Catador, negociante ou batedor das ruínas"],
      Mago: ["Sucateiro", "Faz milagre com sucata ou tem dons de mutante"],
      Clérigo: ["Curandeiro das Cinzas", "Médico de campo ou pregadora de uma fé nova"],
    },
    magias: {
      "Raio de Gelo": "Extintor Criogênico", "Toque Chocante": "Fio Desencapado", "Mãos Mágicas": "Garra de Sucata",
      "Mísseis Mágicos": "Rajada de Pregos", "Mãos Flamejantes": "Maçarico", "Escudo Arcano": "Placa Magnetizada",
      "Sono": "Dardo Tranquilizante", "Passos Longos": "Molas nas Botas", "Raio Ardente": "Tocha de Corte",
      "Passo Nebuloso": "Cortina de Poeira", "Visão das Sombras": "Visão Noturna", "Bola de Fogo": "Coquetel Incendiário",
      "Relâmpago": "Descarga de Gerador", "Contramágica": "Curto-Circuito", "Tempestade de Gelo": "Granizo Radioativo",
      "Porta Dimensional": "Túnel de Fuga", "Cone de Frio": "Nuvem de Freon", "Muralha de Pedra": "Barricada de Sucata",
      "Chama Sagrada": "Luz da Nova Fé", "Orientação": "Faro de Sobrevivente", "Curar Ferimentos Leves": "Kit de Remendo",
      "Palavra Curativa": "Grito de Ânimo", "Infligir Ferimentos": "Toque Radioativo", "Bênção": "Sermão das Cinzas",
      "Arma Espiritual": "Drone de Sucata", "Oração Curativa": "Rodada de Remédios", "Restauração Menor": "Desintoxicante",
      "Espíritos Guardiões": "Nuvem de Esporos", "Revivificar": "Choque de Bateria", "Guardião da Fé": "Sentinela de Sucata",
      "Curar Ferimentos Graves": "Cirurgia de Garagem", "Coluna de Chamas": "Explosão de Tanque", "Cura Divina": "Milagre do Deserto",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Cano", "Arremesso de lança": "Lança de Vergalhão", "Investida": "Carga Selvagem",
      "Golpe giratório": "Corrente Girada", "Golpe esmagador": "Marretada", "Fúria do campeão": "Fúria do Deserto",
      "Golpe devastador": "Golpe de Para-Choque", "Ataque furtivo": "Faca Enferrujada", "Tiro furtivo": "Tiro de Besta",
      "Golpe nas costas": "Golpe de Emboscada", "Disparo preciso": "Tiro de Luneta", "Golpe mortal": "Fim da Linha",
      "Lâmina na sombra": "Faca na Poeira",
    },
    atributoMagia: "Carga",
  },

  // ── Londres a Vapor ──
  "londres-vapor": {
    racas: {
      Humano: ["Londrino", "Londrino de qualquer classe social"],
      Anão: ["Engenheiro de Caldeira", "Engenheiro de caldeiras ou mineiro do norte"],
      Elfo: ["Aristocrata Excêntrico", "De família aristocrática antiga e excêntrica"],
      Halfling: ["Informante de Rua", "Menino de rua, informante ou carteiro"],
      "Meio-orc": ["Pugilista do Porto", "Estivador do porto ou pugilista de ringue clandestino"],
    },
    classes: {
      Guerreiro: ["Veterano das Colônias", "Ex-militar das colônias, policial ou pugilista"],
      Ladino: ["Detetive Amador", "Arrombador regenerado, detetive amador ou jornalista"],
      Mago: ["Inventor", "Inventor ou espiritualista de ciência estranha"],
      Clérigo: ["Doutor de Bairro", "Médico, enfermeira ou vigário da paróquia"],
    },
    magias: {
      "Raio de Gelo": "Granada de Éter", "Toque Chocante": "Luva Galvânica", "Mãos Mágicas": "Braço Extensível",
      "Mísseis Mágicos": "Dardos de Ar", "Mãos Flamejantes": "Lança-Chamas a Gás", "Escudo Arcano": "Guarda-Chuva Blindado",
      "Sono": "Lenço com Clorofórmio", "Passos Longos": "Botas de Mola", "Raio Ardente": "Raio Calórico",
      "Passo Nebuloso": "Cortina de Vapor", "Visão das Sombras": "Monóculo Noturno", "Bola de Fogo": "Bomba de Caldeira",
      "Relâmpago": "Arco Voltaico", "Contramágica": "Abafador de Éter", "Tempestade de Gelo": "Explosão Frigorífica",
      "Porta Dimensional": "Tubo Pneumático", "Cone de Frio": "Sopro Refrigerante", "Muralha de Pedra": "Muro de Ferro Fundido",
      "Chama Sagrada": "Luz de Magnésio", "Orientação": "Conselho do Vigário", "Curar Ferimentos Leves": "Curativo Antisséptico",
      "Palavra Curativa": "Sais de Cheiro", "Infligir Ferimentos": "Dose de Arsênico", "Bênção": "Sermão de Domingo",
      "Arma Espiritual": "Bengala Automática", "Oração Curativa": "Vapor Medicinal", "Restauração Menor": "Tônico Restaurador",
      "Espíritos Guardiões": "Espíritos da Sessão", "Revivificar": "Reanimação Galvânica", "Guardião da Fé": "Autômato Guardião",
      "Curar Ferimentos Graves": "Cirurgia Moderna", "Coluna de Chamas": "Pilar de Gás Aceso", "Cura Divina": "Elixir Universal",
    },
    tecnicas: {
      "Golpe poderoso": "Direto de Pugilista", "Arremesso de lança": "Bengala Arremessada", "Investida": "Avanço de Baioneta",
      "Golpe giratório": "Molinete de Bengala", "Golpe esmagador": "Golpe de Chave Inglesa", "Fúria do campeão": "Fúria do Ringue",
      "Golpe devastador": "Nocaute", "Ataque furtivo": "Bengala-Espada", "Tiro furtivo": "Revólver de Bolso",
      "Golpe nas costas": "Golpe no Nevoeiro", "Disparo preciso": "Mira de Atirador", "Golpe mortal": "Golpe de Mestre",
      "Lâmina na sombra": "Lâmina na Neblina",
    },
    atributoMagia: "Pressão",
  },

  // ── Heróis do Olimpo ──
  olimpo: {
    racas: {
      Humano: ["Mortal", "Mortal grego ou semideus de origem incerta"],
      Anão: ["Filho da Forja", "Descende dos ferreiros ajudantes de Hefesto"],
      Elfo: ["Filho de Ninfa", "Filho ou filha de uma ninfa dos bosques e dos rios"],
      Halfling: ["Pastor da Arcádia", "Pastor da Arcádia, esperto e veloz"],
      "Meio-orc": ["Sangue de Ciclope", "Descende de gigantes ou de um ciclope"],
    },
    classes: {
      Guerreiro: ["Hoplita", "Hoplita, atleta ou herói de muitas provas"],
      Ladino: ["Protegido de Hermes", "Ladrão e trapaceiro sob a proteção de Hermes"],
      Mago: ["Iniciado dos Mistérios", "Feiticeira de uma ilha ou iniciado em mistérios"],
      Clérigo: ["Sacerdote do Templo", "Sacerdote de um deus, com as bênçãos dele"],
    },
    magias: {
      "Raio de Gelo": "Sopro de Bóreas", "Toque Chocante": "Faísca de Zeus", "Mãos Mágicas": "Sopro de Éolo",
      "Mísseis Mágicos": "Flechas de Ártemis", "Mãos Flamejantes": "Chamas de Héstia", "Escudo Arcano": "Égide de Atena",
      "Sono": "Favor de Hipnos", "Passos Longos": "Sandálias de Hermes", "Raio Ardente": "Raio de Hélio",
      "Passo Nebuloso": "Elmo de Hades", "Visão das Sombras": "Olhar da Coruja", "Bola de Fogo": "Fogo de Hefesto",
      "Relâmpago": "Raio de Zeus", "Contramágica": "Palavra de Hécate", "Tempestade de Gelo": "Inverno de Deméter",
      "Porta Dimensional": "Caminho de Íris", "Cone de Frio": "Hálito do Tártaro", "Muralha de Pedra": "Muralha de Ciclope",
      "Chama Sagrada": "Fogo de Apolo", "Orientação": "Sussurro da Musa", "Curar Ferimentos Leves": "Toque de Asclépio",
      "Palavra Curativa": "Canto de Peã", "Infligir Ferimentos": "Toque de Tânatos", "Bênção": "Bênção do Olimpo",
      "Arma Espiritual": "Lança de Atena", "Oração Curativa": "Hino de Apolo", "Restauração Menor": "Bálsamo de Hígia",
      "Espíritos Guardiões": "Sombras dos Heróis", "Revivificar": "Retorno do Estige", "Guardião da Fé": "Guardião de Bronze",
      "Curar Ferimentos Graves": "Mãos de Asclépio", "Coluna de Chamas": "Fogo do Olimpo", "Cura Divina": "Néctar dos Deuses",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Hoplita", "Arremesso de lança": "Arremesso de Dardo", "Investida": "Carga da Falange",
      "Golpe giratório": "Giro de Discóbolo", "Golpe esmagador": "Golpe de Héracles", "Fúria do campeão": "Fúria de Ares",
      "Golpe devastador": "Golpe dos Titãs", "Ataque furtivo": "Astúcia de Hermes", "Tiro furtivo": "Flecha Escondida",
      "Golpe nas costas": "Truque de Ulisses", "Disparo preciso": "Mira de Órion", "Golpe mortal": "Corte das Moiras",
      "Lâmina na sombra": "Lâmina de Nix",
    },
    atributoMagia: "Favor",
  },

  // ── Saga Viking ──
  "saga-viking": {
    racas: {
      Humano: ["Filho de Midgard", "Nórdico de Midgard, o mundo dos homens"],
      Anão: ["Anão das Forjas", "Anão das forjas subterrâneas"],
      Elfo: ["Elfo da Luz", "Elfo da luz ou do bosque, de beleza fria"],
      Halfling: ["Gente das Ilhas", "Gente miúda das ilhas, de pescadores e contadores de histórias"],
      "Meio-orc": ["Sangue de Gigante", "Alguém com sangue de gigante nas veias"],
    },
    classes: {
      Guerreiro: ["Berserker", "Guerreiro de clã, berserker ou escudeira"],
      Ladino: ["Saqueador", "Caçador, explorador ou saqueador das costas"],
      Mago: ["Escaldo das Runas", "Escaldo das runas ou aprendiz de vidente"],
      Clérigo: ["Sacerdote do Clã", "Sacerdote de um deus nórdico"],
    },
    magias: {
      "Raio de Gelo": "Sopro de Niflheim", "Toque Chocante": "Toque de Thor", "Mãos Mágicas": "Runa do Alcance",
      "Mísseis Mágicos": "Setas Rúnicas", "Mãos Flamejantes": "Hálito de Surt", "Escudo Arcano": "Runa do Escudo",
      "Sono": "Sono de Inverno", "Passos Longos": "Passo do Lobo", "Raio Ardente": "Dardo de Brasa",
      "Passo Nebuloso": "Manto de Névoa", "Visão das Sombras": "Olhos de Corvo", "Bola de Fogo": "Fogo de Muspelheim",
      "Relâmpago": "Fúria de Thor", "Contramágica": "Runa Quebrada", "Tempestade de Gelo": "Inverno de Fimbul",
      "Porta Dimensional": "Ponte de Bifrost", "Cone de Frio": "Hálito de Jotun", "Muralha de Pedra": "Muro de Pedra Rúnica",
      "Chama Sagrada": "Luz de Balder", "Orientação": "Conselho das Nornas", "Curar Ferimentos Leves": "Canto de Eir",
      "Palavra Curativa": "Sopro de Eir", "Infligir Ferimentos": "Toque de Hel", "Bênção": "Bênção de Odin",
      "Arma Espiritual": "Machado das Valquírias", "Oração Curativa": "Canto do Hidromel", "Restauração Menor": "Maçã de Idun",
      "Espíritos Guardiões": "Guerreiros de Valhala", "Revivificar": "Chamado de Valhala", "Guardião da Fé": "Lobo de Odin",
      "Curar Ferimentos Graves": "Runa da Vida", "Coluna de Chamas": "Pira dos Deuses", "Cura Divina": "Dom de Frigg",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Machado", "Arremesso de lança": "Lança do Clã", "Investida": "Carga Berserker",
      "Golpe giratório": "Roda de Machados", "Golpe esmagador": "Golpe de Escudo", "Fúria do campeão": "Fúria do Jarl",
      "Golpe devastador": "Golpe do Ragnarök", "Ataque furtivo": "Faca de Saqueador", "Tiro furtivo": "Flecha do Caçador",
      "Golpe nas costas": "Golpe de Loki", "Disparo preciso": "Flecha de Ullr", "Golpe mortal": "Golpe de Fenrir",
      "Lâmina na sombra": "Lâmina da Noite Longa",
    },
    atributoMagia: "Poder Rúnico",
  },

  // ── Era dos Samurais ──
  samurais: {
    racas: {
      Humano: ["Gente do Povo", "Gente comum de qualquer posição"],
      Anão: ["Forjador da Montanha", "Forjador de espadas das montanhas, baixo e forte"],
      Elfo: ["Sangue de Kitsune", "Descende de kitsune ou de espíritos do bosque"],
      Halfling: ["Mensageiro de Estrada", "Criado, mensageiro ou artista de estrada"],
      "Meio-orc": ["Sangue de Oni", "Descende de oni, grande e de pele avermelhada"],
    },
    classes: {
      Guerreiro: ["Samurai", "Samurai, ronin ou monja guerreira"],
      Ladino: ["Shinobi", "Shinobi, ladrão ou jogador de dados"],
      Mago: ["Onmyoji", "Feiticeiro de talismãs e leitor de presságios"],
      Clérigo: ["Monge do Templo", "Sacerdote xintoísta ou monge budista"],
    },
    magias: {
      "Raio de Gelo": "Talismã da Geada", "Toque Chocante": "Selo do Trovão", "Mãos Mágicas": "Mão do Espírito",
      "Mísseis Mágicos": "Grous de Papel", "Mãos Flamejantes": "Leque de Fogo", "Escudo Arcano": "Barreira Sagrada",
      "Sono": "Ninar do Espírito", "Passos Longos": "Passo do Vento", "Raio Ardente": "Flecha de Fogo",
      "Passo Nebuloso": "Passo da Névoa", "Visão das Sombras": "Olhos da Raposa", "Bola de Fogo": "Talismã Flamejante",
      "Relâmpago": "Ira de Raijin", "Contramágica": "Selo de Anulação", "Tempestade de Gelo": "Sopro da Yuki-onna",
      "Porta Dimensional": "Portal do Torii", "Cone de Frio": "Vento da Montanha", "Muralha de Pedra": "Muro do Castelo",
      "Chama Sagrada": "Chama do Santuário", "Orientação": "Presságio Favorável", "Curar Ferimentos Leves": "Prece de Cura",
      "Palavra Curativa": "Mantra Curativo", "Infligir Ferimentos": "Toque Amaldiçoado", "Bênção": "Bênção dos Kami",
      "Arma Espiritual": "Lâmina do Kami", "Oração Curativa": "Sutra da Cura", "Restauração Menor": "Chá Purificador",
      "Espíritos Guardiões": "Espíritos Ancestrais", "Revivificar": "Retorno da Alma", "Guardião da Fé": "Guardião Komainu",
      "Curar Ferimentos Graves": "Agulhas de Cura", "Coluna de Chamas": "Pilar do Sol", "Cura Divina": "Graça de Amaterasu",
    },
    tecnicas: {
      "Golpe poderoso": "Corte Descendente", "Arremesso de lança": "Arremesso de Yari", "Investida": "Avanço do Tigre",
      "Golpe giratório": "Corte Circular", "Golpe esmagador": "Golpe de Tetsubo", "Fúria do campeão": "Espírito do Ronin",
      "Golpe devastador": "Corte Único", "Ataque furtivo": "Kunai Escondida", "Tiro furtivo": "Zarabatana",
      "Golpe nas costas": "Golpe da Sombra", "Disparo preciso": "Flecha do Arco Longo", "Golpe mortal": "Toque Silencioso",
      "Lâmina na sombra": "Lâmina da Lua",
    },
    atributoMagia: "Ki",
  },

  // ── Lendas do Brasil ──
  "lendas-brasil": {
    racas: {
      Humano: ["Sertanejo", "Sertanejo, caiçara, ribeirinho ou gente da cidade"],
      Anão: ["Garimpeiro", "Garimpeiro baixo e teimoso, duro como pedra"],
      Elfo: ["Encantado", "Tem sangue encantado do rio ou da mata"],
      Halfling: ["Moleque de Feira", "Moleque esperto, menina de recados ou vendedor de feira"],
      "Meio-orc": ["Filho do Lobisomem", "Vaqueiro gigante, filho de lobisomem ou capoeirista fortão"],
    },
    classes: {
      Guerreiro: ["Capoeirista", "Vaqueiro, capoeirista ou soldado de coragem"],
      Ladino: ["Malandro", "Malandro, caçador ou contrabandista do rio"],
      Mago: ["Feiticeiro das Ervas", "Benzedor que conhece os segredos das ervas"],
      Clérigo: ["Rezadeira", "Rezadeira, devoto de santo ou aprendiz de pajé"],
    },
    magias: {
      "Raio de Gelo": "Sopro do Minuano", "Toque Chocante": "Choque de Poraquê", "Mãos Mágicas": "Mão do Saci",
      "Mísseis Mágicos": "Bodoque Encantado", "Mãos Flamejantes": "Mãos de Brasa", "Escudo Arcano": "Patuá de Proteção",
      "Sono": "Cantiga de Ninar", "Passos Longos": "Rastro do Curupira", "Raio Ardente": "Fogo da Mula",
      "Passo Nebuloso": "Redemoinho", "Visão das Sombras": "Olho de Coruja", "Bola de Fogo": "Fogo do Boitatá",
      "Relâmpago": "Raio de Tupã", "Contramágica": "Desfazer Quebranto", "Tempestade de Gelo": "Chuva de Pedra",
      "Porta Dimensional": "Porta da Encantaria", "Cone de Frio": "Friagem", "Muralha de Pedra": "Muro de Taipa",
      "Chama Sagrada": "Luz do Santo", "Orientação": "Simpatia de Sorte", "Curar Ferimentos Leves": "Benzedura",
      "Palavra Curativa": "Reza Forte", "Infligir Ferimentos": "Mau-Olhado", "Bênção": "Bênção de Santo",
      "Arma Espiritual": "Facão Encantado", "Oração Curativa": "Ladainha de Cura", "Restauração Menor": "Garrafada",
      "Espíritos Guardiões": "Espíritos da Mata", "Revivificar": "Volta do Além", "Guardião da Fé": "Onça Guardiã",
      "Curar Ferimentos Graves": "Erva de Pajé", "Coluna de Chamas": "Fogueira de São João", "Cura Divina": "Milagre do Santo",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Facão", "Arremesso de lança": "Arremesso de Zagaia", "Investida": "Carreira de Vaqueiro",
      "Golpe giratório": "Meia-Lua de Compasso", "Golpe esmagador": "Cabeçada", "Fúria do campeão": "Fúria do Cangaço",
      "Golpe devastador": "Rabo de Arraia", "Ataque furtivo": "Rasteira", "Tiro furtivo": "Tiro de Tocaia",
      "Golpe nas costas": "Peixeirada", "Disparo preciso": "Mira de Caçador", "Golpe mortal": "Golpe de Malandro",
      "Lâmina na sombra": "Navalha na Sombra",
    },
    atributoMagia: "Encanto",
  },

  // ── Mistério na Mansão ──
  "misterio-mansao": {
    racas: {
      Humano: ["Convidado", "Qualquer pessoa: convidado, herdeiro ou visitante"],
      Anão: ["Mordomo Meticuloso", "Mordomo ou cozinheiro baixo e meticuloso"],
      Elfo: ["Sangue Azul", "Aristocrata de família antiga e fria"],
      Halfling: ["Sobrinho Esquecido", "Criada, mensageiro ou sobrinho esquecido da família"],
      "Meio-orc": ["Guarda-Costas", "Motorista, guarda-costas ou ex-pugilista"],
    },
    classes: {
      Guerreiro: ["Ex-Oficial", "Ex-oficial, guarda-costas ou policial de folga"],
      Ladino: ["Ladrão de Joias", "Jornalista, ladrão de joias ou detetive particular"],
      Mago: ["Químico Amador", "Químico, médium ou escritora de romances policiais"],
      Clérigo: ["Médico da Família", "Médico da família, vigário ou enfermeira"],
    },
    magias: {
      "Raio de Gelo": "Jato de Sifão", "Toque Chocante": "Fio da Campainha", "Mãos Mágicas": "Truque de Palco",
      "Mísseis Mágicos": "Bolas de Bilhar", "Mãos Flamejantes": "Isqueiro e Conhaque", "Escudo Arcano": "Bandeja de Prata",
      "Sono": "Pó Sonífero no Chá", "Passos Longos": "Passos Apressados", "Raio Ardente": "Brasa da Lareira",
      "Passo Nebuloso": "Apagar das Luzes", "Visão das Sombras": "Olho Treinado", "Bola de Fogo": "Lampião Estilhaçado",
      "Relâmpago": "Pane no Gerador", "Contramágica": "Dedução Brilhante", "Tempestade de Gelo": "Lustre de Cristal",
      "Porta Dimensional": "Passagem Secreta", "Cone de Frio": "Sopro do Porão", "Muralha de Pedra": "Estante Derrubada",
      "Chama Sagrada": "Vela do Oratório", "Orientação": "Intuição Afiada", "Curar Ferimentos Leves": "Maleta de Médico",
      "Palavra Curativa": "Gole de Conhaque", "Infligir Ferimentos": "Gota de Veneno", "Bênção": "Brinde aos Presentes",
      "Arma Espiritual": "Armadura do Salão", "Oração Curativa": "Chá de Camomila", "Restauração Menor": "Antídoto",
      "Espíritos Guardiões": "Fantasmas da Casa", "Revivificar": "Voltar a Si", "Guardião da Fé": "Cão de Guarda",
      "Curar Ferimentos Graves": "Cirurgia na Cozinha", "Coluna de Chamas": "Incêndio na Biblioteca", "Cura Divina": "Recuperação Milagrosa",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Atiçador", "Arremesso de lança": "Castiçal Arremessado", "Investida": "Avanço pelo Corredor",
      "Golpe giratório": "Golpe de Bengala", "Golpe esmagador": "Golpe de Candelabro", "Fúria do campeão": "Fúria do Coronel",
      "Golpe devastador": "Busto de Mármore", "Ataque furtivo": "Abridor de Cartas", "Tiro furtivo": "Tiro Abafado",
      "Golpe nas costas": "Empurrão na Escada", "Disparo preciso": "Tiro Certeiro", "Golpe mortal": "Golpe Fatal",
      "Lâmina na sombra": "Faca no Escuro",
    },
    atributoMagia: "Engenho",
  },

  // ── Os Últimos de Pé ──
  "ultimos-de-pe": {
    racas: {
      Humano: ["Gente Comum", "Qualquer pessoa que ainda está de pé"],
      Anão: ["Caminhoneiro", "Alguém baixo e parrudo, mecânico ou caminhoneiro"],
      Elfo: ["Atleta", "Atleta ou corredora, ágil e de sentidos aguçados"],
      Halfling: ["Entregador", "Adolescente ou entregador de bicicleta que se esconde bem"],
      "Meio-orc": ["Grandalhão", "Segurança, lutador ou bombeiro grandalhão"],
    },
    classes: {
      Guerreiro: ["Linha de Frente", "Policial, militar ou lutador"],
      Ladino: ["Batedor", "Entregador, ladrão ou escoteira que sempre acha caminho"],
      Mago: ["Improvisador", "Estudante de química que improvisa armadilhas"],
      Clérigo: ["Socorrista", "Enfermeira, médico, padre ou pastora"],
    },
    magias: {
      "Raio de Gelo": "Extintor de Incêndio", "Toque Chocante": "Arma de Choque", "Mãos Mágicas": "Vara com Gancho",
      "Mísseis Mágicos": "Estilingue", "Mãos Flamejantes": "Lança-Chamas Caseiro", "Escudo Arcano": "Porta de Carro",
      "Sono": "Sedativo", "Passos Longos": "Corrida Desesperada", "Raio Ardente": "Sinalizador",
      "Passo Nebuloso": "Granada de Fumaça", "Visão das Sombras": "Lanterna de Cabeça", "Bola de Fogo": "Coquetel Molotov",
      "Relâmpago": "Cabo de Alta Tensão", "Contramágica": "Plano B", "Tempestade de Gelo": "Gelo Seco",
      "Porta Dimensional": "Rota de Fuga", "Cone de Frio": "Nitrogênio Líquido", "Muralha de Pedra": "Barricada",
      "Chama Sagrada": "Tocha Improvisada", "Orientação": "Dica de Sobrevivência", "Curar Ferimentos Leves": "Primeiros Socorros",
      "Palavra Curativa": "Grito de Coragem", "Infligir Ferimentos": "Seringa Contaminada", "Bênção": "Discurso de Esperança",
      "Arma Espiritual": "Cão Treinado", "Oração Curativa": "Remédios Divididos", "Restauração Menor": "Antibiótico",
      "Espíritos Guardiões": "Cerca de Arame", "Revivificar": "Massagem Cardíaca", "Guardião da Fé": "Vigia na Torre",
      "Curar Ferimentos Graves": "Sutura de Emergência", "Coluna de Chamas": "Tanque de Gasolina", "Cura Divina": "Hospital de Campanha",
    },
    tecnicas: {
      "Golpe poderoso": "Tacada de Beisebol", "Arremesso de lança": "Vergalhão Arremessado", "Investida": "Carga com Escudo",
      "Golpe giratório": "Giro de Facão", "Golpe esmagador": "Golpe de Marreta", "Fúria do campeão": "Fúria Desesperada",
      "Golpe devastador": "Machado de Bombeiro", "Ataque furtivo": "Faca Silenciosa", "Tiro furtivo": "Tiro de Besta",
      "Golpe nas costas": "Golpe pelas Costas", "Disparo preciso": "Tiro na Cabeça", "Golpe mortal": "Golpe Silencioso",
      "Lâmina na sombra": "Lâmina no Escuro",
    },
    atributoMagia: "Fôlego",
  },

  // ── Heróis Mascarados ──
  "herois-mascarados": {
    racas: {
      Humano: ["Sem Poderes", "Sem poderes: só treino, coragem e engenhocas"],
      Anão: ["Corpo Denso", "Corpo denso e fortíssimo por um acidente químico"],
      Elfo: ["Visitante Dimensional", "Poder vindo de outra dimensão, de aparência marcante"],
      Halfling: ["Miniatura", "Encolhe ou passa despercebido, muito ágil"],
      "Meio-orc": ["Mutante Blindado", "Fortíssimo e de pele dura por mutação"],
    },
    classes: {
      Guerreiro: ["Brigão", "Brigão de rua ou ex-militar que aguenta o tranco"],
      Ladino: ["Vigilante", "Vigilante acrobata ou detetive mascarado"],
      Mago: ["Controlador de Energia", "Domina energia, é inventor genial ou místico"],
      Clérigo: ["Protetor", "Curador e gerador de campos de proteção"],
    },
    magias: {
      "Raio de Gelo": "Rajada Congelante", "Toque Chocante": "Toque Elétrico", "Mãos Mágicas": "Telecinese",
      "Mísseis Mágicos": "Rajadas Teleguiadas", "Mãos Flamejantes": "Mãos de Fogo", "Escudo Arcano": "Campo Protetor",
      "Sono": "Toque Paralisante", "Passos Longos": "Supersalto", "Raio Ardente": "Raio Térmico",
      "Passo Nebuloso": "Teleporte Curto", "Visão das Sombras": "Sentido Aguçado", "Bola de Fogo": "Explosão de Energia",
      "Relâmpago": "Descarga Elétrica", "Contramágica": "Anulador de Poderes", "Tempestade de Gelo": "Nevasca Súbita",
      "Porta Dimensional": "Portal Dimensional", "Cone de Frio": "Sopro Ártico", "Muralha de Pedra": "Muralha de Concreto",
      "Chama Sagrada": "Raio de Luz", "Orientação": "Telepatia de Apoio", "Curar Ferimentos Leves": "Toque Curativo",
      "Palavra Curativa": "Pulso Curativo", "Infligir Ferimentos": "Toque Drenante", "Bênção": "Aura de Coragem",
      "Arma Espiritual": "Construto de Luz", "Oração Curativa": "Onda Curativa", "Restauração Menor": "Purificação",
      "Espíritos Guardiões": "Aura de Choque", "Revivificar": "Segundo Fôlego", "Guardião da Fé": "Guardião Holográfico",
      "Curar Ferimentos Graves": "Regeneração", "Coluna de Chamas": "Coluna de Plasma", "Cura Divina": "Cura Total",
    },
    tecnicas: {
      "Golpe poderoso": "Supersoco", "Arremesso de lança": "Bastão Arremessado", "Investida": "Investida Voadora",
      "Golpe giratório": "Chute Giratório", "Golpe esmagador": "Soco Sísmico", "Fúria do campeão": "Fúria Heroica",
      "Golpe devastador": "Golpe Final", "Ataque furtivo": "Golpe Acrobático", "Tiro furtivo": "Dardo Escondido",
      "Golpe nas costas": "Ataque das Sombras", "Disparo preciso": "Pontaria Perfeita", "Golpe mortal": "Golpe Nocaute",
      "Lâmina na sombra": "Bastão nas Sombras",
    },
    atributoMagia: "Energia",
  },

  // ── Contos Sombrios ──
  "contos-sombrios": {
    racas: {
      Humano: ["Filho do Lenhador", "Filho de lenhador, de moleiro ou princesa fugida"],
      Anão: ["Anão da Montanha", "Um dos anões das minas da montanha"],
      Elfo: ["Povo das Fadas", "Criatura do povo das fadas vivendo entre humanos"],
      Halfling: ["Pequeno Polegar", "Alfaiatezinho valente ou gente do tamanho de um polegar"],
      "Meio-orc": ["Filho de Ogro", "Filho de ogro ou de troll, rejeitado pela aldeia"],
    },
    classes: {
      Guerreiro: ["Soldado que Voltou", "Soldado que voltou da guerra, caçador ou lenhador"],
      Ladino: ["Ladrão Esperto", "Ladrão esperto ou trapaceiro de feira"],
      Mago: ["Aprendiz de Bruxa", "Aprendiz de bruxa ou leitor de um livro proibido"],
      Clérigo: ["Peregrino", "Irmã de convento, peregrino ou curandeira"],
    },
    magias: {
      "Raio de Gelo": "Beijo da Neve", "Toque Chocante": "Faísca da Pederneira", "Mãos Mágicas": "Ajuda dos Passarinhos",
      "Mísseis Mágicos": "Agulhas Encantadas", "Mãos Flamejantes": "Sopro de Dragão", "Escudo Arcano": "Capa Encantada",
      "Sono": "Fuso Encantado", "Passos Longos": "Botas de Sete Léguas", "Raio Ardente": "Isqueiro Mágico",
      "Passo Nebuloso": "Sumir no Bosque", "Visão das Sombras": "Olhos de Lobo", "Bola de Fogo": "Forno da Bruxa",
      "Relâmpago": "Raio do Gigante", "Contramágica": "Quebra de Encanto", "Tempestade de Gelo": "Inverno Eterno",
      "Porta Dimensional": "Espelho Mágico", "Cone de Frio": "Sopro do Norte", "Muralha de Pedra": "Muralha de Espinhos",
      "Chama Sagrada": "Luz da Vela", "Orientação": "Conselho da Fada", "Curar Ferimentos Leves": "Água da Fonte da Vida",
      "Palavra Curativa": "Lágrima Curativa", "Infligir Ferimentos": "Maçã Envenenada", "Bênção": "Bênção do Peregrino",
      "Arma Espiritual": "Espada Encantada", "Oração Curativa": "Canção do Convento", "Restauração Menor": "Erva do Bosque",
      "Espíritos Guardiões": "Corvos Guardiões", "Revivificar": "Beijo do Despertar", "Guardião da Fé": "Lobo Leal",
      "Curar Ferimentos Graves": "Remédio da Curandeira", "Coluna de Chamas": "Fogo do Céu", "Cura Divina": "Graça da Fada Madrinha",
    },
    tecnicas: {
      "Golpe poderoso": "Machadada", "Arremesso de lança": "Machado Arremessado", "Investida": "Investida do Caçador",
      "Golpe giratório": "Giro do Lenhador", "Golpe esmagador": "Golpe de Clava", "Fúria do campeão": "Coragem do Alfaiate",
      "Golpe devastador": "Sete de um Golpe", "Ataque furtivo": "Truque de Raposa", "Tiro furtivo": "Pedra de Funda",
      "Golpe nas costas": "Golpe do Lobo Mau", "Disparo preciso": "Flecha do Caçador", "Golpe mortal": "Corte da Meia-Noite",
      "Lâmina na sombra": "Lâmina do Bosque",
    },
    atributoMagia: "Feitiço",
  },

  // ── Távola Redonda ──
  "tavola-redonda": {
    racas: {
      Humano: ["Bretão", "Bretão, saxão ou descendente de romanos"],
      Anão: ["Guardião de Túmulos", "Ferreiro das colinas ou guardião de túmulos"],
      Elfo: ["Filho de Avalon", "Do povo das fadas, de Avalon ou das colinas ocas"],
      Halfling: ["Pajem", "Pajem, bobo da corte ou menestrel"],
      "Meio-orc": ["Selvagem do Norte", "Filho de gigante ou guerreiro selvagem do norte"],
    },
    classes: {
      Guerreiro: ["Cavaleiro", "Cavaleiro ou escudeiro em busca de glória"],
      Ladino: ["Menestrel Espião", "Caçador ou menestrel que ouve mais do que canta"],
      Mago: ["Druida", "Aprendiz de Merlim ou druida dos bosques"],
      Clérigo: ["Peregrino do Graal", "Monge, freira ou peregrino em busca do Graal"],
    },
    magias: {
      "Raio de Gelo": "Hálito do Inverno", "Toque Chocante": "Toque do Trovão", "Mãos Mágicas": "Mão das Fadas",
      "Mísseis Mágicos": "Setas de Visco", "Mãos Flamejantes": "Chama Druídica", "Escudo Arcano": "Bênção da Dama do Lago",
      "Sono": "Névoa de Avalon", "Passos Longos": "Passo de Cervo", "Raio Ardente": "Raio de Sol",
      "Passo Nebuloso": "Passo das Fadas", "Visão das Sombras": "Olhar de Merlim", "Bola de Fogo": "Fogo de Dragão",
      "Relâmpago": "Raio de Taranis", "Contramágica": "Desencanto", "Tempestade de Gelo": "Tormenta do Norte",
      "Porta Dimensional": "Colina Oca", "Cone de Frio": "Sopro de Gelo", "Muralha de Pedra": "Círculo de Pedras",
      "Chama Sagrada": "Fogo Sagrado", "Orientação": "Visão do Graal", "Curar Ferimentos Leves": "Toque do Monge",
      "Palavra Curativa": "Prece do Peregrino", "Infligir Ferimentos": "Maldição de Morgana", "Bênção": "Bênção de Camelot",
      "Arma Espiritual": "Espada de Luz Sagrada", "Oração Curativa": "Cântico das Freiras", "Restauração Menor": "Água Benta",
      "Espíritos Guardiões": "Anjos Guardiões", "Revivificar": "Milagre do Cálice", "Guardião da Fé": "Cavaleiro Espectral",
      "Curar Ferimentos Graves": "Bálsamo de Avalon", "Coluna de Chamas": "Ira dos Céus", "Cura Divina": "Luz do Graal",
    },
    tecnicas: {
      "Golpe poderoso": "Golpe de Espada", "Arremesso de lança": "Lança Arremessada", "Investida": "Carga de Justa",
      "Golpe giratório": "Molinete de Espada", "Golpe esmagador": "Golpe de Maça", "Fúria do campeão": "Fúria de Lancelote",
      "Golpe devastador": "Golpe do Rei", "Ataque furtivo": "Punhal Escondido", "Tiro furtivo": "Flecha do Bosque",
      "Golpe nas costas": "Traição de Mordred", "Disparo preciso": "Flecha do Arqueiro", "Golpe mortal": "Golpe Derradeiro",
      "Lâmina na sombra": "Lâmina das Brumas",
    },
    atributoMagia: "Graça",
  },
};

const identidade = (lista) => Object.fromEntries(lista.map((x) => [x.nome, x.nome]));

/** Monta o formato do contrato: {nome, descricao} com a mecânica entre parênteses. */
function montar(id, d) {
  const par = (sufixo) => ([nome, frase]) => ({ nome, descricao: frase.includes("(") ? frase : `${frase} ${sufixo}` });
  return Object.freeze({
    racas: Object.freeze(Object.fromEntries(Object.entries(d.racas).map(([mec, v]) => [mec, Object.freeze(par(SUFIXO_RACA(mec))(v))]))),
    classes: Object.freeze(Object.fromEntries(Object.entries(d.classes).map(([mec, v]) => [mec, Object.freeze(par(SUFIXO_CLASSE[mec])(v))]))),
    magias: Object.freeze({ ...(d.magias || identidade(C.MAGIAS)) }),
    tecnicas: Object.freeze({ ...(d.tecnicas || identidade(C.TECNICAS)) }),
    atributoMagia: d.atributoMagia,
  });
}

const NOMES = Object.freeze(Object.fromEntries(Object.entries(DADOS).map(([id, d]) => [id, montar(id, d)])));

module.exports = { NOMES };
