(() => {
  'use strict';

  const formatter = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  if (formatter.resolvedOptions().calendar !== 'persian') return;

  const months = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر',
    'مرداد', 'شهریور', 'مهر', 'آبان',
    'آذر', 'دی', 'بهمن', 'اسفند',
  ];
  const weekdays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const dayMs = 86400000;
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  let active = null;

  function parts(date) {
    const values = Object.fromEntries(
      formatter.formatToParts(date)
        .filter(p => ['year', 'month', 'day'].includes(p.type))
        .map(p => [p.type, Number(p.value)])
    );
    return [values.year, values.month, values.day];
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function normalize(value) {
    return value
      .replace(/[۰-۹]/g, c => String(persianDigits.indexOf(c)))
      .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  }

  function readInput(value) {
    const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(normalize(value.trim()));
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = findGregorian(y, m, d);
    return date && parts(date).join('/') === [y, m, d].join('/') ? date : null;
  }

  // Find the Gregorian date represented by a Jalali date.
  // The Gregorian search window covers the target Persian year.
  function findGregorian(y, m, d) {
    let low = Math.floor(Date.UTC(y + 620, 0, 1) / dayMs);
    let high = Math.floor(Date.UTC(y + 623, 0, 1) / dayMs);

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const date = new Date(mid * dayMs);
      const value = parts(date);
      const comparison =
        value[0] - y || value[1] - m || value[2] - d;

      if (comparison === 0) return date;
      if (comparison < 0) low = mid + 1;
      else high = mid - 1;
    }
    return null;
  }

  function moveMonth(y, m, delta) {
    const zeroBased = y * 12 + (m - 1) + delta;
    return [
      Math.floor(zeroBased / 12),
      ((zeroBased % 12) + 12) % 12 + 1,
    ];
  }

  function close() {
    if (!active) return;
    active.popup.remove();
    active.input.setAttribute('aria-expanded', 'false');
    active = null;
  }

  function position() {
    if (!active) return;
    const rect = active.input.getBoundingClientRect();
    const width = Math.min(316, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8)
    );

    active.popup.style.width = `${width}px`;
    active.popup.style.left = `${left}px`;

    const height = active.popup.offsetHeight;
    const below = window.innerHeight - rect.bottom;
    const top = below >= height + 8 || rect.top < height + 8
      ? rect.bottom + 5
      : rect.top - height - 5;

    active.popup.style.top = `${Math.max(8, top)}px`;
  }

  function button(text, className, label, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = text;
    element.setAttribute('aria-label', label);
    element.addEventListener('click', onClick);
    return element;
  }

  function render() {
    if (!active) return;
    const { popup, input, year, month } = active;
    popup.replaceChildren();

    const header = document.createElement('div');
    header.className = 'foodesk-jalali-header';

    header.append(
      button('‹', 'foodesk-jalali-nav', 'ماه قبل', () => {
        [active.year, active.month] = moveMonth(year, month, -1);
        render();
      }),
    );

    const heading = document.createElement('strong');
    heading.textContent = `${months[month - 1]} ${year.toLocaleString('fa-IR', {
      useGrouping: false,
    })}`;
    header.append(heading);

    header.append(
      button('›', 'foodesk-jalali-nav', 'ماه بعد', () => {
        [active.year, active.month] = moveMonth(year, month, 1);
        render();
      }),
    );

    popup.append(header);

    const grid = document.createElement('div');
    grid.className = 'foodesk-jalali-grid';

    for (const name of weekdays) {
      const label = document.createElement('span');
      label.className = 'foodesk-jalali-weekday';
      label.textContent = name;
      grid.append(label);
    }

    const first = findGregorian(year, month, 1);
    if (!first) return;

    const [nextYear, nextMonth] = moveMonth(year, month, 1);
    const next = findGregorian(nextYear, nextMonth, 1);
    if (!next) return;

    const count = Math.round((next - first) / dayMs);
    const offset = (first.getUTCDay() + 1) % 7;

    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('span');
      grid.append(blank);
    }

    const selected = readInput(input.value);
    const selectedMs = selected?.getTime();
    const today = new Date();
    const todayMs = Date.UTC(
      today.getFullYear(), today.getMonth(), today.getDate()
    );

    for (let day = 1; day <= count; day++) {
      const gregorian = new Date(first.getTime() + (day - 1) * dayMs);
      const cell = button(
        day.toLocaleString('fa-IR', { useGrouping: false }),
        'foodesk-jalali-day',
        `${day} ${months[month - 1]} ${year}`,
        () => {
          input.value = `${year}/${pad(month)}/${pad(day)}`;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          close();
          input.focus();
        }
      );

      if (gregorian.getTime() === todayMs) cell.classList.add('is-today');
      if (gregorian.getTime() === selectedMs) {
        cell.classList.add('is-selected');
        cell.setAttribute('aria-pressed', 'true');
      }
      grid.append(cell);
    }

    popup.append(grid);
    position();
  }

  function open(input) {
    if (active?.input === input) {
      close();
      return;
    }
    close();

    const initial = readInput(input.value) || new Date();
    const [year, month] = parts(initial);

    const popup = document.createElement('div');
    popup.className = 'foodesk-jalali-popup';
    popup.setAttribute('dir', 'rtl');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'انتخاب تاریخ شمسی');

    document.body.append(popup);
    active = { input, popup, year, month };
    input.setAttribute('aria-expanded', 'true');
    render();
  }

  function init() {
    document.querySelectorAll('input.foodesk-jalali-date').forEach(input => {
      if (input.dataset.jalaliReady) return;
      input.dataset.jalaliReady = 'true';
      input.setAttribute('aria-haspopup', 'dialog');

      input.addEventListener('click', () => open(input));
      input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' && !active) {
          event.preventDefault();
          open(input);
        }
        if (event.key === 'Escape') close();
      });
    });
  }

  document.addEventListener('pointerdown', event => {
    if (
      active &&
      !active.popup.contains(event.target) &&
      event.target !== active.input
    ) close();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
