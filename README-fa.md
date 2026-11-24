# فودسک | Foodesk

**سامانه رزرو غذای سازمانی** با رابط کاربری فارسی و راست‌به‌چپ (RTL) برای مدیریت رزرو غذای کارکنان.

**زبان:** [English](README.md) | فارسی

## فناوری‌های پروژه

- **Backend:** پایتون ۳.۱۳، Django 6.1، Django REST Framework، Django Unfold و drf-spectacular
- **Frontend:** React 19، TypeScript، Vite، Tailwind CSS 4، Axios و pnpm؛ رابط واکنش‌گرا و PWA
- **پایگاه داده:** PostgreSQL 17
- **زیرساخت:** Docker Compose، Docker Secrets، Volumeهای پایدار و Reverse Proxy مبتنی بر Nginx
- **تقویم:** ورودی تاریخ شمسی و خروجی Excel با تاریخ شمسی؛ تاریخ‌های Query در API در مسیرهای مشخص‌شده با قالب `YYYY-MM-DD` هستند

## محیط‌های Docker

Foodesk دو پیکربندی مجزا دارد. **هر دو را روی یک Docker Engine اجرا نکنید**؛ زیرا نام پروژه Compose (`food-reservation`) و نام کانتینرها یکسان است.

| فایل Compose | محیط | Django | Frontend |
|---|---|---|---|
| `docker-compose.yml` | Production | Gunicorn و تنظیمات Production | Nginx و خروجی Buildشده Vite |
| `docker-compose.dev.yml` | Development | `runserver` و تنظیمات Development | سرور توسعه Vite |

### راه‌اندازی Production

در محیط عملیاتی، PostgreSQL 17، Backend جنگو و Frontend مبتنی بر Nginx اجرا می‌شوند. Reverse Proxy مستقلی در `/opt/nginx` ارتباط HTTPS را برقرار می‌کند و از طریق شبکه `shared_net` درخواست‌ها را به Frontend با نام `food-frontend` می‌فرستد.

۱. فایل‌های `secrets/django_secret_key.txt` و `secrets/postgres_password.txt` را بر اساس فایل‌های نمونه ایجاد کنید و مقادیر واقعی را وارد Git نکنید.
۲. فایل `.env` را برای دامنه عملیاتی، میزبان‌های مجاز، مبادی مورداعتماد CSRF و مشخصات پایگاه داده تنظیم کنید.
۳. وجود شبکه خارجی `shared_net` و پوشه `/opt/food/media` را روی سرور بررسی کنید.
۴. پیش از تغییرات مهم یا Migration، از پایگاه داده پشتیبان معتبر تهیه کنید.
۵. از مسیر `/opt/food` و با فایل Compose اصلی، سرویس‌ها را اجرا کنید:

```bash
docker network inspect shared_net >/dev/null 2>&1 || docker network create shared_net
mkdir -p /opt/food/media
docker compose up -d --build
docker compose exec -T backend python manage.py migrate
docker compose ps
```

Migration در هنگام Build ایمیج اجرا نمی‌شود. Backend هنگام راه‌اندازی `collectstatic` را اجرا می‌کند. کانتینر Production فرانت‌اند ابزارهای توسعه Node.js و pnpm را ندارد.

### توسعه محلی ایزوله

از Docker Engine یا میزبان جداگانه استفاده کنید و Secrets، شبکه و مسیر Media را متناسب تنظیم کنید. در صورت لزوم مسیر مطلق `/opt/food/media` را در Compose توسعه تغییر دهید.

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec -T backend python manage.py migrate
```

| سرویس توسعه | آدرس |
|---|---|
| Frontend مبتنی بر Vite | `http://localhost:5173` |
| Backend جنگو | `http://localhost:8000` |
| بررسی سلامت | `http://localhost:8000/api/v1/health` |

در محیط توسعه، Vite درخواست‌های API را به Django هدایت می‌کند.

