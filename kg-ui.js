/* KGMU · минималистичный интерфейс: SVG-иконки, роли на <body>, скрытие служебного для студентов. */
(function () {
  var P = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    schedule: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    modules: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }
  var EMOJI = /^[\s←-⯿☀-➿️‍\u{1F000}-\u{1FAFF}]+/u;

  function icons() {
    document.querySelectorAll('.app-tab').forEach(function (b) {
      var v = (b.getAttribute('aria-controls') || '').toLowerCase(), i = b.querySelector('.tab-icon');
      var key = /today/.test(v) ? 'today' : /calendar/.test(v) ? 'calendar' : /module/.test(v) ? 'modules' : /schedule|week/.test(v) ? 'schedule' : '';
      if (i && key && !i.querySelector('svg')) i.innerHTML = svg(key);
    });
    var s = document.getElementById('openSearch'), g = document.getElementById('openSettings');
    if (s && !s.querySelector('svg')) s.innerHTML = svg('search');
    if (g && !g.querySelector('svg')) g.innerHTML = svg('settings');
  }
  function stripEmoji(root) {
    (root || document).querySelectorAll('h2, h3, .source-stamp, .kg-news h2').forEach(function (h) {
      var w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        if (EMOJI.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(EMOJI, '');
          if (!n.nodeValue.trim() && n.parentNode !== h) n.parentNode.style.display = 'none';
          else break;
        } else break;
      }
    });
  }
  function marks() {
    document.querySelectorAll('#settingsView .settings-section').forEach(function (sec) {
      var h = sec.querySelector('h3'); if (!h) return;
      var t = h.textContent;
      if (/Архив всех/.test(t)) sec.classList.add('kg-admin-only');
      if (/Версия приложения/.test(t)) {
        var p = sec.querySelector('p');
        if (p && !p.dataset.kg) { p.dataset.kg = '1'; p.textContent = 'Расписание КГМУ · все направления, 1–6 курсы · вход через Telegram · обновляется автоматически с сайта вуза.'; }
      }
    });
    var ch = document.getElementById('addChange'); if (ch) ch.classList.add('kg-editor-only');
    var cp = document.querySelector('#cloudPanel > h3'); if (cp && !cp.dataset.kg) { cp.dataset.kg = '1'; cp.textContent = 'Аккаунт'; }
    var hint = document.querySelector('#kgTgLogin p');
    if (hint && !hint.dataset.kg) { hint.dataset.kg = '1'; hint.innerHTML = 'Войдите через Telegram, чтобы ваши ДЗ сохранялись за вами. Старостам вход открывает подтверждение ДЗ и изменения пар.'; }
  }
  function roles() {
    var b = document.body;
    try { b.classList.toggle('kg-editor', typeof cloudCanEdit === 'function' && !!cloudCanEdit()); } catch (e) {}
    try { b.classList.toggle('kg-tg', typeof kgTgUser === 'function' && !!kgTgUser()); } catch (e) {}
    try { b.classList.toggle('kg-admin', typeof newsAdmin === 'function' && !!newsAdmin()); } catch (e) {}
  }
  function run() { icons(); stripEmoji(); marks(); roles(); }
  run();
  setInterval(run, 1500);
  document.addEventListener('click', function () { setTimeout(run, 60); }, true);
})();
