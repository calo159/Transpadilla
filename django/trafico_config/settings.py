"""
Django settings for trafico_config project.
"""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-yzz*_u3aw6pyakk12qa4b8@ej(t0@phyyb4mw_)r0u2!v*_$t&'

DEBUG = True

ALLOWED_HOSTS = ['*']

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


def _cargar_database_url():
    """Obtiene DATABASE_URL del entorno; si no está, la lee del .env de la raíz del repo."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    # El .env vive en la raíz del monorepo (dos niveles arriba de este archivo)
    env_path = BASE_DIR.parent / ".env"
    if env_path.exists():
        for linea in env_path.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea.startswith("DATABASE_URL="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    return "postgresql://postgres:postgres@localhost:5432/transpadilla"


DATABASE_URL = _cargar_database_url()

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

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'