## احراز هویت، نقش‌ها و API

احراز هویت با Session جنگو و حفاظت CSRF انجام می‌شود. سامانه ابتدا `/api/v1/auth/session` را بررسی کرده و کاربران واردنشده را به `/login` هدایت می‌کند. در مواردی که تغییر رمز اولیه الزامی است، دسترسی به بخش‌های محافظت‌شده تا زمان تغییر رمز محدود می‌شود. **Username کارکنان همان کد پرسنلی است.**

مجوزها در Backend بررسی می‌شوند. Super Admin به مدیریت کامل سامانه دسترسی دارد؛ نقش `hrFood` مجوزهای مشخصی برای مدیریت کارکنان دارد. سایر دسترسی‌ها، از جمله گزارش‌ها، تابع Permissionهای Django و سیاست‌های Endpointها هستند.

| Endpoint | کاربرد |
|---|---|
| `GET /api/v1/config` | دریافت عمومی و فقط‌خواندنی تنظیمات Branding |
| `GET /api/v1/public-meta` | قطعه HTML عمومی شامل متاتگ‌های Open Graph و Twitter |
| `GET /api/v1/auth/session` | بررسی نشست جاری |
| `GET /api/v1/reservations` | تاریخچه رزرو کاربر |
| `GET /api/v1/reservations/weekly?start=YYYY-MM-DD` | نمای هفتگی رزرو |
| `GET /api/v1/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD` | گزارش روزانه برای کاربران مجاز |
| `GET /api/v1/reports/daily/export?from=YYYY-MM-DD&to=YYYY-MM-DD` | خروجی Excel گزارش روزانه با نمایش تاریخ شمسی، با رعایت مجوزها |

OpenAPI Schema در مسیر `/api/v1/schema` و رابط Swagger در `/api/v1/docs` فقط برای **Super Admin فعال و احرازهویت‌شده** در دسترس‌اند. برای مشاهده قرارداد کامل API از حساب مجاز استفاده کنید.

## واردکردن اطلاعات از Excel

فایل‌های نمونه در `backend/sample_data/` هستند. دستورات زیر در کانتینر **Backend** اجرا می‌شوند و مسیرها نسبت به `/app` هستند:

```bash
docker compose exec -T backend python manage.py import_employees sample_data/sample_employees.xlsx --dry-run
docker compose exec -T backend python manage.py import_catalog sample_data/sample_catalog.xlsx --dry-run
docker compose exec -T backend python manage.py import_monthly_menu sample_data/sample_monthly_menu.xlsx --dry-run
```

فقط بعد از بررسی نتیجه اعتبارسنجی، `--dry-run` را حذف کنید. بر اساس مستندات فعلی، Importها Atomic هستند و تعارض‌ها را پیش از درج بررسی می‌کنند. قیمت‌های Catalog و Menu در این فرایند **اعداد صحیح به تومان** هستند؛ فیلدهایی مانند `price_toman` را نباید با قیمت ریالی فایل‌های دیگر اشتباه گرفت.

فایل کارکنان شامل کد پرسنلی، شماره ساختمان، شماره دپارتمان و وضعیت فعال‌بودن است؛ نام کارکنان در این فرایند Import نمی‌شود. نام کاربری کارکنان تازه‌واردشده **کد پرسنلی** و رمز اولیه آنان **کد ملی** است؛ تغییر رمز در اولین ورود اجباری است. ورود مجدد اطلاعات کارکنان نباید رمز کاربران موجود را خودکار بازنشانی کند.

فایل منوی ماهانه سه Sheet به نام‌های `Foods`، `Sides` و `Drinks` دارد. در `Foods` ستون‌های `date`، `name`، `price_toman`، `container_price_toman` و `special_container_price_toman` استفاده می‌شوند. تاریخ می‌تواند Excel Date یا `YYYY-MM-DD` باشد و نام غذا باید از پیش در Catalog وجود داشته باشد. قیمت منو برابر قیمت غذا به‌علاوه بزرگ‌ترین مقدار از دو قیمت ظرف است. Sheetهای `Sides` و `Drinks` دارای `name` و `price_toman` هستند.

