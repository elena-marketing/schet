// Проверка на тесной памяти: у Елены в браузере лежал тяжёлый скан печати,
// и журнал переставал сохраняться после двух документов. Здесь память
// ограничена нарочно, чтобы поведение было видно в тесте, а не у неё в руках.
import { readFileSync } from 'fs';

const docx = readFileSync(new URL('./docx.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

const LIMIT = 400000;          // тесная квота: примерно как остаток после скана
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem(k, v) {
    const other = Object.keys(store).filter((x) => x !== k)
      .reduce((s, x) => s + store[x].length, 0);
    if (other + String(v).length > LIMIT) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    store[k] = String(v);
  },
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
// печать занимает половину доступного места, как это было у неё
store['schet-stamp'] = JSON.stringify({ dataUrl: 'data:image/png;base64,' + 'A'.repeat(180000), ext: 'png' });
store['schet-stamp-on'] = '0';

class FakeBlob { constructor(p) { this.parts = p; this.size = p[0] ? p[0].length : 0; } }
globalThis.setTimeout = (fn) => { fn(); return 0; };

const run = new Function('window', 'document', 'localStorage', 'alert', 'atob', 'FileReader', 'Blob', 'URL',
  docx + '\n;\n' + page);
const alerts = [];
run({ print() {}, addEventListener() {} }, document, localStorage, (m) => alerts.push(m),
  () => '', class {}, FakeBlob, { createObjectURL: () => 'blob:x', revokeObjectURL() {} });

const problems = [];
nodes['client'].value = Object.keys(data.clients)[0];
const input = (handlers['items:input'] || [])[0];
input({ target: { dataset: { name: '0' }, value: 'Услуга', closest: () => ({ querySelector: () => null }) } });
input({ target: { dataset: { price: '0' }, value: '10000', closest: () => ({ querySelector: () => null }) } });

const issued = [];
for (let n = 90; n <= 97; n++) {
  nodes['num'].value = String(n);
  nodes['wordInv'].click();
  issued.push(n);
}

const jrn = JSON.parse(store['schet-journal'] || '[]');
const nums = jrn.map((e) => e.number);
if (!nums.length) problems.push('журнал пуст, хотя выставлено восемь документов');
if (nums[0] !== 97) problems.push('последний документ не попал в журнал, сверху лежит № ' + nums[0]);
if (nums.length < 4) problems.push('в тесной памяти журнал схлопнулся до ' + nums.length + ' записей');

if (problems.length) {
  console.log('НЕ В ПОРЯДКЕ:');
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('тесная память: журнал держит', nums.length, 'из 8 документов, свежий всегда сверху');
console.log('  номера в журнале:', nums.join(', '));
