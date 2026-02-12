import os
import sys
import json
from typing import List, Dict

import requests

API_URL = "https://api.collegefootballdata.com/teams/fbs"
TEAM_RECORDS = "https://api.collegefootballdata.com/records"
DEFAULT_API_KEY = "hE4SifiF4WWC7NiWqXXIOSv9R+OgHGvIIu818fb7iufcUiFwPo+WvJ1ZflQTNPS9"


def fetch_teams() -> List[Dict]:
    """Call the College Football Data API and return FBS teams."""
    headers = {}
    api_key = os.getenv("CFBD_API_KEY", DEFAULT_API_KEY)
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = requests.get(API_URL, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()

def fetch_team_records(team: str) -> List[Dict]:
    """Call the API to return team records."""
    headers = {}
    api_key = os.getenv("CFBD_API_KEY", DEFAULT_API_KEY)
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = requests.get(TEAM_RECORDS, headers=headers, params={"team": team}, timeout=15)
    response.raise_for_status()
    return response.json()

def main() -> None:
    try:
        teams = fetch_teams()
    except requests.HTTPError as exc:
        message = exc.response.text if exc.response is not None else str(exc)
        print(f"Request failed ({exc.response.status_code if exc.response else 'unknown'}): {message}")
        sys.exit(1)
    except Exception as exc:  # pragma: no cover - defensive catch for CLI
        print(f"Unexpected error: {exc}")
        sys.exit(1)

    output_path = os.getenv("TEAMS_JSON", "teams.json")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(teams, f, indent=2)
        print(f"\nSaved full team list to {output_path}")
    except OSError as exc:
        print(f"Failed to write {output_path}: {exc}")
        sys.exit(1)

    try:
        with open(output_path, "r", encoding="utf-8") as f:
            teams_data = json.load(f)
    except OSError as exc:
        print(f"Failed to read {output_path}: {exc}")
        sys.exit(1)

    records = {}
    for team in teams_data:
        school = team.get("school")
        if not school:
            continue
        try:
            records[school] = fetch_team_records(school)
        except requests.HTTPError as exc:
            message = exc.response.text if exc.response is not None else str(exc)
            print(f"Request failed for {school} ({exc.response.status_code if exc.response else 'unknown'}): {message}")
            sys.exit(1)

    records_path = os.getenv("RECORDS_JSON", "records.json")
    try:
        with open(records_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        print(f"Saved team records to {records_path}")
    except OSError as exc:
        print(f"Failed to write {records_path}: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
