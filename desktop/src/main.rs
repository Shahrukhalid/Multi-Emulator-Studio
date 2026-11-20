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
static IMAGE_INSTALL: Mutex<()> = Mutex::new(());
static QA_RUNNING: Mutex<()> = Mutex::new(());
static MANAGED_SETUP: Mutex<Option<(PathBuf, multi_emulator_core::managed_sdk::SetupSession)>> =
    Mutex::new(None);

fn setup_error(message: &str) -> ApiError {
    ApiError {
        code: "conflict",
        message: message.into(),
    }
}

#[tauri::command]
async fn qa_runtime_check(
    app: tauri::AppHandle,
    state: State<'_, Shared>,
) -> Result<multi_emulator_core::runtime_qa::QaReport, ApiError> {
    if app.config().identifier != "com.nexonic.multiemulatorstudio.qa" {
        return Err(setup_error(
            "Runtime self-test is available only in the isolated QA build",
        ));
    }
    let data = app
        .path()
        .app_local_data_dir()
        .map_err(|err| setup_error(&err.to_string()))?;
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _qa = QA_RUNNING
            .try_lock()
            .map_err(|_| setup_error("Runtime self-test already running"))?;
        let _install = IMAGE_INSTALL
            .try_lock()
            .map_err(|_| setup_error("Wait for Android package installation"))?;
        let mut controller = shared
            .try_lock()
            .map_err(|_| setup_error("Controller busy; try again"))?;
        let controller = controller
            .as_mut()
            .ok_or_else(|| setup_error("Complete Quick setup first"))?;
        let sdk = controller.sdk();
        let managed = multi_emulator_core::managed_sdk::managed_root(&data).canonicalize().ok().is_some_and(|root| root == sdk.root);
        if !controller.qa_profiles_idle().map_err(ApiError::from)? {
            return Err(setup_error(
                "Stop all existing devices before running the disposable self-test",
            ));
        }
        let mut report = multi_emulator_core::runtime_qa::run(sdk, &data);
        report.checks.insert(0, if managed { "Private managed SDK used; clean first-run license and installation still require separate evidence" } else { "Existing SDK used; automatic first-run installation NOT verified" }.into());
        match multi_emulator_core::runtime_qa::save_report(&data, &report) {
            Ok(path) => report.checks.push(format!("Local QA report saved: {}", path.display())),
            Err(error) => report.checks.push(format!("Unable to save QA report locally; copy it from Settings: {error}")),
        }
        Ok(report)
    })
    .await
    .map_err(|err| setup_error(&err.to_string()))?
}

#[tauri::command]
async fn begin_managed_setup(
    app: tauri::AppHandle,
    state: State<'_, Shared>,
    reviewed: bool,
) -> Result<PathBuf, ApiError> {
    if !reviewed {
        return Err(setup_error("Review Google's SDK terms before downloading"));
    }
    let data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| setup_error(&e.to_string()))?;
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut setup = MANAGED_SETUP
            .try_lock()
            .map_err(|_| setup_error("Android setup is already running"))?;
        if setup.is_some() {
            return Err(setup_error("Android setup is already running"));
        }
        if shared
            .lock()
            .map_err(|_| setup_error("Controller unavailable"))?
            .is_some()
        {
            return Err(setup_error(
                "Existing SDK is connected; its profiles will not be migrated",
            ));
        }
        if data.join("metadata.db").is_file() {
            let store = multi_emulator_core::storage::Store::open(&data.join("metadata.db")).map_err(ApiError::from)?;
            if !store.list().map_err(ApiError::from)?.is_empty() {
                return Err(setup_error("Existing virtual devices require their original SDK. Reconnect it instead of replacing its runtime."));
            }
        }
        let root = multi_emulator_core::managed_sdk::prepare(&data).map_err(ApiError::from)?;
        let session =
            multi_emulator_core::managed_sdk::SetupSession::start(&root).map_err(ApiError::from)?;
        *setup = Some((root.clone(), session));
        Ok(root)
    })
    .await
    .map_err(|e| setup_error(&e.to_string()))?
}

#[tauri::command]
fn managed_setup_status() -> Result<multi_emulator_core::managed_sdk::SetupStatus, ApiError> {
    let mut setup = MANAGED_SETUP
        .try_lock()
        .map_err(|_| setup_error("Android setup is busy"))?;
    let (root, session) = setup
        .as_mut()
        .ok_or_else(|| setup_error("No active Android setup"))?;
    let mut status = session.status().map_err(ApiError::from)?;
    if status.done && status.success {
        status.success = multi_emulator_core::android::Sdk::detect(Some(root.clone()))
            .and_then(|sdk| sdk.images())
            .is_ok_and(|images| {
                images
                    .iter()
                    .any(|image| image.contains(";android-34;google_apis_playstore;"))
            });
        if !status.success {
            status.output.push_str(
                "\nRequired official Android packages were not verified. Check licenses and retry.",
            );
        }
    }
    if status.done {
        *setup = None;
    }
    Ok(status)
}

