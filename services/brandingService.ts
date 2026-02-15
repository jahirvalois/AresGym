
import { BrandingSettings } from '../types';
import { DEFAULT_BRANDING } from '../constants';

const BRANDING_KEY = 'ares_gym_branding';

export const brandingService = {
  getSettings: (): BrandingSettings => {
    const saved = localStorage.getItem(BRANDING_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_BRANDING;
  },
  updateSettings: (settings: BrandingSettings): void => {
    localStorage.setItem(BRANDING_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('branding-updated'));
  }
};
