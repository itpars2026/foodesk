from django.db import transaction
from django.utils import timezone

from core.models import CustomUser, Notification, NotificationRecipient
from core.validators import (
    validate_manual_notification,
    validate_notification_expiration,
    validate_notification_target_roles,
    validate_notification_recipients,
)


def get_notifaction(notification_id:int) -> Notification:
    return Notification.objects.select_for_update().get(pk=notification_id)

@transaction.atomic
def publish_manual_notification(notification_id: int) -> int:
    notification = get_notifaction(notification_id)

    # Guard clauses
    validate_manual_notification(notification.source)
    validate_notification_expiration(notification.expires_at)

    validate_notification_target_roles(
        send_to_all=notification.send_to_all,
        has_target_roles=notification.target_roles.exists(),
    )

    # Resolve recipients
    if notification.send_to_all:
        users = CustomUser.objects.filter(is_active=True)

    else:
        group_ids = notification.target_roles.values_list('group_id', flat=True)
        users = CustomUser.objects.filter(is_active=True, groups__id__in=group_ids).distinct()

    user_ids = list(users.values_list('pk', flat=True))

    validate_notification_recipients(bool(user_ids))

    # Happy path
    NotificationRecipient.objects.bulk_create(
        [
            NotificationRecipient(
                notification=notification,
                user_id=user_id,
            )
            for user_id in user_ids
        ],
        ignore_conflicts=True,
        batch_size=500,
    )

    notification.is_active = True
    notification.save(
        update_fields=[
            'is_active',
            'datetime_modified',
        ],
    )

    return len(user_ids)


@transaction.atomic
def deactivate_notification(notification_id: int) -> None:
    notification = get_notifaction(notification_id)
    
    # Guard clause
    validate_manual_notification(notification.source)

    # Happy path
    notification.is_active = False
    notification.save(
        update_fields=[
            'is_active',
            'datetime_modified',
        ],
    )
