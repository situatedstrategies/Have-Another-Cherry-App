import { useRef, useState } from 'react';
import { Camera, Sparkles, HelpCircle, X } from 'lucide-react';
import Modal from './Modal';
import { authHeader } from '../firebase';
import { VaultExtraction, VaultNote } from '../types';

interface Props {
  activeUser: string;
  categories: string[];
  onSave: (note: VaultNote) => Promise<boolean>;
  onClose: () => void;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const uncertainFields = (x: VaultExtraction) =>
  Object.entries(x.confidence || {})
    .filter(([, c]) => c !== 'high')
    .map(([k]) => k);

/**
 * Vault capture, write or photograph something, let the model organise it,
 * then confirm before anything is saved. Port of the iOS capture sheet.
 * Nothing reaches the notebook until the person accepts it: a wrong due
 * date silently entered into a shared calendar is how a feature like this
 * loses trust.
 */
export default function VaultCaptureSheet({ activeUser, categories, onSave, onClose }: Props) {
  const [text, setText] = useState('');
  const [intent, setIntent] = useState('');
  const [image, setImage] = useState<{ dataUrl: string; name: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VaultExtraction | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setImage({
        dataUrl: String(reader.result),
        name: file.name,
        mime: file.type || 'image/jpeg',
      });
    reader.readAsDataURL(file);
  };

  const organise = async () => {
    if (!text.trim() && !image) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/vault-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          ...(text.trim() ? { text: text.trim() } : {}),
          ...(image ? { image: image.dataUrl, mimeType: image.mime } : {}),
          ...(intent.trim() ? { intent: intent.trim() } : {}),
          ...(categories.length ? { categories } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data) throw new Error(json?.error || 'extract failed');
      setResult(json.data as VaultExtraction);
    } catch {
      setError('Could not organise that right now. You can still save it as a plain note.');
    } finally {
      setBusy(false);
    }
  };

  const persist = async (note: VaultNote) => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(note);
    setSaving(false);
    if (ok) onClose();
  };

  const savePlain = () => {
    const body = text.trim();
    if (!body) return;
    const first = body.split('\n')[0].trim();
    persist({
      id: newId(),
      title: first || 'Note',
      body,
      createdAt: new Date().toISOString(),
      createdBy: activeUser,
      sourceType: 'typed',
    });
  };

  const saveExtracted = () => {
    if (!result) return;
    const uncertain = uncertainFields(result);
    persist({
      id: newId(),
      title: result.title,
      body: result.body,
      createdAt: new Date().toISOString(),
      createdBy: activeUser,
      ...(result.vendor ? { vendor: result.vendor } : {}),
      ...(result.amount != null ? { amount: result.amount } : {}),
      ...(result.dueDate ? { dueDate: result.dueDate } : {}),
      ...(result.recurrence ? { recurrence: result.recurrence } : {}),
      ...(result.accountHint ? { accountHint: result.accountHint } : {}),
      ...(result.category ? { category: result.category } : {}),
      ...(result.tags?.length ? { tags: result.tags } : {}),
      sourceType: image ? 'photo' : 'typed',
      ...(uncertain.length ? { lowConfidenceFields: uncertain } : {}),
    });
  };

  const field = (label: string, value: string | undefined, key: string) => {
    if (!value?.trim()) return null;
    const unsure = result?.confidence?.[key] && result.confidence[key] !== 'high';
    return (
      <div
        key={key}
        className="flex items-center justify-between gap-2 py-2 border-b border-natural-border last:border-0"
      >
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-natural-text truncate">{value}</p>
          <p className="text-xs text-natural-muted">
            {unsure ? `${label} · needs checking` : label}
          </p>
        </div>
        {unsure && <HelpCircle size={16} className="text-natural-primary shrink-0" />}
      </div>
    );
  };

  const uncertain = result ? uncertainFields(result) : [];

  return (
    <Modal
      onClose={onClose}
      title={result ? 'Check this over' : 'Add to the vault'}
      icon={<Sparkles className="h-5 w-5 text-natural-primary" />}
      size="lg"
    >
      {!result ? (
        <div className="space-y-4">
          <p className="text-xs text-natural-muted">
            Photograph it, pick a photo, or write it down.
          </p>
          {image ? (
            <div className="flex items-center justify-between gap-2 bg-natural-bg/50 border border-natural-border rounded-xl px-3 py-2">
              <span className="text-xs text-natural-text truncate">{image.name}</span>
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove image"
                className="text-natural-muted hover:text-natural-text"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-2 text-xs font-semibold text-natural-text bg-white border border-natural-border rounded-full hover:border-natural-primary flex items-center justify-center gap-1.5"
            >
              <Camera size={14} /> Photos
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note"
            rows={5}
            className="w-full px-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-text rounded-xl text-sm outline-none"
          />
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-natural-muted mb-1.5">
              Anything to pull out?
            </label>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Due date, account"
              className="w-full px-3 py-2 bg-natural-bg/50 border border-natural-border focus:border-natural-text rounded-xl text-sm outline-none"
            />
          </div>
          {error && (
            <p className="p-3 bg-natural-primary-wash border border-natural-primary/15 rounded-xl text-xs font-medium text-natural-primary">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={organise}
            disabled={busy || (!text.trim() && !image)}
            className="w-full py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Sparkles size={15} /> {busy ? 'Organising...' : 'Organise it'}
          </button>
          <button
            type="button"
            onClick={savePlain}
            disabled={busy || saving || !text.trim()}
            className="w-full py-2.5 text-sm font-semibold text-natural-text bg-white border border-natural-border rounded-full hover:border-natural-primary disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save as a plain note'}
          </button>
          <p className="text-[11px] text-natural-muted text-center">
            Organising sends the note to be read once. A plain note is encrypted and saved without
            anyone reading it.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {uncertain.length > 0 && (
            <p className="p-3 bg-natural-primary-wash border border-natural-primary/15 rounded-xl text-xs font-medium text-natural-primary">
              {uncertain.length === 1
                ? `One field is a guess: ${uncertain[0]}. Check it before saving.`
                : `Some fields are guesses: ${uncertain.join(', ')}. Check them before saving.`}
            </p>
          )}
          <div>
            <h3 className="font-display text-xl font-semibold text-natural-text">{result.title}</h3>
            <p className="mt-2 text-sm text-natural-text whitespace-pre-line leading-relaxed">
              {result.body}
            </p>
          </div>
          <div>
            <span className="block text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-natural-muted mb-1">
              Extracted
            </span>
            <div className="bg-white border border-natural-border rounded-2xl px-4">
              {field('Vendor', result.vendor, 'vendor')}
              {field(
                'Amount',
                result.amount != null ? `$${result.amount.toFixed(2)}` : undefined,
                'amount'
              )}
              {field('Due', result.dueDate, 'dueDate')}
              {field('Repeats', result.recurrence, 'recurrence')}
              {field('Account', result.accountHint, 'accountHint')}
              {field('Category', result.category, 'category')}
            </div>
          </div>
          {!!result.tags?.length && (
            <div className="flex flex-wrap gap-1.5">
              {result.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-natural-sidebar border border-natural-border text-natural-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex-1 py-2.5 text-sm font-semibold text-natural-text bg-white border border-natural-border rounded-full hover:border-natural-primary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveExtracted}
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save to the vault'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
