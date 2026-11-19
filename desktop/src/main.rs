use multi_emulator_core::{
    control::{Controller, Request},
    error::ApiError,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};

type Shared = Arc<Mutex<Option<Controller>>>;

#[tauri::command]
async fn connect(
    root: PathBuf,
    sdk_root: Option<PathBuf>,
    state: State<'_, Shared>,
) -> Result<(), ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = s.lock().map_err(|_| ApiError {
            code: "internal",
            message: "controller lock poisoned".into(),
        })?;
        if guard.is_some() {
            return Err(ApiError {
                code: "conflict",
                message: "controller already connected".into(),
            });
        }
        *guard = Some(Controller::open(&root, sdk_root).map_err(ApiError::from)?);
        Ok(())
    })
    .await
    .map_err(|e| ApiError {
        code: "internal",
        message: e.to_string(),
    })?
}
#[tauri::command]
async fn dispatch(
    request: Request,
    state: State<'_, Shared>,
) -> Result<serde_json::Value, ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = s.lock().map_err(|_| ApiError {
            code: "internal",
            message: "controller lock poisoned".into(),
        })?;
        guard
            .as_mut()
            .ok_or_else(|| ApiError {
                code: "unavailable",
                message: "connect SDK and storage first".into(),
            })?
            .execute(request)
    })
    .await
    .map_err(|e| ApiError {
        code: "internal",
        message: e.to_string(),
    })?
}
#[tauri::command]
fn default_data_dir(app: tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}
fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(None::<Controller>)))
        .invoke_handler(tauri::generate_handler![
            connect,
            dispatch,
            default_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("desktop initialization failed");
}
