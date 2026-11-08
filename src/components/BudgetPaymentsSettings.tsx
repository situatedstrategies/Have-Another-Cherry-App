import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { labelClass } from '../lib/ui';

interface Props {
  isPlus: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowCherryPlus: Dispatch<SetStateAction<boolean>>;
  thresholdInput: string;
  setThresholdInput: Dispatch<SetStateAction<string>>;
  savingThreshold: boolean;
  handleSaveThreshold: () => Promise<void>;
  venmoInput: string;
  setVenmoInput: Dispatch<SetStateAction<string>>;
  zelleInput: string;
  setZelleInput: Dispatch<SetStateAction<string>>;
  savingHandles: boolean;
  handleSavePaymentHandles: () => Promise<void>;
}

// The "Budget & Payments" block of the Settings modal: the Cherry + spending
// threshold and the Venmo/Zelle handles other members use to pay this user.
export default function BudgetPaymentsSettings({
  isPlus,
  setShowSettings,
  setShowCherryPlus,
  thresholdInput,
  setThresholdInput,
  savingThreshold,
  handleSaveThreshold,
  venmoInput,
  setVenmoInput,
  zelleInput,
  setZelleInput,
  savingHandles,
  handleSavePaymentHandles,
}: Props) {
  const { t } = useTranslation();
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
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">
                @
              </span>
              <input
                type="text"
                value={venmoInput}
                onChange={(e) => setVenmoInput(e.target.value)}
                placeholder={t('budget.venmoUsername')}
                className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
              />
            </div>
            <input
              type="text"
              value={zelleInput}
              onChange={(e) => setZelleInput(e.target.value)}
              placeholder={t('budget.zelleHandle')}
              className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
            />
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
