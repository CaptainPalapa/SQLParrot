fn main() {
  // Include bundled database as a resource
  println!("cargo:rerun-if-changed=resources/sqlparrot.db");

  tauri_build::build()
}
