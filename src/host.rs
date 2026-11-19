use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct Host {
    pub os: &'static str,
    pub arch: &'static str,
    pub cores: usize,
    pub ram_mb: Option<u64>,
    pub supported: bool,
}
pub fn detect() -> Host {
    let ram_mb = memory();
    Host {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        cores: std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1),
        ram_mb,
        supported: cfg!(any(
            all(target_os = "macos", target_arch = "aarch64"),
            all(target_os = "windows", target_arch = "x86_64")
        )),
    }
}

#[cfg(target_os = "macos")]
fn memory() -> Option<u64> {
    let mut bytes = 0u64;
    let mut len = std::mem::size_of::<u64>();
    // SAFETY: fixed valid C string and correctly sized writable output.
    let rc = unsafe {
        libc::sysctlbyname(
            c"hw.memsize".as_ptr(),
            (&mut bytes as *mut u64).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && len == std::mem::size_of::<u64>()).then_some(bytes / 1048576)
}
#[cfg(windows)]
fn memory() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    // SAFETY: initialize C data structure with its size field set.
    let mut info: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    info.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    (unsafe { GlobalMemoryStatusEx(&mut info) } != 0).then_some(info.ullTotalPhys / 1048576)
}
#[cfg(not(any(target_os = "macos", windows)))]
fn memory() -> Option<u64> {
    None
}

#[cfg(unix)]
pub fn disk_free_mb(path: &Path) -> Option<u64> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut output = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: statvfs initializes valid output pointer on successful return.
    if unsafe { libc::statvfs(c.as_ptr(), output.as_mut_ptr()) } != 0 {
        return None;
    }
    let output = unsafe { output.assume_init() };
    let bytes = (output.f_bavail as u128) * (output.f_frsize as u128);
    u64::try_from(bytes / 1048576).ok()
}
#[cfg(windows)]
pub fn disk_free_mb(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let path: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut free = 0u64;
    // SAFETY: NUL-terminated path and valid output pointer.
    (unsafe {
        GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut free,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    } != 0)
        .then_some(free / 1048576)
}
#[cfg(not(any(unix, windows)))]
pub fn disk_free_mb(_: &Path) -> Option<u64> {
    None
}
