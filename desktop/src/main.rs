use multi_emulator_core::{
    control::{Controller, Request},
    error::ApiError,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

type Shared = Arc<Mutex<Option<Controller>>>;
type HealthCache = Arc<Mutex<Option<Result<serde_json::Value, ApiError>>>>;

#[tauri::command]
fn health(cache: State<'_, HealthCache>) -> Result<serde_json::Value, ApiError> {
    cache
        .lock()
        .map_err(|_| ApiError {
            code: "internal",
            message: "health cache lock poisoned".into(),
        })?
        .clone()
        .unwrap_or_else(|| Ok(serde_json::json!([])))
}

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
async fn install_android_runtime(
    sdk_root: PathBuf,
    state: State<'_, Shared>,
) -> Result<(), ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = s.lock().map_err(|_| ApiError {
            code: "internal",
            message: "controller lock poisoned".into(),
        })?;
        if guard.is_some() {
            return Err(ApiError {
                code: "conflict",
                message: "Close the app before modifying an active SDK".into(),
            });
        }
        multi_emulator_core::android::install_runtime(&sdk_root).map_err(ApiError::from)?;
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

#[tauri::command]
async fn pick_apk(app: tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .add_filter("Android package", &["apk"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        if !path.is_file()
            || !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("apk"))
        {
            return Err("Select a local APK file".into());
        }
        Ok(Some(path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pick_sdk_directory(app: tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(|selected| selected.into_path().map_err(|e| e.to_string()))
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(None::<Controller>)))
        .manage(Arc::new(Mutex::new(
            None::<Result<serde_json::Value, ApiError>>,
        )))
        .setup(|app| {
            let controller = Arc::downgrade(app.state::<Shared>().inner());
            let cache = Arc::downgrade(app.state::<HealthCache>().inner());
            thread::Builder::new()
                .name("emulator-supervisor".into())
                .spawn(move || loop {
                    {
                        let (Some(controller), Some(cache)) =
                            (controller.upgrade(), cache.upgrade())
                        else {
                            break;
                        };
                        if let Ok(mut guard) = controller.try_lock() {
                            if let Some(c) = guard.as_mut() {
                                let result = c.execute(Request::Tick);
                                if let Ok(mut health) = cache.lock() {
                                    *health = Some(result);
                                }
                            }
                        };
                    }
                    thread::sleep(Duration::from_secs(5));
                })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect,
            install_android_runtime,
            pick_apk,
            pick_sdk_directory,
            dispatch,
            health,
            default_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("desktop initialization failed");
}
