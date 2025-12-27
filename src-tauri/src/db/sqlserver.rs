// ABOUTME: SQL Server connection management using tiberius
// ABOUTME: Handles connection, database queries, and snapshot operations

use chrono::{DateTime, Utc};
use thiserror::Error;
use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::config::ConnectionProfile;
use crate::models::DatabaseInfo;

#[derive(Error, Debug)]
pub enum SqlServerError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Query failed: {0}")]
    QueryFailed(String),
    #[error("Tiberius error: {0}")]
    Tiberius(#[from] tiberius::error::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database not found: {0}")]
    DatabaseNotFound(String),
    #[error("Snapshot operation failed: {0}")]
    SnapshotError(String),
}

pub struct SqlServerConnection {
    client: Client<Compat<TcpStream>>,
}

impl SqlServerConnection {
    /// Connect to SQL Server using a connection profile
    pub async fn connect(profile: &ConnectionProfile) -> Result<Self, SqlServerError> {
        let mut config = Config::new();
        config.host(&profile.host);
        config.port(profile.port);
        config.authentication(AuthMethod::sql_server(&profile.username, &profile.password));

        if profile.trust_certificate {
            config.trust_cert();
        }

        let tcp = TcpStream::connect(config.get_addr())
            .await
            .map_err(|e| SqlServerError::ConnectionFailed(e.to_string()))?;

        tcp.set_nodelay(true)?;

        let client = Client::connect(config, tcp.compat_write())
            .await
            .map_err(|e| SqlServerError::ConnectionFailed(e.to_string()))?;

        Ok(Self { client })
    }

    /// Test connection by querying SQL Server version
    pub async fn test_connection(&mut self) -> Result<String, SqlServerError> {
        let row = self
            .client
            .simple_query("SELECT @@VERSION")
            .await?
            .into_row()
            .await?
            .ok_or_else(|| SqlServerError::QueryFailed("No version returned".to_string()))?;

        let version: &str = row.get(0).unwrap_or("Unknown");
        Ok(version.to_string())
    }

    /// Get list of user databases (excluding system databases and snapshots)
    pub async fn get_databases(&mut self) -> Result<Vec<DatabaseInfo>, SqlServerError> {
        let query = r#"
            SELECT
                name,
                create_date,
                CASE
                    WHEN name LIKE 'DW%' THEN 'Data Warehouse'
                    WHEN name LIKE 'Global%' THEN 'Global'
                    ELSE 'User'
                END as category
            FROM sys.databases
            WHERE database_id > 4
              AND source_database_id IS NULL
              AND name NOT LIKE '%_snapshot_%'
              AND name != 'sqlparrot'
            ORDER BY name
        "#;

        let stream = self.client.simple_query(query).await?;
        let rows = stream.into_first_result().await?;

        let mut databases = Vec::new();
        for row in rows {
            let name: &str = row.get(0).unwrap_or("");
            let create_date: chrono::NaiveDateTime = row.get(1).unwrap_or_default();
            let category: &str = row.get(2).unwrap_or("User");

            databases.push(DatabaseInfo {
                name: name.to_string(),
                create_date: DateTime::from_naive_utc_and_offset(create_date, Utc),
                category: category.to_string(),
            });
        }

        Ok(databases)
    }

    /// Get data files for a database (needed for snapshot creation)
    pub async fn get_database_files(
        &mut self,
        database: &str,
    ) -> Result<Vec<(String, String)>, SqlServerError> {
        let query = format!(
            r#"
            SELECT name, physical_name
            FROM sys.master_files
            WHERE database_id = DB_ID('{}') AND type = 0
            "#,
            database.replace('\'', "''")
        );

        let stream = self.client.simple_query(&query).await?;
        let rows = stream.into_first_result().await?;

        let mut files = Vec::new();
        for row in rows {
            let name: &str = row.get(0).unwrap_or("");
            let physical_name: &str = row.get(1).unwrap_or("");
            files.push((name.to_string(), physical_name.to_string()));
        }

        if files.is_empty() {
            return Err(SqlServerError::DatabaseNotFound(database.to_string()));
        }

        Ok(files)
    }

