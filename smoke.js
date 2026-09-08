// Проверка страницы без браузера: подсовываем заглушки DOM и localStorage,
// запускаем оба скрипта в одной области — ровно как это делает телефон.
// Появилась после того, как страница уехала к пользователю неработающей:
// два скрипта объявили одну и ту же переменную, и всё молча упало.
import { readFileSync } from 'fs';

const docx = readFileSync(new URL('./docx.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

function el(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {},
    files: [], addEventListener() {}, click() {}, closest: () => el('x'),
    querySelector: () => el('y'), appendChild() {}, remove() {},
  };
}
const nodes = {};
const document = {
  getElementById: (id) => (nodes[id] || (nodes[id] = el(id))),
  querySelector: (sel) => (nodes[sel] || (nodes[sel] = el(sel))),
  createElement: (t) => el(t),
  body: { appendChild() {}, removeChild() {} },
};

const data = JSON.parse(readFileSync(new URL('../dannye.json', import.meta.url), 'utf8'));
store['schet-data'] = JSON.stringify(data);

const window = {};
const alerts = [];
const run = new Function('window', 'document', 'localStorage', 'alert', 'atob', 'FileReader', 'Blob', 'URL',
  docx + '\n;\n' + page);

run(window, document, localStorage, (m) => alerts.push(m), () => '', class {}, class {}, { createObjectURL: () => '', revokeObjectURL() {} });

const problems = [];
const client = nodes['client'];
if (!client || !client.innerHTML.includes('Банк ВТБ')) problems.push('список заказчиков не заполнен');
if (Object.keys(data.clients).some((k) => !client.innerHTML.includes(data.clients[k].short))) {
  problems.push('в списке не все клиенты');
}
if (!nodes['num'] || !Number(nodes['num'].value)) problems.push('номер не подставлен');
if (!nodes['date'] || !/^\d{4}-\d{2}-\d{2}$/.test(nodes['date'].value)) problems.push('дата не подставлена');
if (!nodes['items'] || !nodes['items'].innerHTML.includes('Кол-во')) problems.push('строка услуги не отрисована');
if (!nodes['total'] || !nodes['total'].textContent.includes('₽')) problems.push('итог не показан');
if (nodes['setup'] && nodes['setup'].style.display === 'block') problems.push('показан экран первого запуска');
if (alerts.length) problems.push('всплыли сообщения: ' + alerts.join('; '));

if (problems.length) {
  console.log('НЕ В ПОРЯДКЕ:');
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('страница поднимается: клиенты, номер, дата, строка услуги и итог на месте');
console.log('  номер:', nodes['num'].value, '| дата:', nodes['date'].value);
console.log('  заказчиков в списке:', (client.innerHTML.match(/<option/g) || []).length);
