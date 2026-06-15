"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Review {
  reviewId: string;
  reviewer: { displayName: string };
  starRating: string;
  comment: string;
  createTime: string;
  replied: boolean;
  replyComment: string | null;
  draft?: string;
  loadingDraft?: boolean;
  published?: boolean;
}

interface Post {
  id: string;
  clientId: string;
  description: string;
  photoFilename: string | null;
  photoUrl?: string | null;       // foto de posts vindos direto do GMB
  scheduledTime: string | null;
  status: "scheduled" | "published";
  source?: "gmb" | "local";       // "gmb" = histórico do Google, "local" = criado aqui
  gmbPostId: string | null;
  createdAt: string;
  publishedAt: string | null;
}

interface CalendarDayData {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
}

interface CalendarWeekData {
  days: CalendarDayData[];
  hasPost: boolean;
}

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function stars(rating: string) {
  const n = STAR_MAP[rating] ?? 0;
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ─── Calendário helper ───────────────────────────────────────────────────────

function buildCalendarWeeks(year: number, month: number, posts: Post[]): CalendarWeekData[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const weeks: CalendarWeekData[] = [];

  let cur = new Date(firstDay);
  const dow = cur.getDay();
  cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1)); // retrocede até segunda

  while (cur <= lastDay) {
    const weekStart = new Date(cur);
    const days: CalendarDayData[] = [];

    for (let i = 0; i < 7; i++) {
      days.push({ date: new Date(cur), dayNumber: cur.getDate(), isCurrentMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }

    const weekEnd = new Date(cur);
    weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1);

    const hasPost = posts.some((p) => {
      const ds = p.publishedAt || p.scheduledTime;
      if (!ds) return false;
      const d = new Date(ds);
      return d >= weekStart && d <= weekEnd;
    });

    if (days.some((d) => d.isCurrentMonth)) {
      weeks.push({ days, hasPost });
    }
  }

  return weeks;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { msg: string; type: "success" | "error" }

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`toast ${toast.type}`}>
      <span>{toast.type === "success" ? "✅" : "❌"}</span>
      <span>{toast.msg}</span>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
}

// ─── Modal de confirmação ─────────────────────────────────────────────────────

