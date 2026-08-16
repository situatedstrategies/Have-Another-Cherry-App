import { hashString } from '../lib/crypto';
import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, runTransaction, arrayUnion } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth, authHeader } from '../firebase';
import { Group, User, DEFAULT_CATEGORIES } from '../types';
import { Users, Key, Plus, ArrowRight, ArrowLeft, Copy, Check, Send } from 'lucide-react';

function CherryLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img src="/cherry2transparent.png" alt="Cherry Logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export default function GroupSetup({ onComplete, onCancel }: { onComplete: (groupId: string) => void; onCancel?: () => void }) {

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  
  // Create mode state
  const [numPeople, setNumPeople] = useState(2);
  const [groupName, setGroupName] = useState('');
  const [splits, setSplits] = useState<string[]>(['50', '50']);
  const [memberNames, setMemberNames] = useState<string[]>(['', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [createdGroupInfo, setCreatedGroupInfo] = useState<{ inviteCode: string, groupId: string, numCodes: number, groupName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [partnerIncome, setPartnerIncome] = useState('');
  const [myIncome, setMyIncome] = useState('');
  const [recMessage, setRecMessage] = useState('');
  const [inviteName, setInviteName] = useState('');

  // Pre-fill the creator's income from their saved profile (from the quiz), if available.
  useEffect(() => {
    const loadIncome = async () => {
      try {
        if (!auth.currentUser) return;
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const saved = userDoc.data()?.income;
        if (saved != null && String(saved).trim() !== '') setMyIncome(String(saved));
      } catch (e) {
        console.error(e);
      }
    };
    loadIncome();
  }, []);

  // Recommend a split proportional to the two annual incomes.
  const recommendSplit = () => {
    const myVal = parseFloat(myIncome);
    const partnerVal = parseFloat(partnerIncome);

    if (!myVal || myVal <= 0) {
      setRecMessage('Enter your income first to calculate a split.');
      return;
    }
    if (!partnerVal || partnerVal <= 0) {
      setRecMessage("Enter your partner's income first to calculate a split.");
      return;
    }

    const total = myVal + partnerVal;
    const myPct = Math.round((myVal / total) * 100);
    const partnerPct = 100 - myPct;

    setSplits([String(myPct), String(partnerPct)]);
    setRecMessage(`Recommended: you ${myPct}% / partner ${partnerPct}%, proportional to income. Adjust below if you'd like.`);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !createdGroupInfo) return;
    setInviteStatus('sending');
    try {
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          email: inviteEmail,
          groupName: createdGroupInfo.groupName,
          inviteCode: createdGroupInfo.inviteCode,
          recipientName: inviteName,
          fromName: (auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'A friend'),
          split: splits.map((s, i) => ({ name: i === 0 ? (auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You') : (memberNames[i]?.trim() || ('Person ' + (i + 1))), split: parseFloat(s) || 0 }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setInviteStatus('success');
      setInviteEmail('');
      setInviteName('');
      setTimeout(() => setInviteStatus('idle'), 3000);
    } catch (err: any) {
      console.error(err);
      setInviteStatus('error');
      setTimeout(() => setInviteStatus('idle'), 3000);
    }
  };

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const get6 = () => Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${get6()}-${get6()}`;
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!auth.currentUser) throw new Error("Not logged in");

      const currentUser: User = {
        uid: auth.currentUser.uid,
        name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        email: auth.currentUser.email || ''
      };

      for (let i = 1; i < numPeople; i++) {
        if (!memberNames[i] || !memberNames[i].trim()) {
          throw new Error(`Please enter a name for 🍒 ${NUMBER_WORDS[i] || i + 1}`);
        }
      }

      // Use the invite code as the document ID, but make sure we don't reuse an
      // existing group's code — setDoc would overwrite (and destroy) that group.
      let newInviteCode = generateInviteCode();
      let groupId = newInviteCode;
      for (let attempt = 0; attempt < 6; attempt++) {
        const existing = await getDoc(doc(db, 'groups', groupId));
        if (!existing.exists()) break;
        newInviteCode = generateInviteCode();
        groupId = newInviteCode;
        if (attempt === 5) throw new Error('Could not generate a unique invite code. Please try again.');
      }

      const totalSplit = splits.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0);
      if (Math.abs(totalSplit - 100) > 0.01) {
        throw new Error("Total splits must equal exactly 100%");
      }

      const defaultSplit: Record<string, number> = {
        [currentUser.uid]: parseFloat(splits[0]) || 0
      };
      
      const availableSplits = splits.slice(1).map((s, idx) => ({
        name: memberNames[idx + 1] || `🍒 ${NUMBER_WORDS[idx + 1] || idx + 2}`,
        split: parseFloat(s) || 0
      }));

      const newGroup: Group = {
        id: groupId,
        name: groupName,
        inviteCode: newInviteCode,
        members: [currentUser],
        memberIds: [currentUser.uid],
        defaultSplit,
        targetNumPeople: numPeople,
        availableSplits,
        categories: [...DEFAULT_CATEGORIES]
      };

      await setDoc(doc(db, 'groups', groupId), newGroup);
      
      // Add this group to the user's membership set and make it active. Uses
      // arrayUnion so creating an additional group never drops the existing ones.
      const hashedEmail = currentUser.email ? (await hashString(currentUser.email)).substring(0, 6) : '';
      await setDoc(doc(db, 'users', currentUser.uid), {
        groupId: groupId,
        activeGroupId: groupId,
        groupIds: arrayUnion(groupId),
        name: currentUser.name || 'Friend',
        email: hashedEmail
      }, { merge: true });

      setCreatedGroupInfo({
        inviteCode: newInviteCode,
        groupId: groupId,
        numCodes: numPeople - 1,
        groupName: groupName
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!auth.currentUser) throw new Error("Not logged in");
      
      const currentUser: User = {
        uid: auth.currentUser.uid,
        name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        email: auth.currentUser.email || ''
      };

      const groupRef = doc(db, 'groups', inviteCode.toUpperCase());

      // Join inside a transaction so two people joining at once can't both take
      // the same split slot or leave a ghost behind (read-modify-write is atomic
      // and retried on conflict).
      const joinedGroupId = await runTransaction(db, async (tx) => {
        const snap = await tx.get(groupRef);
        if (!snap.exists()) throw new Error("Invalid invite code");
        const groupData = snap.data() as Group;

        // Already a member — nothing to change.
        if (groupData.members?.find(m => m.uid === currentUser.uid)) return snap.id;

        const capacity = groupData.targetNumPeople || 5;
        if ((groupData.members?.length || 0) >= capacity) {
          throw new Error(`This group is already full (${capacity} members).`);
        }

        // Take the next available split slot, or fall back to the even remainder.
        const newAvailable = [...(groupData.availableSplits || [])];
        let mySplit = 0;
        if (newAvailable.length > 0) {
          const nextSplit = newAvailable.shift();
          mySplit = typeof nextSplit === 'number' ? nextSplit : (nextSplit?.split || 0);
        } else {
          const currentSplitSum = Object.values(groupData.defaultSplit || {}).reduce((a, b) => a + b, 0);
          const membersLeft = capacity - (groupData.members?.length || 0);
          mySplit = membersLeft > 0 ? (100 - currentSplitSum) / membersLeft : 0;
        }

        tx.update(groupRef, {
          members: [...(groupData.members || []), currentUser],
          memberIds: [...(groupData.memberIds || []), currentUser.uid],
          availableSplits: newAvailable,
          [`defaultSplit.${currentUser.uid}`]: Math.max(0, Math.round(mySplit * 10) / 10),
        });
        return snap.id;
      });

      // Add this group to the user's membership set and make it active, so
      // joining a second group keeps the first rather than replacing it.
      const hashedEmail = currentUser.email ? (await hashString(currentUser.email)).substring(0, 6) : '';
      await setDoc(doc(db, 'users', currentUser.uid), {
        groupId: joinedGroupId,
        activeGroupId: joinedGroupId,
        groupIds: arrayUnion(joinedGroupId),
        name: currentUser.name || 'Friend',
        email: hashedEmail
      }, { merge: true });

      onComplete(joinedGroupId);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(createdGroupInfo?.inviteCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdGroupInfo) {
    return (
      <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative">
          
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-4 bg-natural-sage rounded-full mb-4">
                <Users className="h-12 w-12 text-natural-primary" />
              </div>
              <h1 className="text-3xl font-bold font-display text-natural-text mb-2 tracking-tight">
                Group Created!
              </h1>
              <p className="text-natural-muted font-medium">
                You can invite up to {createdGroupInfo.numCodes} people to join.
              </p>
            </div>

            <div className="bg-natural-bg rounded-xl p-6 mb-8 text-center border border-natural-border">
              <p className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-3">Invite Code</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-4xl font-mono font-bold text-natural-text tracking-[0.2em]">{createdGroupInfo.inviteCode}</span>
              </div>
              <button
                onClick={copyToClipboard}
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-natural-primary hover:text-natural-dark transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="mb-8 p-6 bg-natural-sage/20 border border-natural-sage/30 rounded-xl">
              <p className="text-sm font-bold text-natural-text mb-3">Send Invite via Email</p>
              <input type="text" required placeholder="Their name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full mb-2 px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none transition-all placeholder-natural-muted/60" />
              <div className="flex gap-2">
                <input 
                  type="email"
                  required
                  placeholder="Enter email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none transition-all placeholder-natural-muted/60"
                />
                <button 
                  type="submit" 
                  disabled={inviteStatus === 'sending'}
                  className="bg-natural-primary text-white p-2 rounded-lg hover:bg-natural-dark transition-colors disabled:opacity-50"
                >
                  {inviteStatus === 'sending' ? <span className="animate-spin inline-block">◌</span> : <Send size={18} />}
                </button>
              </div>
              {inviteStatus === 'success' && <p className="text-xs text-natural-primary font-medium mt-2">Invite sent successfully!</p>}
              {inviteStatus === 'error' && <p className="text-xs text-red-500 font-medium mt-2">Failed to send invite. Check settings.</p>}
            </form>

            <button
              onClick={() => onComplete(createdGroupInfo.groupId)}
              className="w-full bg-natural-primary text-white font-bold py-4 px-4 rounded-xl hover:bg-natural-dark transition-colors shadow-sm"
            >
              Done, go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative">
          
          <div className="p-8">
            <button
              onClick={() => onCancel ? onCancel() : signOut(auth)}
              className="text-natural-muted hover:text-natural-primary text-xs font-bold uppercase tracking-wider mb-6 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft size={16} /> {onCancel ? 'Cancel' : 'Back'}
            </button>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-4 bg-natural-sage rounded-full mb-4">
                <CherryLogo className="h-12 w-12" />
              </div>
              <h1 className="text-3xl font-bold font-display text-natural-text mb-1 tracking-tight">
                Welcome!
              </h1>
              <p className="text-natural-accent font-medium text-sm uppercase tracking-widest">
                MAKE SHARING EXPENSES SWEETER
              </p>
            </div>
            
            <div className="text-center mb-6">
              <p className="text-natural-muted font-medium">To get started, create a new household or join an existing one.</p>
            </div>
          
            <div className="space-y-4">
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center justify-between p-4 border border-natural-border rounded-xl hover:border-natural-primary hover:bg-natural-sage/30 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-natural-sage text-natural-primary rounded-lg group-hover:bg-natural-primary group-hover:text-white transition-colors">
                    <Plus size={24} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-natural-text text-sm">Create New Group</h3>
                    <p className="text-xs text-natural-muted">Start a new shared expense tracker</p>
                  </div>
                </div>
                <ArrowRight className="text-natural-muted group-hover:text-natural-primary" size={20} />
              </button>

              <button
                onClick={() => setMode('join')}
                className="w-full flex items-center justify-between p-4 border border-natural-border rounded-xl hover:border-natural-primary hover:bg-natural-sage/30 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-natural-sage text-natural-primary rounded-lg group-hover:bg-natural-primary group-hover:text-white transition-colors">
                    <Key size={24} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-natural-text text-sm">Join Existing Group</h3>
                    <p className="text-xs text-natural-muted">Use an invite code</p>
                  </div>
                </div>
                <ArrowRight className="text-natural-muted group-hover:text-natural-primary" size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative">
        
        <div className="p-8">
          <button 
            onClick={() => setMode('choose')}
            className="text-natural-muted hover:text-natural-primary text-xs font-bold uppercase tracking-wider mb-6 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold font-display text-natural-text">
              {mode === 'create' ? 'Create a Group' : 'Join a Group'}
            </h2>
          </div>

          {error && (
            <div className="bg-natural-sidebar text-natural-text p-4 rounded-xl mb-6 text-sm font-medium border border-natural-border/20 flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {mode === 'create' ? (
            <form onSubmit={handleCreateGroup} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1.5">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. The Cool Apartment"
                  className="w-full px-4 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all mb-4"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1.5">
                  How many people are in this group?
                </label>
                <p className="text-xs text-natural-muted mb-4 font-medium">You can add up to 5 people total.</p>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setNumPeople(num);
                        const equal = Math.round(100 / num);
                        const newSplits = Array(num).fill(String(equal));
                        newSplits[num - 1] = String(100 - equal * (num - 1));
                        setSplits(newSplits);
                      }}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        numPeople === num 
                          ? 'border-natural-primary bg-natural-sage text-natural-primary' 
                          : 'border-natural-border text-natural-muted hover:border-natural-primary/50 hover:bg-natural-bg'
                      }`}
                    >
                      You + {num - 1} {num - 1 === 1 ? 'other' : 'others'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1.5">
                  Split Percentages
                </label>
                {numPeople === 2 && (
                  <div className="mb-4 p-4 bg-natural-sage/20 border border-natural-primary/20 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-natural-text">Want an income-based split recommendation?</p>
                    <p className="text-xs text-natural-muted">Enter both annual incomes and we'll suggest a split proportional to income. You can still adjust the percentages below.</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-natural-muted mb-1">Your annual income</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            value={myIncome}
                            onChange={(e) => { setMyIncome(e.target.value); setRecMessage(''); }}
                            placeholder="e.g. 75000"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-natural-muted mb-1">Partner's annual income</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            value={partnerIncome}
                            onChange={(e) => { setPartnerIncome(e.target.value); setRecMessage(''); }}
                            placeholder="e.g. 60000"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={recommendSplit}
                      className="w-full bg-natural-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-natural-primary/90"
                    >
                      Calculate Recommended Split
                    </button>
                    {recMessage && (
                      <p className="text-xs font-medium text-natural-primary">{recMessage}</p>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {splits.map((split, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      {idx === 0 ? (
                        <span className="text-sm font-medium text-natural-text w-24 shrink-0">You</span>
                      ) : (
                        <input
                          type="text"
                          value={memberNames[idx]}
                          onChange={(e) => {
                            const newNames = [...memberNames];
                            newNames[idx] = e.target.value;
                            setMemberNames(newNames);
                          }}
                          placeholder={`🍒 ${NUMBER_WORDS[idx] || idx + 1}`}
                          className="w-24 shrink-0 text-sm font-medium text-natural-text bg-transparent border-b border-dashed border-natural-border focus:border-natural-primary outline-none"
                        />
                      )}
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={split}
                          onChange={(e) => {
                            const newSplits = [...splits];
                            newSplits[idx] = e.target.value;
                            setSplits(newSplits);
                          }}
                          className="w-full pl-4 pr-10 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text font-mono text-sm outline-none transition-all"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-natural-muted font-mono text-sm">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 px-1">
                  <span className="text-xs font-medium text-natural-muted">Total:</span>
                  <span className={`text-sm font-bold font-mono ${Math.abs(splits.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0) - 100) > 0.01 ? 'text-natural-primary' : 'text-natural-primary'}`}>
                    {splits.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || Math.abs(splits.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0) - 100) > 0.01}
                className="w-full bg-natural-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-natural-dark transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? 'Creating...' : `Create & Get Invite Code${numPeople > 2 ? 's' : ''}`}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinGroup} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1.5">
                  Enter Invite Code
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    if (val.length > 6) {
                      val = val.substring(0, 6) + '-' + val.substring(6, 12);
                    }
                    setInviteCode(val);
                  }}
                  className="w-full px-4 py-3 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text font-mono text-center text-xl uppercase tracking-widest outline-none transition-all placeholder-natural-muted/60"
                  placeholder="XXXXXX-XXXXXX"
                  maxLength={13}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-natural-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-natural-dark transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? 'Joining...' : 'Join Group'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
