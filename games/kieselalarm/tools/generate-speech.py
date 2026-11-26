"""Regenerate the offline German speech bank with Piper Thorsten medium and ffmpeg."""
import argparse
import base64
import io
import json
from pathlib import Path
import subprocess
import wave

import onnxruntime as ort
from piper.config import PiperConfig, SynthesisConfig
from piper.voice import PiperVoice

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path, help="Path to de_DE-thorsten-medium.onnx")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
rows = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e",
     "import {EXTRA_TASKS} from './vocabulary.mjs'; console.log(JSON.stringify(EXTRA_TASKS));"],
    cwd=root))
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
voice = PiperVoice(config=PiperConfig.from_dict(json.loads(Path(str(args.model) + ".json").read_text())),
                   session=ort.InferenceSession(str(args.model), sess_options=options,
                                                providers=["CPUExecutionProvider"]))
clips = {}
for row in rows:
    wav = io.BytesIO()
    with wave.open(wav, "wb") as writer:
        voice.synthesize_wav(row.get("speech") or row["text"] + ".", writer,
                             syn_config=SynthesisConfig(length_scale=1.14, volume=0.92))
    mp3 = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-map_metadata", "-1",
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "22050", "-ac", "1",
         "-codec:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1"],
        input=wav.getvalue(), stdout=subprocess.PIPE, check=True).stdout
    clips[row["text"]] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
output = root / "speech-clips.mjs"
output.with_suffix(".tmp").write_text("export const SPEECH_CLIPS = " +
                                      json.dumps(clips, ensure_ascii=False) + ";\n")
output.with_suffix(".tmp").replace(output)
print(f"{len(clips)} offline speech clips generated.")