function ConfirmModal({ reviewerName, replyText, publishing, onConfirm, onCancel }: {
  reviewerName: string; replyText: string; publishing: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">Confirmar publicação</div>
        <div className="modal-sub">Enviando resposta para <strong>{reviewerName}</strong></div>
        <div className="modal-preview">{replyText}</div>
        <div className="modal-actions">
          <button className="btn-outline-cancel" onClick={onCancel} disabled={publishing}>Cancelar</button>
          <button className="btn-primary" onClick={onConfirm} disabled={publishing}>
            {publishing ? <><div className="spinner sm" />Enviando…</> : "✅ Confirmar e publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendário de agendamento ────────────────────────────────────────────────

function PostCalendar({ value, onChange, existingPosts }: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  existingPosts: Post[];
}) {
  const todayBase = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [viewYear,  setViewYear]  = useState(todayBase.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayBase.getMonth());
  const [time, setTime] = useState("10:00");

  const weeks = useMemo(
    () => buildCalendarWeeks(viewYear, viewMonth, existingPosts),
    [viewYear, viewMonth, existingPosts]
  );

  function goMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  function selectDay(day: CalendarDayData) {
    if (!day.isCurrentMonth || day.date < todayBase) return;
    const [h, mi] = time.split(":").map(Number);
    const result = new Date(day.date);
    result.setHours(h, mi, 0, 0);
    onChange(result);
  }

  function handleTime(t: string) {
    setTime(t);
    if (value) {
      const [h, mi] = t.split(":").map(Number);
      const result = new Date(value);
      result.setHours(h, mi, 0, 0);
      onChange(result);
    }
  }

  const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="post-calendar">
      {/* Cabeçalho mês */}
      <div className="cal-header">
        <button type="button" className="cal-nav" onClick={() => goMonth(-1)}>‹</button>
        <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="cal-nav" onClick={() => goMonth(1)}>›</button>
      </div>

      {/* Labels dos dias */}
      <div className="cal-day-labels">
        {DAY_LABELS.map((d) => <div key={d} className="cal-day-label">{d}</div>)}
        <div className="cal-day-label" />
      </div>

      {/* Semanas */}
      {weeks.map((week, wi) => (
        <div key={wi} className={`cal-week-row ${week.hasPost ? "has-post" : "needs-post"}`}>
          {week.days.map((day, di) => {
            const isPast      = day.date < todayBase;
            const isOther     = !day.isCurrentMonth;
            const isSelected  = value ? day.date.toDateString() === value.toDateString() : false;
            const isToday     = day.date.toDateString() === todayBase.toDateString();
            return (
              <div
                key={di}
                onClick={() => selectDay(day)}
                className={[
                  "cal-day-cell",
                  isOther    ? "other-month" : "",
                  isPast     ? "past"        : "",
                  isSelected ? "selected"    : "",
                  isToday    ? "today"       : "",
                  !isPast && !isOther ? "clickable" : "",
                ].filter(Boolean).join(" ")}
              >
                {day.dayNumber}
              </div>
            );
          })}
          {/* Indicador de cobertura da semana */}
          <div
            className={`cal-week-indicator ${week.hasPost ? "ok" : "missing"}`}
            title={week.hasPost ? "Semana já tem post" : "Semana sem post"}
          >
            {week.hasPost ? "✓" : "!"}
          </div>
        </div>
      ))}

      {/* Horário */}
      <div className="cal-time-row">
        <span className="cal-time-label">🕐 Horário</span>
        <input type="time" className="cal-time-input" value={time} onChange={(e) => handleTime(e.target.value)} />
      </div>

      {/* Resumo do selecionado */}
      {value && (
        <div className="cal-selected-summary">
          📅 {value.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} às {time}
        </div>
      )}
    </div>
  );
}

// ─── Card de avaliação ────────────────────────────────────────────────────────

function ReviewCard({ review, replyOpen, onToggleReply, onDraftChange, onGenerate, onPublish }: {
  review: Review; replyOpen: boolean; onToggleReply: () => void;
  onDraftChange: (id: string, text: string) => void;
  onGenerate: (id: string) => void; onPublish: (id: string) => void;
}) {
  const rating  = STAR_MAP[review.starRating] ?? 0;
  const starsStr = stars(review.starRating);
  const isDone  = review.published || review.replied;

  return (
    <div className={`review-card ${isDone ? "replied" : ""}`}>
      <div className="rc-head">
        <div>
          <div className="rc-author">{review.reviewer.displayName}</div>
          <div className="rc-date">{formatDate(review.createTime)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: rating >= 4 ? "var(--green)" : rating <= 2 ? "var(--red)" : "var(--p1)", fontSize: "16px", display: "block" }}>
            {starsStr}
          </span>
          {isDone && <span className="replied-badge" style={{ marginTop: "4px", display: "inline-block" }}>✅ Respondido</span>}
        </div>
      </div>

      {!isDone && (
        <div className="rc-stars" style={{ color: rating >= 4 ? "var(--green)" : rating <= 2 ? "var(--red)" : "var(--p1)" }}>
          {starsStr}
        </div>
      )}

      {review.comment
        ? <div className="rc-comment">"{review.comment.replace(/\n\n\(Translated by Google\)[\s\S]*/i, "").trim()}"</div>
        : <div className="rc-comment" style={{ opacity: 0.4 }}>Sem comentário escrito</div>
      }

      {isDone && review.replyComment && (
        <div style={{ marginTop: "12px" }}>
          <button className="btn-reply-toggle" onClick={onToggleReply}>
            <span>{replyOpen ? "▲" : "▼"}</span>
            {replyOpen ? "Ocultar resposta" : "Ver minha resposta"}
          </button>
          {replyOpen && <div className="reply-preview">{review.replyComment}</div>}
        </div>
      )}

      {!isDone && (
        <div style={{ marginTop: "14px" }}>
          <button className="btn-primary" onClick={() => onGenerate(review.reviewId)} disabled={review.loadingDraft}>
            {review.loadingDraft ? <><div className="spinner sm" />Gerando…</> : <>✨ Gerar resposta</>}
          </button>
          {review.draft !== undefined && (
            <>
              <textarea
                className="reply-textarea"
                value={review.draft}
                onChange={(e) => onDraftChange(review.reviewId, e.target.value)}
                placeholder="A resposta gerada aparecerá aqui. Edite se necessário."
                rows={4}
              />
              <button className="btn-publish" onClick={() => onPublish(review.reviewId)} disabled={!review.draft?.trim()}>
                📤 Publicar resposta
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Formulário de novo post ──────────────────────────────────────────────────

function PostForm({ clientId, existingPosts, onSuccess, onToast }: {
  clientId: string; existingPosts: Post[];
  onSuccess: (post: Post) => void;
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [description,   setDescription]   = useState("");
  const [photo,         setPhoto]         = useState<File | null>(null);
  const [photoPreview,  setPhotoPreview]  = useState<string | null>(null);
  const [scheduleMode,  setScheduleMode]  = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhoto(file: File | null) {
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    if (scheduleMode && !scheduledDate) return;

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("description", description.trim());
      if (photo) form.append("photo", photo);
      if (scheduleMode && scheduledDate) form.append("scheduledTime", scheduledDate.toISOString());

      const res  = await fetch(`${API}/posts/${clientId}`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar post");

      onSuccess(data.post);
      onToast(data.status === "published" ? "Post publicado no Google!" : "Post agendado com sucesso!", "success");
      setDescription(""); setPhoto(null); setPhotoPreview(null);
      setScheduledDate(null); setScheduleMode(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao criar post", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      <div className="post-form-title">Novo post</div>

      {/* Foto */}
      <div
        className={`photo-drop ${photoPreview ? "has-photo" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); handlePhoto(e.dataTransfer.files[0] ?? null); }}
        onDragOver={(e) => e.preventDefault()}
      >
        {photoPreview ? (
          <>
            <img src={photoPreview} alt="Preview" className="photo-preview-img" />
            <button type="button" className="photo-remove"
              onClick={(e) => { e.stopPropagation(); handlePhoto(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              ✕
            </button>
          </>
        ) : (
          <div className="photo-placeholder">
            <span className="photo-icon">🖼</span>
            <span>Clique ou arraste uma foto</span>
            <span style={{ fontSize: "11px", opacity: 0.5 }}>JPG, PNG, WEBP • até 10 MB</span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />

      {/* Descrição */}
      <textarea
        className="reply-textarea" style={{ marginTop: "14px" }}
        placeholder="Descrição do post…" value={description}
        onChange={(e) => setDescription(e.target.value)} rows={4} required
      />

      {/* Publicação */}
      <div className="publish-mode-row">
        <button type="button" className={`mode-btn ${!scheduleMode ? "active" : ""}`} onClick={() => setScheduleMode(false)}>
          Publicar agora
        </button>
        <button type="button" className={`mode-btn ${scheduleMode ? "active" : ""}`} onClick={() => setScheduleMode(true)}>
          📅 Agendar
        </button>
      </div>

      {/* Calendário */}
      {scheduleMode && (
        <PostCalendar
          value={scheduledDate}
          onChange={setScheduledDate}
          existingPosts={existingPosts}
        />
      )}

      <button
        type="submit"
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center", marginTop: "14px" }}
        disabled={submitting || !description.trim() || (scheduleMode && !scheduledDate)}
      >
        {submitting
          ? <><div className="spinner sm" />{scheduleMode ? "Agendando…" : "Publicando…"}</>
          : scheduleMode ? "📅 Agendar post" : "📢 Publicar agora"
        }
      </button>
    </form>
  );
}

// ─── Card de post ─────────────────────────────────────────────────────────────

function PostCard({ post, onPublish, onDelete }: {
  post: Post; onPublish: (id: string) => void; onDelete: (id: string) => void;
}) {
  const isScheduled = post.status === "scheduled";
  const isGmb = post.source === "gmb";

  // Imagem: local (upload) ou URL do Google
  const imgSrc = post.photoFilename
    ? `${API}/uploads/${post.photoFilename}`
    : post.photoUrl ?? null;

  return (
    <div className={`post-card ${isScheduled ? "scheduled" : "published"}`}>
      {imgSrc && <img src={imgSrc} alt="Foto do post" className="post-thumb" />}
      <div className="post-card-body">
        <div className="post-description">{post.description}</div>
        <div className="post-meta" style={{ gap: "6px", flexWrap: "wrap" }}>
          {isScheduled
            ? <span className="post-badge scheduled">🕐 Agendado para {post.scheduledTime ? formatDateTime(post.scheduledTime) : "—"}</span>
            : <span className="post-badge published">✅ Publicado em {post.publishedAt ? formatDateTime(post.publishedAt) : "—"}</span>
          }
          {isGmb && <span className="post-badge gmb">Google</span>}
        </div>
        {isScheduled && (
          <div className="post-actions">
            <button className="btn-publish" style={{ width: "auto", flex: 1, marginTop: "10px" }} onClick={() => onPublish(post.id)}>
              📢 Publicar agora
            </button>
            <button className="btn-delete" onClick={() => onDelete(post.id)}>🗑 Excluir</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba: Posts ───────────────────────────────────────────────────────────────

function PostsTab({ clientId, onToast }: { clientId: string; onToast: (msg: string, type: "success" | "error") => void }) {
  const [posts,   setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    fetch(`${API}/posts/${clientId}`)
      .then((r) => r.json())
      .then((d) => { setPosts(d.posts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function handlePublish(postId: string) {
    try {
      const res  = await fetch(`${API}/posts/${clientId}/${postId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao publicar");
      setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
      onToast("Post publicado com sucesso!", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao publicar", "error");
    }
  }

  async function handleDelete(postId: string) {
    try {
      const res = await fetch(`${API}/posts/${clientId}/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      onToast("Post excluído.", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao excluir", "error");
    }
  }

  const scheduled = posts.filter((p) => p.status === "scheduled");
  const published  = posts.filter((p) => p.status === "published");

  return (
    <div>
      <PostForm clientId={clientId} existingPosts={posts} onSuccess={(p) => setPosts((prev) => [p, ...prev])} onToast={onToast} />

      {loading && <div className="loading" style={{ padding: "30px 0" }}><div className="spinner" /><p>Carregando posts…</p></div>}

      {!loading && scheduled.length > 0 && (
        <section style={{ marginTop: "32px" }}>
          <div className="section-label">Agendados</div>
          <div className="posts-list">
            {scheduled.map((p) => <PostCard key={p.id} post={p} onPublish={handlePublish} onDelete={handleDelete} />)}
          </div>
        </section>
      )}

      {!loading && published.length > 0 && (
        <section style={{ marginTop: "32px" }}>
          <div className="section-label">Publicados</div>
          <div className="posts-list">
            {published.map((p) => <PostCard key={p.id} post={p} onPublish={handlePublish} onDelete={handleDelete} />)}
          </div>
        </section>
      )}

      {!loading && posts.length === 0 && (
        <div className="empty-state" style={{ padding: "30px 0" }}>
          <div className="empty-icon">📝</div>
          <h3>Nenhum post ainda</h3>
          <p>Use o formulário acima para publicar ou agendar o primeiro post.</p>
        </div>
      )}
    </div>
  );
}

// ─── Aba: Avaliações ──────────────────────────────────────────────────────────

function ReviewsTab({ clientId, onToast }: { clientId: string; onToast: (msg: string, type: "success" | "error") => void }) {
  const [reviews,       setReviews]      = useState<Review[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<Review | null>(null);
  const [publishing,    setPublishing]   = useState(false);
  const [openReplies,   setOpenReplies]  = useState<Set<string>>(new Set());
  const [starFilter,    setStarFilter]   = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/reviews/${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        setReviews((data.reviews || []).map((r: Review) => ({ ...r, draft: undefined, loadingDraft: false, published: r.replied })));
        setLoading(false);
      })
      .catch(() => { onToast("Erro ao carregar avaliações", "error"); setLoading(false); });
  }, [clientId]);

  function patch(reviewId: string, update: Partial<Review>) {
    setReviews((prev) => prev.map((r) => (r.reviewId === reviewId ? { ...r, ...update } : r)));
  }

  function toggleReply(reviewId: string) {
    setOpenReplies((prev) => { const n = new Set(prev); n.has(reviewId) ? n.delete(reviewId) : n.add(reviewId); return n; });
  }

  const handleGenerate = useCallback(async (reviewId: string) => {
    const rev = reviews.find((r) => r.reviewId === reviewId);
    if (!rev) return;
    patch(reviewId, { loadingDraft: true });
    try {
      const res  = await fetch(`${API}/generate-response`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerName: rev.reviewer.displayName, rating: STAR_MAP[rev.starRating] ?? 3 }),
      });
      const data = await res.json();
      patch(reviewId, { draft: data.resposta, loadingDraft: false });
    } catch {
      patch(reviewId, { loadingDraft: false });
      onToast("Erro ao gerar resposta", "error");
    }
  }, [reviews]);

  async function handleConfirm() {
    if (!confirmTarget) return;
    setPublishing(true);
    try {
      const res = await fetch(`${API}/reply-review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, reviewName: confirmTarget.reviewId, replyText: confirmTarget.draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao publicar");
      patch(confirmTarget.reviewId, { published: true, replyComment: confirmTarget.draft ?? null, draft: undefined });
      onToast(`Resposta publicada para ${confirmTarget.reviewer.displayName}!`, "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao publicar", "error");
    } finally {
      setPublishing(false);
      setConfirmTarget(null);
    }
  }

  // Contagem por estrela (sobre todas as avaliações, sem filtro)
  const countByStar = (n: number) => reviews.filter((r) => (STAR_MAP[r.starRating] ?? 0) === n).length;

  // Aplica filtro de estrelas
  const visible = starFilter ? reviews.filter((r) => (STAR_MAP[r.starRating] ?? 0) === starFilter) : reviews;
  const pending  = visible.filter((r) => !r.published && !r.replied);
  const done     = visible.filter((r) => r.published || r.replied);

  return (
    <>
      {loading && <div className="loading"><div className="spinner" /><p>Buscando avaliações…</p></div>}

      {/* Filtro por estrelas */}
      {!loading && reviews.length > 0 && (
        <div className="star-filter-bar">
          <button
            className={`star-filter-btn ${starFilter === null ? "active" : ""}`}
            onClick={() => setStarFilter(null)}
          >
            Todas
            <span className="sfb-count">{reviews.length}</span>
          </button>
          {[5, 4, 3, 2, 1].map((n) => (
            <button
              key={n}
              className={`star-filter-btn ${starFilter === n ? "active" : ""} star-${n}`}
              onClick={() => setStarFilter(starFilter === n ? null : n)}
              disabled={countByStar(n) === 0}
            >
              {"★".repeat(n)}
              <span className="sfb-count">{countByStar(n)}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && pending.length > 0 && (
        <section style={{ marginBottom: "32px" }}>
          <div className="section-label">Aguardando resposta</div>
          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {pending.map((rev) => (
              <ReviewCard key={rev.reviewId} review={rev}
                replyOpen={openReplies.has(rev.reviewId)}
                onToggleReply={() => toggleReply(rev.reviewId)}
                onDraftChange={(id, text) => patch(id, { draft: text })}
                onGenerate={handleGenerate}
                onPublish={(id) => setConfirmTarget(reviews.find((r) => r.reviewId === id) ?? null)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && done.length > 0 && (
        <section>
          <div className="section-label">Já respondidas</div>
          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {done.map((rev) => (
              <ReviewCard key={rev.reviewId} review={rev}
                replyOpen={openReplies.has(rev.reviewId)}
                onToggleReply={() => toggleReply(rev.reviewId)}
                onDraftChange={() => {}} onGenerate={() => {}} onPublish={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && visible.length === 0 && reviews.length > 0 && (
        <div className="empty-state">
          <div className="empty-icon">{"★".repeat(starFilter ?? 0)}</div>
          <h3>Nenhuma avaliação com {starFilter} estrela{starFilter !== 1 ? "s" : ""}</h3>
          <p>Selecione outro filtro para ver outras avaliações.</p>
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <h3>Nenhuma avaliação encontrada</h3>
          <p>Este cliente ainda não possui avaliações registradas.</p>
        </div>
      )}

      {confirmTarget && (
        <ConfirmModal reviewerName={confirmTarget.reviewer.displayName} replyText={confirmTarget.draft || ""}
          publishing={publishing} onConfirm={handleConfirm} onCancel={() => setConfirmTarget(null)} />
      )}
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Tab = "posts" | "reviews";

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const [clientId,   setClientId]   = useState("");
  const [clientName, setClientName] = useState("");
  const [tab,        setTab]        = useState<Tab>("posts");
  const [toast,      setToast]      = useState<ToastState | null>(null);

  // Lê o parâmetro ?tab da URL para abrir a aba correta direto
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t === "posts" || t === "reviews") setTab(t);
  }, []);

  useEffect(() => {
    params.then((p) => setClientId(p.id));
  }, [params]);

  useEffect(() => {
    if (!clientId) return;
    fetch(`${API}/reviews/${clientId}`)
      .then((r) => r.json())
      .then((d) => setClientName(d.clientName || clientId))
      .catch(() => {});
  }, [clientId]);

  if (!clientId) return null;

  return (
    <main>
      <a className="back-link" href="/">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Voltar ao painel
      </a>

      <div className="page-header">
        <h1>{clientName || clientId}</h1>
        <p style={{ marginTop: "4px", fontSize: "13px", color: "var(--muted)" }}>Google Meu Negócio</p>
      </div>

      <div className="tab-content">
        {tab === "posts"   && <PostsTab   clientId={clientId} onToast={(msg, t) => setToast({ msg, type: t })} />}
        {tab === "reviews" && <ReviewsTab clientId={clientId} onToast={(msg, t) => setToast({ msg, type: t })} />}
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
}
