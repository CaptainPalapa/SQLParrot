// ABOUTME: Entry point for the SQL Parrot desktop application
// ABOUTME: Calls the library run function to start the Tauri app

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sql_parrot_lib::run();
}
