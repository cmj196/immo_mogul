// Settling a sale: broker fee, gains tax, loan payoff, removal of the lot and its units.

import { saleBreakdown } from './tax.js';
import { post, emit } from './ledger.js';
import { chf } from './money.js';
import { buildingOf } from './world.js';
import { loansOfLot } from './state.js';
import { checkMilestones } from './report.js';

export function settleSale(s, world, events, lotId, price) {
  const lot = s.lots[lotId];
  if (!lot) throw new Error(`settleSale: unknown lot ${lotId}`);
  const bd = saleBreakdown(s, world, lotId, price);
  const b = buildingOf(world, lot.buildingId);
  post(s, events, { reason: 'sale', amount: price, lotId });
  if (bd.broker) post(s, events, { reason: 'broker', amount: -bd.broker, lotId });
  if (bd.tax) {
    post(s, events, { reason: 'gainsTax', amount: -bd.tax, lotId, text: `Property gains tax on ${b.street} ${b.no}: ${chf(bd.tax)} (${bd.adjustmentPct > 0 ? '+' : ''}${bd.adjustmentPct}% for ${bd.fullYears} full year${bd.fullYears === 1 ? '' : 's'} held).` });
    s.stats.gainsTax += bd.tax;
  }
  for (const loan of loansOfLot(s, lotId)) {
    post(s, events, { reason: 'repay', amount: -loan.balance, loanId: loan.id, lotId });
    delete s.loans[loan.id];
  }
  s.pending = s.pending.filter((p) => !(p.loanId && !s.loans[p.loanId]) && !(p.unitId && !lot.unitIds.includes(p.unitId) ? false : p.unitId && lot.unitIds.includes(p.unitId)));
  for (const unitId of lot.unitIds) delete s.units[unitId];
  delete s.lots[lotId];
  if (s.negotiation && s.negotiation.lotId === lotId) s.negotiation = null;
  s.stats.sold += 1;
  s.year.sold += 1;
  if (bd.gain > 0) s.stats.salesWithGain = (s.stats.salesWithGain || 0) + 1;
  emit(s, events, 'sold', { lotId, price, net: bd.net, gain: bd.gain, tax: bd.tax }, `Sold ${b.street} ${b.no} for ${chf(price)}: ${chf(bd.net, { sign: true })} to your account after fees, tax and the mortgage.`);
  checkMilestones(s, world, events);
  return bd;
}
