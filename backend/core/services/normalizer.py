"""Normalization and cleanup of raw job data before deduplication."""

import re
from typing import Dict, Any, Optional

from core.ingestion_models import MasterCompany, MasterLocation


# ---------------------------------------------------------------------------
# Title normalization
# ---------------------------------------------------------------------------

TITLE_CLEANUP_PATTERNS = [
    (r'\s+', ' '),
    (r'\(.*?\)', ''),
    (r'[-–—]\s*(remote|hybrid|onsite|on-site|full.?time|part.?time|contract).*$', ''),
]

WORK_MODE_KEYWORDS = {
    'remote': ['remote', 'work from home', 'wfh', 'anywhere', 'distributed'],
    'hybrid': ['hybrid', 'flexible', 'flex', 'partial remote'],
    'onsite': ['onsite', 'on-site', 'in-office', 'in office', 'office'],
}

EMPLOYMENT_TYPE_KEYWORDS = {
    'full_time': ['full-time', 'full time', 'permanent', 'fte'],
    'part_time': ['part-time', 'part time'],
    'contract': ['contract', 'contractor', 'c2c', '1099'],
    'freelance': ['freelance', 'freelancer'],
    'internship': ['intern', 'internship', 'trainee'],
}

SENIORITY_KEYWORDS = {
    'intern': ['intern', 'internship', 'trainee'],
    'junior': ['junior', 'jr', 'entry level', 'entry-level', 'graduate', 'fresher'],
    'mid': ['mid-level', 'mid level', 'intermediate', 'software engineer'],
    'senior': ['senior', 'sr', 'sr.', 'experienced', 'specialist'],
    'lead': ['lead', 'tech lead', 'team lead', 'principal'],
    'manager': ['manager', 'head', 'director', 'vp', 'vice president'],
}

EXPERIENCE_PATTERN = re.compile(
    r'(\d+)\s*[-+to]+\s*(\d+)\s*years?',
    re.IGNORECASE,
)
EXPERIENCE_SINGLE = re.compile(
    r'(\d+)\s*years?\s*(?:of)?\s*(?:experience)?',
    re.IGNORECASE,
)


def normalize_title(title: str) -> str:
    """Clean and standardize a job title."""
    if not title:
        return ''
    cleaned = title.strip()
    for pattern, replacement in TITLE_CLEANUP_PATTERNS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    return cleaned.strip().strip('-–—').strip()


def detect_work_mode(title: str, description: str) -> str:
    """Detect work mode from title and description text."""
    text = f"{title} {description}".lower()
    for mode, keywords in WORK_MODE_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return mode
    return 'unknown'


def detect_employment_type(title: str, description: str) -> str:
    """Detect employment type from title and description text."""
    text = f"{title} {description}".lower()
    for emp_type, keywords in EMPLOYMENT_TYPE_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return emp_type
    return 'unknown'


def detect_seniority(title: str, description: str) -> str:
    """Detect seniority level from title and description text."""
    title_lower = title.lower()
    for level, keywords in SENIORITY_KEYWORDS.items():
        if any(kw in title_lower for kw in keywords):
            return level
    desc_lower = description.lower()
    for level, keywords in SENIORITY_KEYWORDS.items():
        if any(kw in desc_lower for kw in keywords):
            return level
    return 'unknown'


def extract_experience_text(description: str) -> str:
    """Extract experience requirement text from description."""
    if not description:
        return ''
    match = EXPERIENCE_PATTERN.search(description)
    if match:
        return f"{match.group(1)}-{match.group(2)} years"
    match = EXPERIENCE_SINGLE.search(description)
    if match:
        return f"{match.group(1)} years"
    return ''


# ---------------------------------------------------------------------------
# Company normalization
# ---------------------------------------------------------------------------

COMPANY_CLEANUP = [
    (r'\s+', ' '),
    (r'\b(Inc\.?|LLC\.?|Ltd\.?|Limited|Corp\.?|Corporation|Co\.?|Company|Pvt\.?|Private|GmbH|AG|SA|SAS|S\.?A\.?\.?)\b\.?$', ''),
    (r'[,\.]$', ''),
]


def normalize_company_name(name: str) -> str:
    """Normalize a raw company name for matching."""
    if not name:
        return ''
    cleaned = name.strip()
    for pattern, replacement in COMPANY_CLEANUP:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    return cleaned.strip().lower()


def get_or_create_master_company(raw_name: str) -> Optional[MasterCompany]:
    """Resolve a raw company name to a MasterCompany, creating if needed."""
    if not raw_name or not raw_name.strip():
        return None
    normalized = normalize_company_name(raw_name)
    if not normalized:
        return None
    company, _ = MasterCompany.objects.get_or_create(
        normalized_name=normalized,
        defaults={
            'name': raw_name.strip(),
            'normalized_name': normalized,
        },
    )
    return company


# ---------------------------------------------------------------------------
# Location normalization
# ---------------------------------------------------------------------------

LOCATION_CLEANUP = [
    (r'\s+', ' '),
    (r'\s*,\s*', ', '),
]


def normalize_location_text(raw: str) -> str:
    """Normalize raw location text for matching."""
    if not raw:
        return ''
    cleaned = raw.strip()
    for pattern, replacement in LOCATION_CLEANUP:
        cleaned = re.sub(pattern, replacement, cleaned)
    return cleaned.strip().lower()


def get_or_create_master_location(raw_text: str) -> Optional[MasterLocation]:
    """Resolve raw location text to a MasterLocation, creating if needed."""
    if not raw_text or not raw_text.strip():
        return None
    normalized = normalize_location_text(raw_text)
    if not normalized:
        return None
    parts = [p.strip() for p in normalized.split(',') if p.strip()]
    city = parts[0] if len(parts) >= 1 else ''
    state = parts[1] if len(parts) >= 2 else ''
    country = parts[2] if len(parts) >= 3 else ''
    if len(parts) == 1:
        city = parts[0]
    elif len(parts) == 2:
        city, country = parts[0], parts[1]
    else:
        city, state, country = parts[0], parts[1], ','.join(parts[2:])
    loc, _ = MasterLocation.objects.get_or_create(
        raw_text=raw_text.strip(),
        defaults={
            'raw_text': raw_text.strip(),
            'city': city.title(),
            'state': state.title(),
            'country': country.title(),
            'normalized': normalized,
        },
    )
    return loc


# ---------------------------------------------------------------------------
# Main normalization entry point
# ---------------------------------------------------------------------------

def normalize_raw_job(raw_job) -> Dict[str, Any]:
    """
    Normalize a RawJob instance into a structured dict ready for deduplication.

    Returns a dict with normalized fields:
      title, normalized_title, company_name_raw, company_master,
      location_raw, location_master, work_mode, employment_type,
      seniority, experience_text, description
    """
    title = normalize_title(raw_job.title or '')
    description = raw_job.description or ''

    work_mode = detect_work_mode(title, description)
    employment_type = detect_employment_type(title, description)
    seniority = detect_seniority(title, description)
    experience_text = extract_experience_text(description)

    company_master = get_or_create_master_company(raw_job.company)
    location_master = get_or_create_master_location(raw_job.location)

    return {
        'title': title,
        'normalized_title': normalize_title(title),
        'company_name_raw': (raw_job.company or '').strip(),
        'company_master': company_master,
        'location_raw': (raw_job.location or '').strip(),
        'location_master': location_master,
        'work_mode': work_mode,
        'employment_type': employment_type,
        'seniority': seniority,
        'experience_text': experience_text,
        'description': description,
    }
