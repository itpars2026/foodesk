from django import forms

from typing import ClassVar


class JalaliDatePickerWidget(forms.TextInput):
    class Media:
        css: ClassVar[dict[str, tuple[str, ...]]] = {
            'all': ('food/admin/jalali-datepicker-v2.css',),
        }
        js = ('food/admin/jalali-datepicker.js',)

    def __init__(self, attrs=None):
        defaults = {
            'class': 'foodesk-jalali-date',
            'placeholder': '1405/09/05',
            'autocomplete': 'off',
            'dir': 'ltr',
            'inputmode': 'numeric',
        }
        defaults.update(attrs or {})
        super().__init__(attrs=defaults)
