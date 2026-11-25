from django.db import transaction
from django.utils import timezone

from core.models import CustomUser, Notification, NotificationRecipient
from core.validators import (
    validate_manual_notification,
    validate_notification_expiration,
    validate_notification_recipients,
    validate_notification_target_roles,
    validate_system_notification_payload,
)


def get_notification(notification_id: int) -> Notification:
    return Notification.objects.select_for_update().get(pk=notification_id)


def create_recipients(notification: Notification, users) -> None:
    NotificationRecipient.objects.bulk_create(
        (
            NotificationRecipient(
                notification=notification,
                user_id=user_id,
            )
            for user_id in users.values_list('pk', flat=True)
        ),
        ignore_conflicts=True,
        batch_size=500,
    )


@transaction.atomic
def publish_manual_notification(notification_id: int) -> int:
    notification = get_notification(notification_id)

    # Guard clauses
    validate_manual_notification(notification.source)
    validate_notification_expiration(notification.expires_at)
    validate_notification_target_roles(
        send_to_all=notification.send_to_all,
        has_target_roles=notification.target_roles.exists(),
    )

    users = CustomUser.objects.filter(is_active=True)

    if not notification.send_to_all:
        group_ids = notification.target_roles.values_list('group_id', flat=True)
        users = users.filter(groups__id__in=group_ids).distinct()

    user_count = users.count()
    validate_notification_recipients(user_count > 0)

    # Happy path
    create_recipients(notification, users)

    if not notification.is_active:
        notification.is_active = True
        notification.save(
            update_fields=['is_active', 'datetime_modified'],
        )

    return user_count


@transaction.atomic
def deactivate_notification(notification_id: int) -> None:
    notification = get_notification(notification_id)

    # Guard clauses
    validate_manual_notification(notification.source)

    if not notification.is_active:
        return

    # Happy path
    notification.is_active = False
    notification.save(update_fields=['is_active', 'datetime_modified'])


@transaction.atomic
def publish_system_notification(
    *,
    event_key: str,
    title: str,
    message: str,
    send_to_all: bool = True,
    group_names: tuple[str, ...] = (),
    notification_type: str = Notification.NotificationType.INFO,
) -> Notification:

    # Guard clauses
    validate_system_notification_payload(
        event_key=event_key,
        title=title,
        message=message,
        send_to_all=send_to_all,
        group_names=group_names,
    )

    now = timezone.now()

    defaults = {
        'title': title,
        'message': message,
        'source': Notification.NotificationSource.SYSTEM,
        'notification_type': notification_type,
        'send_to_all': send_to_all,
        'is_active': True,
        'starts_at': now,
        'expires_at': None,
    }

    # Happy path
    notification, created = Notification.objects.select_for_update().get_or_create(
        event_key=event_key,
        defaults=defaults,
    )

    if not created:
        if notification.source != Notification.NotificationSource.SYSTEM:
            from django.core.exceptions import ValidationError

            raise ValidationError('کلید رویداد متعلق به اعلان سیستمی نیست.')

        updated_fields = []

        notification_fields = (
            'title',
            'message',
            'notification_type',
            'send_to_all',
            'is_active',
            'expires_at',
        )

        for field in notification_fields:
            value = defaults[field]

            if getattr(notification, field) == value:
                continue

            setattr(notification, field, value)
            updated_fields.append(field)

        if updated_fields:
            notification.starts_at = now
            updated_fields.extend(
                [
                    'starts_at',
                    'datetime_modified',
                ]
            )

            notification.save(update_fields=updated_fields)

            NotificationRecipient.objects.filter(
                notification=notification,
            ).update(
                read_at=None,
                datetime_modified=now,
            )

    users = CustomUser.objects.filter(is_active=True)

    if not send_to_all:
        users = users.filter(groups__name__in=group_names).distinct()

    create_recipients(notification, users)

    return notification


@transaction.atomic
def deactivate_system_notification(event_key: str) -> None:
    # Guard clause
    if not isinstance(event_key, str) or not event_key.strip():
        return

    # Happy path
    Notification.objects.filter(
        event_key=event_key,
        source=Notification.NotificationSource.SYSTEM,
        is_active=True,
    ).update(
        is_active=False,
        datetime_modified=timezone.now(),
    )
