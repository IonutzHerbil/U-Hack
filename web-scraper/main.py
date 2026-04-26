import os
from dotenv import load_dotenv
from ddgs import DDGS
from newspaper import Article
from collections import defaultdict
import google.generativeai as genai
import json
import time
import re

load_dotenv()


# ── Gemini setup ──────────────────────────────────────────────────────────────
api_key2 =  os.getenv("GEMINI_API_KEY")
print(f"[scraper] Gemini API key loaded: {'Yes' if api_key2 else 'No'}")
genai.configure(api_key=api_key2)
model = genai.GenerativeModel("gemini-2.5-flash-lite")

# ── Config ────────────────────────────────────────────────────────────────────

# Pre-filter keywords — article must contain at least one before we call the LLM
KEYWORDS = [
    "suspension", "banned", "ban", "fight", "argument", "controversy",
    "arrest", "injury", "injured", "disciplinary", "fine",
    "red card", "sent off", "clash", "scandal", "conflict"
]

# Domains to skip entirely — stats sites, official bodies, encyclopaedias
BAD_SOURCES = [
    "uefa.com", "fifa.com", "thefa.com", "wikipedia.org",
    "transfermarkt", "sofascore", "whoscored", "fbref",
    "soccerway", "fotmob", "flashscore", "livescore",
    "soccerstats", "besoccer", "worldfootball", "statmuse",
    "capology", "spotrac", "salarysport",
]

# URL path fragments that indicate a stats/profile page, not an article
BAD_PATHS = [
    "/stats/", "/statistics/", "/player/", "/profile/",
    "/squad/", "/transfers/", "/market-value/",
    "/fixtures/", "/results/", "/standings/", "/table/",
]

# LLM issue type → character traits with weights
TRAIT_MAP = {
    "discipline": [("Indisciplinary", 1.0), ("Aggressive",    0.65)],
    "injury":     [("Injury-Prone",   1.0)],
    "conflict":   [("Temperamental",  1.0), ("Controversial", 0.45)],
    "scandal":    [("Controversial",  1.0), ("Temperamental", 0.3)],
}

TRAIT_DESCRIPTIONS = {
    "Aggressive":     "Physical aggression or violent conduct on the pitch.",
    "Temperamental":  "Emotional instability, arguments, or loss of composure.",
    "Indisciplinary": "Bans, fines, red cards, or repeated rule violations.",
    "Controversial":  "Off-field incidents or public image risks.",
    "Injury-Prone":   "Frequent or serious injuries affecting availability.",
}

# Score ceiling for normalisation.
# A trait needs signals from ~4 articles at full severity to reach 100/100.
_MAX_SCORE = 4.0


# ── Search ────────────────────────────────────────────────────────────────────

def safe_search(query, max_results=8):
    """DuckDuckGo text search with up to 3 retries."""
    for attempt in range(3):
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=max_results))
        except Exception as e:
            print(f"[SEARCH] Attempt {attempt + 1} failed: {e}")
            time.sleep(2)
    return []


def get_article_links(player_name):
    """Return news article URLs for a player — no stats pages."""
    query = f'"{player_name}" football news'
    raw = safe_search(query)

    links = []
    for r in raw:
        url   = r.get("href", "")
        title = r.get("title", "").lower()
        url_lower = url.lower()

        # skip stats/data domains
        if any(bad in url_lower for bad in BAD_SOURCES):
            continue

        # skip profile/stats URL paths
        if any(seg in url_lower for seg in BAD_PATHS):
            continue

        # result must actually mention the player in the headline
        if player_name.lower() not in title:
            continue

        links.append(url)

    return links


# ── Scrape ────────────────────────────────────────────────────────────────────

def extract_article(url):
    """Download and parse an article. Returns None on failure or empty body."""
    try:
        article = Article(url)
        article.download()
        article.parse()

        text = article.text.strip()
        if not text:
            print(f"[SCRAPE] Empty body: {url}")
            return None

        return {
            "title": article.title,
            "text":  text,
            "url":   url,
        }
    except Exception as e:
        print(f"[SCRAPE] Error on {url}: {e}")
        return None


# ── Pre-filter ────────────────────────────────────────────────────────────────

def has_negative_keywords(text):
    """Quick check before calling the LLM — avoids wasting API quota."""
    lower = text.lower()
    return any(kw in lower for kw in KEYWORDS)


# ── LLM analysis ─────────────────────────────────────────────────────────────

def build_prompt(player_name, article_text):
    return (
        f'You are a football analyst reviewing a news article about {player_name}.\n'
        f'Identify ONLY real negative events directly involving {player_name}.\n'
        f'\n'
        f'Categories (use exactly these strings for "type"):\n'
        f'  discipline  — red cards, bans, suspensions, fines\n'
        f'  injury      — injuries, fitness issues, time out\n'
        f'  conflict    — arguments, clashes with teammates, coaches, officials\n'
        f'  scandal     — off-field controversies, arrests, public incidents\n'
        f'\n'
        f'Return a JSON object — no markdown, no extra text, just the JSON:\n'
        f'{{\n'
        f'  "relevant": true,\n'
        f'  "issues": [\n'
        f'    {{"type": "<category>", "summary": "<one sentence>", "severity": <0.1-1.0>}}\n'
        f'  ]\n'
        f'}}\n'
        f'\n'
        f'If there are no negative events, return:\n'
        f'{{"relevant": false, "issues": []}}\n'
        f'\n'
        f'Article (first 3000 chars):\n'
        f'{article_text[:3000]}'
    )


