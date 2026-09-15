// src/lib/income.ts: parsing and bounds for the yearly income field, kept in
// step with the Flutter app's domain/profile/income.dart (test/income_test.dart
// there covers the same cases). Run with npm run test:parity.
import { parseIncome, incomeInputError, normalizeIncome, formatIncome } from '../src/lib/income';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};

check('plain number parses', parseIncome('65000'), 65000);
check('dollar sign and commas parse', parseIncome('$65,000'), 65000);
check('inner spaces parse', parseIncome(' 65 000 '), 65000);
check('cents parse', parseIncome('65000.50'), 65000.5);
check('empty is null', parseIncome(''), null);
check('words are null', parseIncome('abc'), null);
check('a lone dollar sign is null', parseIncome('$'), null);

check('zero is allowed', incomeInputError('0'), null);
check('a normal income is allowed', incomeInputError('65000'), null);
check('just under a billion is allowed', incomeInputError('999999999'), null);
check('empty is refused', incomeInputError('') !== null, true);
check('negative is refused', incomeInputError('-1') !== null, true);
check('a billion is refused', incomeInputError('1000000000') !== null, true);

check('whole numbers store without a tail', normalizeIncome(65000), '65000');
check('real cents are kept', normalizeIncome(65000.5), '65000.5');

check('stored income formats whole-dollar', formatIncome('65000'), '$65,000');
check('unparseable stored text passes through', formatIncome('sixty grand'), 'sixty grand');
check('absent income formats to null', formatIncome(''), null);

if (bad > 0) {
  console.error(`${bad} check(s) failed`);
  process.exit(1);
}
console.log('income parity: all checks passed');
