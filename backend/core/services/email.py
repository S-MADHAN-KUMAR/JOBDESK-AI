"""Transactional email helpers. Prefer Resend when RESEND_API_KEY is set."""

from __future__ import annotations

import html
import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)


def frontend_url(path: str) -> str:
    base = (getattr(settings, 'FRONTEND_URL', None) or 'http://localhost:3000').rstrip('/')
    if not path.startswith('/'):
        path = f'/{path}'
    return f'{base}{path}'


def _send_via_resend(*, subject: str, text: str, to: str) -> None:
    import resend

    api_key = getattr(settings, 'RESEND_API_KEY', '') or ''
    if not api_key:
        raise RuntimeError('RESEND_API_KEY is not configured')

    resend.api_key = api_key
    safe_text = html.escape(text).replace('\n', '<br>\n')
    resend.Emails.send({
        'from': settings.DEFAULT_FROM_EMAIL,
        'to': [to],
        'subject': subject,
        'text': text,
        'html': f'<p>{safe_text}</p>',
    })


def send_email(*, subject: str, body: str, to: str) -> None:
    """Send one transactional email (Resend → SMTP/console fallback)."""
    if not to:
        raise ValueError('Recipient email is required')

    if getattr(settings, 'RESEND_API_KEY', ''):
        _send_via_resend(subject=subject, text=body, to=to)
        logger.info('Sent email via Resend to %s (%s)', to, subject)
        return

    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)


def send_password_link(user, *, invite: bool = False) -> None:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = frontend_url(f'/reset-password?uid={uid}&token={token}')
    if invite:
        subject = 'You have been invited to DemandAccel AI'
        body = (
            f'Hi {user.first_name or user.username},\n\n'
            f'An administrator created a DemandAccel account for you.\n'
            f'Set your password here (link expires after use):\n{link}\n'
        )
    else:
        subject = 'Reset your DemandAccel password'
        body = (
            f'Hi {user.first_name or user.username},\n\n'
            f'We received a password reset request. If this was you, open:\n{link}\n\n'
            f'If you did not request this, you can ignore this email.\n'
        )
    send_email(subject=subject, body=body, to=user.email)
