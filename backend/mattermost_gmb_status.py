#!/usr/bin/env python3
"""mattermost_gmb_status.py -- Relatorio diario do sistema GMB (status + lembretes).

Verifica:
  1. Se o backend esta rodando
  2. Total de avaliacoes pendentes
  3. Cobertura de posts nas ultimas 2 + proximas 2 semanas
  4. Lembretes de tarefas mensais (publicacoes dia 1 / avaliacoes dia 2)

Variaveis de ambiente:
  GMB_BACKEND_URL
  MATTERMOST_URL
  MATTERMOST_BOT_TOKEN
  MATTERMOST_MONITOR_CHANNEL_ID
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

GMB_BACKEND_URL       = os.environ.get("GMB_BACKEND_URL", "http://localhost:3200")
MATTERMOST_URL        = os.environ.get("MATTERMOST_URL", "")
MATTERMOST_BOT_TOKEN  = os.environ.get("MATTERMOST_BOT_TOKEN", "")
MATTERMOST_CHANNEL_ID = os.environ.get("MATTERMOST_MONITOR_CHANNEL_ID", "")

DIA_PUBLICACOES = 1
DIA_AVALIACOES  = 2


# ── Helpers ──────────────────────────────────────────────────────────────────

def days_until(target_day: int, today: datetime) -> int:
    if today.day == target_day:
        return 0
    if today.day < target_day:
        return target_day - today.day
    if today.month == 12:
        prox = today.replace(year=today.year + 1, month=1, day=target_day)
    else:
        prox = today.replace(month=today.month + 1, day=target_day)
    return (prox.date() - today.date()).days


# ── Checks ───────────────────────────────────────────────────────────────────

def check_backend() -> tuple[bool, int | None]:
    try:
        r = requests.get(f"{GMB_BACKEND_URL}/clients", timeout=10)
        return r.status_code < 500, r.status_code
    except Exception as e:
        print(f"Backend check erro: {e}", file=sys.stderr)
        return False, None


def get_pending_reviews_total() -> int | None:
    try:
        r = requests.get(f"{GMB_BACKEND_URL}/accounts-summary", timeout=20)
        if not r.ok:
            return None
        data = r.json()
        return sum(a.get("pending", 0) for a in data.get("accounts", []))
    except Exception as e:
        print(f"Reviews check erro: {e}", file=sys.stderr)
        return None


def get_posts_month_ok(today: datetime) -> bool | None:
    """Verifica se todas as semanas do mes atual tem posts para todos os clientes.
    Retorna True (tudo ok), False (problema), ou None (erro)."""
    try:
        r = requests.get(
            f"{GMB_BACKEND_URL}/posts-coverage-full?past=5&future=2",
            timeout=30,
        )
        if not r.ok:
            return None
        data = r.json()
        coverage = data.get("coverage", [])
        if not coverage:
            return None

        from calendar import monthrange
        num_clients    = len(coverage)
        num_weeks      = len(coverage[0]["weeks"])
        first_of_month = today.replace(day=1).date()
        last_day       = monthrange(today.year, today.month)[1]
        last_of_month  = today.replace(day=last_day).date()

        for i in range(num_weeks):
            w     = coverage[0]["weeks"][i]
            start = datetime.fromisoformat(w["weekStart"][:10]).date()
            end   = datetime.fromisoformat(w["weekEnd"][:10]).date()
            # Semana que se sobrepe ao mes atual
            if end < first_of_month or start > last_of_month:
                continue
            has_count = sum(1 for c in coverage if c["weeks"][i]["hasPost"])
            if has_count < num_clients:
                return False

        return True
    except Exception as e:
        print(f"Posts coverage erro: {e}", file=sys.stderr)
        return None


# ── Message builder ───────────────────────────────────────────────────────────

def build_message(
    backend_up: bool,
    backend_code: int | None,
    reviews_total: int | None,
    posts_ok: bool | None,
    today: datetime,
) -> str:
    date_str = today.strftime("%d/%m/%Y")
    lines = [
        "## :office: Status GMB",
        f"**Data:** {date_str}",
        "",
    ]

    # 1. Backend
    if backend_up:
        lines.append(":white_check_mark: **Backend GMB:** Online")
    else:
        suffix = f" (HTTP {backend_code})" if backend_code else " (sem resposta)"
        lines.append(f":red_circle: **Backend GMB:** OFFLINE{suffix}")

    lines.append("")

    # 2. Avaliacoes pendentes (so total)
    if reviews_total is None:
        lines.append(":warning: **Avaliacoes pendentes:** Nao foi possivel verificar")
    elif reviews_total == 0:
        lines.append(":white_check_mark: **Avaliacoes pendentes:** Nenhuma -- Tudo respondido!")
    else:
        lines.append(f":star: **Avaliacoes pendentes:** {reviews_total}")

    lines.append("")

    # 3. Cobertura de posts do mes
    if posts_ok is None:
        lines.append(":warning: **Publicacoes:** Nao foi possivel verificar")
    elif posts_ok:
        lines.append(":white_check_mark: **Publicacoes:** Tudo correto nesse mes, as publicacoes estao agendadas corretamente")
    else:
        lines.append(":red_circle: **Publicacoes:** Foi encontrado erros ou falta de publicacoes nesse mes, verifique!")

    lines.append("")
    lines.append("---")
    lines.append("")

    # 4. Lembretes mensais
    dias_pub = days_until(DIA_PUBLICACOES, today)
    dias_av  = days_until(DIA_AVALIACOES, today)
    lembrete_lines = []

    if dias_pub == 0:
        lembrete_lines.append(":mega: **HOJE: Publicacoes GMB** -- Faca as publicacoes para todos os clientes!")
    elif dias_pub in (1, 2, 3):
        lembrete_lines.append(f":calendar: Publicacoes em **{dias_pub} dia{'s' if dias_pub > 1 else ''}** (dia 01/{today.strftime('%m/%Y')})")

    if dias_av == 0:
        lembrete_lines.append(":star: **HOJE: Avaliacoes GMB** -- Responda todas as avaliacoes pendentes!")
    elif dias_av in (1, 2, 3):
        lembrete_lines.append(f":calendar: Avaliacoes em **{dias_av} dia{'s' if dias_av > 1 else ''}** (dia 02/{today.strftime('%m/%Y')})")

    if lembrete_lines:
        lines.extend(lembrete_lines)
    else:
        lines.append(f":white_check_mark: Sem lembretes urgentes (pub em {dias_pub}d / av em {dias_av}d)")

    return "\n".join(lines)


# ── Send + main ───────────────────────────────────────────────────────────────

def send_mattermost(message: str) -> None:
    resp = requests.post(
        f"{MATTERMOST_URL}/api/v4/posts",
        json={"channel_id": MATTERMOST_CHANNEL_ID, "message": message},
        headers={
            "Authorization": f"Bearer {MATTERMOST_BOT_TOKEN}",
            "Content-Type":  "application/json",
        },
        timeout=15,
    )
    resp.raise_for_status()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    brt_now = datetime.now(timezone.utc) - timedelta(hours=3)

    print("Verificando backend...", file=sys.stderr)
    backend_up, backend_code = check_backend()
    print(f"  Backend: {'OK' if backend_up else 'OFFLINE'} ({backend_code})", file=sys.stderr)

    reviews_total = None
    posts_ok      = None

    if backend_up:
        print("Verificando avaliacoes...", file=sys.stderr)
        reviews_total = get_pending_reviews_total()
        print(f"  Pendentes: {reviews_total}", file=sys.stderr)

        print("Verificando publicacoes do mes...", file=sys.stderr)
        posts_ok = get_posts_month_ok(brt_now)
        print(f"  Publicacoes ok: {posts_ok}", file=sys.stderr)

    message = build_message(backend_up, backend_code, reviews_total, posts_ok, brt_now)
    print("\n" + message + "\n", file=sys.stderr)

    if args.dry_run:
        print("(dry-run: nao enviado)", file=sys.stderr)
        return

    missing = [v for v in ["MATTERMOST_URL", "MATTERMOST_BOT_TOKEN", "MATTERMOST_MONITOR_CHANNEL_ID"]
               if not os.environ.get(v)]
    if missing:
        print(f"ERRO: variaveis ausentes: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    send_mattermost(message)
    print("Enviado ao Mattermost!", file=sys.stderr)


if __name__ == "__main__":
    main()