تاریخ‌های تکراری در فایل پذیرفته نمی‌شوند. Import مجدد اطلاعات یکسان، رکوردهای موجود را تغییر نمی‌دهد؛ تغییر غذا یا قیمت برای تاریخ موجود رد می‌شود تا تاریخچه منو بازنویسی نشود. نام‌های موجود Catalog با قیمت متفاوت نیز طبق منطق Import مستندشده رد می‌شوند.

## مدیریت Branding

نام پیش‌فرض: **فودسک / Foodesk**؛ توضیحات: **سامانه رزرو غذای سازمانی**.

مدل Singleton با نام `core.SiteSettings` در PostgreSQL فیلدهای `site_name`، `site_name_en`، `site_description`، `logo` و `favicon` را نگهداری می‌کند. فقط **Super Admin فعال** می‌تواند از پنل Django Unfold این رکورد را مدیریت کند. Endpoint عمومی `GET /api/v1/config` اطلاعات Branding و در صورت آپلود، URL تصاویر را به React ارائه می‌دهد.

فرمت‌های مجاز تصویر PNG، JPEG و WebP با اعتبارسنجی Backend هستند (حداکثر ۲ MiB و ۴ میلیون پیکسل)؛ آپلود SVG مجاز نیست. تا زمان آپلود تصویر، آیکون پیش‌فرض نمایش داده می‌شود. عنوان، سربرگ و تصاویر Unfold هم به تنظیمات دیتابیس وصل‌اند و برای Favicon پیش‌فرض استاتیک وجود دارد.

**محدودیت PWA:** نام و آیکون در Manifest فعلی استاتیک هستند؛ تغییر Branding از Admin لزوماً نام PWA نصب‌شده قبلی را تغییر نمی‌دهد.

## متغیرهای محیطی و Secrets

فایل `.env.example` نمونه تنظیمات غیرحساس توسعه مانند `DJANGO_SETTINGS_MODULE`، `DJANGO_DEBUG`، `DJANGO_ALLOWED_HOSTS`، `DJANGO_CSRF_TRUSTED_ORIGINS`، `POSTGRES_DB` و `POSTGRES_USER` را نگهداری می‌کند.

تنظیم مهلت رزرو:

```dotenv
DOCKER_COMPOSE_RESERVATION_CUTOFF_HOUR=10
```

Docker Compose این متغیر را به `RESERVATION_CUTOFF_HOUR` داخل Backend تبدیل می‌کند. مقدار باید عدد صحیح بین **۰ تا ۲۳** باشد. مهلت رزرو در ساعت تعیین‌شده **آخرین روز کاری پیش از تاریخ سرو غذا** و با منطقه زمانی `Asia/Tehran` پایان می‌یابد. پنجشنبه‌ها، جمعه‌ها و تعطیلات رسمی تعریف‌شده روز غیرکاری هستند؛ در حالت معمول، مهلت رزرو غذای شنبه چهارشنبه در ساعت تعیین‌شده است. برای اعمال تغییر ENV، کانتینر Backend باید با تنظیمات جدید بازایجاد شود.

Compose فایل‌های `secrets/django_secret_key.txt` و `secrets/postgres_password.txt` را در مسیر `/run/secrets` کانتینرهای مرتبط Mount می‌کند. این فایل‌ها باید محافظت و از Git خارج شوند. Docker Secrets در این تنظیمات به معنی رمزگذاری فایل منبع روی دیسک نیست.

## تست و کیفیت کد

تست‌های Django که با دیتابیس کار می‌کنند باید با **پایگاه داده آزمایشی ایزوله** اجرا شوند، نه دیتابیس واقعی Production. Workflowهای `backend-ci.yml`، `frontend-ci.yml` و `deploy.yml` مرجع پیکربندی CI/CD هستند.

