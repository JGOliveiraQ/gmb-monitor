#!/usr/bin/env node
/**
 * create-posts.js
 * Cria 3 posts agendados (15, 22 e 29/06/2026 às 10h BRT) para cada cliente ativo.
 * Fotos buscadas via Pexels API (gratuita) — relevância 100% garantida.
 *
 * Pré-requisito: PEXELS_API_KEY no arquivo .env do backend.
 * Execute com o backend rodando: node scripts/create-posts.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const PEXELS_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_KEY) {
  console.error("❌ PEXELS_API_KEY não encontrada no .env");
  console.error("   Crie uma chave gratuita em: https://www.pexels.com/api/");
  process.exit(1);
}

// ── Datas agendadas (10h BRT = 13h UTC) ─────────────────────────────────────
const DATES = [
  "2026-06-15T13:00:00.000Z",
  "2026-06-22T13:00:00.000Z",
  "2026-06-29T13:00:00.000Z",
];

// ── Clientes, posts e query de imagem ────────────────────────────────────────
const CLIENTS = [
  {
    id: "ddtiza",
    imageQuery: "pest control exterminator",
    posts: [
      `Sua casa e seu negócio merecem proteção de verdade.\n\nA DDTIZA Controle de Pragas Urbanas atua com técnicas eficazes, produtos certificados e equipe especializada para eliminar e prevenir infestações de forma segura e definitiva.\n\nAgende sua visita e proteja o que é seu.`,
      `Baratas, ratos, cupins ou mosquitos? Não deixe que pragas coloquem em risco a saúde da sua família ou a reputação do seu estabelecimento.\n\nA DDTIZA oferece atendimento emergencial, laudos e contratos de manutenção preventiva para manter seu ambiente sempre protegido.\n\nFale conosco agora.`,
      `Prevenção é sempre o melhor investimento.\n\nCom o serviço de controle preventivo da DDTIZA, você garante proteção contínua o ano todo — evitando surpresas desagradáveis e preservando a saúde de todos que convivem no seu espaço.\n\nConheça nossos planos e entre em contato.`,
    ],
  },
  {
    id: "dr-othavio",
    imageQuery: "neurosurgery spine doctor",
    posts: [
      `Dores de cabeça persistentes, formigamento ou problemas na coluna merecem atenção especializada.\n\nO Dr. Othavio Lopes é neurocirurgião com ampla experiência no diagnóstico e tratamento de doenças neurológicas e da coluna vertebral, unindo precisão técnica e cuidado humanizado.\n\nAgende sua consulta.`,
      `A coluna vertebral é o eixo da sua saúde e da sua qualidade de vida.\n\nCom o Dr. Othavio Lopes — Neurocirurgião —, você tem acesso a diagnóstico preciso e às melhores opções de tratamento, sejam conservadoras ou cirúrgicas.\n\nCuide da sua saúde com quem tem o conhecimento que você merece.`,
      `O sistema nervoso coordena tudo no seu corpo. Quando algo não está certo, agir com agilidade faz toda a diferença.\n\nO Dr. Othavio Lopes oferece atendimento neurocirúrgico completo com as técnicas mais modernas, proporcionando segurança e recuperação eficaz.\n\nAgende sua avaliação hoje.`,
    ],
  },
  {
    id: "via-das-flores",
    imageQuery: "flower bouquet arrangement",
    posts: [
      `Uma flor tem o poder de transformar qualquer momento em algo especial.\n\nA Floricultura Via das Flores oferece arranjos, buquês e composições florais para todas as ocasiões — aniversários, casamentos, eventos ou simplesmente para alegrar o dia de quem você ama.\n\nEncomende o seu arranjo!`,
      `Presenteie com beleza e afeto.\n\nNa Via das Flores você encontra orquídeas, rosas, girassóis e muito mais, com arranjos personalizados feitos com carinho. Entrega disponível.\n\nEntre em contato e surpreenda quem é especial para você.`,
      `Flores têm a linguagem mais bonita do mundo.\n\nDeixe a Via das Flores falar por você em datas especiais, comemorações corporativas ou naquele presente que precisa ser perfeito.\n\nSolicite um orçamento e descubra como podemos tornar seu momento ainda mais inesquecível.`,
    ],
  },
  {
    id: "dr-igor",
    imageQuery: "knee orthopedic surgery rehabilitation",
    posts: [
      `Dores no joelho limitam cada passo da sua rotina e impedem você de viver plenamente.\n\nO Dr. Igor Pedrinha é ortopedista especializado em joelho, com diagnóstico preciso e tratamentos modernos — do conservador ao cirúrgico — para devolver seus movimentos com segurança.\n\nAgende sua consulta.`,
      `Lesão no ligamento, menisco ou artrose no joelho?\n\nCom o Dr. Igor Pedrinha você tem acesso a protocolos personalizados e às técnicas mais avançadas da ortopedia do joelho, garantindo o melhor resultado para o seu caso.\n\nCuide da sua mobilidade. Marque sua avaliação.`,
      `A saúde do joelho é fundamental para correr, praticar esportes, subir escadas e viver com qualidade.\n\nO Dr. Igor Pedrinha oferece atendimento especializado e humanizado, com foco na recuperação completa e prevenção de novas lesões.\n\nDê o primeiro passo. Agende sua consulta.`,
    ],
  },
  {
    id: "clinica-pe-wagner",
    imageQuery: "foot podiatry medical clinic",
    posts: [
      `Seus pés sustentam tudo. Eles merecem o melhor cuidado.\n\nA Clínica do Pé Dr. Wagner Vieira oferece atendimento especializado para joanetes, esporão, fascite plantar, unhas encravadas e muito mais — com diagnóstico preciso e tratamento eficaz.\n\nAgende sua consulta e volte a caminhar sem dor.`,
      `Dores nos pés afetam cada passo da sua rotina e comprometem sua qualidade de vida.\n\nCom o Dr. Wagner Vieira, especialista em pé, você recebe avaliação completa e o tratamento mais indicado para o seu caso — clínico ou cirúrgico.\n\nEntre em contato e cuide da sua saúde.`,
      `Cuidar dos pés é cuidar da saúde do corpo inteiro.\n\nNa Clínica do Pé Dr. Wagner Vieira você encontra desde consultas preventivas até procedimentos especializados, com tecnologia moderna e atenção individualizada.\n\nMarque sua avaliação e dê um passo em direção ao bem-estar.`,
    ],
  },
  {
    id: "orthocrin",
    imageQuery: "orthopedic medical products store",
    posts: [
      `Conforto, suporte e qualidade de vida começam com o produto certo.\n\nA Orthocrin Cidade Jardim oferece um amplo catálogo de produtos ortopédicos — palmilhas, imobilizadores, meias de compressão, bengalas e muito mais — com atendimento especializado.\n\nVenha nos visitar!`,
      `Seja para recuperação pós-cirúrgica, prevenção de lesões ou mais conforto no dia a dia, a Orthocrin tem exatamente o que você precisa.\n\nProdutos de qualidade, marcas reconhecidas e equipe dedicada para orientar cada escolha.\n\nConheça nossa loja em Cidade Jardim.`,
      `Cuide do seu corpo com os melhores produtos ortopédicos do mercado.\n\nNa Orthocrin Cidade Jardim você encontra equipamentos e acessórios para todas as necessidades, com orientação profissional para garantir a escolha ideal.\n\nVenha conferir e invista na sua saúde.`,
    ],
  },
  {
    id: "dr-gil-galvao",
    imageQuery: "ankle foot surgery orthopedic",
    posts: [
      `Problemas no pé ou tornozelo afetam cada movimento do seu dia.\n\nO Dr. Gil Galvão é especialista em cirurgia do pé e tornozelo, com experiência no tratamento de joanetes, instabilidade, fraturas e deformidades — utilizando as técnicas mais modernas e seguras.\n\nAgende sua avaliação.`,
      `Do diagnóstico ao tratamento, o Dr. Gil Galvão oferece cuidado completo e individualizado para quem sofre com dores ou limitações no pé e tornozelo.\n\nRecupere sua mobilidade com quem combina experiência e dedicação ao paciente.\n\nMarque sua consulta.`,
      `Entorses recorrentes, dores crônicas ou deformidades no pé e tornozelo? Não adie o cuidado que você merece.\n\nO Dr. Gil Galvão apresenta tratamento baseado nas evidências mais atuais, com foco na recuperação real e duradoura.\n\nEntre em contato e dê o primeiro passo.`,
    ],
  },
  {
    id: "dr-jacques",
    imageQuery: "ophthalmology eye doctor examination",
    posts: [
      `Sua visão é uma das suas maiores riquezas. Cuide dela com quem realmente entende.\n\nO Dr. Jacques Houly é oftalmologista especializado no diagnóstico e tratamento de catarata, glaucoma, miopia, astigmatismo e doenças da retina, com tecnologia de ponta e cuidado humanizado.\n\nAgende sua consulta.`,
      `Consultas de rotina, exames completos ou tratamento especializado — o Dr. Jacques Houly oferece atendimento oftalmológico de excelência para cuidar da sua visão em todas as fases da vida.\n\nNão espere os sintomas aparecerem. Cuide dos seus olhos preventivamente.\n\nMarque sua avaliação.`,
      `Ver bem é viver melhor.\n\nCom o Dr. Jacques Houly, você tem acesso aos exames mais completos de visão e aos tratamentos mais modernos da oftalmologia, garantindo saúde ocular por muitos anos.\n\nEntre em contato e agende sua consulta hoje mesmo.`,
    ],
  },
  {
    id: "preall",
    imageQuery: "concrete design architecture interior",
    posts: [
      `Elegância e resistência em cada detalhe.\n\nA PREALL Design Cimentícios oferece peças exclusivas em cimento para sua obra ou reforma — pias, banheiras, cubas e revestimentos que unem funcionalidade e estética única.\n\nTransforme seu ambiente com design que dura. Solicite um orçamento!`,
      `O cimento se reinventou — e a PREALL está na vanguarda desse movimento.\n\nPeças artesanais de alto padrão para banheiros, cozinhas, áreas externas e projetos comerciais, com acabamento sofisticado e personalização total.\n\nConheça nosso portfólio e descubra o que é possível criar.`,
      `De projetos residenciais a comerciais, a PREALL Design Cimentícios entrega peças que valorizam cada centímetro do seu espaço.\n\nQualidade artesanal, design exclusivo e durabilidade garantida — feito sob medida para o seu projeto.\n\nEntre em contato e veja como podemos transformar seu ambiente.`,
    ],
  },
  {
    id: "dr-pedro",
    imageQuery: "urology kidney medical doctor",
    posts: [
      `A saúde urológica impacta diretamente sua qualidade de vida — e merece atenção especializada.\n\nO Dr. Pedro Carneiro é urologista dedicado ao diagnóstico e tratamento de cálculos renais, infecções urinárias, hiperplasia prostática, incontinência e muito mais.\n\nAgende sua consulta e cuide da sua saúde com quem entende.`,
      `Não ignore os sinais que seu corpo dá.\n\nDificuldades urinárias, dores lombares e alterações na função renal precisam de avaliação especializada. O Dr. Pedro Carneiro oferece atendimento urológico completo e humanizado, com foco no diagnóstico preciso e no melhor tratamento.\n\nMarque sua consulta.`,
      `Prevenção é fundamental — especialmente quando o assunto é saúde urológica.\n\nO Dr. Pedro Carneiro realiza consultas preventivas, exames e acompanhamento contínuo para garantir que você esteja sempre bem cuidado.\n\nNão espere um problema surgir para procurar ajuda. Agende sua avaliação.`,
    ],
  },
  {
    id: "dr-diego",
    imageQuery: "hand surgery microsurgery medical",
    posts: [
      `Suas mãos fazem tudo. Quando algo não está certo, você precisa de um especialista de confiança.\n\nO Dr. Diego Rezende Martins é cirurgião especializado em mão, atuando no tratamento de síndrome do túnel do carpo, lesões de tendão, fraturas, deformidades e outras condições.\n\nAgende sua consulta e recupere a função das suas mãos.`,
      `Dores, formigamento ou limitação nos dedos e punho? Esses sinais merecem avaliação especializada.\n\nO Dr. Diego Rezende Martins — Cirurgião da Mão — oferece diagnóstico preciso e tratamentos modernos, com o objetivo de restabelecer plenamente os movimentos e a qualidade de vida.\n\nMarque sua consulta.`,
      `Cada movimento das suas mãos é resultado de uma estrutura complexa e delicada.\n\nO Dr. Diego Rezende Martins oferece atendimento especializado em cirurgia da mão, combinando técnica apurada e cuidado individualizado para cada caso.\n\nNão deixe a dor limitar o que você pode fazer. Entre em contato.`,
    ],
  },
  {
    id: "previct",
    imageQuery: "barbecue grill outdoor leisure backyard",
    posts: [
      `Transforme sua área de lazer em um espaço ainda mais completo para reunir família e amigos.\n\nA PREVICT Churrasqueiras Pré-Moldadas oferece soluções que unem qualidade, resistência e praticidade, com modelos pensados para valorizar seu ambiente e proporcionar momentos especiais.\n\nEntre em contato e encontre a churrasqueira ideal para o seu espaço.`,
      `Uma boa churrasqueira é o coração de toda área de lazer.\n\nA PREVICT oferece churrasqueiras pré-moldadas de alta qualidade, com instalação rápida, acabamento impecável e durabilidade que você pode confiar para reunir as pessoas que mais importam.\n\nConheça nossos modelos e solicite um orçamento.`,
      `Invista em momentos que ficam para sempre.\n\nCom as churrasqueiras pré-moldadas da PREVICT, você garante um espaço funcional, bonito e resistente — perfeito para cada celebração, em cada estação do ano.\n\nFale conosco e descubra o modelo ideal para a sua casa.`,
    ],
  },
  {
    id: "dr-raphael",
    imageQuery: "shoulder elbow orthopedic rehabilitation",
    posts: [
      `Dores no ombro ou cotovelo limitam seus movimentos e afetam sua rotina inteira.\n\nO Dr. Raphael Fonseca é ortopedista especializado em ombro e cotovelo, com diagnóstico preciso e tratamentos eficazes — do conservador ao cirúrgico — para devolver sua liberdade de movimento.\n\nAgende sua consulta.`,
      `Tendinite, lesão no manguito rotador, epicondilite ou instabilidade? Cada condição exige um olhar especializado.\n\nO Dr. Raphael Fonseca combina conhecimento técnico avançado e atendimento humanizado para encontrar o melhor caminho para a sua recuperação.\n\nMarque sua avaliação.`,
      `Seus ombros e cotovelos trabalham o tempo todo — e merecem cuidado especializado quando apresentam problemas.\n\nO Dr. Raphael Fonseca oferece atendimento ortopédico completo, com foco na recuperação real e no retorno às atividades que você ama.\n\nEntre em contato e agende sua consulta.`,
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// Cache para não repetir a mesma busca várias vezes
const _pexelsCache = {};

/**
 * Busca até 3 fotos na Pexels pelo query e retorna array de URLs (src.large).
 * Resultados são cacheados por query para economizar chamadas de API.
 */
