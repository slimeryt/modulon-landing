/** Pill-shaped model menu item classes (hover + selected). */
export function modelPickerItemClass(selected, disabled = false) {
  if (disabled) return 'model-picker-item model-picker-item--disabled';
  return `model-picker-item ${selected ? 'model-picker-item--active' : 'model-picker-item--idle'}`;
}
