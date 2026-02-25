
import { BrandingSettings } from '../types';
import { DEFAULT_BRANDING } from '../constants';

const BRANDING_KEY = 'ares_gym_branding';

function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(value: any): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const v = value.trim();
    // Allow data URLs for images and http/https
    if (v.startsWith('data:')) return /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(v);
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function isValidColor(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value.trim());
}

function sanitizeSettings(input: Partial<BrandingSettings> | null): BrandingSettings {
  const base = { ...DEFAULT_BRANDING };
  if (!input) return base;
  return {
    // URLs: validate and allow only safe schemes; do NOT HTML-escape URLs
    logo: isSafeUrl(input.logo) ? (input.logo as string).trim() : base.logo,
    gymName: escapeHtml(input.gymName || base.gymName),
    primaryColor: isValidColor(input.primaryColor) ? (input.primaryColor as string).trim() : base.primaryColor,
    secondaryColor: isValidColor(input.secondaryColor) ? (input.secondaryColor as string).trim() : base.secondaryColor,
    loginBgUrl: isSafeUrl(input.loginBgUrl) ? (input.loginBgUrl as string).trim() : base.loginBgUrl,
    welcomeText: escapeHtml(input.welcomeText || base.welcomeText),
    contactInfo: escapeHtml(input.contactInfo || base.contactInfo),
  };
}

export const brandingService = {
  getSettings: (): BrandingSettings => {
    const saved = localStorage.getItem(BRANDING_KEY);
    try {
      const parsed = saved ? JSON.parse(saved) : null;
      return sanitizeSettings(parsed);
    } catch (e) {
      return sanitizeSettings(null);
    }
  },
  updateSettings: (settings: BrandingSettings): void => {
    const sanitized = sanitizeSettings(settings);
    localStorage.setItem(BRANDING_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new Event('branding-updated'));
  }
};
