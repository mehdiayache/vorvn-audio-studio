"""Audio assembly produces one valid file instead of concatenated containers."""

import math
import struct
import subprocess
import unittest

from audio_studio.infrastructure import audio_codec


def tone_pcm(*, sample_rate: int, seconds: float, frequency: float) -> bytes:
    frames = int(sample_rate * seconds)
    return b"".join(struct.pack(
        "<h", round(8_000 * math.sin(2 * math.pi * frequency * i / sample_rate))
    ) for i in range(frames))


class AudioCodecTests(unittest.TestCase):
    def test_every_output_is_one_decodable_container_with_full_duration(self):
        sample_rate = 24_000
        pcm = (
            tone_pcm(sample_rate=sample_rate, seconds=.12, frequency=220)
            + tone_pcm(sample_rate=sample_rate, seconds=.13, frequency=330)
        )
        for output_format in ("wav", "mp3", "mp3-24k", "opus"):
            with self.subTest(output_format=output_format):
                encoded = audio_codec.encode_pcm(
                    pcm, sample_rate=sample_rate, output_format=output_format)
                decoded = audio_codec.decode_pcm(
                    encoded, sample_rate=sample_rate)
                duration = len(decoded) / (sample_rate * 2)
                # Lossy containers may add a short codec delay, but they must
                # contain the complete joined waveform in one decodable file.
                self.assertGreaterEqual(duration, .24)
                self.assertLessEqual(duration, .34)

    def test_legacy_24k_mp3_format_is_really_resampled_to_24khz(self):
        encoded = audio_codec.encode_pcm(
            tone_pcm(sample_rate=48_000, seconds=.1, frequency=220),
            sample_rate=48_000,
            output_format="mp3-24k",
        )
        inspected = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=sample_rate", "-of",
             "default=noprint_wrappers=1:nokey=1", "pipe:0"],
            input=encoded, capture_output=True, check=True,
        )
        self.assertEqual(inspected.stdout.strip(), b"24000")

    def test_invalid_provider_audio_fails_closed(self):
        with self.assertRaises(RuntimeError):
            audio_codec.decode_pcm(b"not an audio file", sample_rate=24_000)


if __name__ == "__main__":
    unittest.main()
