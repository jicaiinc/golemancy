mod secure_storage;
mod sidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            secure_storage::secret_get,
            secure_storage::secret_set,
            secure_storage::secret_delete,
            sidecar::sidecar_runtime,
        ])
        .setup(|app| {
            sidecar::init_sidecar(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building golemancy desktop shell")
        .run(|handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                sidecar::shutdown_sidecar(handle);
            }
        });
}
