
export const getFullMembers = (group: any) => {
  if (!group) return [];
  const members = [...(group.members || [])];
  const splits = group.availableSplits || [];
  splits.forEach((s, idx) => {
    members.push({
      uid: `ghost_${idx}`,
      name: typeof s === 'string' ? s : s.name,
      email: ''
    });
  });
  return members;
};

export const getFullDefaultSplit = (group: any) => {
  if (!group) return {};
  const ds = { ...(group.defaultSplit || {}) };
  const splits = group.availableSplits || [];
  splits.forEach((s, idx) => {
    ds[`ghost_${idx}`] = typeof s === 'object' ? s.split : 0;
  });
  return ds;
};
