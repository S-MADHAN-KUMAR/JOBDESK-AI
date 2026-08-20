from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import IngestionRun, JobSource, RawJob, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_active')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        ('Role', {'fields': ('role',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Role', {'fields': ('role',)}),
    )


@admin.register(JobSource)
class JobSourceAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'provider_code', 'is_active', 'health_status',
        'rate_limit_rpm', 'current_daily_uses', 'rate_limit_daily',
    )
    list_filter = ('is_active', 'health_status')
    search_fields = ('name', 'provider_code')


@admin.register(IngestionRun)
class IngestionRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'provider', 'status', 'started_at', 'ended_at', 'fetched_count', 'error_count')
    list_filter = ('status', 'provider')
    search_fields = ('provider__name', 'provider__provider_code')


@admin.register(RawJob)
class RawJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'ingestion_run', 'provider_code', 'external_id', 'title', 'company', 'fetched_at')
    list_filter = ('provider_code',)
    search_fields = ('external_id', 'title', 'company')