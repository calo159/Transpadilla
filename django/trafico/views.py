from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import TramoVia, EstadoTrafico, LecturaVelocidad
from .traffic_service import procesar_gps_buses, recalcular_estados


def mapa_trafico(request):
    """Vista principal: mapa con los tramos coloreados según el tráfico."""
    return render(request, 'trafico/mapa.html')


@api_view(['GET'])
def api_estado_trafico(request):
    """
    Devuelve el estado actual de todos los tramos de vía,
    incluyendo coordenadas para dibujarlos en el mapa.
    """
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