/**
 * Пересборка разметки Event и даты обновления страницы.
 *
 * Зачем. Разметка schema.org для афиши собирается из массива FALLBACK_EVENTS,
 * но в index.html она лежит статикой. Лента событий на странице фильтрует
 * прошедшее сама, в браузере, а разметка этого не умеет — и через неделю
 * начинает показывать поиску события, которые уже прошли. Google помечает
 * такие как истёкшие и перестаёт выводить блок целиком.
 *
 * Поймано 31.08.2026: в ленте было 9 событий, в разметке 10 — гастрофестиваль
 * 29 августа со страницы ушёл, из разметки нет.
 *
 * Правило те же, что в браузере: ежегодные события катятся на следующий год,
 * прошедшие разовые выбрасываются.
 *
 * Запуск из папки сайта (дата — необязательный аргумент, по умолчанию сегодня):
 *     node build/refresh-events.js 2026-08-31
 *
 * После этого обязательно пересобрать языковые версии:
 *     node build/build-lang.js 2026-08-31
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://visitblg.ru';
const P = path.join(ROOT, 'index.html');

const arg = process.argv[2];
const TODAY_ISO = arg || new Date().toISOString().slice(0, 10);
const today = new Date(TODAY_ISO + 'T00:00:00');
if (isNaN(today)) throw new Error('дата неразборчива: ' + TODAY_ISO);

let s = fs.readFileSync(P, 'utf8');

/* ─── данные афиши берём из самой страницы ────────────────────────────────── */
function grab(name) {
  const start = s.indexOf('const ' + name + ' = [');
  if (start < 0) throw new Error('не найден массив ' + name);
  const open = s.indexOf('[', start);
  let depth = 0, i = open;
  for (; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') { depth--; if (depth === 0) break; }
  }
  return eval(s.slice(open, i + 1));
}

const EVENTS = grab('FALLBACK_EVENTS');

const pad = x => String(x).padStart(2, '0');
const rolled = EVENTS.map(e => {
  let d = new Date(e.date_iso + 'T00:00:00');
  if (e.annual) {
    const lim = new Date(today.getTime() - 864e5);
    while (d < lim) d.setFullYear(d.getFullYear() + 1);
  }
  const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return { ...e, iso, past: d < today };
}).filter(e => !e.past);

const nodes = rolled.map(e => {
  const n = {
    '@type': 'Event',
    name: e.title,
    startDate: e.iso,
    description: e.description,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: e.location,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Благовещенск',
        addressRegion: 'Амурская область',
        addressCountry: 'RU'
      }
    },
    isAccessibleForFree: true
  };
  if (e.img) n.image = SITE + '/assets/photo/' + e.img + '.jpg';
  if (e.link && e.link !== '#') n.url = e.link;
  return n;
});

/* ─── подменяем блок Event ────────────────────────────────────────────────── */
const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
let m, target = null;
while ((m = re.exec(s)) !== null) {
  if (m[1].includes('"@type": "Event"')) { target = m[0]; break; }
}
if (!target) throw new Error('не найден блок Event');

s = s.replace(target,
  '<script type="application/ld+json">\n'
  + JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }, null, 2)
  + '\n</script>');

/* ─── дата обновления: и в разметке, и в подвале ──────────────────────────── */
s = s.replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, '"dateModified": "' + TODAY_ISO + '"');

const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря'];
const human = today.getDate() + ' ' + MONTHS[today.getMonth()] + ' ' + today.getFullYear();
const footOld = s.match(/<div class="foot-upd">Факты сверены и обновлены [^<]*<\/div>/);
if (footOld) {
  s = s.replace(footOld[0], '<div class="foot-upd">Факты сверены и обновлены ' + human + '</div>');
}

fs.writeFileSync(P, s, 'utf8');

/* ─── ключ словаря для строки в подвале ───────────────────────────────────────
   Ключ словаря — это сам русский текст. Меняется дата в подвале — «уезжает»
   и ключ, и строка на языковых версиях остаётся непереведённой. Поэтому дату
   правим и в ключе, и в переводе. */
const MON_EN = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const humanEn = today.getDate() + ' ' + MON_EN[today.getMonth()] + ' ' + today.getFullYear();
const humanZh = today.getFullYear() + '年' + (today.getMonth() + 1) + '月' + today.getDate() + '日';

for (const [file, val] of [['lang-en.js', 'Facts checked and updated on ' + humanEn],
                           ['lang-zh.js', '事实核对与更新日期：' + humanZh]]) {
  const fp = path.join(ROOT, file);
  let d = fs.readFileSync(fp, 'utf8');
  const line = /\n  'Факты сверены и обновлены [^']*': `[^`]*`/;
  if (line.test(d)) {
    d = d.replace(line, "\n  'Факты сверены и обновлены " + human + "': `" + val + '`');
    fs.writeFileSync(fp, d, 'utf8');
    console.log(file + ': строка с датой обновлена');
  } else {
    console.log(file + ': ⚠️ строка с датой не найдена, проверь вручную');
  }
}

console.log('дата: ' + TODAY_ISO);
console.log('событий в афише: ' + EVENTS.length + ', в разметке осталось: ' + nodes.length);
rolled.forEach(e => console.log('   ' + e.iso + '  ' + e.title.slice(0, 52)));
if (footOld) console.log('строка в подвале: «Факты сверены и обновлены ' + human + '»');
console.log('\nне забыть: node build/build-lang.js ' + TODAY_ISO);
