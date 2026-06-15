require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const app = express();

app.use(cors({ origin: [
  "http://localhost:3001",
  `http://204.168.196.118:${process.env.FRONTEND_PORT || 3001}`,
] }));
app.use(express.json());

// ─── Uploads ─────────────────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use("/uploads", express.static(uploadsDir));

// ─── Helpers gerais ───────────────────────────────────────────────────────────

function loadTemplates() {
  const raw = fs.readFileSync(path.join(__dirname, "templates.json"), "utf-8");
  return JSON.parse(raw);
}

function loadClients() {
  const raw = fs.readFileSync(path.join(__dirname, "clients.json"), "utf-8");
  return JSON.parse(raw);
}

function saveClients(data) {
  fs.writeFileSync(
    path.join(__dirname, "clients.json"),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOAuthClient(client) {
  let source = client;
  if (client.parentId) {
    const data = loadClients();
    const parent = data.clients.find((c) => c.id === client.parentId);
    if (parent) source = { ...parent, ...{ tokens: parent.tokens } };
  }

  const oauth2 = new google.auth.OAuth2(
    source.clientId || process.env.CLIENT_ID,
    source.clientSecret || process.env.CLIENT_SECRET,
    source.redirectUri || process.env.REDIRECT_URI
  );
  if (source.tokens) oauth2.setCredentials(source.tokens);
  return oauth2;
}

// ─── Posts agendados (armazenamento local) ────────────────────────────────────

const postsFilePath = path.join(__dirname, "scheduled_posts.json");

function loadPosts() {
  if (!fs.existsSync(postsFilePath)) return { posts: [] };
  return JSON.parse(fs.readFileSync(postsFilePath, "utf-8"));
}

function savePosts(data) {
  fs.writeFileSync(postsFilePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Helpers GMB Posts ────────────────────────────────────────────────────────

function locationPath(client) {
  return client.locationId.startsWith("locations/")
    ? `accounts/-/${client.locationId}`
    : client.locationId;
}

// A API GMB v4 só aceita fotos via sourceUrl (URL pública).
// Upload direto de arquivo local não é suportado.
async function publishPostToGMB(client, description, photoUrl) {
  const oauth2 = getOAuthClient(client);
  const { token } = await oauth2.getAccessToken();
  const locPath = locationPath(client);

  const body = { topicType: "STANDARD", summary: description };
  if (photoUrl) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: photoUrl }];
    console.log(`[post] Incluindo foto: ${photoUrl.slice(0, 80)}…`);
  }

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locPath}/localPosts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[post] Falha ao criar post (${res.status}): ${errText}`);
    throw new Error(errText);
  }
  return await res.json();
}

// Retorna a URL pública da foto (campo photoUrl do post).
// Arquivo local não é acessível pelo Google, então é ignorado.
function tryUploadPhoto(_client, post) {
  if (post.photoUrl) {
    console.log(`[foto] Usando URL pública: ${post.photoUrl.slice(0, 80)}…`);
    return Promise.resolve(post.photoUrl);
  }
  if (post.photoFilename) {
    console.warn(`[foto] Arquivo local ignorado (Google não acessa localhost). Publique sem foto.`);
  }
  return Promise.resolve(null);
}

function resolveTokens(client, allClients) {
  if (client.tokens) return true;
  if (!client.parentId) return false;
  const parent = allClients.find((c) => c.id === client.parentId);
  return !!parent?.tokens;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

app.get("/auth", (req, res) => {
  const clientId = req.query.clientId || "demo";
  const clients = loadClients();
  const client = clients.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).send("Cliente não encontrado");

  const oauth2 = getOAuthClient(client);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/business.manage"],
    state: clientId,
  });
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state: clientId } = req.query;
  const clients = loadClients();
  const clientIdx = clients.clients.findIndex((c) => c.id === (clientId || "demo"));
  if (clientIdx === -1) return res.status(404).send("Cliente não encontrado");

  const oauth2 = getOAuthClient(clients.clients[clientIdx]);
  const { tokens } = await oauth2.getToken(code);
  clients.clients[clientIdx].tokens = tokens;
  clients.clients[clientIdx].active = true;
  saveClients(clients);

  res.send(`✅ Login feito para "${clients.clients[clientIdx].name}"! Pode fechar esta aba.`);
});

// ─── Clientes ───────────────────────────────────────────────────────────────

app.get("/clients", (req, res) => {
  const data = loadClients();
  const safe = data.clients.map(({ tokens, clientSecret, ...rest }) => rest);
  res.json({ clients: safe });
});

// ─── Contas ─────────────────────────────────────────────────────────────────

app.get("/accounts", async (req, res) => {
  const data = loadClients();
  const activeClients = data.clients.filter((c) => c.active);

  if (activeClients.length === 0) {
    return res.json({
      accounts: data.clients.map((c) => ({
        name: c.accountId || `accounts/${c.id}`,
        accountName: c.name,
        clientId: c.id,
        active: c.active,
      })),
    });
  }

  const locations = data.clients.filter((c) => c.locationId);
  res.json({
    accounts: locations.map((c) => ({
      name: c.accountId || `accounts/${c.id}`,
      accountName: c.name,
      clientId: c.id,
      active: c.active,
    })),
  });
});

// ─── Resumo ──────────────────────────────────────────────────────────────────

app.get("/accounts-summary", async (req, res) => {
  const data = loadClients();
  const locations = data.clients.filter((c) => c.locationId);

  const summaries = await Promise.allSettled(
    locations.map(async (client) => {
      const hasTokens = resolveTokens(client, data.clients);
      if (!hasTokens) return { pending: 0 };

      try {
        const oauth2 = getOAuthClient(client);
        const { token } = await oauth2.getAccessToken();

        const locPath = client.locationId.startsWith("locations/")
          ? `accounts/-/${client.locationId}`
          : client.locationId;

        const reviewRes = await fetch(
          `https://mybusiness.googleapis.com/v4/${locPath}/reviews`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!reviewRes.ok) return { pending: 0 };

        const reviewData = await reviewRes.json();
        const pending = (reviewData.reviews || []).filter((r) => !r.reviewReply).length;
        return { pending };
      } catch {
        return { pending: 0 };
      }
    })
  );

  const accounts = locations.map((c, i) => ({
    clientId: c.id,
    accountName: c.name,
    active: c.active,
    pending: summaries[i].status === "fulfilled" ? summaries[i].value.pending : 0,
  }));

  res.json({ accounts });
});

