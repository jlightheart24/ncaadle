import json
import random
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, render_template, request
import webcolors

from .team_handling.aliases import ALIASES
from .team_handling.championships import CHAMPIONSHIPS
from .team_handling.conferencechampionships import CONFERENCE_CHAMPIONSHIPS
from .team_handling.heismans import HEISMANS
from .team_handling.colors import COLORS
from .team_handling.mascots import MASCOTS

DEFAULT_TEAMS = [
    {
        "school": "Alabama",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "Georgia",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "Ohio State",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "Michigan",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "Texas",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "Florida State",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
    {
        "school": "USC",
        "conference": None,
        "color": None,
        "alternateColor": None,
        "mascot": None,
        "logo": None,
        "championships": 0,
        "conferenceChampionships": 0,
    },
]

DATA_PATH = Path(__file__).resolve().parent.parent / "teams.json"
STATE_PATH = Path(__file__).resolve().parent.parent / "rotation_state.json"

def load_team_records() -> list[dict]:
    """Load team records from teams.json, falling back to defaults on error."""

    def abbreviate_conference(name: str | None) -> str | None:
        if not name:
            return None
        abbreviations = {
            "American Athletic": "AAC",
            "Atlantic Coast Conference": "ACC",
            "ACC": "ACC",
            "Big 12": "Big 12",
            "Big Ten": "Big Ten",
            "Conference USA": "C-USA",
            "FBS Independents": "Ind",
            "Mid-American": "MAC",
            "Mountain West": "MW",
            "Pac-12": "Pac-12",
            "SEC": "SEC",
            "Sun Belt": "Sun Belt",
        }
        return abbreviations.get(name, name)

    def simplify_color_name(name: str | None) -> str | None:
        """Map detailed color names to simpler buckets (e.g., forestgreen -> green)."""
        if not name:
            return None
        lowered = name.lower()
        buckets = [
            ("red", ("red", "maroon", "crimson", "scarlet", "pink", "rose")),
            ("blue", ("blue", "navy", "teal", "cyan", "aqua", "turquoise")),
            ("green", ("green", "olive", "lime", "emerald", "mint")),
            ("yellow", ("yellow", "golden", "amber", "mustard")),
            ("gold", ("gold",)),
            ("orange", ("orange", "tangerine", "coral")),
            ("purple", ("purple", "violet", "magenta", "indigo", "lavender")),
            ("gray", ("gray", "grey", "silver", "slate", "charcoal")),
            ("tan", ("tan", "beige")),
            ("brown", ("brown", "bronze", "chocolate")),
            ("black", ("black", "ebony")),
            ("white", ("white", "ivory", "cream")),
        ]
        for simple, keys in buckets:
            if any(key in lowered for key in keys):
                return "Gray/Silver" if simple == "gray" else simple.title()
        return "Gray/Silver"

    def color_to_name(hex_value: str | None) -> str | None:
        """Convert a hex color to a CSS3 color name, using nearest match if needed."""
        if not hex_value:
            return None
        try:
            name = webcolors.hex_to_name(hex_value)
            rgb = webcolors.hex_to_rgb(hex_value)
        except ValueError:
            try:
                rgb = webcolors.hex_to_rgb(hex_value)
            except ValueError:
                return simplify_color_name(hex_value)
            # find nearest CSS3 color by Euclidean distance
            min_distance = None
            closest = hex_value
            for name, css_hex in webcolors.CSS3_NAMES_TO_HEX.items():
                css_rgb = webcolors.hex_to_rgb(css_hex)
                distance = (
                    (rgb.red - css_rgb.red) ** 2
                    + (rgb.green - css_rgb.green) ** 2
                    + (rgb.blue - css_rgb.blue) ** 2
                )
                if min_distance is None or distance < min_distance:
                    min_distance = distance
                    closest = name
            name = closest
        # If the nearest name is brown, re-bucket using RGB dominance.
        if "brown" in name.lower():
            if rgb.red >= 160 and rgb.green >= 60 and rgb.blue <= 90:
                return "Orange"
            if rgb.red >= rgb.green + 25 and rgb.red >= rgb.blue + 25:
                return "Red"
        return simplify_color_name(name)

    def is_hex_color(value: object) -> bool:
        if not isinstance(value, str):
            return False
        return value.startswith("#") and len(value) == 7

    def normalize_color(value: object) -> tuple[object, str | None]:
        if not value:
            return None, None
        if is_hex_color(value):
            return value, color_to_name(value)
        return value, simplify_color_name(str(value))

    def to_int(value: object, default: int = 0) -> int:
        """Coerce championship counts to an int with a safe default."""
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return DEFAULT_TEAMS
        overrides = {key.lower(): value for key, value in COLORS.items()}
        teams = []
        for item in data:
            if not isinstance(item, dict) or not item.get("school"):
                continue
            school = item.get("school")
            override = overrides.get(school.lower(), {})
            color_raw = override.get("color", item.get("color"))
            alternate_raw = override.get("alternateColor", item.get("alternateColor"))
            color, color_name = normalize_color(color_raw)
            alternate_color, alternate_color_name = normalize_color(alternate_raw)
            teams.append(
                {
                    "school": school,
                    "conference": abbreviate_conference(item.get("conference")),
                    "color": color,
                    "colorName": color_name,
                    "alternateColor": alternate_color,
                    "alternateColorName": alternate_color_name,
                    "mascot": item.get("mascot"),
                    "logo": (item.get("logos") or [None])[0],
                    "championships": to_int(CHAMPIONSHIPS.get(school, 0), 0),
                    "conferenceChampionships": to_int(
                        CONFERENCE_CHAMPIONSHIPS.get(school, 0), 0
                    ),
                    "heismans": to_int(HEISMANS.get(school, 0), 0),
                }
            )
        return teams or DEFAULT_TEAMS
    except Exception:
        return DEFAULT_TEAMS


TEAM_RECORDS = load_team_records()
TEAMS_SET = {team["school"].lower() for team in TEAM_RECORDS}
TEAM_LOOKUP = {team["school"].lower(): team for team in TEAM_RECORDS}

EASTERN_TZ = ZoneInfo("America/New_York")


def _current_reset_key(now: datetime) -> str:
    """Return the reset key (YYYY-MM-DD) for the midnight ET daily rotation."""
    return now.date().isoformat()


def _load_rotation_state() -> dict:
    try:
        with STATE_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"history": [], "current": None, "last_reset": None}


