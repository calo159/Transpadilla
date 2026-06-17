"""
Django settings for trafico_config project.
"""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# DEBUG: activo por defecto en local. En producción Render fija DJANGO_DEBUG=False.
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() == "true"

# SECRET_KEY: en producción (DEBUG=False) es OBLIGATORIO vía DJANGO_SECRET_KEY; si
# falta, se aborta el arranque. En desarrollo se usa un valor por defecto inseguro.
_secret = os.environ.get("DJANGO_SECRET_KEY")
if not DEBUG and not _secret:
    raise RuntimeError(
        "DJANGO_SECRET_KEY es obligatorio en producción (DEBUG=False)."
    )
SECRET_KEY = _secret or "django-insecure-solo-para-desarrollo-local-no-usar-en-produccion"

# ALLOWED_HOSTS: lista separada por comas vía DJANGO_ALLOWED_HOSTS.
# Por defecto '*' para no romper el desarrollo local.
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",") if h.strip()
]

# CSRF_TRUSTED_ORIGINS: necesario en producción si se usa el admin de Django.
_csrf = os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "")
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf.split(",") if o.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'trafico',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise sirve los archivos estáticos en producción (admin de Django).
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'trafico_config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'trafico_config.wsgi.application'

# ----------------------------------------------------------------
# Database — conexión a la misma base PostgreSQL de TRANSPADILLA
# (solo lectura sobre la tabla de buses; modelos propios de tráfico
# se manejan con app_label distinto para no chocar con Drizzle)
# ----------------------------------------------------------------
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Cargar las variables sensibles desde el .env de la raíz del repo (python-dotenv).
# No sobreescribe variables que ya estén definidas en el entorno del sistema.
load_dotenv(BASE_DIR.parent / ".env")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/transpadilla",
)

_p = urlparse(DATABASE_URL)
_query = parse_qs(_p.query)
# sslmode: usar el de la URL si viene, si no 'prefer' (local no exige SSL)
_sslmode = _query.get("sslmode", ["prefer"])[0]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': (_p.path or "/transpadilla").lstrip("/"),
        'USER': _p.username or "postgres",
        'PASSWORD': _p.password or "",
        'HOST': _p.hostname or "localhost",
        'PORT': str(_p.port or 5432),
        'OPTIONS': {'sslmode': _sslmode},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es'
TIME_ZONE = 'America/Bogota'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Seguridad en producción ──────────────────────────────────────────────────
# Render termina TLS en su proxy; este header permite a Django saber que la
# petición original llegó por HTTPS.
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True