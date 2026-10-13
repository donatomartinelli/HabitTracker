import { writable } from "svelte/store";
import { getDb } from "./db.js";

// Store reattivi
export const categories = writable([]);
export const tasks = writable([]);

// Funzione centralizzata per caricare i dati dal database allo store
export async function loadAppData() {
    const db = await getDb();
    
    const cats = await db.select("SELECT * FROM categories ORDER BY sort_order ASC");
    categories.set(cats);

    const loadedTasks = await db.select("SELECT * FROM tasks");
    tasks.set(loadedTasks);
}
