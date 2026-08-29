"""Apify actor-run provider connector."""

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from apify_client import ApifyClient

from .base import JobSourceProvider, ProviderError, extract_api_key, strip_html

DEFAULT_ACTOR_ID = "agentx/all-jobs-scraper"

DEFAULT_PLATFORMS = ["LinkedIn", "Indeed", "Naukri.com", "Glassdoor"]

# Values accepted by agentx/all-jobs-scraper `platforms` input.
SUPPORTED_PLATFORMS = [
    "LinkedIn",
    "Indeed",
    "Naukri.com",
    "ZipRecruiter",
    "Jooble",
    "France Travail",
    "Bundesagentur für Arbeit",
    "Glassdoor",
    "Jobstreet",
    "Saramin",
    "doda",
    "SAP",
    "JobKorea",
    "Mynavi Tenshoku",
    "Pracuj.pl",
    "HelloWork",
    "Stepstone",
    "InfoJobs",
    "Talent.com",
    "USAJOBS",
    "Baitoru",
    "Kariyer.net",
    "foundit",
    "Jobs2Careers",
    "OnlineJobs.ph",
    "Catho",
    "Arbetsförmedlingen",
    "Glints",
    "Totaljobs",
    "OCC",
    "Freelancer.com",
    "Jobright",
    "Job Bank",
    "jobs.ch",
    "Bayt.com",
    "Reed.co.uk",
    "CV-Library",
    "VDAB",
    "Kyujin Box",
]

_SUPPORTED_SET = frozenset(SUPPORTED_PLATFORMS)

WORK_MODE_KEYWORDS = {
    'remote': ['remote', 'work from home', 'wfh', 'anywhere', 'distributed'],
    'hybrid': ['hybrid', 'flexible', 'flex', 'partial remote'],
    'onsite': ['onsite', 'on-site', 'in-office', 'in office', 'office'],
}

EMPLOYMENT_KEYWORDS = {
    'fulltime': ['full-time', 'full time', 'permanent', 'fte'],
    'parttime': ['part-time', 'part time'],
    'contract': ['contract', 'contractor', 'c2c', '1099'],
    'internship': ['intern', 'internship', 'trainee'],
}

POSTED_WITHIN_DAYS = {
    '24h': 1,
    '2d': 2,
    '3d': 3,
    'week': 7,
    '10d': 10,
    'month': 30,
}


