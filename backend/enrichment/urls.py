from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CompanyViewSet,
    ContactViewSet,
    EnrichmentRunView,
    EnrichmentSourceViewSet,
    PhonePollView,
)

router = DefaultRouter()
router.register(r'enrichment/sources', EnrichmentSourceViewSet, basename='enrichment-sources')
router.register(r'enrichment/companies', CompanyViewSet, basename='enrichment-companies')
router.register(r'enrichment/contacts', ContactViewSet, basename='enrichment-contacts')

urlpatterns = [
    path('api/enrichment/run/', EnrichmentRunView.as_view(), name='enrichment-run'),
    path('api/enrichment/poll-phones/', PhonePollView.as_view(), name='enrichment-poll-phones'),
    path('api/', include(router.urls)),
]