// ─── Discover ────────────────────────────────────────────────────────────────

app.get("/discover/:clientId", async (req, res) => {
  const { clientId } = req.params;
  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });
  if (!client.tokens) {
    return res.status(401).json({ error: "Cliente não autenticado. Acesse /auth?clientId=" + clientId });
  }

  try {
    const oauth2 = getOAuthClient(client);
    const { token } = await oauth2.getAccessToken();

    const accRes = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const accData = await accRes.json();
    const accounts = accData.accounts || [];

    const result = [];
    for (const acc of accounts) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const locData = await locRes.json();
      result.push({
        accountId: acc.name,
        accountName: acc.accountName || acc.name,
        locations: (locData.locations || []).map((l) => ({ locationId: l.name, title: l.title })),
      });
    }

    res.json({ accounts: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar contas do Google" });
  }
});

// ─── Find location ───────────────────────────────────────────────────────────

app.get("/find-location/:locationNumber", async (req, res) => {
  const { locationNumber } = req.params;
  const data = loadClients();
  const gcbs = data.clients.find((c) => c.id === "gcbs");
  if (!gcbs || !gcbs.tokens) return res.status(401).json({ error: "GCBS não autenticado" });

  try {
    const oauth2 = getOAuthClient(gcbs);
    const { token } = await oauth2.getAccessToken();

    const v1Url = `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationNumber}?readMask=name,title,storefrontAddress`;
    const v1Res = await fetch(v1Url, { headers: { Authorization: `Bearer ${token}` } });
    if (v1Res.ok) {
      return res.json({ found: true, api: "v1-direct", resource: await v1Res.json() });
    }

    const v4GcbsUrl = `https://mybusiness.googleapis.com/v4/accounts/115836314928738093876/locations/${locationNumber}`;
    const v4GcbsRes = await fetch(v4GcbsUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (v4GcbsRes.ok) {
      return res.json({ found: true, api: "v4-gcbs", resource: await v4GcbsRes.json() });
    }

    const accRes = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const accounts = (await accRes.json()).accounts || [];

    for (const acc of accounts) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations/${locationNumber}?readMask=name,title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (locRes.ok) {
        return res.json({ found: true, api: "v1-account-scan", account: acc.name, resource: await locRes.json() });
      }
    }

    res.status(404).json({ error: "Localização não encontrada", locationNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno", detail: err.message });
  }
});

// ─── Set location ────────────────────────────────────────────────────────────

app.post("/clients/:clientId/set-location", (req, res) => {
  const { clientId } = req.params;
  const { accountId, locationId, name } = req.body;
  const data = loadClients();
  const idx = data.clients.findIndex((c) => c.id === clientId);
  if (idx === -1) return res.status(404).json({ error: "Cliente não encontrado" });

  data.clients[idx].accountId = accountId;
  data.clients[idx].locationId = locationId;
  if (name) data.clients[idx].name = name;
  saveClients(data);

  res.json({ success: true, client: data.clients[idx] });
});

// ─── Avaliações ───────────────────────────────────────────────────────────────

app.get("/reviews/:clientId", async (req, res) => {
  const { clientId } = req.params;
  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });

  const hasTokens = resolveTokens(client, data.clients);

  if (!hasTokens || !client.locationId) {
    return res.json({
      clientName: client.name,
      reviews: [
        {
          reviewId: "review_demo_001",
          reviewer: { displayName: "Cliente Exemplo" },
          starRating: "FIVE",
          comment: "Ótimo atendimento, super recomendo!",
          createTime: new Date().toISOString(),
          replied: false,
          replyComment: null,
        },
      ],
    });
  }

  try {
    const oauth2 = getOAuthClient(client);
    const { token } = await oauth2.getAccessToken();

    const locPath = client.locationId.startsWith("locations/")
      ? `accounts/-/${client.locationId}`
      : client.locationId;

    const reviewRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${locPath}/reviews`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!reviewRes.ok) {
      const errBody = await reviewRes.text();
      console.error("Erro Google Reviews:", errBody);
      return res.status(reviewRes.status).json({ error: errBody });
    }

    const reviewData = await reviewRes.json();
    const reviews = (reviewData.reviews || []).map((r) => ({
      reviewId: r.name,
      reviewer: { displayName: r.reviewer?.displayName || "Anônimo" },
      starRating: r.starRating,
      comment: r.comment || "",
      createTime: r.createTime,
      replied: !!r.reviewReply,
      replyComment: r.reviewReply?.comment || null,
    }));

    res.json({ clientName: client.name, reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
});

// ─── Gerar resposta ──────────────────────────────────────────────────────────

app.post("/generate-response", (req, res) => {
  const { reviewerName, rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating deve ser entre 1 e 5" });
  }

  const templates = loadTemplates();
  const bucket = templates[String(rating)];
  if (!bucket || bucket.length === 0) {
    return res.status(500).json({ error: "Templates não encontrados" });
  }

  const name = (reviewerName || "cliente").trim();
  const template = pickRandom(bucket);
  const resposta = template.replace(/\{name\}/g, name);

  res.json({ resposta });
});

// ─── Publicar resposta ───────────────────────────────────────────────────────

app.post("/reply-review", async (req, res) => {
  const { clientId, reviewName, replyText } = req.body;

  if (!clientId || !reviewName || !replyText) {
    return res.status(400).json({ error: "clientId, reviewName e replyText são obrigatórios" });
  }

  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });

  const hasTokens = resolveTokens(client, data.clients);
  if (!hasTokens) {
    return res.status(401).json({ error: "Cliente não autenticado", authUrl: `/auth?clientId=${clientId}` });
  }

  try {
    const oauth2 = getOAuthClient(client);
    const accessToken = await oauth2.getAccessToken();

    const reviewPath = reviewName.startsWith("locations/")
      ? `accounts/-/${reviewName}`
      : reviewName;
    const apiUrl = `https://mybusiness.googleapis.com/v4/${reviewPath}/reply`;

    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: replyText }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Google API error:", errBody);
      return res.status(response.status).json({ error: "Erro ao publicar no Google", detail: errBody });
    }

    res.json({ success: true, result: await response.json() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno ao publicar resposta" });
  }
});

