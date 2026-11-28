from rest_framework import serializers

from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, Permission
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q

from core.models import Building, CustomUser, Department, NotificationRecipient, Profile
from core.roles import ASSIGNABLE_PERMISSIONS, ROLE_NAMES
from core.services import create_employee, update_employee, update_profile_preferences
from core.validators import validate_new_password


def convert_validation_error(exc: DjangoValidationError) -> serializers.ValidationError:
    errors = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages
    if isinstance(errors, dict) and 'username' in errors:
        errors['personnel_number'] = errors.pop('username')
    return serializers.ValidationError(errors)


class SessionUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            'id',
            'username',
            'first_name',
            'last_name',
            'is_active',
            'is_superuser',
            'must_change_password',
            'roles',
            'permissions',
        )
        read_only_fields = fields

    def get_roles(self, user: CustomUser) -> list[str]:
        return list(user.groups.order_by('name').values_list('name', flat=True))

    def get_permissions(self, user: CustomUser) -> list[str]:
        if not user.is_active:
            return []
        return sorted(user.get_all_permissions())


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['username'],
            password=attrs['password'],
        )
        if user is None:
            raise serializers.ValidationError({'non_field_errors': ['نام کاربری یا رمز عبور اشتباه است.']})
        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password_confirm = serializers.CharField(
        trim_whitespace=False,
        write_only=True,
    )

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['old_password']):
            raise serializers.ValidationError({'old_password': 'The current password is incorrect.'})
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'The two password values do not match.'})
        try:
            validate_new_password(attrs['new_password'], user)
        except DjangoValidationError as exc:
            raise convert_validation_error(exc) from exc
        return attrs


class EmployeeSerializer(serializers.ModelSerializer):
    personnel_number = serializers.CharField(source='profile.personnel_number')
    building_number = serializers.CharField(source='profile.building.number', read_only=True, allow_null=True)
    department_number = serializers.CharField(source='profile.department.number', read_only=True, allow_null=True)

    class Meta:
        model = CustomUser
        fields = (
            'id',
            'personnel_number',
            'first_name',
            'last_name',
            'building_number',
            'department_number',
            'is_active',
            'must_change_password',
        )
        read_only_fields = fields


class EmployeeCreateSerializer(serializers.Serializer):
    personnel_number = serializers.CharField(max_length=32)
    national_id = serializers.CharField(
        min_length=10,
        max_length=10,
        write_only=True,
        trim_whitespace=True,
    )
    building_number = serializers.CharField(max_length=5)
    department_number = serializers.CharField(max_length=3)
    is_active = serializers.BooleanField(default=True)

    def create(self, validated_data):
        try:
            return create_employee(**validated_data)
        except DjangoValidationError as exc:
            raise convert_validation_error(exc) from exc

    def to_representation(self, instance):
        return EmployeeSerializer(instance, context=self.context).data


class EmployeeUpdateSerializer(serializers.Serializer):
    personnel_number = serializers.CharField(max_length=32, required=False)
    building_number = serializers.CharField(max_length=32, required=False)
    department_number = serializers.CharField(max_length=32, required=False)
    is_active = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        try:
            return update_employee(instance, **validated_data)
        except DjangoValidationError as exc:
            raise convert_validation_error(exc) from exc

    def to_representation(self, instance):
        return EmployeeSerializer(instance, context=self.context).data


class ProfileSerializer(serializers.ModelSerializer):
    building_number = serializers.CharField(source='building.number', read_only=True, allow_null=True)
    department_number = serializers.CharField(source='department.number', read_only=True, allow_null=True)

    building = serializers.PrimaryKeyRelatedField(
        queryset=Building.objects.filter(is_active=True),
        required=False,
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
    )

    class Meta:
        model = Profile
        fields = (
            'personnel_number',
            'building',
            'building_number',
            'department',
            'department_number',
        )
        read_only_fields = (
            'personnel_number',
            'building_number',
            'department_number',
        )

    def update(self, instance, validated_data):
        try:
            return update_profile_preferences(
                instance.user,
                **validated_data,
            )
        except DjangoValidationError as exc:
            raise convert_validation_error(exc) from exc


class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='notification_id', read_only=True)
    title = serializers.CharField(source='notification.title', read_only=True)

    message = serializers.CharField(source='notification.message', read_only=True)
    notification_type = serializers.CharField(source='notification.notification_type', read_only=True)

    starts_at = serializers.DateTimeField(source='notification.starts_at', read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = NotificationRecipient
        fields = (
            'id',
            'title',
            'message',
            'notification_type',
            'starts_at',
            'read_at',
            'is_read',
        )
        read_only_fields = fields

    def get_is_read(self, obj):
        return obj.read_at is not None


class MonthlySubsidyUpdateSerializer(serializers.Serializer):
    jalali_year = serializers.IntegerField(min_value=1)
    jalali_month = serializers.IntegerField(min_value=1, max_value=12)
    receive_subsidy = serializers.BooleanField()

    def create(self, validated_data):
        from django.core.exceptions import ValidationError as DjangoValidationError

        from core.subsidy import set_monthly_subsidy

        try:
            return set_monthly_subsidy(
                self.context['profile'],
                year=validated_data['jalali_year'],
                month=validated_data['jalali_month'],
                receive_subsidy=validated_data['receive_subsidy'],
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'detail': exc.messages}) from exc


class GroupSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.filter(
            Q(
                content_type__app_label='core',
                codename__in=ASSIGNABLE_PERMISSIONS['core'],
            )
            | Q(
                content_type__app_label='food',
                codename__in=ASSIGNABLE_PERMISSIONS['food'],
            )
        ),
        many=True,
        required=False,
    )
    is_system = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = (
            'id',
            'name',
            'permissions',
            'is_system',
        )
        read_only_fields = ('id', 'is_system')

    def get_is_system(self, obj) -> bool:
        return obj.name in ROLE_NAMES

    def validate_name(self, value):
        name = value.strip()

        if not name:
            raise serializers.ValidationError('Group name cannot be empty.')

        if name.casefold() in {role.casefold() for role in ROLE_NAMES} and (
            self.instance is None or self.instance.name != name
        ):
            raise serializers.ValidationError('System group names are reserved.')

        if self.instance and self.instance.name in ROLE_NAMES and name != self.instance.name:
            raise serializers.ValidationError('System groups cannot be renamed.')

        existing = Group.objects.filter(name__iexact=name)

        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)

        if existing.exists():
            raise serializers.ValidationError('A group with this name already exists.')

        return name