def extract_json(text):
    """Robustly pull a JSON object out of an LLM response string."""
    text = text.strip()

    # 1. Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip ```json ... ``` or ``` ... ``` fences
    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Find the first {...} block in the text
    brace = re.search(r"\{[\s\S]+\}", text)
    if brace:
        try:
            return json.loads(brace.group(0))
        except json.JSONDecodeError:
            pass

    return None


def analyze_with_llm(player_name, article_text):
    """Call Gemini and return parsed issue list, or None on failure."""
    prompt = build_prompt(player_name, article_text)
    try:
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0}
        )
        parsed = extract_json(response.text)

        if not parsed or not parsed.get("relevant"):
            return None

        # Validate and normalise each issue
        clean_issues = []
        for issue in parsed.get("issues", []):
            issue_type = str(issue.get("type", "")).strip().lower()
            summary    = str(issue.get("summary", "")).strip()
            try:
                severity = float(issue.get("severity", 0.5))
            except (TypeError, ValueError):
                severity = 0.5
            severity = max(0.1, min(1.0, severity))

            if issue_type in TRAIT_MAP and summary:
                clean_issues.append({
                    "type":     issue_type,
                    "summary":  summary,
                    "severity": severity,
                })

        return clean_issues if clean_issues else None

    except Exception as e:
        print(f"[LLM] Error: {e}")
        return None


# ── Character profile ─────────────────────────────────────────────────────────

def build_character_profile(reports):
    """
    Aggregate issue severity × trait weight across all reports into a
    normalised character profile.

    Each article's contribution per trait is capped at 1.0 so one
    sensationalist piece can't dominate the score.
    """
    trait_totals = defaultdict(float)

    for report in reports:
        article_contrib = defaultdict(float)

        for issue in report["issues"]:
            issue_type = issue["type"]
            severity   = issue["severity"]

            for trait, weight in TRAIT_MAP.get(issue_type, []):
                article_contrib[trait] += weight * severity

        for trait, val in article_contrib.items():
            trait_totals[trait] += min(val, 1.0)

    result = []
    for trait, raw in trait_totals.items():
        score = round(min(raw / _MAX_SCORE * 100, 100), 1)
        level = "High" if score >= 75 else ("Medium" if score >= 45 else "Low")
        color = "danger" if level == "High" else ("warning" if level == "Medium" else "secondary")

        result.append({
            "trait":       trait,
            "score":       score,
            "level":       level,
            "color":       color,
            "description": TRAIT_DESCRIPTIONS.get(trait, ""),
        })

    result.sort(key=lambda x: -x["score"])
    return result


# ── Pipeline ──────────────────────────────────────────────────────────────────

def build_player_profile(player_name):
    """
    Full pipeline:
      1. Search DuckDuckGo for news articles
      2. Scrape and pre-filter each article
      3. Send qualifying articles to Gemini for structured issue extraction
      4. Aggregate issues into a character profile
    """
    # 1. Search
    try:
        links = get_article_links(player_name)
        print(f"[PIPELINE] {len(links)} article links for '{player_name}'")
    except Exception as e:
        print(f"[PIPELINE] Search failed: {e}")
        return {
            "player":            player_name,
            "reports":           [],
            "character_profile": [],
        }

    reports = []

    for url in links:
        # 2. Scrape
        article = extract_article(url)
        if not article:
            continue

        # Must mention the player in the body
        if player_name.lower() not in article["text"].lower():
            print(f"[PIPELINE] Skipping (player not in body): {url}")
            continue

        # Pre-filter — don't waste LLM quota on clean articles
        if not has_negative_keywords(article["text"]):
            print(f"[PIPELINE] Skipping (no negative keywords): {url}")
            continue

        # 3. LLM analysis
        issues = analyze_with_llm(player_name, article["text"])
        if not issues:
            continue

        print(f"[PIPELINE] Issues found in '{article['title']}': {issues}")
        reports.append({
            "title":  article["title"],
            "url":    article["url"],
            "issues": issues,
        })

    # 4. Character profile
    character_profile = build_character_profile(reports)

    return {
        "player":            player_name,
        "reports":           reports if reports else ["No major issues detected"],
        "character_profile": character_profile,
    }


# ── CLI entry point ───────────────────────────────────────────────────────────

def main():
    player_name = input("Enter player name: ").strip()
    profile = build_player_profile(player_name)

    print(f"\n=== {profile['player']} ===")

    print("\nReports:")
    for r in profile["reports"]:
        if isinstance(r, dict):
            print(f"  [{r['title']}]")
            for issue in r["issues"]:
                print(f"    • {issue['type']} (severity {issue['severity']}): {issue['summary']}")
        else:
            print(f"  {r}")

    print("\nCharacter Profile:")
    for t in profile["character_profile"]:
        bar = "█" * int(t["score"] // 5)
        print(f"  {t['trait']:<16} {bar:<20} {t['score']:>5.1f}/100  [{t['level']}]")


if __name__ == "__main__":
    main()
