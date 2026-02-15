
import React, { useState } from 'react';
import { brandingService } from '../services/brandingService';
import { BrandingSettings } from '../types';

export const BrandingManager: React.FC = () => {
  const [settings, setSettings] = useState<BrandingSettings>(brandingService.getSettings());

  const handleSave = () => {
    brandingService.updateSettings(settings);
    alert('Branding updated successfully!');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Global Branding Settings</h2>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Gym Name</label>
            <input 
              type="text" className="w-full border p-2 rounded" 
              value={settings.gymName}
              onChange={e => setSettings({...settings, gymName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input 
              type="text" className="w-full border p-2 rounded" 
              value={settings.logo}
              onChange={e => setSettings({...settings, logo: e.target.value})}
            />
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <input 
                type="color" className="w-full h-10 border rounded cursor-pointer" 
                value={settings.primaryColor}
                onChange={e => setSettings({...settings, primaryColor: e.target.value})}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Secondary Color</label>
              <input 
                type="color" className="w-full h-10 border rounded cursor-pointer" 
                value={settings.secondaryColor}
                onChange={e => setSettings({...settings, secondaryColor: e.target.value})}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Welcome Text</label>
            <textarea 
              className="w-full border p-2 rounded" rows={3}
              value={settings.welcomeText}
              onChange={e => setSettings({...settings, welcomeText: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Login Background Image URL</label>
            <input 
              type="text" className="w-full border p-2 rounded" 
              value={settings.loginBgUrl}
              onChange={e => setSettings({...settings, loginBgUrl: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact Info</label>
            <input 
              type="text" className="w-full border p-2 rounded" 
              value={settings.contactInfo}
              onChange={e => setSettings({...settings, contactInfo: e.target.value})}
            />
          </div>
          
          <div className="pt-4">
            <h4 className="text-sm font-bold mb-2 uppercase text-slate-400">Live Preview</h4>
            <div className="border rounded-lg overflow-hidden">
               <div className="p-4" style={{ backgroundColor: settings.primaryColor, color: '#fff' }}>
                 Primary Theme
               </div>
               <div className="p-4" style={{ backgroundColor: settings.secondaryColor, color: '#fff' }}>
                 Secondary Theme
               </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <button 
            onClick={handleSave}
            className="w-full bg-primary text-white py-3 rounded-lg font-bold shadow-md hover:bg-primary-dark transition-all"
          >
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
};
