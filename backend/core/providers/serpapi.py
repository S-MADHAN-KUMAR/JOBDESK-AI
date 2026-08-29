"""SerpApi Google Jobs provider connector."""

import hashlib
import logging
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests

from .base import JobSourceProvider, ProviderError, extract_api_key, strip_html

logger = logging.getLogger("core")

DEFAULT_BASE_URL = "https://serpapi.com/search.json"
# Google Jobs via SerpApi always returns up to 10 listings per API call.
RESULTS_PER_PAGE = 10
# Board filtering happens client-side (Google exposes no board filter), so a
# strict filter can burn many searches. Each page costs one SerpApi credit.
DEFAULT_MAX_SEARCH_PAGES = 5
MAX_API_PAGES_HARD_CAP = 20

# Boards Google Jobs actually reports in `via` for common queries.
SERPAPI_JOB_PLATFORMS = [
    "LinkedIn",
    "Indeed",
    "Naukri.com",
    "Glassdoor",
    "Shine",
    "foundit",
    "TimesJobs",
    "Monster",
    "SimplyHired",
    "ZipRecruiter",
    "Dice",
    "CareerBuilder",
    "Jooble",
    "Adzuna",
    "BeBee",
    "Built In",
    "Talent.com",
    "Hirist",
    "Instahyre",
    "Cutshort",
    "Wellfound",
    "Recruit.net",
    "Jobrapido",
    "WhatJobs",
    "Bayt.com",
    "Reed.co.uk",
    "Totaljobs",
]

DEFAULT_SERPAPI_PLATFORMS = [
    "LinkedIn",
    "Naukri.com",
    "Glassdoor",
    "Shine",
    "foundit",
]

# Google Jobs is localized; `country` in Source Management maps to `gl`.
_COUNTRY_TO_GL = {
    "india": "in",
    "united states": "us",
    "usa": "us",
    "united kingdom": "uk",
    "uk": "uk",
    "canada": "ca",
    "australia": "au",
    "germany": "de",
    "france": "fr",
    "singapore": "sg",
    "united arab emirates": "ae",
    "uae": "ae",
}


def _slug(value: Any) -> str:
    """Lowercase alphanumeric key with trailing domain suffixes removed."""
    text = re.sub(r"[^a-z0-9]+", "", str(value).lower())
    for suffix in ("couk", "com", "net", "org"):
        if len(text) > len(suffix) + 2 and text.endswith(suffix):
            return text[: -len(suffix)]
    return text


