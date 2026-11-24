from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from food.jalali import format_jalali_date
from food.models import Holiday
from food.signals import holiday_changed, holiday_deleted


@receiver(
    post_save,
    sender=Holiday,
    dispatch_uid='foodesk_holiday_post_save',
)
def emit_holiday_changed(sender, instance, using, **kwargs):
    holiday_id = instance.pk

    def publish_event():
        holiday = Holiday.objects.using(using).filter(
            pk=holiday_id,
        ).first()

        if holiday is None:
            return

        holiday_changed.send(
            sender=Holiday,
            holiday_id=holiday.pk,
            date_label=format_jalali_date(holiday.date),
            description=holiday.description,
        )

    transaction.on_commit(publish_event, using=using)


@receiver(
    post_delete,
    sender=Holiday,
    dispatch_uid='foodesk_holiday_post_delete',
)
def emit_holiday_deleted(sender, instance, using, **kwargs):
    holiday_id = instance.pk

    def publish_event():
        # A subsequent recreation is handled as its own event.
        holiday_deleted.send(
            sender=Holiday,
            holiday_id=holiday_id,
        )

    transaction.on_commit(publish_event, using=using)
