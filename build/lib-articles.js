/**
 * Загрузка исходников статей.
 *
 * Одна статья — один файл `articles/<slug>.js`, экспортирующий объект.
 * Читают его двое: сборщик страниц (build-articles.js) и сборщик карты
 * сайта (build-sitemap.js). Держим загрузку в одном месте, чтобы карта
 * сайта не разъезжалась со страницами — именно так мы уже влетели с
 * разметкой афиши, когда источников правды стало два.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'articles');

/* Обязательные поля. Без любого из них страница получится битой в выдаче:
   нет описания — Google придумает своё, нет обложки — не будет карточки. */
const REQUIRED = ['slug', 'title', 'h1', 'description', 'lead', 'date', 'cover', 'coverAlt', 'body'];

function loadArticles() {
  if (!fs.existsSync(DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort()) {
    const a = require(path.join(DIR, f));
    for (const k of REQUIRED) {
      if (!a[k]) throw new Error(`${f}: не заполнено поле «${k}»`);
    }
    if (a.slug !== path.basename(f, '.js')) {
      throw new Error(`${f}: slug «${a.slug}» не совпадает с именем файла`);
    }
    if (!fs.existsSync(path.join(ROOT, 'assets', 'photo', a.cover + '.jpg'))) {
      throw new Error(`${f}: нет обложки assets/photo/${a.cover}.jpg`);
    }
    a.updated = a.updated || a.date;
    out.push(a);
  }
  /* новые сверху — в этом порядке они идут и в списке, и в карте сайта */
  return out.sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0));
}

module.exports = { loadArticles, ROOT, DIR };