class ApifyProvider(JobSourceProvider):
    """Apify connector that runs an actor and reads its dataset synchronously.

    ``max_results`` (mapped from ``max_pages``) controls the exact number of
    jobs returned.  The actor is asked to fetch more so post-filters have
    enough candidates, then the result list is sliced to ``max_results``.
    """

    def _token(self) -> str:
        token = extract_api_key(self.config.get_auth_config())
        if not token:
            raise ProviderError("Apify API token is not configured.")
        return token

    def _actor_id(self) -> str:
        return str(self.config.default_params.get("actor_id") or DEFAULT_ACTOR_ID)

    def _resolve_platforms(self, filters: Dict[str, Any]) -> List[str]:
        """Return selected job platforms; Apify-only (ignored by other providers)."""
        raw = filters.get("platforms")
        if raw is None or raw == "" or raw == []:
            raw = self.config.default_params.get("platforms")
        if isinstance(raw, str):
            raw = [part.strip() for part in raw.split(",") if part.strip()]
        if not isinstance(raw, list) or not raw:
            return list(DEFAULT_PLATFORMS)
        platforms = [str(p) for p in raw if str(p) in _SUPPORTED_SET]
        if not platforms:
            raise ProviderError(
                "Select at least one valid Apify job platform "
                f"(e.g. {', '.join(DEFAULT_PLATFORMS)})."
            )
        return platforms

    def _matches_work_mode(self, title: str, description: str, required: str) -> bool:
        if not required:
            return True
        text = f"{title} {description}".lower()
        keywords = WORK_MODE_KEYWORDS.get(required, [])
        return any(kw in text for kw in keywords)

    def _matches_employment_type(self, title: str, description: str, required: str) -> bool:
        if not required:
            return True
        text = f"{title} {description}".lower()
        keywords = EMPLOYMENT_KEYWORDS.get(required, [])
        return any(kw in text for kw in keywords)

    def _matches_role(self, title: str, description: str, role: str) -> bool:
        if not role:
            return True
        text = f"{title} {description}".lower()
        return role.lower() in text

    def _matches_posted_within(self, item: Dict[str, Any], posted_within: str) -> bool:
        max_days = POSTED_WITHIN_DAYS.get(posted_within)
        if not max_days:
            return True
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_days)

        posted_at = item.get("posted_at") or ""
        if not posted_at:
            exts = item.get("detected_extensions") or {}
            posted_at = exts.get("posted_at") or ""

        if not posted_at:
            return True

        posted_at = posted_at.lower().strip()
        try:
            if "just now" in posted_at or "minute" in posted_at or "hour" in posted_at:
                return True
            if "day" in posted_at:
                days = int(re.search(r'(\d+)', posted_at).group(1))
                return datetime.now(timezone.utc) - timedelta(days=days) >= cutoff
            if "week" in posted_at:
                weeks = int(re.search(r'(\d+)', posted_at).group(1))
                return datetime.now(timezone.utc) - timedelta(weeks=weeks) >= cutoff
            if "month" in posted_at:
                months = int(re.search(r'(\d+)', posted_at).group(1))
                return datetime.now(timezone.utc) - timedelta(days=months * 30) >= cutoff
        except (ValueError, AttributeError):
            pass
        return True

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
        min_salary = int(filters.get("min_salary") or self.config.default_params.get("min_salary", 0) or 0)
        max_salary = int(filters.get("max_salary") or self.config.default_params.get("max_salary", 0) or 0)
        employment_type = filters.get("employment_type") or self.config.default_params.get("employment_type", "")
        work_mode = filters.get("work_mode") or self.config.default_params.get("work_mode", "")
        role = filters.get("role") or self.config.default_params.get("role", "")
        posted_within = filters.get("posted_within") or self.config.default_params.get("posted_within", "")
        platforms = self._resolve_platforms(filters)

        if not keyword:
            raise ProviderError("A search keyword is required.")

        search_keyword = keyword
        if role:
            search_keyword = f"{keyword} {role}"

        # Ask for more results than needed so post-filters have enough candidates.
        # Factor of 3 covers typical filter drop-off; hard minimum of max_results.
        fetch_count = max(max_results, max_results * 3, 50)

        run_input = {
            "keyword": search_keyword,
            "country": country,
            "location": location,
            "max_results": fetch_count,
            "remote_only": False,
            "job_type": "fulltime",
            "platforms": platforms,
        }
        try:
            client = ApifyClient(self._token())
            run = client.actor(self._actor_id()).call(run_input=run_input)
            items = client.dataset(run.default_dataset_id).list_items().items or []
        except Exception as exc:
            raise ProviderError(f"Apify run failed: {exc}") from exc

        filtered: List[Dict[str, Any]] = []
        for item in items:
            title = item.get("title") or ""
            desc = item.get("description") or ""
            salary_raw = item.get("salary") or ""
            salary_str = str(salary_raw).lower()

            if not self._matches_work_mode(title, desc, work_mode):
                continue
            if not self._matches_employment_type(title, desc, employment_type):
                continue
            if not self._matches_role(title, desc, role if role and not role.lower() in search_keyword.lower() else ""):
                continue
            if min_salary > 0 or max_salary > 0:
                salary_match = re.search(r'(\d[\d,]*\.?\d*)', salary_str.replace(',', ''))
                if salary_match:
                    salary_val = float(salary_match.group(1))
                    if min_salary > 0 and salary_val < min_salary:
                        continue
                    if max_salary > 0 and salary_val > max_salary:
                        continue
            if posted_within:
                if not self._matches_posted_within(item, posted_within):
                    continue
            filtered.append(item)
            # Stop once we have enough
            if len(filtered) >= max_results:
                break

        return filtered

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

    @staticmethod
    def _to_dict(obj: Any) -> Dict[str, Any]:
        """Normalize Apify client models / dicts to a plain mapping."""
        if obj is None:
            return {}
        if isinstance(obj, dict):
            return obj
        if hasattr(obj, "model_dump"):
            try:
                return obj.model_dump(mode="python")
            except TypeError:
                return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        return {}

    @staticmethod
    def _pick(mapping: Dict[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in mapping and mapping[key] is not None:
                return mapping[key]
        return None

    def health_check(self) -> bool:
        """Validate token via GET /users/me/limits (also refreshes credit balances)."""
        try:
            self.persist_credit_usage()
            return True
        except ProviderError:
            return False
        except Exception:
            return False

    def fetch_credit_usage(self) -> Dict[str, Any]:
        """GET /v2/users/me/limits — remaining USD + actor compute units for the cycle.

        Apify Python client returns an AccountLimits pydantic model with snake_case
        fields (monthly_usage_usd, max_monthly_actor_compute_units, …). Older HTTP
        responses use camelCase; both shapes are supported.
        """
        try:
            raw = ApifyClient(self._token()).user().limits()
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(f"Apify limits request failed: {exc}") from exc

        data = self._to_dict(raw)
        limits = self._to_dict(self._pick(data, "limits") or {})
        current = self._to_dict(self._pick(data, "current") or {})
        cycle = self._to_dict(
            self._pick(data, "monthly_usage_cycle", "monthlyUsageCycle") or {}
        )

        usd_quota = self._pick(limits, "max_monthly_usage_usd", "maxMonthlyUsageUsd")
        usd_used = self._pick(current, "monthly_usage_usd", "monthlyUsageUsd")
        usd_remaining = None
        if usd_quota is not None and usd_used is not None:
            try:
                usd_remaining = round(max(0.0, float(usd_quota) - float(usd_used)), 4)
            except (TypeError, ValueError):
                usd_remaining = None

        cu_quota = self._pick(
            limits,
            "max_monthly_actor_compute_units",
            "maxMonthlyActorComputeUnits",
        )
        cu_used = self._pick(
            current,
            "monthly_actor_compute_units",
            "monthlyActorComputeUnits",
        )
        cu_remaining = None
        if cu_quota is not None and cu_used is not None:
            try:
                cu_remaining = round(max(0.0, float(cu_quota) - float(cu_used)), 4)
            except (TypeError, ValueError):
                cu_remaining = None

        proxy_quota = self._pick(limits, "max_monthly_proxy_serps", "maxMonthlyProxySerps")
        proxy_used = self._pick(current, "monthly_proxy_serps", "monthlyProxySerps")
        proxy_remaining = None
        if proxy_quota is not None and proxy_used is not None:
            try:
                proxy_remaining = max(0, int(proxy_quota) - int(proxy_used))
            except (TypeError, ValueError):
                proxy_remaining = None

        transfer_quota = self._pick(
            limits,
            "max_monthly_external_data_transfer_gbytes",
            "maxMonthlyExternalDataTransferGbytes",
        )
        transfer_used = self._pick(
            current,
            "monthly_external_data_transfer_gbytes",
            "monthlyExternalDataTransferGbytes",
        )

        cycle_start = self._pick(cycle, "start_at", "startAt")
        cycle_end = self._pick(cycle, "end_at", "endAt")
        if hasattr(cycle_start, "isoformat"):
            cycle_start = cycle_start.isoformat()
        if hasattr(cycle_end, "isoformat"):
            cycle_end = cycle_end.isoformat()

        return {
            "provider": "apify",
            "usd_remaining": usd_remaining,
            "usd_quota": float(usd_quota) if usd_quota is not None else None,
            "usd_used": round(float(usd_used), 4) if usd_used is not None else None,
            "compute_remaining": cu_remaining,
            "compute_quota": float(cu_quota) if cu_quota is not None else None,
            "compute_used": round(float(cu_used), 4) if cu_used is not None else None,
            "actor_count": self._pick(current, "actor_count", "actorCount"),
            "actor_task_count": self._pick(current, "actor_task_count", "actorTaskCount"),
            "active_actor_jobs": self._pick(
                current, "active_actor_job_count", "activeActorJobCount"
            ),
            "max_concurrent_actor_jobs": self._pick(
                limits, "max_concurrent_actor_jobs", "maxConcurrentActorJobs"
            ),
            "data_transfer_used_gb": (
                round(float(transfer_used), 6) if transfer_used is not None else None
            ),
            "data_transfer_quota_gb": (
                float(transfer_quota) if transfer_quota is not None else None
            ),
            "cycle_start": cycle_start,
            "cycle_end": cycle_end,
            "proxy_serps_remaining": proxy_remaining,
            "proxy_serps_quota": proxy_quota,
            "proxy_serps_used": proxy_used,
        }


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
            "credit_usage": self.config.credit_usage or {},
        }
