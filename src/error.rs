use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("unavailable: {0}")]
    Unavailable(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("operation timed out: {0}")]
    Timeout(String),
    #[error("runtime failed: {0}")]
    Runtime(String),
    #[error("I/O operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("storage operation failed: {0}")]
    Storage(#[from] rusqlite::Error),
    #[error("serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Serialize)]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}
impl From<Error> for ApiError {
    fn from(e: Error) -> Self {
        let code = match &e {
            Error::Invalid(_) => "invalid",
            Error::Unavailable(_) => "unavailable",
            Error::Conflict(_) => "conflict",
            Error::Timeout(_) => "timeout",
            Error::Runtime(_) => "runtime",
            Error::Io(_) => "io",
            Error::Storage(_) => "storage",
            Error::Json(_) => "json",
        };
        Self {
            code,
            message: e.to_string(),
        }
    }
}
