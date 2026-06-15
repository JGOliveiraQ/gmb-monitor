/**
 * add-photos.js
 * Busca fotos no Pexels e adiciona photoUrl em todos os posts ainda "scheduled".
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs   = require("fs");
const path = require("path");

const PEXELS_KEY   = process.env.PEXELS_API_KEY;
const POSTS_FILE   = path.join(__dirname, "../scheduled_posts.json");

if (!PEXELS_KEY) {
  console.error("❌ PEXELS_API_KEY não encontrada no .env");
  process.exit(1);
}

const IMAGE_QUERIES = {
  "ddtiza":           "pest control exterminator",
  "dr-othavio":       "neurosurgery spine doctor",
  "via-das-flores":   "flower bouquet arrangement",
  "dr-igor":          "knee orthopedic surgery rehabilitation",
  "clinica-pe-wagner":"foot podiatry medical clinic",
  "orthocrin":        "orthopedic medical products store",
  "dr-gil-galvao":    "ankle foot surgery orthopedic",
  "dr-jacques":       "ophthalmology eye doctor examination",
  "preall":           "concrete design architecture interior",
  "dr-pedro":         "urology kidney medical doctor",
  "dr-diego":         "hand surgery microsurgery medical",
  "previct":          "barbecue grill outdoor leisure backyard",
  "dr-raphael":       "shoulder elbow orthopedic rehabilitation",
};

const _cache = {};

async function fetchPhotos(query, count = 3) {
  if (_cache[query]) return _cache[query];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const urls = (data.photos || []).map(p => p.src.large2x || p.src.large);
  if (urls.length === 0) throw new Error(`Sem fotos para "${query}"`);
  _cache[query] = urls;
  return urls;
}

async function main() {
  const db = JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
  const scheduled = db.posts.filter(p => p.status === "scheduled");

  console.log(`📋 ${scheduled.length} posts agendados para atualizar\n`);

  // Agrupa por clientId para buscar fotos uma vez por cliente
  const byClient = {};
  for (const p of scheduled) {
    if (!byClient[p.clientId]) byClient[p.clientId] = [];
    byClient[p.clientId].push(p);
  }

  for (const [clientId, posts] of Object.entries(byClient)) {
    const query = IMAGE_QUERIES[clientId];
    if (!query) {
      console.log(`⚠️  ${clientId}: sem query definida — pulando`);
      continue;
    }

    process.stdout.write(`📸 ${clientId} (${posts.length} posts) — buscando "${query}"… `);
    let photos = [];
    try {
      photos = await fetchPhotos(query, Math.max(3, posts.length));
      console.log(`${photos.length} foto(s)`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      continue;
    }

    posts.forEach((post, i) => {
      const idx = db.posts.findIndex(p => p.id === post.id);
      if (idx !== -1) {
        db.posts[idx].photoUrl      = photos[i % photos.length];
        db.posts[idx].photoFilename = null;
        db.posts[idx].mimeType      = null;
        console.log(`   ✅ ${post.id.slice(0,8)}… → ${db.posts[idx].photoUrl.slice(0,60)}…`);
      }
    });
  }

  fs.writeFileSync(POSTS_FILE, JSON.stringify(db, null, 2), "utf-8");
  console.log(`\n✅ scheduled_posts.json atualizado com fotos Pexels!`);
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
