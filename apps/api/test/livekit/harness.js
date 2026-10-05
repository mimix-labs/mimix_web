/* global window, document */
import { Room, RoomEvent, Track } from 'livekit-client'
const room = new Room({ adaptiveStream: false, dynacast: false })
const state = { connected: false, subscribed: [], videoFrames: 0, disconnected: false, audioBytes: 0 }
room.on(RoomEvent.Disconnected, () => { state.connected = false; state.disconnected = true })
room.on(RoomEvent.TrackSubscribed, track => {
  state.subscribed.push(track.source)
  const element = track.attach(); element.muted = true; document.body.append(element)
  if (track.kind === Track.Kind.Video) element.requestVideoFrameCallback(() => { state.videoFrames++ })
  if (track.kind === Track.Kind.Audio) {
    const timer = setInterval(async () => {
      const report = await track.getRTCStatsReport()
      report?.forEach(item => { if (item.type === 'inbound-rtp') state.audioBytes = Math.max(state.audioBytes, item.bytesReceived ?? 0) })
      if (state.audioBytes || state.disconnected) clearInterval(timer)
    }, 100)
  }
})
window.mediaTest = {
  state,
  async connect(url, token) { const start = performance.now(); await room.connect(url, token); state.connected = true; return performance.now() - start },
  async publish(source) {
    const stream = await navigator.mediaDevices.getUserMedia(source === 'camera' ? { video: { width: 320, height: 240 }, audio: false } : { audio: true, video: false })
    const track = stream.getTracks()[0]
    try { await room.localParticipant.publishTrack(track, { source: source === 'camera' ? Track.Source.Camera : Track.Source.Microphone }) }
    catch (error) { track.stop(); throw error }
  },
  disconnect() { return room.disconnect() },
}
