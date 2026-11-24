use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CrashSeverity {
    Fatal,
    Anr,
    Native,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedCrash {
    pub severity: CrashSeverity,
    pub exception_type: String,
    pub process_name: Option<String>,
    pub message: String,
    pub offending_class: Option<String>,
    pub offending_file: Option<String>,
    pub offending_line: Option<u32>,
    pub stack_trace: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTelemetry {
    pub device_id: Uuid,
    pub cpu_percent: f32,
    pub ram_used_mb: u32,
    pub ram_total_mb: u32,
    pub ram_percent: f32,
    pub fps: u32,
    pub crashes: Vec<ParsedCrash>,
}

pub struct CrashAnalyzer;

impl CrashAnalyzer {
    /// Parse Logcat text to extract structured application crashes, ANRs, and native faults.
    pub fn parse_logcat(logcat: &str) -> Vec<ParsedCrash> {
        let mut crashes = Vec::new();
        let lines: Vec<&str> = logcat.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            let line = lines[i];

            // 1. Detect Java FATAL EXCEPTION
            if line.contains("FATAL EXCEPTION:") {
                let mut process = None;
                let mut exception_type = "FatalException".to_string();
                let mut message = String::new();
                let mut offending_class = None;
                let mut offending_file = None;
                let mut offending_line = None;
                let mut stack = Vec::new();

                let mut j = i + 1;
                while j < lines.len() && j < i + 40 {
                    let sub = lines[j].trim();
                    if sub.contains("FATAL EXCEPTION:") {
                        break;
                    }
                    if let Some(pos) = sub.find("Process:") {
                        let after = &sub[pos + "Process:".len()..];
                        process = after.split(',').next().map(|s| s.trim().to_string());
                    } else if (sub.contains("Exception") || sub.contains("Error"))
                        && !sub.contains("FATAL EXCEPTION")
                    {
                        if exception_type == "FatalException" {
                            let candidate = if let Some(first_colon) = sub.find(": ") {
                                &sub[first_colon + 2..]
                            } else {
                                sub
                            };
                            let parts: Vec<&str> = candidate.splitn(2, ':').collect();
                            exception_type = parts[0].trim().to_string();
                            if parts.len() > 1 {
                                message = parts[1].trim().to_string();
                            }
                        }
                        stack.push(sub.to_string());
                    } else if let Some(pos) = sub.find("at ") {
                        if offending_class.is_none() {
                            let at_body = sub[pos + 3..].trim();
                            if let Some(paren_start) = at_body.find('(') {
                                let method_full = &at_body[..paren_start];
                                offending_class = method_full
                                    .rfind('.')
                                    .map(|idx| method_full[..idx].to_string());

                                if let Some(paren_end) = at_body.find(')') {
                                    let file_line = &at_body[paren_start + 1..paren_end];
                                    let fl_parts: Vec<&str> = file_line.split(':').collect();
                                    if !fl_parts.is_empty() {
                                        offending_file = Some(fl_parts[0].to_string());
                                    }
                                    if fl_parts.len() > 1 {
                                        offending_line = fl_parts[1].parse::<u32>().ok();
                                    }
                                }
                            }
                        }
                        stack.push(sub.to_string());
                    } else if sub.contains("Caused by:") {
                        stack.push(sub.to_string());
                    } else if !stack.is_empty() && sub.is_empty() {
                        break;
                    }
                    j += 1;
                }

                crashes.push(ParsedCrash {
                    severity: CrashSeverity::Fatal,
                    exception_type,
                    process_name: process,
                    message,
                    offending_class,
                    offending_file,
                    offending_line,
                    stack_trace: stack,
                });
                i = j;
                continue;
            }

            // 2. Detect ANR
            if line.contains("ANR in ") {
                let process = line
                    .split("ANR in ")
                    .nth(1)
                    .and_then(|s| s.split_whitespace().next())
                    .map(|s| s.to_string());
                let mut message = "Application Not Responding".to_string();
                let mut stack = Vec::new();

                let mut j = i + 1;
                while j < lines.len() && j < i + 25 {
                    let sub = lines[j].trim();
                    if let Some(pos) = sub.find("Reason:") {
                        message = sub[pos + "Reason:".len()..].trim().to_string();
                    } else if sub.contains("CPU usage from") || sub.contains("PID:") {
                        stack.push(sub.to_string());
                    } else if sub.contains("ANR in ") || sub.contains("FATAL EXCEPTION:") {
                        break;
                    }
                    j += 1;
                }

                crashes.push(ParsedCrash {
                    severity: CrashSeverity::Anr,
                    exception_type: "ANR (Application Not Responding)".into(),
                    process_name: process,
                    message,
                    offending_class: None,
                    offending_file: None,
                    offending_line: None,
                    stack_trace: stack,
                });
                i = j;
                continue;
            }

            // 3. Detect Native SIGSEGV / SIGABRT
            if line.contains("Fatal signal ")
                || line.contains("SIGSEGV")
                || line.contains("SIGABRT")
            {
                let signal = if line.contains("SIGSEGV") {
                    "SIGSEGV (Segmentation Fault)"
                } else if line.contains("SIGABRT") {
                    "SIGABRT (Native Abort)"
                } else {
                    "Fatal Native Signal"
                };

                let mut stack = Vec::new();
                let mut j = i + 1;
                while j < lines.len() && j < i + 20 {
                    let sub = lines[j].trim();
                    if sub.starts_with('#') || sub.contains("backtrace:") {
                        stack.push(sub.to_string());
                    } else if sub.is_empty() || sub.contains("Fatal signal ") {
                        break;
                    }
                    j += 1;
                }

                crashes.push(ParsedCrash {
                    severity: CrashSeverity::Native,
                    exception_type: signal.into(),
                    process_name: None,
                    message: line.trim().to_string(),
                    offending_class: None,
                    offending_file: None,
                    offending_line: None,
                    stack_trace: stack,
                });
                i = j;
                continue;
            }

            i += 1;
        }

        crashes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fatal_null_pointer_exception() {
        let sample_logcat = r#"
07-14 12:00:01.120 1234 1234 E AndroidRuntime: FATAL EXCEPTION: main
07-14 12:00:01.120 1234 1234 E AndroidRuntime: Process: com.example.retailapp, PID: 1234
07-14 12:00:01.120 1234 1234 E AndroidRuntime: java.lang.NullPointerException: Attempt to invoke virtual method 'void android.widget.TextView.setText(java.lang.CharSequence)' on a null object reference
07-14 12:00:01.120 1234 1234 E AndroidRuntime: 	at com.example.retailapp.MainActivity.onCreate(MainActivity.kt:142)
07-14 12:00:01.120 1234 1234 E AndroidRuntime: 	at android.app.Activity.performCreate(Activity.java:8051)
"#;
        let crashes = CrashAnalyzer::parse_logcat(sample_logcat);
        assert_eq!(crashes.len(), 1);
        let crash = &crashes[0];
        assert_eq!(crash.severity, CrashSeverity::Fatal);
        assert_eq!(crash.process_name, Some("com.example.retailapp".into()));
        assert_eq!(
            crash.offending_class,
            Some("com.example.retailapp.MainActivity".into())
        );
        assert_eq!(crash.offending_file, Some("MainActivity.kt".into()));
        assert_eq!(crash.offending_line, Some(142));
    }

    #[test]
    fn parses_anr_freeze() {
        let sample_anr = r#"
07-14 12:05:00.000 1000 1000 E ActivityManager: ANR in com.example.retailapp (com.example.retailapp/.CheckoutActivity)
07-14 12:05:00.000 1000 1000 E ActivityManager: PID: 4567
07-14 12:05:00.000 1000 1000 E ActivityManager: Reason: Input dispatching timed out (Waiting to send key event)
"#;
        let crashes = CrashAnalyzer::parse_logcat(sample_anr);
        assert_eq!(crashes.len(), 1);
        let anr = &crashes[0];
        assert_eq!(anr.severity, CrashSeverity::Anr);
        assert_eq!(anr.process_name, Some("com.example.retailapp".into()));
        assert!(anr.message.contains("Input dispatching timed out"));
    }

    #[test]
    fn parses_native_sigsegv() {
        let sample_native = r#"
07-14 12:10:00.000 2000 2000 F libc    : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 2000
07-14 12:10:00.000 2000 2000 F DEBUG   : backtrace:
07-14 12:10:00.000 2000 2000 F DEBUG   :       #00 pc 000000000004bf02  /apex/com.android.runtime/lib64/bionic/libc.so
"#;
        let crashes = CrashAnalyzer::parse_logcat(sample_native);
        assert_eq!(crashes.len(), 1);
        let native = &crashes[0];
        assert_eq!(native.severity, CrashSeverity::Native);
        assert!(native.exception_type.contains("SIGSEGV"));
    }
}
