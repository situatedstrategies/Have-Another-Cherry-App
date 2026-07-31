const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Make modal dynamically resize
code = code.replace(
  /w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200/,
  "w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]"
);
code = code.replace(
  /<div className="flex justify-between items-center p-5 border-b border-natural-border bg-natural-bg\/30">/,
  '<div className="flex justify-between items-center p-5 border-b border-natural-border bg-natural-bg/30 shrink-0">'
);
code = code.replace(
  /<div className="p-6 space-y-6">/,
  '<div className="p-6 space-y-6 overflow-y-auto">'
);

// 2. Change members display in Settings
const oldMembers = `<div className="border-t border-natural-border/50 pt-3">
                    <span className="text-sm text-natural-muted block mb-2">Current Default Split</span>
                    <div className="space-y-1">
                      {group?.defaultSplit && Object.entries(group.defaultSplit).map(([uid, pct]) => {
                        const isGhost = uid.startsWith('ghost_');
                        const memberName = isGhost 
                          ? (group.availableSplits?.find((_, i) => \`ghost_\${i}\` === uid) as any)?.name || 'Unknown'
                          : groupUsers[uid]?.name || 'Unknown';
                        return (
                          <div key={uid} className="flex justify-between items-center text-sm">
                            <span className="text-natural-text">{memberName}</span>
                            <span className="font-semibold font-mono text-natural-primary">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>`;

const newMembers = `<div className="border-t border-natural-border/50 pt-3">
                    <span className="text-sm text-natural-muted block mb-2">Group Members</span>
                    <div className="space-y-3">
                      {group?.defaultSplit && Object.entries(group.defaultSplit).map(([uid, pct]) => {
                        const isGhost = uid.startsWith('ghost_');
                        const memberName = isGhost 
                          ? (group.availableSplits?.find((_, i) => \`ghost_\${i}\` === uid) as any)?.name || 'Unknown'
                          : groupUsers[uid]?.name || 'Unknown';
                        return (
                          <div key={uid} className="flex justify-between items-center text-sm border-b border-natural-border/30 pb-2 last:border-0 last:pb-0">
                            <div>
                              <span className="text-natural-text font-semibold">{memberName}</span>
                              <span className="ml-2 text-xs font-mono text-natural-muted">{pct}% split</span>
                            </div>
                            <div>
                              {!isGhost ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Joined</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pending</span>
                                  <button 
                                    onClick={() => {
                                      const email = window.prompt(\`Enter email address to send invite to \${memberName}:\`);
                                      if (email) {
                                        fetch('/api/send-invite', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            email,
                                            groupName: group.name,
                                            inviteCode: group.inviteCode
                                          })
                                        }).then(res => {
                                          if (res.ok) addToast('Invite Sent', \`An invitation has been sent to \${email}\`, 'success');
                                          else addToast('Error', 'Failed to send invite', 'error');
                                        });
                                      }
                                    }}
                                    className="text-[10px] uppercase font-bold text-natural-primary hover:underline"
                                  >
                                    Resend Invite
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>`;

code = code.replace(oldMembers, newMembers);
fs.writeFileSync('src/App.tsx', code);