// ─── Posts GMB ───────────────────────────────────────────────────────────────

// GET /posts/:clientId — lista posts locais + histórico real do GMB
app.get("/posts/:clientId", async (req, res) => {
  const { clientId } = req.params;
  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });

  const db = loadPosts();
  const localPosts = db.posts
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Sem autenticação ou localização → só retorna locais
  const hasTokens = resolveTokens(client, data.clients);
  if (!hasTokens || !client.locationId) {
    return res.json({ posts: localPosts });
  }

  try {
    const oauth2 = getOAuthClient(client);
    const { token } = await oauth2.getAccessToken();
    const locPath = locationPath(client);

    const gmbRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${locPath}/localPosts?pageSize=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!gmbRes.ok) {
      console.warn("GMB posts fetch failed:", await gmbRes.text());
      return res.json({ posts: localPosts });
    }

    const gmbData = await gmbRes.json();
    const gmbPosts = gmbData.localPosts || [];

    // IDs do GMB já rastreados localmente (evita duplicatas)
    const trackedIds = new Set(localPosts.map((p) => p.gmbPostId).filter(Boolean));

    // Posts do GMB que não estão no arquivo local (histórico antigo)
    const gmbOnly = gmbPosts
      .filter((p) => !trackedIds.has(p.name))
      .map((p) => ({
        id: p.name,
        clientId,
        description: p.summary || "(sem descrição)",
        photoFilename: null,
        photoUrl: p.media?.[0]?.googleUrl || p.media?.[0]?.sourceUrl || null,
        scheduledTime: null,
        status: "published",
        source: "gmb",
        gmbPostId: p.name,
        createdAt: p.createTime || new Date().toISOString(),
        publishedAt: p.createTime || new Date().toISOString(),
      }));

    const all = [...localPosts, ...gmbOnly]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ posts: all });
  } catch (err) {
    console.error("Erro ao buscar posts do GMB:", err.message);
    res.json({ posts: localPosts }); // fallback seguro
  }
});

