import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { labelClass } from '../lib/ui';
import {
  BANKS,
  HANDOFFS,
  HANDLE_HANDOFFS,
  banksFor,
  handoffsForRegion,
  type HandoffId,
} from '../lib/handoffs';
import { instrumentForHandoff, instrumentLabel } from '../lib/instruments';

interface Props {
  isPlus: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowCherryPlus: Dispatch<SetStateAction<boolean>>;
  thresholdInput: string;
  setThresholdInput: Dispatch<SetStateAction<string>>;
  savingThreshold: boolean;
  handleSaveThreshold: () => Promise<void>;
  /** Handles by handoff id, mirrored from the profile until Save. */
  handlesInput: Record<string, string>;
  setHandlesInput: Dispatch<SetStateAction<Record<string, string>>>;
  /** The bank app picked for each pick-your-bank handoff. */
  bankAppInput: Record<string, string>;
  setBankAppInput: Dispatch<SetStateAction<Record<string, string>>>;
  savingHandles: boolean;
  handleSavePaymentHandles: () => Promise<void>;
  /** The group's chosen payment apps (its household setup), if any. */
  groupHandoffs?: string[];
  /** The group's region, for the apps offered when it has not chosen. */
  region: string;
}

/** The handoffs a person can store a handle for: the group's picks, else the region's. */
export function handleHandoffsFor(
  groupHandoffs: string[] | undefined,
  region: string
): HandoffId[] {
  const chosen = (groupHandoffs || []).filter((id): id is HandoffId =>
    HANDLE_HANDOFFS.includes(id as HandoffId)
  );
  const base = chosen.length > 0 ? chosen : handoffsForRegion(region);
  return base.filter((id) => HANDLE_HANDOFFS.includes(id) && id !== 'bank_transfer');
}

// The "Budget & Payments" block of the Settings modal: the Cherry + spending
// threshold and the payment handles other members use to pay this user, one
// per app the group (or the region) uses, with the person's own bank app for
// the handoffs that live inside a bank app.
export default function BudgetPaymentsSettings({
  isPlus,
  setShowSettings,
  setShowCherryPlus,
  thresholdInput,
  setThresholdInput,
  savingThreshold,
  handleSaveThreshold,
  handlesInput,
  setHandlesInput,
  bankAppInput,
  setBankAppInput,
  savingHandles,
  handleSavePaymentHandles,
  groupHandoffs,
  region,
}: Props) {
  const { t } = useTranslation();
  const handoffs = handleHandoffsFor(groupHandoffs, region);
  const bankHandoffs = handoffs.filter((id) => HANDOFFS[id].bankPicker);
  const appName = (id: HandoffId) => instrumentLabel(instrumentForHandoff(id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={labelClass}>{t('budget.title')}</h3>
        <button
          onClick={() => setShowCherryPlus(true)}
          className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-2 py-1 rounded-md hover:bg-natural-primary transition-colors"
          title={t('form.aboutPlus')}
        >
          Cherry +
        </button>
      </div>
      <div className="bg-natural-sage/20 p-4 rounded-xl border border-natural-primary/20 space-y-4">
        <div>
          <label className={`${labelClass} block mb-1 flex items-center gap-2`}>
            {t('budget.threshold')}
            {!isPlus && (
              <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">
                Cherry +
              </span>
            )}
          </label>
          <p className="text-xs text-natural-muted mb-2">{t('budget.thresholdBody')}</p>
          {isPlus ? (
            <div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    placeholder={t('form.amountPlaceholder')}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                  />
                </div>
                <button
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold}
                  className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-4 py-2 rounded-lg shrink-0 disabled:opacity-60"
                >
                  {savingThreshold ? t('common.saving') : t('common.save')}
                </button>
              </div>
              <p className="text-xs text-natural-muted mt-1.5">{t('budget.zeroOff')}</p>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowSettings(false);
                setShowCherryPlus(true);
              }}
              className="w-full py-2 text-xs font-bold text-natural-primary bg-white border border-natural-primary/30 hover:bg-natural-sage/30 rounded-lg transition-colors"
            >
              {t('budget.unlock')}
            </button>
          )}
        </div>

        <div className="border-t border-natural-primary/10 pt-3">
          <label className={`${labelClass} block mb-1 flex items-center gap-1.5`}>
            <Wallet size={12} /> {t('budget.howPeoplePay')}
          </label>
          <p className="text-xs text-natural-muted mb-2">{t('budget.howPeoplePayBody')}</p>
          {(groupHandoffs || []).length === 0 && (
            <p className="text-[11px] text-natural-muted mb-2">{t('budget.noHandoffs')}</p>
          )}
          <div className="space-y-2">
            {handoffs.map((id) => {
              const def = HANDOFFS[id];
              const prefix = def.handle === 'username' ? '@' : def.handle === 'tag' ? '$' : '';
              return (
                <div key={id} className="relative">
                  {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">
                      {prefix}
                    </span>
                  )}
                  <input
                    type="text"
                    value={handlesInput[id] || ''}
                    onChange={(e) => setHandlesInput((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder={`${appName(id)}: ${t(`handoff.placeholder.${def.handle}`)}`}
                    aria-label={appName(id)}
                    className={`w-full ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary`}
                  />
                </div>
              );
            })}
            {bankHandoffs.map((id) => (
              <div key={`bank-${id}`}>
                <label className="block text-[11px] font-semibold text-natural-muted mb-1">
                  {t('budget.yourBankFor', { app: appName(id) })}
                </label>
                <select
                  value={bankAppInput[id] || ''}
                  onChange={(e) => setBankAppInput((prev) => ({ ...prev, [id]: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                >
                  <option value="">{t('handoff.chooseBank')}</option>
                  {banksFor(id).map((b) => (
                    <option key={b} value={b}>
                      {b === 'other_bank' ? t('handoff.otherBank') : BANKS[b].name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              onClick={handleSavePaymentHandles}
              disabled={savingHandles}
              className="w-full text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {savingHandles ? t('common.saving') : t('budget.savePaymentInfo')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