async function fetchPexelsPhotos(query) {
  if (_pexelsCache[query]) return _pexelsCache[query];

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&locale=pt-BR`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });

  if (!res.ok) throw new Error(`Pexels API ${res.status}: ${await res.text()}`);

  const data  = await res.json();
  const urls  = (data.photos || []).map((p) => p.src.large);

  if (urls.length === 0) throw new Error(`Nenhuma foto encontrada para "${query}"`);

  _pexelsCache[query] = urls;
  return urls;
}

/** POST para o backend com photoUrl (sem download de arquivo). */
async function createPost(clientId, description, imgUrl, scheduledTime) {
  const formData = new FormData();
  formData.append("description", description);
  formData.append("scheduledTime", scheduledTime);
  if (imgUrl) formData.append("photoUrl", imgUrl);

  const res  = await fetch(`http://localhost:3000/posts/${clientId}`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Espera N ms. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Criando posts agendados para 15, 22 e 29/06/2026\n");
  console.log(`📅 ${CLIENTS.length} clientes × 3 datas = ${CLIENTS.length * 3} posts\n`);

  let success = 0, failed = 0;

  for (const client of CLIENTS) {
    console.log(`\n📋 ${client.id.toUpperCase()}`);

    // Busca 3 fotos na Pexels (uma por data — variedade real)
    let photos = [];
    try {
      process.stdout.write(`  🔍 buscando fotos Pexels "${client.imageQuery}"… `);
      photos = await fetchPexelsPhotos(client.imageQuery);
      console.log(`${photos.length} foto(s) encontrada(s)`);
    } catch (err) {
      console.log(`⚠️  ${err.message} — posts sem foto`);
    }

    for (let i = 0; i < DATES.length; i++) {
      const dateLabel = new Date(DATES[i]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      // Usa foto diferente para cada data (rotação circular caso tenha menos de 3)
      const imgUrl = photos.length > 0 ? photos[i % photos.length] : null;

      process.stdout.write(`  [${dateLabel}] `);
      try {
        await createPost(client.id, client.posts[i], imgUrl, DATES[i]);
        console.log(`✅ agendado${imgUrl ? " 📸" : ""}`);
        success++;
      } catch (err) {
        console.log(`❌ ${err.message}`);
        failed++;
      }

      await sleep(300);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ ${success} posts criados  |  ❌ ${failed} falhas`);
  console.log(`Acesse http://localhost:3001 para ver os posts agendados.`);
}

main().catch((err) => {
  console.error("Erro fatal:", err.message);
  process.exit(1);
});
