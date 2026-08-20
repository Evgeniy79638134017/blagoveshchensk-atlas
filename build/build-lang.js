/**
 * Сборщик языковых версий «Амур Атласа».
 *
 * Зачем он есть. Английская версия на сайте была только в браузере: движок
 * applyLang подменяет тексты по словарю, но включается по отметке в
 * localStorage. У поискового робота такой отметки нет — он всегда получает
 * русскую страницу. То есть для Яндекса, Google и ответов нейросетей
 * английской версии не существовало. Статические /en/ и /cn/ эту дыру
 * закрывают: отдельный URL, свой title, hreflang, обычная индексация.
 *
 * Что делает. Берёт index.html как единственный источник, применяет к нему тот
 * же словарь и по тем же селекторам (I18N_SEL), что и движок в браузере, —
 * поэтому расхождения между статикой и runtime-переводом быть не может.
 * Разметку schema.org для FAQ пересобирает из уже переведённого DOM: требование
 * поисковиков — микроразметка обязана дословно повторять видимый текст.
 *
 * Запуск из папки сайта:
 *     node build/build-lang.js
 *
 * После любой правки index.html языковые версии надо пересобрать, иначе они
 * отстанут. Сборка не нужна для деплоя — на Pages уезжает готовая статика.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://visitblg.ru';

/* ─── языки, которые собираем ────────────────────────────────────────────── */
const LANGS = [
  {
    code: 'en', dir: 'en', htmlLang: 'en', ogLocale: 'en_US', hreflang: 'en',
    dict: 'lang-en.js', dictVar: 'EN',
    ldName: 'Blagoveshchensk: what to see, routes, a trip to Heihe',
    supply: [
      'A passport valid for at least six more months',
      'Cash yuan — Russian cards do not work in China'
    ],
    howto: {
      name: 'How to get from Blagoveshchensk to Heihe in China',
      description: 'Heihe sits across the Amur, 750 metres from Blagoveshchensk. Russians have needed no visa since September 2025, and the trip fits into a single day. Steps and prices as of August 2026.',
      steps: [
        ['Check your passport', 'No visa is required: the visa-free regime for Russian citizens has been in force since 15 September 2025 for stays of up to 30 days and is extended until 31 December 2027. Your passport must be valid for at least six more months.'],
        ['Pick the crossing', 'The boat across the Amur runs from May to October, departures between 10:00 and 16:00, about 3,780 ₽ out and 2,520 ₽ back. The bus over the first Russia–China road bridge runs all year, first departure 07:30, about 2,650 ₽ one way, roughly 2 hours 20 minutes including the border. In winter there is also a pontoon crossing.'],
        ['Change money in advance', 'It is easier to buy yuan at a bank in Blagoveshchensk. Visa and Mastercard do not work in China; tourist spots often take roubles but at a poor rate. Locals pay with Alipay and WeChat Pay.'],
        ['Mind the time difference', 'Heihe runs on Beijing time — one hour behind Blagoveshchensk. Plan the return with a margin: both sides run border control.']
      ]
    }
  },
  {
    code: 'zh', dir: 'cn', htmlLang: 'zh-Hans', ogLocale: 'zh_CN', hreflang: 'zh-Hans',
    dict: 'lang-zh.js', dictVar: 'ZH',
    ldName: '布拉戈维申斯克：看什么、怎么玩、如何去黑河',
    supply: [
      '有效期还有6个月以上的护照',
      '现金人民币——俄罗斯银行卡在中国用不了'
    ],
    howto: {
      name: '如何从布拉戈维申斯克前往中国黑河',
      description: '黑河就在阿穆尔河对岸，距布拉戈维申斯克750米。自2025年9月起俄罗斯公民免签，一天之内就能往返。以下为2026年8月的流程与价格。',
      steps: [
        ['查看护照', '不需要签证：自2025年9月15日起对俄罗斯公民实行免签，停留不超过30天，该安排已延长至2027年12月31日。护照有效期需还有6个月以上。'],
        ['选择过江方式', '游船通航期为5月至10月，10:00至16:00发船，去程约3780卢布，回程约2520卢布。走首座中俄公路大桥的班车全年通行，首班07:30，单程约2650卢布，含过关约2小时20分。冬季还有浮桥通道。'],
        ['提前换好钱', '在布拉戈维申斯克的银行换人民币更方便。Visa和万事达卡在中国用不了；旅游点常收卢布，但汇率较差。当地人主要用支付宝和微信支付。'],
        ['注意时差', '黑河用北京时间，比布拉戈维申斯克晚一小时。回程时间要留余量：两边都要过关。']
      ]
    }
  }
];

