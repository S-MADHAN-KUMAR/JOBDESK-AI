"""Coresignal CDAPI v2 provider connector (Base Jobs API)."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List

import requests

from .base import JobSourceProvider, ProviderError, extract_api_key, strip_html

DEFAULT_BASE_URL = "https://api.coresignal.com/cdapi"
SEARCH_FILTER_PATH = "/v2/job_base/search/filter"
COLLECT_PATH = "/v2/job_base/collect"
MAX_COLLECT_PER_RUN = 50
COLLECT_WORKERS = 8


class CoresignalProvider(JobSourceProvider):
    """
    Coresignal Base Jobs API connector.

    Search (`POST /v2/job_base/search/filter`) returns only job IDs;
    full records are fetched per ID via `GET /v2/job_base/collect/{id}`.
    """

    def _api_key(self) -> str:
        key = extract_api_key(self.config.get_auth_config())
        if not key:
            raise ProviderError("Coresignal API key is not configured.")
        return key

    def _base_url(self) -> str:
        base = (self.config.base_url or DEFAULT_BASE_URL).rstrip("/")
        for suffix in ("/v1", "/v2"):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
                break
        return base

    def _headers(self) -> Dict[str, str]:
        return {
            "accept": "application/json",
            "apikey": self._api_key(),
            "Content-Type": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        try:
            res = requests.request(method, url, headers=self._headers(), timeout=60, **kwargs)
            res.raise_for_status()
        except requests.RequestException as exc:
            raise ProviderError(f"Coresignal request failed: {exc}") from exc
        return res.json()

    def search_jobs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        keyword = filters.get("keyword") or self.config.default_params.get("keyword", "")
        location = filters.get("location") or self.config.default_params.get("location", "")
        pages = int(filters.get("max_pages") or self.config.default_params.get("max_pages") or 1)
        if not keyword:
            raise ProviderError("A search keyword is required.")

        base = self._base_url()
        items = max(1, min(MAX_COLLECT_PER_RUN, pages * 50))
        body: Dict[str, Any] = {
            "deleted": False,
            "application_active": True,
        }
        if keyword:
            body["title"] = keyword
        if location:
            body["location"] = location

        ids = self._request(
            "POST",
            f"{base}{SEARCH_FILTER_PATH}",
            params={"items_per_page": items},
            json=body,
        )
        if not isinstance(ids, list):
            raise ProviderError("Coresignal search returned an unexpected response.")
        if not ids:
            return []

        records: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(COLLECT_WORKERS, len(ids))) as pool:
            futures = {
                pool.submit(self._request, "GET", f"{base}{COLLECT_PATH}/{job_id}"): job_id
                for job_id in ids
            }
            for future in as_completed(futures):
                job_id = futures[future]
                try:
                    record = future.result()
                except ProviderError:
                    record = None
                if isinstance(record, dict):
                    records.append(record)
                else:
                    # Free search/filter fallback: keep the ID so the run still
                    # stores a traceable record when collect credits run out.
                    records.append({"id": job_id})
        return records

    def fetch_job_detail(self, external_id: str) -> Dict[str, Any]:
        base = self._base_url()
        return self._request("GET", f"{base}{COLLECT_PATH}/{external_id}")

    def normalize_source_record(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        external_id = raw_payload.get("id") or raw_payload.get("professional_network_job_id")
        if external_id is None:
            raise ProviderError("Coresignal item has no usable job id.")
        return {
            "external_id": str(external_id),
            "url": raw_payload.get("url") or raw_payload.get("external_url") or "",
            "title": strip_html(raw_payload.get("title")),
            "company": strip_html(raw_payload.get("company_name")),
            "location": strip_html(raw_payload.get("location")),
            "description": strip_html(raw_payload.get("description")),
        }

    def health_check(self) -> bool:
        try:
            base = self._base_url()
            ids = self._request(
                "POST",
                f"{base}{SEARCH_FILTER_PATH}",
                params={"items_per_page": 1},
                json={"title": "test", "deleted": False, "application_active": True},
            )
            return isinstance(ids, list)
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