import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ThemePreference } from '../hooks/useTheme';

interface ThemeControlsProps {
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  compact?: boolean;
}

function ThemeButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
        isActive
          ? 'border-[var(--gp-accent)] bg-[var(--gp-accent-soft)] text-[var(--gp-accent-strong)]'
          : 'border-[var(--gp-border)] bg-[var(--gp-surface-muted)] text-[var(--gp-text-muted)] hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]'
      }`}
      type="button"
    >
      {children}
    </button>
  );
}

export default function ThemeControls({ themePreference, onThemeChange, compact = false }: ThemeControlsProps) {
  if (compact) {
    return (
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-1">
        <ThemeButton isActive={themePreference === 'system'} onClick={() => onThemeChange('system')}>
          <Monitor className="h-3.5 w-3.5" />
        </ThemeButton>
        <ThemeButton isActive={themePreference === 'light'} onClick={() => onThemeChange('light')}>
          <Sun className="h-3.5 w-3.5" />
        </ThemeButton>
        <ThemeButton isActive={themePreference === 'dark'} onClick={() => onThemeChange('dark')}>
          <Moon className="h-3.5 w-3.5" />
        </ThemeButton>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-1">
      <ThemeButton isActive={themePreference === 'system'} onClick={() => onThemeChange('system')}>
        <Monitor className="h-3.5 w-3.5" /> System
      </ThemeButton>
      <ThemeButton isActive={themePreference === 'light'} onClick={() => onThemeChange('light')}>
        <Sun className="h-3.5 w-3.5" /> Light
      </ThemeButton>
      <ThemeButton isActive={themePreference === 'dark'} onClick={() => onThemeChange('dark')}>
        <Moon className="h-3.5 w-3.5" /> Dark
      </ThemeButton>
    </div>
  );
}
