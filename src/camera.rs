use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CameraFacing {
    Back,
    Front,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CameraPattern {
    ColorBars,
    QrCode,
    Barcode128,
    DocumentScan,
    Checkerboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraPatternInfo {
    pub id: String,
    pub pattern: CameraPattern,
    pub title: String,
    pub description: String,
    pub default_payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraInjectionRequest {
    pub pattern: CameraPattern,
    pub facing: CameraFacing,
    pub payload: Option<String>,
}

pub struct CameraEngine;

impl CameraEngine {
    pub fn standard_patterns() -> Vec<CameraPatternInfo> {
        vec![
            CameraPatternInfo {
                id: "color_bars".into(),
                pattern: CameraPattern::ColorBars,
                title: "SMPTE Color Calibration Bars".into(),
                description: "Standard multi-color alignment bars for camera sensor tuning.".into(),
                default_payload: "SMPTE_75".into(),
            },
            CameraPatternInfo {
                id: "qr_code".into(),
                pattern: CameraPattern::QrCode,
                title: "2D QR Code Pattern".into(),
                description:
                    "High-contrast geometric QR pattern for scanning & login authentication.".into(),
                default_payload: "https://multiemulator.studio/auth?session=live_demo".into(),
            },
            CameraPatternInfo {
                id: "barcode_128".into(),
                pattern: CameraPattern::Barcode128,
                title: "Code 128 Linear Barcode".into(),
                description:
                    "Linear 1D bar code pattern for retail & inventory scanner validation.".into(),
                default_payload: "MES-128-PROD-99824".into(),
            },
            CameraPatternInfo {
                id: "document_scan".into(),
                pattern: CameraPattern::DocumentScan,
                title: "Identity Document / Invoice Card".into(),
                description:
                    "High-contrast document rectangle with headers for OCR scanner testing.".into(),
                default_payload: "PASSPORT / DRIVER LICENSE SIMULATION".into(),
            },
            CameraPatternInfo {
                id: "checkerboard".into(),
                pattern: CameraPattern::Checkerboard,
                title: "Optical Distortion Checkerboard".into(),
                description: "8x8 checkerboard grid for lens distortion calibration.".into(),
                default_payload: "GRID_8X8".into(),
            },
        ]
    }

    /// Generates a valid 24-bit uncompressed RGB Windows Bitmap (BMP) in memory.
    /// This requires zero external dependencies and is natively decoded by Android and iOS.
    pub fn generate_bmp_pattern(pattern: CameraPattern, width: u32, height: u32) -> Vec<u8> {
        let row_padding = (4 - ((width * 3) % 4)) % 4;
        let image_size = (width * 3 + row_padding) * height;
        let file_size = 54 + image_size;

        let mut bmp = Vec::with_capacity(file_size as usize);

        // --- BMP Header (14 bytes) ---
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes()); // Reserved
        bmp.extend_from_slice(&54u32.to_le_bytes()); // Pixel data offset

        // --- DIB Header (BITMAPINFOHEADER - 40 bytes) ---
        bmp.extend_from_slice(&40u32.to_le_bytes()); // Header size
        bmp.extend_from_slice(&(width as i32).to_le_bytes());
        bmp.extend_from_slice(&(height as i32).to_le_bytes()); // Bottom-up
        bmp.extend_from_slice(&1u16.to_le_bytes()); // Planes
        bmp.extend_from_slice(&24u16.to_le_bytes()); // Bits per pixel (24-bit RGB)
        bmp.extend_from_slice(&0u32.to_le_bytes()); // Compression (BI_RGB = 0)
        bmp.extend_from_slice(&image_size.to_le_bytes());
        bmp.extend_from_slice(&2835u32.to_le_bytes()); // Horizontal resolution (~72 DPI)
        bmp.extend_from_slice(&2835u32.to_le_bytes()); // Vertical resolution (~72 DPI)
        bmp.extend_from_slice(&0u32.to_le_bytes()); // Colors in palette
        bmp.extend_from_slice(&0u32.to_le_bytes()); // Important colors

        // --- Pixel Data (BGR, bottom to top) ---
        for y in 0..height {
            for x in 0..width {
                let (r, g, b) = match pattern {
                    CameraPattern::ColorBars => {
                        let bar = (x * 7) / width;
                        match bar {
                            0 => (255, 255, 255), // White
                            1 => (255, 255, 0),   // Yellow
                            2 => (0, 255, 255),   // Cyan
                            3 => (0, 255, 0),     // Green
                            4 => (255, 0, 255),   // Magenta
                            5 => (255, 0, 0),     // Red
                            _ => (0, 0, 255),     // Blue
                        }
                    }
                    CameraPattern::Checkerboard => {
                        let cell_x = (x * 8) / width;
                        let cell_y = (y * 8) / height;
                        if (cell_x + cell_y).is_multiple_of(2) {
                            (255, 255, 255)
                        } else {
                            (30, 30, 30)
                        }
                    }
                    CameraPattern::QrCode => {
                        // High-contrast simulated QR finder patterns & data grid
                        let cell_x = (x * 21) / width;
                        let cell_y = (y * 21) / height;
                        let is_finder = (cell_x < 7 && cell_y < 7)
                            || (cell_x >= 14 && cell_y < 7)
                            || (cell_x < 7 && cell_y >= 14);

                        if is_finder {
                            let ring = cell_x.is_multiple_of(7)
                                || cell_x % 7 == 6
                                || cell_y.is_multiple_of(7)
                                || cell_y % 7 == 6
                                || (cell_x % 7 >= 2
                                    && cell_x % 7 <= 4
                                    && cell_y % 7 >= 2
                                    && cell_y % 7 <= 4);
                            if ring {
                                (0, 0, 0)
                            } else {
                                (255, 255, 255)
                            }
                        } else if (cell_x * 7 + cell_y * 13).is_multiple_of(5) {
                            (0, 0, 0)
                        } else {
                            (255, 255, 255)
                        }
                    }
                    CameraPattern::Barcode128 => {
                        if (x / 8).is_multiple_of(2) {
                            (0, 0, 0)
                        } else {
                            (255, 255, 255)
                        }
                    }
                    CameraPattern::DocumentScan => {
                        let border_x = width / 10;
                        let border_y = height / 10;
                        if x >= border_x
                            && x <= width - border_x
                            && y >= border_y
                            && y <= height - border_y
                        {
                            (245, 245, 240) // Off-white card surface
                        } else {
                            (50, 60, 70) // Dark table surface
                        }
                    }
                };

                // BMP stores pixels in BGR order
                bmp.push(b);
                bmp.push(g);
                bmp.push(r);
            }
            bmp.resize(bmp.len() + row_padding as usize, 0);
        }

        bmp
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_patterns_catalog() {
        let patterns = CameraEngine::standard_patterns();
        assert_eq!(patterns.len(), 5);
        assert!(patterns
            .iter()
            .all(|p| !p.id.is_empty() && !p.title.is_empty()));
    }

    #[test]
    fn test_bmp_generation_header_and_size() {
        let width = 320;
        let height = 240;
        let bytes = CameraEngine::generate_bmp_pattern(CameraPattern::ColorBars, width, height);

        // Header signature "BM"
        assert_eq!(&bytes[0..2], b"BM");

        // Verify file size matches header
        let file_size = u32::from_le_bytes(bytes[2..6].try_into().unwrap());
        assert_eq!(file_size as usize, bytes.len());

        // Verify pixel offset is 54
        let offset = u32::from_le_bytes(bytes[10..14].try_into().unwrap());
        assert_eq!(offset, 54);

        // Verify dimensions in DIB header
        let w = i32::from_le_bytes(bytes[18..22].try_into().unwrap());
        let h = i32::from_le_bytes(bytes[22..26].try_into().unwrap());
        assert_eq!(w, 320);
        assert_eq!(h, 240);
    }
}
