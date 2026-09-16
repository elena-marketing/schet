// Проверка трёх новых вещей на той же заглушке, что и smoke.js:
// подсев нового клиента, свой текст в перевозке, очистка журнала.
import { readFileSync } from 'fs';

const docx = readFileSync(new URL('./docx.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

function boot(seedStore) {
  const store = Object.assign({}, seedStore);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const handlers = {};
  const nodes = {};
  function el(id) {
    return {
      id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {},
      files: [], tagName: 'DIV',
      addEventListener(type, fn) { (handlers[id + ':' + type] ||= []).push(fn); },
      click(ev) { (handlers[id + ':click'] || []).forEach((f) => f(ev || { target: this })); },
      closest: () => el('x'), querySelector: () => el('y'),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      appendChild() {}, remove() {},
    };
  }
  const document = {
    getElementById: (id) => (nodes[id] || (nodes[id] = el(id))),
    querySelector: (sel) => (nodes[sel] || (nodes[sel] = el(sel))),
    createElement: (t) => el(t),
    body: { appendChild() {}, removeChild() {} },
  };
  const alerts = [];
  const confirms = [];
  const window = { print() {}, confirm: () => { confirms.push(1); return true; } };
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  globalThis.confirm = () => true;
  globalThis.alert = (m) => alerts.push(m);
  const run = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'atob',
    'FileReader', 'Blob', 'URL', docx + '\n;\n' + page);
  class FakeBlob { constructor(p) { this.parts = p; this.size = p[0] ? p[0].length : 0; } }
  run(window, document, localStorage, (m) => alerts.push(m), () => true, () => '',
      class {}, FakeBlob, { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
  return { store, nodes, handlers, alerts, el };
}

const full = JSON.parse(readFileSync(new URL('../dannye.json', import.meta.url), 'utf8'));
// телефон Елены: старые шесть клиентов, Туламашзавода ещё нет
const old = JSON.parse(JSON.stringify(full));
delete old.clients['туламашзавод'];
old.clients['свой-клиент'] = { short: 'ООО Своё', line: 'ИНН 1', actName: 'ООО Своё', kind: 'консультации' };

const problems = [];

// ── 1. новый клиент досыпается, чужое не затирается ─────────────────────────
{
  const { store, nodes } = boot({ 'schet-data': JSON.stringify(old) });
  const after = JSON.parse(store['schet-data']).clients;
  if (!after['туламашзавод']) problems.push('Туламашзавод не добавился');
  if (!after['свой-клиент']) problems.push('клиент, заведённый вручную, пропал');
  if (!nodes['client'].innerHTML.includes('АО Туламашзавод')) problems.push('нового клиента нет в списке');
  if (store['schet-seed'] !== 'seed-1') problems.push('отметка о подсеве не поставлена');
  console.log('  подсев: клиентов стало', Object.keys(after).length,
              '| свой клиент на месте:', !!after['свой-клиент']);

  // повторный запуск не должен ничего менять
  const again = boot(store);
  const a2 = JSON.parse(again.store['schet-data']).clients;
  if (Object.keys(a2).length !== Object.keys(after).length) problems.push('повторный запуск дублирует клиентов');
}

// ── 2. свой текст в перевозке ───────────────────────────────────────────────
{
  const { nodes, handlers } = boot({ 'schet-data': JSON.stringify(full) });
  const itemsClick = handlers['items:click'] || [];
  if (!itemsClick.length) problems.push('нет обработчика кликов по строкам');
  // включаем перевозку
  nodes['preset2'].click();
  const before = nodes['items'].innerHTML;
  if (!before.includes('data-custom="0"')) problems.push('кнопки «Ввести свой текст» нет в строке перевозки');
  // жмём «свой текст»
  itemsClick.forEach((f) => f({ target: { dataset: { custom: '0' } } }));
  const after = nodes['items'].innerHTML;
  if (!after.includes('data-name="0"')) problems.push('после переключения нет поля для своего текста');
  if (!after.includes('Перевозка автомобиля')) problems.push('собранное предложение не перенеслось в поле');
  if (!after.includes('data-fields="0"')) problems.push('нет кнопки возврата к полям');
  // возвращаем поля
  itemsClick.forEach((f) => f({ target: { dataset: { fields: '0' } } }));
  if (!nodes['items'].innerHTML.includes('data-car="0"')) problems.push('возврат к полям не сработал');
  console.log('  перевозка: переключение туда и обратно работает');
}

// ── 3. очистка журнала ──────────────────────────────────────────────────────
{
  const jrn = JSON.stringify([{ key: '1|01.01.2026', number: 1, dateStr: '01.01.2026', client: 'Тест', total: 100 }]);
  const { store, nodes } = boot({ 'schet-data': JSON.stringify(full), 'schet-journal': jrn });
  if (!nodes['lastLine'].textContent.includes('Тест')) problems.push('журнал не отрисовался до очистки');
  nodes['clearJournal'].click();
  if (store['schet-journal'] !== undefined) problems.push('журнал не очистился');
  if (nodes['cardLast'].style.display !== 'none') problems.push('строка «последний документ» осталась висеть');
  console.log('  журнал: очищается, плашка последнего документа прячется');
}

if (problems.length) { console.log('\nПРОБЛЕМЫ:'); problems.forEach((p) => console.log('  -', p)); process.exit(1); }
console.log('\nвсё три правки работают');
