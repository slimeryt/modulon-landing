import React from 'react';
import { LayoutList, Monitor, Moon, Rows3, Sun, Zap, ZapOff } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { useDisplayPreferences } from './DisplayPreferencesContext';

const pillClass = (active) =>
  `inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
    active
      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white/25 dark:bg-white/[0.14] dark:text-white'
      : 'border-zinc-300/90 text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-white/75 dark:hover:bg-white/[0.06]'
  }`;

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { reducedMotion, chatDensity, setReducedMotion, setChatDensity } = useDisplayPreferences();

  return (
    <div className="max-w-lg space-y-8">
      <section className="space-y-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
          Color theme
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/45">
          Choose how Modulon looks across the site. &ldquo;System&rdquo; follows your device light or dark mode.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color theme">
          {[
            { id: 'dark', label: 'Dark', Icon: Moon },
            { id: 'light', label: 'Light', Icon: Sun },
            { id: 'system', label: 'System', Icon: Monitor },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={pillClass(theme === id)}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
          Reduced motion
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/45">
          Limits animations such as the model picker genie effect and typing indicators. &ldquo;System&rdquo; follows
          your device accessibility setting.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reduced motion">
          {[
            { id: 'system', label: 'System', Icon: Monitor },
            { id: 'reduce', label: 'Reduced', Icon: ZapOff },
            { id: 'full', label: 'Full', Icon: Zap },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={reducedMotion === id}
              onClick={() => setReducedMotion(id)}
              className={pillClass(reducedMotion === id)}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/35">
          Chat density
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/45">
          Adjust spacing between messages. Compact fits more on screen; Comfortable is easier to read.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chat density">
          {[
            { id: 'comfortable', label: 'Comfortable', Icon: LayoutList },
            { id: 'compact', label: 'Compact', Icon: Rows3 },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chatDensity === id}
              onClick={() => setChatDensity(id)}
              className={pillClass(chatDensity === id)}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
