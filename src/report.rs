use crate::diagnostics::ParsedCrash;
use crate::fleet::BroadcastInstallReport;
use crate::test_runner::MatrixRunReport;

pub struct HtmlReportGenerator;

impl HtmlReportGenerator {
    pub fn generate_html(
        matrix: &MatrixRunReport,
        crashes: Option<&[ParsedCrash]>,
        fleet: Option<&BroadcastInstallReport>,
    ) -> String {
        let timestamp = chrono_like_timestamp();
        let pass_rate = if matrix.total_devices > 0 {
            (matrix.passed_devices as f64 / matrix.total_devices as f64) * 100.0
        } else {
            100.0
        };

        let mut devices_html = String::new();
        for dev in &matrix.devices {
            let status_badge_class =
                if dev.status == crate::test_runner::StepExecutionStatus::Passed {
                    "badge-pass"
                } else {
                    "badge-fail"
                };
            let status_text = format!("{:?}", dev.status).to_uppercase();

            let mut steps_html = String::new();
            for step in &dev.steps {
                let step_status_class = match step.status {
                    crate::test_runner::StepExecutionStatus::Passed => "step-pass",
                    crate::test_runner::StepExecutionStatus::Failed => "step-fail",
                    _ => "step-other",
                };
                let err_msg = step.error.as_deref().unwrap_or("");
                let err_html = if !err_msg.is_empty() {
                    format!("<div class=\"error-box\">{}</div>", html_escape(err_msg))
                } else {
                    String::new()
                };

                steps_html.push_str(&format!(
                    r#"<li class="step-row {step_status_class}">
                        <div class="step-meta">
                            <span class="step-title">{title}</span>
                            <span class="step-time">{duration}ms</span>
                        </div>
                        {err_html}
                    </li>"#,
                    step_status_class = step_status_class,
                    title = html_escape(&step.step_id),
                    duration = step.duration_ms,
                    err_html = err_html
                ));
            }

            let screenshot_html = if let Some(ref b64) = dev.latest_screenshot {
                format!(
                    r#"<div class="screen-preview"><img src="data:image/png;base64,{}" alt="{} Screen" /></div>"#,
                    b64,
                    html_escape(&dev.device_name)
                )
            } else {
                r#"<div class="screen-placeholder"><span>No Screenshot</span></div>"#.to_string()
            };

            devices_html.push_str(&format!(
                r#"<div class="device-card">
                    <div class="device-header">
                        <div>
                            <h3 class="device-name">{name}</h3>
                            <span class="device-duration">Completed in {duration}ms</span>
                        </div>
                        <span class="status-badge {status_class}">{status_text}</span>
                    </div>
                    {screenshot}
                    <div class="steps-section">
                        <h4>Test Execution Steps ({steps_count})</h4>
                        <ul class="steps-list">{steps_html}</ul>
                    </div>
                </div>"#,
                name = html_escape(&dev.device_name),
                duration = dev.total_duration_ms,
                status_class = status_badge_class,
                status_text = status_text,
                screenshot = screenshot_html,
                steps_count = dev.steps.len(),
                steps_html = steps_html
            ));
        }

        let mut crashes_html = String::new();
        if let Some(crashes_list) = crashes {
            if !crashes_list.is_empty() {
                let mut crash_items = String::new();
                for c in crashes_list {
                    let trace = c.stack_trace.join("\n");
                    crash_items.push_str(&format!(
                        r#"<div class="crash-item">
                            <div class="crash-meta">
                                <span class="badge-fail">{severity}</span>
                                <strong>{exc_type}</strong>
                                <span>{class}:{line}</span>
                            </div>
                            <p class="crash-msg">{msg}</p>
                            <pre class="crash-stack"><code>{trace}</code></pre>
                        </div>"#,
                        severity = format!("{:?}", c.severity).to_uppercase(),
                        exc_type = html_escape(&c.exception_type),
                        class = html_escape(c.offending_class.as_deref().unwrap_or("Unknown")),
                        line = c.offending_line.unwrap_or(0),
                        msg = html_escape(&c.message),
                        trace = html_escape(&trace)
                    ));
                }

                crashes_html = format!(
                    r#"<section class="section-box">
                        <h2 class="section-title">Detected Crash Diagnostics ({count})</h2>
                        <div class="crash-list">{items}</div>
                    </section>"#,
                    count = crashes_list.len(),
                    items = crash_items
                );
            }
        }

        let mut fleet_html = String::new();
        if let Some(f) = fleet {
            let mut fleet_items = String::new();
            for item in &f.results {
                fleet_items.push_str(&format!(
                    r#"<tr>
                        <td>{dev}</td>
                        <td><span class="{cls}">{status}</span></td>
                        <td>{time}ms</td>
                        <td>{msg}</td>
                    </tr>"#,
                    dev = html_escape(&item.device_name),
                    cls = if item.success {
                        "badge-pass"
                    } else {
                        "badge-fail"
                    },
                    status = if item.success { "PASSED" } else { "FAILED" },
                    time = item.elapsed_ms,
                    msg = html_escape(&item.message)
                ));
            }

            fleet_html = format!(
                r#"<section class="section-box">
                    <h2 class="section-title">Fleet Broadcast Package Distribution</h2>
                    <p style="margin: 0 0 12px; color: #64748b; font-size: 13px;">Package: <code>{pkg}</code> · Total Time: {total_time}ms</p>
                    <table class="report-table">
                        <thead><tr><th>Device</th><th>Status</th><th>Duration</th><th>Details</th></tr></thead>
                        <tbody>{items}</tbody>
                    </table>
                </section>"#,
                pkg = html_escape(&f.package_name),
                total_time = f.total_duration_ms,
                items = fleet_items
            );
        }

        let raw_json = serde_json::to_string(matrix).unwrap_or_else(|_| "{}".into());
        let json_data_uri = format!(
            "data:application/json;charset=utf-8,{}",
            url_encode(&raw_json)
        );

        format!(
            r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Multi-Emulator Studio · Test Run Report</title>
<style>
  :root {{
    --bg-page: #f8fafc;
    --bg-card: #ffffff;
    --text-primary: #0f172a;
    --text-secondary: #64748b;
    --border-color: #e2e8f0;
    --color-primary: #4f46e5;
    --color-success: #16a34a;
    --color-danger: #dc2626;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg-page: #0b0f19;
      --bg-card: #131b2e;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --border-color: #1e293b;
    }}
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-page); color: var(--text-primary); line-height: 1.5; padding: 32px 24px; }}
  .container {{ max-width: 1200px; margin: 0 auto; }}
  .header {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 28px; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; }}
  .brand-badge {{ font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--color-primary); letter-spacing: 0.05em; }}
  .report-title {{ font-size: 26px; font-weight: 800; margin-top: 4px; }}
  .report-sub {{ font-size: 13px; color: var(--text-secondary); }}
  .header-actions {{ display: flex; gap: 10px; }}
  .btn {{ padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px; }}
  .btn-primary {{ background: var(--color-primary); color: #fff; border: none; }}
  .metrics-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }}
  .metric-card {{ background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px 20px; }}
  .metric-label {{ font-size: 12px; font-weight: 600; color: var(--text-secondary); }}
  .metric-val {{ font-size: 28px; font-weight: 800; margin-top: 4px; }}
  .val-pass {{ color: var(--color-success); }}
  .val-fail {{ color: var(--color-danger); }}
  .section-box {{ background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; margin-bottom: 28px; }}
  .section-title {{ font-size: 18px; font-weight: 700; margin-bottom: 16px; }}
  .devices-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }}
  .device-card {{ background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }}
  .device-header {{ display: flex; justify-content: space-between; align-items: flex-start; }}
  .device-name {{ font-size: 16px; font-weight: 700; }}
  .device-duration {{ font-size: 11px; color: var(--text-secondary); }}
  .status-badge {{ padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }}
  .badge-pass {{ background: rgba(22, 163, 74, 0.15); color: var(--color-success); }}
  .badge-fail {{ background: rgba(220, 38, 38, 0.15); color: var(--color-danger); }}
  .screen-preview {{ width: 100%; height: 260px; background: #000; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }}
  .screen-preview img {{ width: 100%; height: 100%; object-fit: contain; }}
  .screen-placeholder {{ width: 100%; height: 180px; background: rgba(0,0,0,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 12px; }}
  .steps-section h4 {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 8px; }}
  .steps-list {{ list-style: none; display: flex; flex-direction: column; gap: 6px; }}
  .step-row {{ padding: 8px 10px; border-radius: 6px; font-size: 12px; border: 1px solid var(--border-color); }}
  .step-pass {{ border-left: 3px solid var(--color-success); }}
  .step-fail {{ border-left: 3px solid var(--color-danger); background: rgba(220, 38, 38, 0.05); }}
  .step-meta {{ display: flex; justify-content: space-between; font-weight: 600; }}
  .step-time {{ color: var(--text-secondary); font-weight: normal; }}
  .error-box {{ margin-top: 6px; font-family: monospace; font-size: 11px; color: var(--color-danger); word-break: break-all; }}
  .report-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  .report-table th, .report-table td {{ padding: 10px 12px; border-bottom: 1px solid var(--border-color); text-align: left; }}
  .report-table th {{ color: var(--text-secondary); font-weight: 600; }}
  .crash-list {{ display: flex; flex-direction: column; gap: 14px; }}
  .crash-item {{ border: 1px solid var(--border-color); border-left: 4px solid var(--color-danger); border-radius: 8px; padding: 14px; background: rgba(220, 38, 38, 0.03); }}
  .crash-meta {{ display: flex; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 6px; }}
  .crash-msg {{ font-size: 13px; margin-bottom: 10px; font-weight: 500; }}
  .crash-stack {{ background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; font-size: 11px; overflow-x: auto; font-family: monospace; }}
</style>
</head>
<body>
<div class="container">
  <header class="header">
    <div>
      <span class="brand-badge">Multi-Emulator Studio · Local Device Cloud</span>
      <h1 class="report-title">Parallel Fleet Test Matrix Report</h1>
      <p class="report-sub">Suite: <strong>{suite_name}</strong> · Generated at {timestamp} · 100% Free & Local Execution</p>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="window.print()">🖨️ Print / PDF</button>
      <a class="btn btn-primary" href="{json_uri}" download="test-matrix-report.json">📥 Export JSON</a>
    </div>
  </header>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">TOTAL DEVICES</div>
      <div class="metric-val">{total_devs}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">PASSED FLEET</div>
      <div class="metric-val val-pass">{passed_devs}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">FAILED FLEET</div>
      <div class="metric-val val-fail">{failed_devs}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">PASS RATE</div>
      <div class="metric-val">{pass_rate:.1}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">EXECUTION DURATION</div>
      <div class="metric-val">{total_duration}ms</div>
    </div>
  </div>

  {fleet_section}
  {crashes_section}

  <section class="section-box">
    <h2 class="section-title">Device Execution Breakdown</h2>
    <div class="devices-grid">
      {devices_html}
    </div>
  </section>
</div>
</body>
</html>"#,
            suite_name = html_escape(&matrix.suite_name),
            timestamp = timestamp,
            json_uri = json_data_uri,
            total_devs = matrix.total_devices,
            passed_devs = matrix.passed_devices,
            failed_devs = matrix.failed_devices,
            pass_rate = pass_rate,
            total_duration = matrix.total_duration_ms,
            fleet_section = fleet_html,
            crashes_section = crashes_html,
            devices_html = devices_html
        )
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn url_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

fn chrono_like_timestamp() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let days = secs / 86400;
    // Simple year-month-day approximation for self-contained report without external chrono crate
    format!("Epoch Day {} (+{}s)", days, secs % 86400)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_runner::{MatrixDeviceResult, MatrixStepResult, StepExecutionStatus};
    use uuid::Uuid;

    #[test]
    fn test_generate_html_report_contains_all_components() {
        let matrix = MatrixRunReport {
            suite_id: "smoke".into(),
            suite_name: "App Launch and Login".into(),
            total_devices: 2,
            passed_devices: 1,
            failed_devices: 1,
            total_duration_ms: 1540,
            devices: vec![
                MatrixDeviceResult {
                    device_id: Uuid::new_v4(),
                    device_name: "Google Pixel 8".into(),
                    status: StepExecutionStatus::Passed,
                    total_duration_ms: 620,
                    steps: vec![MatrixStepResult {
                        step_id: "launch".into(),
                        status: StepExecutionStatus::Passed,
                        duration_ms: 620,
                        error: None,
                        screenshot_base64: None,
                    }],
                    latest_screenshot: None,
                },
                MatrixDeviceResult {
                    device_id: Uuid::new_v4(),
                    device_name: "Samsung Galaxy S24".into(),
                    status: StepExecutionStatus::Failed,
                    total_duration_ms: 920,
                    steps: vec![MatrixStepResult {
                        step_id: "login_tap".into(),
                        status: StepExecutionStatus::Failed,
                        duration_ms: 920,
                        error: Some("Element not found: #btn-login".into()),
                        screenshot_base64: None,
                    }],
                    latest_screenshot: None,
                },
            ],
        };

        let html = HtmlReportGenerator::generate_html(&matrix, None, None);
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("Google Pixel 8"));
        assert!(html.contains("Samsung Galaxy S24"));
        assert!(html.contains("Element not found: #btn-login"));
        assert!(html.contains("PASSED FLEET"));
        assert!(html.contains("1540ms"));
    }
}
