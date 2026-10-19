// Small CSV parser: quoted fields, doubled quotes, CR LF, and either comma or
// semicolon as separator (detected from the header line).

export function detectSeparator(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

/** Parse CSV text into { header, rows, separator } where rows are arrays of strings. */
export function parseCsv(text, { separator } = {}) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstBreak = text.indexOf('\n');
  const headerLine = (firstBreak === -1 ? text : text.slice(0, firstBreak)).replace(/\r$/, '');
  const sep = separator || detectSeparator(headerLine);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // skip, LF follows
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return { header, rows, separator: sep };
}

/** Parse to objects keyed by header name. */
export function parseCsvObjects(text, opts) {
  const { header, rows, separator } = parseCsv(text, opts);
  const objs = rows.map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? '';
    return o;
  });
  return { header, rows: objs, separator };
}

/** Throw with the real header when a wanted column is missing. */
export function requireColumns(header, wanted, label) {
  const missing = wanted.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(`${label}: missing column(s) ${missing.join(', ')}.\nActual header: ${header.join(',')}`);
  }
}
