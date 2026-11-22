"""Daily reservation workbook: detail, procurement and building delivery."""

from collections import defaultdict
from io import BytesIO

from django.db.models import Prefetch
from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from food.jalali import format_jalali_date
from food.models import Drink, Reservation, ReservationItem, Side

PERSIAN_WEEKDAYS = ('دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه', 'یکشنبه')


def safe_label(value):
    """Make database-sourced text safe when saved as an Excel value."""
    text = str(value or '')
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def key_sort(value):
    text = str(value or '')
    if text.isdecimal():
        return (0, int(text), text)
    return (1, text)


def quantities(item, kind):
    """Use versioned reservation children, with a legacy single-selection fallback."""
    if kind == 'side':
        entries = item.side_items.all()
        legacy = (item.side_id, item.side.name if item.side_id else '', item.side_quantity)
        name_attr = 'side'
    else:
        entries = item.drink_items.all()
        legacy = (item.drink_id, item.drink.name if item.drink_id else '', item.drink_quantity)
        name_attr = 'drink'

    amounts = defaultdict(int)
    if entries:
        for entry in entries:
            amounts[getattr(entry, name_attr).name] += entry.quantity
    elif legacy[0] and legacy[2] > 0:
        amounts[legacy[1]] += legacy[2]
    return amounts


def format_sheet(sheet, text_columns=()):
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'A2'
    sheet.auto_filter.ref = sheet.dimensions
    sheet.row_dimensions[1].height = 30
    for cell in sheet[1]:
        cell.fill = PatternFill('solid', fgColor='176477')
        cell.font = Font(bold=True, color='FFFFFF')
        cell.alignment = Alignment(horizontal='center', vertical='center')
    for column_index, cells in enumerate(sheet.columns, start=1):
        label = str(cells[0].value or '')
        width = min(42, max(16, len(label) + 5))
        sheet.column_dimensions[get_column_letter(column_index)].width = width
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(horizontal='right', vertical='center')
            if cell.column in text_columns:
                cell.number_format = '@'
                cell.data_type = 's'
            elif isinstance(cell.value, int):
                cell.number_format = '#,##0'


def export_daily_excel(start_date, end_date):
    """All catalog item names become columns: sides first, drinks second."""
    sides = list(Side.objects.order_by('pk').values_list('name', flat=True).distinct())
    drinks = list(Drink.objects.order_by('pk').values_list('name', flat=True).distinct())
    # Distinct by display name even on databases where name is not unique.
    sides = list(dict.fromkeys(sides))
    drinks = list(dict.fromkeys(drinks))
    current_items = (
        ReservationItem.objects.filter(is_current=True, is_cancelled=False)
        .select_related('building', 'side', 'drink')
        .prefetch_related('side_items__side', 'drink_items__drink')
    )
    reservations = (
        Reservation.objects.filter(
            menu__date__range=(start_date, end_date),
            status=Reservation.Status.RESERVED,
        )
        .select_related('menu__food', 'menu__category', 'user__profile__department')
        .prefetch_related(Prefetch('items', queryset=current_items, to_attr='export_current_items'))
    )
    records = []
    for reservation in reservations:
        profile = getattr(reservation.user, 'profile', None)
        personnel = profile.personnel_number if profile else reservation.user.username
        department = profile.department.number if profile and profile.department_id else ''
        for item in reservation.export_current_items:
            building = item.building_number_snapshot or (item.building.number if item.building_id else '')
            records.append({
                'date': reservation.menu.date,
                'building': str(building),
                'personnel': str(personnel),
                'department': str(department),
                'food': f'{reservation.menu.food.name} ({reservation.menu.category.name})',
                'quantity': item.food_quantity,
                'sides': quantities(item, 'side'),
                'drinks': quantities(item, 'drink'),
            })
    records.sort(key=lambda r: (r['date'], key_sort(r['building']), key_sort(r['personnel']), r['food']))

    workbook = Workbook()
    details = workbook.active
    details.title = 'جزئیات رزرو'
    orders = workbook.create_sheet('سفارش')
    delivery = workbook.create_sheet('تحویل ساختمان‌ها')

    # Product-name columns contain quantities only, not numbered slots.
    details.append([
        'روز شمسی', 'شماره ساختمان', 'کد پرسنلی', 'شماره دپارتمان',
        'نام غذا', 'تعداد غذا', *map(safe_label, sides), *map(safe_label, drinks),
    ])
    for r in records:
        details.append([
            format_jalali_date(r['date']), r['building'], r['personnel'], r['department'],
            safe_label(r['food']), r['quantity'],
            *(r['sides'].get(name, 0) for name in sides),
            *(r['drinks'].get(name, 0) for name in drinks),
        ])

    # One row per service date and food, across all buildings.
    order_counts = {}
    delivery_counts = {}
    for r in records:
        order_key = (r['date'], r['food'])
        delivery_key = (r['building'][:2], r['date'], r['food'])
        
        for target, key in ((order_counts, order_key), (delivery_counts, delivery_key)):
            if key not in target:
                target[key] = {'food': 0, 'sides': defaultdict(int), 'drinks': defaultdict(int)}
            target[key]['food'] += r['quantity']
            for name, amount in r['sides'].items():
                target[key]['sides'][name] += amount
            for name, amount in r['drinks'].items():
                target[key]['drinks'][name] += amount

    orders.append(['تاریخ', 'روز', 'نوع غذا', 'خروجی سفارش غذا', *map(safe_label, sides), *map(safe_label, drinks)])
    for (day, food), totals in sorted(order_counts.items()):
        orders.append([
            format_jalali_date(day), PERSIAN_WEEKDAYS[day.weekday()], safe_label(food), totals['food'],
            *(totals['sides'].get(name, 0) for name in sides),
            *(totals['drinks'].get(name, 0) for name in drinks),
        ])

    delivery.append(['ساختمان', 'تاریخ', 'روز', 'نوع غذا', 'تعداد غذا', *map(safe_label, sides), *map(safe_label, drinks)])
    for (building, day, food), totals in sorted(delivery_counts.items(), key=lambda item: (key_sort(item[0][0]), item[0][1], item[0][2])):
        delivery.append([
            building, format_jalali_date(day), PERSIAN_WEEKDAYS[day.weekday()], safe_label(food), totals['food'],
            *(totals['sides'].get(name, 0) for name in sides),
            *(totals['drinks'].get(name, 0) for name in drinks),
        ])

    format_sheet(details, text_columns=(1, 2, 3, 4))
    format_sheet(orders, text_columns=(1,))
    format_sheet(delivery, text_columns=(1, 2))
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    response = HttpResponse(
        output.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="food-daily-report.xlsx"'
    return response
