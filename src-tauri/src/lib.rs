use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use sysinfo::{System, Disks, Networks};
use tauri_plugin_autostart::MacosLauncher;
use std::sync::Mutex;
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Config};
use tauri::{Emitter, Manager};
use std::collections::HashMap;
use cpal::traits::{DeviceTrait, HostTrait};
use std::net::{UdpSocket, IpAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tiny_http::{Server, Response, Header};
use std::sync::RwLock;
use std::time::Instant;
use std::thread::JoinHandle;
use socket2::{Socket, Domain, Type};
use std::net::SocketAddr;

pub struct WallpaperWatcher(pub Mutex<Option<RecommendedWatcher>>);

// Audio Track data structure for music scanner
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AudioTrack {
    pub name: String,
    pub path: String,
    pub cover_art: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct QueueItem {
    pub original_idx: i32,
    pub name: String,
}

// State storage for phone polling
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct CompanionPlaybackState {
    pub is_playing: bool,
    pub current_track_idx: i32,
    pub track_name: String,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f64,
    pub is_shuffle: bool,
    pub tracks: Vec<String>,
    pub queue: Vec<QueueItem>, // 👈 The actual upcoming playback queue
}



// File Entry data structure for workspace explorer
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}


#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConnectedClientInfo {
    pub id: String,
    pub ip: String,
    pub user_agent: String,
    pub device_name: String,
    pub last_seen_secs_ago: u64,
}

// Internal tracking entry
pub struct ActiveClientEntry {
    pub ip: String,
    pub user_agent: String,
    pub device_name: String,
    pub last_seen: Instant,
}

