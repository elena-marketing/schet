// Сборка счёта и акта в формате Word прямо в телефоне.
// Никакого сервера: .docx — это zip с несколькими xml внутри, а zip
// собирается вручную, без сжатия. Так страница остаётся одним файлом.

// Реквизиты и клиенты в коде не хранятся: страница лежит на открытом хостинге,
// а это банковский счёт и домашние адреса. Данные вводятся один раз на телефоне
// и живут только в нём.
let ISP = {
  name: '', shortName: '', sign: '', signShort: '',
  inn: '', address: '', phone: '',
  bank: '', bik: '', ks: '', rs: '',
};

function setIsp(data) { ISP = Object.assign({}, ISP, data || {}); }

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ── сумма прописью ───────────────────────────────────────────────────────────
const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
  'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
  'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triad(n, female) {
  const ones = female ? ONES_F : ONES_M;
  const out = [];
  if (n >= 100) { out.push(HUNDREDS[Math.floor(n / 100)]); n %= 100; }
  if (n >= 10 && n <= 19) {
    out.push(TEENS[n - 10]);
  } else {
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; }
    if (n) out.push(ones[n]);
  }
  return out.filter(Boolean);
}

function plural(n, one, few, many) {
  const h = Math.abs(n) % 100;
  if (h >= 11 && h <= 14) return many;
  const t = h % 10;
  if (t === 1) return one;
  if (t >= 2 && t <= 4) return few;
  return many;
}

function rublesInWords(amount) {
  const rub = Math.floor(amount + 1e-9);
  const kop = Math.round((amount - rub) * 100);
  let words = [];
  if (rub === 0) {
    words = ['ноль'];
  } else {
    const groups = [];
    let n = rub;
    while (n) { groups.push(n % 1000); n = Math.floor(n / 1000); }
    const names = [null,
      [true, ['тысяча', 'тысячи', 'тысяч']],
      [false, ['миллион', 'миллиона', 'миллионов']],
      [false, ['миллиард', 'миллиарда', 'миллиардов']]];
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (!g) continue;
      words = words.concat(triad(g, i ? names[i][0] : false));
      if (i) words.push(plural(g, ...names[i][1]));
    }
  }
  const tail = plural(rub, 'рубль', 'рубля', 'рублей');
  let phrase = words.join(' ') + ' ' + tail;
  phrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return phrase + ', ' + String(kop).padStart(2, '0') + ' копеек';
}

const money = (v) => v.toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── минимальный zip ──────────────────────────────────────────────────────────
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

function crc32(bytes) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  // files: [{name, text}] — храним без сжатия, документ маленький
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (arr) => { chunks.push(arr); offset += arr.length; };
  const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.bytes ? f.bytes : enc.encode(f.text);
    const crc = crc32(data);
    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0));
    const start = offset;
    push(Uint8Array.from(local));
    push(nameBytes);
    push(data);
    central.push({ name: nameBytes, crc, size: data.length, start });
  }

  const centralStart = offset;
  for (const c of central) {
    const head = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.size), u32(c.size),
      u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.start));
    push(Uint8Array.from(head));
    push(c.name);
  }
  const end = [].concat(
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(offset - centralStart), u32(centralStart), u16(0));
  push(Uint8Array.from(end));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// ── разметка Word ────────────────────────────────────────────────────────────
function contentTypes(imageExt) {
  const extra = imageExt
    ? `<Default Extension="${imageExt}" ContentType="image/${imageExt === 'jpg' ? 'jpeg' : imageExt}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>${extra}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function docRels(imageName) {
  const rel = imageName
    ? `<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageName}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
}

// размеры картинки нужны, чтобы печать не сплющило: читаем их прямо из файла
function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {           // PNG: IHDR идёт первым
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {           // JPEG: ищем маркер SOF
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const m = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + len;
    }
  }
  return { w: 600, h: 600 };
}