#[tauri::command]
fn managed_setup_answer(yes: bool) -> Result<(), ApiError> {
    MANAGED_SETUP
        .try_lock()
        .map_err(|_| setup_error("Android setup is busy"))?
        .as_mut()
        .ok_or_else(|| setup_error("No active Android setup"))?
        .1
        .answer(yes)
        .map_err(ApiError::from)
}

#[tauri::command]
fn cancel_managed_setup() -> Result<(), ApiError> {
    *MANAGED_SETUP
        .try_lock()
        .map_err(|_| setup_error("Initial download is still running"))? = None;
    Ok(())
}

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
    app: tauri::AppHandle,
    root: PathBuf,
    sdk_root: Option<PathBuf>,
    state: State<'_, Shared>,
) -> Result<(), ApiError> {
    // A separately identified QA app intentionally ignores a machine-wide SDK.
    // Production builds retain discovery and existing profile compatibility.
    let sdk_root =
        if app.config().identifier == "com.nexonic.multiemulatorstudio.qa" && sdk_root.is_none() {
            let data = app
                .path()
                .app_local_data_dir()
                .map_err(|e| setup_error(&e.to_string()))?;
            Some(multi_emulator_core::managed_sdk::managed_root(&data))
        } else {
            sdk_root
        };
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let setup = MANAGED_SETUP
            .try_lock()
            .map_err(|_| setup_error("Wait for Android setup to finish"))?;
        if setup.is_some() {
            return Err(setup_error("Wait for Android setup to finish"));
        }
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
        let setup = MANAGED_SETUP
            .try_lock()
            .map_err(|_| setup_error("Wait for managed Android setup"))?;
        if setup.is_some() {
            return Err(setup_error("Wait for managed Android setup"));
        }
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
async fn install_google_play(state: State<'_, Shared>) -> Result<(), ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _install = IMAGE_INSTALL.try_lock().map_err(|_| ApiError {
            code: "conflict",
            message: "SDK image installation already running".into(),
        })?;
        let sdk = s
            .lock()
            .map_err(|_| ApiError {
                code: "internal",
                message: "controller lock poisoned".into(),
            })?
            .as_ref()
            .ok_or_else(|| ApiError {
                code: "unavailable",
                message: "Connect SDK first".into(),
            })?
            .sdk();
        multi_emulator_core::android::install_google_play_image(&sdk).map_err(ApiError::from)
    })
    .await
    .map_err(|e| ApiError {
        code: "internal",
        message: e.to_string(),
    })?
}

#[tauri::command]
async fn video_read(
    id: String,
    token: String,
    state: State<'_, Shared>,
) -> Result<tauri::ipc::Response, ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // A busy lifecycle/status operation must not queue frame reads or block the UI.
        let Ok(mut guard) = s.try_lock() else {
            return Ok(tauri::ipc::Response::new(vec![0u8]));
        };
        let bytes = guard
            .as_mut()
            .ok_or_else(|| setup_error("Connect SDK first"))?
            .video_read(&id, &token)?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| setup_error(&e.to_string()))?
}

#[tauri::command]
async fn screen_png(
    id: String,
    state: State<'_, Shared>,
) -> Result<tauri::ipc::Response, ApiError> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = s.try_lock().map_err(|_| ApiError {
            code: "unavailable",
            message: "Device controller busy; retrying screen refresh".into(),
        })?;
        let capture = guard
            .as_mut()
            .ok_or_else(|| ApiError {
                code: "unavailable",
                message: "Connect SDK first".into(),
            })?
            .prepare_screen_capture(&id)?;
        drop(guard);
        let png = capture.capture().map_err(ApiError::from)?;
        Ok(tauri::ipc::Response::new(png))
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
        if QA_RUNNING.try_lock().is_err() {
            return Err(setup_error("Runtime self-test is running"));
        }
        let _image_guard = if matches!(
            &request,
            Request::Create { .. } | Request::CloneProfile { .. }
        ) {
            Some(IMAGE_INSTALL.try_lock().map_err(|_| ApiError {
                code: "conflict",
                message: "Wait for Google Play image installation to finish".into(),
            })?)
        } else {
            None
        };
        // Screen refresh is expendable; never queue it behind a lifecycle command.
        let mut guard = if matches!(&request, Request::Screen { .. }) {
            s.try_lock().map_err(|_| ApiError {
                code: "unavailable",
                message: "Device controller busy; retrying screen refresh".into(),
            })?
        } else {
            s.lock().map_err(|_| ApiError {
                code: "internal",
                message: "controller lock poisoned".into(),
            })?
        };
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
            qa_runtime_check,
            begin_managed_setup,
            managed_setup_status,
            managed_setup_answer,
            cancel_managed_setup,
            install_android_runtime,
            install_google_play,
            screen_png,
            video_read,
            pick_apk,
            pick_sdk_directory,
            dispatch,
            health,
            default_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("desktop initialization failed");
}