// POST /posts/:clientId — criar/agendar post
app.post("/posts/:clientId", upload.single("photo"), async (req, res) => {
  const { clientId } = req.params;
  const { description, scheduledTime, photoUrl } = req.body;
  const photoFile = req.file;

  if (!description?.trim()) {
    return res.status(400).json({ error: "Descrição é obrigatória" });
  }

  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });
  if (!client.locationId) return res.status(400).json({ error: "Cliente sem localização configurada" });

  const hasTokens = resolveTokens(client, data.clients);
  if (!hasTokens) return res.status(401).json({ error: "Cliente não autenticado" });

  const postId = crypto.randomUUID();
  const now = new Date();
  const schedTime = scheduledTime ? new Date(scheduledTime) : null;
  const isImmediate = !schedTime || schedTime <= now;

  const newPost = {
    id: postId,
    clientId,
    description: description.trim(),
    photoFilename: photoFile ? photoFile.filename : null,
    photoUrl: photoUrl || null,
    mimeType: photoFile ? photoFile.mimetype : null,
    scheduledTime: schedTime ? schedTime.toISOString() : null,
    status: "scheduled",
    gmbPostId: null,
    createdAt: now.toISOString(),
    publishedAt: null,
  };

  if (isImmediate) {
    try {
      const googlePhotoUrl = await tryUploadPhoto(client, newPost);
      const gmbPost = await publishPostToGMB(client, newPost.description, googlePhotoUrl);

      newPost.status = "published";
      newPost.gmbPostId = gmbPost.name || null;
      newPost.publishedAt = now.toISOString();
      newPost.scheduledTime = null;

      const db = loadPosts();
      db.posts.push(newPost);
      savePosts(db);

      return res.json({ success: true, status: "published", post: newPost });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao publicar post", detail: err.message });
    }
  }

  // Agendar para depois
  const db = loadPosts();
  db.posts.push(newPost);
  savePosts(db);

  res.json({ success: true, status: "scheduled", post: newPost });
});

