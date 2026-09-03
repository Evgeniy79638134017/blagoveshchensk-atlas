/**
 * Сборка раздела статей: /stati/ и /stati/<slug>/.
 *
 * Зачем раздел вообще. Одна страница не может ранжироваться по десяти
 * разным запросам: под «что посмотреть в Благовещенске» и «как поехать
 * в Хэйхэ» поиску нужны два разных документа. Проверка 03.09.2026 показала,
 * что сайт стоит первым по брендовому запросу и отсутствует в топ-30 по
 * запросам, которыми ищут гости города.
 *
 * Исходник статьи — articles/<slug>.js. Страницы отсюда собираются, руками
 * в /stati/ не править: пересборка затрёт.
 *
 * Запуск из папки сайта:
 *     node build/build-articles.js
 */

const fs = require('fs');
const path = require('path');
const { loadArticles } = require('./lib-articles.js');
const { buildSitemap } = require('./build-sitemap.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://visitblg.ru';
const OUT = path.join(ROOT, 'stati');

/* ─── размеры картинок читаем из самих файлов ──────────────────────────────
   width/height в теге нужны браузеру, чтобы зарезервировать место до
   загрузки. Без них страница дёргается при подгрузке фото, и Google
   штрафует за это отдельной метрикой (CLS). Руками проставлять — забудем. */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('не удалось прочитать размер: ' + file);
}

const photoPath = slug => path.join(ROOT, 'assets', 'photo', slug + '.jpg');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* для JSON-LD: разметка обязана дословно повторять видимый текст,
   поэтому теги снимаем, а сущности раскрываем обратно */
const plain = s => String(s).replace(/<[^>]+>/g, '')
  .replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').replace(/&laquo;/g, '«')
  .replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function humanDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/* ─── врезки с фотографиями ───────────────────────────────────────────────
   В тексте статьи пишем [[photo:имя|подпись alt|подпись под фото]],
   сборщик подставляет разметку и размеры. Так автор статьи не думает
   про width/height и loading, а забыть их нельзя. */
function expandPhotos(html) {
  return html.replace(/\[\[photo:([a-z0-9-]+)\|([^|\]]+)\|([^\]]*)\]\]/g,
    (_, slug, alt, cap) => {
      const f = photoPath(slug);
      if (!fs.existsSync(f)) throw new Error('нет фото assets/photo/' + slug + '.jpg');
      const { w, h } = jpegSize(f);
      return `<figure class="fig">\n  <img src="/assets/photo/${slug}.jpg" alt="${esc(alt)}"`
        + ` width="${w}" height="${h}" loading="lazy" decoding="async">\n`
        + (cap.trim() ? `  <figcaption>${cap.trim()}</figcaption>\n` : '') + `</figure>`;
    });
}

/* ─── общие куски страницы ───────────────────────────────────────────────── */
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru "
  + "https://yastatic.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
  + "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https://mc.yandex.ru; "
  + "connect-src 'self' https://mc.yandex.ru https://yastatic.net wss://mc.yandex.ru; "
  + "frame-src https://mc.yandex.ru; object-src 'none'; base-uri 'self'; form-action 'self'";

