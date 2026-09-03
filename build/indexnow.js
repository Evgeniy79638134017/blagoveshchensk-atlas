/**
 * Сообщить поисковикам о новых и изменённых страницах — протокол IndexNow.
 *
 * Зачем. До этого каждая публикация требовала от Евгения ручной работы:
 * зайти в Яндекс.Вебмастер, открыть «Переобход страниц», вставить адреса,
 * нажать «Отслеживать» у каждого. Четыре статьи — четыре захода, и часть
 * адресов просто терялась (03.09.2026 три статьи из четырёх остались
 * неотправленными именно так).
 *
 * IndexNow снимает это целиком: в корне сайта лежит файл-ключ, и любой
 * запрос с этим ключом принимается как подтверждение, что мы владеем
 * доменом. Протокол поддерживают Яндекс, Bing, Seznam и Naver — они
 * делятся уведомлениями между собой, поэтому достаточно одного запроса.
 *
 * ⚠️ Google IndexNow НЕ поддерживает. Там либо карта сайта (сама, медленнее),
 * либо «Проверка URL» в Search Console руками.
 *
 * Ключ публичный по устройству протокола: файл лежит в открытом доступе,
 * в этом и смысл — так поисковик проверяет владение доменом. Секретом он
 * не является, прятать его незачем.
 *
 * Запуск из папки сайта:
 *     node build/indexnow.js                     — все адреса из sitemap.xml
 *     node build/indexnow.js /stati/ /stati/x/   — только указанные
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const HOST = 'visitblg.ru';
const SITE = 'https://' + HOST;

/* ключ = имя файла <ключ>.txt в корне сайта. Ищем его сами, чтобы при
   смене ключа не надо было править код в двух местах. */
function findKey() {
  const f = fs.readdirSync(ROOT).find(n => /^[0-9a-f]{32}\.txt$/.test(n));
  if (!f) throw new Error('в корне нет файла-ключа вида <32 hex>.txt');
  const key = path.basename(f, '.txt');
  const inside = fs.readFileSync(path.join(ROOT, f), 'utf8').trim();
  if (inside !== key) throw new Error(`${f}: содержимое файла не совпадает с его именем`);
  return key;
}

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

function post(body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      host: 'api.indexnow.org', path: '/indexnow', method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length }
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({ code: res.statusCode, body: out.slice(0, 300) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const key = findKey();
  const args = process.argv.slice(2);
  const urls = args.length
    ? args.map(u => (u.startsWith('http') ? u : SITE + (u.startsWith('/') ? u : '/' + u)))
    : urlsFromSitemap();

  console.log('ключ: ' + key);
  console.log('адресов: ' + urls.length);
  urls.forEach(u => console.log('   ' + u));

  const r = await post({
    host: HOST,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls
  });

  /* 200 — принято, 202 — принято, ключ ещё проверяется.
     403 — ключ не найден по keyLocation, 422 — адреса не с того домена. */
  const say = { 200: 'принято', 202: 'принято, ключ проверяется',
                400: 'неверный запрос', 403: 'ключ не найден на сайте',
                422: 'адреса не совпадают с доменом', 429: 'слишком часто' };
  console.log(`\nответ ${r.code} — ${say[r.code] || 'неизвестный статус'}`);
  if (r.body) console.log(r.body);
  process.exit(r.code === 200 || r.code === 202 ? 0 : 1);
})();
