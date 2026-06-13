"""
Servicio de clasificación de tráfico.

Lógica:
1. Cada bus reporta su posición (lat, lng, velocidad) en la tabla `buses`.
2. Para cada tramo de vía, verificamos si algún bus está dentro del radio
   de detección del tramo.
3. Si está, registramos una LecturaVelocidad.
4. Calculamos el promedio de velocidad de los últimos 10 minutos para ese tramo.
5. Clasificamos:
     >= 25 km/h  -> fluido
     8-24 km/h   -> lento
     < 8 km/h    -> detenido
     sin lecturas recientes -> sin_datos
"""
from datetime import timedelta
from django.utils import timezone
from django.db.models import Avg
from math import radians, cos, sin, asin, sqrt

from .models import BusGPS, TramoVia, LecturaVelocidad, EstadoTrafico

VENTANA_MINUTOS = 10

UMBRAL_FLUIDO = 25   # >= 25 km/h
UMBRAL_LENTO = 8     # 8-24 km/h ; < 8 km/h = detenido


def haversine_metros(lat1, lng1, lat2, lng2):
    """Distancia en metros entre dos coordenadas GPS."""
    R = 6371000  # radio de la Tierra en metros
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def punto_cerca_de_tramo(lat, lng, tramo: TramoVia) -> bool:
    """
    Verifica si un punto GPS está cerca del tramo de vía,
    comparando contra el punto medio del tramo (aproximación simple).
    """
    mid_lat = (tramo.lat_inicio + tramo.lat_fin) / 2
    mid_lng = (tramo.lng_inicio + tramo.lng_fin) / 2
    distancia = haversine_metros(lat, lng, mid_lat, mid_lng)
    return distancia <= tramo.radio_deteccion_metros


def clasificar_velocidad(velocidad_promedio: float, muestras: int) -> str:
    if muestras == 0:
        return 'sin_datos'
    if velocidad_promedio >= UMBRAL_FLUIDO:
        return 'fluido'
    if velocidad_promedio >= UMBRAL_LENTO:
        return 'lento'
    return 'detenido'


def procesar_gps_buses():
    """
    Tarea principal: lee la posición actual de todos los buses activos,
    registra lecturas de velocidad para los tramos cercanos, y recalcula
    el estado de tráfico de cada tramo.

    Retorna un resumen de lo procesado (útil para la API/endpoint manual).
    """
    ahora = timezone.now()
    hace_5_min = ahora - timedelta(minutes=5)

    buses_activos = BusGPS.objects.filter(
        estado='activo',
        lat__isnull=False,
        lng__isnull=False,
        actualizado__gte=hace_5_min,
    )

    tramos = TramoVia.objects.all()
    lecturas_creadas = 0

    for bus in buses_activos:
        if bus.velocidad is None:
            continue
        for tramo in tramos:
            if punto_cerca_de_tramo(bus.lat, bus.lng, tramo):
                LecturaVelocidad.objects.create(
                    tramo=tramo,
                    bus_placa=bus.placa,
                    velocidad=bus.velocidad,
                )
                lecturas_creadas += 1

    tramos_actualizados = recalcular_estados()

    return {
        "buses_procesados": buses_activos.count(),
        "lecturas_creadas": lecturas_creadas,
        "tramos_actualizados": tramos_actualizados,
        "timestamp": ahora.isoformat(),
    }


def recalcular_estados():
    """
    Recalcula el estado de cada tramo basándose en el promedio de
    velocidad de las lecturas dentro de la ventana de 10 minutos.
    """
    ahora = timezone.now()
    desde = ahora - timedelta(minutes=VENTANA_MINUTOS)

    actualizados = 0
    for tramo in TramoVia.objects.all():
        lecturas = LecturaVelocidad.objects.filter(
            tramo=tramo,
            timestamp__gte=desde,
        )
        agregado = lecturas.aggregate(promedio=Avg('velocidad'))
        promedio = agregado['promedio'] or 0
        muestras = lecturas.count()
        estado = clasificar_velocidad(promedio, muestras)

        EstadoTrafico.objects.update_or_create(
            tramo=tramo,
            defaults={
                'velocidad_promedio': round(promedio, 2),
                'estado': estado,
                'muestras': muestras,
            },
        )
        actualizados += 1

    return actualizados