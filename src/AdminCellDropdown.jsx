import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const TONE_CLASS = {
  default: 'admin-dropdown-trigger',
  operational: 'admin-dropdown-trigger admin-dropdown-trigger--operational',
  slow: 'admin-dropdown-trigger admin-dropdown-trigger--slow',
  maintenance: 'admin-dropdown-trigger admin-dropdown-trigger--maintenance',
  down: 'admin-dropdown-trigger admin-dropdown-trigger--down',
  building: 'admin-dropdown-trigger admin-dropdown-trigger--building',
};

const OPTION_TONE_CLASS = {
  default: '',
  operational: 'admin-dropdown-option--operational',
  slow: 'admin-dropdown-option--slow',
  maintenance: 'admin-dropdown-option--maintenance',
  down: 'admin-dropdown-option--down',
  building: 'admin-dropdown-option--building',
};

/**
 * @param {{
 *   value: string;
 *   options: { value: string; label: string; tone?: keyof typeof TONE_CLASS }[];
 *   onChange: (value: string) => void;
 *   ariaLabel: string;
 *   tone?: keyof typeof TONE_CLASS;
 *   combo?: boolean;
 *   onInputChange?: (value: string) => void;
 *   onCommit?: () => void;
 *   placeholder?: string;
 *   panelMinWidth?: number;
 *   displayLabel?: string;
 * }} props
 */
export default function AdminCellDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  tone = 'default',
  combo = false,
  onInputChange,
  onCommit,
  placeholder = '',
  panelMinWidth = 200,
  displayLabel,
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? options.find((o) => o.label === value);
  const triggerLabel = combo
    ? value || placeholder
    : displayLabel ?? selected?.label ?? value;

  const reposition = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelW = Math.max(rect.width, panelMinWidth);
    const left = Math.min(rect.left, window.innerWidth - panelW - 8);
    const top = rect.bottom + 6;
    const maxH = Math.min(320, window.innerHeight - top - 8);
    setPanelStyle({
      position: 'fixed',
      top: Math.max(8, top),
      left: Math.max(8, left),
      width: panelW,
      maxHeight: Math.max(140, maxH),
      zIndex: 9999,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-admin-dropdown-panel]')) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onLayout = () => reposition();

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [open]);

  const pickOption = (optionValue) => {
    if (optionValue !== value) onChange(optionValue);
    setOpen(false);
  };

  const menu = open && panelStyle
    ? createPortal(
        <ul
          id={listId}
          role="listbox"
          data-admin-dropdown-panel
          aria-label={ariaLabel}
          className="admin-dropdown-panel no-scrollbar overflow-y-auto"
          style={panelStyle}
        >
          {options.map((option) => {
            const isSelected = combo ? option.value === value || option.label === value : option.value === value;
            const optionTone = option.tone ?? 'default';
            return (
              <li key={option.value} role="none" className="admin-dropdown-option-wrap">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`admin-dropdown-option ${OPTION_TONE_CLASS[optionTone] ?? ''} ${
                    isSelected ? 'admin-dropdown-option--selected' : ''
                  }`}
                  onClick={() => pickOption(option.value)}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={2} />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  if (combo) {
    return (
      <div ref={rootRef} className="relative min-w-[10rem]">
        <div className={`${TONE_CLASS[tone] ?? TONE_CLASS.default} admin-dropdown-trigger--combo`}>
          <input
            type="text"
            className="admin-dropdown-combo-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onInputChange?.(e.target.value)}
            onBlur={() => onCommit?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            aria-label={ariaLabel}
          />
          <button
            type="button"
            className="admin-dropdown-chevron-btn"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-label={`${ariaLabel} options`}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              aria-hidden
              strokeWidth={2}
            />
          </button>
        </div>
        {menu}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-[7.5rem]">
      <button
        type="button"
        className={TONE_CLASS[tone] ?? TONE_CLASS.default}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
      >
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden
          strokeWidth={2}
        />
      </button>
      {menu}
    </div>
  );
}
