import { useTranslation } from 'react-i18next';
import {
  Home,
  List,
  BarChart3,
  Target,
  Vault as VaultIcon,
  Settings,
  ChevronsUpDown,
  Check,
  Plus,
} from 'lucide-react';
import CherryLogo from './CherryLogo';

export type View = 'home' | 'ledger' | 'reports' | 'plan' | 'vault';

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  onSettings: () => void;
  groupName: string;
  /** One line under the group name: the split and who with. */
  groupDetail: string;
  groups: { id: string; name: string; active: boolean }[];
  showGroupMenu: boolean;
  setShowGroupMenu: (open: boolean) => void;
  onSwitchGroup: (id: string) => void;
  onAddGroup: () => void;
  /** Vault is Cherry +; the badge says so for free members. */
  vaultLocked?: boolean;
}

/**
 * The left sidebar: Home, Ledger, Reports, Plan and Vault, then the group
 * switcher card and Settings at the bottom. At phone width it stacks above
 * the content as a wrapped row (never sticky, never a full-height column) so
 * the page keeps scrolling as one.
 */
export default function Sidebar({
  view,
  onNavigate,
  onSettings,
  groupName,
  groupDetail,
  groups,
  showGroupMenu,
  setShowGroupMenu,
  onSwitchGroup,
  onAddGroup,
  vaultLocked,
}: Props) {
  const { t } = useTranslation();
  const items: { key: View; label: string; Icon: typeof Home }[] = [
    { key: 'home', label: t('nav.home'), Icon: Home },
    { key: 'ledger', label: t('nav.ledger'), Icon: List },
    { key: 'reports', label: t('nav.reports'), Icon: BarChart3 },
    { key: 'plan', label: t('nav.plan'), Icon: Target },
    { key: 'vault', label: t('nav.vault'), Icon: VaultIcon },
  ];
  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 h-11 md:h-10 px-3 rounded-xl text-sm whitespace-nowrap transition-colors cursor-pointer ${
      active
        ? 'bg-natural-bg text-natural-dark-cherry font-semibold'
        : 'text-natural-muted font-medium hover:text-natural-text hover:bg-natural-bg/60'
    }`;

  return (
    <nav
      aria-label={t('nav.main')}
      className="w-full md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto bg-white border-b md:border-b-0 md:border-r border-natural-border px-4 py-4 md:px-5 md:py-7 flex flex-col gap-4 md:gap-6"
      id="sidebar"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CherryLogo className="h-8 w-8" />
          <span className="font-display text-lg font-semibold text-natural-text">
            {t('common.brand')}
          </span>
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="md:hidden tap-target flex items-center justify-center rounded-xl text-natural-muted hover:text-natural-text"
          aria-label={t('app.settings')}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap md:flex-col gap-1" role="group" aria-label={t('nav.main')}>
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
            className={itemClass(view === key)}
            id={`nav-${key}`}
          >
            <Icon
              className={`h-[18px] w-[18px] shrink-0 ${view === key ? 'text-natural-dark-cherry' : ''}`}
            />
            {label}
            {key === 'vault' && vaultLocked && (
              <span className="ml-auto text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">
                Cherry +
              </span>
            )}
          </button>
        ))}
      </div>

      {/* The group switcher shows at every width: on a phone it is the only
          way to another household, or to join or create one. */}
      <div className="flex mt-2 md:mt-auto flex-col gap-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowGroupMenu(!showGroupMenu)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-natural-border bg-white hover:border-natural-muted transition-colors text-left cursor-pointer"
            title={t('app.switchGroup')}
            aria-haspopup="menu"
            aria-expanded={showGroupMenu}
            id="group-switcher"
          >
            <span className="flex flex-col min-w-0">
              <span className="text-[13px] leading-[18px] font-semibold text-natural-text truncate">
                {groupName}
              </span>
              <span className="font-mono text-[11px] leading-[14px] text-natural-muted truncate">
                {groupDetail}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-natural-muted shrink-0" />
          </button>
          {showGroupMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowGroupMenu(false)} />
              <div
                className="absolute left-0 top-full mt-1 md:top-auto md:mt-0 md:bottom-full md:mb-1 z-20 w-full min-w-56 bg-white border border-natural-border rounded-xl shadow-lg py-1 animate-in fade-in"
                role="menu"
              >
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-natural-muted">
                  {t('app.yourGroups')}
                </p>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitem"
                    onClick={() => onSwitchGroup(g.id)}
                    disabled={g.active}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      g.active
                        ? 'font-bold text-natural-primary bg-natural-sage/20 cursor-default'
                        : 'text-natural-text hover:bg-natural-bg'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {g.active && <Check size={14} className="text-natural-primary shrink-0" />}
                  </button>
                ))}
                <div className="border-t border-natural-border my-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowGroupMenu(false);
                    onAddGroup();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-natural-primary hover:bg-natural-bg flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} /> {t('app.joinOrCreateAnother')}
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onSettings}
          className={`${itemClass(false)} max-md:hidden`}
          id="nav-settings"
          title={t('app.accountSettings')}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" /> {t('app.settings')}
        </button>
      </div>
    </nav>
  );
}
