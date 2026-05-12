#[cfg(debug_assertions)]
use rand::RngCore;
use serde::Serialize;
#[cfg(debug_assertions)]
use std::path::PathBuf;
use std::process::Child;
#[cfg(debug_assertions)]
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State, WindowEvent};

#[derive(Default)]
struct RuntimeState {
    config: Mutex<Option<LocalRuntimeConfig>>,
    child: Mutex<Option<Child>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRuntimeConfig {
    api_base_url: String,
    auth_token: String,
    data_dir: String,
    native_host_config_path: String,
    sidecar_pid: u32,
    node_version: String,
}

#[tauri::command]
fn get_runtime_config(state: State<'_, RuntimeState>) -> Result<LocalRuntimeConfig, String> {
    state
        .config
        .lock()
        .map_err(|_| "Runtime config lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "Local runtime has not started".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .setup(|app| {
            let config = start_sidecar(app)?;
            let state = app.state::<RuntimeState>();
            *state
                .config
                .lock()
                .map_err(|_| "Runtime config lock poisoned")? = Some(config);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
            ) {
                let state = window.state::<RuntimeState>();
                stop_sidecar(&state);
            }
        })
        .invoke_handler(tauri::generate_handler![get_runtime_config])
        .run(tauri::generate_context!())
        .expect("error while running Golemancy desktop");
}

fn start_sidecar(app: &tauri::App) -> Result<LocalRuntimeConfig, Box<dyn std::error::Error>> {
    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("Packaged Node 24 sidecar bundle is not configured yet; release startup is blocked until externalBin/resources are wired.".into())
    }

    #[cfg(debug_assertions)]
    {
        let port = reserve_local_port()?;
        let auth_token = generate_auth_token();
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| dev_data_dir())
            .join("runtime");
        std::fs::create_dir_all(&data_dir)?;

        let node_version = read_node_version();
        if !node_version.starts_with("v24.") {
            return Err(format!(
                "Golemancy requires Node 24 for the sidecar, found {node_version}"
            )
            .into());
        }

        let repo_root = repo_root();
        let child = Command::new("pnpm")
            .arg("--dir")
            .arg(&repo_root)
            .arg("--filter")
            .arg("@golemancy/sidecar")
            .arg("dev:serve")
            .env("GOLEMANCY_LOCAL_API_HOST", "127.0.0.1")
            .env("GOLEMANCY_LOCAL_API_PORT", port.to_string())
            .env("GOLEMANCY_LOCAL_AUTH_TOKEN", &auth_token)
            .env("GOLEMANCY_DATA_DIR", data_dir.as_os_str())
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;

        let pid = child.id();
        let state = app.state::<RuntimeState>();
        *state
            .child
            .lock()
            .map_err(|_| "Runtime child lock poisoned")? = Some(child);

        let config = LocalRuntimeConfig {
            api_base_url: format!("http://127.0.0.1:{port}"),
            auth_token,
            data_dir: data_dir.to_string_lossy().into_owned(),
            native_host_config_path: native_host_runtime_config_path()
                .to_string_lossy()
                .into_owned(),
            sidecar_pid: pid,
            node_version,
        };

        write_native_host_runtime_config(&config)?;

        Ok(config)
    }
}

fn stop_sidecar(state: &RuntimeState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    #[cfg(debug_assertions)]
    {
        let _ = std::fs::remove_file(native_host_runtime_config_path());
    }
}

#[cfg(debug_assertions)]
fn reserve_local_port() -> Result<u16, std::io::Error> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

#[cfg(debug_assertions)]
fn generate_auth_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

#[cfg(debug_assertions)]
fn read_node_version() -> String {
    Command::new("node")
        .arg("-v")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

#[cfg(debug_assertions)]
fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

#[cfg(debug_assertions)]
fn dev_data_dir() -> PathBuf {
    repo_root().join(".golemancy-data")
}

#[cfg(debug_assertions)]
fn native_host_runtime_config_path() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(dev_data_dir)
        .join(".golemancy")
        .join("native-host-runtime.json")
}

#[cfg(debug_assertions)]
fn write_native_host_runtime_config(
    config: &LocalRuntimeConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = native_host_runtime_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(path, serde_json::to_vec_pretty(config)?)?;
    Ok(())
}
