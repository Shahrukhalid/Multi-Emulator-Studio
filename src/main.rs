use multi_emulator_core::{
    android::Sdk,
    control::{Controller, Request},
    preflight::{HealthStatus, PreflightAnalyzer},
    report::HtmlReportGenerator,
    test_runner::{MatrixRunReport, ParallelTestRunner, StepExecutionStatus},
};
use serde_json::json;
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};

fn print_usage() {
    eprintln!(
        r#"Multi Emulator Studio - Core & Headless CI/CD CLI Engine

USAGE:
    multi-emulator-core <DATA_DIR> [SDK_DIR]               Run JSON-lines IPC server on stdin
    multi-emulator-core preflight [DATA_DIR] [SDK_DIR]     Run headless virtualization diagnostics
    multi-emulator-core test <DATA_DIR> [OPTIONS]          Run headless automated test matrix
    multi-emulator-core macro <DATA_DIR> <MACRO_ID> [DEV]  Run headless gesture macro replay
    multi-emulator-core crawl <DATA_DIR> <DEV> [PACKAGE]   Run autonomous Robo UI exploration crawl
    multi-emulator-core version                            Display version and check update channels
    multi-emulator-core --probe [SDK_DIR]                  Legacy probe output

TEST OPTIONS:
    --report <PATH>      Export self-contained HTML test report
    --deep               Run extended test suite (default is smoke suite)
    --sdk <PATH>         Explicit Android SDK directory path
"#
    );
}

fn run_preflight(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let root = args
        .get(2)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".emulator_data"));
    let sdk_path = args.get(3).map(PathBuf::from);
    let sdk = Sdk::detect(sdk_path)?;
    let report = PreflightAnalyzer::run_diagnostics(&sdk, &root);

    let passed_count = report
        .checks
        .iter()
        .filter(|c| c.status == HealthStatus::Pass)
        .count();
    let warn_count = report
        .checks
        .iter()
        .filter(|c| c.status == HealthStatus::Warn)
        .count();
    let fail_count = report
        .checks
        .iter()
        .filter(|c| c.status == HealthStatus::Fail)
        .count();

    println!("{}", serde_json::to_string_pretty(&report)?);
    println!(
        "\nPreflight Status: {:?} ({} passed, {} warnings, {} failures)",
        report.overall, passed_count, warn_count, fail_count
    );

    if report.overall == HealthStatus::Fail || fail_count > 0 {
        eprintln!("Preflight diagnostics failed with critical virtualization issues.");
        std::process::exit(1);
    }
    Ok(())
}

fn run_headless_tests(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() < 3 {
        eprintln!("Error: 'test' requires <DATA_DIR> path.");
        print_usage();
        std::process::exit(1);
    }
    let root = PathBuf::from(&args[2]);
    let mut sdk_path: Option<PathBuf> = None;
    let mut html_report_path: Option<PathBuf> = None;
    let mut deep_suite = false;

    let mut i = 3;
    while i < args.len() {
        match args[i].as_str() {
            "--report" => {
                if i + 1 < args.len() {
                    html_report_path = Some(PathBuf::from(&args[i + 1]));
                    i += 1;
                }
            }
            "--deep" => {
                deep_suite = true;
            }
            "--sdk" => {
                if i + 1 < args.len() {
                    sdk_path = Some(PathBuf::from(&args[i + 1]));
                    i += 1;
                }
            }
            other if !other.starts_with("--") && sdk_path.is_none() => {
                sdk_path = Some(PathBuf::from(other));
            }
            _ => {}
        }
        i += 1;
    }

    println!(
        "[CI/CD Engine] Initializing headless test runner on data root: {}",
        root.display()
    );
    let mut controller = Controller::open(&root, sdk_path)?;

    let suite = if deep_suite {
        let mut s = ParallelTestRunner::default_smoke_suite();
        s.name = "Deep Verification Suite".into();
        s.steps
            .push(multi_emulator_core::test_runner::MatrixTestStep {
                id: "deep_assert_alive".into(),
                title: "Extended Host Heartbeat".into(),
                action: multi_emulator_core::test_runner::MatrixStepAction::AssertAlive,
            });
        Some(s)
    } else {
        Some(ParallelTestRunner::default_smoke_suite())
    };

    println!("[CI/CD Engine] Dispatching matrix test suite across active emulator fleet...");
    let result = controller.execute(Request::RunMatrixTest {
        device_ids: None,
        suite,
    });

    match result {
        Ok(val) => {
            let matrix_report: MatrixRunReport = serde_json::from_value(val)?;
            println!("\n=================== MATRIX TEST RUN REPORT ===================");
            println!("Suite:             {}", matrix_report.suite_name);
            println!("Total Devices:     {}", matrix_report.total_devices);
            println!("Passed:            {}", matrix_report.passed_devices);
            println!("Failed:            {}", matrix_report.failed_devices);
            println!("Total Duration:    {} ms", matrix_report.total_duration_ms);
            println!("-------------------------------------------------------------");

            for dev in &matrix_report.devices {
                let passed_steps = dev
                    .steps
                    .iter()
                    .filter(|s| s.status == StepExecutionStatus::Passed)
                    .count();
                let failed_steps = dev
                    .steps
                    .iter()
                    .filter(|s| s.status == StepExecutionStatus::Failed)
                    .count();
                println!(
                    "Device {}: {:?} ({} passed, {} failed, {} ms)",
                    dev.device_name, dev.status, passed_steps, failed_steps, dev.total_duration_ms
                );
            }

            if let Some(ref report_path) = html_report_path {
                let html = HtmlReportGenerator::generate_html(&matrix_report, None, None);
                if let Some(parent) = report_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::fs::write(report_path, html)?;
                println!(
                    "[CI/CD Engine] HTML report exported successfully to: {}",
                    report_path.display()
                );
            }

            if matrix_report.failed_devices > 0 {
                eprintln!(
                    "\n[CI/CD Engine] Automated test run FAILED with {} failure(s).",
                    matrix_report.failed_devices
                );
                std::process::exit(1);
            }
            println!("\n[CI/CD Engine] Automated test run SUCCEEDED: 100% passed.");
            Ok(())
        }
        Err(e) => {
            eprintln!(
                "[CI/CD Engine] Failed to execute matrix tests: {}",
                e.message
            );
            std::process::exit(1);
        }
    }
}

