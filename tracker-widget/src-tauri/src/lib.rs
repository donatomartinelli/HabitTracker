use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;

#[tauri::command]
fn save_note(app: tauri::AppHandle, category: String, text: String) -> Result<(), String> {
    // 1. Trova il Desktop del tuo computer
    let desktop_path = app.path().desktop_dir().map_err(|e| e.to_string())?;
    
    // 2. Crea/Trova la cartella "Notes"
    let notes_dir = desktop_path.join("Notes");
    if !notes_dir.exists() {
        std::fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    }
    
    // 3. Punta al file di testo specifico (es. Productivity.txt)
    let file_path = notes_dir.join(format!("{}.txt", category));
    
    // 4. Apri il file (o crealo se non c'è) e preparati ad APPENDERE il testo alla fine
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;
        
    // 5. Scrivi la nota e vai a capo due volte
    writeln!(file, "{}\n", text).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Questo comando collega il tuo JS al codice Rust scritto sopra
        .invoke_handler(tauri::generate_handler![save_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}