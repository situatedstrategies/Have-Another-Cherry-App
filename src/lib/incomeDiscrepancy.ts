// Each member's reported income against what the others estimated for them.
// A gap over 10% counts; the worst relative gap tunes the alignment modal's
// conversation starter.
export function computeIncomeDiscrepancy(groupUsers: Record<string, any>): {
  hasIncomeDiscrepancy: boolean;
  incomeDiscrepancyPct: number;
} {
  let hasIncomeDiscrepancy = false;
  let incomeDiscrepancyPct = 0;
  if (groupUsers && Object.keys(groupUsers).length >= 2) {
    const userIds = Object.keys(groupUsers);
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const u1 = groupUsers[userIds[i]];
        const u2 = groupUsers[userIds[j]];

        const u1Income = Number(u1.income);
        const u1PartnerEst = Number(u1.partnerIncome);
        const u2Income = Number(u2.income);
        const u2PartnerEst = Number(u2.partnerIncome);

        if (u1Income && u2PartnerEst && Math.abs(u1Income - u2PartnerEst) > u1Income * 0.1) {
          hasIncomeDiscrepancy = true;
          incomeDiscrepancyPct = Math.max(
            incomeDiscrepancyPct,
            (Math.abs(u1Income - u2PartnerEst) / u1Income) * 100
          );
        }
        if (u2Income && u1PartnerEst && Math.abs(u2Income - u1PartnerEst) > u2Income * 0.1) {
          hasIncomeDiscrepancy = true;
          incomeDiscrepancyPct = Math.max(
            incomeDiscrepancyPct,
            (Math.abs(u2Income - u1PartnerEst) / u2Income) * 100
          );
        }
      }
    }
  }
  return { hasIncomeDiscrepancy, incomeDiscrepancyPct };
}
