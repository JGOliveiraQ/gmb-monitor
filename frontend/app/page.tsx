"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("posts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [coverage, setCoverage] = useState<ClientCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetch("http://localhost:3000/accounts-summary").then((r) => r.json()),
      fetch("http://localhost:3000/posts-coverage").then((r) => r.json()),
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

  function getCoverage(clientId: string): ClientCoverage | undefined {
    return coverage.find((c) => c.clientId === clientId);
  }

  const clientsWithAlert = accounts.filter((a) => {
    const cov = getCoverage(a.clientId);
    return cov && cov.missingWeeks > 0;
  });

  const totalPending = accounts.reduce((sum, a) => sum + a.pending, 0);

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
        <div className="clients-row">
          {accounts.map((acc) => (
            <ClientCard
              key={acc.clientId}
              acc={acc}
              mode={mode}
              coverage={getCoverage(acc.clientId)}
              onClick={() => openClient(acc.clientId)}
            />
          ))}
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
          <span className="week-coverage-label">Próximas 4 semanas</span>
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
