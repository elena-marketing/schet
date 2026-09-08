// Глубокая проверка сценариев, которые руками каждый раз не прощёлкаешь:
// разовый заказчик, разбор чужих реквизитов, сборка строки перевозки
// и документы на пять строк с печатью.
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
const handlers = {};
function el(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {}, files: [], tagName: 'DIV',
    addEventListener(type, fn) { (handlers[id + ':' + type] ||= []).push(fn); },
    click() { (handlers[id + ':click'] || []).forEach((f) => f({ target: this })); },
    closest: () => el('x'), querySelector: () => el('y'),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    scrollIntoView() {}, appendChild() {}, remove() {},
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

class FakeBlob { constructor(p) { this.parts = p; this.size = p[0] ? p[0].length : 0; } }
globalThis.setTimeout = (fn) => { fn(); return 0; };
const saved = [];
const alerts = [];
const win = { print() {}, addEventListener() {} };
// Код страницы спрятан в замыкание, поэтому внутренние функции достаём,
// подставив выдачу наружу перед самой последней закрывающей скобкой.
const cut = page.lastIndexOf('})();');
const opened = page.slice(0, cut)
  + '\nwindow.__test = { parseRequisites, itemName };\n'
  + page.slice(cut);
const run = new Function('window', 'document', 'localStorage', 'alert', 'atob', 'FileReader', 'Blob', 'URL',
  docx + '\n;\n' + opened);
run(win, document, localStorage, (m) => alerts.push(m), () => '', class {}, FakeBlob,
  { createObjectURL: (b) => { saved.push(b); return 'blob:x'; }, revokeObjectURL() {} });

const T = win.__test;
const problems = [];
const input = (handlers['items:input'] || [])[0];

// 1. разбор реквизитов в разных записях
const cases = [
  ['ООО «Ромашка», ИНН 7701234567, КПП 770101001, 127006, г. Москва, ул. Долгоруковская, д. 5',
   'ИНН/КПП 7701234567/770101001'],
  ['ИНН/КПП 7702070139/770943003 Банк ВТБ (ПАО) 191144, г.Санкт-Петербург, пер. Дегтярный, 11',
   'ИНН/КПП 7702070139/770943003 Банк ВТБ (ПАО)'],
  ['ИП Смирнов Иван Петрович ИНН 710612345678 ОГРНИП 324620000053982 300000, г. Тула, ул. Мира, 3',
   'ОГРНИП 324620000053982'],
];
for (const [text, expect] of cases) {
  const line = T.parseRequisites(text).line;
  if (!line.includes(expect)) problems.push('разбор реквизитов: в «' + line + '» нет «' + expect + '»');
}

// 2. строка перевозки собирается из полей
const line = T.itemName({ mode: 'перевозка', car: 'Лада Гранта', plate: 'А123ВС71',
  from: 'г. Тула', to: 'г. Москва' });
const wantLine = 'Перевозка автомобиля Лада Гранта, гос. номер А123ВС71, от г. Тула до г. Москва, без договора';
if (line !== wantLine) problems.push('строка перевозки собралась как «' + line + '»');

// 3. разовый заказчик: документ выпускается, в справочник не попадает
nodes['client'].value = '__new';
nodes['ooLine'].value = 'ИНН 7100000000 КПП-, ООО «Разовый», 300000, г. Тула, ул. Ленина, д. 1';
nodes['ooName'].value = 'ООО «Разовый»';
input({ target: { dataset: { name: '0' }, value: 'Разовая услуга', closest: () => ({ querySelector: () => null }) } });
input({ target: { dataset: { price: '0' }, value: '7000', closest: () => ({ querySelector: () => null }) } });
nodes['num'].value = '120';
saved.length = 0;
nodes['wordInv'].click();
if (saved.length !== 1) problems.push('по разовому заказчику счёт не выпустился');
const clients = JSON.parse(store['schet-data']).clients;
if (Object.keys(clients).length !== Object.keys(data.clients).length) {
  problems.push('разовый заказчик попал в справочник, а не должен был');
}

// 4. документы на пять строк с печатью
const S = globalThis.SCHET;
S.setIsp(JSON.parse(store['schet-data']).isp);
const stampBytes = new Uint8Array(readFileSync(
  '/tmp/claude-1000/-home-ubuntu-IO-home/9e4327fc-bd19-49f3-916c-242d82ae488f/scratchpad/pechat.png'));
const stamp = { bytes: stampBytes, ext: 'png' };
const many = [1, 2, 3, 4, 5].map((i) => ({ name: 'Перевозка номер ' + i, qty: 1, price: 1000 * i }));
const client = { line: 'ИНН/КПП 1/2 ООО «Тест»', actName: 'ООО «Тест»' };
const inv = S.buildInvoice({ number: 5, dateStr: '08.09.2026', client, items: many, stamp });
const act = S.buildAct({ number: 5, dateStr: '08.09.2026', dateWords: '«08» сентября 2026 г.',
  client, items: many, stamp });
for (const [name, xml] of [['счёт', inv], ['акт', act]]) {
  const rows = (xml.match(/Перевозка номер/g) || []).length;
  if (rows !== 5) problems.push(name + ': строк в таблице ' + rows + ', а должно пять');
  if (!xml.includes('Пятнадцать тысяч рублей, 00 копеек')
      && !xml.includes('пятнадцать тысяч рублей, 00 коп.')) {
    problems.push(name + ': сумма прописью не сошлась');
  }
  if (!xml.includes('<wp:anchor')) problems.push(name + ': печать не встала');
}
// 5. печать привязана к самой строке подписи, а не к следующему абзацу:
// иначе её положение зависит от промежутка между абзацами в просмотрщике
for (const rows of [1, 3, 5]) {
  const list = Array.from({ length: rows }, (_, i) => ({ name: 'Строка ' + (i + 1), qty: 1, price: 1000 }));
  const a = S.buildAct({ number: 1, dateStr: 'д', dateWords: 'д', client, items: list, stamp });
  const inv2 = S.buildInvoice({ number: 1, dateStr: 'д', client, items: list, stamp });
  const inSign = (xml, mark) => {
    const par = xml.split('<w:p>').find((b) => b.includes(mark));
    return !!par && par.includes('<wp:anchor');
  };
  if (!inSign(a, 'С.С. Пирогов')) problems.push('акт на ' + rows + ' строк: печать не в строке подписи');
  if (!inSign(inv2, 'Бухгалтер')) problems.push('счёт на ' + rows + ' строк: печать не в строке подписи');
}

// 6. в обоих документах печать поднята одинаково и стоит по центру
const offOf = (x) => Number((x.match(/positionV[\s\S]*?<wp:posOffset>(-?\d+)</) || [])[1]);
if (offOf(inv) !== offOf(act)) {
  problems.push('печать поднята по-разному: счёт ' + offOf(inv) + ', акт ' + offOf(act));
}
for (const [name, xml] of [['счёт', inv], ['акт', act]]) {
  if (!xml.includes('<wp:align>center</wp:align>')) problems.push(name + ': печать не по центру');
}

if (alerts.length) problems.push('всплыли сообщения: ' + alerts.join('; '));

if (problems.length) {
  console.log('НЕ В ПОРЯДКЕ:');
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('глубокая проверка пройдена:');
console.log('  реквизиты разбираются в трёх записях, строка перевозки собирается верно');
console.log('  разовый заказчик выпускается и не попадает в справочник');
console.log('  счёт и акт на пять строк: суммы, прописи и печать на месте');
console.log('  печать держится в строке подписи при 1, 3 и 5 строках в таблице');
console.log('  печать по центру и поднята одинаково в обоих документах:', offOf(inv));
