import { invoke } from '@tauri-apps/api/core';

export const applySkinCss = (cssContent: string) => {
  let styleTag = document.getElementById('monolith-custom-skin') as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'monolith-custom-skin';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = cssContent;
};

export const clearSkin = () => {
  const styleTag = document.getElementById('monolith-custom-skin');
  if (styleTag) {
    styleTag.textContent = '';
  }
  localStorage.removeItem('monolith_active_skin_path');
  localStorage.removeItem('monolith_active_skin_name');
};

export const loadSkinByPath = async (filePath: string, skinName: string) => {
  try {
    const css = await invoke<string>('read_skin_css', { filePath });
    applySkinCss(css);
    localStorage.setItem('monolith_active_skin_path', filePath);
    localStorage.setItem('monolith_active_skin_name', skinName);
  } catch (err) {
    console.error('Failed to load custom skin:', err);
    throw err;
  }
};