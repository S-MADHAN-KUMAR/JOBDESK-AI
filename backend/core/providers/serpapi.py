"""SerpApi Google Jobs provider connector."""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import requests

from .base import JobSourceProvider, ProviderError, extract_api_key, strip_html

DEFAULT_BASE_URL = "https://serpapi.com/search.json"


class SerpApiProvider(JobSourceProvider):
    """SerpApi Google Jobs connector.

    Each page returns up to 10 results.  ``max_pages`` controls how many
    pages are fetched so the total job count equals ``10 * max_pages``.
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

    def search_jobs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        keyword = filters.get("keyword") or self.config.default_params.get("keyword", "")
        location = filters.get("location") or self.config.default_params.get("location", "")
        pages = int(filters.get("max_pages") or self.config.default_params.get("max_pages") or 1)
        posted_within = filters.get("posted_within") or self.config.default_params.get("posted_within", "")

        if not keyword:
            raise ProviderError("A search keyword is required.")

        jobs: List[Dict[str, Any]] = []
        next_page_token: str | None = None

        for _ in range(max(1, pages)):
            params: Dict[str, Any] = {
                "engine": "google_jobs",
                "q": keyword,
            }
            if location:
                params["location"] = location
            if next_page_token:
                params["next_page_token"] = next_page_token

            data = self._get(params)
            results = data.get("jobs_results") or []
            jobs.extend(results)

            next_page_token = (
                data.get("serpapi_pagination", {}).get("next_page_token")
                or data.get("pagination", {}).get("next_page_token")
            )

            if not results or not next_page_token:
                break

        # Client-side date filtering when posted_within is specified
        if posted_within and jobs:
            cutoff = self._posted_within_cutoff(posted_within)
            if cutoff:
                jobs = [r for r in jobs if self._is_within_date_range(r, cutoff)]

        return jobs

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
        return {
            "external_id": str(external_id),
            "url": raw_payload.get("link") or "",
            "title": strip_html(raw_payload.get("title") or ""),
            "company": strip_html(raw_payload.get("company_name") or ""),
            "location": strip_html(raw_payload.get("location") or ""),
            "description": strip_html(raw_payload.get("description") or ""),
        }

    def health_check(self) -> bool:
        try:
            data = self._get({"engine": "google_jobs", "q": "test"})
            return bool(data.get("jobs_results"))
        except ProviderError:
            return False

    def get_rate_limit_state(self) -> Dict[str, int]:
        remaining = max(0, self.config.rate_limit_daily - self.config.current_daily_uses)
        return {"remaining_daily": remaining, "rpm": self.config.rate_limit_rpm}

    def get_usage_metrics(self) -> Dict[str, Any]:
        return {
            "provider": self.config.provider_code,
            "current_daily_uses": self.config.current_daily_uses,
            "rate_limit_daily": self.config.rate_limit_daily,
            "rate_limit_rpm": self.config.rate_limit_rpm,
            "health_status": self.config.health_status,
            "last_run_at": self.config.last_run_at,
        }
