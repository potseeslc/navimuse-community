import Foundation
import Observation
import NowPlaying

// Shared between the future host bridge and remote-media extension. No credentials,
// stream URLs, queue copy, or device network addresses belong in these attributes.
@available(iOS 27.0, *)
struct RemoteSpeakerAttributes: RemoteMediaSessionAttributes {
    let id: String
    let revision: Int
    let status: String
    let mediaKind: String
    let elapsedTime: Double
    @RemoteSpeakerTimestamp var timestamp: Date
    let deviceID: String
    let deviceName: String
    let trackID: String
    let title: String
    let artist: String
    let album: String
    let duration: Double?
    let artworkID: String?
    let canNext: Bool
    let canPrevious: Bool
    let canSeek: Bool
}

@available(iOS 27.0, *)
@MainActor
protocol RemoteSpeakerCommandSink {
    // Implementation must refresh the authenticated BFF session, verify ownership
    // and revision, send one idempotent command, and return the confirmed state.
    // Never dispatch through suspended JavaScript or fall back to local audio.
    func send(sessionID: String, revision: Int, action: String, position: Double?) async throws -> RemoteSpeakerAttributes
}

@available(iOS 27.0, *)
@Observable @MainActor
final class RemoteSpeakerSession: RemoteMediaSessionRepresentable {
    let id: String
    private(set) var attributes: RemoteSpeakerAttributes
    private let sink: any RemoteSpeakerCommandSink
    private let artwork: (String) -> Artwork?
    private var pushObservation: Task<Void, Never>?
    private var pushRegistration: Task<Void, Never>?
    isolated deinit { pushObservation?.cancel(); pushRegistration?.cancel() }

    func observePushTokens(register: @escaping (Data) async throws -> Void) {
        pushObservation?.cancel()
        let updates = pushTokenUpdates
        if let current = pushToken { registerToken(current, register:register) }
        pushObservation = Task { [weak self] in
            for await token in updates {
                if Task.isCancelled { break }
                self?.registerToken(token, register:register)
            }
        }
    }
    private func registerToken(_ token: Data, register: @escaping (Data) async throws -> Void) {
        pushRegistration?.cancel()
        pushRegistration = Task {
            for delay: UInt64 in [0, 2, 5, 10, 20] {
                do {
                    if delay > 0 { try await Task.sleep(nanoseconds:delay * 1_000_000_000) }
                    try Task.checkCancellation()
                    try await register(token)
                    return
                } catch is CancellationError { return } catch { }
            }
        }
    }

    init(attributes: RemoteSpeakerAttributes, sink: any RemoteSpeakerCommandSink,
         artwork: @escaping (String) -> Artwork?) {
        self.id = attributes.id
        self.attributes = attributes
        self.sink = sink
        self.artwork = artwork
    }

    func update(_ attributes: RemoteSpeakerAttributes) {
        guard attributes.id == id,
              attributes.revision > self.attributes.revision ||
              (attributes.revision == self.attributes.revision && attributes.timestamp >= self.attributes.timestamp) else { return }
        self.attributes = attributes
    }

    var content: (any MediaContentRepresentable)? {
        if attributes.mediaKind == "radio" {
            return RadioContent(id: attributes.trackID, stationName: attributes.title,
                                type: .audio, duration: .live,
                                artwork: attributes.artworkID.flatMap(artwork))
        }
        return MusicContent(id: attributes.trackID, songTitle: attributes.title,
                     artistName: attributes.artist, albumName: attributes.album,
                     type: .audio, duration: attributes.duration.map { .finite($0) },
                     artwork: attributes.artworkID.flatMap(artwork))
    }

    var playbackSnapshot: MediaPlaybackSnapshot? {
        let state: MediaPlaybackSnapshot.PlaybackState
        switch attributes.status {
        case "playing": state = .playing()
        case "paused": state = .paused
        case "buffering": state = .buffering
        default: state = .stopped
        }
        return MediaPlaybackSnapshot(state: state, elapsedTime: attributes.elapsedTime,
                                     timestamp: attributes.timestamp)
    }

    var devices: [MediaDevice] {
        [MediaDevice(id: attributes.deviceID, name: attributes.deviceName,
                     type: .speaker, capabilities: [])]
    }

    var commands: [MediaCommand] {
        guard ["playing", "paused", "buffering"].contains(attributes.status) else { return [] }
        return [
            .play { try await self.send("play") },
            .pause { try await self.send("pause") },
            .next { try await self.send("next") }.enabled(attributes.canNext),
            .previous { try await self.send("previous") }.enabled(attributes.canPrevious),
            .seekToPosition { try await self.send("seek", position: $0) }.enabled(attributes.canSeek)
        ]
    }

    private func send(_ action: String, position: Double? = nil) async throws {
        guard ["playing", "paused", "buffering"].contains(attributes.status),
              action != "next" || attributes.canNext,
              action != "previous" || attributes.canPrevious,
              action != "seek" || (attributes.canSeek && position?.isFinite == true &&
                  position! >= 0 && position! <= (attributes.duration ?? 0)) else {
            throw RemoteSpeakerError.unavailableCommand
        }
        let confirmed = try await sink.send(sessionID: id, revision: attributes.revision,
                                            action: action, position: position)
        guard confirmed.id == id else { throw RemoteSpeakerError.sessionChanged }
        update(confirmed)
    }
}

enum RemoteSpeakerError: Error { case unavailableCommand, sessionChanged }
