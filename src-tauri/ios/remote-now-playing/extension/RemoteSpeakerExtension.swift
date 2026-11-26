import ExtensionFoundation
import NowPlaying

@main
struct NaviMuseRemoteSpeakerExtension: RemoteMediaSessionExtension {
    var configuration: RemoteMediaSessionExtensionConfiguration<Self> {
        RemoteMediaSessionExtensionConfiguration(extension:self)
    }
    func session(_ attributes: RemoteSpeakerAttributes) async throws -> RemoteSpeakerSession {
        _ = try RemoteSpeakerKeychain.access(sessionID:attributes.id)
        let client = RemoteSpeakerClient(sessionID:attributes.id)
        let current = try await client.snapshot()
        let session = RemoteSpeakerSession(attributes:current,sink:client,artwork:client.artwork)
        session.observePushTokens { try await client.registerPush($0) }
        return session
    }
}
