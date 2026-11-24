from django.contrib.auth.models import Group
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.models import (
    CustomUser,
    Notification,
    NotificationRecipient,
    NotificationRole,
)
from core.roles import EMPLOYEE_ROLE, HR_FOOD_ROLE, VIEWER_ROLE


ALLOWED_TARGET_ROLES = (
    EMPLOYEE_ROLE,
    HR_FOOD_ROLE,
    VIEWER_ROLE,
)


class ManualNotificationSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    message = serializers.CharField(trim_whitespace=True)
    notification_type = serializers.ChoiceField(
        choices=Notification.NotificationType.choices,
        default=Notification.NotificationType.INFO,
    )
    send_to_all = serializers.BooleanField(required=True)
    role_names = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=False,
    )

    def validate(self, attrs):
        send_to_all = attrs["send_to_all"]
        role_names = attrs.get("role_names", [])

        if send_to_all and role_names:
            raise ValidationError({
                "role_names": "Do not specify roles when sending to all users."
            })

        if not send_to_all and not role_names:
            raise ValidationError({
                "role_names": "Select at least one recipient role."
            })

        if len(role_names) != len(set(role_names)):
            raise ValidationError({
                "role_names": "Duplicate roles are not allowed."
            })

        unknown_roles = set(role_names) - set(ALLOWED_TARGET_ROLES)
        if unknown_roles:
            raise ValidationError({
                "role_names": "One or more recipient roles are invalid."
            })

        return attrs


def is_notification_manager(user):
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.groups.filter(name=HR_FOOD_ROLE).exists()
        )
    )


def list_target_roles(user):
    if not user.is_superuser:
        raise PermissionDenied(
            "Only super administrators can select recipient roles."
        )

    return list(
        Group.objects.filter(name__in=ALLOWED_TARGET_ROLES)
        .order_by("name")
        .values("name")
    )


@transaction.atomic
def create_manual_notification(user, payload):
    if not is_notification_manager(user):
        raise PermissionDenied(
            "Only super administrators and hrFood can create notifications."
        )

    allowed_fields = {
        "title",
        "message",
        "notification_type",
        "send_to_all",
        "role_names",
    }

    unexpected = set(payload.keys()) - allowed_fields
    if unexpected:
        raise ValidationError({
            "detail": "Unsupported notification fields were provided."
        })

    # HR cannot choose recipients, even through a forged API request.
    if not user.is_superuser:
        if "role_names" in payload:
            raise PermissionDenied(
                "hrFood cannot select recipient roles."
            )

        if payload.get("send_to_all") is not True:
            raise PermissionDenied(
                "hrFood can only send notifications to all users."
            )

    serializer = ManualNotificationSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    selected_roles = list(data.get("role_names", []))
    groups = list(
        Group.objects.filter(name__in=selected_roles)
    )

    if selected_roles and len(groups) != len(selected_roles):
        raise ValidationError({
            "role_names": "A selected role does not exist."
        })

    notification = Notification.objects.create(
        title=data["title"],
        message=data["message"],
        notification_type=data["notification_type"],
        source=Notification.NotificationSource.MANUAL,
        is_active=True,
        send_to_all=data["send_to_all"],
    )

    if groups:
        NotificationRole.objects.bulk_create([
            NotificationRole(
                notification=notification,
                group=group,
            )
            for group in groups
        ])

    users = CustomUser.objects.filter(is_active=True)

    if not data["send_to_all"]:
        users = users.filter(
            groups__name__in=selected_roles
        ).distinct()

    recipients = [
        NotificationRecipient(
            notification=notification,
            user_id=user_id,
        )
        for user_id in users.values_list("pk", flat=True).iterator(
            chunk_size=500
        )
    ]

    NotificationRecipient.objects.bulk_create(
        recipients,
        batch_size=500,
    )

    return {
        "id": notification.pk,
        "title": notification.title,
        "recipient_count": len(recipients),
        "send_to_all": notification.send_to_all,
        "role_names": selected_roles,
    }
