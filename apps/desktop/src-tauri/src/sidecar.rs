use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Emitter, Manager};

const READY_PREFIX: &str = "GOLEMANCY_SIDECAR_READY ";
const MAX_RESTARTS: u32 = 3;
const SHUTDOWN_GRACE_MS: u64 = 3000;
const SIDECAR_EVENT: &str = "sidecar_state";

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SidecarStatus {
    Starting,
    Ready { url: String, token: String, pid: u32 },
    Restarting { attempt: u32, reason: String },
    Failed { reason: String },
    Stopped,
}

pub struct SidecarState {
    status: Mutex<SidecarStatus>,
    child: Mutex<Option<Child>>,
}

impl SidecarState {
    fn new() -> Self {
        Self {
            status: Mutex::new(SidecarStatus::Starting),
            child: Mutex::new(None),
        }
    }
}

#[derive(Deserialize)]
struct HandshakeLine {
    url: String,
    token: String,
}

#[tauri::command]
pub fn sidecar_runtime(state: tauri::State<'_, SidecarState>) -> SidecarStatus {
    state.status.lock().unwrap().clone()
}

pub fn init_sidecar(app: &App) -> tauri::Result<()> {
    app.manage(SidecarState::new());
    let handle = app.handle().clone();
    thread::spawn(move || supervisor_loop(handle));
    Ok(())
}

pub fn shutdown_sidecar(handle: &AppHandle) {
    let state = handle.state::<SidecarState>();
    let mut guard = state.child.lock().unwrap();
    let Some(mut child) = guard.take() else {
        return;
    };

    // Try graceful SIGTERM on unix, plain kill on windows.
    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }

    let deadline = Instant::now() + Duration::from_millis(SHUTDOWN_GRACE_MS);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
    }

    drop(guard);
    set_status(handle, SidecarStatus::Stopped);
}

fn supervisor_loop(handle: AppHandle) {
    let mut attempt: u32 = 0;

    loop {
        let next = if attempt == 0 {
            SidecarStatus::Starting
        } else {
            SidecarStatus::Restarting {
                attempt,
                reason: "previous sidecar exited unexpectedly".into(),
            }
        };
        set_status(&handle, next);

        let mut child = match spawn_sidecar() {
            Ok(c) => c,
            Err(err) => {
                set_status(
                    &handle,
                    SidecarStatus::Failed {
                        reason: format!("spawn failed: {err}"),
                    },
                );
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                let _ = child.kill();
                set_status(
                    &handle,
                    SidecarStatus::Failed {
                        reason: "sidecar stdout was not piped".into(),
                    },
                );
                return;
            }
        };

        let pid = child.id();
        {
            let state = handle.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);
        }

        let reader_handle = handle.clone();
        let reader = thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(rest) = line.strip_prefix(READY_PREFIX) {
                    match serde_json::from_str::<HandshakeLine>(rest.trim()) {
                        Ok(parsed) => set_status(
                            &reader_handle,
                            SidecarStatus::Ready {
                                url: parsed.url,
                                token: parsed.token,
                                pid,
                            },
                        ),
                        Err(err) => log::warn!("[sidecar] handshake parse failed: {err}"),
                    }
                } else {
                    log::info!("[sidecar:stdout] {line}");
                }
            }
        });

        let exit_status = {
            let state = handle.state::<SidecarState>();
            let mut guard = state.child.lock().unwrap();
            match guard.as_mut() {
                Some(c) => c.wait(),
                None => {
                    // child was already taken by shutdown_sidecar
                    return;
                }
            }
        };
        let _ = reader.join();
        {
            let state = handle.state::<SidecarState>();
            *state.child.lock().unwrap() = None;
        }

        match exit_status {
            Ok(status) if status.success() => {
                set_status(&handle, SidecarStatus::Stopped);
                return;
            }
            Ok(status) => {
                attempt += 1;
                if attempt > MAX_RESTARTS {
                    set_status(
                        &handle,
                        SidecarStatus::Failed {
                            reason: format!(
                                "sidecar exited with {status} after {MAX_RESTARTS} restarts"
                            ),
                        },
                    );
                    return;
                }
                log::warn!(
                    "[sidecar] exited {status}, restart attempt {attempt}/{MAX_RESTARTS}"
                );
                thread::sleep(Duration::from_millis(500));
            }
            Err(err) => {
                set_status(
                    &handle,
                    SidecarStatus::Failed {
                        reason: format!("wait error: {err}"),
                    },
                );
                return;
            }
        }
    }
}

fn spawn_sidecar() -> std::io::Result<Child> {
    // Dev path: invoke pnpm so it resolves the workspace and runs tsx.
    // Production binary bundling lands in M7.
    Command::new("pnpm")
        .args(["--filter", "@golemancy/sidecar", "run", "start"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
}

fn set_status(handle: &AppHandle, next: SidecarStatus) {
    let state = handle.state::<SidecarState>();
    *state.status.lock().unwrap() = next.clone();
    let _ = handle.emit(SIDECAR_EVENT, next);
}