// Печать со скана: ширина 5 см, высота по пропорции. Картинка плавающая и уходит
// за текст, поэтому оттиск ложится прямо на строки подписи, как на бумаге.
// up — насколько поднять её над своей строкой, долями от высоты картинки.
function stampRun(bytes, up, left) {
  const { w, h } = imageSize(bytes);
  const cx = 1550000;
  const cy = Math.round(cx * h / w);
  const dy = -Math.round(cy * (up === undefined ? 0.7 : up));
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0"
 relativeHeight="3" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<wp:simplePos x="0" y="0"/>
<wp:positionH relativeFrom="column"><wp:posOffset>${left === undefined ? 1150000 : left}</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="paragraph"><wp:posOffset>${dy}</wp:posOffset></wp:positionV>
<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:wrapNone/><wp:docPr id="7" name="Печать"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="7" name="Печать"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImg"/>
<a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

function stampParagraph(bytes, up, left) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${stampRun(bytes, up, left)}</w:p>`;
}

function runProps(bold, size) {
  return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>` +
    (bold ? '<w:b/>' : '') + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
}

function p(text, opts = {}) {
  const { bold, size = 20, align, space = 0, lead } = opts;
  const rPr = runProps(bold, size);
  const pPr = `<w:pPr><w:spacing w:before="${space}" w:after="${space}" w:line="240" w:lineRule="auto"/>` +
    (align ? `<w:jc w:val="${align}"/>` : '') + rPr + '</w:pPr>';
  // lead — начало строки жирным: «Заказчик:» выделяется, а реквизиты идут обычным
  const runs = lead
    ? `<w:r>${runProps(true, size)}<w:t xml:space="preserve">${esc(lead)}</w:t></w:r>` +
      `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
    : `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function tc(text, width, opts = {}) {
  const { bold, align, size = 18, shade } = opts;
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (shade ? `<w:shd w:val="clear" w:fill="${shade}"/>` : '') +
    `<w:vAlign w:val="center"/></w:tcPr>${p(text, { bold, align, size })}</w:tc>`;
}

function tr(cells) { return `<w:tr>${cells.join('')}</w:tr>`; }

function table(rows, opts = {}) {
  const borders = opts.borders === false ? '<w:tblBorders/>' :
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('')}</w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/>${borders}</w:tblPr>${rows.join('')}</w:tbl>`;
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="600" w:right="560" w:bottom="600" w:left="620" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr></w:body></w:document>`;
}

function bankBlock() {
  const rows = [
    tr([tc(ISP.bank, 5400), tc('БИК', 1100, { size: 16 }), tc(ISP.bik, 3100)]),
    tr([tc('Банк получателя', 5400, { size: 16 }), tc('Сч. №', 1100, { size: 16 }), tc(ISP.ks, 3100)]),
    tr([tc('ИНН ' + ISP.inn, 5400), tc('Сч. №', 1100, { size: 16 }), tc(ISP.rs, 3100)]),
    tr([tc(ISP.name, 5400), tc('', 1100), tc('', 3100)]),
    tr([tc('Получатель', 5400, { size: 16 }), tc('', 1100), tc('', 3100)]),
  ];
  return table(rows);
}

