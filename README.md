# Monolith // The Lightweight Cyber-Deck Shell & Workstation for Windows

Built with **Rust (Tauri v2)**, **React**, **TypeScript**, and **Three.js / WebGL**.

Monolith is a modular, low-overhead desktop shell and ambient command deck for Windows. Inspired by minimalist tiling environments and industrial brutalist interfaces, it replaces cluttered desktop icons with an obsidian workspace containing an offline audio player, real-time 2D/3D audio visualizers, live hardware telemetry, a local file explorer, dynamic video wallpapers, and a mobile LAN remote controller.

---

## Core Features

- **Low-Overhead Native Architecture:** Powered by Tauri v2 and Rust with release optimizations (`lto`, `opt-level = 3`), keeping idle memory usage minimal compared to Electron-based shells.
- **Local Audio Deck & Real-Time Visualizers:** Plays local `.mp3`, `.wav`, `.flac`, `.ogg`, and `.m4a` directories with embedded cover art extraction, smart shuffle, global media key bindings (`F8`–`F10` and hardware media keys), and real-time 2D Canvas, GLSL shader, and 3D `.glb` Three.js visualizers.
- **Fluid Modular Layout Engine:** Drag, resize, stack, or maximize panels anywhere on the canvas and save spatial arrangements as human-readable `.json` presets in `media/layouts/`.
- **Live CSS Skinning Engine:** Drop custom `.css` stylesheets into `media/skins/` to override color tokens, glows, borders, and typography in real time.
- **Integrated Workspace & System Telemetry:** Local file explorer defaulting to `Desktop\Monolith_Workspace` with clipboard operations and native Windows Explorer handoffs, live CPU/RAM/process monitoring, video wallpaper carousel, Spotlight app/command launcher, weather HUD, diagnostic console, and local LAN mobile remote uplink.
- **Display Scaling & Atmospheric Overrides:** Supports independent UI zoom levels (90%–130%) without distorting background wallpapers, fullscreen or bordered window modes, customizable startup splash/boot audio, and manual weather particle simulation overrides(left from debuggin in production for fun).

---

## Installation & Quick Start

1. Open the **[Releases](../../releases)** page on the right sidebar.
2. Download the latest `monolith_x.x.x_x64-setup.exe` installer.
3. Run the installer and launch **Monolith** from your Start Menu.
   *(Note: Because the binary is not signed with a paid EV certificate, Windows SmartScreen may show a prompt on first launch—click **More info** and **Run anyway**.)*

### Default Keybindings (Customizable)

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Alt + Space` | Summon / Minimize Monolith globally |
| `Ctrl + Space` | Open Spotlight App & Command Launcher |
| `Alt + D` | Toggle Dashboard Deck visibility |
| `Alt + E` | Maximize / Restore File Explorer |
| `Alt + W` | Open Wallpaper & Video Plate Carousel |
| `Alt + Q` | Toggle Weather HUD |
| `Alt + ,` | Open Settings & Preferences |
| `Alt + C` | Toggle Diagnostic Command Console |
| `F8` / `F9` / `F10` | Previous Track / Play-Pause / Next Track |

*(All shortcuts can be rebound in **Settings -> Key Combinations**.)*

---

## Customization & Modding

### Custom Skins (`media/skins/`)
Place any `.css` file inside `media/skins/` overriding Monolith's root theme tokens:

```css
:root {
  --stone-base: rgba(9, 11, 14, 0.88);
  --stone-plate: rgba(14, 18, 23, 0.65);
  --glow-core: #f1f5f9;
  --glow-aura: rgba(203, 213, 225, 0.35);
  --text-ash: #64748b;
  --line-eroded: rgba(180, 195, 210, 0.14);
}
```

Select your skin from **Settings -> Display & Skins** to apply it immediately.

### Custom Visualizers (`media/custom-visualizers/`)
Drop `.glb`/`.gltf` 3D models, `.frag`/`.glsl` fragment shaders, or modular `.js` Three.js scripts into `media/custom-visualizers/`, then click **Rescan** in **Settings -> Media & Plates**.

### Custom Layouts (`media/layouts/`)
Arrange and resize panels on the desktop, then save your preset from the **View** menu in the top bar. Presets are stored as editable `.json` files in `media/layouts/`.

---

## Roadmap

- Refine default layout presets to support upcoming modules and adapt cleanly across different display zoom levels.
- Improve music player ergonomics for fast Alt-Tab usage during gaming and fullscreen tasks.
- Add new custom 3D and shader-based audio visualizers.
- Upgrade the mobile remote companion URL to a cleaner, Monolith-branded local address.
- Expand the bundled collection of custom CSS skins.
- Introduce new modular panels and utility widgets with expanded system features.
- Ongoing bug fixes and stability improvements.
- Add direct audio output device switching in addition to device enumeration.

---

## Third-Party Scripts & Themes Disclaimer

Monolith executes custom JavaScript visualizers and CSS skins placed in local user directories. Always inspect third-party scripts and themes from untrusted sources before loading them. The author assumes no responsibility for third-party extensions.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** — see the [LICENSE](LICENSE) file for details.