class SerpApiProvider(JobSourceProvider):
    """SerpApi Google Jobs connector.

    Source Management ``max_pages`` / ``max_results`` is a **job count** cap.
    Optional ``platforms`` filters results by Google Jobs ``via`` / apply board.
    """

    def _api_key(self) -> str:
        key = extract_api_key(self.config.get_auth_config())
        if not key:
            raise ProviderError("SerpApi API key is not configured.")
        return key

    def _get(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            res = requests.get(
                self.config.base_url or DEFAULT_BASE_URL,
                params={**params, "api_key": self._api_key()},
                timeout=60,
            )
            res.raise_for_status()
        except requests.RequestException as exc:
            raise ProviderError(f"SerpApi request failed: {exc}") from exc

        data = res.json()
        if isinstance(data, dict) and data.get("error"):
            raise ProviderError(f"SerpApi error: {data['error']}")
        return data

    @staticmethod
    def _resolve_max_results(filters: Dict[str, Any], defaults: Dict[str, Any]) -> int:
        """Job count from filters or Source Management (never page count)."""
        for source in (filters, defaults):
            for key in ("max_results", "max_pages"):
                raw = source.get(key)
                if raw in (None, "", 0, "0"):
                    continue
                try:
                    return max(1, int(raw))
                except (TypeError, ValueError):
                    continue
        return 10

    def _resolve_platforms(self, filters: Dict[str, Any]) -> List[str]:
        raw = filters.get("platforms")
        if raw is None:
            raw = self.config.default_params.get("platforms")
        if not isinstance(raw, list):
            return []
        cleaned: List[str] = []
        for item in raw:
            name = str(item).strip()
            if name and name not in cleaned:
                cleaned.append(name)
        return cleaned

    @staticmethod
    def _platform_tokens(platforms: List[str]) -> List[str]:
        tokens: List[str] = []
        for platform in platforms:
            token = _slug(platform)
            if token and token not in tokens:
                tokens.append(token)
        return tokens

    @staticmethod
    def _job_board(job: Dict[str, Any]) -> str:
        """The board a listing was sourced from, e.g. "via LinkedIn" -> LinkedIn."""
        via = job.get("via")
        if not isinstance(via, str):
            return ""
        return re.sub(r"^\s*via\s+", "", via, flags=re.IGNORECASE).strip()

    def _matches_platforms(self, job: Dict[str, Any], tokens: List[str]) -> bool:
        """Match on the sourcing board only.

        ``apply_options`` is deliberately ignored: nearly every listing offers a
        LinkedIn or Glassdoor apply link, so matching it lets company career
        sites through and makes the filter meaningless.
        """
        if not tokens:
            return True
        board = self._job_board(job)
        if not board:
            return False
        board_slug = _slug(board)
        board_words = {_slug(word) for word in re.split(r"[^A-Za-z0-9]+", board) if word}
        return any(
            token == board_slug or board_slug.startswith(token) or token in board_words
            for token in tokens
        )

    def _page_budget(self, max_results: int, filtering: bool, defaults: Dict[str, Any]) -> int:
        pages_for_quota = max(1, math.ceil(max_results / RESULTS_PER_PAGE))
        if not filtering:
            return pages_for_quota
        configured = defaults.get("max_search_pages")
        try:
            budget = int(configured)
        except (TypeError, ValueError):
            budget = DEFAULT_MAX_SEARCH_PAGES
        return min(MAX_API_PAGES_HARD_CAP, max(pages_for_quota, budget))

    def search_jobs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        defaults = self.config.default_params or {}
        keyword = filters.get("keyword") or defaults.get("keyword", "")
        location = filters.get("location") or defaults.get("location", "")
        country = filters.get("country") or defaults.get("country", "")
        max_results = self._resolve_max_results(filters, defaults)
        posted_within = filters.get("posted_within") or defaults.get("posted_within", "")
        platforms = self._resolve_platforms(filters)
        platform_tokens = self._platform_tokens(platforms)

        if not keyword:
            raise ProviderError("A search keyword is required.")

        # Google exposes no board filter, so selection is applied client-side and
        # may skip most of a page; allow extra pages but never exceed max_results.
        max_api_pages = self._page_budget(max_results, bool(platform_tokens), defaults)

        jobs: List[Dict[str, Any]] = []
        boards_seen: Dict[str, int] = {}
        next_page_token: Optional[str] = None
        pages_fetched = 0
        cutoff = self._posted_within_cutoff(posted_within) if posted_within else None

        for _ in range(max_api_pages):
            params: Dict[str, Any] = {
                "engine": "google_jobs",
                "q": keyword,
                "hl": "en",
            }
            if location:
                params["location"] = location
            gl = _COUNTRY_TO_GL.get(str(country).strip().lower())
            if gl:
                params["gl"] = gl
            if next_page_token:
                params["next_page_token"] = next_page_token

            data = self._get(params)
            pages_fetched += 1
            results = data.get("jobs_results") or []
            if not results:
                break

            for job in results:
                if not isinstance(job, dict):
                    continue
                board = self._job_board(job) or "(unknown)"
                boards_seen[board] = boards_seen.get(board, 0) + 1
                if not self._matches_platforms(job, platform_tokens):
                    continue
                if cutoff and not self._is_within_date_range(job, cutoff):
                    continue
                jobs.append(job)
                if len(jobs) >= max_results:
                    break

            if len(jobs) >= max_results:
                break

            next_page_token = (
                data.get("serpapi_pagination", {}).get("next_page_token")
                or data.get("pagination", {}).get("next_page_token")
            )
            if not next_page_token:
                break

        # Board names vary by query and region, so log what Google actually
        # returned; a short result set usually means the selection was rare.
        logger.info(
            "SerpApi %s: %s/%s jobs from %s page(s); selected=%s; boards seen=%s",
            keyword,
            len(jobs),
            max_results,
            pages_fetched,
            platforms or "all",
            sorted(boards_seen.items(), key=lambda kv: -kv[1]),
        )
        return jobs[:max_results]

    @staticmethod
    def _posted_within_cutoff(posted_within: str) -> datetime | None:
        now = datetime.now(timezone.utc)
        deltas = {
            '24h': timedelta(hours=24),
            '2d': timedelta(days=2),
            '3d': timedelta(days=3),
            'week': timedelta(days=7),
            '10d': timedelta(days=10),
            'month': timedelta(days=30),
        }
        delta = deltas.get(posted_within)
        return now - delta if delta else None

    @staticmethod
    def _is_within_date_range(job: Dict[str, Any], cutoff: datetime) -> bool:
        extensions = job.get("detected_extensions") or {}
        posted_at = extensions.get("posted_at") or ""
        if not posted_at:
            return True
        posted_at = posted_at.lower().strip()
        try:
            if "just now" in posted_at or "minute" in posted_at or "hour" in posted_at:
                return True
            if "day" in posted_at:
                days = int(''.join(c for c in posted_at.split("day")[0] if c.isdigit()) or "0")
                return datetime.now(timezone.utc) - timedelta(days=days) >= cutoff
            if "week" in posted_at:
                weeks = int(''.join(c for c in posted_at.split("week")[0] if c.isdigit()) or "0")
                return datetime.now(timezone.utc) - timedelta(weeks=weeks) >= cutoff
            if "month" in posted_at:
                months = int(''.join(c for c in posted_at.split("month")[0] if c.isdigit()) or "0")
                return datetime.now(timezone.utc) - timedelta(days=months * 30) >= cutoff
        except (ValueError, IndexError):
            pass
        return True

    def fetch_job_detail(self, external_id: str) -> Dict[str, Any]:
        if not external_id:
            raise ProviderError("Job ID is required to fetch details.")
        data = self._get({
            "engine": "google_jobs_listing",
            "q": external_id,
        })
        return data.get("salaries") or data.get("apply_options") or data

    def normalize_source_record(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        external_id = (
            raw_payload.get("job_id")
            or raw_payload.get("google_job_id")
            or hashlib.sha256(str(raw_payload.get("link", "")).encode()).hexdigest()
        )
        url = (
            raw_payload.get("link")
            or raw_payload.get("share_link")
            or raw_payload.get("source_link")
            or ""
        )
        if not url:
            apply_options = raw_payload.get("apply_options") or []
            if isinstance(apply_options, list):
                for option in apply_options:
                    if isinstance(option, dict) and option.get("link"):
                        url = str(option["link"])
                        break
        return {
            "external_id": str(external_id),
            "url": str(url),
            "title": strip_html(raw_payload.get("title") or raw_payload.get("job_title") or ""),
            "company": strip_html(raw_payload.get("company_name") or ""),
            "location": strip_html(raw_payload.get("location") or ""),
            "description": strip_html(raw_payload.get("description") or ""),
        }

    def health_check(self) -> bool:
        """Validate key via Account API (free; does not consume search credits)."""
        try:
            self.persist_credit_usage()
            return True
        except ProviderError:
            return False

    def fetch_credit_usage(self) -> Dict[str, Any]:
        """GET https://serpapi.com/account.json — plan_searches_left / total_searches_left."""
        try:
            res = requests.get(
                "https://serpapi.com/account.json",
                params={"api_key": self._api_key()},
                timeout=30,
            )
            res.raise_for_status()
        except requests.RequestException as exc:
            raise ProviderError(f"SerpApi account request failed: {exc}") from exc

        data = res.json()
        if isinstance(data, dict) and data.get("error"):
            raise ProviderError(f"SerpApi account error: {data['error']}")

        searches_left = data.get("total_searches_left")
        if searches_left is None:
            searches_left = data.get("plan_searches_left")
        return {
            "provider": "serpapi",
            "searches_remaining": searches_left,
            "searches_quota": data.get("searches_per_month"),
            "searches_used": data.get("this_month_usage"),
            "plan_searches_left": data.get("plan_searches_left"),
            "extra_credits": data.get("extra_credits"),
            "plan_name": data.get("plan_name"),
            "plan_renewal_date": data.get("plan_renewal_date"),
            "account_status": data.get("account_status"),
            "hourly_limit": data.get("account_rate_limit_per_hour"),
            "this_hour_searches": data.get("this_hour_searches"),
        }

    def get_rate_limit_state(self) -> Dict[str, int]:
        remaining = max(0, self.config.rate_limit_daily - self.config.current_daily_uses)
        credits = self.config.credit_usage or {}
        searches = credits.get("searches_remaining")
        return {
            "remaining_daily": remaining,
            "rpm": self.config.rate_limit_rpm,
            "searches_remaining": int(searches) if searches is not None else remaining,
        }

    def get_usage_metrics(self) -> Dict[str, Any]:
        return {
            "provider": self.config.provider_code,
            "current_daily_uses": self.config.current_daily_uses,
            "rate_limit_daily": self.config.rate_limit_daily,
            "rate_limit_rpm": self.config.rate_limit_rpm,
            "health_status": self.config.health_status,
            "last_run_at": self.config.last_run_at,
            "credit_usage": self.config.credit_usage or {},
        }