// Managed state for the remote companion server
pub struct RemoteServerState {
    pub is_running: Arc<AtomicBool>,
    pub playback_state: Arc<RwLock<CompanionPlaybackState>>,
    pub connected_clients: Arc<RwLock<HashMap<String, ActiveClientEntry>>>,
    pub server_handle: Arc<RwLock<Option<Arc<Server>>>>,
    pub thread_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RemoteServerStatus {
    pub is_running: bool,
    pub ip: String,
    pub port: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QuickAccessPaths {
    pub desktop: String,
    pub downloads: String,
    pub documents: String,
    pub pictures: String,
    pub root_c: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProcessItem {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub mem_mb: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiskVolume {
    pub name: String,
    pub mount: String,
    pub total_gb: f32,
    pub used_gb: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemVitals {
    pub cpu_usage: f32,
    pub cpu_cores: Vec<f32>,
    pub mem_used_gb: f32,
    pub mem_total_gb: f32,
    pub net_rx_kb: u64,
    pub net_tx_kb: u64,
    pub uptime_secs: u64,
    pub process_count: usize,
    pub disks: Vec<DiskVolume>,
    pub all_processes: Vec<ProcessItem>,
}

// Helper: Extract embedded cover art from MP3/FLAC
fn extract_cover_art(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();

    if ext == "mp3" {
        if let Ok(tag) = id3::Tag::read_from_path(path) {
            if let Some(pic) = tag.pictures().next() {
                let mime = &pic.mime_type;
                let b64 = BASE64.encode(&pic.data);
                return Some(format!("data:{};base64,{}", mime, b64));
            }
        }
    } else if ext == "flac" {
        if let Ok(tag) = metaflac::Tag::read_from_path(path) {
            if let Some(pic) = tag.pictures().next() {
                let mime = &pic.mime_type;
                let b64 = BASE64.encode(&pic.data);
                return Some(format!("data:{};base64,{}", mime, b64));
            }
        }
    }

    None
}

// Audio scanner command
#[tauri::command]
fn scan_music_directory(folder_path: String) -> Result<Vec<AudioTrack>, String> {
    let clean_path_str = folder_path.trim().trim_matches('"').trim_matches('\'');
    let path = PathBuf::from(clean_path_str);

    if !path.exists() || !path.is_dir() {
        return Err(format!("Invalid directory path: {:?}", path));
    }

    let mut tracks = Vec::new();
    let valid_extensions = ["mp3", "wav", "ogg", "flac", "m4a"];

    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                    let name = entry_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown Track")
                        .to_string();

                    let cover_art = extract_cover_art(&entry_path);
                    let full_path = entry_path.to_string_lossy().to_string();

                    tracks.push(AudioTrack {
                        name,
                        path: full_path,
                        cover_art,
                    });
                }
            }
        }
    }

    Ok(tracks)
}

// Wallpaper scanner command
#[tauri::command]
fn scan_wallpapers_directory(folder_path: String) -> Result<Vec<String>, String> {
    let clean = folder_path.trim().trim_matches('"').trim_matches('\'');
    let path = PathBuf::from(clean);
    if !path.exists() || !path.is_dir() {
        return Err("Directory does not exist".into());
    }

    let valid_exts = ["jpg", "jpeg", "png", "webp", "bmp", "mp4", "webm", "mov"];
    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if valid_exts.contains(&ext.to_lowercase().as_str()) {
                        files.push(p.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

#[tauri::command]
fn watch_wallpapers_directory(
    app_handle: tauri::AppHandle,
    state: tauri::State<WallpaperWatcher>,
    folder_path: String,
) -> Result<(), String> {
    let clean = folder_path.trim().trim_matches('"').trim_matches('\'');
    let path = PathBuf::from(clean);
    if !path.exists() || !path.is_dir() {
        return Err("Target is not a valid directory".into());
    }

    let handle = app_handle.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                // If files were created, removed, or modified
                if event.kind.is_create() || event.kind.is_remove() || event.kind.is_modify() {
                    let _ = handle.emit("wallpapers-directory-changed", ());
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    let mut lock = state.0.lock().unwrap();
    *lock = Some(watcher);

    Ok(())
}

// Launcher executable launcher
#[tauri::command]
fn launch_command(target: String) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", &target])
        .spawn()
        .map_err(|e| format!("Failed to execute command: {}", e))?;
    Ok(())
}

// System power controls
#[tauri::command]
fn system_power_action(action: String) -> Result<(), String> {
    match action.as_str() {
        "shutdown" => {
            Command::new("shutdown")
                .args(["/s", "/t", "0"])
                .spawn()
                .map_err(|e| format!("Failed to initiate shutdown: {}", e))?;
        }
        "restart" => {
            Command::new("shutdown")
                .args(["/r", "/t", "0"])
                .spawn()
                .map_err(|e| format!("Failed to initiate restart: {}", e))?;
        }
        "lock" => {
            Command::new("rundll32.exe")
                .args(["user32.dll,LockWorkStation"])
                .spawn()
                .map_err(|e| format!("Failed to lock workstation: {}", e))?;
        }
        _ => return Err("Invalid power action specified".to_string()),
    }
    Ok(())
}









// Track which shortcut string is assigned to which action
struct MediaShortcutRegistry(Mutex<HashMap<String, String>>);


#[tauri::command]
fn register_global_media_shortcut(
    app: tauri::AppHandle, 
    shortcut_str: String, 
    action: String
) -> Result<(), String> {
    let state = app.state::<MediaShortcutRegistry>();
    let mut map = state.0.lock().map_err(|e| e.to_string())?;

    // 1. Unregister previous shortcut for this action
    if let Some(old_shortcut_str) = map.get(&action) {
        if let Ok(old_parsed) = old_shortcut_str.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(old_parsed);
        }
    }

    // 2. Parse and register the new shortcut
    let parsed: Shortcut = match shortcut_str.parse() {
        Ok(s) => s,
        Err(err) => {
            eprintln!("[GlobalShortcut] Error parsing '{}': {:?}", shortcut_str, err);
            return Err(format!("Invalid shortcut '{}': {:?}", shortcut_str, err));
        }
    };

    let handle = app.clone();
    let action_clone = action.clone();

    // Ensure it's not already hooked
    let _ = app.global_shortcut().unregister(parsed.clone());

    app.global_shortcut().on_shortcut(parsed, move |_app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            if action_clone == "summonShell" {
                // Get window by "main" or fallback to the first active webview window
                let window_opt = handle.get_webview_window("main")
                    .or_else(|| handle.webview_windows().into_values().next());

                if let Some(window) = window_opt {
                    let is_minimized = window.is_minimized().unwrap_or(false);
                    let is_visible = window.is_visible().unwrap_or(true);
                    let is_focused = window.is_focused().unwrap_or(false);

                    // If window is visible on screen and not minimized, yield it immediately
                    // regardless of whether the user clicked the DOM yet.
                    if (is_focused || is_visible) && !is_minimized {
                        let _ = window.minimize();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                } else {
                    eprintln!("[GlobalShortcut] No webview window found for summonShell!");
                }
            } else {
                let _ = handle.emit("global-media-action", &action_clone);
            }
        }
    }).map_err(|e| format!("Failed to register global shortcut: {:?}", e))?;

    map.insert(action, shortcut_str);
    Ok(())
}

#[tauri::command]
fn unregister_global_media_shortcut(app: tauri::AppHandle, action: String) -> Result<(), String> {
    let state = app.state::<MediaShortcutRegistry>();
    let mut map = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(old_shortcut_str) = map.remove(&action) {
        if let Ok(old_parsed) = old_shortcut_str.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(old_parsed);
        }
    }
    Ok(())
}
















fn resolve_media_subdir(subdir: &str) -> PathBuf {
    // 1. Production install: check <exe_dir>/media/<subdir>
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let prod_media = exe_dir.join("media").join(subdir);
            if prod_media.exists() && prod_media.is_dir() {
                return prod_media;
            }
            // Legacy flat fallback (<exe_dir>/<subdir>)
            let prod_flat = exe_dir.join(subdir);
            if prod_flat.exists() && prod_flat.is_dir() {
                return prod_flat;
            }
        }
    }

    // 2. Development mode: check ./media/<subdir> or ../media/<subdir>
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let dev_media = cwd.join("media").join(subdir);
    if dev_media.exists() && dev_media.is_dir() {
        return dev_media;
    }
    let dev_up = cwd.join("..").join("media").join(subdir);
    if dev_up.exists() && dev_up.is_dir() {
        return dev_up;
    }

    // 3. Fallback: create in user's AppData/Local/Monolith/media/<subdir> (always writable without Admin!)
    if let Some(local_data) = dirs::data_local_dir() {
        let user_media = local_data.join("Monolith").join("media").join(subdir);
        let _ = fs::create_dir_all(&user_media);
        return user_media;
    }

    let fallback = cwd.join("media").join(subdir);
    let _ = fs::create_dir_all(&fallback);
    fallback
}















