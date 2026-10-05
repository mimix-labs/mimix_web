`voice-silence.mp3` is 100 ms of generated silence, MPEG-1 Layer III, 44.1 kHz,
128 kbps. It contains no voice, person or third-party recording.

Generated locally with:
`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -c:a libmp3lame -b:a 128k voice-silence.mp3`

The tests read this fixture; CI does not require FFmpeg. This is separate from the
fake provider's deliberately non-playable deterministic marker.