    /// Create a database snapshot
    pub async fn create_snapshot(
        &mut self,
        source_db: &str,
        snapshot_name: &str,
        snapshot_path: &str,
    ) -> Result<(), SqlServerError> {
        // Get data files for the source database
        let files = self.get_database_files(source_db).await?;

        // Build the CREATE DATABASE statement
        let file_specs: Vec<String> = files
            .iter()
            .enumerate()
            .map(|(i, (name, _))| {
                let file_path = format!("{}\\{}_{}.ss", snapshot_path, snapshot_name, i);
                format!("(NAME = '{}', FILENAME = '{}')", name, file_path)
            })
            .collect();

        let query = format!(
            "CREATE DATABASE [{}] ON {} AS SNAPSHOT OF [{}]",
            snapshot_name,
            file_specs.join(", "),
            source_db
        );

        self.client
            .simple_query(&query)
            .await
            .map_err(|e| SqlServerError::SnapshotError(e.to_string()))?;

        Ok(())
    }

    /// Drop a database snapshot
    pub async fn drop_snapshot(&mut self, snapshot_name: &str) -> Result<(), SqlServerError> {
        let query = format!("DROP DATABASE IF EXISTS [{}]", snapshot_name);
        self.client
            .simple_query(&query)
            .await
            .map_err(|e| SqlServerError::SnapshotError(e.to_string()))?;
        Ok(())
    }

    /// Kill all connections to a database
    pub async fn kill_connections(&mut self, database: &str) -> Result<u32, SqlServerError> {
        // Get active sessions
        let query = format!(
            "SELECT session_id FROM sys.dm_exec_sessions WHERE database_id = DB_ID('{}')",
            database.replace('\'', "''")
        );

        let stream = self.client.simple_query(&query).await?;
        let rows = stream.into_first_result().await?;

        let mut killed = 0u32;
        for row in rows {
            let session_id: i16 = row.get(0).unwrap_or(0);
            if session_id > 0 {
                let kill_query = format!("KILL {}", session_id);
                // Ignore errors when killing sessions
                let _ = self.client.simple_query(&kill_query).await;
                killed += 1;
            }
        }

        Ok(killed)
    }

    /// Set database to single user mode
    pub async fn set_single_user(&mut self, database: &str) -> Result<(), SqlServerError> {
        let query = format!(
            "ALTER DATABASE [{}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE",
            database
        );
        self.client
            .simple_query(&query)
            .await
            .map_err(|e| SqlServerError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    /// Set database to multi user mode
    pub async fn set_multi_user(&mut self, database: &str) -> Result<(), SqlServerError> {
        let query = format!("ALTER DATABASE [{}] SET MULTI_USER", database);
        self.client
            .simple_query(&query)
            .await
            .map_err(|e| SqlServerError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    /// Restore database from snapshot
    pub async fn restore_from_snapshot(
        &mut self,
        database: &str,
        snapshot_name: &str,
    ) -> Result<(), SqlServerError> {
        let query = format!(
            "RESTORE DATABASE [{}] FROM DATABASE_SNAPSHOT = '{}'",
            database, snapshot_name
        );
        self.client
            .simple_query(&query)
            .await
            .map_err(|e| SqlServerError::SnapshotError(e.to_string()))?;
        Ok(())
    }

    /// Check if a snapshot exists in SQL Server
    pub async fn snapshot_exists(&mut self, snapshot_name: &str) -> Result<bool, SqlServerError> {
        let query = format!(
            "SELECT 1 FROM sys.databases WHERE name = '{}' AND source_database_id IS NOT NULL",
            snapshot_name.replace('\'', "''")
        );

        let stream = self.client.simple_query(&query).await?;
        let rows = stream.into_first_result().await?;
        Ok(!rows.is_empty())
    }

    /// Get all snapshots from SQL Server (for verification)
    pub async fn get_all_snapshots(&mut self) -> Result<Vec<String>, SqlServerError> {
        let query = "SELECT name FROM sys.databases WHERE source_database_id IS NOT NULL";

        let stream = self.client.simple_query(query).await?;
        let rows = stream.into_first_result().await?;

        let snapshots: Vec<String> = rows
            .iter()
            .filter_map(|row| row.get::<&str, _>(0).map(|s| s.to_string()))
            .collect();

        Ok(snapshots)
    }

    /// Check database state
    pub async fn get_database_state(&mut self, database: &str) -> Result<String, SqlServerError> {
        let query = format!(
            "SELECT state_desc FROM sys.databases WHERE name = '{}'",
            database.replace('\'', "''")
        );

        let stream = self.client.simple_query(&query).await?;
        let row = stream
            .into_row()
            .await?
            .ok_or_else(|| SqlServerError::DatabaseNotFound(database.to_string()))?;

        let state: &str = row.get(0).unwrap_or("UNKNOWN");
        Ok(state.to_string())
    }
}
