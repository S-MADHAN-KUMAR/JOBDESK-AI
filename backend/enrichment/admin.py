from django.contrib import admin

from .models import Company, Contact, EnrichmentRun, EnrichmentSource


@admin.register(EnrichmentSource)
class EnrichmentSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'provider_code', 'is_active', 'health_status', 'last_run_at')
    list_filter = ('is_active', 'health_status', 'provider_code')
    search_fields = ('name', 'provider_code')


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'domain', 'location', 'created_at')
    search_fields = ('name', 'domain')


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'job_title', 'email', 'company', 'provider_source', 'verification_state')
    list_filter = ('provider_source', 'verification_state')
    search_fields = ('full_name', 'email', 'company__name')


@admin.register(EnrichmentRun)
class EnrichmentRunAdmin(admin.ModelAdmin):
    list_display = ('company', 'status', 'contacts_found', 'stored_count', 'started_at')
    list_filter = ('status',)