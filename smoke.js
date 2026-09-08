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

const handlers = {};   // запоминаем обработчики, чтобы нажимать кнопки в тесте

function el(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {},
    files: [], tagName: 'DIV',
    addEventListener(type, fn) { (handlers[id + ':' + type] ||= []).push(fn); },
    click() { (handlers[id + ':click'] || []).forEach((f) => f({ target: this })); },
    closest: () => el('x'), querySelector: () => el('y'),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    appendChild() {}, remove() {},
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

let printed = 0;
const window = { print() { printed++; } };
const alerts = [];
const saved = [];      // сюда попадают «скачанные» файлы
const run = new Function('window', 'document', 'localStorage', 'alert', 'atob', 'FileReader', 'Blob', 'URL',
  docx + '\n;\n' + page);

class FakeBlob {
  constructor(parts) { this.parts = parts; this.size = parts[0] ? parts[0].length : 0; }
}
globalThis.setTimeout = (fn) => { fn(); return 0; };   // второй файл скачивается с задержкой
run(window, document, localStorage, (m) => alerts.push(m), () => '', class {}, FakeBlob,
  { createObjectURL: (b) => { saved.push(b); return 'blob:x'; }, revokeObjectURL() {} });

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

// нажимаем «Word» так же, как это делает палец: с заполненной услугой
const list = nodes['items'];
const priceHandler = (handlers['items:input'] || [])[0];
if (priceHandler) {
  priceHandler({ target: { dataset: { price: '0' }, value: '45000', closest: () => ({ querySelector: () => null }) } });
  priceHandler({ target: { dataset: { name: '0' }, value: 'Проверочная услуга', closest: () => ({ querySelector: () => null }) } });
}
nodes['client'].value = Object.keys(data.clients)[0];

saved.length = 0;
nodes['wordInv'].click();
if (saved.length !== 1) problems.push('кнопка «Счёт Word» отдала файлов: ' + saved.length);
saved.length = 0;
nodes['wordAct'].click();
if (saved.length !== 1) problems.push('кнопка «Акт Word» отдала файлов: ' + saved.length);
saved.length = 0;
nodes['pdf'].click();
if (!nodes['paper'].innerHTML.includes('АКТ №')) problems.push('в печатной версии нет акта');
if (!nodes['paper'].innerHTML.includes('СЧЕТ №')) problems.push('в печатной версии нет счёта');
if (!printed) problems.push('кнопка PDF не вызвала печать');

// журнал и черновик
const jrn = JSON.parse(store['schet-journal'] || '[]');
if (jrn.length !== 1) problems.push('в журнале записей: ' + jrn.length + ', ожидалась одна');
else {
  const e = jrn[0];
  if (!e.number || !e.client || !e.total) problems.push('запись журнала неполная');
  if (!(e.kinds || []).length) problems.push('в записи не отмечено, что выпущено');
}
if (!nodes['cardLast'] || nodes['cardLast'].style.display !== 'block') {
  problems.push('строка последнего документа не показана');
}
if (!store['schet-draft']) problems.push('черновик не сохранён');

// журнал должен быть компактным, без слов про формат
(handlers['openJournal:click'] || []).forEach((f) => f({ target: nodes['openJournal'] }));
const jhtml = nodes['journalList'].innerHTML;
if (!jhtml.includes('jrow')) problems.push('журнал не в компактном виде');
if (jhtml.includes('выпущено')) problems.push('в журнале осталась пометка про формат');
if (!jhtml.includes('₽')) problems.push('в журнале нет суммы');
// заготовки должны стоять выше блока с заказчиком — проверяем по самой разметке
const posPresets = html.indexOf('id="cardPresets"');
const posClient = html.indexOf('id="cardClient"');
if (posPresets < 0) problems.push('нет блока с заготовками');
else if (posPresets > posClient) problems.push('заготовки стоят ниже блока с заказчиком');
if (!/id="preset1"[\s\S]{0,200}Консультации/.test(html)) problems.push('нет кнопки заготовки консультаций');
if (!/id="preset2"[\s\S]{0,200}Перевозка/.test(html)) problems.push('нет кнопки заготовки перевозки');

// вторая загрузка страницы: черновик должен вернуться
const nodes2 = {};
const handlers2 = {};
const document2 = {
  getElementById: (id) => (nodes2[id] || (nodes2[id] = el2(id))),
  querySelector: (sel) => (nodes2[sel] || (nodes2[sel] = el2(sel))),
  createElement: (t) => el2(t),
  body: { appendChild() {}, removeChild() {} },
};
function el2(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {}, files: [], tagName: 'DIV',
    addEventListener(type, fn) { (handlers2[id + ':' + type] ||= []).push(fn); },
    click() { (handlers2[id + ':click'] || []).forEach((f) => f({ target: this })); },
    closest: () => el2('x'), querySelector: () => el2('y'),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    appendChild() {}, remove() {},
  };
}
const run2 = new Function('window', 'document', 'localStorage', 'alert', 'atob', 'FileReader', 'Blob', 'URL',
  docx + '\n;\n' + page);
run2({ print() {} }, document2, localStorage, (m) => alerts.push(m), () => '', class {}, FakeBlob,
  { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
if (!nodes2['items'].innerHTML.includes('Проверочная услуга')) {
  problems.push('после возврата в приложение введённая услуга не вернулась');
}
if (nodes2['cardLast'].style.display !== 'block') problems.push('после возврата нет строки последнего документа');

if (problems.length) {
  console.log('НЕ В ПОРЯДКЕ:');
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('страница поднимается: клиенты, номер, дата, строка услуги и итог на месте');
console.log('  номер:', nodes['num'].value, '| дата:', nodes['date'].value);
console.log('  заказчиков в списке:', (client.innerHTML.match(/<option/g) || []).length);
console.log('  счёт и акт в Word выгружаются по отдельности, печатная версия содержит оба документа');
console.log('  в журнале записей:', jrn.length, '| черновик возвращается после перезагрузки');
