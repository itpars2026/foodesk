from django.contrib import admin

from unfold.admin import ModelAdmin
from unfold.contrib.filters.admin import AutocompleteSelectFilter

from food.forms import DrinkAdminForm, FoodAdminForm, SideAdminForm
from food.models import Drink, Food, Menu, MenuCategory, Reservation, Side


@admin.register(Food)
class FoodAdmin(ModelAdmin):
    list_display = ('name', 'price', 'container_price', 'total_price', 'datetime_modified')
    search_fields = ('name',)
    readonly_fields = ('total_price', 'datetime_created', 'datetime_modified')
    form = FoodAdminForm


@admin.register(Side)
class SideAdmin(ModelAdmin):
    list_display = ('name', 'price', 'datetime_modified')
    search_fields = ('name',)
    readonly_fields = ('datetime_created', 'datetime_modified')
    form = SideAdminForm


@admin.register(Drink)
class DrinkAdmin(ModelAdmin):
    list_display = ('name', 'price', 'datetime_modified')
    search_fields = ('name',)
    readonly_fields = ('datetime_created', 'datetime_modified')
    form = DrinkAdminForm


@admin.register(MenuCategory)
class MenuCategoryAdmin(ModelAdmin):
    list_display = ('name', 'slug', 'sort_order', 'is_active')
    list_editable = ('sort_order', 'is_active')
    search_fields = ('name', 'slug')
    readonly_fields = ('datetime_created', 'datetime_modified')


@admin.register(Menu)
class MenuAdmin(ModelAdmin):
    list_display = ('date', 'category', 'food', 'food_price', 'status', 'datetime_modified')
    list_filter = ('category', 'status', 'date')
    search_fields = ('food__name',)
    autocomplete_fields = ('food', 'category')
    readonly_fields = ('datetime_created', 'datetime_modified')


@admin.register(Reservation)
class ReservationAdmin(ModelAdmin):
    list_display = (
        'id',
        'user',
        'menu',
        'menu_date',
        'status',
        'datetime_created',
    )

    list_display_links = ('id', 'user')

    list_filter = (
        ('user', AutocompleteSelectFilter),
        'status',
        'menu__date',
    )

    search_fields = ('user__username',)

    ordering = ('-menu__date', '-id')

    list_select_related = ('user', 'menu')

    readonly_fields = (
        'datetime_created',
        'datetime_modified',
    )

    @admin.display(description='تاریخ غذا', ordering='menu__date')
    def menu_date(self, obj):
        return obj.menu.date

    def has_delete_permission(self, request, obj=None):
        return False
