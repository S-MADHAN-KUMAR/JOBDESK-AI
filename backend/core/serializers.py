from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import JobSource, RawJob

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