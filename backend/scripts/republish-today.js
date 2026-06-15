/**
 * republish-today.js
 * Reseta os posts do dia 15/06 para "scheduled" com fotos Pexels.
 * O scheduler do backend republica automaticamente na próxima rodada.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs   = require("fs");
const path = require("path");

const PEXELS_KEY = process.env.PEXELS_API_KEY;
const POSTS_FILE = path.join(__dirname, "../scheduled_posts.json");

if (!PEXELS_KEY) { console.error("❌ PEXELS_API_KEY não encontrada"); process.exit(1); }

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
async function fetchPhoto(query) {
  if (_cache[query]) return _cache[query];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  const photo = (data.photos || [])[0];
  if (!photo) throw new Error(`Sem fotos para "${query}"`);
  _cache[query] = photo.src.large2x || photo.src.large;
  return _cache[query];
}

async function main() {
  const db = JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));

  const today = db.posts.filter(p =>
    p.scheduledTime && p.scheduledTime.startsWith("2026-06-15")
  );

  console.log(`🔄 ${today.length} posts do dia 15/06 encontrados\n`);

  for (const post of today) {
    const query = IMAGE_QUERIES[post.clientId];
    process.stdout.write(`  ${post.clientId} — `);

    let photoUrl = null;
    if (query) {
      try {
        photoUrl = await fetchPhoto(query);
        process.stdout.write(`📸 foto ok\n`);
      } catch (e) {
        process.stdout.write(`⚠️  sem foto (${e.message})\n`);
      }
    } else {
      process.stdout.write(`⚠️  sem query definida\n`);
    }

    const idx = db.posts.findIndex(p => p.id === post.id);
    if (idx !== -1) {
      db.posts[idx].status       = "scheduled";
      db.posts[idx].gmbPostId    = null;
      db.posts[idx].publishedAt  = null;
      db.posts[idx].photoUrl     = photoUrl;
      db.posts[idx].photoFilename= null;
      db.posts[idx].mimeType     = null;
    }
  }

  fs.writeFileSync(POSTS_FILE, JSON.stringify(db, null, 2), "utf-8");
  console.log(`\n✅ Posts resetados! O scheduler vai republicar em até 5 minutos.`);
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
