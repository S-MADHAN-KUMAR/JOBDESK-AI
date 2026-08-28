from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CompanyViewSet,
    ContactViewSet,
    EnrichmentRunViewSet,
    EnrichmentRunView,
    EnrichmentSourceViewSet,
    PhonePollView,
    bulk_delete_enrichment_runs,
    bulk_delete_enrichment_sources,
)

router = DefaultRouter()
router.register(r'enrichment/sources', EnrichmentSourceViewSet, basename='enrichment-sources')
router.register(r'enrichment/companies', CompanyViewSet, basename='enrichment-companies')
router.register(r'enrichment/contacts', ContactViewSet, basename='enrichment-contacts')
router.register(r'enrichment/runs', EnrichmentRunViewSet, basename='enrichment-runs')

urlpatterns = [
    path('api/enrichment/run/', EnrichmentRunView.as_view(), name='enrichment-run'),
    path('api/enrichment/poll-phones/', PhonePollView.as_view(), name='enrichment-poll-phones'),
    path('api/enrichment/bulk-delete-runs/', bulk_delete_enrichment_runs, name='enrichment-bulk-delete-runs'),
    path('api/enrichment/bulk-delete-sources/', bulk_delete_enrichment_sources, name='enrichment-bulk-delete-sources'),
    path('api/', include(router.urls)),
]