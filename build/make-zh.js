/**
 * Сборка lang-zh.js — китайского словаря.
 *
 * Ключи во всех словарях русские: так устроен движок applyLang. Переводы же
 * удобнее было делать с английского — он короче и уже вычитан. Поэтому здесь
 * связка идёт через английское значение: русский ключ → английское значение →
 * китайский перевод из build/zh/*.json.
 *
 * Значения без латинских букв (цены, «7,5–8 h», единицы) переносятся как есть:
 * переводить в них нечего, а переписывание цифр руками — лишний риск ошибки.
 *
 * Запуск из папки сайта:  node build/make-zh.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const en = (() => {
  const w = {};
  new Function('window', '"use strict";' + fs.readFileSync(path.join(ROOT, 'lang-en.js'), 'utf8'))(w);
  return w.EN;
})();

const map = {};
const dir = path.join(__dirname, 'zh');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const k of Object.keys(part)) {
    if (map[k] !== undefined && map[k] !== part[k]) {
      console.log('ВНИМАНИЕ: разные переводы одной строки в ' + f + ': ' + k.slice(0, 60));
    }
    map[k] = part[k];
  }
}

const hasLatin = s => /[A-Za-z]{2,}/.test(String(s).replace(/<[^>]*>/g, ''));

const out = {};
const missing = [];
for (const ruKey of Object.keys(en)) {
  const enVal = en[ruKey];
  if (!hasLatin(enVal)) { out[ruKey] = enVal; continue; }   // цифры и единицы — как есть
  const zh = map[enVal];
  if (zh === undefined) { missing.push(enVal); continue; }
  out[ruKey] = zh;
}

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const lines = [
  '/* Китайский словарь «Амур Атласа» (упрощённое письмо).',
  ' *',
  ' * Ключ — русский текст элемента, как и в lang-en.js: так устроен движок',
  ' * applyLang. Значение — китайский innerHTML, теги сохраняются.',
  ' * Нет ключа → остаётся русский, ничего не ломается.',
  ' *',
  ' * ⚠️ Перевод машинный, носителем НЕ вычитан. Цифры, цены и даты перенесены',
  ' * из проверенного русского исходника без изменений. Файл собирается',
  ' * скриптом build/make-zh.js из build/zh/*.json — руками не править,',
  ' * правки вносить в исходные json и пересобирать.',
  ' */',
  'window.ZH = {'
];

const keys = Object.keys(out);
keys.forEach((k, i) => {
  if (k.includes("'")) throw new Error('апостроф в ключе: ' + k);
  lines.push("  '" + k + "': `" + esc(out[k]) + '`' + (i === keys.length - 1 ? '' : ','));
});
lines.push('};', '');

fs.writeFileSync(path.join(ROOT, 'lang-zh.js'), lines.join('\n'), 'utf8');

console.log('ключей в lang-en.js: ' + Object.keys(en).length);
console.log('ключей в lang-zh.js: ' + keys.length);
console.log('без перевода: ' + missing.length);
missing.slice(0, 20).forEach(m => console.log('  · ' + m.slice(0, 90)));
