/* KGMU · оболочка мини-приложения: главный экран дня, меню слева, подстраницы «‹ Назад», настройки списком.
   Работает поверх index.html и использует его функции (dayLessons, dateWeek, setView, setGroup…). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var DOW = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  var DOWL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var ROLE = { admin: 'Администратор', starosta: 'Староста', editor: 'Помощник старосты' };

  /* ---------- Telegram ---------- */
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var tp = null;
  try {
    tp = JSON.parse(hash.get('tgWebAppThemeParams') || sessionStorage.getItem('kg-tg-theme') || 'null');
    if (tp) sessionStorage.setItem('kg-tg-theme', JSON.stringify(tp));
  } catch (e) { tp = null; }
  var inTG = !!(window.TelegramWebviewProxy || hash.get('tgWebAppPlatform') || hash.get('tgWebAppData') ||
    (function () { try { return sessionStorage.getItem('kg-tg-initdata'); } catch (e) { return ''; } })());
  function tgPost(type, data) {
    try {
      if (window.TelegramWebviewProxy) window.TelegramWebviewProxy.postEvent(type, JSON.stringify(data || {}));
      else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data || {} }), '*');
    } catch (e) {}
  }
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    var n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function followTG() { return inTG && tp && tp.bg_color && (typeof userPreferences === 'undefined' || userPreferences.theme === 'system'); }
  function applyTGTheme() {
    var root = document.documentElement;
    if (followTG()) {
      root.dataset.theme = lum(tp.bg_color) < 0.5 ? 'dark' : 'light';
      root.style.setProperty('--tg-bg', tp.bg_color);
      if (tp.button_color) root.style.setProperty('--tg-accent', tp.button_color);
      root.classList.add('kg-tg-colors');
      tgPost('web_app_set_header_color', { color: tp.bg_color });
      tgPost('web_app_set_background_color', { color: tp.bg_color });
    } else {
      root.classList.remove('kg-tg-colors');
      root.style.removeProperty('--tg-bg'); root.style.removeProperty('--tg-accent');
      var dark = root.dataset.theme === 'dark';
      tgPost('web_app_set_header_color', { color: dark ? '#0c0c10' : '#f2f3f7' });
      tgPost('web_app_set_background_color', { color: dark ? '#0c0c10' : '#f2f3f7' });
    }
  }
  if (inTG) {
    window.Telegram = window.Telegram || {};
    if (!window.Telegram.WebView) {
      window.Telegram.WebView = { receiveEvent: function (type, data) { if (type === 'theme_changed' && data && data.theme_params) { tp = data.theme_params; sessionStorage.setItem('kg-tg-theme', JSON.stringify(tp)); applyTGTheme(); } } };
    }
    window.addEventListener('message', function (ev) {
      try { var d = JSON.parse(ev.data); if (d.eventType === 'theme_changed' && d.eventData && d.eventData.theme_params) { tp = d.eventData.theme_params; applyTGTheme(); } } catch (e) {}
    });
    tgPost('web_app_ready'); tgPost('web_app_expand');
    document.documentElement.classList.add('kg-in-tg');
  }

  /* ---------- вид: компактный (дизайн E) или расширенный (V8.8) ---------- */
  var UI = inTG ? 'cx' : (function () { try { var v = localStorage.getItem('kg-ui'); if (v === 'cx' || v === 'ext') return v; } catch (e) {} return window.innerWidth < 760 ? 'cx' : 'ext'; })();
  function setUI(v) { try { localStorage.setItem('kg-ui', v); } catch (e) {} location.reload(); }
  if (UI === 'cx') document.documentElement.classList.add('kg-e');

  /* ---------- утилиты ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { return kazanTodayKey(); }
  function addDays(key, n) { var d = parseISO(key); d.setDate(d.getDate() + n); return dateISO(d); }
  function dow(key) { return (parseISO(key).getDay() + 6) % 7; }
  function mins(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); }
  function dur(m) { return m >= 60 ? Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + m % 60 + ' мин' : '') : m + ' мин'; }
  function niceDate(key) { var d = parseISO(key); return DOW[dow(key)] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function ddmm(key) { var d = parseISO(key); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); }
  function fullName(e) { return subjTitle(e.fullSubject || e.subject); }
  function isLive(e) { return e.changeFlag !== 'cancel' && e.changeFlag !== 'moved-away'; }
  function roomChip(loc) {
    loc = String(loc || '').trim(); if (!loc) return '';
    var m = /^(НУК|ГУК|УЛК(?:\s*№\s*\d+)?|ОСЦ|СП)(?=[\s,]|$)[^,]*(?:,\s*(?:лекц\.\s*)?ауд\.\s*("?[0-9A-Za-zА-Яа-яЁё\-]+"?)(?!\s*этаж))?/.exec(loc);
    if (m) return (m[1].replace(/\s*№\s*/, '') + (m[2] ? ' ' + m[2].replace(/"/g, '') : /лекц/.test(loc) ? ' лекц.' : '')).slice(0, 14);
    var h = /больниц\S*\s*№\s*(\d+)/i.exec(loc);
    if (h) return (/клиническ/i.test(loc) ? 'ГКБ №' : 'ГБ №') + h[1];
    if (/Республиканск\S* клиническ/i.test(loc)) return 'РКБ';
    if (/Госпиталь/i.test(loc)) return 'Госпиталь';
    if (/Детск\S* республиканск/i.test(loc)) return 'ДРКБ';
    return loc.replace(/^ГАУЗ\s*/, '').replace(/"/g, '').split(/[,(]/)[0].slice(0, 12);
  }
  var ICON = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    week: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 14h8M8 18h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    cup: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    news: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', chev: '<path d="m9 18 6-6-6-6"/>'
  };
  var SUN = '<svg class="kg-sun" viewBox="0 0 170 170" aria-hidden="true"><defs><radialGradient id="kgsg"><stop offset="0%" stop-color="#FFE3A3"/><stop offset="45%" stop-color="#FFB45E" stop-opacity=".9"/><stop offset="100%" stop-color="#FF8A5B" stop-opacity="0"/></radialGradient></defs><g stroke="rgba(255,226,170,.45)" stroke-width="3" stroke-linecap="round"><path d="M85 8v16M85 146v16M8 85h16M146 85h16M30 30l11 11M129 129l11 11M30 140l11-11M129 41l11-11"/></g><circle cx="85" cy="85" r="60" fill="url(#kgsg)"/><circle cx="85" cy="85" r="26" fill="#FFE7B0"/></svg>';
  function ic(n, cls) { return '<svg class="kg-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>'; }

  /* ---------- состояние ---------- */
  var state = { date: null, week: false, open: null, page: null, tab: 'home' };
  try { state.week = localStorage.getItem('kg-week-mode') === '1'; } catch (e) {}

  function ready() { return typeof dayLessons === 'function' && typeof selectedStudyGroup !== 'undefined' && selectedStudyGroup; }
  function role() {
    try {
      if (typeof cloudRoleIn === 'function') return cloudRoleIn() || '';
    } catch (e) {}
    return '';
  }
  function tgUser() { try { return typeof kgTgUser === 'function' ? kgTgUser() : null; } catch (e) { return null; } }
  function botName() { try { return localStorage.getItem('kg-tg-bot') || ''; } catch (e) { return ''; } }
  function groupCaption(g) {
    try {
      var info = (typeof GROUP_INFO !== 'undefined' && GROUP_INFO[g]) || {};
      var prog = (typeof PROGRAM_CONFIG !== 'undefined' && PROGRAM_CONFIG[info.program]) || {};
      return [prog.label, info.course ? info.course + ' курс' : ''].filter(Boolean).join(' · ');
    } catch (e) { return ''; }
  }

  /* ---------- каркас ---------- */
  function mount() {
    if ($('kgApp')) return;
    if (UI === 'cx') return mountCx();
    var app = document.createElement('div');
    app.id = 'kgApp';
    app.innerHTML =
      '<div class="kg-subbar" id="kgSubBar"><button type="button" class="kg-back" id="kgBack">' + ic('left') + 'Назад</button><b id="kgSubTitle"></b><span></span></div>' +
      '<section class="kg-home" id="kgHome">' +
        (inTG ? '' : '<div class="kg-top"><div class="kg-top-title">Расписание <b id="kgTopGroup"></b></div><div class="kg-top-sub" id="kgTopSub"></div></div>') +
        '<div id="kgStatus"></div>' +
        '<div class="kg-nav"><button type="button" class="kg-ibtn" id="kgMenuBtn" aria-label="Меню">' + ic('menu') + '</button>' +
          '<button type="button" class="kg-ibtn kg-ghost" id="kgPrev" aria-label="Назад">' + ic('left') + '</button>' +
          '<button type="button" class="kg-nav-mid" id="kgNavMid"><b id="kgNavTitle"></b><span id="kgNavSub"></span></button>' +
          '<button type="button" class="kg-ibtn kg-ghost" id="kgNext" aria-label="Вперёд">' + ic('right') + '</button>' +
          '<button type="button" class="kg-ibtn" id="kgModeBtn" aria-label="Вся неделя">' + ic('week') + '</button></div>' +
        '<div id="kgList" class="kg-list"></div>' +
      '</section>' +
      '<section class="kg-page" id="kgPage"></section>' +
      '<div class="kg-scrim" id="kgScrim"></div>' +
      '<aside class="kg-drawer" id="kgDrawer" aria-label="Меню"></aside>';
    document.body.insertBefore(app, document.body.firstChild);
    var bl = document.createElement('div'); bl.className = 'kg-blobs'; bl.setAttribute('aria-hidden', 'true'); bl.innerHTML = '<i></i><i></i><i></i><i></i>'; document.body.appendChild(bl);
    var tb = document.createElement('nav'); tb.className = 'kg-tabbar'; tb.id = 'kgTabbar'; tb.setAttribute('aria-label', 'Разделы'); app.appendChild(tb);
    tb.addEventListener('click', onTab);
    document.body.classList.add('kg-on', 'kg-mode-home');

    $('kgMenuBtn').onclick = openDrawer;
    $('kgScrim').onclick = closeDrawer;
    $('kgPrev').onclick = function () { shift(-1); };
    $('kgNext').onclick = function () { shift(1); };
    $('kgNavMid').onclick = function () { state.date = today(); state.open = null; render(); };
    $('kgModeBtn').onclick = function () { state.week = !state.week; try { localStorage.setItem('kg-week-mode', state.week ? '1' : '0'); } catch (e) {} render(); };
    $('kgBack').onclick = back;
    $('kgList').addEventListener('click', onListClick);
    var sx = 0, sy = 0;
    $('kgList').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    $('kgList').addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('popstate', function () { if (state.page) goHome(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (document.body.classList.contains('kg-drawer-open')) closeDrawer(); else if (state.page) back(); } });
  }

  /* ---------- нижнее меню: Объявления · Неделя · [Главная] · Модули · Профиль ---------- */
  function curTab() { if (state.page === 'news') return 'news'; if (state.page === 'modules') return 'modules'; if (state.page === 'settings') return 'profile'; if (state.page) return ''; return state.tab === 'day' ? 'week' : 'home'; }
  function renderTabs() {
    var tb = $('kgTabbar'); if (!tb) return;
    var c = curTab(), nn = 0;
    try { var nw = newsList(); nn = nw.length && nw[0].id !== seenNews() ? nw.length : 0; } catch (e) {}
    function t(id, icon, label, ex) { return '<button type="button" class="kg-tab' + (c === id ? ' on' : '') + '" data-tab="' + id + '"' + (c === id ? ' aria-current="page"' : '') + '>' + ic(icon) + '<span>' + label + '</span>' + (ex || '') + '</button>'; }
    tb.innerHTML = t('news', 'news', 'Объявления', nn ? '<span class="kg-bd">' + nn + '</span>' : '') + t('week', 'week', 'Неделя') +
      '<button type="button" class="kg-fab' + (c === 'home' ? ' on' : '') + '" data-tab="home" aria-label="Главная"' + (c === 'home' ? ' aria-current="page"' : '') + '>' + ic('home') + '</button>' +
      t('modules', 'layers', 'Модули') + t('profile', 'user', 'Профиль');
  }
  function onTab(ev) {
    var b = ev.target.closest('[data-tab]'); if (!b) return;
    var id = b.dataset.tab;
    if (id === 'home' || id === 'week') {
      state.tab = id === 'week' ? 'day' : 'home'; state.open = null;
      if (id === 'home' || !state.date) state.date = today();
      if (state.page) goHome(); else render();
      window.scrollTo({ top: 0 });
    } else if (id === 'news') navigate('news');
    else if (id === 'modules') navigate('modules');
    else if (id === 'profile') navigate('settings');
    renderTabs();
  }

  function shift(n) {
    state.open = null;
    state.date = addDays(state.date, state.week ? n * 7 : n);
    if (!state.week && dow(state.date) === 6) state.date = addDays(state.date, n > 0 ? 1 : -1);
    render(n);
  }

  /* ---------- главный экран ---------- */
  function lessonsFor(key) {
    var list = [];
    try { list = dayLessons(key) || []; } catch (e) { list = []; }
    return list.map(function (s) { return Array.isArray(s) ? s : [s]; })
      .sort(function (a, b) { return mins(a[0].start) - mins(b[0].start); });
  }
  function notesFor(key, subjects) {
    try { return visibleNotes(key).filter(function (n) { return !subjects || subjects.indexOf(n.subject) >= 0; }); } catch (e) { return []; }
  }
  function statusCard() {
    var key = state.date, t = today(), slots = lessonsFor(key);
    var live = slots.filter(function (s) { return s.some(isLive); });
    var label, title, sub = '', icon = 'sun', cls = '', prog = -1;
    if (key === t) {
      var now = kazanClockMinutes();
      var cur = live.find(function (s) { return mins(s[0].start) <= now && now < mins(s[0].end); });
      var next = live.find(function (s) { return mins(s[0].start) > now; });
      if (!live.length) { label = slots.length ? 'пары отменены' : 'выходной'; title = 'Сегодня пар нет'; sub = 'Можно отдохнуть'; cls = 'is-free'; }
      else if (cur) {
        var e = cur[0], left = mins(e.end) - now;
        label = 'сейчас идёт'; icon = 'play'; cls = 'is-now';
        title = fullName(e); sub = 'До конца ' + plural(left, 'минута', 'минуты', 'минут') + (roomChip(e.shortLocation || e.location) ? ' · ' + roomChip(e.shortLocation || e.location) : '');
        prog = Math.round((now - mins(e.start)) / Math.max(1, mins(e.end) - mins(e.start)) * 100);
      } else if (next && now < mins(live[0][0].start)) {
        label = 'пары ещё не начались'; icon = 'clock'; cls = 'is-morning'; title = 'Первая пара в ' + next[0].start; sub = 'через ' + dur(mins(next[0].start) - now) + ' · ' + fullName(next[0]);
      } else if (next) {
        label = 'перерыв'; icon = 'cup'; cls = 'is-break'; title = 'Следующая в ' + next[0].start; sub = 'через ' + dur(mins(next[0].start) - now) + ' · ' + fullName(next[0]);
      } else {
        label = 'на сегодня всё'; icon = 'moon'; cls = 'is-done'; title = 'Пары закончились';
        var tm = addDays(t, 1); if (dow(tm) === 6) tm = addDays(tm, 1);
        var nx = lessonsFor(tm).filter(function (s) { return s.some(isLive); });
        sub = nx.length ? (tm === addDays(t, 1) ? 'Завтра' : 'В понедельник') + ' первая в ' + nx[0][0].start : 'Можно отдохнуть';
      }
    } else {
      var diff = Math.round((parseISO(key) - parseISO(t)) / 864e5);
      label = diff === 1 ? 'завтра' : diff === -1 ? 'вчера' : DOWL[dow(key)];
      if (!live.length) { title = 'Пар нет'; sub = slots.length ? 'Все занятия отменены' : 'Выходной'; cls = 'is-free'; }
      else { icon = 'cal'; title = plural(live.length, 'пара', 'пары', 'пар'); sub = live[0][0].start + ' – ' + live[live.length - 1][0].end; }
    }
    var h = '<div class="kg-status ' + cls + '">' + (UI === 'cx' ? '<i class="kg-glow"></i><i class="kg-sheen"></i>' + (cls === 'is-morning' ? SUN : '') : '') + '<div class="kg-status-label">' + ic(icon) + esc(label.charAt(0).toUpperCase() + label.slice(1)) + '</div>' +
      '<div class="kg-status-title">' + esc(title) + '</div><div class="kg-status-sub">' + esc(sub) + '</div>' +
      (prog >= 0 ? '<div class="kg-progress"><span style="width:' + prog + '%"></span></div>' : '') + '</div>';
    // ближайший модуль и свежие объявления
    try {
      var soon = notes.filter(function (n) { return n.type === 'module' && n.date >= t && n.date <= addDays(t, 7) && noteRelevant(n); })
        .sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
      if (soon) {
        var dd = Math.round((parseISO(soon.date) - parseISO(t)) / 864e5);
        h += '<button type="button" class="kg-alert" data-go="modules">' + ic('flag') + '<span><b>' + esc(dd === 0 ? 'Сегодня' : dd === 1 ? 'Завтра' : 'Через ' + plural(dd, 'день', 'дня', 'дней')) +
          ': ' + esc(soon.subject) + '</b><small>' + esc(soon.title) + '</small></span>' + ic('chev') + '</button>';
      }
    } catch (e) {}
    var nw = newsList();
    if (nw.length && nw[0].id !== seenNews()) {
      h += '<button type="button" class="kg-alert kg-alert-news" data-go="news">' + ic('news') + '<span><b>' + esc(nw[0].title) + '</b><small>Объявление</small></span>' + ic('chev') + '</button>';
    }
    return h;
  }
  function slotHTML(s, key, idx, nowState) {
    var e = s[0], subjects = [], seen = {};
    var names = [], seenN = {};
    s.forEach(function (x) { var t = subjTitle(x.subject); if (!seen[t]) { seen[t] = 1; subjects.push(t); } var f = fullName(x); if (!seenN[f]) { seenN[f] = 1; names.push(f); } });
    var allCancel = !s.some(isLive);
    var flag = (s.find(function (x) { return x.changeFlag; }) || {}).changeFlag || '';
    var flagText = { cancel: 'Отменено', 'moved-away': 'Перенесено', 'moved-in': 'Перенесено сюда', move: 'Новое время', change: 'Изменено' }[flag] || '';
    var type = e.lessonType === 'cycle' ? 'Цикл' : e.lecture ? 'Лекция' : 'Практика';
    var tcls = e.lessonType === 'cycle' ? 'cycle' : e.lecture ? 'lecture' : 'practice';
    var loc = e.shortLocation || e.location || '';
    var chips = [];
    s.forEach(function (x) { var c = roomChip(x.shortLocation || x.location); if (c && chips.indexOf(c) < 0) chips.push(c); });
    var nts = notesFor(key, subjects);
    var hw = nts.filter(function (n) { return n.type === 'homework'; }).length, md = nts.filter(function (n) { return n.type === 'module'; }).length;
    var teachers = [];
    s.forEach(function (x) { if (x.teacher && teachers.indexOf(x.teacher) < 0) teachers.push(x.teacher); });
    var sub = s.length > 1 && s.some(function (x) { return x.subgroup; }) ? 'обе подгруппы' : (e.subgroup ? e.subgroup + '-я подгруппа' : '');
    var h = '<div class="kg-row ' + (nowState || '') + '"><div class="kg-time"><b>' + esc(e.start) + '</b><span>' + esc(e.end) + '</span></div>' +
      '<div class="kg-card ' + tcls + (allCancel ? ' is-cancel' : '') + (state.open === idx ? ' open' : '') + '" data-slot="' + idx + '" role="button" tabindex="0">' +
      '<div class="kg-card-top"><span class="kg-tag ' + tcls + '">' + type + '</span>' + (flagText ? '<span class="kg-flag ' + esc(flag) + '">' + flagText + '</span>' : '') +
      (md ? '<span class="kg-mark mod">Модуль</span>' : '') + (hw ? '<span class="kg-mark hw">ДЗ</span>' : '') +
      '<span class="kg-chips">' + chips.slice(0, 2).map(function (c) { return '<span class="kg-room">' + esc(c) + '</span>'; }).join('') + '</span></div>' +
      '<div class="kg-subj">' + esc(names.join(' / ')) + '</div>' +
      '<div class="kg-meta">' + esc([teachers.slice(0, 2).join(', '), sub].filter(Boolean).join(' · ')) + '</div>';
    if (nowState === 'is-now') {
      var now = kazanClockMinutes(), p = Math.round((now - mins(e.start)) / Math.max(1, mins(e.end) - mins(e.start)) * 100);
      h += '<div class="kg-progress"><span style="width:' + Math.max(0, Math.min(100, p)) + '%"></span></div>';
    }
    if (state.open === idx) {
      h += '<div class="kg-more">';
      s.forEach(function (x) {
        var v = null; try { v = placeInfo(x); } catch (er) {}
        var place = x.location || x.shortLocation || '';
        h += '<div class="kg-more-item">' + (x.subgroup && s.length > 1 ? '<div class="kg-more-sg">' + esc(x.subgroup) + '-я подгруппа · ' + esc(fullName(x)) + '</div>' : '') +
          '<div>' + ic('pin') + '<span>' + esc(place) + (v && v.address ? '<br><small>' + esc(v.address) + '</small>' : '') + '</span></div>' +
          (x.teacher ? '<div class="kg-more-t">' + esc(x.teacher) + '</div>' : '') +
          (place ? '<a class="kg-link" target="_blank" rel="noopener" href="' + esc(mapLink(v && v.address ? v.address : place)) + '">Открыть на карте</a>' : '') + '</div>';
        if (x.amendment && x.amendment.comment) h += '<div class="kg-more-note">' + esc(x.amendment.comment) + '</div>';
      });
      nts.forEach(function (n) {
        h += '<div class="kg-note ' + (n.type === 'module' ? 'mod' : 'hw') + '"><b>' + (n.type === 'module' ? 'Модуль: ' : 'ДЗ: ') + esc(n.title) + '</b>' +
          (n.details ? '<span>' + esc(n.details) + '</span>' : '') + (n._status === 'pending' ? '<small>ждёт подтверждения старосты</small>' : '') + '</div>';
      });
      h += '<div class="kg-more-actions"><button type="button" class="kg-btn" data-add="homework" data-subj="' + esc(subjects[0]) + '">' + ic('plus') + 'ДЗ</button>' +
        '<button type="button" class="kg-btn" data-add="module" data-subj="' + esc(subjects[0]) + '">' + ic('plus') + 'Модуль</button></div></div>';
    }
    return h + '</div></div>';
  }
  function gapHTML(from, to) {
    var g = mins(to) - mins(from);
    return '<div class="kg-row kg-gap"><div class="kg-time"><b>' + esc(from) + '</b><span>' + esc(to) + '</span></div>' +
      '<div class="kg-window">' + ic('cup') + '<span>Окно · ' + (g >= 60 ? Math.floor(g / 60) + ' ч ' + (g % 60 ? g % 60 + ' мин' : '') : g + ' мин') + '</span></div></div>';
  }
  function dayHTML() {
    var key = state.date, slots = lessonsFor(key);
    if (!slots.length) {
      var w = dateWeek(key);
      return '<div class="kg-empty">' + ic(dow(key) >= 5 ? 'sun' : 'cup') + '<b>' + (dow(key) === 6 ? 'Воскресенье' : w < 1 || w > 18 ? 'Нет расписания на эту дату' : 'Пар нет') + '</b>' +
        '<span>' + (w >= 1 && w <= 18 ? 'Свайпните или нажмите стрелку, чтобы посмотреть другие дни' : 'Расписание опубликовано на недели 1–18') + '</span></div>';
    }
    var t = today(), now = kazanClockMinutes(), h = '', prevEnd = null, nextMarked = false;
    slots.forEach(function (s, i) {
      var e = s[0], st = '';
      if (key === t && s.some(isLive)) {
        if (mins(e.start) <= now && now < mins(e.end)) st = 'is-now';
        else if (mins(e.end) <= now) st = 'is-done';
        else if (!nextMarked) { st = 'is-next'; nextMarked = true; }
      } else if (key < t) st = 'is-done';
      if (prevEnd && mins(e.start) - mins(prevEnd) >= 40) h += gapHTML(prevEnd, e.start);
      h += slotHTML(s, key, i, st);
      if (!prevEnd || mins(e.end) > mins(prevEnd)) prevEnd = e.end;
    });
    return h;
  }
  function weekHTML() {
    var w = dateWeek(state.date), h = '', t = today();
    for (var di = 0; di < 6; di++) {
      var key = dateISO(dayDate(w, di)), slots = lessonsFor(key);
      h += '<div class="kg-wday' + (key === t ? ' is-today' : '') + '" data-day="' + key + '"><div class="kg-wday-head"><b>' + DOWL[di] + '</b><span>' + ddmm(key) + '</span></div>';
      if (!slots.length) h += '<div class="kg-wrow kg-wnone">Пар нет</div>';
      slots.forEach(function (s) {
        var e = s[0], subj = [], seen = {}, live = s.some(isLive);
        s.forEach(function (x) { var tt = fullName(x); if (!seen[tt]) { seen[tt] = 1; subj.push(tt); } });
        var c = roomChip(e.shortLocation || e.location);
        h += '<div class="kg-wrow' + (live ? '' : ' is-cancel') + '"><span class="kg-wt">' + esc(e.start) + '</span><span class="kg-ws">' + esc(subj.join(' / ')) + '</span>' + (c ? '<span class="kg-room">' + esc(c) + '</span>' : '') + '</div>';
      });
      h += '</div>';
    }
    return h;
  }
  function render(dir) {
    if (!$('kgApp')) return;
    if (!ready()) { document.body.classList.remove('kg-ready'); return; }
    document.body.classList.add('kg-ready');
    if (!state.date) state.date = (function () {
      var t = today();
      try { var u = new URLSearchParams(location.search).get('date'); if (u && /^\d{4}-\d{2}-\d{2}$/.test(u)) return u; } catch (e) {}
      return dow(t) === 6 && !inTG ? t : t;
    })();
    if (UI === 'cx') { renderCx(dir); return; }
    var g = selectedStudyGroup;
    if ($('kgTopGroup')) { $('kgTopGroup').textContent = g; $('kgTopSub').textContent = groupCaption(g); }
    var w = dateWeek(state.date);
    if (state.week) {
      $('kgNavTitle').textContent = 'Вся неделя';
      var mon = dateISO(dayDate(w, 0)), sat = dateISO(dayDate(w, 5));
      $('kgNavSub').textContent = (w >= 1 ? 'неделя ' + w + ' · ' : '') + ddmm(mon) + '–' + ddmm(sat);
    } else {
      $('kgNavTitle').textContent = niceDate(state.date);
      $('kgNavSub').textContent = w >= 1 && w <= 18 ? 'неделя ' + w : w > 18 ? 'вне семестра' : 'до начала семестра';
    }
    $('kgModeBtn').classList.toggle('active', state.week);
    $('kgModeBtn').innerHTML = ic(state.week ? 'cal' : 'week');
    $('kgModeBtn').setAttribute('aria-label', state.week ? 'Один день' : 'Вся неделя');
    $('kgStatus').innerHTML = statusCard();
    renderTabs();
    var list = $('kgList');
    list.className = 'kg-list' + (state.week ? ' kg-week' : '');
    list.innerHTML = state.week ? weekHTML() : dayHTML();
    if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      list.animate([{ opacity: 0, transform: 'translateX(' + (dir > 0 ? 18 : -18) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    if (state.page === 'settings') renderSettingsPage();
    if (!document.body.classList.contains('kg-drawer-open')) renderDrawer();
  }
  var renderTimer = null;
  function renderSoon() { clearTimeout(renderTimer); renderTimer = setTimeout(function () { render(); }, 80); }

  function onListClick(ev) {
    var add = ev.target.closest('[data-add]');
    if (add) { ev.stopPropagation(); openEditorFor(add.dataset.add, add.dataset.subj, state.date); return; }
    if (ev.target.closest('a')) return;
    var day = ev.target.closest('[data-day]');
    if (day && state.week) { state.week = false; try { localStorage.setItem('kg-week-mode', '0'); } catch (e) {} state.date = day.dataset.day; render(); window.scrollTo({ top: 0 }); return; }
    var card = ev.target.closest('[data-slot]');
    if (card) { var i = +card.dataset.slot; state.open = state.open === i ? null : i; render(); }
  }
  document.addEventListener('click', function (ev) {
    var go = ev.target.closest('#kgApp [data-go]');
    if (go) { ev.preventDefault(); navigate(go.dataset.go); }
  });
  function openEditorFor(type, subject, key) {
    if (UI === 'cx') {
      showCal(key);
      try { openEditor(type, subject); } catch (e) { console.warn(e); }
      setTimeout(function () { var r = $('recordEditor'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
      return;
    }
    showOld('calendar', 'Календарь и ДЗ');
    try { selectDate(key, false); openEditor(type, subject); } catch (e) { console.warn(e); }
    setTimeout(function () { var r = $('recordEditor'); if (r) r.scrollIntoView({ block: 'start' }); }, 120);
  }

  /* ---------- меню ---------- */
  function newsList() {
    try {
      if (typeof newsRows === 'undefined') return [];
      return newsRows.filter(function (n) { return newsCurrent(n) && newsMatchesGroup(n, selectedStudyGroup); })
        .sort(function (a, b) { return String(b.published_at).localeCompare(String(a.published_at)); });
    } catch (e) { return []; }
  }
  function seenNews() { try { return localStorage.getItem('kg-news-seen') || ''; } catch (e) { return ''; } }
  function renderDrawer() {
    var d = $('kgDrawer'); if (!d || !ready()) return;
    var u = tgUser(), r = role(), g = selectedStudyGroup;
    var name = u ? (u.name || (u.username ? '@' + u.username : 'Студент')) : 'Гость';
    var nnews = newsList().length;
    function item(go, icon, color, label, extra) {
      return '<button type="button" class="kg-mi" data-go="' + go + '"><span class="kg-mi-ic ' + color + '">' + ic(icon) + '</span><span class="kg-mi-l">' + label + '</span>' + (extra || '') + '</button>';
    }
    d.innerHTML = '<div class="kg-dr-head"><b>Меню</b><button type="button" class="kg-ibtn kg-ghost" data-go="close" aria-label="Закрыть">' + ic('x') + '</button></div>' +
      '<div class="kg-profile"><div class="kg-ava">' + esc((name.replace('@', '')[0] || '?').toUpperCase()) + '</div><div class="kg-prof-t"><small>' + esc(r ? ROLE[r] : 'Студент') + '</small><b>' + esc(name) + '</b><span>Группа ' + esc(g) + (groupCaption(g) ? ' · ' + esc(groupCaption(g)) : '') + '</span></div></div>' +
      (u ? '' : '<button type="button" class="kg-login-cta" data-go="settings">' + ic('send') + 'Войти через Telegram</button>') +
      '<nav class="kg-menu">' +
        item('news', 'news', 'c-orange', 'Объявления', nnews ? '<span class="kg-badge">' + nnews + '</span>' : '') +
        item('calendar', 'cal', 'c-blue', 'Календарь и ДЗ') +
        item('modules', 'flag', 'c-red', 'Модули и зачёты') +
        item('search', 'search', 'c-cyan', 'Поиск по расписанию') +
        item('schedule', 'table', 'c-violet', 'Таблица по неделям') +
        item('group', 'users', 'c-green', 'Сменить группу') +
        (botName() && !inTG ? item('bot', 'send', 'c-tg', 'Напоминания в Telegram') : '') +
        item('settings', 'gear', 'c-gray', 'Настройки') +
        (r ? item('tools', 'tool', 'c-amber', r === 'admin' ? 'Инструменты админа' : 'Инструменты старосты') : '') +
      '</nav>' +
      '<button type="button" class="kg-mi kg-mi-support" data-go="report"><span class="kg-mi-ic c-pink">' + ic('heart') + '</span><span class="kg-mi-l">Сообщить о проблеме</span></button>' +
      '<div class="kg-dr-foot">Разработчики · <a href="https://t.me/brainfucker01" target="_blank" rel="noopener">@brainfucker01</a> · <a href="https://t.me/dkkk111111" target="_blank" rel="noopener">@dkkk111111</a></div>';
  }
  function openDrawer() { renderDrawer(); document.body.classList.add('kg-drawer-open'); }
  function closeDrawer() { document.body.classList.remove('kg-drawer-open'); }

  function navigate(go) {
    closeDrawer();
    switch (go) {
      case 'close': return;
      case 'news': return showNews();
      case 'calendar': return UI === 'cx' ? showCal() : showOld('calendar', 'Календарь и ДЗ');
      case 'modules': return showOld('modules', 'Модули и зачёты');
      case 'search': return showOld('search', 'Поиск');
      case 'schedule': return showOld('schedule', 'По неделям');
      case 'tools': return showOld('settings', 'Инструменты', true);
      case 'settings': return showSettings();
      case 'group': if (UI === 'cx') return showGroupPage(); goHome(); try { showGroupChooser(); } catch (e) {} return;
      case 'bot': window.open('https://t.me/' + botName() + '?start=g-' + encodeURIComponent(selectedStudyGroup), '_blank'); return;
      case 'report': try { reportProblem(); } catch (e) {} return;
    }
  }

  /* ---------- подстраницы ---------- */
  function enterPage(name, title) {
    if (!state.page) { try { history.pushState({ kg: name }, ''); } catch (e) {} }
    state.page = name;
    $('kgSubTitle').textContent = title;
    window.scrollTo(0, 0);
    tgPost('web_app_setup_back_button', { is_visible: true });
    renderTabs();
  }
  function showOld(view, title, tools) {
    restoreMoved();
    enterPage(view, title);
    document.body.classList.remove('kg-mode-home', 'kg-mode-page');
    document.body.classList.add('kg-mode-old');
    document.body.classList.toggle('kg-tools', !!tools);
    try { setView(view); } catch (e) {}
    window.scrollTo(0, 0);
  }
  function showPage(name, title, html) {
    restoreMoved();
    enterPage(name, title);
    document.body.classList.remove('kg-mode-home', 'kg-mode-old', 'kg-tools');
    document.body.classList.add('kg-mode-page');
    $('kgPage').innerHTML = html;
  }
  function goHome(fromPop) {
    var had = !!state.page;
    state.page = null;
    restoreMoved();
    document.body.classList.remove('kg-mode-old', 'kg-mode-page', 'kg-tools');
    document.body.classList.add('kg-mode-home');
    tgPost('web_app_setup_back_button', { is_visible: false });
    if (had && !fromPop) { try { history.back(); } catch (e) {} }
    render();
  }
  function back() { goHome(false); }
  if (inTG) {
    var prevRecv = window.Telegram.WebView && window.Telegram.WebView.receiveEvent;
    if (window.Telegram.WebView) window.Telegram.WebView.receiveEvent = function (type, data) { if (type === 'back_button_pressed') back(); if (prevRecv) prevRecv(type, data); };
    window.addEventListener('message', function (ev) { try { var d = JSON.parse(ev.data); if (d.eventType === 'back_button_pressed') back(); } catch (e) {} });
  }

  function showNews() {
    var list = newsList();
    if (list[0]) { try { localStorage.setItem('kg-news-seen', list[0].id); } catch (e) {} }
    var h = list.length ? list.map(function (n) {
      var d = n.published_at ? new Date(n.published_at) : null;
      return '<article class="kg-news"><small>' + (d ? d.getDate() + ' ' + MON[d.getMonth()] : '') + (n.priority === 'urgent' ? ' · срочно' : n.priority === 'important' ? ' · важно' : '') + '</small><b>' + esc(n.title) + '</b>' +
        (n.body ? '<p>' + esc(n.body) + '</p>' : '') + (n.link_url ? '<a class="kg-link" target="_blank" rel="noopener" href="' + esc(n.link_url) + '">' + esc(n.link_label || 'Подробнее') + '</a>' : '') + '</article>';
    }).join('') : '<div class="kg-empty">' + ic('news') + '<b>Объявлений нет</b><span>Здесь появятся новости для вашей группы и курса</span></div>';
    if (role() === 'admin') h += '<button type="button" class="kg-btn kg-wide" data-go="tools">' + ic('tool') + 'Управление объявлениями</button>';
    showPage('news', 'Объявления', h);
  }

  /* ---------- настройки ---------- */
  var moved = [];
  function moveInto(node, target) { if (!node || !target) return; moved.push({ node: node, parent: node.parentNode, next: node.nextSibling }); target.appendChild(node); }
  function restoreMoved() { while (moved.length) { var m = moved.pop(); try { m.parent.insertBefore(m.node, m.next); } catch (e) {} } }
  function seg(name, opts, cur) {
    return '<div class="kg-seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === cur ? 'active' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function row(label, value, go, cls) {
    return '<' + (go ? 'button type="button" data-go="' + go + '"' : 'div') + ' class="kg-lrow ' + (cls || '') + '"><span>' + label + '</span><span class="kg-lval">' + value + (go ? ic('chev') : '') + '</span></' + (go ? 'button' : 'div') + '>';
  }
  function renderSettingsPage() {
    var u = tgUser(), r = role(), g = selectedStudyGroup, theme = (typeof userPreferences !== 'undefined' && userPreferences.theme) || 'system';
    var h = '<div class="kg-lt">Профиль</div><div class="kg-lbox">' +
      row('Роль', esc(r ? ROLE[r] : 'Студент')) +
      row('Имя', esc(u ? (u.name || '@' + u.username) : 'Не выполнен вход')) +
      row('Группа', esc(g), 'group') +
      (groupCaption(g) ? row('Направление', esc(groupCaption(g))) : '') + '</div>' +
      '<div class="kg-lt">Подгруппа</div><div class="kg-lbox kg-pad">' + seg('sub', [['all', 'Обе'], ['1', '1-я'], ['2', '2-я']], typeof group !== 'undefined' ? group : 'all') + '</div>' +
      '<div class="kg-lt">Оформление</div><div class="kg-lbox kg-pad">' + seg('theme', [['system', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']], theme) + '</div>' +
      (inTG ? '' : '<div class="kg-lt">Вид сайта</div><div class="kg-lbox kg-pad">' + seg('ui', [['cx', 'Компактный'], ['ext', 'Расширенный']], 'cx') + '</div>') +
      (botName() ? '<div class="kg-lt">Уведомления</div><div class="kg-lbox">' + row('Напоминания о парах', 'в боте', 'bot') + '</div>' : '') +
      '<div class="kg-lt">Аккаунт</div><div class="kg-lbox" id="kgAccBox">' +
      (u ? row('Telegram', esc(u.username ? '@' + u.username : u.name)) + '<button type="button" class="kg-lrow kg-danger" id="kgLogout"><span>Выйти</span></button>' : '<div class="kg-pad" id="kgTgSlot"></div>') + '</div>' +
      (r ? '<div class="kg-lbox">' + row(r === 'admin' ? 'Инструменты админа' : 'Инструменты старосты', '', 'tools') + '</div>' : '') +
      '<div class="kg-lbox"><button type="button" class="kg-lrow kg-danger" data-go="group"><span>Сменить группу</span></button></div>' +
      '<div class="kg-ver">Версия 8.8 · Разработчики <a href="https://t.me/brainfucker01" target="_blank" rel="noopener">@brainfucker01</a> · <a href="https://t.me/dkkk111111" target="_blank" rel="noopener">@dkkk111111</a></div>';
    restoreMoved();
    $('kgPage').innerHTML = h;
    if ($('kgTgSlot')) { moveInto($('kgTgLogin'), $('kgTgSlot')); moveInto(document.querySelector('.kg-mail-login'), $('kgTgSlot')); }
    if ($('kgLogout')) $('kgLogout').onclick = function () { try { cloudLogout(); } catch (e) {} setTimeout(renderSettingsPage, 300); };
    $('kgPage').querySelectorAll('[data-seg]').forEach(function (box) {
      box.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-v]'); if (!b) return;
        if (box.dataset.seg === 'ui') { if (b.dataset.v === 'ext') setUI('ext'); return; }
        if (box.dataset.seg === 'sub') { try { setGroup(b.dataset.v); } catch (e) {} }
        else { var t = document.querySelector('[data-theme-choice="' + b.dataset.v + '"]'); if (t) t.click(); setTimeout(applyTGTheme, 30); }
        renderSettingsPage();
      });
    });
  }
  function showSettings() { if (UI === 'cx') { showPage('settings', 'Профиль', ''); renderProfile(); return; } showPage('settings', 'Настройки', ''); renderSettingsPage(); }

  /* ---------- компактный вид: экраны по референсу ---------- */
  var DOWS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  var CXK = { lec: ['#8EA6FF', '#3D63F0'], pr: ['#FFC86B', '#FF8A3D'], cyc: ['#B79CFF', '#7C5CF0'] };
  var CXI = { lec: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21l4-5 4 5"/>', pr: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/>', cyc: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>' };
  var FLAG = { cancel: 'Отменено', 'moved-away': 'Перенесено', 'moved-in': 'Перенесено сюда', move: 'Новое время', change: 'Изменено' };
  function kindOf(e) { return e.lessonType === 'cycle' ? 'cyc' : e.lecture ? 'lec' : 'pr'; }
  function kindName(e) { return e.lessonType === 'cycle' ? 'Цикл' : e.lecture ? 'Лекция' : 'Практика'; }
  function kv(k) { var c = CXK[k] || CXK.pr; return '--k1:' + c[0] + ';--k2:' + c[1]; }
  function kIco(k, s) { return '<span class="cx-ki' + (s ? ' s' : '') + '" style="' + kv(k) + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (CXI[k] || CXI.pr) + '</svg></span>'; }
  function gIco(icon, g1, g2, s) { return '<span class="cx-ki' + (s ? ' s' : '') + '" style="--k1:' + g1 + ';--k2:' + g2 + '" aria-hidden="true">' + ic(icon) + '</span>'; }
  function placeOf(x) { var v = null; try { v = placeInfo(x); } catch (e) {} var p = x.location || x.shortLocation || ''; var u = ''; try { u = p ? mapLink(v && v.address ? v.address : p) : ''; } catch (e) {} return { text: p, chip: roomChip(x.shortLocation || x.location) || p, addr: v && v.address ? v.address : '', url: u }; }
  function liveOf(key) { return lessonsFor(key).filter(function (s) { return s.some(isLive); }); }
  function nextStudy(key) { for (var i = 1; i <= 21; i++) { var k = addDays(key, i), s = liveOf(k); if (s.length) return { key: k, sl: s }; } return null; }
  function namesOf(s) { var out = [], seen = {}; s.forEach(function (x) { var f = fullName(x); if (!seen[f]) { seen[f] = 1; out.push(f); } }); return out; }
  function dShort(key) { var d = parseISO(key); return DOWS[dow(key)] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function dayLabel(key) { var t = today(); return key === t ? 'Сегодня' : key === addDays(t, 1) ? 'Завтра' : DOW[dow(key)]; }
  function hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

  function cxHead() {
    var g = selectedStudyGroup, u = tgUser(), h = Math.floor(kazanClockMinutes() / 60);
    var greet = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    var ini = u && (u.name || u.username) ? String(u.name || u.username).replace('@', '').slice(0, 1).toUpperCase()
      : (groupCaption(g).split(' · ')[0] || 'КГМУ').split(/[\s-]+/).filter(function (w) { return w.length > 2; }).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || 'К';
    return '<div class="cx-hd"><button type="button" class="cx-who" data-cx="group" aria-label="Сменить группу"><span class="cx-av" aria-hidden="true"><b>' + esc(ini) + '</b></span><span style="min-width:0"><small>' + greet + ' · ' + dShort(today()) + '</small><strong>Группа ' + esc(g) + ic('chev') + '</strong></span></button>' +
      '<button type="button" class="cx-ib gl" data-cx="profile" aria-label="Профиль и настройки">' + ic('gear') + '</button></div>' +
      '<button type="button" class="cx-search gl" data-cx="search">' + ic('search') + 'Предмет, преподаватель, аудитория…</button>';
  }
  function cxFirst(s, label) {
    var e = s[0], p = placeOf(e);
    return '<div class="cx-first"><div><small>' + esc(label) + ' · ' + kindName(e).toLowerCase() + ' · ' + esc(e.start) + '</small><b>' + esc(namesOf(s).join(' / ')) + '</b>' + (p.text ? '<span>' + esc(p.text) + '</span>' : '') + '</div>' +
      (p.url ? '<a class="cx-route" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + ic('pin') + 'Маршрут</a>' : '') + '</div>';
  }
  function cxRow(s, key, extra) {
    var e = s[0], live = s.some(isLive), names = namesOf(s);
    var sub = [kindName(e), e.subgroup && s.length === 1 ? e.subgroup + '-я подгр.' : '', roomChip(e.shortLocation || e.location)].filter(Boolean).join(' · ');
    return '<button type="button" class="cx-row gl" data-cx="day" data-d="' + key + '">' + kIco(kindOf(e)) + '<div><b>' + esc(names[0]) + (names.length > 1 ? ' +' + (names.length - 1) : '') + '</b><span>' + esc(sub) + '</span></div><div class="tm">' + esc(e.start) + (!live ? '<small>отменено</small>' : extra ? '<small>' + esc(extra) + '</small>' : '') + '</div></button>';
  }
  function cxTasks(t) {
    var list = [];
    try { list = notes.filter(function (n) { return (n.type === 'module' || n.type === 'homework') && n.date >= t && n.date <= addDays(t, 7) && noteRelevant(n); }).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, 3); } catch (e) {}
    var h = '', nw = newsList();
    if (nw.length && nw[0].id !== seenNews()) h += '<button type="button" class="cx-row gl" data-cx="news">' + gIco('news', '#FFC86B', '#FF8A3D') + '<div><b>' + esc(nw[0].title) + '</b><span>Новое объявление</span></div><div class="tm">' + ic('chev') + '</div></button>';
    list.forEach(function (n) {
      var d = Math.round((parseISO(n.date) - parseISO(t)) / 864e5), mod = n.type === 'module';
      h += '<button type="button" class="cx-row gl" data-cx="' + (mod ? 'modules' : 'calendar') + '">' + (mod ? gIco('layers', '#B79CFF', '#6A4BE8') : gIco('flag', '#8EA6FF', '#3D63F0')) +
        '<div><b>' + (mod ? 'Модуль' : 'ДЗ') + ' · ' + esc(n.subject) + '</b><span>' + esc(n.title || '') + '</span></div><div class="tm">' + (d === 0 ? 'сегодня' : d === 1 ? 'завтра' : ddmm(n.date)) + (d <= 1 ? '<small>скоро</small>' : '') + '</div></button>';
    });
    return h ? '<div class="cx-sh"><h2>Важное</h2><button type="button" data-cx="modules">Модули ›</button></div><div class="cx-rows">' + h + '</div>' : '';
  }
  function cxHome() {
    var t = today(), now = kazanClockMinutes(), sl = liveOf(t);
    var live = sl.find(function (s) { return mins(s[0].start) <= now && now < mins(s[0].end); });
    var rest = sl.filter(function (s) { return mins(s[0].start) > now; }), next = rest[0];
    var hero = '', bento = '', list = '', deco = '<i class="kg-glow"></i><i class="kg-sheen"></i>';
    if (live) {
      var e = live[0], len = Math.max(1, mins(e.end) - mins(e.start)), left = mins(e.end) - now, C = 182.2, off = (C * left / len).toFixed(1), nm = namesOf(live);
      var rb = left >= 60 ? '<b>' + Math.floor(left / 60) + ' ч</b><span>' + (left % 60) + ' мин</span>' : '<b>' + left + '</b><span>мин</span>';
      hero = '<section class="cx-hero">' + deco + '<div class="cx-ht"><div class="cx-col"><span class="cx-pill"><span class="cx-pulse"></span>Сейчас · ' + kindName(e).toLowerCase() + '</span><div class="cx-h1">' + esc(nm[0]) + (nm.length > 1 ? ' <span style="opacity:.75">+' + (nm.length - 1) + '</span>' : '') + '</div><div class="cx-hs">' + esc(e.start) + ' – ' + esc(e.end) + (placeOf(e).chip ? ' · ' + esc(placeOf(e).chip) : '') + '</div></div>' +
        '<div class="cx-ring" role="img" aria-label="До конца пары ' + dur(left) + '"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="29" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="7"/><circle cx="36" cy="36" r="29" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"/></svg><div>' + rb + '</div></div></div>' +
        (next ? '<div class="cx-next"><span>Далее: <b>' + esc(namesOf(next)[0]) + '</b></span><b>' + esc(next[0].start) + '</b></div>' : '<div class="cx-next"><span>Это последняя пара сегодня</span></div>') + '</section>';
    } else if (sl.length && now < mins(sl[0][0].start)) {
      var segs = sl.map(function (s, i) { return (i ? '<i class="gap" style="flex:' + Math.max(4, mins(s[0].start) - mins(sl[i - 1][0].end)) + '"></i>' : '') + '<i class="' + (i ? '' : 'on') + '" style="flex:' + Math.max(1, mins(s[0].end) - mins(s[0].start)) + '"></i>'; }).join('');
      hero = '<section class="cx-hero is-morning">' + SUN + '<i class="kg-sheen"></i><div class="cx-col" style="gap:4px"><span class="cx-pill">Пары ещё не начались</span><span class="cx-hs" style="margin-top:8px">До первой пары</span><span class="cx-big">' + dur(mins(sl[0][0].start) - now) + '</span></div>' +
        '<div class="cx-seg" aria-hidden="true">' + segs + '</div><div class="cx-segl"><span>' + esc(sl[0][0].start) + '</span><span>' + plural(sl.length, 'пара', 'пары', 'пар') + '</span><span>' + esc(sl[sl.length - 1][0].end) + '</span></div>' + cxFirst(sl[0], 'Первая') + '</section>';
      list = '<div class="cx-sh"><h2>План на сегодня</h2><button type="button" data-cx="day" data-d="' + t + '">Весь день ›</button></div><div class="cx-rows">' + lessonsFor(t).map(function (s, i) { return cxRow(s, t, i ? '' : 'первая'); }).join('') + '</div>';
    } else if (next) {
      hero = '<section class="cx-hero is-break">' + deco + '<div class="cx-col" style="gap:4px"><span class="cx-pill">' + ic('cup') + 'Перерыв</span><span class="cx-hs" style="margin-top:8px">До следующей пары</span><span class="cx-big">' + dur(mins(next[0].start) - now) + '</span></div>' + cxFirst(next, 'Далее') + '</section>';
    } else {
      var nd = nextStudy(t), lbl = nd ? (nd.key === addDays(t, 1) ? 'Завтра' : dShort(nd.key)) + ' · первая' : '';
      hero = sl.length
        ? '<section class="cx-hero is-done">' + deco + '<div class="cx-col"><span class="cx-pill">' + ic('moon') + 'Пары закончились</span><div class="cx-h1">На сегодня всё</div><div class="cx-hs">Последняя закончилась в ' + esc(sl[sl.length - 1][0].end) + '</div></div>' + (nd ? cxFirst(nd.sl[0], lbl) : '') + '</section>'
        : '<section class="cx-hero is-free">' + deco + '<div class="cx-col"><span class="cx-pill">' + ic('sun') + (lessonsFor(t).length ? 'Пары отменены' : 'Выходной') + '</span><div class="cx-h1">Сегодня пар нет</div><div class="cx-hs">Можно отдохнуть</div></div>' + (nd ? cxFirst(nd.sl[0], lbl) : '') + '</section>';
      if (nd) list = '<div class="cx-sh"><h2>' + (nd.key === addDays(t, 1) ? 'Завтра' : DOW[dow(nd.key)] + ', ' + parseISO(nd.key).getDate() + ' ' + MON[parseISO(nd.key).getMonth()]) + '</h2><button type="button" data-cx="day" data-d="' + nd.key + '">Весь день ›</button></div><div class="cx-rows">' + lessonsFor(nd.key).map(function (s) { return cxRow(s, nd.key); }).join('') + '</div>';
    }
    if (live || (next && now >= mins(sl[0][0].start))) {
      var bt = null;
      for (var i = 1; i < sl.length; i++) { if (mins(sl[i - 1][0].end) > now && mins(sl[i][0].start) - mins(sl[i - 1][0].end) >= 10) { bt = [sl[i - 1][0].end, sl[i][0].start]; break; } }
      var last = sl[sl.length - 1][0].end;
      var tile1 = bt ? '<div class="cx-tile gl"><div class="cx-tl">' + gIco('cup', '#FFD08A', '#FF8A3D', 1) + 'Перерыв</div><div class="cx-tv">' + dur(mins(bt[1]) - mins(bt[0])) + '</div><div class="cx-ts">' + esc(bt[0]) + ' – ' + esc(bt[1]) + '</div></div>'
        : '<div class="cx-tile gl"><div class="cx-tl">' + gIco('flag', '#B79CFF', '#7C5CF0', 1) + 'Конец пар</div><div class="cx-tv">' + esc(last) + '</div><div class="cx-ts">через ' + dur(Math.max(0, mins(last) - now)) + '</div></div>';
      var done = sl.filter(function (s) { return mins(s[0].end) <= now; }).length;
      var bars = sl.map(function (s) { return mins(s[0].end) <= now ? '<i class="ok"></i>' : (now >= mins(s[0].start) ? '<i style="background:linear-gradient(90deg,#5560F5 ' + Math.round((now - mins(s[0].start)) / Math.max(1, mins(s[0].end) - mins(s[0].start)) * 100) + '%,var(--e-sep) 0)"></i>' : '<i></i>'); }).join('');
      bento = '<div class="cx-bento">' + tile1 + '<div class="cx-tile gl"><div class="cx-tl">' + gIco('play', '#7FE3B6', '#22C17A', 1) + 'День</div><div class="cx-tv">' + done + ' из ' + sl.length + '</div><div class="cx-bars" aria-hidden="true">' + bars + '</div></div></div>';
      if (rest.length) list = '<div class="cx-sh"><h2>Дальше сегодня</h2><button type="button" data-cx="day" data-d="' + t + '">Весь день ›</button></div><div class="cx-rows">' + rest.map(function (s) { return cxRow(s, t); }).join('') + '</div>';
    }
    return cxHead() + hero + bento + cxTasks(t) + list;
  }

  function cxCard(s, key, idx, isT, now) {
    var e = s[0], live = s.some(isLive), names = namesOf(s), id = key + ':' + idx;
    var isNow = isT && live && mins(e.start) <= now && now < mins(e.end), past = isT && mins(e.end) <= now;
    var flag = (s.find(function (x) { return x.changeFlag; }) || {}).changeFlag || '';
    var teachers = []; s.forEach(function (x) { if (x.teacher && teachers.indexOf(x.teacher) < 0) teachers.push(x.teacher); });
    var sub = s.length > 1 && s.some(function (x) { return x.subgroup; }) ? 'обе подгруппы' : (e.subgroup ? e.subgroup + '-я подгруппа' : '');
    var chips = '', seenP = {};
    s.forEach(function (x) { var p = placeOf(x); if (p.chip && !seenP[p.chip]) { seenP[p.chip] = 1; chips += p.url ? '<a class="cx-chip" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="Открыть на карте">' + ic('pin') + esc(p.chip) + '</a>' : '<span class="cx-chip">' + esc(p.chip) + '</span>'; } });
    if (FLAG[flag]) chips = '<span class="cx-chip r">' + FLAG[flag] + '</span>' + chips;
    var subjects = []; s.forEach(function (x) { var tt = subjTitle(x.subject); if (subjects.indexOf(tt) < 0) subjects.push(tt); });
    var nts = notesFor(key, subjects);
    nts.forEach(function (n) { chips += '<span class="cx-chip w">' + (n.type === 'module' ? 'Модуль' : 'ДЗ') + (n.title ? ': ' + esc(n.title.length > 36 ? n.title.slice(0, 35) + '…' : n.title) : '') + '</span>'; });
    var h = '<article class="cx-card ' + (isNow ? 'live' : 'gl') + (past ? ' past' : '') + (!live ? ' cancel' : '') + '" style="' + kv(kindOf(e)) + '" data-cx="open" data-id="' + id + '" role="button" tabindex="0" aria-expanded="' + (state.open === id) + '">' +
      (isNow ? '<i class="kg-sheen"></i><span class="cx-left">ещё ' + dur(mins(e.end) - now) + '</span>' : '') + (past && live ? '<span class="cx-chk" aria-label="Прошла"><svg class="kg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span>' : '') +
      '<h3>' + esc(names.join(' / ')) + '</h3><div class="m">' + esc([kindName(e), sub].filter(Boolean).join(' · ')) + '</div>' + (teachers.length ? '<div class="m">' + esc(teachers.slice(0, 2).join(', ')) + '</div>' : '') +
      '<div class="ch">' + chips + '</div>';
    if (isNow) h += '<div class="cx-pb"><i style="width:' + Math.max(0, Math.min(100, Math.round((now - mins(e.start)) / Math.max(1, mins(e.end) - mins(e.start)) * 100))) + '%"></i></div>';
    if (state.open === id) {
      h += '<div class="cx-more">';
      s.forEach(function (x) {
        var p = placeOf(x);
        h += '<div>' + (x.subgroup && s.length > 1 ? '<b>' + esc(x.subgroup) + '-я подгруппа · ' + esc(fullName(x)) + '</b><br>' : '') + (p.text ? esc(p.text) + (p.addr ? '<br><small>' + esc(p.addr) + '</small>' : '') : '') + (x.teacher ? '<br><small>' + esc(x.teacher) + '</small>' : '') + (p.url ? '<br><a href="' + esc(p.url) + '" target="_blank" rel="noopener">Открыть на карте</a>' : '') + (x.amendment && x.amendment.comment ? '<br><small>' + esc(x.amendment.comment) + '</small>' : '') + '</div>';
      });
      nts.forEach(function (n) { h += '<div><b>' + (n.type === 'module' ? 'Модуль: ' : 'ДЗ: ') + esc(n.title) + '</b>' + (n.details ? '<br><small>' + esc(n.details) + '</small>' : '') + (n._status === 'pending' ? '<br><small>ждёт подтверждения старосты</small>' : '') + '</div>'; });
      h += '<div class="r"><button type="button" class="cx-btn g" data-cx="add" data-t="homework" data-subj="' + esc(subjects[0]) + '">' + ic('plus') + 'ДЗ</button><button type="button" class="cx-btn g" data-cx="add" data-t="module" data-subj="' + esc(subjects[0]) + '">' + ic('plus') + 'Модуль</button></div></div>';
    }
    return h + '</article>';
  }
  function cxDay() {
    var key = state.date, t = today(), now = kazanClockMinutes(), isT = key === t, slots = lessonsFor(key), w = dateWeek(key);
    var mon = addDays(key, -dow(key)), days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(mon, i));
    if (!lessonsFor(days[6]).length && dow(key) !== 6) days = days.slice(0, 6);
    var chips = days.map(function (k) {
      var n = liveOf(k).length;
      return '<button type="button" class="cx-d' + (k === key ? ' sel' : '') + (k === t ? ' t' : '') + (n ? '' : ' off') + '" data-cx="date" data-d="' + k + '" aria-label="' + DOW[dow(k)] + ', ' + parseISO(k).getDate() + ' ' + MON[parseISO(k).getMonth()] + '"><small>' + DOWS[dow(k)] + '</small><b>' + parseISO(k).getDate() + '</b><i>' + new Array(Math.min(n, 5) + 1).join('<em></em>') + '</i></button>';
    }).join('');
    var g = typeof group !== 'undefined' ? String(group) : 'all';
    var sgB = '<div class="cx-sg" role="group" aria-label="Подгруппа">' + [['all', 'Все'], ['1', '1'], ['2', '2']].map(function (o) { return '<button type="button" data-cx="sg" data-v="' + o[0] + '" aria-pressed="' + (g === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    var live = slots.filter(function (s) { return s.some(isLive); });
    var sub = [live.length ? plural(live.length, 'пара', 'пары', 'пар') + ' · ' + live[0][0].start + ' – ' + live[live.length - 1][0].end : 'Пар нет', w >= 1 && w <= 18 ? w + ' неделя' : w > 18 ? 'вне семестра' : 'до начала семестра'].join(' · ');
    var d = parseISO(key);
    var h = '<section class="cx-dh gl"><div class="cx-dt"><div><h1>' + dayLabel(key) + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + '</h1><p>' + esc(sub) + '</p></div>' + sgB + '</div>' +
      '<div class="cx-wk"><button type="button" data-cx="wk" data-n="-7" aria-label="Предыдущая неделя">' + ic('left') + '</button><div class="cx-days" style="grid-template-columns:repeat(' + days.length + ',minmax(0,1fr))">' + chips + '</div><button type="button" data-cx="wk" data-n="7" aria-label="Следующая неделя">' + ic('right') + '</button></div></section>';
    if (!slots.length) {
      return h + '<div class="cx-empty gl"><b>' + (dow(key) === 6 ? 'Воскресенье' : w < 1 || w > 18 ? 'Нет расписания на эту дату' : 'Пар нет') + '</b>' + (w >= 1 && w <= 18 ? 'Свайпните или выберите другой день' : 'Расписание опубликовано на недели 1–18') + '</div>';
    }
    var L = '', prevEnd = null, cur = hm(now);
    slots.forEach(function (s, i) {
      var e = s[0];
      if (prevEnd !== null) {
        var gap = mins(e.start) - prevEnd;
        if (isT && now >= prevEnd && now < mins(e.start)) L += '<div class="cx-now"><b>' + cur + '</b><i></i><span>перерыв, ещё ' + dur(mins(e.start) - now) + '</span></div>';
        else if (gap >= 15) L += '<div class="cx-brk"><span>Перерыв ' + dur(gap) + '</span></div>';
      } else if (isT && now < mins(e.start)) L += '<div class="cx-now"><b>' + cur + '</b><i></i></div>';
      L += '<div class="cx-slot"><div class="cx-tm">' + esc(e.start) + '<span>' + esc(e.end) + '</span></div>' + cxCard(s, key, i, isT, now) + '</div>';
      prevEnd = prevEnd === null ? mins(e.end) : Math.max(prevEnd, mins(e.end));
    });
    return h + '<div class="cx-list">' + L + '</div>';
  }
  function renderCx(dir) {
    var box = $('kgCx'); if (!box) return;
    if (state.page === 'settings') renderProfile();
    box.innerHTML = state.tab === 'day' ? cxDay() : cxHome();
    if (dir && state.tab === 'day' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var l = box.querySelector('.cx-list'); if (l) l.animate([{ opacity: 0, transform: 'translateX(' + (dir > 0 ? 18 : -18) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    renderTabs();
  }
  function onCxClick(ev) {
    if (ev.target.closest('a')) return;
    var a = ev.target.closest('[data-cx]'); if (!a) return;
    var k = a.dataset.cx;
    if (k === 'group') navigate('group');
    else if (k === 'profile') navigate('settings');
    else if (k === 'search') navigate('search');
    else if (k === 'news') navigate('news');
    else if (k === 'modules') navigate('modules');
    else if (k === 'calendar') navigate('calendar');
    else if (k === 'day') { state.tab = 'day'; state.date = a.dataset.d || today(); state.open = null; render(); window.scrollTo({ top: 0 }); }
    else if (k === 'date') { var n = a.dataset.d > state.date ? 1 : -1; state.date = a.dataset.d; state.open = null; render(n); }
    else if (k === 'wk') { state.date = addDays(state.date, +a.dataset.n); state.open = null; render(+a.dataset.n); }
    else if (k === 'sg') { try { setGroup(a.dataset.v); } catch (e) {} render(); }
    else if (k === 'add') { ev.stopPropagation(); openEditorFor(a.dataset.t, a.dataset.subj, state.date); }
    else if (k === 'open') { var id = a.dataset.id; state.open = state.open === id ? null : id; render(); }
  }
  function mountCx() {
    var app = document.createElement('div');
    app.id = 'kgApp';
    app.innerHTML = '<div class="kg-subbar" id="kgSubBar"><button type="button" class="kg-back" id="kgBack">' + ic('left') + 'Назад</button><b id="kgSubTitle"></b><span></span></div>' +
      '<section class="kg-home cx-home" id="kgHome"><div id="kgCx"></div></section><section class="kg-page" id="kgPage"></section>' +
      '<nav class="kg-tabbar" id="kgTabbar" aria-label="Разделы"></nav>';
    document.body.insertBefore(app, document.body.firstChild);
    var bl = document.createElement('div'); bl.className = 'kg-blobs'; bl.setAttribute('aria-hidden', 'true'); bl.innerHTML = '<i></i><i></i><i></i><i></i>'; document.body.appendChild(bl);
    document.body.classList.add('kg-on', 'kg-mode-home');
    state.week = false;
    $('kgBack').onclick = back;
    $('kgTabbar').addEventListener('click', onTab);
    $('kgCx').addEventListener('click', onCxClick);
    $('kgCx').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-cx="open"]')) { e.preventDefault(); e.target.click(); } });
    var sx = 0, sy = 0;
    $('kgCx').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    $('kgCx').addEventListener('touchend', function (e) {
      if (state.tab !== 'day') return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('popstate', function () { if (state.page) goHome(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.page) back(); });
  }
  function renderProfile() {
    var u = tgUser(), r = role(), g = selectedStudyGroup, theme = (typeof userPreferences !== 'undefined' && userPreferences.theme) || 'system';
    var name = u ? (u.name || (u.username ? '@' + u.username : 'Студент')) : 'Гость';
    var h = '<div class="cx-prof gl"><div class="kg-ava">' + esc((name.replace('@', '')[0] || '?').toUpperCase()) + '</div><div class="kg-prof-t"><small>' + esc(r ? ROLE[r] : 'Студент') + '</small><b>' + esc(name) + '</b><span>Группа ' + esc(g) + (groupCaption(g) ? ' · ' + esc(groupCaption(g)) : '') + '</span></div></div>' +
      '<div class="kg-lbox">' + row('Сменить группу', esc(g), 'group') + row('Календарь и ДЗ', '', 'calendar') + '</div>' +
      '<div class="kg-lt">Настройки</div><div class="kg-lbox kg-pad"><div class="cx-lab">Подгруппа</div>' + seg('sub', [['all', 'Обе'], ['1', '1-я'], ['2', '2-я']], typeof group !== 'undefined' ? group : 'all') +
      '<div class="cx-lab">Тема</div>' + seg('theme', [['system', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']], theme) +
      (inTG ? '' : '<div class="cx-lab">Вид сайта</div>' + seg('ui', [['cx', 'Компактный'], ['ext', 'Расширенный']], 'cx')) + '</div>' +
      (botName() ? '<div class="kg-lbox">' + row('Напоминания о парах', 'в боте', 'bot') + '</div>' : '') +
      '<div class="kg-lt">Аккаунт</div><div class="kg-lbox" id="kgAccBox">' +
      (u ? row('Telegram', esc(u.username ? '@' + u.username : u.name)) + '<button type="button" class="kg-lrow kg-danger" id="kgLogout"><span>Выйти</span></button>' : '<div class="kg-pad" id="kgTgSlot"></div>') + '</div>' +
      (r === 'admin' ? '<div class="kg-lbox">' + row('Инструменты админа', '', 'tools') + '</div>' : '') +
      '<div class="kg-lbox">' + row('Сообщить о проблеме', '', 'report') + '</div>' +
      '<div class="kg-ver">Версия 9.0 · Разработчики <a href="https://t.me/brainfucker01" target="_blank" rel="noopener">@brainfucker01</a> · <a href="https://t.me/dkkk111111" target="_blank" rel="noopener">@dkkk111111</a></div>';
    restoreMoved();
    $('kgPage').innerHTML = h;
    if ($('kgTgSlot')) { moveInto($('kgTgLogin'), $('kgTgSlot')); moveInto(document.querySelector('.kg-mail-login'), $('kgTgSlot')); }
    if ($('kgLogout')) $('kgLogout').onclick = function () { try { cloudLogout(); } catch (e) {} setTimeout(renderProfile, 300); };
    $('kgPage').querySelectorAll('[data-seg]').forEach(function (box) {
      box.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-v]'); if (!b) return;
        if (box.dataset.seg === 'ui') { if (b.dataset.v === 'ext') setUI('ext'); return; }
        if (box.dataset.seg === 'sub') { try { setGroup(b.dataset.v); } catch (e) {} }
        else { var t = document.querySelector('[data-theme-choice="' + b.dataset.v + '"]'); if (t) t.click(); setTimeout(applyTGTheme, 30); }
        renderProfile();
      });
    });
  }

  /* ---------- компактный вид: выбор группы ---------- */
  var gp = null;
  function progs() { return typeof PROGRAM_CONFIG !== 'undefined' ? PROGRAM_CONFIG : {}; }
  function curGroup() { return typeof selectedStudyGroup !== 'undefined' && selectedStudyGroup ? selectedStudyGroup : ''; }
  function showGroupPage(first) {
    var g = curGroup(), keys = Object.keys(progs());
    gp = { prog: g ? studyProgram(g) : keys[0], course: g ? studyCourse(g) : null, flow: g ? studyStream(g) : null, first: !!first };
    document.body.classList.toggle('kg-cx-first', !!first);
    showPage('group', 'Выбор группы', '');
    renderGroupPage();
  }
  function renderGroupPage() {
    var P = progs(), cfg = P[gp.prog] || P[Object.keys(P)[0]]; if (!cfg) return;
    var courses = cfg.courses || {}, ck = Object.keys(courses).sort(function (a, b) { return a - b; });
    if (!courses[gp.course]) gp.course = ck[0];
    var flows = Object.keys(courses[gp.course] || {}); if (flows.indexOf(gp.flow) < 0) gp.flow = flows[0];
    var ids = (courses[gp.course] || {})[gp.flow] || [], cur = curGroup();
    function pick(kind, v, label, on, small) { return '<button type="button" class="cx-pick' + (on ? ' on' : '') + '" data-gp="' + kind + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + label + (small ? '<small>' + small + '</small>' : '') + '</button>'; }
    var h = '';
    if (gp.first) h += '<div class="cx-gp-hero"><span class="cx-gp-logo"><img alt="" src="./img/kgmu-logo.webp"></span><div><small>Казанский ГМУ</small><b>Расписание занятий</b><span>Выберите свою группу, выбор запомнится на устройстве</span></div></div>';
    h += '<div class="cx-lab">Направление</div><div class="cx-picks">' + Object.keys(P).map(function (k) { return pick('prog', k, esc(P[k].label), k === gp.prog); }).join('') + '</div>';
    h += '<div class="cx-lab">Курс</div><div class="cx-picks cx-picks-c">' + ck.map(function (c) {
      var n = 0; Object.keys(courses[c]).forEach(function (f) { n += (courses[c][f] || []).length; });
      return pick('course', c, c + ' курс', c === gp.course, plural(n, 'группа', 'группы', 'групп'));
    }).join('') + '</div>';
    if (flows.length > 1) h += '<div class="cx-lab">Поток</div><div class="cx-picks">' + flows.map(function (f) {
      var a = courses[gp.course][f] || [], custom = gp.prog === 'stomatologiya' && gp.course === '3';
      return pick('flow', f, custom && a.length ? 'Группы ' + esc(a[0]) + '–' + esc(a[a.length - 1]) : f + '-й поток', f === gp.flow);
    }).join('') + '</div>';
    h += '<div class="cx-lab">Группа</div><div class="cx-ggrid">' + (ids.length ? ids.map(function (id) {
      var dev = false; try { dev = isDevGroup(id); } catch (e) {}
      return '<button type="button" class="cx-gt gl' + (id === cur ? ' on' : '') + '" data-gp="pick" data-v="' + esc(id) + '"' + (id === cur ? ' aria-current="true"' : '') + '><b>' + esc(id) + '</b><small>' + (id === cur ? 'текущая' : dev ? 'в разработке' : 'открыть') + '</small></button>';
    }).join('') : '<div class="cx-empty gl">Групп нет</div>') + '</div>';
    $('kgPage').innerHTML = h;
  }
  function pickGroup(id) {
    var first = gp && gp.first;
    gp = null; document.body.classList.remove('kg-cx-first');
    function go() { if (go.done) return; go.done = true; try { selectStudyGroup(id); } catch (e) { console.warn(e); } }
    if (first) { state.page = null; go(); return; }
    if (id === curGroup()) { back(); return; }
    /* сначала дождаться возврата по истории, иначе он затрёт ?studyGroup= новой группы */
    window.addEventListener('popstate', function () { setTimeout(go, 0); }, { once: true });
    setTimeout(go, 400);
    back();
  }

  /* ---------- компактный вид: календарь и ДЗ ---------- */
  var MONN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  function monthOf(key) { return key.slice(0, 8) + '01'; }
  function showCal(key) {
    key = key || (typeof selectedDate !== 'undefined' && selectedDate) || today();
    state.calSel = key; state.calMonth = monthOf(key);
    showPage('calendar', 'Календарь и ДЗ', '<section class="cx-cal gl" id="cxCal"></section><div class="cx-calp" id="cxCalSlot"></div>');
    try { selectDate(key, false); } catch (e) {}
    moveInto($('calendarDayPanel'), $('cxCalSlot'));
    renderCal();
  }
  function renderCal() {
    var box = $('cxCal'); if (!box) return;
    var m0 = parseISO(state.calMonth), y = m0.getFullYear(), m = m0.getMonth(), t = today();
    var off = (new Date(y, m, 1, 12).getDay() + 6) % 7, cnt = new Date(y, m + 1, 0, 12).getDate(), total = Math.ceil((off + cnt) / 7) * 7, cells = '';
    for (var i = 0; i < total; i++) {
      var d = new Date(y, m, 1 - off + i, 12), k = dateISO(d), out = d.getMonth() !== m, nl = liveOf(k).length, ns = [], ch = false;
      try { ns = visibleNotes(k); } catch (e) {}
      try { ch = amendments.some(function (a) { return a.date === k || a.targetDate === k; }); } catch (e) {}
      var mod = ns.some(function (n) { return n.type === 'module'; }), hw = ns.some(function (n) { return n.type === 'homework'; });
      cells += '<button type="button" class="cx-cd' + (out ? ' out' : '') + (k === t ? ' t' : '') + (k === state.calSel ? ' sel' : '') + '" data-cal="d" data-d="' + k + '" aria-pressed="' + (k === state.calSel) + '" aria-label="' + esc(niceDate(k)) + (nl ? ', ' + plural(nl, 'пара', 'пары', 'пар') : '') + (mod ? ', модуль' : '') + (hw ? ', ДЗ' : '') + (ch ? ', изменение' : '') + '">' +
        '<b>' + d.getDate() + '</b><i>' + new Array(Math.min(nl, 4) + 1).join('<em></em>') + '</i><span>' + (mod ? '<u class="m"></u>' : '') + (hw ? '<u class="h"></u>' : '') + (ch ? '<u class="c"></u>' : '') + '</span></button>';
    }
    box.innerHTML = '<div class="cx-calh"><button type="button" class="cx-ib gl" data-cal="m" data-n="-1" aria-label="Предыдущий месяц">' + ic('left') + '</button>' +
      '<div><h2>' + MONN[m] + ' ' + y + '</h2>' + (monthOf(t) !== state.calMonth ? '<button type="button" class="cx-today" data-cal="today">Сегодня</button>' : '<small>точки — пары, цвет — записи</small>') + '</div>' +
      '<button type="button" class="cx-ib gl" data-cal="m" data-n="1" aria-label="Следующий месяц">' + ic('right') + '</button></div>' +
      '<div class="cx-cw" aria-hidden="true">' + DOWS.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="cx-cg">' + cells + '</div>' +
      '<div class="cx-leg"><span><u class="m"></u>Модуль</span><span><u class="h"></u>ДЗ</span><span><u class="c"></u>Изменение</span></div>';
  }
  function calSelect(key) {
    state.calSel = key; state.calMonth = monthOf(key);
    try { selectDate(key, false); } catch (e) {}
    renderCal();
  }
  function onCxPage(ev) {
    var a = ev.target.closest('[data-gp],[data-cal]'); if (!a) return;
    if (a.dataset.gp) {
      if (!gp) return;
      var k = a.dataset.gp, v = a.dataset.v;
      if (k === 'pick') return pickGroup(v);
      if (k === 'prog') { gp.prog = v; gp.course = null; gp.flow = null; }
      else if (k === 'course') { gp.course = v; gp.flow = null; }
      else if (k === 'flow') gp.flow = v;
      renderGroupPage();
      return;
    }
    var c = a.dataset.cal;
    if (c === 'd') calSelect(a.dataset.d);
    else if (c === 'today') calSelect(today());
    else if (c === 'm') { var d = parseISO(state.calMonth); state.calMonth = dateISO(new Date(d.getFullYear(), d.getMonth() + (+a.dataset.n), 1, 12)); renderCal(); }
  }
  /* старые кнопки «К расписанию», «К занятиям», «Открыть день» ведут на новые экраны */
  function bootCxHooks() {
    var sv = window.setView;
    if (typeof sv === 'function' && !sv.__kgcx) {
      var f = function (v) {
        if (state.page) {
          if (v === 'calendar') { showCal(typeof selectedDate !== 'undefined' ? selectedDate : null); return; }
          if (v === 'today' || v === 'schedule') { back(); return; }
        }
        return sv.apply(this, arguments);
      };
      f.__kgcx = true; window.setView = f;
    }
    window.showGroupChooser = function () { navigate('group'); };
    wrap('renderCalendar', function () {
      if (state.page !== 'calendar') return;
      if (typeof selectedDate !== 'undefined' && selectedDate && selectedDate !== state.calSel) { state.calSel = selectedDate; state.calMonth = monthOf(selectedDate); }
      renderCal();
    });
    $('kgPage').addEventListener('click', onCxPage);
    if (!curGroup()) showGroupPage(true);
  }

  /* ---------- связка со старым приложением ---------- */
  function wrap(name, after) {
    try {
      var orig = window[name];
      if (typeof orig !== 'function' || orig.__kg) return;
      var f = function () { var r = orig.apply(this, arguments); try { after(); } catch (e) {} return r; };
      f.__kg = true; window[name] = f;
    } catch (e) {}
  }
  /* Группа из ссылки бота (?studyGroup=) не должна затирать группу, выбранную вручную */
  function rememberGroup() {
    try {
      var u = new URL(location.href), g = u.searchParams.get('studyGroup'), from = window.KG_URL_GROUP || g, cur = selectedStudyGroup;
      if (from && cur && from !== cur) localStorage.setItem('kg-group-override', JSON.stringify({ from: from, to: cur }));
      else if (from) localStorage.removeItem('kg-group-override');
      if (g && g !== cur) { u.searchParams.set('studyGroup', cur); history.replaceState(history.state, '', u); }
    } catch (e) {}
  }
  function bootExt() {
    wrap('activateStudyGroup', rememberGroup);
    var box = document.querySelector('.header-actions');
    if (box && !$('kgToCx')) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'kgToCx'; b.className = 'header-icon-btn'; b.title = 'Компактный вид'; b.setAttribute('aria-label', 'Компактный вид');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
      b.onclick = function () { setUI('cx'); };
      box.insertBefore(b, box.firstChild);
    }
  }
  function boot() {
    if (UI === 'ext') { bootExt(); return; }
    mount();
    wrap('render', renderSoon);
    wrap('applyTheme', applyTGTheme);
    wrap('newsRender', renderSoon);
    wrap('cloudLoadPermissions', renderSoon);
    wrap('activateStudyGroup', function () { state.date = null; state.open = null; rememberGroup(); goHome(true); });
    if (UI === 'cx') bootCxHooks();
    applyTGTheme();
    render();
    setInterval(function () { if (!state.page && !document.hidden) render(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !state.page) render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
