import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  LEGACY_MODULON_MODELS,
  PRIMARY_MODULON_MODELS,
  isSameModel,
  providerGroupsWithKeys,
} from './modelCatalog';
import { modelPickerItemClass } from './modelPickerItemClass';
import { useGenieMenu } from './useGenieMenu';

const PANEL_WIDTH = 224;
const VIEWPORT_PAD = 8;
const ANCHOR_GAP = 8;

const PANEL_SHELL_CLASS =
  'box-border flex min-h-44 w-56 flex-col overflow-hidden bg-white py-2 text-sm dark:bg-[#121214]';

function ModelMenuItem({ model, selected, onSelect }) {
  const disabled = Boolean(model.disabled);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={() => onSelect(model)}
      className={modelPickerItemClass(selected, disabled)}
    >
      <span className="min-w-0 flex-1 truncate">{model.label}</span>
      {disabled ? (
        <span className="shrink-0 text-[10px] font-medium text-zinc-400 dark:text-white/30">Disabled</span>
      ) : null}
      {!disabled && selected ? (
        <Check className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
      ) : null}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400 dark:text-white/30">
      {children}
    </p>
  );
}

export default function ModelPickerDropdown({
  open,
  onOpenChange,
  anchorRef,
  selectedModel,
  onSelectModel,
  apiKeys = {},
}) {
  const shellRef = useRef(null);
  const primaryShellRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [shellHeight, setShellHeight] = useState(null);
  const { menuMounted, menuClass, panelRef } = useGenieMenu(open);

  const providerGroups = useMemo(() => providerGroupsWithKeys(apiKeys), [apiKeys]);
  const hasProviderModels = providerGroups.length > 0;

  const onPrimaryShellRef = useCallback(
    (node) => {
      primaryShellRef.current = node;
      panelRef(node);
    },
    [panelRef],
  );

  useEffect(() => {
    if (!open) {
      setMoreOpen(false);
      return;
    }
    const inPrimary = PRIMARY_MODULON_MODELS.some((m) => isSameModel(m, selectedModel));
    const inLegacy = LEGACY_MODULON_MODELS.some((m) => isSameModel(m, selectedModel));
    const inProvider = providerGroups.some(([pid, group]) =>
      group.models.some((m) => isSameModel(selectedModel, { id: m.id, label: m.label, provider: pid })),
    );
    setMoreOpen(!inPrimary && (inLegacy || inProvider));
  }, [open, selectedModel, providerGroups]);

  useLayoutEffect(() => {
    if (!menuMounted) {
      setMenuPos(null);
      return undefined;
    }

    const update = () => {
      const btn = anchorRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      let left = r.right - PANEL_WIDTH;
      if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
      setMenuPos({ left, bottom: window.innerHeight - r.top + ANCHOR_GAP });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuMounted, anchorRef]);

  useLayoutEffect(() => {
    if (!menuMounted || !primaryShellRef.current) return undefined;

    const measure = () => {
      if (primaryShellRef.current) {
        setShellHeight(primaryShellRef.current.offsetHeight);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(primaryShellRef.current);
    return () => ro.disconnect();
  }, [menuMounted, moreOpen, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (shellRef.current?.contains(e.target)) return;
      onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onOpenChange, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (moreOpen) {
          setMoreOpen(false);
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, moreOpen, onOpenChange]);

  const pickModel = (model) => {
    if (model.disabled) return;
    onSelectModel(model);
    onOpenChange(false);
  };

  if (!menuMounted || !menuPos || typeof document === 'undefined') return null;

  const primaryShellClass = moreOpen
    ? 'rounded-l-3xl rounded-r-none border border-r-0 border-zinc-200/90 dark:border-white/[0.12]'
    : 'rounded-3xl border border-zinc-200/90 dark:border-white/[0.12]';

  return createPortal(
    <div
      ref={shellRef}
      className="fixed z-[80]"
      style={{ left: menuPos.left, bottom: menuPos.bottom, width: PANEL_WIDTH }}
    >
      <div
        ref={onPrimaryShellRef}
        role="menu"
        aria-label="Models"
        className={`model-picker-menu shadow-xl ${PANEL_SHELL_CLASS} ${primaryShellClass} ${menuClass}`}
      >
        <div className="model-picker-menu__list">
          {PRIMARY_MODULON_MODELS.map((model) => (
            <ModelMenuItem
              key={model.id}
              model={model}
              selected={isSameModel(selectedModel, model)}
              onSelect={pickModel}
            />
          ))}
        </div>
        <div className="mt-auto px-1.5 pt-1">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className={`model-picker-item model-picker-item--idle w-full font-medium ${
              moreOpen ? 'model-picker-item--active' : ''
            }`}
          >
            {moreOpen ? (
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">More</span>
          </button>
        </div>
      </div>

      {moreOpen && shellHeight ? (
        <div
          role="menu"
          aria-label="More models"
          className={`model-picker-menu__more-panel absolute left-full top-0 flex flex-col rounded-r-3xl border border-l-0 border-zinc-200/90 dark:border-white/[0.12] ${PANEL_SHELL_CLASS}`}
          style={{ height: shellHeight }}
        >
          <div className="model-picker-menu__list min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <SectionLabel>Previous versions</SectionLabel>
            {LEGACY_MODULON_MODELS.map((model) => (
              <ModelMenuItem
                key={model.id}
                model={model}
                selected={isSameModel(selectedModel, model)}
                onSelect={pickModel}
              />
            ))}

            {hasProviderModels ? (
              providerGroups.map(([pid, group]) => (
                <React.Fragment key={pid}>
                  <div className="mx-3 my-1 border-t border-zinc-100 dark:border-white/[0.06]" />
                  <SectionLabel>{group.label}</SectionLabel>
                  {group.models.map((m) => {
                    const model = { id: m.id, label: m.label, provider: pid };
                    return (
                      <ModelMenuItem
                        key={m.id}
                        model={model}
                        selected={isSameModel(selectedModel, model)}
                        onSelect={pickModel}
                      />
                    );
                  })}
                </React.Fragment>
              ))
            ) : (
              <p className="px-3 py-2 text-xs leading-relaxed text-zinc-400 dark:text-white/30">
                Add API keys in Settings → API Keys to use external models here.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
