/** Structural validation for the requested MPEG-1 Layer III / 44.1 kHz format.
 * Checks ID3 size and complete frame boundaries, not decoded speech quality. */
export function completeMp3(bytes: Uint8Array): boolean {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0, frames = 0
  if (data.subarray(0, 3).toString('ascii') === 'ID3') {
    if (data.length < 10 || ![3, 4].includes(data[3]) || data[4] === 255 || data.subarray(6, 10).some(byte => byte > 127)) return false
    const size = data.subarray(6, 10).reduce((size, byte) => size * 128 + byte, 0)
    offset = 10 + size + (data[3] === 4 && (data[5] & 16) ? 10 : 0)
    if (offset > data.length) return false
  }
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  while (offset < data.length) {
    // Optional ID3v1 trailer contains no audio frames.
    if (data.length - offset === 128 && data.subarray(offset, offset + 3).toString('ascii') === 'TAG') { offset += 128; break }
    if (data.length - offset < 4) return false
    const header = data.readUInt32BE(offset)
    if ((header >>> 21) !== 2047 || ((header >>> 19) & 3) !== 3 || ((header >>> 17) & 3) !== 1
      || ((header >>> 10) & 3) !== 0 || (header & 3) === 2) return false
    const bitrate = bitrates[(header >>> 12) & 15]
    if (!bitrate) return false
    const length = Math.floor(144000 * bitrate / 44100) + ((header >>> 9) & 1)
    if (offset + length > data.length) return false
    offset += length; frames++
  }
  return offset === data.length && frames > 0
}
