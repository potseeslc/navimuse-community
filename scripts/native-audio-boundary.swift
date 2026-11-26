import AVFoundation
import Foundation

enum EvidenceError: Error {
    case missingArgument
    case bufferAllocation
}

guard CommandLine.arguments.count == 3 else {
    fputs("usage: native-audio-boundary TRACK_A.wav TRACK_B.wav\n", stderr)
    throw EvidenceError.missingArgument
}

func loadBuffer(_ path: String) throws -> (AVAudioPCMBuffer, AVAudioFormat) {
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    guard let buffer = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat,
        frameCapacity: AVAudioFrameCount(file.length)
    ) else { throw EvidenceError.bufferAllocation }
    try file.read(into: buffer)
    return (buffer, file.processingFormat)
}

let (outgoing, format) = try loadBuffer(CommandLine.arguments[1])
let (incoming, incomingFormat) = try loadBuffer(CommandLine.arguments[2])
guard format.sampleRate == incomingFormat.sampleRate,
      format.channelCount == incomingFormat.channelCount else {
    fatalError("fixture formats differ")
}

let engine = AVAudioEngine()
let player = AVAudioPlayerNode()
engine.attach(player)
engine.connect(player, to: engine.mainMixerNode, format: format)
try engine.start()

let finished = DispatchSemaphore(value: 0)
let startedAt = ContinuousClock.now
player.scheduleBuffer(outgoing, at: nil, options: [])
player.scheduleBuffer(incoming, at: nil, options: []) {
    finished.signal()
}
player.play()
print("native-boundary-start sampleRate=\(format.sampleRate) framesA=\(outgoing.frameLength) framesB=\(incoming.frameLength)")
if finished.wait(timeout: .now() + 12) == .timedOut {
    fputs("native-boundary-timeout\n", stderr)
    exit(2)
}
let elapsed = startedAt.duration(to: ContinuousClock.now)
print("native-boundary-complete elapsed=\(elapsed)")
player.stop()
engine.stop()
