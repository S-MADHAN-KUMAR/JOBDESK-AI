"""AI classification and extraction for canonical jobs."""

import json
import os
import re
from typing import Dict, Any, List, Optional, Tuple

from django.conf import settings

from core.ingestion_models import CanonicalJob, JobClassification, MasterTechnology, MasterSkill


# ---------------------------------------------------------------------------
# Deterministic rules engine
# ---------------------------------------------------------------------------

TECH_PATTERNS: Dict[str, List[str]] = {
    'Python': [r'\bpython\b', r'\bdjango\b', r'\bflask\b', r'\bfastapi\b'],
    'Java': [r'\bjava\b(?!\s*script)', r'\bspring\b', r'\bspring\s*boot\b'],
    'JavaScript': [r'\bjavascript\b', r'\bjs\b', r'\bnode\.?js\b', r'\breact\b', r'\bangular\b', r'\bvue\.?js\b'],
    'TypeScript': [r'\btypescript\b', r'\bts\b'],
    'C#': [r'\bc#?\b', r'\b\.net\b', r'\basp\.net\b'],
    'C++': [r'\bc\+\+\b'],
    'Go': [r'\bgolang\b', r'\bgo\b(?=\s*(?:lang|developer|engineer))'],
    'Rust': [r'\brust\b'],
    'Ruby': [r'\bruby\b', r'\brails\b'],
    'PHP': [r'\bphp\b', r'\blaravel\b'],
    'SQL': [r'\bsql\b', r'\bmysql\b', r'\bpostgresql\b', r'\bpostgres\b', r'\bsqlite\b', r'\boracle\b'],
    'React': [r'\breact\b', r'\breactjs\b', r'\breact\.js\b'],
    'Angular': [r'\bangular\b', r'\bangularjs\b'],
    'Vue.js': [r'\bvue\.?js\b', r'\bvue\b'],
    'Node.js': [r'\bnode\.?js\b', r'\bnodejs\b'],
    'AWS': [r'\baws\b', r'\bamazon\s*web\s*services\b'],
    'Azure': [r'\bazure\b'],
    'GCP': [r'\bgcp\b', r'\bgoogle\s*cloud\b'],
    'Docker': [r'\bdocker\b'],
    'Kubernetes': [r'\bkubernetes\b', r'\bk8s\b'],
    'Git': [r'\bgit\b', r'\bgithub\b', r'\bgitlab\b'],
    'Redis': [r'\bredis\b'],
    'MongoDB': [r'\bmongodb\b', r'\bmongo\b'],
    'PostgreSQL': [r'\bpostgresql\b', r'\bpostgres\b'],
    'Elasticsearch': [r'\belasticsearch\b', r'\belk\b'],
    'Terraform': [r'\bterraform\b'],
    'Jenkins': [r'\bjenkins\b'],
    'CI/CD': [r'\bci\/cd\b', r'\bcontinuous\s*(integration|delivery|deployment)\b'],
    'Machine Learning': [r'\bmachine\s*learning\b', r'\bml\b'],
    'Deep Learning': [r'\bdeep\s*learning\b', r'\bneural\s*network\b'],
    'TensorFlow': [r'\btensorflow\b', r'\btf\b'],
    'PyTorch': [r'\bpytorch\b'],
    'NLP': [r'\bnlp\b', r'\bnatural\s*language\b'],
}

ROLE_PATTERNS: Dict[str, List[str]] = {
    'Backend Developer': [r'\bbackend\b', r'\bserver[- ]side\b', r'\bapi\b.*\bdeveloper\b'],
    'Frontend Developer': [r'\bfrontend\b', r'\bfront[- ]end\b', r'\bui\b.*\bdeveloper\b'],
    'Full Stack Developer': [r'\bfull[- ]?stack\b'],
    'Data Scientist': [r'\bdata\s*scientist\b'],
    'Data Engineer': [r'\bdata\s*engineer\b'],
    'DevOps Engineer': [r'\bdevops\b', r'\binfra\b.*\bengineer\b'],
    'ML Engineer': [r'\bml\b.*\bengineer\b', r'\bmachine\s*learning\b.*\bengineer\b'],
    'Mobile Developer': [r'\bmobile\b', r'\bios\b.*\bdeveloper\b', r'\bandroid\b.*\bdeveloper\b'],
    'QA Engineer': [r'\bqa\b', r'\bquality\b', r'\btest\b.*\bengineer\b'],
    'Product Manager': [r'\bproduct\s*manager\b'],
    'Scrum Master': [r'\bscrum\b.*\bmaster\b', r'\bagile\b.*\bcoach\b'],
    'Cloud Engineer': [r'\bcloud\b.*\bengineer\b'],
    'Security Engineer': [r'\bsecurity\b.*\bengineer\b', r'\bcybersecurity\b'],
    'Database Administrator': [r'\bdba\b', r'\bdatabase\b.*\badmin\b'],
    'Solutions Architect': [r'\bsolutions?\s*architect\b', r'\btechnical\s*architect\b'],
}


def _extract_technologies(text: str) -> Tuple[List[str], List[str]]:
    """Extract primary and secondary technologies from text using regex rules."""
    text_lower = text.lower()
    found = set()
    for tech, patterns in TECH_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                found.add(tech)
                break
    primary = sorted(found)[:5]
    secondary = sorted(found - set(primary))
    return primary, secondary


def _extract_role_category(title: str, description: str) -> str:
    """Determine the role category from title and description."""
    text = f"{title} {description}".lower()
    for role, patterns in ROLE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text):
                return role
    return 'Other'


