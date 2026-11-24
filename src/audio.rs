use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioState {
    pub enabled: bool,
    pub output_volume: u32, // 0 to 100
    pub muted: bool,
    pub sample_rate: u32,
    pub channels: u16,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            enabled: true,
            output_volume: 80,
            muted: false,
            sample_rate: 44100,
            channels: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioSample {
    pub id: String,
    pub title: String,
    pub category: String,
    pub description: String,
    pub duration_ms: u64,
}

pub struct AudioEngine;

impl AudioEngine {
    pub fn standard_samples() -> Vec<AudioSample> {
        vec![
            AudioSample {
                id: "speech_test_prompt".into(),
                title: "Voice Assistant Prompt (1kHz sine)".into(),
                category: "speech".into(),
                description: "Synthesized calibration tone for voice input and VoIP test flows."
                    .into(),
                duration_ms: 1000,
            },
            AudioSample {
                id: "dtmf_dial_tones".into(),
                title: "DTMF Keypad Tone (770Hz / 1336Hz)".into(),
                category: "dtmf".into(),
                description: "Dual-tone multi-frequency telephone signaling for IVR testing."
                    .into(),
                duration_ms: 800,
            },
            AudioSample {
                id: "notification_chime".into(),
                title: "Notification Chime (880Hz / 1760Hz)".into(),
                category: "chime".into(),
                description: "Harmonic high-pitch chime for push notification audio verification."
                    .into(),
                duration_ms: 600,
            },
            AudioSample {
                id: "ambient_cafeteria_noise".into(),
                title: "Acoustic Noise (440Hz modulated)".into(),
                category: "noise".into(),
                description: "Simulated environmental noise floor for audio filter testing.".into(),
                duration_ms: 1200,
            },
        ]
    }

    /// Dynamically synthesizes a valid 16-bit PCM RIFF WAV audio byte stream in memory.
    /// Completely self-contained with zero external file dependencies or cloud calls.
    pub fn generate_wav_sample(sample_id: &str) -> Vec<u8> {
        let (freq1, freq2, duration_ms) = match sample_id {
            "dtmf_dial_tones" => (770.0, 1336.0, 800),
            "notification_chime" => (880.0, 1760.0, 600),
            "ambient_cafeteria_noise" => (440.0, 445.0, 1200),
            _ => (1000.0, 1000.0, 1000), // Default speech prompt tone
        };

        let sample_rate = 44100u32;
        let num_samples = (sample_rate as u64 * duration_ms / 1000) as usize;
        let mut pcm_bytes = Vec::with_capacity(num_samples * 2);

        for i in 0..num_samples {
            let t = i as f64 / sample_rate as f64;
            // Mixed two sine waves with decay envelope
            let envelope = 1.0 - (i as f64 / num_samples as f64) * 0.3;
            let sample = ((t * freq1 * 2.0 * std::f64::consts::PI).sin()
                + (t * freq2 * 2.0 * std::f64::consts::PI).sin())
                * 0.45
                * envelope;
            let sample_i16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            pcm_bytes.extend_from_slice(&sample_i16.to_le_bytes());
        }

        // Build RIFF / WAVE header
        let mut wav = Vec::with_capacity(44 + pcm_bytes.len());
        let data_size = pcm_bytes.len() as u32;
        let riff_size = 36 + data_size;

        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&riff_size.to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes()); // Subchunk1Size (16 for PCM)
        wav.extend_from_slice(&1u16.to_le_bytes()); // AudioFormat (1 = PCM)
        wav.extend_from_slice(&1u16.to_le_bytes()); // NumChannels (1 = Mono)
        wav.extend_from_slice(&sample_rate.to_le_bytes()); // SampleRate
        wav.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        wav.extend_from_slice(&2u16.to_le_bytes()); // BlockAlign
        wav.extend_from_slice(&16u16.to_le_bytes()); // BitsPerSample
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        wav.extend_from_slice(&pcm_bytes);

        wav
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standard_samples_catalog() {
        let samples = AudioEngine::standard_samples();
        assert_eq!(samples.len(), 4);
        assert!(samples
            .iter()
            .all(|s| !s.id.is_empty() && s.duration_ms > 0));
    }

    #[test]
    fn test_generate_wav_header_is_valid() {
        let bytes = AudioEngine::generate_wav_sample("speech_test_prompt");
        assert!(bytes.len() > 44);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[12..16], b"fmt ");
        assert_eq!(&bytes[36..40], b"data");
    }

    #[test]
    fn test_audio_state_defaults() {
        let state = AudioState::default();
        assert!(state.enabled);
        assert_eq!(state.output_volume, 80);
        assert!(!state.muted);
    }
}
