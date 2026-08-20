"""Apify actor-run provider connector."""

from typing import Any, Dict, List

from apify_client import ApifyClient

from .base import JobSourceProvider, ProviderError, extract_api_key, strip_html

DEFAULT_ACTOR_ID = "agentx/all-jobs-scraper"


class ApifyProvider(JobSourceProvider):
    """Apify connector that runs an actor and reads its dataset synchronously."""

    def _token(self) -> str:
        token = extract_api_key(self.config.get_auth_config())
        if not token:
            raise ProviderError("Apify API token is not configured.")
        return token

    def _actor_id(self) -> str:
        return str(self.config.default_params.get("actor_id") or DEFAULT_ACTOR_ID)

    def search_jobs(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        keyword = filters.get("keyword") or self.config.default_params.get("keyword", "")
        location = filters.get("location") or self.config.default_params.get("location", "")
        country = filters.get("country") or self.config.default_params.get("country") or "India"
        max_results = int(
            filters.get("max_results")
            or filters.get("max_pages")
            or self.config.default_params.get("max_results")
            or self.config.default_params.get("max_pages")
            or 20
        )
        remote_only = bool(filters.get("remote_only") or self.config.default_params.get("remote_only", True))
        job_type = filters.get("job_type") or self.config.default_params.get("job_type", "fulltime")
        platforms = filters.get("platforms") or self.config.default_params.get("platforms") or ["linkedin"]
        if not keyword:
            raise ProviderError("A search keyword is required.")

        run_input = {
            "keyword": keyword,
            "country": country,
            "location": location,
            "max_results": max_results,
            "remote_only": remote_only,
            "job_type": job_type,
            "platforms": ["LinkedIn", "Indeed", "Naukri.com","Glassdoor"],
        }
        try:
            client = ApifyClient(self._token())
            run = client.actor(self._actor_id()).call(run_input=run_input)
            items = client.dataset(run.default_dataset_id).list_items().items
        except Exception as exc:
            raise ProviderError(f"Apify run failed: {exc}") from exc
        return items or []

    def fetch_job_detail(self, external_id: str) -> Dict[str, Any]:
        raise ProviderError("Job detail fetch is not supported for Apify.")

    def normalize_source_record(self, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
        item = raw_payload
        external_id = item.get("platform_url") or item.get("official_url")
        if not external_id:
            raise ProviderError("Apify item has no usable job url.")
        location = item.get("location")
        if isinstance(location, dict):
            location = location.get("raw") or location.get("country")
        return {
            "external_id": str(external_id),
            "url": item.get("official_url") or item.get("platform_url") or "",
            "title": strip_html(item.get("title")),
            "company": strip_html(item.get("company_name")),
            "location": strip_html(location),
            "description": strip_html(item.get("description")),
        }

    def health_check(self) -> bool:
        try:
            ApifyClient(self._token()).users().get()
            return True
        except ProviderError:
            return False
        except Exception:
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