// Helper to resolve the media/layouts folder path
fn get_layouts_directory() -> PathBuf {
    resolve_media_subdir("layouts")
}

#[tauri::command]
fn list_layout_presets() -> Result<Vec<String>, String> {
    let dir = get_layouts_directory();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
        return Ok(Vec::new());
    }

    let mut presets = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "json" {
                        if let Ok(content) = fs::read_to_string(&path) {
                            presets.push(content);
                        }
                    }
                }
            }
        }
    }
    Ok(presets)
}

#[tauri::command]
fn save_layout_preset_file(name: String, json_content: String) -> Result<(), String> {
    let dir = get_layouts_directory();
    let _ = fs::create_dir_all(&dir);
    
    // Sanitize file name
    let safe_name: String = name.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
    let file_path = dir.join(format!("{}.json", safe_name.to_lowercase()));
    
    fs::write(&file_path, json_content).map_err(|e| format!("Failed to write layout file: {}", e))
}

#[tauri::command]
fn delete_layout_preset_file(name: String) -> Result<(), String> {
    let dir = get_layouts_directory();
    let safe_name: String = name.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
    let file_path = dir.join(format!("{}.json", safe_name.to_lowercase()));
    
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| format!("Failed to delete layout file: {}", e))?;
    }
    Ok(())
}















#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SkinInfo {
    pub name: String,
    pub filename: String,
    pub path: String,
    pub is_valid: bool,
    pub error_reason: Option<String>,
}

#[tauri::command]
fn get_skins_directory(custom_dir: Option<String>) -> Result<String, String> {
    if let Some(dir) = custom_dir {
        let p = PathBuf::from(dir.trim().trim_matches('"').trim_matches('\''));
        if p.exists() && p.is_dir() {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Ok(resolve_media_subdir("skins").to_string_lossy().to_string())
}

#[tauri::command]
fn list_available_skins(folder_path: String) -> Result<Vec<SkinInfo>, String> {
    let clean = folder_path.trim().trim_matches('"').trim_matches('\'');
    let dir = PathBuf::from(clean);
    if !dir.exists() || !dir.is_dir() {
        return Err("Directory does not exist".into());
    }

    let mut skins = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("css") {
                        let filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let name = p.file_stem().unwrap_or_default().to_string_lossy().to_string();

                        // Size check (Max 500 KB)
                        let metadata = fs::metadata(&p).map_err(|e| e.to_string())?;
                        if metadata.len() > 500 * 1024 {
                            skins.push(SkinInfo {
                                name,
                                filename,
                                path: p.to_string_lossy().to_string(),
                                is_valid: false,
                                error_reason: Some("File exceeds 500KB limit".into()),
                            });
                            continue;
                        }

                        // Inspect content for essential CSS variables
                        let content = fs::read_to_string(&p).unwrap_or_default();
                        let has_root = content.contains(":root");
                        let has_glow = content.contains("--glow-core");
                        let has_base = content.contains("--stone-base");

                        let is_valid = has_root && (has_glow || has_base);
                        let error_reason = if !is_valid {
                            Some("Missing :root or key theme variables (--glow-core / --stone-base)".into())
                        } else {
                            None
                        };

                        skins.push(SkinInfo {
                            name,
                            filename,
                            path: p.to_string_lossy().to_string(),
                            is_valid,
                            error_reason,
                        });
                    }
                }
            }
        }
    }

    skins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(skins)
}

#[tauri::command]
fn read_skin_css(file_path: String) -> Result<String, String> {
    let clean = file_path.trim().trim_matches('"').trim_matches('\'');
    let p = PathBuf::from(clean);
    if !p.exists() || !p.is_file() {
        return Err("Skin file does not exist".into());
    }
    fs::read_to_string(p).map_err(|e| format!("Failed to read skin CSS: {}", e))
}
