// POST /posts/:clientId/:postId/publish — publicar post agendado agora
app.post("/posts/:clientId/:postId/publish", async (req, res) => {
  const { clientId, postId } = req.params;

  const data = loadClients();
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return res.status(404).json({ error: "Cliente não encontrado" });

  const db = loadPosts();
  const idx = db.posts.findIndex((p) => p.id === postId && p.clientId === clientId);
  if (idx === -1) return res.status(404).json({ error: "Post não encontrado" });

  const post = db.posts[idx];
  if (post.status === "published") return res.json({ success: true, alreadyPublished: true });

  try {
    const googlePhotoUrl = await tryUploadPhoto(client, post);
    const gmbPost = await publishPostToGMB(client, post.description, googlePhotoUrl);

    db.posts[idx].status = "published";
    db.posts[idx].gmbPostId = gmbPost.name || null;
    db.posts[idx].publishedAt = new Date().toISOString();
    savePosts(db);

    res.json({ success: true, post: db.posts[idx] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao publicar post", detail: err.message });
  }
});

// DELETE /posts/:clientId/:postId — excluir post agendado
app.delete("/posts/:clientId/:postId", (req, res) => {
  const { clientId, postId } = req.params;

  const db = loadPosts();
  const idx = db.posts.findIndex((p) => p.id === postId && p.clientId === clientId);
  if (idx === -1) return res.status(404).json({ error: "Post não encontrado" });
  if (db.posts[idx].status === "published") {
    return res.status(400).json({ error: "Não é possível excluir post já publicado" });
  }

  db.posts.splice(idx, 1);
  savePosts(db);

  res.json({ success: true });
});

// ─── Cobertura semanal de posts ───────────────────────────────────────────────

function getNextFourWeeks() {
  return getWeeksRange(0, 3);
}

// Retorna semanas passadas e futuras. pastWeeks=2, futureWeeks=2 → [-2,-1,0,1,2]
function getWeeksRange(pastWeeks = 0, futureWeeks = 3) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks = [];
  for (let i = -pastWeeks; i <= futureWeeks; i++) {
    const start = new Date(monday);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    weeks.push({ start, end, weekOffset: i, isPast: i < 0, isCurrent: i === 0 });
  }
  return weeks;
}

app.get("/posts-coverage", async (req, res) => {
  const data      = loadClients();
  const locations = data.clients.filter((c) => c.locationId);
  const db        = loadPosts();
  const weeks     = getNextFourWeeks();

  // Para cada cliente, reúne posts locais + posts do GMB
  const results = await Promise.allSettled(
    locations.map(async (client) => {
      // Posts locais (agendados/publicados por aqui)
      const localPosts = db.posts.filter((p) => p.clientId === client.id);

      // Tenta buscar posts reais do GMB
      let gmbPosts = [];
      const hasTokens = resolveTokens(client, data.clients);
      if (hasTokens && client.locationId) {
        try {
          const oauth2 = getOAuthClient(client);
          const { token } = await oauth2.getAccessToken();
          const locPath = locationPath(client);
          const r = await fetch(
            `https://mybusiness.googleapis.com/v4/${locPath}/localPosts?pageSize=50`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (r.ok) {
            const d = await r.json();
            // Normaliza posts do GMB para o mesmo formato de data
            gmbPosts = (d.localPosts || []).map((p) => ({
              publishedAt: p.createTime || null,
              scheduledTime: null,
            }));
          }
        } catch { /* silencioso — usa só locais */ }
      }

      // Une os dois conjuntos (sem duplicatas por data)
      const allPosts = [...localPosts, ...gmbPosts];

      const weekCoverage = weeks.map((week, i) => {
        const hasPost = allPosts.some((p) => {
          const dateStr = p.publishedAt || p.scheduledTime;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= week.start && d <= week.end;
        });
        return {
          week: i + 1,
          weekStart: week.start.toISOString(),
          weekEnd:   week.end.toISOString(),
          hasPost,
        };
      });

      return {
        clientId:     client.id,
        clientName:   client.name,
        weeks:        weekCoverage,
        missingWeeks: weekCoverage.filter((w) => !w.hasPost).length,
        totalWeeks:   weeks.length,
      };
    })
  );

  const coverage = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  res.json({ coverage });
});

// GET /posts-coverage-full?past=2&future=2 — cobre semanas passadas + futuras
app.get("/posts-coverage-full", async (req, res) => {
  const pastWeeks   = Math.min(parseInt(req.query.past   || "2", 10), 8);
  const futureWeeks = Math.min(parseInt(req.query.future || "2", 10), 8);

  const data      = loadClients();
  const locations = data.clients.filter((c) => c.locationId);
  const db        = loadPosts();
  const weeks     = getWeeksRange(pastWeeks, futureWeeks);

  const results = await Promise.allSettled(
    locations.map(async (client) => {
      const localPosts = db.posts.filter((p) => p.clientId === client.id);

      let gmbPosts = [];
      const hasTokens = resolveTokens(client, data.clients);
      if (hasTokens && client.locationId) {
        try {
          const oauth2 = getOAuthClient(client);
          const { token } = await oauth2.getAccessToken();
          const locPath = locationPath(client);
          const r = await fetch(
            `https://mybusiness.googleapis.com/v4/${locPath}/localPosts?pageSize=50`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (r.ok) {
            const d = await r.json();
            gmbPosts = (d.localPosts || []).map((p) => ({
              publishedAt: p.createTime || null,
              scheduledTime: null,
            }));
          }
        } catch { /* silencioso */ }
      }

      const allPosts = [...localPosts, ...gmbPosts];

      const weekCoverage = weeks.map((week) => {
        const hasPost = allPosts.some((p) => {
          const dateStr = p.publishedAt || p.scheduledTime;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= week.start && d <= week.end;
        });
        return {
          weekOffset: week.weekOffset,
          weekStart:  week.start.toISOString(),
          weekEnd:    week.end.toISOString(),
          isPast:     week.isPast,
          isCurrent:  week.isCurrent,
          hasPost,
        };
      });

      return {
        clientId:     client.id,
        clientName:   client.name,
        weeks:        weekCoverage,
        missingWeeks: weekCoverage.filter((w) => !w.hasPost).length,
      };
    })
  );

  const coverage = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  res.json({ coverage, totalClients: locations.length });
});

// ─── Auto-resposta: responde TODAS as avaliações pendentes de TODOS os clientes ──

app.post("/auto-reply-all", async (req, res) => {
  const data = loadClients();
  const templates = loadTemplates();
  const locations = data.clients.filter((c) => c.locationId);

  const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

  let totalReplied = 0;
  let totalFailed  = 0;
  const results    = [];

  for (const client of locations) {
    const hasTokens = resolveTokens(client, data.clients);
    if (!hasTokens) {
      results.push({ clientId: client.id, clientName: client.name, status: "no_auth", replied: 0, failed: 0, skipped: 0 });
      continue;
    }

    // ── Busca avaliações do cliente ──────────────────────────────────────────
    let reviews = [];
    let oauth2;
    try {
      oauth2 = getOAuthClient(client);
      const { token } = await oauth2.getAccessToken();

      const locPath = client.locationId.startsWith("locations/")
        ? `accounts/-/${client.locationId}`
        : client.locationId;

      const reviewRes = await fetch(
        `https://mybusiness.googleapis.com/v4/${locPath}/reviews`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!reviewRes.ok) {
        const errText = await reviewRes.text();
        console.warn(`[auto-reply] Erro ao buscar reviews de ${client.name}:`, errText);
        results.push({ clientId: client.id, clientName: client.name, status: "fetch_error", replied: 0, failed: 0, skipped: 0 });
        continue;
      }

      const reviewData = await reviewRes.json();
      reviews = reviewData.reviews || [];
    } catch (err) {
      console.error(`[auto-reply] Exceção ao buscar reviews de ${client.name}:`, err.message);
      results.push({ clientId: client.id, clientName: client.name, status: "error", error: err.message, replied: 0, failed: 0, skipped: 0 });
      continue;
    }

    const pending = reviews.filter((r) => !r.reviewReply);
    let replied = 0, failed = 0, skipped = 0;

    // ── Responde cada avaliação pendente ─────────────────────────────────────
    for (const review of pending) {
      const rating = STAR_MAP[review.starRating] ?? 3;
      const bucket = templates[String(rating)];
      if (!bucket || bucket.length === 0) { skipped++; continue; }

      const name      = (review.reviewer?.displayName || "cliente").trim();
      const replyText = pickRandom(bucket).replace(/\{name\}/g, name);

      try {
        const { token } = await oauth2.getAccessToken();

        // Monta o caminho correto para PUT /reply
        const reviewPath = review.name.startsWith("locations/")
          ? `accounts/-/${review.name}`
          : review.name;

        const apiUrl  = `https://mybusiness.googleapis.com/v4/${reviewPath}/reply`;
        const apiRes  = await fetch(apiUrl, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ comment: replyText }),
        });

        if (apiRes.ok) {
          replied++;
          totalReplied++;
          console.log(`[auto-reply] ✅ ${client.name} — ${name}`);
        } else {
          const errText = await apiRes.text();
          console.warn(`[auto-reply] ❌ ${client.name} — ${name}:`, errText);
          failed++;
          totalFailed++;
        }
      } catch (err) {
        console.error(`[auto-reply] Exceção ao responder ${name}:`, err.message);
        failed++;
        totalFailed++;
      }
    }

    results.push({
      clientId:   client.id,
      clientName: client.name,
      status:     "ok",
      total:      pending.length,
      replied,
      failed,
      skipped,
    });
  }

  res.json({ success: true, totalReplied, totalFailed, results });
});