/* ─── вспомогательное ────────────────────────────────────────────────────── */

/* Ключи словаря собирались в браузере, где innerHTML отдаёт уже раскрытые
   сущности: «14 — сотрудничество». Парсер на сервере возвращает исходное
   «14 &mdash; сотрудничество» — без раскрытия ни один такой ключ не совпадёт. */
const ENTITIES = {
  '&mdash;': '—', '&ndash;': '–', '&nbsp;': ' ',
  '&laquo;': '«', '&raquo;': '»', '&rarr;': '→', '&larr;': '←',
  '&times;': '×', '&hellip;': '…', '&deg;': '°',
  '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&'
};
function decodeEntities(s) {
  return String(s).replace(/&(?:mdash|ndash|nbsp|laquo|raquo|rarr|larr|times|hellip|deg|quot|#39|lt|gt|amp);/g,
    m => ENTITIES[m] !== undefined ? ENTITIES[m] : m);
}
const norm = s => decodeEntities(String(s)).replace(/\s+/g, ' ').trim();

function loadDict(file, varName) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const w = {};
  new Function('window', '"use strict";' + src)(w);
  const d = w[varName];
  if (!d) throw new Error('в ' + file + ' не найден window.' + varName);
  return d;
}

function extractSelectors(html) {
  const start = html.indexOf('const I18N_SEL=[');
  if (start < 0) throw new Error('не найден I18N_SEL');
  const open = html.indexOf('[', start);
  const close = html.indexOf('];', open);
  return eval(html.slice(open, close + 1));
}

