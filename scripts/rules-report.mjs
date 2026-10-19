// Prints the rules table grouped by status (verified, secondary, assumption): one line per rule
// with its value, source and check date.
//
//   node scripts/rules-report.mjs [--status assumption]

import { RULES, rulesByStatus } from '../src/data/rules.js';

const args = process.argv.slice(2);
const i = args.indexOf('--status');
const only = i >= 0 ? args[i + 1] : null;

function valueText(v) {
  if (typeof v === 'object' && v !== null) {
    const text = JSON.stringify(v);
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }
  return String(v);
}

const ORDER = ['verified', 'secondary', 'assumption'];
const LABEL = { verified: 'Verified (official page read)', secondary: 'Secondary (bank, court or industry page)', assumption: 'Assumption (no free source; tuned in simulation)' };

const total = Object.keys(RULES).length;
console.log(`Immo Mogul rules: ${total} entries`);
for (const status of ORDER) {
  if (only && status !== only) continue;
  const rows = rulesByStatus(status);
  console.log('');
  console.log(`${LABEL[status]}: ${rows.length}`);
  console.log('-'.repeat(LABEL[status].length + 4));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  const valWidth = Math.min(40, Math.max(...rows.map((r) => valueText(r.value).length)));
  for (const r of rows) {
    console.log(`${r.id.padEnd(idWidth)}  ${valueText(r.value).padEnd(valWidth)}  ${r.checked}  ${r.source}`);
  }
}
const unknown = Object.values(RULES).filter((r) => !ORDER.includes(r.status));
if (unknown.length) {
  console.log('');
  console.log(`Rules with an unknown status: ${unknown.map((r) => `${r.id} (${r.status})`).join(', ')}`);
  process.exitCode = 1;
}
