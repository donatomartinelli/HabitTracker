use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: "
                CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER);
                CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, category_id TEXT, title TEXT, type TEXT, frequency TEXT, timer_minutes INTEGER, start_date TEXT, end_date TEXT, color TEXT);
                CREATE TABLE IF NOT EXISTS task_schedules (id TEXT PRIMARY KEY, task_id TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT);
                CREATE TABLE IF NOT EXISTS task_exceptions (id TEXT PRIMARY KEY, task_id TEXT, exception_date TEXT);
                CREATE TABLE IF NOT EXISTS daily_logs (id TEXT PRIMARY KEY, task_id TEXT, execution_date TEXT, instance_index INTEGER, status INTEGER);
                CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, type TEXT, amount REAL, description TEXT, transaction_date TEXT);
                CREATE TABLE IF NOT EXISTS recurring_payments (id TEXT PRIMARY KEY, title TEXT, amount REAL, day_of_month INTEGER, start_date TEXT, end_date TEXT, last_processed_date TEXT);
                CREATE TABLE IF NOT EXISTS wishlist (id TEXT PRIMARY KEY, title TEXT, estimated_cost REAL, sort_order INTEGER);
                CREATE TABLE IF NOT EXISTS diet_routines (id TEXT PRIMARY KEY, meal_type TEXT, day_of_week INTEGER, content TEXT);
                CREATE TABLE IF NOT EXISTS gym_exercises (id TEXT PRIMARY KEY, day_number INTEGER, name TEXT, rep_string TEXT, sets INTEGER, sort_order INTEGER);
                CREATE TABLE IF NOT EXISTS gym_logs (id TEXT PRIMARY KEY, exercise_id TEXT, execution_date TEXT, set_index INTEGER, weight_kg REAL);
                CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT, event_date TEXT, color TEXT);
                CREATE TABLE IF NOT EXISTS journal_entries (entry_date TEXT PRIMARY KEY, content TEXT);
            ",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(SqlBuilder::default().add_migrations("sqlite:tracker.db", migrations).build())
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}