"""
Servicio de texto a voz de Prisma (Piper).

POST /synthesize  {"text": "..."}  ->  audio/ogg (Opus, 48 kHz, mono)
GET  /health                        ->  200 "ok"

Devuelve Ogg Opus a 48 kHz porque es lo que Discord reproduce sin recodificar: así el bot no
necesita ffmpeg ni librerías nativas de audio. Solo escucha dentro de la red Docker de Prisma.
"""

import io
import json
import logging
import os
import subprocess
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import onnxruntime
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig
from piper.voice import ESPEAK_DATA_DIR

VOICE = os.environ.get("PIPER_VOICE", "es_AR-daniela-high")
VOICES_DIR = os.environ.get("PIPER_VOICES_DIR", "/voices")
PORT = int(os.environ.get("PORT", "5000"))
# Velocidad del habla: < 1 más rápido, > 1 más lento.
LENGTH_SCALE = float(os.environ.get("PIPER_LENGTH_SCALE", "0.95"))
MAX_TEXT_LENGTH = 1000
# Hilos de ONNX Runtime: tienen que coincidir con las CPU del contenedor. Por defecto usa todos
# los núcleos de la VPS (8) y, con el límite de CPU de Docker, va el doble de lento.
THREADS = int(os.environ.get("PIPER_THREADS", "2"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tts")

def load_voice() -> PiperVoice:
    model = os.path.join(VOICES_DIR, f"{VOICE}.onnx")
    with open(f"{model}.json", encoding="utf-8") as config_file:
        config = PiperConfig.from_dict(json.load(config_file))
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = THREADS
    options.inter_op_num_threads = 1
    session = onnxruntime.InferenceSession(
        model, sess_options=options, providers=["CPUExecutionProvider"]
    )
    return PiperVoice(
        config=config,
        session=session,
        espeak_data_dir=Path(ESPEAK_DATA_DIR),
        download_dir=Path("/tmp"),
    )


voice = load_voice()
syn_config = SynthesisConfig(length_scale=LENGTH_SCALE)
# ONNX Runtime ya usa varios hilos por síntesis: de a una por vez evita saturar la CPU compartida.
synth_lock = Lock()
log.info("Voz cargada: %s (%d Hz, %d hilos)", VOICE, voice.config.sample_rate, THREADS)


def synthesize_ogg(text: str) -> bytes:
    wav_buffer = io.BytesIO()
    with synth_lock, wave.open(wav_buffer, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, syn_config=syn_config)

    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0",
            "-ar", "48000", "-ac", "1",
            "-c:a", "libopus", "-b:a", "64k", "-application", "voip",
            "-f", "ogg", "pipe:1",
        ],
        input=wav_buffer.getvalue(),
        capture_output=True,
        check=True,
    )
    return result.stdout


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, b"ok", "text/plain")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self) -> None:
        if self.path != "/synthesize":
            self._send(404, b"not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            text = str(json.loads(self.rfile.read(length)).get("text", "")).strip()
        except (ValueError, json.JSONDecodeError):
            self._send(400, b"JSON invalido", "text/plain")
            return
        if not text or len(text) > MAX_TEXT_LENGTH:
            self._send(400, b"texto vacio o demasiado largo", "text/plain")
            return

        started = time.perf_counter()
        try:
            audio = synthesize_ogg(text)
        except subprocess.CalledProcessError as error:
            log.error("ffmpeg fallo: %s", error.stderr.decode(errors="replace"))
            self._send(500, b"error de sintesis", "text/plain")
            return
        log.info("Sintetizado: %d caracteres en %.2f s", len(text), time.perf_counter() - started)
        self._send(200, audio, "audio/ogg")

    def log_message(self, *_args) -> None:  # El log de cada request lo hace do_POST.
        pass


if __name__ == "__main__":
    log.info("Escuchando en el puerto %d", PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
