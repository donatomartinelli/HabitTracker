use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct SonyTransferredAudio {
    pub name: String,
    pub size: u64,
    pub last_modified_ms: u64,
    pub saved_path: String,
    pub base64_data: String,
}

fn encode_base64_std(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn is_audio_extension(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        matches!(
            ext.to_ascii_lowercase().as_str(),
            "mp3" | "wav" | "m4a" | "ogg" | "aac" | "flac" | "webm"
        )
    } else {
        false
    }
}

#[tauri::command]
fn poll_and_move_sony_audio(
    custom_archive_dir: Option<String>,
    processed_signatures: Vec<String>,
    include_pending_archive: bool,
) -> Result<Vec<SonyTransferredAudio>, String> {
    let default_archive = r"C:\Users\donat\Desktop\Progetti\Cortex\SonyArchive";
    let archive_path = match custom_archive_dir {
        Some(ref s) if !s.trim().is_empty() => PathBuf::from(s.trim()),
        _ => PathBuf::from(default_archive),
    };

    let _ = fs::create_dir_all(&archive_path);
    let mut newly_moved_paths: Vec<PathBuf> = Vec::new();

    // 1. Scansiona le unità rimovibili (D: .. Z:) cercando VOICE\A
    for drive_letter in b'D'..=b'Z' {
        let drive_char = drive_letter as char;
        let voice_a_dir = PathBuf::from(format!(r"{}:\VOICE\A", drive_char));

        if !voice_a_dir.exists() || !voice_a_dir.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(&voice_a_dir) {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        let mut usb_files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok().map(|de| de.path()))
            .filter(|p| p.is_file() && is_audio_extension(p))
            .collect();

        usb_files.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH));

        for src_path in usb_files {
            let file_name = match src_path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            let meta = match fs::metadata(&src_path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let src_size = meta.len();
            if src_size == 0 {
                continue;
            }

            let mut dest_path = archive_path.join(&file_name);
            if dest_path.exists() {
                let same_size = fs::metadata(&dest_path).map(|m| m.len() == src_size).unwrap_or(false);
                if !same_size {
                    let last_mod = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("audio");
                    let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("mp3");
                    dest_path = archive_path.join(format!("{}_{}.{}", stem, last_mod, ext));
                }
            }

            if fs::copy(&src_path, &dest_path).is_ok() {
                let copy_verified = fs::metadata(&dest_path)
                    .map(|dm| dm.len() == src_size)
                    .unwrap_or(false);

                if copy_verified {
                    let _ = fs::remove_file(&src_path);
                    newly_moved_paths.push(dest_path);
                }
            }
        }
    }

    // 2. Se abbiamo appena spostato file da USB oppure l'utente ha premuto [SYNC SONY],
    //    raccoglie da SonyArchive tutti i file non ancora trascritti.
    if newly_moved_paths.is_empty() && !include_pending_archive {
        return Ok(Vec::new());
    }

    let processed_set: HashSet<String> = processed_signatures.into_iter().collect();

    let candidate_paths: Vec<PathBuf> = if include_pending_archive {
        match fs::read_dir(&archive_path) {
            Ok(rd) => {
                let mut all: Vec<PathBuf> = rd
                    .filter_map(|e| e.ok().map(|de| de.path()))
                    .filter(|p| p.is_file() && is_audio_extension(p))
                    .collect();
                all.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH));
                all
            }
            Err(_) => newly_moved_paths,
        }
    } else {
        newly_moved_paths
    };

    let mut result = Vec::new();

    for path in candidate_paths {
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size = meta.len();
        if size == 0 {
            continue;
        }
        let last_modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let sig_full = format!("{}_{}_{}", file_name, size, last_modified_ms);
        let sig_name_size = format!("{}_{}", file_name, size);

        if processed_set.contains(&sig_full) || processed_set.contains(&sig_name_size) {
            continue;
        }

        if let Ok(bytes) = fs::read(&path) {
            result.push(SonyTransferredAudio {
                name: file_name,
                size,
                last_modified_ms,
                saved_path: path.to_string_lossy().to_string(),
                base64_data: encode_base64_std(&bytes),
            });
        }
    }

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![poll_and_move_sony_audio])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}