const HEAD_COMMON = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#0E9A93">
<link rel="icon" type="image/png" sizes="120x120" href="/assets/favicon-120.png">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/favicon.png">
<link rel="icon" type="image/x-icon" href="/assets/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700&family=Golos+Text:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/article.css">
<script>
/* тема до первой отрисовки, чтобы не мигало белым при переходе с главной */
(function(){try{var t=localStorage.getItem('atlas-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();
</script>`;

const METRIKA = `<script>
(function(){
  var id = 111773809;
  (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
   for(var j=0;j<e.length;j++){if(e[j].src===r){return;}}
   k=t.createElement("script");a=t.getElementsByTagName("script")[0];
   k.async=1;k.src=r;a.parentNode.insertBefore(k,a);
  })(window,document.scripts,document,"https://mc.yandex.ru/metrika/tag.js?id="+id,"ym");
  ym(id,"init",{ssr:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,
                referrer:document.referrer,url:location.href});
})();
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/111773809" style="position:absolute;left:-9999px" alt=""></div></noscript>`;

const TOPBAR = `<div class="progress" aria-hidden="true"><i id="pg"></i></div>
<div class="top">
  <div class="wrap top-in">
    <a class="back" href="/"><span class="ar">&larr;</span> Амур Атлас</a>
    <button class="theme-btn" id="theme-btn" aria-label="Переключить светлую и тёмную тему"><svg id="theme-ico" viewBox="0 0 24 24"><path d="M20 12.5A8 8 0 1111.5 4a6.5 6.5 0 008.5 8.5z"/></svg></button>
  </div>
</div>`;

const FOOTER = `<footer>
  <div class="wrap foot-in">
    <div>
      <a class="foot-brand" href="https://t.me/Evgen_wormhole" target="_blank" rel="noopener"><img src="/assets/logo-mark.png" alt="ИИщенко LAB" width="28" height="28">ИИщенко LAB</a>
      <div class="foot-note" style="margin-top:8px">Сайт создан жителем Благовещенска по собственной инициативе. Нашли неточность — напишите, поправлю.</div>
    </div>
    <div class="foot-note"><a href="/">Гид по городу</a> · <a href="/stati/">Все статьи</a> · <a href="/privacy.html">Обработка данных</a></div>
  </div>
</footer>`;

/* Полоса прочитанного и переключатель темы. Больше на странице скриптов нет:
   статья должна открываться и читаться, даже если JS не выполнится. */
const SCRIPT = `<script>
(function(){
  var bar = document.getElementById('pg');
  if (bar) {
    var tick = function(){
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, window.scrollY / h * 100) : 0) + '%';
    };
    addEventListener('scroll', tick, {passive:true});
    addEventListener('resize', tick);
    tick();
  }
  var btn = document.getElementById('theme-btn');
  if (btn) btn.addEventListener('click', function(){
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme','dark');
    try { localStorage.setItem('atlas-theme', dark ? 'light' : 'dark'); } catch(e){}
  });
})();
</script>`;

/* ─── схема ────────────────────────────────────────────────────────────── */
function articleSchema(a) {
  const nodes = [{
    '@type': 'Article',
    headline: plain(a.h1),
    description: a.description,
    image: [`${SITE}/assets/photo/${a.cover}.jpg`],
    datePublished: a.date,
    dateModified: a.updated,
    inLanguage: 'ru-RU',
    author: { '@type': 'Person', name: 'Евгений Ищенко' },
    publisher: {
      '@type': 'Organization', name: 'ИИщенко LAB',
      logo: { '@type': 'ImageObject', url: `${SITE}/assets/logo-mark.png` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/stati/${a.slug}/` },
    about: {
      '@type': 'Place', name: 'Благовещенск', address: {
        '@type': 'PostalAddress', addressLocality: 'Благовещенск',
        addressRegion: 'Амурская область', addressCountry: 'RU'
      }
    }
  }, {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Гид по Благовещенску', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Статьи', item: SITE + '/stati/' },
      { '@type': 'ListItem', position: 3, name: plain(a.h1) }
    ]
  }];
  if (a.faq && a.faq.length) {
    nodes.push({
      '@type': 'FAQPage',
      mainEntity: a.faq.map(([q, ans]) => ({
        '@type': 'Question', name: plain(q),
        acceptedAnswer: { '@type': 'Answer', text: plain(ans) }
      }))
    });
  }
  return '<script type="application/ld+json">\n'
    + JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }, null, 2)
    + '\n</script>';
}

/* ─── карточка статьи для списков ─────────────────────────────────────── */
function card(a) {
  const { w, h } = jpegSize(photoPath(a.cover));
  return `<a class="card" href="/stati/${a.slug}/">
  <img src="/assets/photo/${a.cover}.jpg" alt="${esc(a.coverAlt)}" width="${w}" height="${h}" loading="lazy" decoding="async">
  <div class="card-b">
    <div class="card-t">${a.h1}</div>
    <div class="card-d">${a.cardText || a.description}</div>
  </div>
</a>`;
}

/* ─── страница статьи ─────────────────────────────────────────────────── */
function renderArticle(a, all) {
  const cover = jpegSize(photoPath(a.cover));
  const others = all.filter(x => x.slug !== a.slug).slice(0, 2);
  const faq = (a.faq && a.faq.length) ? `
<section class="faq">
  <h2>Коротко — частые вопросы</h2>
  ${a.faq.map(([q, ans]) => `<div class="qa"><h3>${q}</h3><p>${ans}</p></div>`).join('\n  ')}
</section>` : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
${HEAD_COMMON}
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.description)}">
<link rel="canonical" href="${SITE}/stati/${a.slug}/">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(a.description)}">
<meta property="og:url" content="${SITE}/stati/${a.slug}/">
<meta property="og:image" content="${SITE}/assets/photo/${a.cover}.jpg">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Амур Атлас">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(a.title)}">
<meta name="twitter:description" content="${esc(a.description)}">
<meta name="twitter:image" content="${SITE}/assets/photo/${a.cover}.jpg">
${articleSchema(a)}
${METRIKA}
</head>
<body>

${TOPBAR}

<main>
<div class="wrap">

  <nav class="crumbs" aria-label="Хлебные крошки">
    <a href="/">Гид по Благовещенску</a><span>/</span><a href="/stati/">Статьи</a>
  </nav>

  <article>
    <div class="a-head">
      <span class="eyebrow">${a.eyebrow || 'Статья'}</span>
      <h1${a.wideTitle ? ' class="wide"' : ''}>${a.h1}</h1>
      <p class="lead">${a.lead}</p>
      <div class="a-meta">
        <span>Опубликовано <b>${humanDate(a.date)}</b></span>
        ${a.updated !== a.date ? `<span>Обновлено <b>${humanDate(a.updated)}</b></span>` : ''}
        <span>Читать <b>${a.minutes || 6} мин</b></span>
      </div>
    </div>

    <div class="cover">
      <img src="/assets/photo/${a.cover}.jpg" alt="${esc(a.coverAlt)}" width="${cover.w}" height="${cover.h}" loading="eager" decoding="async" fetchpriority="high">
    </div>
    ${a.coverCap ? `<p class="cap">${a.coverCap}</p>` : ''}

    <div class="body">
${expandPhotos(a.body).trim()}
    </div>
${faq}
  </article>

  <section class="next">
    <div class="next-h">Читать дальше</div>
    <div class="next-grid">
${others.map(card).join('\n')}
    </div>
  </section>

  <section class="cta">
    <h2>Собрать маршрут под свои даты</h2>
    <p>В гиде — карта на 23 точки, конструктор маршрута с расчётом бюджета и афиша событий Приамурья.</p>
    <div class="btns">
      <a class="btn btn-primary" href="/#planner">К конструктору маршрута →</a>
      <a class="btn btn-ghost" href="/#map-s">Открыть карту</a>
    </div>
  </section>

</div>
</main>

${FOOTER}
${SCRIPT}
</body>
</html>
`;
}

/* ─── список статей ───────────────────────────────────────────────────── */
function renderIndex(all) {
  const [first, ...rest] = all;
  const f = jpegSize(photoPath(first.cover));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'CollectionPage',
      name: 'Статьи о Благовещенске',
      description: 'Разборы для тех, кто едет в Благовещенск: поездка в Хэйхэ, маршрут на один день, выбор сезона.',
      url: SITE + '/stati/',
      inLanguage: 'ru-RU',
      isPartOf: { '@type': 'WebSite', name: 'Амур Атлас', url: SITE + '/' },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: all.map((a, i) => ({
          '@type': 'ListItem', position: i + 1, name: plain(a.h1),
          url: `${SITE}/stati/${a.slug}/`
        }))
      }
    }, {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Гид по Благовещенску', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Статьи' }
      ]
    }]
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
${HEAD_COMMON}
<title>Статьи о Благовещенске: Хэйхэ, маршруты, сезоны — Амур Атлас</title>
<meta name="description" content="Разборы для поездки в Благовещенск: как съездить в китайский Хэйхэ без визы, что успеть за один день и в какой сезон ехать. Цены и расписания сверены с источниками.">
<link rel="canonical" href="${SITE}/stati/">
<meta property="og:type" content="website">
<meta property="og:title" content="Статьи о Благовещенске — Амур Атлас">
<meta property="og:description" content="Поездка в Хэйхэ, маршрут на один день, выбор сезона. Практика без воды.">
<meta property="og:url" content="${SITE}/stati/">
<meta property="og:image" content="${SITE}/assets/photo/${first.cover}.jpg">
<meta property="og:locale" content="ru_RU">
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
${METRIKA}
</head>
<body>

${TOPBAR}

<main>
<div class="wrap">

  <nav class="crumbs" aria-label="Хлебные крошки">
    <a href="/">Гид по Благовещенску</a><span>/</span>Статьи
  </nav>

  <div class="a-head">
    <span class="eyebrow">Разборы</span>
    <h1 class="wide">Статьи о поездке в Благовещенск</h1>
    <p class="lead">То, что не помещается в карточку на карте: маршруты целиком, расчёты, расписания и разбор, что здесь стоит времени, а что нет. Цены и даты сверены с источниками — они названы прямо в тексте.</p>
  </div>

  <div class="list">
    <a class="lead-card" href="/stati/${first.slug}/">
      <img src="/assets/photo/${first.cover}.jpg" alt="${esc(first.coverAlt)}" width="${f.w}" height="${f.h}" loading="eager" decoding="async">
      <div class="b">
        <div class="tag">${first.eyebrow || 'Статья'}</div>
        <div class="t">${first.h1}</div>
        <div class="d">${first.cardText || first.description}</div>
        <div class="card-d">${humanDate(first.date)} · ${first.minutes || 6} мин</div>
      </div>
    </a>
    <div class="rest">
${rest.map(card).join('\n')}
    </div>
  </div>

  <section class="cta">
    <h2>А маршрут соберёт гид</h2>
    <p>Карта на 23 точки, конструктор маршрута с бюджетом и афиша — на главной странице «Амур Атласа».</p>
    <div class="btns">
      <a class="btn btn-primary" href="/">Открыть гид →</a>
    </div>
  </section>

</div>
</main>

${FOOTER}
${SCRIPT}
</body>
</html>
`;
}

/* ─── запуск ──────────────────────────────────────────────────────────── */
const all = loadArticles();
if (!all.length) {
  console.log('в articles/ нет ни одной статьи — нечего собирать');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
for (const a of all) {
  const dir = path.join(OUT, a.slug);
  fs.mkdirSync(dir, { recursive: true });
  const html = renderArticle(a, all);
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  console.log(`/stati/${a.slug}/ — ${html.length} байт, фото в тексте: ${(a.body.match(/\[\[photo:/g) || []).length}`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), renderIndex(all), 'utf8');
console.log(`/stati/ — список из ${all.length} статей`);

/* ─── карточки на главной ────────────────────────────────────────────────
   Раздел «Разборы» на index.html собирается отсюда, между метками. Иначе
   при добавлении статьи её пришлось бы вписывать на главную руками — и
   однажды мы бы этого не сделали. */
const HOME = path.join(ROOT, 'index.html');
let home = fs.readFileSync(HOME, 'utf8');
const START = '<!-- STATI:START -->', END = '<!-- STATI:END -->';
const a1 = home.indexOf(START), a2 = home.indexOf(END);
if (a1 < 0 || a2 < 0) {
  console.log('⚠️  в index.html нет меток STATI — раздел на главной не обновлён');
} else {
  const cards = all.slice(0, 3).map(a => {
    const { w, h } = jpegSize(photoPath(a.cover));
    return `      <a class="art" href="/stati/${a.slug}/">
        <img src="assets/photo/${a.cover}.jpg" alt="${esc(a.coverAlt)}" width="${w}" height="${h}" loading="lazy" decoding="async">
        <div class="art-b">
          <span class="art-e">${a.eyebrow || 'Статья'}</span>
          <div class="art-t">${a.h1}</div>
          <div class="art-d">${a.cardText || a.description}</div>
        </div>
      </a>`;
  }).join('\n');
  home = home.slice(0, a1 + START.length) + '\n' + cards + '\n' + home.slice(a2);
  fs.writeFileSync(HOME, home, 'utf8');
  console.log(`index.html: раздел «Разборы» обновлён, карточек ${Math.min(3, all.length)}`);
  console.log('не забыть: node build/build-lang.js — иначе языковые версии отстанут');
}
console.log('sitemap.xml: адресов ' + buildSitemap(new Date().toISOString().slice(0, 10)));
