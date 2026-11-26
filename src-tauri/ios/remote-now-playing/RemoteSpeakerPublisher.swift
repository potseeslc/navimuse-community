import Foundation
import NowPlaying
import UIKit

// Host-only boundary. Call only after the native bridge has verified the current
// account binding and BFF ownership. The extension never depends on this process.
@available(iOS 27.0, *)
@MainActor
final class RemoteSpeakerPublisher {
    private var sessions: [String: RemoteMediaSession<RemoteSpeakerAttributes>] = [:]
    private var latest: [String: RemoteSpeakerAttributes] = [:]
    private var tail: Task<Void, Error>?
    private var epoch = 0
    private var desired: String?
    private var recovered = false
    private var boundScope: String?

    // Ending our own display never requires retaining a now-revoked credential.
    func endConfirmedOwnership() async throws {
        try await reconcile(nil, verifiedScope: boundScope ?? "revoked")
    }

    // nil means a confirmed release/logout, never a network refresh failure.
    // Changes within one speaker session reuse the same system session.
    func reconcile(_ attributes: RemoteSpeakerAttributes?, verifiedScope: String,
                   userInitiatedTransfer: Bool = false) async throws {
        guard !verifiedScope.isEmpty else { throw RemoteSpeakerError.sessionChanged }
        let key = attributes.map { verifiedScope + ":" + $0.id }
        if desired != key { desired = key; epoch += 1 }
        let requestEpoch = epoch
        let previous = tail
        let work = Task { @MainActor in
            _ = try? await previous?.value
            guard self.epoch == requestEpoch else { return }
            if !self.recovered {
                let existing = try await RemoteMediaSession<RemoteSpeakerAttributes>.sessions()
                for session in existing { self.sessions[session.id] = session }
                self.recovered = true
            }
            guard self.epoch == requestEpoch else { return }
            // An account change must also end any same-ID restored card.
            let scopeChanged = self.boundScope != nil && self.boundScope != verifiedScope
            for id in Array(self.sessions.keys) where scopeChanged || id != attributes?.id {
                if let session = self.sessions[id] { try await session.end() }
                self.sessions.removeValue(forKey: id)
                self.latest.removeValue(forKey: id)
            }
            guard self.epoch == requestEpoch else { return }
            self.boundScope = verifiedScope
            guard let attributes else { return }
            if let last = self.latest[attributes.id],
               attributes.revision < last.revision ||
               (attributes.revision == last.revision && attributes.timestamp < last.timestamp) { return }
            let session: RemoteMediaSession<RemoteSpeakerAttributes>
            if let existing = self.sessions[attributes.id] {
                session = existing
                try await session.update(attributes)
            } else {
                // Reopening or polling must not resurrect a user-dismissed card.
                guard userInitiatedTransfer && UIApplication.shared.applicationState == .active else { return }
                session = try await RemoteMediaSession.start(attributes: attributes)
                self.sessions[session.id] = session
            }
            guard self.epoch == requestEpoch else {
                // A logout or another transfer may arrive while start/update awaits.
                try await session.end()
                self.sessions.removeValue(forKey: session.id)
                self.latest.removeValue(forKey: session.id)
                return
            }
            self.latest[attributes.id] = attributes
            if userInitiatedTransfer && UIApplication.shared.applicationState == .active {
                try await session.requestToBecomeSystemPrimary()
            }
        }
        tail = work
        try await work.value
    }
}
