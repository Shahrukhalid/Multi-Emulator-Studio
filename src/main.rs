use multi_emulator_core::{
    android::Sdk,
    control::{Controller, Request},
};
use serde_json::json;
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let root =
        PathBuf::from(args.next().ok_or(
            "usage: multi-emulator-core DATA_DIRECTORY [SDK_DIRECTORY]; JSON lines on stdin",
        )?);
    let sdk = args.next().map(PathBuf::from);
    if root.as_os_str() == "--probe" {
        let s = Sdk::detect(sdk)?;
        println!(
            "{}",
            json!({"host":multi_emulator_core::host::detect(),"sdk":s,"images":s.images()?})
        );
        println!("{}", s.acceleration()?);
        return Ok(());
    }
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
