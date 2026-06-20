from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    TramoVia, EstadoTrafico, LecturaVelocidad,
    BusGPS, ParadaTP, RutaParadaTP,
)
from .traffic_service import (
    procesar_gps_buses, recalcular_estados, sincronizar_tramos, haversine_metros,
)


def mapa_trafico(request):
    """Vista principal: mapa con los tramos coloreados según el tráfico."""
    return render(request, 'trafico/mapa.html')


@api_view(['GET'])
def api_estado_trafico(request):
    """
    Devuelve el estado actual de todos los tramos de vía,
    incluyendo coordenadas para dibujarlos en el mapa.

    Sincroniza primero los tramos con las rutas/paradas actuales, de modo que
    siempre reflejen las rutas que el administrador tiene configuradas.
    """
    sincronizar_tramos()

    tramos = TramoVia.objects.select_related('estado_actual').all()
    data = []
    for tramo in tramos:
        try:
            estado_obj = tramo.estado_actual
            estado = estado_obj.estado
            velocidad_promedio = estado_obj.velocidad_promedio
            muestras = estado_obj.muestras
            actualizado = estado_obj.actualizado
        except EstadoTrafico.DoesNotExist:
            estado = 'sin_datos'
            velocidad_promedio = 0
            muestras = 0
            actualizado = None

        data.append({
            "id": tramo.id,
            "nombre": tramo.nombre,
            "lat_inicio": tramo.lat_inicio,
            "lng_inicio": tramo.lng_inicio,
            "lat_fin": tramo.lat_fin,
            "lng_fin": tramo.lng_fin,
            "estado": estado,
            "velocidad_promedio": velocidad_promedio,
            "muestras": muestras,
            "actualizado": actualizado,
            "ruta_id": tramo.ruta_id,
            "ruta_nombre": tramo.ruta_nombre,
            "ruta_color": tramo.ruta_color,
        })

    return Response({"tramos": data})


@api_view(['POST'])
def api_procesar(request):
    """
    Procesa el GPS actual de los buses y recalcula el tráfico.
    Se puede llamar periódicamente (cron / scheduler) o manualmente.
    """
    resumen = procesar_gps_buses()
    return Response(resumen)


def _velocidad_efectiva(v):
    """Velocidad en km/h para estimar el ETA. Si el bus está detenido o sin
    dato, usamos una velocidad urbana promedio para no dividir por cero."""
    if not v or v < 5:
        return 18.0
    return v


@api_view(['GET'])
def api_eta(request):
    """
    Estima el tiempo de llegada (ETA) del próximo bus a cada parada de una ruta.

    Algoritmo (Python):
      1. Tomar las paradas de la ruta en orden y la distancia acumulada entre
         ellas (Haversine).
      2. Para cada bus activo de la ruta, ubicar su parada más cercana (posición
         aproximada en la secuencia).
      3. Para cada parada futura, ETA = distancia restante ÷ velocidad efectiva.
      4. Por parada, devolver el bus que llega más pronto.
    """
    try:
        ruta_id = int(request.GET.get('ruta_id'))
    except (TypeError, ValueError):
        return Response({"error": "ruta_id requerido"}, status=400)

    enlaces = list(RutaParadaTP.objects.filter(ruta_id=ruta_id).order_by('orden'))
    paradas_map = {p.id: p for p in ParadaTP.objects.all()}
    secuencia = [paradas_map[e.parada_id] for e in enlaces if e.parada_id in paradas_map]
    if not secuencia:
        return Response({"ruta_id": ruta_id, "paradas": []})

    # Distancia acumulada (metros) a lo largo de la ruta hasta cada parada
    acum = [0.0]
    for i in range(1, len(secuencia)):
        d = haversine_metros(
            secuencia[i - 1].latitud, secuencia[i - 1].longitud,
            secuencia[i].latitud, secuencia[i].longitud,
        )
        acum.append(acum[-1] + d)

    buses = BusGPS.objects.filter(
        estado='activo', ruta_id=ruta_id, lat__isnull=False, lng__isnull=False,
    )

    buses_info = []
    for b in buses:
        idx = min(
            range(len(secuencia)),
            key=lambda i: haversine_metros(b.lat, b.lng, secuencia[i].latitud, secuencia[i].longitud),
        )
        buses_info.append((b, idx, _velocidad_efectiva(b.velocidad)))

    resultado = []
    for j, parada in enumerate(secuencia):
        mejor = None  # (eta_min, placa)
        for (b, idx, vel) in buses_info:
            if idx <= j:  # el bus aún no ha pasado esta parada
                dist_km = (acum[j] - acum[idx]) / 1000.0
                eta = dist_km / vel * 60.0
                if mejor is None or eta < mejor[0]:
                    mejor = (eta, b.placa)
        resultado.append({
            "parada_id": parada.id,
            "nombre": parada.nombre,
            "eta_min": round(mejor[0]) if mejor else None,
            "placa": mejor[1] if mejor else None,
        })

    return Response({
        "ruta_id": ruta_id,
        "buses_activos": len(buses_info),
        "paradas": resultado,
    })


@api_view(['GET'])
def api_historial_tramo(request, tramo_id):
    """Devuelve las últimas lecturas de velocidad de un tramo específico."""
    lecturas = LecturaVelocidad.objects.filter(
        tramo_id=tramo_id
    ).order_by('-timestamp')[:50]

    data = [
        {
            "bus_placa": l.bus_placa,
            "velocidad": l.velocidad,
            "timestamp": l.timestamp.isoformat(),
        }
        for l in lecturas
    ]
    return Response({"tramo_id": tramo_id, "lecturas": data})