// ─── Agendador: publica posts quando chega a hora ────────────────────────────

async function runScheduler() {
  const db   = loadPosts();
  const data = loadClients();
  const now  = new Date();

  const due = db.posts.filter(
    (p) => p.status === "scheduled" && p.scheduledTime && new Date(p.scheduledTime) <= now
  );

  if (due.length === 0) return;

  console.log(`[scheduler] ${due.length} post(s) vencido(s) — publicando…`);

  for (const post of due) {
    const client = data.clients.find((c) => c.id === post.clientId);
    if (!client || !client.locationId) {
      console.warn(`[scheduler] Cliente ${post.clientId} sem locationId — pulando`);
      continue;
    }

    const hasTokens = resolveTokens(client, data.clients);
    if (!hasTokens) {
      console.warn(`[scheduler] Cliente ${post.clientId} sem tokens — pulando`);
      continue;
    }

    try {
      const googlePhotoUrl = await tryUploadPhoto(client, post);
      const gmbPost        = await publishPostToGMB(client, post.description, googlePhotoUrl);

      // Atualiza status no arquivo
      const idx = db.posts.findIndex((p) => p.id === post.id);
      if (idx !== -1) {
        db.posts[idx].status      = "published";
        db.posts[idx].gmbPostId   = gmbPost.name || null;
        db.posts[idx].publishedAt = new Date().toISOString();
      }

      console.log(`[scheduler] ✅ Publicado: ${post.clientId} — ${post.description.slice(0, 50)}…`);
    } catch (err) {
      console.error(`[scheduler] ❌ Erro ao publicar ${post.id}:`, err.message);
    }
  }

  savePosts(db);
}

// Roda imediatamente ao iniciar (pega qualquer post atrasado) e depois a cada 5 min
runScheduler();
setInterval(runScheduler, 5 * 60 * 1000);

// ─── Servidor ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
  console.log("🕐 Agendador ativo — verifica posts a cada 5 minutos");
});
