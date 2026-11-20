from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from io import StringIO
from pathlib import Path
import tempfile

from openpyxl import Workbook

from core.models import Building, CustomUser, Department


def _save_employee_workbook(path, rows, *, national_id_as_text=True):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Employees'
    sheet.append(
        [
            'personnel_number',
            'national_id',
            'building_number',
            'department_number',
            'is_active',
        ]
    )

    for row in rows:
        sheet.append(row)

        national_id_cell = sheet.cell(row=sheet.max_row, column=2)
        if national_id_as_text:
            national_id_cell.number_format = '@'
            national_id_cell.data_type = 's'

    workbook.save(path)
    workbook.close()


class EmployeeExcelImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for number in ('01', '02'):
            Building.objects.get_or_create(
                number=number,
                defaults={'is_active': True},
            )

        for number in ('100', '200'):
            Department.objects.get_or_create(
                number=number,
                defaults={'is_active': True},
            )

    def setUp(self):
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self.tmp_path = Path(self._temp_dir.name)

    def test_import_employees_creates_accounts_with_initial_password(self):
        path = self.tmp_path / 'employees.xlsx'
        _save_employee_workbook(
            path,
            [
                ['001001', '0012345678', '01', '100', True],
                ['001002', '0098765432', '02', '200', False],
            ],
        )

        call_command('import_employees', path, stdout=StringIO())

        ali = CustomUser.objects.get(username='001001')
        sara = CustomUser.objects.get(username='001002')

        self.assertTrue(ali.check_password('0012345678'))
        self.assertFalse(ali.check_password('001001'))
        self.assertTrue(ali.must_change_password)
        self.assertEqual(ali.profile.building.number, '01')
        self.assertEqual(ali.first_name, '')
        self.assertEqual(ali.last_name, '')

        self.assertTrue(sara.check_password('0098765432'))
        self.assertFalse(sara.is_active)

    def test_import_employees_dry_run_does_not_write(self):
        path = self.tmp_path / 'employees.xlsx'
        _save_employee_workbook(
            path,
            [['001001', '0012345678', '01', '100', True]],
        )

        call_command(
            'import_employees',
            path,
            dry_run=True,
            stdout=StringIO(),
        )

        self.assertFalse(CustomUser.objects.exists())

    def test_import_employees_rejects_duplicate_rows_atomically(self):
        path = self.tmp_path / 'employees.xlsx'
        _save_employee_workbook(
            path,
            [
                ['001001', '0012345678', '01', '100', True],
                ['001001', '0098765432', '02', '200', True],
            ],
        )

        with self.assertRaisesRegex(CommandError, 'duplicate personnel_number'):
            call_command(
                'import_employees',
                path,
                stdout=StringIO(),
                stderr=StringIO(),
            )

        self.assertFalse(CustomUser.objects.exists())

    def test_import_employees_rejects_numeric_national_id(self):
        path = self.tmp_path / 'employees.xlsx'
        _save_employee_workbook(
            path,
            [
                ['001001', 1234567890, '01', '100', True],
            ],
            national_id_as_text=False,
        )

        with self.assertRaisesRegex(CommandError, 'national_id must be stored as Excel text'):
            call_command(
                'import_employees',
                path,
                stdout=StringIO(),
                stderr=StringIO(),
            )

        self.assertFalse(CustomUser.objects.exists())

    def test_import_employees_rejects_invalid_national_id(self):
        path = self.tmp_path / 'employees.xlsx'
        _save_employee_workbook(
            path,
            [
                ['001001', '12345', '01', '100', True],
            ],
        )

        with self.assertRaisesRegex(CommandError, 'National ID must contain exactly 10 digits'):
            call_command(
                'import_employees',
                path,
                stdout=StringIO(),
                stderr=StringIO(),
            )

        self.assertFalse(CustomUser.objects.exists())

    def test_reimport_updates_existing_employee_without_resetting_password(self):
        path = self.tmp_path / 'employees.xlsx'

        _save_employee_workbook(
            path,
            [['001001', '0012345678', '01', '100', True]],
        )
        call_command('import_employees', path, stdout=StringIO())

        employee = CustomUser.objects.get(username='001001')
        original_id = employee.pk

        employee.set_password('Changed-Secure-Password-2026')
        employee.must_change_password = False
        employee.save(update_fields=['password', 'must_change_password'])

        original_password_hash = employee.password

        _save_employee_workbook(
            path,
            [['001001', '0098765432', '02', '200', False]],
        )
        call_command('import_employees', path, stdout=StringIO())

        employee.refresh_from_db()
        employee.profile.refresh_from_db()

        self.assertEqual(employee.pk, original_id)
        self.assertEqual(employee.profile.building.number, '02')
        self.assertEqual(employee.profile.department.number, '200')
        self.assertFalse(employee.is_active)
        self.assertFalse(employee.must_change_password)
        self.assertEqual(employee.password, original_password_hash)
        self.assertTrue(employee.check_password('Changed-Secure-Password-2026'))
        self.assertFalse(employee.check_password('0098765432'))
        self.assertEqual(CustomUser.objects.filter(username='001001').count(), 1)

    def test_reimport_same_file_does_not_duplicate_accounts(self):
        path = self.tmp_path / 'employees.xlsx'

        _save_employee_workbook(
            path,
            [
                ['001001', '0012345678', '01', '100', True],
                ['001002', '0098765432', '02', '200', True],
            ],
        )

        call_command('import_employees', path, stdout=StringIO())

        original_accounts = {user.username: (user.pk, user.password) for user in CustomUser.objects.all()}

        call_command('import_employees', path, stdout=StringIO())

        self.assertEqual(CustomUser.objects.count(), 2)

        for user in CustomUser.objects.all():
            original_id, original_hash = original_accounts[user.username]
            self.assertEqual(user.pk, original_id)
            self.assertEqual(user.password, original_hash)
            self.assertTrue(user.must_change_password)

    def test_reimport_dry_run_does_not_update_existing_employee(self):
        path = self.tmp_path / 'employees.xlsx'

        _save_employee_workbook(
            path,
            [['001001', '0012345678', '01', '100', True]],
        )
        call_command('import_employees', path, stdout=StringIO())

        employee = CustomUser.objects.get(username='001001')
        original_password_hash = employee.password

        _save_employee_workbook(
            path,
            [['001001', '0098765432', '02', '200', False]],
        )

        call_command(
            'import_employees',
            path,
            dry_run=True,
            stdout=StringIO(),
        )

        employee.refresh_from_db()
        employee.profile.refresh_from_db()

        self.assertEqual(employee.profile.building.number, '01')
        self.assertEqual(employee.profile.department.number, '100')
        self.assertTrue(employee.is_active)
        self.assertEqual(employee.password, original_password_hash)

    def test_reimport_invalid_row_preserves_existing_employee(self):
        path = self.tmp_path / 'employees.xlsx'

        _save_employee_workbook(
            path,
            [['001001', '0012345678', '01', '100', True]],
        )
        call_command('import_employees', path, stdout=StringIO())

        employee = CustomUser.objects.get(username='001001')
        original_password_hash = employee.password

        _save_employee_workbook(
            path,
            [
                ['001001', '0098765432', '02', '200', False],
                ['001002', '0012345678', '99999', '100', True],
            ],
        )

        with self.assertRaises(CommandError):
            call_command(
                'import_employees',
                path,
                stdout=StringIO(),
                stderr=StringIO(),
            )

        employee.refresh_from_db()
        employee.profile.refresh_from_db()

        self.assertEqual(employee.profile.building.number, '01')
        self.assertEqual(employee.profile.department.number, '100')
        self.assertTrue(employee.is_active)
        self.assertEqual(employee.password, original_password_hash)
        self.assertFalse(CustomUser.objects.filter(username='001002').exists())
