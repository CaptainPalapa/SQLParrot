// ABOUTME: Database module exports for SQL Parrot
// ABOUTME: Contains SQLite metadata storage and SQL Server connection management

pub mod metadata;
pub mod sqlserver;

pub use metadata::MetadataStore;
pub use sqlserver::SqlServerConnection;
