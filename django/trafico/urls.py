from django.urls import path
from . import views

urlpatterns = [
    path('', views.mapa_trafico, name='mapa_trafico'),
    path('api/estado/', views.api_estado_trafico, name='api_estado_trafico'),
    path('api/eta/', views.api_eta, name='api_eta'),
    path('api/procesar/', views.api_procesar, name='api_procesar'),
    path('api/historial/<int:tramo_id>/', views.api_historial_tramo, name='api_historial_tramo'),
]