function itemsTable(items, isAct) {
  const head = isAct
    ? [tc('№', 500, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Наименование работ, услуг', 5300, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Кол-во', 900, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Ед.', 700, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Цена', 1100, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Сумма', 1100, { bold: true, align: 'center', shade: 'F2F2F2' })]
    : [tc('№', 500, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Наименование товаров (работ, услуг)', 5300, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Ед.', 700, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Кол-во', 900, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Цена', 1100, { bold: true, align: 'center', shade: 'F2F2F2' }),
       tc('Сумма', 1100, { bold: true, align: 'center', shade: 'F2F2F2' })];

  const rows = [tr(head)];
  items.forEach((it, i) => {
    const qty = it.qty || 1;
    const sum = qty * it.price;
    const cells = isAct
      ? [tc(String(i + 1), 500, { align: 'center' }), tc(it.name, 5300),
         tc(money(qty), 900, { align: 'center' }), tc('шт', 700, { align: 'center' }),
         tc(money(it.price), 1100, { align: 'right' }), tc(money(sum), 1100, { align: 'right' })]
      : [tc(String(i + 1), 500, { align: 'center' }), tc(it.name, 5300),
         tc('шт.', 700, { align: 'center' }), tc(money(qty), 900, { align: 'center' }),
         tc(money(it.price), 1100, { align: 'right' }), tc(money(sum), 1100, { align: 'right' })];
    rows.push(tr(cells));
  });
  return table(rows);
}

function totalsBlock(total, withPayLine = true) {
  // В акте строки «Всего к оплате» нет: акт подтверждает работу, а не требует денег.
  const rows = [
    tr([tc('', 6700, { align: 'right' }), tc('Итого:', 1700, { bold: true, align: 'right' }),
        tc(money(total), 1200, { bold: true, align: 'right' })]),
    tr([tc('', 6700), tc('Без налога (НДС)', 1700, { align: 'right' }), tc('', 1200)]),
  ];
  if (withPayLine) {
    rows.push(tr([tc('', 6700), tc('Всего к оплате:', 1700, { bold: true, align: 'right' }),
      tc(money(total), 1200, { bold: true, align: 'right' })]));
  }
  return table(rows, { borders: false });
}

function buildInvoice({ number, dateStr, client, items, stamp }) {
  const total = items.reduce((s, i) => s + (i.qty || 1) * i.price, 0);
  const body = [
    bankBlock(),
    p(''),
    p(`СЧЕТ № ${number} от ${dateStr}г.`, { bold: true, size: 28, align: 'center' }),
    p(''),
    p(` ИНН ${ISP.inn}, КПП-, ${ISP.name}, ${ISP.address}, тел. ${ISP.phone}`,
      { lead: 'Исполнитель:' }),
    p(' ' + client.line, { lead: 'Заказчик:' }),
    p(''),
    itemsTable(items, false),
    totalsBlock(total),
    p(''),
    p(`Всего наименований ${items.length}, на сумму: ${money(total)} руб.`, { bold: true }),
    p(rublesInWords(total), { bold: true }),
    p(''),
    p(''),
    p(`Руководитель _____________________ (${ISP.signShort})`),
    p(''),
    p(`Бухгалтер       _____________________ (${ISP.signShort})`),
    stamp ? stampParagraph(stamp.bytes, 1.25) : p(''),
    stamp ? p('') : p('М.П.'),
  ].join('');
  return documentXml(body);
}

function buildAct({ number, dateStr, dateWords, client, items, stamp }) {
  const total = items.reduce((s, i) => s + (i.qty || 1) * i.price, 0);
  let words = rublesInWords(total);
  words = words.charAt(0).toLowerCase() + words.slice(1);
  words = words.replace(' копеек', ' коп.');
  const body = [
    p(`АКТ № ${number} от ${dateWords}`, { bold: true, size: 26, align: 'center' }),
    p(''),
    p(' ' + ISP.shortName, { lead: 'Исполнитель:' }),
    p(' ' + client.actName, { lead: 'Заказчик:' }),
    p(''),
    itemsTable(items, true),
    totalsBlock(total, false),
    p(''),
    p(`Всего оказано услуг ${items.length}, на сумму ${words}`, { bold: true }),
    p('(сумма прописью)', { size: 16 }),
    p(''),
    p('Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, ' +
      'качеству и срокам оказания услуг не имеет.'),
    p(''),
    p('Индивидуальный предприниматель'),
    p(`_________________________${ISP.sign}`),
    stamp ? stampParagraph(stamp.bytes, 0.95, 250000) : p('М.П.'),
    p(''),
    p('Грузоотправитель/грузополучатель'),
    p('_________________/_____________'),
    p('М.П.'),
  ].join('');
  return documentXml(body);
}

function docxBytes(documentXmlText, image) {
  const ext = image ? image.ext : null;
  const imgName = image ? 'stamp.' + ext : null;
  const files = [
    { name: '[Content_Types].xml', text: contentTypes(ext) },
    { name: '_rels/.rels', text: RELS },
    { name: 'word/_rels/document.xml.rels', text: docRels(imgName) },
    { name: 'word/document.xml', text: documentXmlText },
  ];
  if (image) files.push({ name: 'word/media/' + imgName, bytes: image.bytes });
  return zip(files);
}

const API = { get ISP() { return ISP; }, setIsp, imageSize, MONTHS, rublesInWords, money, buildInvoice, buildAct, docxBytes, zip };
if (typeof window !== 'undefined') window.SCHET = API;
if (typeof globalThis !== 'undefined') globalThis.SCHET = API;
