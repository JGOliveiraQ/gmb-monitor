"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Mode = "posts" | "reviews";

interface Account {
  accountName: string;
  clientId: string;
  active: boolean;
  pending: number;
}

interface WeekInfo {
  week: number;
  weekStart: string;
  weekEnd: string;
  hasPost: boolean;
}

interface ClientCoverage {
  clientId: string;
  weeks: WeekInfo[];
  missingWeeks: number;
  totalWeeks: number;
}

interface AutoReplyClientResult {
  clientId: string;
  clientName: string;
  status: "ok" | "no_auth" | "fetch_error" | "error";
  total?: number;
  replied?: number;
  failed?: number;
  skipped?: number;
  error?: string;
}

interface AutoReplyResult {
  success: boolean;
  totalReplied: number;
  totalFailed: number;
  results: AutoReplyClientResult[];
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("posts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [coverage, setCoverage] = useState<ClientCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoReplying, setAutoReplying] = useState(false);
  const [autoResult, setAutoResult]     = useState<AutoReplyResult | null>(null);

  const refreshData = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      fetch(`${API}/accounts-summary`).then((r) => r.json()),
      fetch(`${API}/posts-coverage`).then((r) => r.json()),
    ]).then(([summaryResult, coverageResult]) => {
      if (summaryResult.status === "fulfilled") {
        setAccounts(summaryResult.value.accounts || []);
      }
      if (coverageResult.status === "fulfilled") {
        setCoverage(coverageResult.value.coverage || []);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAutoReplyAll = useCallback(async () => {
    setAutoReplying(true);
    setAutoResult(null);
    try {
      const res  = await fetch(`${API}/auto-reply-all`, { method: "POST" });
      const data: AutoReplyResult = await res.json();
      setAutoResult(data);
      // Atualiza contadores de pendentes
      refreshData();
    } catch {
      setAutoResult({ success: false, totalReplied: 0, totalFailed: 0, results: [] });
    } finally {
      setAutoReplying(false);
    }
  }, [refreshData]);

  function getCoverage(clientId: string): ClientCoverage | undefined {
    return coverage.find((c) => c.clientId === clientId);
  }

  const clientsWithAlert = accounts.filter((a) => {
    const cov = getCoverage(a.clientId);
    return cov && cov.missingWeeks > 0;
  });

  const totalPending = accounts.reduce((sum, a) => sum + a.pending, 0);

  // ── Agrupamento de clientes ─────────────────────────────────────────────────
  const SAUDE_IDS = new Set([
    "dr-othavio", "dr-igor", "clinica-pe-wagner",
    "dr-gil-galvao", "dr-jacques", "dr-pedro", "dr-diego", "dr-raphael",
  ]);

  const grupoSaude  = accounts.filter((a) => SAUDE_IDS.has(a.clientId));
  const grupoOutros = accounts.filter((a) => !SAUDE_IDS.has(a.clientId));

  function openClient(clientId: string) {
    router.push(`/reviews/${clientId}?tab=${mode}`);
  }

  return (
    <main>
      <div className="page-header">
        <h1>O que deseja fazer?</h1>
        <p>Escolha a seção e depois selecione o cliente</p>
      </div>

      {/* Seletor de modo */}
      <div className="mode-selector">
        <button
          className={`mode-card ${mode === "posts" ? "active" : ""}`}
          onClick={() => setMode("posts")}
        >
          <span className="mode-card-icon">📢</span>
          <div className="mode-card-text">
            <span className="mode-card-title">Posts</span>
            <span className="mode-card-desc">Publicar e agendar posts no Google</span>
          </div>
          {!loading && clientsWithAlert.length > 0 && (
            <span className="mode-card-badge warn">{clientsWithAlert.length} sem. descoberta{clientsWithAlert.length !== 1 ? "s" : ""}</span>
          )}
        </button>

        <button
          className={`mode-card ${mode === "reviews" ? "active" : ""}`}
          onClick={() => setMode("reviews")}
        >
          <span className="mode-card-icon">⭐</span>
          <div className="mode-card-text">
            <span className="mode-card-title">Avaliações</span>
            <span className="mode-card-desc">Responder avaliações do Google</span>
          </div>
          {!loading && totalPending > 0 && (
            <span className="mode-card-badge pending">{totalPending} pendente{totalPending !== 1 ? "s" : ""}</span>
          )}
        </button>
      </div>

      {/* Barra de auto-resposta — só no modo avaliações com pendentes */}
      {mode === "reviews" && !loading && totalPending > 0 && (
        <div className="auto-reply-bar">
          <div className="arb-info">
            <span className="arb-icon">⚡</span>
            <div>
              <div className="arb-title">
                {totalPending} avaliação{totalPending !== 1 ? "ões" : ""} aguardando resposta
              </div>
              <div className="arb-desc">Responda todas automaticamente com um clique</div>
            </div>
          </div>
          <button
            className="btn-auto-reply"
            onClick={handleAutoReplyAll}
            disabled={autoReplying}
          >
            {autoReplying
              ? <><span className="spinner sm" style={{ display: "inline-block" }} />Respondendo…</>
              : "⚡ Responder tudo"}
          </button>
        </div>
      )}

      <div className="section-label" style={{ marginBottom: "14px" }}>
        {mode === "posts" ? "Selecione o cliente para gerenciar posts" : "Selecione o cliente para responder avaliações"}
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Carregando clientes…</p>
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏢</div>
          <h3>Nenhum cliente encontrado</h3>
          <p>Verifique se o backend está rodando na porta 3000.</p>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <>
          {grupoSaude.length > 0 && (
            <section className="client-group">
              <div className="client-group-header">
                <span className="client-group-icon">🏥</span>
                <span className="client-group-title">Área da Saúde</span>
                <span className="client-group-count">{grupoSaude.length}</span>
              </div>
              <div className="clients-row">
                {grupoSaude.map((acc) => (
                  <ClientCard
                    key={acc.clientId}
                    acc={acc}
                    mode={mode}
                    coverage={getCoverage(acc.clientId)}
                    onClick={() => openClient(acc.clientId)}
                  />
                ))}
              </div>
            </section>
          )}

          {grupoOutros.length > 0 && (
            <section className="client-group">
              <div className="client-group-header">
                <span className="client-group-icon">🏢</span>
                <span className="client-group-title">Outros</span>
                <span className="client-group-count">{grupoOutros.length}</span>
              </div>
              <div className="clients-row">
                {grupoOutros.map((acc) => (
                  <ClientCard
                    key={acc.clientId}
                    acc={acc}
                    mode={mode}
                    coverage={getCoverage(acc.clientId)}
                    onClick={() => openClient(acc.clientId)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {/* Modal de resultado */}
      {autoResult && (
        <div className="modal-overlay" onClick={() => setAutoResult(null)}>
          <div className="modal-box auto-result-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setAutoResult(null)}>×</button>

            <div className="ar-modal-header">
              <div className="ar-modal-icon">
                {autoResult.totalFailed === 0 ? "✅" : autoResult.totalReplied > 0 ? "⚠️" : "❌"}
              </div>
              <div>
                <div className="ar-modal-title">Auto-resposta concluída</div>
                <div className="ar-modal-sub">
                  <strong style={{ color: "var(--green)" }}>{autoResult.totalReplied} respondida{autoResult.totalReplied !== 1 ? "s" : ""}</strong>
                  {autoResult.totalFailed > 0 && (
                    <> · <strong style={{ color: "var(--red)" }}>{autoResult.totalFailed} falha{autoResult.totalFailed !== 1 ? "s" : ""}</strong></>
                  )}
                </div>
              </div>
            </div>

            <div className="ar-results-list">
              {autoResult.results.map((r) => (
                <div key={r.clientId} className={`ar-result-row ${r.status !== "ok" ? "muted" : ""}`}>
                  <span className="ar-row-name">{r.clientName}</span>
                  <span className="ar-row-stats">
                    {r.status === "no_auth"    && <span className="ar-badge warn">Sem auth</span>}
                    {r.status === "fetch_error" && <span className="ar-badge warn">Erro API</span>}
                    {r.status === "error"       && <span className="ar-badge fail">Erro</span>}
                    {r.status === "ok" && r.total === 0 && <span className="ar-badge ok">Em dia ✓</span>}
                    {r.status === "ok" && (r.total ?? 0) > 0 && (
                      <>
                        {(r.replied ?? 0) > 0 && <span className="ar-badge ok">{r.replied} ok</span>}
                        {(r.failed  ?? 0) > 0 && <span className="ar-badge fail">{r.failed} falha</span>}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "20px" }} onClick={() => setAutoResult(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ClientCard({
  acc,
  mode,
  coverage,
  onClick,
}: {
  acc: Account;
  mode: Mode;
  coverage: ClientCoverage | undefined;
  onClick: () => void;
}) {
  const hasMissing = coverage && coverage.missingWeeks > 0;

  return (
    <div
      className={`client-card ${mode === "posts" && hasMissing ? "has-missing-posts" : ""}`}
      onClick={onClick}
    >
      <div className="cc-head">
        <span className="cc-name">{acc.accountName}</span>
        <span className={`cc-dot ${acc.active ? "ok" : ""}`} />
      </div>

      {mode === "reviews" && (
        <div className="cc-count">
          {acc.pending > 0 ? (
            <span className="stat-pill pending" style={{ fontSize: "13px" }}>
              {acc.pending} pendente{acc.pending !== 1 ? "s" : ""}
            </span>
          ) : (
            <span style={{ fontSize: "13px", color: "var(--muted)" }}>Em dia ✓</span>
          )}
        </div>
      )}

      {mode === "posts" && coverage && (
        <div className="week-coverage">
          <span className="week-coverage-label">
            Semanas de {new Date().toLocaleDateString("pt-BR", { month: "long" })}
          </span>
          <div className="week-dots">
            {coverage.weeks.map((w) => {
              const start = new Date(w.weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
              const end   = new Date(w.weekEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
              return (
                <span
                  key={w.week}
                  className={`week-dot ${w.hasPost ? "ok" : "missing"}`}
                  title={`${start} – ${end}: ${w.hasPost ? "✓ tem post" : "⚠ sem post"}`}
                />
              );
            })}
          </div>
          {hasMissing && (
            <span className="week-missing-label">
              ⚠️ {coverage.missingWeeks} sem. sem post
            </span>
          )}
        </div>
      )}

      <div className="cc-pending">
        {mode === "posts" ? "Gerenciar posts →" : "Ver avaliações →"}
      </div>
    </div>
  );
}
