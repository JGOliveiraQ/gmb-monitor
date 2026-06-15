#!/usr/bin/env python3
"""mattermost_gmb_lembretes.py -- Lembretes mensais das tarefas GMB.

Dia 1 do mes: publicacoes no Google Meu Negocio
Dia 2 do mes: responder avaliacoes

Envia lembrete nos 3 dias anteriores + no dia em si, as 07:00 BRT.

Variaveis de ambiente:
  MATTERMOST_URL
  MATTERMOST_BOT_TOKEN
  MATTERMOST_LEMBRETES_CHANNEL_ID
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import requests

MATTERMOST_URL        = os.environ.get("MATTERMOST_URL", "")
MATTERMOST_BOT_TOKEN  = os.environ.get("MATTERMOST_BOT_TOKEN", "")
MATTERMOST_CHANNEL_ID = os.environ.get("MATTERMOST_LEMBRETES_CHANNEL_ID", "")

# Dia do mes de cada tarefa
DIA_PUBLICACOES = 1
DIA_AVALIACOES  = 2


def days_until(target_day: int, today: datetime) -> int:
    """Quantos dias faltam ate o proximo dia target_day do mes."""
    if today.day == target_day:
        return 0
    if today.day < target_day:
        return target_day - today.day
    # Proximo mes
    if today.month == 12:
        prox = today.replace(year=today.year + 1, month=1, day=target_day)
    else:
        prox = today.replace(month=today.month + 1, day=target_day)
    return (prox.date() - today.date()).days


def build_message(today: datetime) -> str | None:
    dias_pub = days_until(DIA_PUBLICACOES, today)
    dias_av  = days_until(DIA_AVALIACOES, today)
    date_str = today.strftime("%d/%m/%Y")

    lines = []

    # --- Publicacoes ---
    if dias_pub == 0:
        lines += [
            "## :mega: Tarefas GMB -- HOJE!",
            f"**Data:** {date_str}",
            "",
            ":pushpin: **PUBLICACOES** -- Hoje e o dia de fazer as publicacoes no Google Meu Negocio!",
            "",
            "> Acesse o sistema GMB e publique para todos os clientes.",
        ]
    elif dias_pub in (1, 2, 3):
        lines += [
            "## :calendar: Lembrete GMB -- Publicacoes",
            f"**Data:** {date_str}",
            "",
            f":clock1: Faltam **{dias_pub} dia{'s' if dias_pub > 1 else ''}** para as publicacoes (dia {DIA_PUBLICACOES:02d}/{today.strftime('%m/%Y')})",
        ]

    # --- Avaliacoes ---
    if dias_av == 0:
        sep = "\n\n---\n\n" if lines else ""
        if not lines:
            lines += [
                "## :star: Tarefas GMB -- HOJE!",
                f"**Data:** {date_str}",
                "",
            ]
        else:
            lines += ["", "---", ""]
        lines += [
            ":star: **AVALIACOES** -- Hoje e o dia de responder as avaliacoes no Google Meu Negocio!",
            "",
            "> Acesse o sistema GMB e responda todas as avaliacoes pendentes.",
        ]
    elif dias_av in (1, 2, 3):
        if not lines:
            lines += [
                "## :calendar: Lembrete GMB -- Avaliacoes",
                f"**Data:** {date_str}",
                "",
            ]
        else:
            lines += [""]
        lines += [
            f":clock2: Faltam **{dias_av} dia{'s' if dias_av > 1 else ''}** para as avaliacoes (dia {DIA_AVALIACOES:02d}/{today.strftime('%m/%Y')})",
        ]

    return "\n".join(lines) if lines else None


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
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    brt_now = datetime.now(timezone.utc) - timedelta(hours=3)
    message = build_message(brt_now)

    if message is None:
        print("Nenhum lembrete para hoje.", file=sys.stderr)
        return

    print(message, file=sys.stderr)

    if args.dry_run:
        print("\n(dry-run: nao enviado)", file=sys.stderr)
        return

    missing = [v for v in ["MATTERMOST_URL", "MATTERMOST_BOT_TOKEN"]
               if not os.environ.get(v)]
    if not os.environ.get("MATTERMOST_LEMBRETES_CHANNEL_ID"):
        missing.append("MATTERMOST_LEMBRETES_CHANNEL_ID")
    if missing:
        print(f"ERRO: variaveis ausentes: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    send_mattermost(message)
    print("Enviado ao Mattermost!", file=sys.stderr)


if __name__ == "__main__":
    main()
