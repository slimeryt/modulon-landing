/** Pill-shaped model menu item classes (hover + selected). */
export function modelPickerItemClass(selected) {
  return `model-picker-item ${selected ? 'model-picker-item--active' : 'model-picker-item--idle'}`;
}