def _save_rotation_state(state: dict) -> None:
    try:
        with STATE_PATH.open("w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2)
    except OSError:
        # If we cannot persist, fall back to in-memory behavior.
        pass


def _pick_new_target(history: list[str]) -> dict:
    recent = set(name for name in history if isinstance(name, str))
    candidates = [team for team in TEAM_RECORDS if team.get("school") not in recent]
    if not candidates:
        candidates = TEAM_RECORDS[:]
    return random.choice(candidates)


def get_daily_target(force_new: bool = False) -> dict:
    now = datetime.now(EASTERN_TZ)
    reset_key = _current_reset_key(now)
    state = _load_rotation_state()
    history = state.get("history") or []
    current = state.get("current")
    last_reset = state.get("last_reset")

    needs_new = force_new or not current or last_reset != reset_key
    if current and current.lower() not in TEAM_LOOKUP:
        needs_new = True

    if needs_new:
        recent_history = history[-30:]
        target = _pick_new_target(recent_history)
        history = recent_history + [target["school"]]
        state = {
            "current": target["school"],
            "history": history[-30:],
            "last_reset": reset_key,
        }
        _save_rotation_state(state)
        return target

    return TEAM_LOOKUP.get(current.lower(), random.choice(TEAM_RECORDS))

def create_app():
    app = Flask(__name__)
    
    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/teams")
    def teams():
        """Return available team names for autocomplete."""
        return jsonify(sorted(team["school"] for team in TEAM_RECORDS))
    
    @app.post("/guess")
    def guess():
        data = request.get_json()
        raw_guess = (data or {}).get("guess", "").strip()
        guess = ALIASES.get(raw_guess.lower(), raw_guess)
        if not guess or guess.lower() not in TEAMS_SET:
            return jsonify({"result": "invalid", "message": "Team not recognized."})
        target = get_daily_target()
        app.config["TARGET_TEAM"] = target
        guess_record = TEAM_LOOKUP[guess.lower()]

        conference_match = bool(
            guess_record.get("conference")
            and target.get("conference")
            and guess_record["conference"].lower() == target["conference"].lower()
        )
        color_match = bool(
            guess_record.get("colorName")
            and target.get("colorName")
            and guess_record["colorName"].lower() == target["colorName"].lower()
        )
        color_cross_match = bool(
            guess_record.get("colorName")
            and target.get("alternateColorName")
            and guess_record["colorName"].lower() == target["alternateColorName"].lower()
        )
        alt_color_match = bool(
            guess_record.get("alternateColorName")
            and target.get("alternateColorName")
            and guess_record["alternateColorName"].lower() == target["alternateColorName"].lower()
        )
        alt_color_cross_match = bool(
            guess_record.get("alternateColorName")
            and target.get("colorName")
            and guess_record["alternateColorName"].lower() == target["colorName"].lower()
        )
        guess_mascot_type = None
        target_mascot_type = None
        if guess_record.get("school"):
            guess_mascot_type = MASCOTS.get(guess_record["school"], {}).get("type")
        if target.get("school"):
            target_mascot_type = MASCOTS.get(target["school"], {}).get("type")
        mascot_match = bool(
            guess_record.get("mascot")
            and target.get("mascot")
            and guess_record["mascot"].lower() == target["mascot"].lower()
        )
        mascot_near = bool(
            not mascot_match
            and guess_mascot_type
            and target_mascot_type
            and guess_mascot_type == target_mascot_type
        )
        guess_conference_championships = int(
            guess_record.get("conferenceChampionships") or 0
        )
        target_conference_championships = int(
            target.get("conferenceChampionships") or 0
        )
        if target_conference_championships == guess_conference_championships:
            conference_championships_comparison = "equal"
        elif target_conference_championships > guess_conference_championships:
            conference_championships_comparison = "more"
        else:
            conference_championships_comparison = "less"
        conference_championships_near = (
            abs(target_conference_championships - guess_conference_championships) == 1
        )
        guess_championships = int(guess_record.get("championships") or 0)
        target_championships = int(target.get("championships") or 0)
        if target_championships == guess_championships:
            championships_comparison = "equal"
        elif target_championships > guess_championships:
            championships_comparison = "more"
        else:
            championships_comparison = "less"
        guess_heismans = int(guess_record.get("heismans") or 0)
        target_heismans = int(target.get("heismans") or 0)
        heismans_near = abs(target_heismans - guess_heismans) == 1
        if target_heismans == guess_heismans:
            heismans_comparison = "equal"
        elif target_heismans > guess_heismans:
            heismans_comparison = "more"
        else:
            heismans_comparison = "less"

        result = "correct" if guess.lower() == target["school"].lower() else "wrong"
        payload = {
            "result": result,
            "conferenceMatch": conference_match,
            "colorMatch": color_match,
            "colorCrossMatch": color_cross_match,
            "alternateColorMatch": alt_color_match,
            "alternateColorCrossMatch": alt_color_cross_match,
            "mascotMatch": mascot_match,
            "mascotNear": mascot_near,
            "championshipsMatch": championships_comparison == "equal",
            "championshipsComparison": championships_comparison,
            "heismansMatch": heismans_comparison == "equal",
            "heismansComparison": heismans_comparison,
            "heismansNear": heismans_near,
            "conferenceChampionshipsMatch": conference_championships_comparison
            == "equal",
            "conferenceChampionshipsComparison": conference_championships_comparison,
            "conferenceChampionshipsNear": conference_championships_near,
            "conference": target.get("conference"),
            "color": target.get("color"),
            "colorName": target.get("colorName"),
            "alternateColor": target.get("alternateColor"),
            "alternateColorName": target.get("alternateColorName"),
            "mascot": target.get("mascot"),
            "logo": target.get("logo"),
            "championships": target_championships,
            "heismans": target_heismans,
            "conferenceChampionships": target_conference_championships,
            "guessedSchool": guess_record.get("school"),
            "guessedConference": guess_record.get("conference"),
            "guessedColor": guess_record.get("color"),
            "guessedColorName": guess_record.get("colorName"),
            "guessedAlternateColor": guess_record.get("alternateColor"),
            "guessedAlternateColorName": guess_record.get("alternateColorName"),
            "guessedMascot": guess_record.get("mascot"),
            "guessedLogo": guess_record.get("logo"),
            "guessedChampionships": guess_championships,
            "guessedHeismans": guess_heismans,
            "guessedConferenceChampionships": guess_conference_championships,
        }
        if result == "correct":
            payload["target"] = target["school"]
        return jsonify(payload)
    
    @app.post("/reset")
    def reset():
        app.config["TARGET_TEAM"] = get_daily_target(force_new=True)
        return jsonify({"status": "reset"})

    return app
