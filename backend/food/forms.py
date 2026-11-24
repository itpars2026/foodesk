from django import forms
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile

from datetime import date
from typing import ClassVar

from food.jalali import format_jalali_date, parse_jalali_date
from food.models import Drink, Food, Holiday, Side
from food.services import prepare_catalog_image
from food.widgets import JalaliDatePickerWidget


class CatalogImageAdminForm(forms.ModelForm):
    def clean_image(self):
        image = self.cleaned_data.get('image')

        if not image:
            return image

        # Only process newly uploaded files.
        if not isinstance(image, UploadedFile):
            return image

        try:
            return prepare_catalog_image(image)
        except ValidationError as exc:
            raise forms.ValidationError(exc.messages) from exc


class FoodAdminForm(CatalogImageAdminForm):
    class Meta:
        model = Food
        fields = ('name', 'image', 'price', 'container_price')


class SideAdminForm(CatalogImageAdminForm):
    class Meta:
        model = Side
        fields = ('name', 'image', 'price')


class DrinkAdminForm(CatalogImageAdminForm):
    class Meta:
        model = Drink
        fields = ('name', 'image', 'price')


class JalaliDateField(forms.DateField):
    def prepare_value(self, value):
        if isinstance(value, date):
            return format_jalali_date(value)
        return value

    def to_python(self, value):
        if value in self.empty_values:
            return None

        if isinstance(value, date):
            return value

        try:
            return parse_jalali_date(str(value))

        except (ValueError, TypeError) as exc:
            raise forms.ValidationError(
                'تاریخ شمسی معتبر وارد کنید. مثال: 1405/09/05',
                code='invalid',
            ) from exc


class HolidayAdminForm(forms.ModelForm):
    date = JalaliDateField(
        label='تاریخ تعطیلی',
        widget=JalaliDatePickerWidget(),
    )

    class Meta:
        model = Holiday
        fields = ('date', 'description')
        labels: ClassVar[dict[str, str]] = {
            'description': 'عنوان تعطیلی',
        }