fn run_headless_macro(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() < 4 {
        eprintln!("Error: 'macro' requires <DATA_DIR> and <MACRO_ID>.");
        print_usage();
        std::process::exit(1);
    }
    let root = PathBuf::from(&args[2]);
    let macro_id: uuid::Uuid = args[3].parse()?;
    let device_id: Option<uuid::Uuid> = if args.len() > 4 {
        args[4].parse().ok()
    } else {
        None
    };

    let mut controller = Controller::open(&root, None)?;
    println!("[CI/CD Engine] Executing macro {} headlessly...", macro_id);

    let res = if let Some(dev_id) = device_id {
        controller.execute(Request::RunMacro {
            macro_id,
            device_id: dev_id,
        })
    } else {
        controller.execute(Request::RunMacroFleet {
            macro_id,
            device_ids: None,
        })
    };

    match res {
        Ok(val) => {
            println!("{}", serde_json::to_string_pretty(&val)?);
            println!("[CI/CD Engine] Macro replay execution completed.");
            Ok(())
        }
        Err(e) => {
            eprintln!("[CI/CD Engine] Macro execution failed: {}", e.message);
            std::process::exit(1);
        }
    }
}

fn run_headless_crawl(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() < 4 {
        eprintln!("Error: 'crawl' requires <DATA_DIR> and <DEVICE_ID> [PACKAGE_NAME].");
        print_usage();
        std::process::exit(1);
    }
    let root = PathBuf::from(&args[2]);
    let device_id: uuid::Uuid = args[3].parse()?;
    let package_name = args
        .get(4)
        .cloned()
        .unwrap_or_else(|| "com.android.settings".into());

    let mut controller = Controller::open(&root, None)?;
    println!(
        "[Robo Crawler] Launching autonomous exploration on device {} for package '{}'...",
        device_id, package_name
    );

    let config = multi_emulator_core::crawler::CrawlConfig {
        package_name,
        max_depth: 5,
        max_actions: 25,
        strategy: multi_emulator_core::crawler::CrawlStrategy::BreadthFirst,
        throttle_ms: 300,
        explore_inputs: true,
    };

    let res = controller.execute(Request::RunRoboCrawl {
        id: device_id,
        config: Some(config),
    });

    match res {
        Ok(val) => {
            println!("{}", serde_json::to_string_pretty(&val)?);
            println!("[Robo Crawler] Autonomous exploration crawl completed successfully.");
            Ok(())
        }
        Err(e) => {
            eprintln!("[Robo Crawler] Crawl failed: {}", e.message);
            std::process::exit(1);
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_usage();
        return Err("insufficient arguments".into());
    }

    match args[1].as_str() {
        "--help" | "-h" => {
            print_usage();
            return Ok(());
        }
        "--version" | "-v" | "version" => {
            let res = multi_emulator_core::updater::UpdaterEngine::check_for_updates(
                multi_emulator_core::updater::UpdateChannel::Stable,
            );
            println!(
                "Multi Emulator Studio v{} ({})\n{}",
                res.current_version,
                if res.up_to_date {
                    "Latest Certified Release"
                } else {
                    "Update Available"
                },
                res.release_notes
            );
            return Ok(());
        }
        "--probe" => {
            let sdk = args.get(2).map(PathBuf::from);
            let s = Sdk::detect(sdk)?;
            println!(
                "{}",
                json!({"host":multi_emulator_core::host::detect(),"sdk":s,"images":s.images()?})
            );
            let report = s.preflight();
            println!("{}", serde_json::to_string(&report)?);
            if !report.ready {
                return Err(report.diagnostic.into());
            }
            return Ok(());
        }
        "preflight" | "--preflight" => {
            return run_preflight(&args);
        }
        "test" | "--test" => {
            return run_headless_tests(&args);
        }
        "macro" | "--macro" => {
            return run_headless_macro(&args);
        }
        "crawl" | "--crawl" => {
            return run_headless_crawl(&args);
        }
        _ => {}
    }

    // Default: JSON lines IPC server on stdin/stdout
    let root = PathBuf::from(&args[1]);
    let sdk = args.get(2).map(PathBuf::from);
    let mut c = Controller::open(&root, sdk)?;
    let mut stdout = io::stdout().lock();
    for line in io::stdin().lock().lines() {
        let line = line?;
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(r) => match c.execute(r) {
                Ok(v) => json!({"ok":v}),
                Err(e) => json!({"error":e}),
            },
            Err(e) => json!({"error":{"code":"invalid","message":e.to_string()}}),
        };
        writeln!(stdout, "{response}")?;
        stdout.flush()?;
    }
    Ok(())
}