def _extract_skills(description: str) -> List[str]:
    """Extract individual skills mentioned in the description."""
    skills = set()
    for tech, patterns in TECH_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, description.lower()):
                skills.add(tech)
                break
    return sorted(skills)


def classify_deterministically(title: str, description: str) -> Dict[str, Any]:
    """
    Classify a job using deterministic regex rules.

    Returns a dict with:
      role_category, primary_technologies, secondary_technologies,
      skills, confidence_score
    """
    role_category = _extract_role_category(title, description)
    primary, secondary = _extract_technologies(f"{title} {description}")
    skills = _extract_skills(description)

    total_signals = len(primary) + len(secondary) + len(skills)
    confidence = min(1.0, 0.3 + (total_signals * 0.05))
    if role_category != 'Other':
        confidence = min(1.0, confidence + 0.2)

    return {
        'role_category': role_category,
        'primary_technologies': primary,
        'secondary_technologies': secondary,
        'skills': skills,
        'confidence_score': round(confidence, 3),
        'classification_method': 'rules',
    }


# ---------------------------------------------------------------------------
# LLM-based classification
# ---------------------------------------------------------------------------

CLASSIFICATION_PROMPT = """You are a job posting classifier. Analyze the following job posting and return a JSON object with:
- role_category: The primary job role category (e.g. Backend Developer, Data Scientist, DevOps Engineer)
- primary_technologies: Array of up to 5 primary technologies/skills required
- secondary_technologies: Array of secondary technologies mentioned
- skills: Array of specific skills mentioned
- seniority: One of intern, junior, mid, senior, lead, manager, director

Job Title: {title}
Description: {description}

Return ONLY valid JSON, no markdown."""

def classify_with_llm(title: str, description: str) -> Optional[Dict[str, Any]]:
    """Classify a job using an LLM provider (OpenAI, Anthropic, or Groq)."""
    provider = getattr(settings, 'LLM_CLASSIFICATION_PROVIDER', 'none')
    model = getattr(settings, 'LLM_CLASSIFICATION_MODEL', 'gpt-4o-mini')

    if provider == 'none':
        return None

    prompt = CLASSIFICATION_PROMPT.format(title=title, description=description[:3000])

    try:
        if provider == 'openai':
            return _classify_openai(prompt, model)
        elif provider == 'anthropic':
            return _classify_anthropic(prompt, model)
        elif provider == 'groq':
            return _classify_groq(prompt, model)
    except Exception:
        return None
    return None


def _classify_openai(prompt: str, model: str) -> Optional[Dict[str, Any]]:
    """Call OpenAI API for classification."""
    api_key = getattr(settings, 'OPENAI_API_KEY', '')
    if not api_key:
        return None

    import requests
    res = requests.post(
        'https://api.openai.com/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.1,
            'max_tokens': 500,
        },
        timeout=30,
    )
    res.raise_for_status()
    content = res.json()['choices'][0]['message']['content']
    return _parse_llm_response(content)


def _classify_anthropic(prompt: str, model: str) -> Optional[Dict[str, Any]]:
    """Call Anthropic API for classification."""
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return None

    import requests
    res = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        json={
            'model': model,
            'max_tokens': 500,
            'messages': [{'role': 'user', 'content': prompt}],
        },
        timeout=30,
    )
    res.raise_for_status()
    content = res.json()['content'][0]['text']
    return _parse_llm_response(content)


def _classify_groq(prompt: str, model: str) -> Optional[Dict[str, Any]]:
    """Call Groq API for classification."""
    api_key = getattr(settings, 'GROQ_API_KEY', '')
    if not api_key:
        return None

    import requests
    res = requests.post(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.1,
            'max_tokens': 500,
        },
        timeout=30,
    )
    res.raise_for_status()
    content = res.json()['choices'][0]['message']['content']
    return _parse_llm_response(content)


def _parse_llm_response(content: str) -> Optional[Dict[str, Any]]:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    cleaned = content.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```\w*\n?', '', cleaned)
        cleaned = re.sub(r'\n?```$', '', cleaned)
    try:
        data = json.loads(cleaned)
        return {
            'role_category': data.get('role_category', 'Other'),
            'primary_technologies': data.get('primary_technologies', []),
            'secondary_technologies': data.get('secondary_technologies', []),
            'skills': data.get('skills', []),
            'confidence_score': 0.85,
            'classification_method': 'llm',
            'raw_llm_response': data,
        }
    except (json.JSONDecodeError, KeyError):
        return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def classify_job(canonical_job: CanonicalJob) -> JobClassification:
    """
    Classify a canonical job. Uses deterministic rules first,
    falls back to LLM if confidence is below threshold.
    """
    threshold = getattr(settings, 'CLASSIFICATION_CONFIDENCE_THRESHOLD', 0.6)
    title = canonical_job.title or ''
    description = canonical_job.description or ''

    result = classify_deterministically(title, description)

    if result['confidence_score'] < threshold:
        llm_result = classify_with_llm(title, description)
        if llm_result and llm_result.get('confidence_score', 0) > result['confidence_score']:
            result = llm_result

    classification, created = JobClassification.objects.update_or_create(
        canonical_job=canonical_job,
        defaults={
            'role_category': result['role_category'],
            'primary_technologies': result['primary_technologies'],
            'secondary_technologies': result['secondary_technologies'],
            'skills': result['skills'],
            'confidence_score': result['confidence_score'],
            'classification_method': result['classification_method'],
            'raw_llm_response': result.get('raw_llm_response', {}),
        },
    )

    canonical_job.classification_confidence = result['confidence_score']
    canonical_job.save(update_fields=['classification_confidence'])

    return classification
