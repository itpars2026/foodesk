from django.dispatch import receiver

from core.notifications import deactivate_system_notification, publish_system_notification
from food.signals import holiday_changed, holiday_deleted
from food.validators import validate_holiday_notification_payload


@receiver(holiday_changed, dispatch_uid='foodesk_food_holiday_changed_notification')
def notify_holiday_changed(sender, holiday_id, date_label, description, **kwargs):
    validate_holiday_notification_payload(holiday_id=holiday_id, date_label=date_label)

    message = (f'روز {date_label} تعطیل اعلام شده است.\\n{description}').strip()

    publish_system_notification(
        event_key=f'holiday:{holiday_id}',
        title='اطلاعیه تعطیلی',
        message=message,
        send_to_all=True,
    )


@receiver(holiday_deleted, dispatch_uid='foodesk_food_holiday_deleted_notification')
def notify_holiday_deleted(sender, holiday_id, **kwargs):
    if not holiday_id:
        return

    deactivate_system_notification(event_key=f'holiday:{holiday_id}')