/* ─── сборка одной версии ────────────────────────────────────────────────── */
function build(lang) {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dict = loadDict(lang.dict, lang.dictVar);
  const sels = extractSelectors(src);

  const root = parse(src, {
    blockTextElements: { script: true, style: true, pre: true, textarea: true }
  });

  /* 1. перевод по тем же селекторам, что у движка в браузере */
  let hit = 0, miss = 0;
  const missed = [];
  for (const sel of sels) {
    let els;
    try { els = root.querySelectorAll(sel); } catch (e) { continue; }
    for (const el of els) {
      const key = norm(el.innerHTML);
      if (!key) continue;
      const val = dict[key];
      if (val !== undefined) { el.set_content(val); hit++; }
      else { miss++; if (missed.length < 12) missed.push(key.slice(0, 60)); }
    }
  }

  /* 1б. подписи картинок. Атрибут alt движок в браузере не трогает — он ходит
     по текстовым узлам. А для поиска по картинкам и для читалок это основной
     текст, так что на языковой версии он обязан быть переведён. */
  let altHit = 0;
  for (const img of root.querySelectorAll('img[alt]')) {
    const val = dict[norm(img.getAttribute('alt'))];
    if (val !== undefined) { img.setAttribute('alt', val); altHit++; }
  }

  /* 1в. калькулятор поездки в Хэйхэ снимается с языковых версий.
     Он считает, во что обойдётся русскому съездить в Китай: переправа,
     ночёвка в Хэйхэ, траты в юанях. Гостю из самого Хэйхэ считать нечего,
     а англоязычному туристу этот расчёт тоже не про его поездку. Остальное
     в секции — виза, три переправы с ценами, памятки — остаётся. */
  let calcDropped = false;
  const grid = root.querySelector('.hh-grid');
  if (grid) { grid.remove(); calcDropped = true; }

  /* 2. голова страницы */
  const html = root.querySelector('html');
  html.setAttribute('lang', lang.htmlLang);

  const setMeta = (attr, name, content) => {
    const el = root.querySelector(`meta[${attr}="${name}"]`);
    if (el) el.setAttribute('content', content);
  };
  const title = root.querySelector('title');
  if (dict['@title']) title.set_content(dict['@title']);
  if (dict['@desc']) setMeta('name', 'description', dict['@desc']);
  if (dict['@title']) setMeta('property', 'og:title', dict['@title']);
  if (dict['@desc']) setMeta('property', 'og:description', dict['@desc']);
  if (dict['@title']) setMeta('name', 'twitter:title', dict['@title']);
  if (dict['@desc']) setMeta('name', 'twitter:description', dict['@desc']);
  setMeta('property', 'og:url', `${SITE}/${lang.dir}/`);
  setMeta('property', 'og:locale', lang.ogLocale);
  setMeta('property', 'og:locale:alternate', 'ru_RU');

  const canon = root.querySelector('link[rel="canonical"]');
  if (canon) canon.setAttribute('href', `${SITE}/${lang.dir}/`);

  /* 3. язык страницы задан самой страницей — движок не должен его переопределять */
  const head = root.querySelector('head');
  head.insertAdjacentHTML('afterbegin',
    `\n<script>window.ATLAS_STATIC="${lang.code}";</script>\n`);

  /* 4. hreflang. Русскую страницу мы уже пропатчили, а языковая версия
     строится из неё — если не снять её блок, ссылки удвоятся. */
  for (const a of root.querySelectorAll('link[rel="alternate"]')) a.remove();
  head.insertAdjacentHTML('beforeend', hreflangBlock());

  /* 5. пути от корня: страница лежит в подпапке.
     Заодно подменяется файл словаря — динамику (попапы карты, план, афишу)
     страница переводит уже в браузере, и ей нужен словарь своего языка. */
  let out = root.toString();
  out = out.replace(/(href|src)="assets\//g, '$1="/assets/');
  out = out.replace(/(href|src)="lang-en\.js"/g, '$1="/' + lang.dict + '"');
  out = out.replace(/href="privacy\.html"/g, 'href="/privacy.html"');
  out = out.replace(/url\('assets\//g, "url('/assets/");
  out = out.replace(/"assets\/([a-z0-9._-]+)"/gi, '"/assets/$1"');

  /* 6. FAQ-разметка пересобирается из переведённого текста */
  out = rebuildFaq(out, root, lang);

  /* 7. HowTo на языке страницы */
  out = rebuildHowto(out, lang);

  /* 8. язык в разметке страницы */
  out = out.replace(/"inLanguage": "ru"/g, `"inLanguage": "${lang.htmlLang}"`);
  out = out.replace(new RegExp(`"${SITE}/#webpage"`, 'g'), `"${SITE}/${lang.dir}/#webpage"`);

  const dir = path.join(ROOT, lang.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out, 'utf8');

  return { hit, miss, missed, altHit, calcDropped, bytes: out.length };
}

function hreflangBlock() {
  const rows = [`<link rel="alternate" hreflang="ru" href="${SITE}/">`];
  for (const l of LANGS) rows.push(`<link rel="alternate" hreflang="${l.hreflang}" href="${SITE}/${l.dir}/">`);
  rows.push(`<link rel="alternate" hreflang="x-default" href="${SITE}/">`);
  return '\n' + rows.join('\n') + '\n';
}

function rebuildFaq(out, root, lang) {
  const items = [];
  for (const faq of root.querySelectorAll('.faq')) {
    const q = faq.querySelector('summary');
    const a = faq.querySelector('.faq-a');
    if (!q || !a) continue;
    items.push({
      '@type': 'Question',
      name: norm(q.textContent),
      acceptedAnswer: { '@type': 'Answer', text: norm(a.textContent) }
    });
  }
  if (!items.length) return out;
  const target = ldBlocks(out).find(b => b.body.includes('"@type": "FAQPage"'));
  if (!target) return out;
  const block = JSON.stringify(
    { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang.htmlLang, mainEntity: items },
    null, 2);
  return out.replace(target.full,
    '<script type="application/ld+json">\n' + block + '\n</script>');
}

/* блоки ld+json ищем поштучно: одна общая регулярка перехлёстывает соседние
   блоки и склеивает их в один невалидный JSON */
function ldBlocks(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const list = [];
  let m;
  while ((m = re.exec(html)) !== null) list.push({ full: m[0], body: m[1] });
  return list;
}

function rebuildHowto(out, lang) {
  const m = ldBlocks(out).find(b => b.body.includes('"@type": "HowTo"'));
  if (!m) return out;
  const json = JSON.parse(m.body);
  json.name = lang.howto.name;
  json.description = lang.howto.description;
  json.inLanguage = lang.htmlLang;
  json.step = lang.howto.steps.map(([name, text]) => ({
    '@type': 'HowToStep', name, text, url: `${SITE}/${lang.dir}/#heihe`
  }));
  json.supply = lang.supply.map(name => ({ '@type': 'HowToSupply', name }));
  return out.replace(m.full,
    '<script type="application/ld+json">\n' + JSON.stringify(json, null, 2) + '\n</script>');
}

/* ─── hreflang в русскую версию и в политику ─────────────────────────────── */
function patchRussian() {
  const p = path.join(ROOT, 'index.html');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/\n<link rel="alternate"[^>]*>/g, '');
  const anchor = '<link rel="canonical" href="https://visitblg.ru/">';
  if (!s.includes(anchor)) throw new Error('не найден canonical в index.html');
  s = s.replace(anchor, anchor + hreflangBlock().replace(/\n$/, ''));
  fs.writeFileSync(p, s, 'utf8');
  return s.match(/rel="alternate"/g).length;
}

/* ─── карта сайта: языковые версии перечислены как альтернативы ───────────
   Поисковику нужны и отдельные <url> на каждую версию, и xhtml:link внутри
   каждой — иначе версии читаются как отдельные несвязанные страницы, а не как
   один документ на разных языках. */
function buildSitemap(lastmod) {
  const pages = [{ loc: SITE + '/', lang: 'ru' }]
    .concat(LANGS.map(l => ({ loc: `${SITE}/${l.dir}/`, lang: l.hreflang })));

  const images = [
    [SITE + '/assets/og-preview.jpg', 'Благовещенск — город на Амуре, лицом к Китаю'],
    [SITE + '/assets/hero.jpg', 'Триумфальная арка на набережной Амура, за рекой — китайский Хэйхэ'],
    [SITE + '/assets/ropeway.jpg', 'Канатная дорога Благовещенск — Хэйхэ, проектная визуализация терминала']
  ];

  const alt = pages.map(p => `      <xhtml:link rel="alternate" hreflang="${p.lang}" href="${p.loc}"/>`)
    .concat([`      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`])
    .join('\n');

  const urls = pages.map((p, i) => {
    const img = i === 0
      ? images.map(([loc, title]) =>
          `      <image:image>\n        <image:loc>${loc}</image:loc>\n        <image:title>${title}</image:title>\n      </image:image>`).join('\n') + '\n'
      : '';
    return `    <url>\n      <loc>${p.loc}</loc>\n      <lastmod>${lastmod}</lastmod>\n      <changefreq>weekly</changefreq>\n      <priority>${i === 0 ? '1.0' : '0.8'}</priority>\n${alt}\n${img}    </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  return pages.length;
}

/* ─── запуск ─────────────────────────────────────────────────────────────── */
const LASTMOD = process.argv[2] || '2026-08-20';

const alts = patchRussian();
console.log('index.html: hreflang-ссылок ' + alts);
for (const lang of LANGS) {
  const r = build(lang);
  console.log(`/${lang.dir}/index.html: ${r.bytes} байт, переведено ${r.hit} элементов и ${r.altHit} подписей к картинкам, без ключа ${r.miss}${r.calcDropped ? ", калькулятор Хэйхэ снят" : ""}`);
  if (r.missed.length) {
    console.log('  первые непереведённые:');
    for (const m of r.missed) console.log('    · ' + m);
  }
}
console.log('sitemap.xml: страниц ' + buildSitemap(LASTMOD) + ', lastmod ' + LASTMOD);
