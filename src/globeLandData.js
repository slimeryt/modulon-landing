import neLand from './assets/ne_110m_land.json';
import neCountries from './assets/ne_110m_admin_0_countries.json';

/** Natural Earth 110m land (public domain). */
export function getLandFeatures() {
  return neLand.features;
}

/** Natural Earth 110m country boundaries (public domain). */
export function getCountryFeatures() {
  return neCountries.features;
}

/** Natural Earth 50m urban areas — lazy-loaded (~1MB). */
export async function loadUrbanFeatures() {
  const mod = await import('./assets/ne_50m_urban_areas.json');
  return mod.default.features;
}
