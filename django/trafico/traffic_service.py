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

from .models import (
    BusGPS, TramoVia, LecturaVelocidad, EstadoTrafico,
    RutaTP, ParadaTP, RutaParadaTP,
)

VENTANA_MINUTOS = 10

UMBRAL_FLUIDO = 25   # >= 25 km/h
UMBRAL_LENTO = 8     # 8-24 km/h ; < 8 km/h = detenido


def sincronizar_tramos():
    """
    Genera/actualiza/elimina los tramos de tráfico a partir de las rutas y
    paradas reales de TRANSPADILLA. Cada par de paradas consecutivas (según
    el orden de ruta_paradas) de cada ruta activa se convierte en un TramoVia.

    Así, cuando el admin crea o edita rutas/paradas en el panel, los tramos de
    tráfico se mantienen sincronizados automáticamente.

    Retorna el número de tramos vigentes tras la sincronización.
    """
    paradas = {p.id: p for p in ParadaTP.objects.all()}
    claves_vigentes = set()

    for ruta in RutaTP.objects.filter(activa=True):
        enlaces = list(
            RutaParadaTP.objects.filter(ruta_id=ruta.id).order_by('orden')
        )
        for i in range(len(enlaces) - 1):
            p_ini = paradas.get(enlaces[i].parada_id)
            p_fin = paradas.get(enlaces[i + 1].parada_id)
            if not p_ini or not p_fin:
                continue

            clave = (ruta.id, p_ini.id, p_fin.id)
            claves_vigentes.add(clave)

            TramoVia.objects.update_or_create(
                ruta_id=ruta.id,
                parada_inicio_id=p_ini.id,
                parada_fin_id=p_fin.id,
                defaults={
                    'nombre': f"{ruta.nombre}: {p_ini.nombre} - {p_fin.nombre}",
                    'lat_inicio': p_ini.latitud,
                    'lng_inicio': p_ini.longitud,
                    'lat_fin': p_fin.latitud,
                    'lng_fin': p_fin.longitud,
                    'ruta_nombre': ruta.nombre,
                    'ruta_color': ruta.color,
                },
            )

    # Eliminar tramos que ya no corresponden a ninguna ruta/par vigente
    for tramo in TramoVia.objects.all():
        if (tramo.ruta_id, tramo.parada_inicio_id, tramo.parada_fin_id) not in claves_vigentes:
            tramo.delete()

    return len(claves_vigentes)


def haversine_metros(lat1, lng1, lat2, lng2):
    """Distancia en metros entre dos coordenadas GPS."""
    R = 6371000  # radio de la Tierra en metros
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def _distancia_punto_segmento_metros(lat, lng, lat1, lng1, lat2, lng2):
    """
    Distancia (en metros) de un punto al segmento [inicio, fin].
    Proyecta el punto sobre el segmento usando una aproximación plana
    (válida a escala urbana), corrigiendo la longitud por la latitud.
    """
    lat_ref = radians((lat1 + lat2) / 2)
    m_por_grado_lat = 111320.0
    m_por_grado_lng = 111320.0 * cos(lat_ref)

    # Coordenadas locales en metros respecto al inicio del segmento
    px = (lng - lng1) * m_por_grado_lng
    py = (lat - lat1) * m_por_grado_lat
    bx = (lng2 - lng1) * m_por_grado_lng
    by = (lat2 - lat1) * m_por_grado_lat

    long2 = bx * bx + by * by
    if long2 == 0:
        return sqrt(px * px + py * py)
    # Parámetro de proyección, recortado al segmento [0, 1]
    t = max(0.0, min(1.0, (px * bx + py * by) / long2))
    cx = bx * t
    cy = by * t
    return sqrt((px - cx) ** 2 + (py - cy) ** 2)


def punto_cerca_de_tramo(lat, lng, tramo: TramoVia) -> bool:
    """
    Verifica si un punto GPS está cerca del tramo de vía, midiendo la
    distancia del punto al segmento completo (no solo al punto medio),
    para que funcione bien con tramos largos entre paradas.
    """
    distancia = _distancia_punto_segmento_metros(
        lat, lng,
        tramo.lat_inicio, tramo.lng_inicio,
        tramo.lat_fin, tramo.lng_fin,
    )
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
    # Mantener los tramos sincronizados con las rutas/paradas actuales
    sincronizar_tramos()

    ahora = timezone.now()

    # Buses que están en recorrido ahora mismo (el conductor controla el
    # estado activo/inactivo al iniciar/finalizar). No se filtra por la marca
    # de tiempo `actualizado` porque esa columna la escribe el api-server (Node)
    # como timestamp sin zona horaria y compararla aquí causaría desfases.
    buses_activos = BusGPS.objects.filter(
        estado='activo',
        lat__isnull=False,
        lng__isnull=False,
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