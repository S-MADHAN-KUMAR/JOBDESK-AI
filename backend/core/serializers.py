from django.contrib.auth import get_user_model
from rest_framework import serializers
from datetime import date as dj_date

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
from .models import IngestionRun, IngestionSchedule, JobSource, RawJob
from .services.daily_usage import ensure_daily_usage_counter
from .services.scheduling import calculate_next_run

User = get_user_model()


class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'password']
        extra_kwargs = {'password': {'write_only': True, 'required': False, 'allow_blank': True}}

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if password:
            return User.objects.create_user(password=password, **validated_data)
        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
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
        read_only_fields = ['id', 'role', 'is_active']

    def validate_username(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        qs = User.objects.filter(username__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_email(self, value):
        value = (value or '').strip()
        if value:
            qs = User.objects.filter(email__iexact=value)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('This email is already in use.')
        return value


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError('Password must be at least 8 characters.')
        return value


class JobSourceSerializer(serializers.ModelSerializer):
    auth_config = serializers.JSONField(write_only=True, required=False)
    auth_configured = serializers.SerializerMethodField()

    class Meta:
        model = JobSource
        fields = [
            'id', 'name', 'provider_code', 'is_active', 'base_url',
            'auth_config', 'auth_configured', 'default_params',
            'rate_limit_rpm', 'rate_limit_daily', 'current_daily_uses',
            'credit_usage', 'health_status', 'last_run_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'current_daily_uses', 'credit_usage', 'health_status',
            'last_run_at', 'created_at', 'updated_at',
        ]

    def get_auth_configured(self, obj):
        return obj.has_auth_config()

    def to_representation(self, instance):
        ensure_daily_usage_counter(instance)
        return super().to_representation(instance)

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


class IngestionScheduleSerializer(serializers.ModelSerializer):
    """CamelCase API shape matching the admin ingestion UI."""

    dayOfWeek = serializers.IntegerField(source='day_of_week', required=False, default=1)
    dayOfMonth = serializers.IntegerField(source='day_of_month', required=False, default=1)
    startDate = serializers.DateField(source='start_date', required=False, allow_null=True)
    totalRuns = serializers.IntegerField(source='total_runs', required=False, default=0)
    runsCompleted = serializers.IntegerField(source='runs_completed', read_only=True)
    lastRun = serializers.DateTimeField(source='last_run', read_only=True, allow_null=True)
    lastRunStatus = serializers.CharField(source='last_run_status', read_only=True, allow_blank=True)
    lastError = serializers.CharField(source='last_error', read_only=True, allow_blank=True)
    nextRun = serializers.DateTimeField(source='next_run', read_only=True, allow_null=True)
    max_pages = serializers.CharField(required=False, allow_blank=True, default='5')
    min_salary = serializers.CharField(required=False, allow_blank=True, default='')
    max_salary = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = IngestionSchedule
        fields = [
            'id',
            'source_id',
            'keyword',
            'location',
            'country',
            'max_pages',
            'min_salary',
            'max_salary',
            'employment_type',
            'work_mode',
            'role',
            'posted_within',
            'platforms',
            'apify_platforms',
            'serpapi_platforms',
            'frequency',
            'time',
            'dayOfWeek',
            'dayOfMonth',
            'startDate',
            'totalRuns',
            'runsCompleted',
            'enabled',
            'lastRun',
            'lastRunStatus',
            'lastError',
            'nextRun',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'runsCompleted',
            'lastRun',
            'lastRunStatus',
            'lastError',
            'nextRun',
            'created_at',
            'updated_at',
        ]

    def _to_int(self, value, default=0):
        if value in (None, ''):
            return default
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return default

    def validate_source_id(self, value):
        value = (value or 'all').strip()
        if value == 'all' or value == '':
            return 'all'
        if not JobSource.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Source not found.')
        return value

    def validate_frequency(self, value):
        allowed = {c[0] for c in IngestionSchedule.Frequency.choices}
        if value not in allowed:
            raise serializers.ValidationError('Invalid frequency.')
        return value

    def create(self, validated_data):
        validated_data['max_pages'] = max(1, self._to_int(validated_data.get('max_pages'), 5))
        validated_data['min_salary'] = self._to_int(validated_data.get('min_salary'), 0)
        validated_data['max_salary'] = self._to_int(validated_data.get('max_salary'), 0)
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        if not validated_data.get('start_date'):
            validated_data['start_date'] = dj_date.today()
        instance = IngestionSchedule(**validated_data)
        instance.next_run = calculate_next_run(
            frequency=instance.frequency,
            time_str=instance.time,
            day_of_week=instance.day_of_week,
            day_of_month=instance.day_of_month,
            start_date=instance.start_date,
        )
        instance.save()
        return instance

    def update(self, instance, validated_data):
        if 'max_pages' in validated_data:
            validated_data['max_pages'] = max(1, self._to_int(validated_data.get('max_pages'), 5))
        if 'min_salary' in validated_data:
            validated_data['min_salary'] = self._to_int(validated_data.get('min_salary'), 0)
        if 'max_salary' in validated_data:
            validated_data['max_salary'] = self._to_int(validated_data.get('max_salary'), 0)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        # Recalculate next_run when schedule timing or enabled state changes
        timing_fields = {
            'frequency', 'time', 'day_of_week', 'day_of_month', 'start_date', 'enabled',
        }
        if timing_fields & set(validated_data.keys()):
            if instance.enabled:
                instance.next_run = calculate_next_run(
                    frequency=instance.frequency,
                    time_str=instance.time,
                    day_of_week=instance.day_of_week,
                    day_of_month=instance.day_of_month,
                    start_date=instance.start_date,
                )
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Keep UI string fields for form inputs
        data['max_pages'] = str(instance.max_pages or 5)
        data['min_salary'] = str(instance.min_salary) if instance.min_salary else ''
        data['max_salary'] = str(instance.max_salary) if instance.max_salary else ''
        data['lastRunStatus'] = instance.last_run_status or None
        data['lastError'] = instance.last_error or None
        return data
