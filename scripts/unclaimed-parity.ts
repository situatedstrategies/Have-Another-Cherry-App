import { isUnclaimed, getTotalRemainingOwedToPayer, getExpenseStatusLabel } from '../src/lib/money';
let f=0; const eq=(n:string,g:any,w:any)=>{const G=JSON.stringify(g),W=JSON.stringify(w);
 if(G!==W){f++;console.log(`FAIL ${n}\n  got ${G}\n  want ${W}`)}else console.log(`ok   ${n}`)};
const mk=(o:any)=>({id:'x',date:'2026-09-01',amount:60,shares:{vivi:30,rob:30},status:'OPEN',settlements:[],...o}) as any;

eq('empty payer is unclaimed', isUnclaimed(mk({paidBy:''})), true);
eq('whitespace payer is unclaimed', isUnclaimed(mk({paidBy:'   '})), true);
eq('missing payer is unclaimed', isUnclaimed(mk({})), true);
eq('a real payer is not', isUnclaimed(mk({paidBy:'rob'})), false);
eq('unclaimed owes nobody', getTotalRemainingOwedToPayer(mk({paidBy:''}), false), 0);
eq('claimed owes the other share', getTotalRemainingOwedToPayer(mk({paidBy:'rob'}), false), 30);
eq('unclaimed label', getExpenseStatusLabel(mk({paidBy:''})), 'Needs a payer');
eq('claimed label', getExpenseStatusLabel(mk({paidBy:'rob'})), 'Open');
console.log(f===0?'\nWEB MATCHES THE FLUTTER SEMANTICS':`\n${f} FAILURE(S)`);
process.exit(f===0?0:1);