// File Explorer commands
#[tauri::command]
fn get_monolith_desktop_path() -> Result<String, String> {
    let desktop = dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Desktop")))
        .unwrap_or_else(|| PathBuf::from("C:\\MonolithDesktop"));
    let monolith_dir = desktop.join("Monolith_Workspace");
    if !monolith_dir.exists() {
        let _ = fs::create_dir_all(&monolith_dir);
    }
    Ok(monolith_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_workspace_files(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let path = PathBuf::from(dir_path.trim().trim_matches('"'));
    if !path.exists() {
        return Err("Directory does not exist".into());
    }

    let mut entries = Vec::new();
    let read = fs::read_dir(&path).map_err(|e| e.to_string())?;

    for item in read.flatten() {
        let p = item.path();
        let is_dir = p.is_dir();
        let meta = item.metadata().ok();
        let size = if is_dir { 0 } else { meta.as_ref().map(|m| m.len()).unwrap_or(0) };
        let modified = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("Unknown").to_string();

        entries.push(FileEntry {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
        });
    }

    // Default sorting folders first
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
fn open_item(path: String) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("Failed to open item: {}", e))?;
    Ok(())
}

#[tauri::command]
fn create_workspace_folder(parent_path: String, folder_name: String) -> Result<(), String> {
    let target = PathBuf::from(parent_path).join(folder_name);
    fs::create_dir(&target).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_workspace_item(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_workspace_item(old_path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&old_path);
    let parent = p.parent().ok_or("Cannot get parent directory")?;
    let target = parent.join(new_name);
    fs::rename(p, target).map_err(|e| e.to_string())
}

#[tauri::command]
fn paste_workspace_item(source_path: String, destination_folder: String, is_cut: bool) -> Result<(), String> {
    let src = PathBuf::from(&source_path);
    let file_name = src.file_name().ok_or("Invalid filename")?;
    let dest = PathBuf::from(destination_folder).join(file_name);

    if is_cut {
        fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    } else if src.is_dir() {
        let _ = fs::create_dir_all(&dest);
    } else {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_quick_access_paths() -> Result<QuickAccessPaths, String> {
    let desktop = dirs::desktop_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\Users".into());
    let downloads = dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\Downloads".into());
    let documents = dirs::document_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\Documents".into());
    let pictures = dirs::picture_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\Pictures".into());

    Ok(QuickAccessPaths {
        desktop,
        downloads,
        documents,
        pictures,
        root_c: "C:\\".into(),
    })
}

#[tauri::command]
fn open_item_with(path: String) -> Result<(), String> {
    let clean = path.trim().trim_matches('"').trim_matches('\'');

    // Directly invoke Windows OpenWith.exe host
    let spawn_res = Command::new("OpenWith.exe")
        .arg(clean)
        .spawn();

    if let Err(_) = spawn_res {
        // Fallback invoking Windows explorer OpenAs verb directly
        Command::new("explorer.exe")
            .arg(clean)
            .spawn()
            .map_err(|e| format!("Failed to summon Open With dialog: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn show_in_explorer(path: String) -> Result<(), String> {
    let clean = path.trim().trim_matches('"').trim_matches('\'');
    let mut p = PathBuf::from(clean);

    // Resolve real canonical path if possible
    if let Ok(canonical) = fs::canonicalize(&p) {
        // Strip the Windows extended path prefix `\\?\` that canonicalize prepends
        let path_str = canonical.to_string_lossy().to_string();
        let stripped = if path_str.starts_with(r"\\?\") {
            path_str[4..].to_string()
        } else {
            path_str
        };
        p = PathBuf::from(stripped);
    }

    if !p.exists() {
        return Err("Path does not exist on disk".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let normalized = p.to_string_lossy().to_string();
        if p.is_file() {
            // Pass `/select,` as an exact parameter without quotes mangling
            Command::new("explorer.exe")
                .arg("/select,")
                .arg(&normalized)
                .spawn()
                .map_err(|e| format!("Failed to reveal item in Explorer: {}", e))?;
        } else {
            Command::new("explorer.exe")
                .arg(&normalized)
                .spawn()
                .map_err(|e| format!("Failed to open directory in Explorer: {}", e))?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(p.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open item: {}", e))?;
    }

    Ok(())
}









#[derive(serde::Serialize)]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
}

#[tauri::command]
fn get_audio_output_devices() -> Result<Vec<AudioOutputDevice>, String> {
    let host = cpal::default_host();
    let devices = host.output_devices().map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for dev in devices {
        if let Ok(name) = dev.name() {
            list.push(AudioOutputDevice {
                id: name.clone(),
                name,
            });
        }
    }
    Ok(list)
}














#[tauri::command]
fn open_layouts_directory() -> Result<(), String> {
    let dir = get_layouts_directory();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    
    Ok(())
}












#[tauri::command]
fn exit_monolith(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}


#[tauri::command]
fn is_autostart_launch() -> bool {
    let args: Vec<String> = std::env::args().collect();
    args.iter().any(|arg| arg == "--minimized" || arg == "--autostart")
}









// Scans Windows Start Menu shortcuts recursively
fn scan_shortcuts_recursive(dir: &Path, apps: &mut Vec<InstalledApp>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                scan_shortcuts_recursive(&p, apps);
            } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "lnk" || ext_lower == "url" {
                    let stem = p.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();

                    // Filter out uninstalls, helpers, web links, or documentation
                    let lower_stem = stem.to_lowercase();
                    if !lower_stem.is_empty()
                        && !lower_stem.contains("uninstall")
                        && !lower_stem.contains("readme")
                        && !lower_stem.contains("help")
                        && !lower_stem.contains("documentation")
                    {
                        apps.push(InstalledApp {
                            name: stem,
                            path: p.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    let mut apps: Vec<InstalledApp> = Vec::new();

    // 1. Common system utilities available on every Windows machine
    let native_tools = [
        ("Command Prompt", "cmd.exe"),
        ("Windows Terminal", "wt.exe"),
        ("File Explorer", "explorer.exe"),
        ("Task Manager", "taskmgr.exe"),
        ("Calculator", "calc.exe"),
        ("Notepad", "notepad.exe"),
        ("Registry Editor", "regedit.exe"),
        ("Control Panel", "control.exe"),
    ];
    for (name, exec) in native_tools {
        apps.push(InstalledApp {
            name: name.to_string(),
            path: exec.to_string(),
        });
    }

    // 2. All Users Start Menu
    let program_data = PathBuf::from("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs");
    if program_data.exists() {
        scan_shortcuts_recursive(&program_data, &mut apps);
    }

    // 3. User Specific Start Menu
    if let Some(app_data) = dirs::data_dir() {
        let user_start = app_data.join("Microsoft\\Windows\\Start Menu\\Programs");
        if user_start.exists() {
            scan_shortcuts_recursive(&user_start, &mut apps);
        }
    }

    // Deduplicate by application name
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));

    Ok(apps)
}





















#[tauri::command]
fn get_system_vitals() -> Result<SystemVitals, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    let cpu_usage = sys.global_cpu_usage();
    let cpu_cores: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();

    // Get logical core count (minimum 1 to prevent divide by zero)
    let core_count = sys.cpus().len().max(1) as f32;

    let mem_used_gb = (sys.used_memory() as f32) / (1024.0 * 1024.0 * 1024.0);
    let mem_total_gb = (sys.total_memory() as f32) / (1024.0 * 1024.0 * 1024.0);
    let uptime_secs = System::uptime();
    let process_count = sys.processes().len();

    // Networks
    let mut networks = Networks::new_with_refreshed_list();
    networks.refresh();
    let mut net_rx_kb = 0;
    let mut net_tx_kb = 0;
    for (_name, net) in &networks {
        net_rx_kb += net.received() / 1024;
        net_tx_kb += net.transmitted() / 1024;
    }

    // Disks
    let disks_info = Disks::new_with_refreshed_list();
    let mut disks = Vec::new();
    for d in &disks_info {
        let total = (d.total_space() as f32) / (1024.0 * 1024.0 * 1024.0);
        let avail = (d.available_space() as f32) / (1024.0 * 1024.0 * 1024.0);
        disks.push(DiskVolume {
            name: d.name().to_string_lossy().to_string(),
            mount: d.mount_point().to_string_lossy().to_string(),
            total_gb: total,
            used_gb: total - avail,
        });
    }

    // All active processes with normalized CPU percentage
    let mut procs: Vec<ProcessItem> = sys.processes().iter().map(|(pid, p)| {
        ProcessItem {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            // Normalize across logical CPU threads
            cpu: p.cpu_usage() / core_count,
            mem_mb: p.memory() / (1024 * 1024),
        }
    }).collect();

    procs.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));

    Ok(SystemVitals {
        cpu_usage,
        cpu_cores,
        mem_used_gb,
        mem_total_gb,
        net_rx_kb,
        net_tx_kb,
        uptime_secs,
        process_count,
        disks,
        all_processes: procs,
    })
}


















#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomVisualizerInfo {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub path: String,
    pub kind: String, // "model" (glb/gltf), "shader" (frag/glsl), "script" (js/mjs)
}

#[tauri::command]
fn get_visualizers_directory(custom_dir: Option<String>) -> Result<String, String> {
    if let Some(dir) = custom_dir {
        let p = PathBuf::from(dir.trim().trim_matches('"').trim_matches('\''));
        if p.exists() && p.is_dir() {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Ok(resolve_media_subdir("custom-visualizers").to_string_lossy().to_string())
}

#[tauri::command]
fn list_custom_visualizers(folder_path: String) -> Result<Vec<CustomVisualizerInfo>, String> {
    let clean = folder_path.trim().trim_matches('"').trim_matches('\'');
    let dir = PathBuf::from(clean);
    if !dir.exists() || !dir.is_dir() {
        return Err("Visualizer directory does not exist".into());
    }

    let mut visualizers = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();

            // 1. FOLDER-BASED PRESET: e.g. custom-visualizers/mega-pyramid/
            if p.is_dir() {
                let folder_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                let sub_entries = fs::read_dir(&p).ok();

                let mut entry_script: Option<PathBuf> = None;

                if let Some(files) = sub_entries {
                    let collected: Vec<PathBuf> = files.flatten().map(|e| e.path()).collect();
                    
                    // Look for index.js / main.js or <foldername>.js
                    for sub_p in &collected {
                        if sub_p.is_file() {
                            if let Some(stem) = sub_p.file_stem().and_then(|s| s.to_str()) {
                                let ext = sub_p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                                if ext == "js" || ext == "mjs" {
                                    if stem.eq_ignore_ascii_case("index")
                                        || stem.eq_ignore_ascii_case("main")
                                        || stem.eq_ignore_ascii_case(&folder_name)
                                    {
                                        entry_script = Some(sub_p.clone());
                                        break;
                                    }
                                    if entry_script.is_none() {
                                        entry_script = Some(sub_p.clone());
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some(script_path) = entry_script {
                    let display_name = folder_name.replace('_', " ").replace('-', " ");
                    visualizers.push(CustomVisualizerInfo {
                        id: format!("custom_{}", folder_name),
                        name: display_name,
                        filename: script_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        path: script_path.to_string_lossy().to_string(),
                        kind: "script".to_string(),
                    });
                }
            } 
            // 2. STANDALONE GLSL SHADER FILES (optional convenience)
            else if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    let kind = match ext_lower.as_str() {
                        "frag" | "glsl" => Some("shader"),
                        "js" | "mjs" => Some("script"),
                        _ => None,
                    };
                    if let Some(k) = kind {
                        let raw_name = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
                        let name = raw_name.replace('_', " ").replace('-', " ");
                        visualizers.push(CustomVisualizerInfo {
                            id: format!("custom_{}", raw_name),
                            name,
                            filename: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            path: p.to_string_lossy().to_string(),
                            kind: k.to_string(),
                        });
                    }
                }
            }
        }
    }

    visualizers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(visualizers)
}



// Helper to ensure paths cannot escape outside the allowed folder
fn validate_safe_path(target_path: &Path, allowed_root: &Path) -> Result<PathBuf, String> {
    let canonical_root = allowed_root.canonicalize()
        .map_err(|_| "Invalid or missing root visualizer folder".to_string())?;
    
    let canonical_target = target_path.canonicalize()
        .map_err(|_| "Target file does not exist or invalid path".to_string())?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Access Denied: Attempted path traversal outside visualizer bounds".to_string());
    }

    Ok(canonical_target)
}


#[tauri::command]
fn read_custom_visualizer_code(file_path: String) -> Result<String, String> {
    let clean = file_path.trim().trim_matches('"').trim_matches('\'');
    let p = PathBuf::from(clean);

    // Prevent directory traversal sequences
    if clean.contains("..") {
        return Err("Path traversal sequences are not allowed".into());
    }

    if !p.exists() || !p.is_file() {
        return Err("Visualizer source file does not exist".into());
    }

    // Strict file extension whitelist
    if let Some(ext) = p.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if ext_str != "js" && ext_str != "glsl" {
            return Err("Disallowed file type. Only .js and .glsl scripts are permitted".into());
        }
    } else {
        return Err("File without extension is not permitted".into());
    }

    fs::read_to_string(p).map_err(|e| format!("Failed to read visualizer source: {}", e))
}

#[tauri::command]
fn read_binary_file(file_path: String) -> Result<Vec<u8>, String> {
    let clean = file_path.trim().trim_matches('"').trim_matches('\'');
    let p = PathBuf::from(clean);

    // Prevent directory traversal sequences
    if clean.contains("..") {
        return Err("Path traversal sequences are not allowed".into());
    }

    if !p.exists() || !p.is_file() {
        return Err("Target file does not exist".into());
    }

    // Strict 3D model / asset format whitelist
    if let Some(ext) = p.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if ext_str != "glb" && ext_str != "gltf" && ext_str != "bin" {
            return Err("Disallowed binary format. Only .glb, .gltf, and .bin assets are allowed".into());
        }
    } else {
        return Err("Binary file without extension is not permitted".into());
    }

    fs::read(p).map_err(|e| format!("Failed to read binary file: {}", e))
}









/// Resolves the primary local LAN IPv4 address (e.g. 192.168.1.X)
fn resolve_local_ipv4() -> String {
    // Probing a private routing target determines which local network interface Windows uses
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("10.255.255.255:1").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip();
                if let IpAddr::V4(v4) = ip {
                    if !v4.is_loopback() {
                        return v4.to_string();
                    }
                }
            }
        }
    }
    // Fallback: Default to standard local loopback if not connected to a network
    "127.0.0.1".to_string()
}

#[tauri::command]
fn get_lan_ip() -> Result<String, String> {
    Ok(resolve_local_ipv4())
}


#[tauri::command]
fn get_remote_server_status(state: tauri::State<RemoteServerState>) -> Result<RemoteServerStatus, String> {
    Ok(RemoteServerStatus {
        is_running: state.is_running.load(Ordering::SeqCst),
        ip: resolve_local_ipv4(),
        port: 7890,
    })
}

#[tauri::command]
fn sync_companion_state(
    state: tauri::State<RemoteServerState>,
    playback: CompanionPlaybackState,
) -> Result<(), String> {
    if let Ok(mut lock) = state.playback_state.write() {
        *lock = playback;
    }
    Ok(())
}

#[tauri::command]
fn start_remote_server(
    app: tauri::AppHandle,
    state: tauri::State<RemoteServerState>,
) -> Result<RemoteServerStatus, String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Ok(RemoteServerStatus {
            is_running: true,
            ip: resolve_local_ipv4(),
            port: 7890,
        });
    }

    let bind_addr = "0.0.0.0:7890";
    println!("📡 [MONOLITH UPLINK] Attempting bind to {}", bind_addr);

    // Bind with brief retries if the OS is in quick recycling
    let mut bound_server: Option<Arc<Server>> = None;
    let mut last_err = String::new();

    let socket_addr: SocketAddr = bind_addr.parse().map_err(|e| format!("{}", e))?;
    let mut bound_server: Option<Arc<Server>> = None;
    let mut last_err = String::new();

    for attempt in 1..=5 {
        match create_reusable_listener(socket_addr) {
            Ok(std_listener) => {
                match Server::from_listener(std_listener, None) {
                    Ok(s) => {
                        bound_server = Some(Arc::new(s));
                        break;
                    }
                    Err(e) => {
                        last_err = format!("{}", e);
                    }
                }
            }
            Err(e) => {
                last_err = format!("{}", e);
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
        }
    }

    let server = bound_server.ok_or_else(|| {
        format!("Failed to bind to {} after 5 attempts: {}", bind_addr, last_err)
    })?;

    // Store server handle
    if let Ok(mut handle) = state.server_handle.write() {
        *handle = Some(server.clone());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let is_running_clone = state.is_running.clone();
    let playback_state_clone = state.playback_state.clone();
    let clients_clone = state.connected_clients.clone();
    let app_handle = app.clone();
    let local_ip = resolve_local_ipv4();
    let srv = server.clone();

    // Spawn and save thread handle so stop_remote_server can cleanly join it
    let join_handle = std::thread::spawn(move || {
        println!("📡 [MONOLITH UPLINK] Daemon active at http://{}:7890", local_ip);

        while is_running_clone.load(Ordering::SeqCst) {
            match srv.recv_timeout(std::time::Duration::from_millis(250)) {
                Ok(Some(request)) => {
                    let url = request.url().to_string();
                    let client_ip = request
                        .remote_addr()
                        .map(|a| a.ip().to_string())
                        .unwrap_or_else(|| "Unknown Node".into());

                    let user_agent = request
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv("User-Agent"))
                        .map(|h| h.value.as_str().to_string())
                        .unwrap_or_else(|| "Unknown Handheld".to_string());

                    if url.starts_with("/api/") || url == "/" || url == "/remote" {
                        if let Ok(mut clients) = clients_clone.write() {
                            let device_name = parse_device_label(&user_agent);
                            clients.insert(
                                client_ip.clone(),
                                ActiveClientEntry {
                                    ip: client_ip,
                                    user_agent,
                                    device_name,
                                    last_seen: Instant::now(),
                                },
                            );
                        }
                    }

                    let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
                    let content_type_json = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                    let content_type_html = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();

                    if request.method().as_str() == "OPTIONS" {
                        let preflight = Response::empty(204)
                            .with_header(cors_header)
                            .with_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap())
                            .with_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap());
                        let _ = request.respond(preflight);
                        continue;
                    }

                    if url == "/api/state" {
                        let json_str = {
                            let lock = playback_state_clone.read().unwrap();
                            serde_json::to_string(&*lock).unwrap_or_else(|_| "{}".to_string())
                        };
                        let response = Response::from_string(json_str)
                            .with_header(content_type_json)
                            .with_header(cors_header);
                        let _ = request.respond(response);
                        continue;
                    }

                    if url.starts_with("/api/action/") {
                        let action = url.trim_start_matches("/api/action/");
                        let _ = app_handle.emit("companion-media-command", action.to_string());

                        let response = Response::from_string("{\"status\":\"ok\"}")
                            .with_header(content_type_json)
                            .with_header(cors_header);
                        let _ = request.respond(response);
                        continue;
                    }

                    if url == "/" || url == "/remote" || url.starts_with("/?") {
                        let shell_html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>MONOLITH // UPLINK</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        html, body {{ width: 100%; height: 100%; background: #07090c; overflow: hidden; }}
        iframe {{ width: 100%; height: 100%; border: none; display: block; }}
    </style>
</head>
<body>
    <iframe src="http://{}:1420/remote.html"></iframe>
</body>
</html>"#, local_ip);

                        let response = Response::from_string(shell_html)
                            .with_header(content_type_html)
                            .with_header(cors_header);
                        let _ = request.respond(response);
                        continue;
                    }

                    let not_found = Response::from_string("404 Not Found")
                        .with_status_code(404)
                        .with_header(cors_header);
                    let _ = request.respond(not_found);
                }
                Ok(None) => {}
                Err(_) => { break; }
            }
        }
        println!("⏹ [MONOLITH UPLINK] Background server loop exited and dropped socket.");
    });

    // Save thread handle
    if let Ok(mut thandle) = state.thread_handle.write() {
        *thandle = Some(join_handle);
    }

    Ok(RemoteServerStatus {
        is_running: true,
        ip: resolve_local_ipv4(),
        port: 7890,
    })
}

#[tauri::command]
fn stop_remote_server(state: tauri::State<RemoteServerState>) -> Result<RemoteServerStatus, String> {
    println!("⏹ [MONOLITH UPLINK] Stopping remote server...");
    state.is_running.store(false, Ordering::SeqCst);

    // 1. Unblock the tiny_http receiver immediately
    if let Ok(mut handle) = state.server_handle.write() {
        if let Some(srv) = handle.take() {
            srv.unblock();
        }
    }

    // 2. Wait for the background thread to exit so the OS socket descriptor is completely released
    if let Ok(mut thandle) = state.thread_handle.write() {
        if let Some(jh) = thandle.take() {
            let _ = jh.join();
            println!("⏹ [MONOLITH UPLINK] Thread joined successfully. Port 7890 is fully released.");
        }
    }

    Ok(RemoteServerStatus {
        is_running: false,
        ip: resolve_local_ipv4(),
        port: 7890,
    })
}

#[tauri::command]
fn get_connected_clients(state: tauri::State<RemoteServerState>) -> Result<Vec<ConnectedClientInfo>, String> {
    let mut result = Vec::new();
    let now = Instant::now();

    if let Ok(mut clients) = state.connected_clients.write() {
        // Prune clients inactive for more than 15 seconds
        clients.retain(|_, client| now.duration_since(client.last_seen).as_secs() <= 15);

        for (id, client) in clients.iter() {
            let secs = now.duration_since(client.last_seen).as_secs();
            result.push(ConnectedClientInfo {
                id: id.clone(),
                ip: client.ip.clone(),
                user_agent: client.user_agent.clone(),
                device_name: client.device_name.clone(),
                last_seen_secs_ago: secs,
            });
        }
    }

    Ok(result)
}






fn parse_device_label(user_agent: &str) -> String {
    let ua = user_agent.to_lowercase();
    if ua.contains("iphone") {
        "Apple iPhone (iOS)".to_string()
    } else if ua.contains("ipad") {
        "Apple iPad (iPadOS)".to_string()
    } else if ua.contains("android") {
        if ua.contains("mobile") {
            "Android Mobile Handheld".to_string()
        } else {
            "Android Tablet".to_string()
        }
    } else if ua.contains("macintosh") || ua.contains("mac os") {
        "macOS Station Node".to_string()
    } else if ua.contains("windows") {
        "Windows Network Client".to_string()
    } else if ua.contains("linux") {
        "Linux Network Node".to_string()
    } else {
        "Remote Web Terminal".to_string()
    }
}


fn create_reusable_listener(addr: SocketAddr) -> std::io::Result<std::net::TcpListener> {
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    // Allow instant port rebinding without OS TIME_WAIT locks
    socket.set_reuse_address(true)?;

    socket.bind(&addr.into())?;
    socket.listen(128)?;
    Ok(socket.into())
}








#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WallpaperWatcher(Mutex::new(None)))
        .manage(MediaShortcutRegistry(Mutex::new(HashMap::new())))
        .manage(RemoteServerState {
            is_running: Arc::new(AtomicBool::new(false)),
            playback_state: Arc::new(RwLock::new(CompanionPlaybackState::default())),
            connected_clients: Arc::new(RwLock::new(HashMap::new())),
            server_handle: Arc::new(RwLock::new(None)),
            thread_handle: Arc::new(RwLock::new(None)),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|_app| {
            Ok(())
        })
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        
        .invoke_handler(tauri::generate_handler![
            is_autostart_launch,
            scan_music_directory,
            scan_wallpapers_directory,
            watch_wallpapers_directory,
            launch_command,
            system_power_action,
            get_monolith_desktop_path,
            list_workspace_files,
            open_item,
            show_in_explorer,
            create_workspace_folder,
            delete_workspace_item,
            rename_workspace_item,
            paste_workspace_item,
            get_system_vitals,
            get_quick_access_paths,
            get_installed_apps,
            open_item_with,
            exit_monolith,
            get_skins_directory,
            list_available_skins,
            read_skin_css,
            get_visualizers_directory,
            list_custom_visualizers,
            read_custom_visualizer_code,
            read_binary_file,
            list_layout_presets,
            save_layout_preset_file,
            delete_layout_preset_file,
            open_layouts_directory,
            register_global_media_shortcut,
            unregister_global_media_shortcut,
            get_audio_output_devices,
            get_lan_ip,
            get_remote_server_status,
            start_remote_server,
            stop_remote_server,
            sync_companion_state,
            get_connected_clients
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}