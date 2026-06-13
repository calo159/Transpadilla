"""
Comando para sembrar tramos de vías principales de Riohacha.
Uso: python manage.py seed_tramos
"""
from django.core.management.base import BaseCommand
from trafico.models import TramoVia


TRAMOS_RIOHACHA = [
    {
        "nombre": "Av. La Marina (frente al malecón)",
        "lat_inicio": 11.5460, "lng_inicio": -72.9120,
        "lat_fin": 11.5510, "lng_fin": -72.9170,
    },
    {
        "nombre": "Calle 1ra — Centro histórico",
        "lat_inicio": 11.5430, "lng_inicio": -72.9080,
        "lat_fin": 11.5460, "lng_fin": -72.9050,
    },
    {
        "nombre": "Av. El Progreso",
        "lat_inicio": 11.5390, "lng_inicio": -72.9120,
        "lat_fin": 11.5420, "lng_fin": -72.9070,
    },
    {
        "nombre": "Carrera 7ma — hacia Hospital",
        "lat_inicio": 11.5444, "lng_inicio": -72.9072,
        "lat_fin": 11.5490, "lng_fin": -72.9100,
    },
    {
        "nombre": "Vía Aeropuerto Almirante Padilla",
        "lat_inicio": 11.5350, "lng_inicio": -72.9150,
        "lat_fin": 11.5250, "lng_fin": -72.9260,
    },
    {
        "nombre": "Calle hacia Barrio La Esperanza",
        "lat_inicio": 11.5444, "lng_inicio": -72.9072,
        "lat_fin": 11.5580, "lng_fin": -72.8990,
    },
    {
        "nombre": "Terminal de Transporte — entrada",
        "lat_inicio": 11.5320, "lng_inicio": -72.9030,
        "lat_fin": 11.5350, "lng_fin": -72.9050,
    },
]


class Command(BaseCommand):
    help = "Crea los tramos de vías principales de Riohacha para el monitoreo de tráfico"

    def handle(self, *args, **options):
        creados = 0
        for tramo_data in TRAMOS_RIOHACHA:
            _, created = TramoVia.objects.get_or_create(
                nombre=tramo_data["nombre"],
                defaults=tramo_data,
            )
            if created:
                creados += 1

        self.stdout.write(self.style.SUCCESS(
            f"Listo. {creados} tramos nuevos creados, {len(TRAMOS_RIOHACHA) - creados} ya existían."
        ))