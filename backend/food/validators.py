from django.core.exceptions import ValidationError

from PIL import Image, UnidentifiedImageError

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MiB
MAX_IMAGE_PIXELS = 20_000_000

ALLOWED_IMAGE_FORMATS = frozenset(
    {
        'JPEG',
        'PNG',
        'WEBP',
    }
)


def validate_image_size(uploaded_file) -> None:
    """Validate image size before decoding."""

    if uploaded_file is None:
        raise ValidationError('فایل تصویر انتخاب نشده است.')

    if uploaded_file.size == 0:
        raise ValidationError('فایل تصویر خالی است.')

    if uploaded_file.size > MAX_IMAGE_SIZE:
        raise ValidationError('حجم تصویر نباید بیشتر از 10 مگابایت باشد.')


def validate_image_format(image: Image.Image) -> None:
    """Check the actual image format, not its extension."""

    if image.format not in ALLOWED_IMAGE_FORMATS:
        raise ValidationError('فقط تصاویر JPEG، PNG و WebP مجاز هستند.')


def validate_image_dimensions(image: Image.Image) -> None:
    """Reject images containing too many pixels."""

    width, height = image.size

    if width <= 0 or height <= 0:
        raise ValidationError('ابعاد تصویر معتبر نیست.')

    if width * height > MAX_IMAGE_PIXELS:
        raise ValidationError('تعداد پیکسل‌های تصویر بیش از حد مجاز است.')


def validate_catalog_image(uploaded_file) -> None:
    """Validate the actual content of an uploaded image."""

    validate_image_size(uploaded_file)

    try:
        original_position = uploaded_file.tell()
        uploaded_file.seek(0)

        with Image.open(uploaded_file) as image:
            validate_image_format(image)
            validate_image_dimensions(image)
            image.load()

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValidationError('فایل انتخاب‌شده تصویر معتبر و قابل پردازشی نیست.') from exc

    finally:
        uploaded_file.seek(original_position)

def validate_holiday_id(holiday_id: int) -> None:
    if isinstance(holiday_id, bool):
        raise ValidationError('شناسه تعطیلی نامعتبر است.')

    if not isinstance(holiday_id, int) or holiday_id <= 0:
        raise ValidationError('شناسه تعطیلی نامعتبر است.')

def validate_holiday_notification_payload(holiday_id: int, date_label: str) -> None:
    validate_holiday_id(holiday_id)

    if not isinstance(date_label, str) or not date_label.strip():
        raise ValidationError('تاریخ تعطیلی الزامی است.')
