# ── Microservicio de tráfico (Django + Gunicorn) ─────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# Dependencias del sistema para psycopg2.
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY django/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY django/ .

# Variables por defecto (se sobreescriben en docker-compose).
ENV DJANGO_DEBUG=False
EXPOSE 8000

# Al arrancar: aplica migraciones y levanta gunicorn. collectstatic se ejecuta
# en build no es necesario aquí (la API no sirve estáticos críticos).
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn trafico_config.wsgi:application --bind 0.0.0.0:8000"]
