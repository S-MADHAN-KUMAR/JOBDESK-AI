from django.contrib.auth import get_user_model
from rest_framework import serializers

from .ingestion_models import (
    CanonicalJob,
    EmployerHiringScore,
    JobClassification,
    JobDemandMovement,
    JobSnapshot,
    JobSourceRecord,
    MasterCompany,
    MasterJobRole,
    MasterLocation,
    MasterSkill,
    MasterTechnology,
)
from .models import IngestionRun, JobSource, RawJob

User = get_user_model()


class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active']


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)


class JobSourceSerializer(serializers.ModelSerializer):
    auth_config = serializers.JSONField(write_only=True, required=False)
    auth_configured = serializers.SerializerMethodField()

    class Meta:
        model = JobSource
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
        source = JobSource(**validated_data)
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


class RawJobSerializer(serializers.ModelSerializer):
    """FR-005: Market Analyst job explorer — exposes raw-to-normalized records."""

    class Meta:
        model = RawJob
        fields = [
            'id', 'ingestion_run', 'provider_code', 'external_id',
            'url', 'title', 'company', 'location', 'description',
            'raw_payload', 'fetched_at',
        ]


# ---------------------------------------------------------------------------
# Ingestion pipeline serializers
# ---------------------------------------------------------------------------

class IngestionRunSerializer(serializers.ModelSerializer):
    provider_code = serializers.CharField(source='provider.provider_code', read_only=True)

    class Meta:
        model = IngestionRun
        fields = [
            'id', 'provider', 'provider_code', 'status', 'started_at',
            'ended_at', 'fetched_count', 'error_count', 'error_logs',
            'created_at',
        ]


class CanonicalJobSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, default='')
    location_text = serializers.CharField(source='location.normalized', read_only=True, default='')

    class Meta:
        model = CanonicalJob
        fields = [
            'id', 'canonical_url', 'title', 'normalized_title',
            'company_name_raw', 'company_name', 'company',
            'location_raw', 'location_text', 'location',
            'description', 'work_mode', 'employment_type',
            'seniority', 'experience_text', 'salary_text',
            'posted_date', 'first_seen', 'last_seen',
            'status', 'classification_confidence',
            'created_at', 'updated_at',
        ]


class JobSourceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobSourceRecord
        fields = [
            'id', 'canonical_job', 'raw_job', 'provider_code',
            'external_id', 'url', 'dedup_match_type', 'created_at',
        ]


class JobClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobClassification
        fields = [
            'id', 'canonical_job', 'role_category',
            'primary_technologies', 'secondary_technologies',
            'skills', 'confidence_score', 'classification_method',
            'raw_llm_response', 'created_at', 'updated_at',
        ]


class JobSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobSnapshot
        fields = ['id', 'canonical_job', 'snapshot_date', 'is_active', 'source_count', 'created_at']


class JobDemandMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobDemandMovement
        fields = [
            'id', 'role_category', 'period_days', 'period_start', 'period_end',
            'active_jobs_start', 'active_jobs_end', 'new_postings',
            'expired_postings', 'net_change', 'change_percentage', 'created_at',
        ]


class EmployerHiringScoreSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = EmployerHiringScore
        fields = [
            'id', 'company', 'company_name', 'period_start', 'period_end',
            'total_postings', 'active_postings', 'unique_roles',
            'hiring_score', 'created_at',
        ]


# ---------------------------------------------------------------------------
# Master data / Taxonomy serializers
# ---------------------------------------------------------------------------

class MasterCompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterCompany
        fields = [
            'id', 'name', 'normalized_name', 'domain', 'location',
            'logo_url', 'website', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'normalized_name', 'created_at', 'updated_at']

    def validate_name(self, value):
        return value.strip()

    def create(self, validated_data):
        name = validated_data.get('name', '')
        validated_data['normalized_name'] = name.strip().lower()
        return super().create(validated_data)


class MasterLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterLocation
        fields = ['id', 'raw_text', 'city', 'state', 'country', 'normalized', 'created_at']
        read_only_fields = ['id', 'normalized', 'created_at']


class MasterJobRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterJobRole
        fields = ['id', 'name', 'category', 'created_at']
        read_only_fields = ['id', 'created_at']


class MasterTechnologySerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterTechnology
        fields = ['id', 'name', 'category', 'created_at']
        read_only_fields = ['id', 'created_at']


class MasterSkillSerializer(serializers.ModelSerializer):
    technology_name = serializers.CharField(source='technology.name', read_only=True, default='')

    class Meta:
        model = MasterSkill
        fields = ['id', 'name', 'technology', 'technology_name', 'created_at']
        read_only_fields = ['id', 'created_at']