// @ts-nocheck
import Database from '@tauri-apps/plugin-sql';

let dbInstance = null;

export async function getDb() {
    if (!dbInstance) {
        dbInstance = await Database.load('sqlite:tracker.db');
    }
    return dbInstance;
}

export async function migrateLegacyData() {
    const db = await getDb();
    
    const legacyTemplates = localStorage.getItem('tracker_templates');
    if (!legacyTemplates) return; 

    try {
        const templates = JSON.parse(legacyTemplates);
        const legacyCategories = JSON.parse(localStorage.getItem('tracker_category_order')) || [];
        
        for (let i = 0; i < legacyCategories.length; i++) {
            const catName = legacyCategories[i];
            await db.execute(
                'INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES ($1, $2, $3)', 
                [`c_${Date.now()}_${i}`, catName, i]
            );
        }

        for (const t of templates) {
            await db.execute(
                'INSERT INTO tasks (id, category_id, title, type, frequency, timer_minutes, start_date, end_date, color) VALUES ($1, (SELECT id FROM categories WHERE name = $2), $3, $4, $5, $6, $7, $8, $9)',
                [t.id, t.category, t.title, t.type || 'untimed', t.frequency || 'all', t.timerMinutes || 25, t.startDate, t.endDate, t.color]
            );
        }

        localStorage.removeItem('tracker_templates');
        console.log("Migrazione dati legacy completata.");
    } catch (error) {
        console.error("Errore di migrazione:", error);
    }
}