from django import forms

from core.models import Notification


class NotificationAdminForm(forms.ModelForm):
    class Meta:
        model = Notification
        fields = (
            'title',
            'message',
            'notification_type',
            'send_to_all',
            'starts_at',
            'expires_at',
        )

    def clean(self):
        cleaned_data = super().clean()

        starts_at = cleaned_data.get('starts_at')
        expires_at = cleaned_data.get('expires_at')

        if starts_at and expires_at and expires_at <= starts_at:
            raise forms.ValidationError('تاریخ انقضا باید بعد از شروع نمایش باشد.')

        return cleaned_data
