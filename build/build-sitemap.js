/**
 * Карта сайта — единственный источник правды.
 *
 * Раньше sitemap собирался внутри build-lang.js и знал только про три
 * страницы: главную и две языковые. Появились статьи — и любая пересборка
 * языковых версий вычищала бы их из карты. Поэтому сборка вынесена сюда,
 * а build-lang.js и build-articles.js её просто зовут.
 *
 * Запуск отдельно (дата — необязательный аргумент):
 *     node build/build-sitemap.js 2026-09-03
 */

const fs = require('fs');
const path = require('path');
const { loadArticles } = require('./lib-articles.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://visitblg.ru';

const LANGS = [{ dir: 'en', hreflang: 'en' }, { dir: 'cn', hreflang: 'zh-Hans' }];

/* Картинки главной — их поиск показывает в выдаче по картинкам */
const HOME_IMAGES = [
  [SITE + '/assets/og-preview.jpg', 'Благовещенск — город на Амуре, лицом к Китаю'],
  [SITE + '/assets/hero.jpg', 'Триумфальная арка на набережной Амура, за рекой — китайский Хэйхэ'],
  [SITE + '/assets/ropeway.jpg', 'Канатная дорога Благовещенск — Хэйхэ, проектная визуализация терминала']
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function imgBlock(list) {
  if (!list.length) return '';
  return list.map(([loc, title]) =>
    `      <image:image>\n        <image:loc>${loc}</image:loc>\n` +
    `        <image:title>${esc(title)}</image:title>\n      </image:image>`).join('\n') + '\n';
}

function urlNode({ loc, lastmod, changefreq, priority, alt = '', images = [] }) {
  return `    <url>\n      <loc>${loc}</loc>\n      <lastmod>${lastmod}</lastmod>\n` +
         `      <changefreq>${changefreq}</changefreq>\n      <priority>${priority}</priority>\n` +
         (alt ? alt + '\n' : '') + imgBlock(images) + `    </url>`;
}

function buildSitemap(lastmod) {
  /* 1. главная и языковые версии — один документ на трёх языках,
        поэтому у каждой перечислены все альтернативы */
  const pages = [{ loc: SITE + '/', lang: 'ru' }]
    .concat(LANGS.map(l => ({ loc: `${SITE}/${l.dir}/`, lang: l.hreflang })));

  const alt = pages.map(p => `      <xhtml:link rel="alternate" hreflang="${p.lang}" href="${p.loc}"/>`)
    .concat([`      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`])
    .join('\n');

  const nodes = pages.map((p, i) => urlNode({
    loc: p.loc, lastmod, changefreq: 'weekly', priority: i === 0 ? '1.0' : '0.8',
    alt, images: i === 0 ? HOME_IMAGES : []
  }));

  /* 2. статьи. Языковых версий у них нет — alternate не ставим:
        пустой hreflang хуже отсутствующего, он обещает то, чего нет. */
  const articles = loadArticles();
  if (articles.length) {
    nodes.push(urlNode({
      loc: SITE + '/stati/', lastmod, changefreq: 'weekly', priority: '0.7'
    }));
    for (const a of articles) {
      nodes.push(urlNode({
        loc: `${SITE}/stati/${a.slug}/`,
        lastmod: a.updated || a.date,
        changefreq: 'monthly',
        priority: '0.7',
        images: [[`${SITE}/assets/photo/${a.cover}.jpg`, a.coverAlt]]
      }));
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${nodes.join('\n')}\n</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  return nodes.length;
}

module.exports = { buildSitemap };

if (require.main === module) {
  const d = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log('sitemap.xml: адресов ' + buildSitemap(d) + ', lastmod ' + d);
}
