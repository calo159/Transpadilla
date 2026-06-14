from django.db import models


class BusGPS(models.Model):
    """
    Modelo NO administrado: lee directamente de la tabla 'buses'
    que ya existe en la base de datos de TRANSPADILLA (creada por Drizzle).
    Solo se usa para LEER posiciones GPS, nunca para escribir.
    """
    placa = models.CharField(max_length=20)
    estado = models.CharField(max_length=20)
    lat = models.FloatField(null=True)
    lng = models.FloatField(null=True)
    velocidad = models.FloatField(null=True)
    ruta_id = models.IntegerField(null=True)
    actualizado = models.DateTimeField(null=True)

    class Meta:
        managed = False
        db_table = 'buses'

    def __str__(self):
        return self.placa


# ----------------------------------------------------------------
# Modelos NO administrados que leen las tablas de TRANSPADILLA
# (rutas, paradas, ruta_paradas) creadas por Drizzle. Se usan para
# generar los tramos de tráfico dinámicamente a partir de las rutas.
# ----------------------------------------------------------------
class RutaTP(models.Model):
    nombre = models.CharField(max_length=100)
    color = models.CharField(max_length=20)
    activa = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'rutas'


class ParadaTP(models.Model):
    nombre = models.CharField(max_length=100)
    latitud = models.FloatField()
    longitud = models.FloatField()

    class Meta:
        managed = False
        db_table = 'paradas'


class RutaParadaTP(models.Model):
    ruta_id = models.IntegerField()
    parada_id = models.IntegerField()
    orden = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'ruta_paradas'


class TramoVia(models.Model):
    """
    Un tramo de vía monitoreado (segmento entre dos paradas consecutivas
    de una ruta). Se genera/sincroniza automáticamente desde las rutas y
    paradas que el administrador crea en el panel (ver sincronizar_tramos).
    """
    nombre = models.CharField(max_length=150)
    lat_inicio = models.FloatField()
    lng_inicio = models.FloatField()
    lat_fin = models.FloatField()
    lng_fin = models.FloatField()
    radio_deteccion_metros = models.FloatField(default=150)
    # Vínculo con la ruta de TRANSPADILLA que originó el tramo
    ruta_id = models.IntegerField(null=True)
    ruta_nombre = models.CharField(max_length=100, blank=True, default="")
    ruta_color = models.CharField(max_length=20, blank=True, default="#3498db")
    parada_inicio_id = models.IntegerField(null=True)
    parada_fin_id = models.IntegerField(null=True)

    class Meta:
        db_table = 'trafico_tramo_via'
        # Un tramo único por par de paradas dentro de una ruta
        unique_together = ('ruta_id', 'parada_inicio_id', 'parada_fin_id')

    def __str__(self):
        return self.nombre


class LecturaVelocidad(models.Model):
    """
    Cada vez que un bus pasa por un tramo, se registra su velocidad.
    Estas lecturas alimentan el cálculo del promedio móvil de 10 minutos.
    """
    tramo = models.ForeignKey(TramoVia, on_delete=models.CASCADE, related_name='lecturas')
    bus_placa = models.CharField(max_length=20)
    velocidad = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trafico_lectura_velocidad'
        indexes = [
            models.Index(fields=['tramo', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.tramo.nombre} — {self.bus_placa} — {self.velocidad} km/h"


ESTADO_CHOICES = [
    ('fluido', 'Fluido'),
    ('lento', 'Lento'),
    ('detenido', 'Detenido'),
    ('sin_datos', 'Sin datos'),
]


class EstadoTrafico(models.Model):
    """
    Estado calculado actual de cada tramo, basado en el promedio
    de velocidad de los últimos 10 minutos.
    """
    tramo = models.OneToOneField(TramoVia, on_delete=models.CASCADE, related_name='estado_actual')
    velocidad_promedio = models.FloatField(default=0)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='sin_datos')
    muestras = models.IntegerField(default=0)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'trafico_estado_actual'

    def __str__(self):
        return f"{self.tramo.nombre}: {self.estado} ({self.velocidad_promedio:.1f} km/h)"