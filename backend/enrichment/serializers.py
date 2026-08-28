from rest_framework import serializers

from .models import Company, Contact, EnrichmentRun, EnrichmentSource


class EnrichmentSourceSerializer(serializers.ModelSerializer):
    auth_config = serializers.JSONField(write_only=True, required=False)
    auth_configured = serializers.SerializerMethodField()

    class Meta:
        model = EnrichmentSource
        fields = [
            'id', 'name', 'provider_code', 'is_active', 'base_url',
            'auth_config', 'auth_configured', 'default_params',
            'rate_limit_rpm', 'rate_limit_daily', 'current_daily_uses',
            'health_status', 'last_run_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'current_daily_uses', 'health_status',
            'last_run_at', 'created_at', 'updated_at',
        ]

    def get_auth_configured(self, obj):
        return obj.has_auth_config()

    def create(self, validated_data):
        auth_config = validated_data.pop('auth_config', None)
        source = EnrichmentSource(**validated_data)
        if auth_config is not None:
            source.set_auth_config(auth_config)
        source.save()
        return source

    def update(self, instance, validated_data):
        auth_config = validated_data.pop('auth_config', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if auth_config is not None:
            instance.set_auth_config(auth_config)
        instance.save()
        return instance


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['id', 'name', 'domain', 'location', 'created_at', 'updated_at']


class ContactSerializer(serializers.ModelSerializer):
    """FR-022: Enriched contact with provenance for the Market Analyst UI."""

    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Contact
        fields = [
            'id', 'company', 'company_name', 'full_name', 'job_title',
            'email', 'phone', 'linkedin_url', 'provider_source',
            'verification_state', 'confidence_score', 'last_verified_at',
            'raw_payload', 'created_at',
        ]


class EnrichmentRunSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = EnrichmentRun
        fields = [
            'id', 'company', 'company_name', 'status', 'providers_used',
            'contacts_found', 'stored_count', 'error_count',
            'started_at', 'ended_at',
        ]