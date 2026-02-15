
import React, { useEffect, useState } from 'react';
import { brandingService } from '../services/brandingService';
import { BrandingSettings } from '../types';

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BrandingSettings>(brandingService.getSettings());

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(brandingService.getSettings());
    };
    window.addEventListener('branding-updated', handleUpdate);
    return () => window.removeEventListener('branding-updated', handleUpdate);
  }, []);

  return (
    <>
      <style>
        {`
          :root {
            --primary-color: ${settings.primaryColor};
            --secondary-color: ${settings.secondaryColor};
          }
          .bg-primary { background-color: var(--primary-color); }
          .bg-secondary { background-color: var(--secondary-color); }
          .text-primary { color: var(--primary-color); }
          .text-secondary { color: var(--secondary-color); }
          .border-primary { border-color: var(--primary-color); }
          .hover\\:bg-primary-dark:hover { filter: brightness(0.9); }
          .sidebar-active { background-color: var(--primary-color); color: var(--secondary-color); font-weight: 700; }
        `}
      </style>
      {children}
    </>
  );
};
