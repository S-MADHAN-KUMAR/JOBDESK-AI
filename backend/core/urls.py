from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    AdminUserViewSet,
    JobExplorerViewSet,
    JobSourceViewSet,
    LogoutView,
    ProfileView,
)

router = DefaultRouter()
router.register(r'admin/users', AdminUserViewSet, basename='admin-users')
router.register(r'admin/sources', JobSourceViewSet, basename='admin-sources')
router.register(r'jobs', JobExplorerViewSet, basename='jobs')

urlpatterns = [
    # FR-001 Authentication Endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='token_logout'),
    path('api/auth/profile/', ProfileView.as_view(), name='user_profile'),

    # Admin User Control Endpoint
    path('api/', include(router.urls)),

    # Contact Enrichment (SRS Section 7)
    path('', include('enrichment.urls')),
]