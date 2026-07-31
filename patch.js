const fs = require('fs');
let code = fs.readFileSync('src/components/ExpenseForm.tsx', 'utf-8');

code = code.replace(
`    if (splitType === 'household_default') {
      members.forEach(m => {
        finalShares[m.uid] = Math.round(numericAmount * (group.defaultSplit[m.uid] || 0) / 100 * 100) / 100;
      });
    } else if (splitType === 'equal') {
      const share = Math.round((numericAmount / members.length) * 100) / 100;
      members.forEach(m => finalShares[m.uid] = share);
    } else if (splitType === 'custom_percentage') {
      let totalPct = 0;
      members.forEach(m => totalPct += (parseFloat(customPct[m.uid]) || 0));
      if (Math.abs(totalPct - 100) > 0.01) {
        setError('Custom percentages must add up to 100%.');
        return;
      }
      members.forEach(m => {
        finalShares[m.uid] = Math.round((numericAmount * (parseFloat(customPct[m.uid]) || 0)) / 100 * 100) / 100;
      });
    }`,
`    if (splitType === 'household_default' || splitType === 'equal' || splitType === 'custom_percentage') {
      if (splitType === 'custom_percentage') {
        let totalPct = 0;
        members.forEach(m => totalPct += (parseFloat(customPct[m.uid]) || 0));
        if (Math.abs(totalPct - 100) > 0.01) {
          setError('Custom percentages must add up to 100%.');
          return;
        }
      }

      let runningTotal = 0;
      members.forEach((m, index) => {
        let pct = 0;
        if (splitType === 'household_default') {
          pct = group.defaultSplit[m.uid] || 0;
        } else if (splitType === 'equal') {
          pct = 100 / members.length;
        } else {
          pct = parseFloat(customPct[m.uid]) || 0;
        }
        
        const share = Math.round((numericAmount * pct) / 100 * 100) / 100;
        
        // Adjust the last member's share to account for rounding errors
        if (index === members.length - 1) {
          finalShares[m.uid] = Math.round((numericAmount - runningTotal) * 100) / 100;
        } else {
          finalShares[m.uid] = share;
          runningTotal += share;
        }
      });
    }`
);

fs.writeFileSync('src/components/ExpenseForm.tsx', code);
