from __future__ import annotations

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError
from django.utils import timezone

from typing import TYPE_CHECKING

from datetime import datetime
from PIL import Image, UnidentifiedImageError

if TYPE_CHECKING:
    from core.models import Building, Department

MAX_BRAND_IMAGE_SIZE = 2 * 1024 * 1024
MAX_BRAND_IMAGE_PIXELS = 4_000_000
ALLOWED_BRAND_IMAGE_FORMATS = frozenset({'PNG', 'JPEG', 'WEBP'})


def validate_national_id(value: str) -> str:
    national_id = str(value).strip()

    if len(national_id) != 10 or not national_id.isascii() or not national_id.isdecimal():
        raise ValidationError({'national_id': 'National ID must contain exactly 10 digits.'})

    return national_id


def validate_reference_number(value: str, *, field_name: str, max_length: int, allow_blank: bool = False) -> str:
    if not isinstance(value, str):
        raise ValidationError({field_name: 'Number must be a string.'})

    number = value.strip()

    if not number and not allow_blank:
        raise ValidationError({field_name: 'This field is required.'})

    if len(number) > max_length:
        raise ValidationError({field_name: f'Number must be at most {max_length} characters.'})

    return number


def validate_building_number(value: str, *, allow_blank: bool = False) -> Building | None:
    number = validate_reference_number(value, field_name='building_number', max_length=5, allow_blank=allow_blank)

    if not number:
        return None

    from core.models import Building

    building = Building.objects.filter(number=number).first()

    if building is None:
        raise ValidationError({'building_number': 'Building does not exist.'})

    if not building.is_active:
        raise ValidationError({'building_number': 'Building is inactive.'})

    return building


def validate_department_number(value: str, *, allow_blank: bool = False) -> Department | None:
    number = validate_reference_number(value, field_name='department_number', max_length=3, allow_blank=allow_blank)

    if not number:
        return None

    from core.models import Department

    department = Department.objects.filter(number=number).first()

    if department is None:
        raise ValidationError({'department_number': 'Department does not exist.'})

    if not department.is_active:
        raise ValidationError({'department_number': 'Department is inactive.'})

    return department


def normalize_personnel_number(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValidationError({'personnel_number': 'Personnel number is required.'})
    return normalized


def validate_new_password(value: str, user) -> str:
    if value == user.username:
        raise ValidationError({'new_password': 'The new password cannot be the personnel number.'})

    try:
        password_validation.validate_password(value, user)
    except ValidationError as exc:
        raise ValidationError({'new_password': list(exc.messages)}) from exc

    return value


def validate_brand_image(uploaded_file):
    if uploaded_file.size <= 0 or uploaded_file.size > MAX_BRAND_IMAGE_SIZE:
        raise ValidationError('حجم تصویر باید بین 1 بایت و 2 مگابایت باشد.')

    original_position = uploaded_file.tell()

    try:
        uploaded_file.seek(0)

        with Image.open(uploaded_file) as image:
            if image.format not in ALLOWED_BRAND_IMAGE_FORMATS:
                raise ValidationError('فقط PNG، JPEG و WebP مجاز هستند.')

            width, height = image.size

            if width <= 0 or height <= 0 or width * height > MAX_BRAND_IMAGE_PIXELS:
                raise ValidationError('ابعاد تصویر مجاز نیست.')

            image.verify()

    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValidationError('فایل تصویر معتبر نیست.') from exc

    finally:
        uploaded_file.seek(original_position)

def validate_manual_notification(source: str) -> None:
    if source == 'manual':
        return

    raise ValidationError('اعلان سیستمی از این بخش قابل انتشار نیست.')


def validate_notification_expiration(expires_at: datetime | None) -> None:
    if expires_at is None:
        return

    if expires_at > timezone.now():
        return

    raise ValidationError('تاریخ انقضای اعلان گذشته است.')


def validate_notification_target_roles(send_to_all: bool,has_target_roles: bool) -> None:
    if send_to_all:
        return

    if has_target_roles:
        return

    raise ValidationError('حداقل یک نقش دریافت‌کننده انتخاب کنید.')


def validate_notification_recipients(has_recipients: bool) -> None:
    if has_recipients:
        return

    raise ValidationError('هیچ کاربر فعالی برای دریافت اعلان یافت نشد.')

def validate_system_notification_payload(
    *,
    event_key: str,
    title: str,
    message: str,
    send_to_all: bool,
    group_names: tuple[str, ...],
) -> None:

    if not isinstance(event_key, str) or not event_key.strip():
        raise ValidationError('کلید رویداد الزامی است.')

    if len(event_key) > 150:
        raise ValidationError('کلید رویداد بیش از حد طولانی است.')

    if not isinstance(title, str) or not title.strip():
        raise ValidationError('عنوان اعلان الزامی است.')

    if len(title) > 200:
        raise ValidationError('عنوان اعلان بیش از حد طولانی است.')

    if not isinstance(message, str) or not message.strip():
        raise ValidationError('متن اعلان الزامی است.')

    if send_to_all:
        return

    if group_names:
        return

    raise ValidationError('برای اعلان غیرعمومی باید حداقل یک نقش انتخاب شود.')
