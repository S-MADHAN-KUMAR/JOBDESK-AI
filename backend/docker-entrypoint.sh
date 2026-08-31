#!/bin/sh
set -eu

wait_for_deps() {
  i=0
  while [ "$i" -lt 30 ]; do
    if python -c "
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.db import connection
connection.ensure_connection()
from django.core.cache import cache
cache.set('_boot', '1', 5)
" ; then
      return 0
    fi
    i=$((i + 1))
    echo "Waiting for Neon/Redis... ($i/30)"
    sleep 2
  done
  echo "Database or Redis is not ready."
  exit 1
}

case "${1:-api}" in
  api)
    wait_for_deps
    python manage.py migrate --noinput
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-3}" \
      --timeout 120
    ;;
  worker)
    wait_for_deps
    exec celery -A config worker -l info --concurrency "${CELERY_CONCURRENCY:-2}"
    ;;
  beat)
    wait_for_deps
    exec celery -A config beat -l info \
      --schedule "${CELERY_BEAT_SCHEDULE_FILENAME:-/tmp/celerybeat-schedule}"
    ;;
  *)
    exec "$@"
    ;;
esac
