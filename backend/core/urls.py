from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .admin_views import (
    CanonicalJobViewSet,
    MasterCompanyViewSet,
    MasterJobRoleViewSet,
    MasterLocationViewSet,
    MasterSkillViewSet,
    MasterTechnologyViewSet,
    IngestionRunViewSet,
    bulk_delete_canonical_jobs,
    bulk_delete_ingestion_runs,
    confidence_monitoring,
    data_quality_metrics,
    demand_movements,
    employer_scores,
    llm_config,
    pipeline_health,
    purge_all_ingestion_data,
    raw_vs_normalized,
    trigger_manual_run,
    trigger_snapshot,
    update_llm_config,
    ceo_executive_summary,
    ceo_demand_movements,
    ceo_skill_summary,
    demand_trends,
    job_traceability,
    skill_matrix,
    emerging_skills,
    recurring_hiring,
    employer_scores_view,
    dashboard_overview,
    market_alerts,
    ceo_daily_brief,
    demand_scores,
    company_detail,
    training_recommendations,
)
from .views import (
    AdminUserViewSet,
    JobExplorerViewSet,
    JobSourceViewSet,
    LogoutView,
    PasswordChangeView,
    ProfileView,
)

router = DefaultRouter()
router.register(r'admin/users', AdminUserViewSet, basename='admin-users')
router.register(r'admin/sources', JobSourceViewSet, basename='admin-sources')
router.register(r'jobs', JobExplorerViewSet, basename='jobs')

# Ingestion pipeline admin
router.register(r'admin/ingestion-runs', IngestionRunViewSet, basename='admin-ingestion-runs')
router.register(r'admin/canonical-jobs', CanonicalJobViewSet, basename='admin-canonical-jobs')
router.register(r'admin/master-companies', MasterCompanyViewSet, basename='admin-master-companies')
router.register(r'admin/master-locations', MasterLocationViewSet, basename='admin-master-locations')
router.register(r'admin/master-roles', MasterJobRoleViewSet, basename='admin-master-roles')
router.register(r'admin/master-technologies', MasterTechnologyViewSet, basename='admin-master-technologies')
router.register(r'admin/master-skills', MasterSkillViewSet, basename='admin-master-skills')

urlpatterns = [
    # FR-001 Authentication Endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='token_logout'),
    path('api/auth/profile/', ProfileView.as_view(), name='user_profile'),
    path('api/auth/password/', PasswordChangeView.as_view(), name='password_change'),

    # Admin User Control Endpoint
    path('api/', include(router.urls)),

    # Ingestion pipeline admin endpoints
    path('api/admin/ingestion/trigger/', trigger_manual_run, name='admin-trigger-run'),
    path('api/admin/ingestion/pipeline-health/', pipeline_health, name='admin-pipeline-health'),
    path('api/admin/ingestion/data-quality/', data_quality_metrics, name='admin-data-quality'),
    path('api/admin/ingestion/confidence/', confidence_monitoring, name='admin-confidence'),
    path('api/admin/ingestion/raw-vs-normalized/<uuid:canonical_job_id>/', raw_vs_normalized, name='admin-raw-vs-normalized'),
    path('api/admin/ingestion/demand-movements/', demand_movements, name='admin-demand-movements'),
    path('api/admin/ingestion/trigger-snapshot/', trigger_snapshot, name='admin-trigger-snapshot'),
    path('api/admin/ingestion/employer-scores/', employer_scores, name='admin-employer-scores'),
    path('api/admin/ingestion/bulk-delete-runs/', bulk_delete_ingestion_runs, name='admin-bulk-delete-runs'),
    path('api/admin/ingestion/bulk-delete-canonicals/', bulk_delete_canonical_jobs, name='admin-bulk-delete-canonicals'),
    path('api/admin/ingestion/purge-all/', purge_all_ingestion_data, name='admin-purge-all'),

    # LLM Configuration
    path('api/admin/llm-config/', llm_config, name='admin-llm-config'),
    path('api/admin/llm-config/update/', update_llm_config, name='admin-llm-config-update'),

    # CEO / Management Intelligence
    path('api/ceo/executive-summary/', ceo_executive_summary, name='ceo-executive-summary'),
    path('api/ceo/demand-movements/', ceo_demand_movements, name='ceo-demand-movements'),
    path('api/ceo/skill-summary/', ceo_skill_summary, name='ceo-skill-summary'),

    # Market Analyst - Trend Engine
    path('api/analyst/trends/', demand_trends, name='analyst-trends'),
    path('api/analyst/job-traceability/<uuid:job_id>/', job_traceability, name='analyst-job-traceability'),

    # Training Manager - Skill Matrix
    path('api/training/skill-matrix/', skill_matrix, name='training-skill-matrix'),
    path('api/training/emerging-skills/', emerging_skills, name='training-emerging-skills'),

    # Recruitment Team - Employer Intelligence
    path('api/recruitment/recurring-hiring/', recurring_hiring, name='recruitment-recurring-hiring'),
    path('api/recruitment/employer-scores/', employer_scores_view, name='recruitment-employer-scores'),
    path('api/recruitment/companies/<uuid:company_id>/', company_detail, name='recruitment-company-detail'),

    # Shared dashboard / alerts
    path('api/dashboard/overview/', dashboard_overview, name='dashboard-overview'),
    path('api/alerts/', market_alerts, name='market-alerts'),

    # CEO daily brief
    path('api/ceo/daily-brief/', ceo_daily_brief, name='ceo-daily-brief'),

    # Analyst demand scores
    path('api/analyst/demand-scores/', demand_scores, name='analyst-demand-scores'),

    # Training recommendations
    path('api/training/recommendations/', training_recommendations, name='training-recommendations'),

    # Contact Enrichment (SRS Section 7)
    path('', include('enrichment.urls')),
]
