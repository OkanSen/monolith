import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { playBootChime } from './utils/bootAudio';
import { invoke } from '@tauri-apps/api/core';

async function bootstrap() {
  let isAutostart = false;
  try {
    isAutostart = await invoke<boolean>('is_autostart_launch');
  } catch {
    isAutostart = false;
  }

  // Unified splash & boot audio setting
  const splashAudioEnabled = localStorage.getItem('monolith_splash_screen') !== 'false';

  // Only trigger audio on manual launch when the sequence is enabled
  if (!isAutostart && splashAudioEnabled) {
    playBootChime(0.5);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App isAutostartLaunch={isAutostart} />
    </React.StrictMode>
  );
}

bootstrap();