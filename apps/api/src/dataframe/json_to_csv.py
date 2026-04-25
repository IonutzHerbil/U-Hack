from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
API_DIR = BASE_DIR.parents[1]
DATABASE_DIR = API_DIR / "database"

path_ucluj = DATABASE_DIR / "ucluj_analysis.json"
path_all_players = DATABASE_DIR / "all_players_except_ucluj.json"
output_ucluj_csv = BASE_DIR / "ucluj_detalii_jucatori.csv"
output_all_players_csv = BASE_DIR / "baza_date_restul_jucatorilor.csv"


def procesare_date() -> None:
    if not path_ucluj.exists():
        print(f"Eroare: Nu am gasit fisierul la {path_ucluj}")
    else:
        with path_ucluj.open("r", encoding="utf-8") as handle:
            ucluj_data = json.load(handle)

        if "squad" in ucluj_data:
            df_squad = pd.json_normalize(ucluj_data["squad"])
            df_squad.to_csv(output_ucluj_csv, index=False, encoding="utf-8-sig")
            print(f"Creat: {output_ucluj_csv.name} (statistici pentru {len(df_squad)} jucatori)")

    if not path_all_players.exists():
        print(f"Eroare: Nu am gasit fisierul la {path_all_players}")
    else:
        with path_all_players.open("r", encoding="utf-8") as handle:
            all_players_data = json.load(handle)

        if "players" in all_players_data:
            df_others = pd.json_normalize(all_players_data["players"])
            df_others.to_csv(output_all_players_csv, index=False, encoding="utf-8-sig")
            print(f"Creat: {output_all_players_csv.name} ({len(df_others)} jucatori din restul ligii)")

    print("\n=== Conversie finalizata cu succes! ===")


if __name__ == "__main__":
    procesare_date()