محیط توسعه یا تست Backend:

```bash
python manage.py check
python manage.py test
ruff check .
python manage.py makemigrations --check --dry-run
```

محیط توسعه یا CI فرانت‌اند (نیازمند Node.js و pnpm):

```bash
cd frontend
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm test:run
pnpm build
```

کانتینر Nginx محیط Production ابزار pnpm ندارد. تست‌های Backend با **Django Test Runner** اجرا می‌شوند، نه pytest.

## فضای ذخیره‌سازی و ملاحظات Production

- داده‌های PostgreSQL در Volume با نام `postgres_data` نگهداری می‌شوند. در Production از `docker compose down -v` استفاده نکنید.
- شبکه `food_db_net` دیتابیس را به Django متصل می‌کند؛ شبکه `food_app_net` ارتباط Backend و Frontend را برقرار می‌کند؛ شبکه خارجی `shared_net` Frontend را به Reverse Proxy مستقل HTTPS متصل می‌کند. پورت PostgreSQL در Production مستقیماً روی میزبان منتشر نمی‌شود.
- فایل‌های آپلودی در `food_media` متصل به `/opt/food/media` ذخیره می‌شوند. فایل‌های Static جمع‌آوری‌شده Django از Volume مشترک `django_static` در Frontend Nginx ارائه می‌شوند.
- Django در Production از `config.settings.production` و Gunicorn استفاده می‌کند. Nginx فرانت‌اند فایل‌های Buildشده Vite را سرو می‌کند و مسیرهای `/api/` و `/admin/` را به Django می‌فرستد.
- Secrets، نسخه‌های پشتیبان دیتابیس و فایل‌های آپلودی را خارج از Git نگهداری کنید. پیش از تغییرات پرریسک، قابلیت بازیابی Backup را بررسی کنید.
- تغییر ایمیج‌های Backend یا Frontend نیازمند استقرار کنترل‌شده است؛ پس از استقرار، سلامت سرویس‌ها را بررسی کنید.

## متاتگ‌های اجتماعی، robots و کش CDN

رکورد Singleton مدل `core.SiteSettings` تنظیمات برند سایت را نگهداری می‌کند. React اطلاعات برند را هنگام اجرا از `/api/v1/config` دریافت می‌کند. برای پیش‌نمایش لینک، Django در `/api/v1/public-meta` متاتگ‌های امن Open Graph و Twitter را تولید می‌کند؛ Nginx فرانت‌اند با SSI آن‌ها را مستقیماً به HTML اولیه اضافه می‌کند تا خزنده‌هایی که JavaScript اجرا نمی‌کنند نیز اطلاعات را بخوانند. به‌روزرسانی Branding نباید نیازمند Build مجدد React باشد، مشروط بر اینکه CDN نسخه قدیمی HTML را ارائه نکند.

HTML برنامه دارای `noindex, nofollow` است و `/robots.txt` باید به صورت **`text/plain`** ارائه شود، نه فایل HTML مربوط به SPA. کش CDN باید برای `/api/*`، `/admin/*` و مسیرهای HTML پویا غیرفعال شود. پس از اصلاح `robots.txt` ممکن است لازم باشد کش نسخه HTML قدیمی آن یک بار پاک شود. فایل‌های دارای Hash در `/static/app/assets/` می‌توانند کش طولانی‌مدت و Immutable داشته باشند.

مقدار `<title>` در HTML اولیه در حال حاضر ثابت است؛ React پس از دریافت `/api/v1/config` عنوان تب مرورگر را تغییر می‌دهد. SSI متاتگ‌های اجتماعی را به‌روز می‌کند، نه `<title>` اولیه را. همچنین پیام‌رسان‌ها ممکن است پیش‌نمایش لینکی را که قبلاً ذخیره کرده‌اند بلافاصله نوسازی نکنند.
