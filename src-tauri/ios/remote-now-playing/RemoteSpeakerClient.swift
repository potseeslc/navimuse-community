import Foundation
import NowPlaying

final class RemoteSpeakerNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@available(iOS 27.0, *)
@MainActor
final class RemoteSpeakerClient: RemoteSpeakerCommandSink {
    static let origin = URL(string:"https://navimuse.example.com")!
    static let prefix = "/api/playback/wiim/now-playing"
    private let http: URLSession
    private let sessionID: String
    private var commandPending = false
    struct Publication: Decodable { let kind: String; let attributes: RemoteSpeakerAttributes? }
    init(sessionID: String) {
        self.sessionID = sessionID
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 10; config.timeoutIntervalForResource = 12
        http = URLSession(configuration:config,delegate:RemoteSpeakerNoRedirect(),delegateQueue:nil)
    }
    private func request(_ path: String, body: [String: Any]? = nil, maxBytes: Int = 65536) async throws -> Data {
        let access = try RemoteSpeakerKeychain.access(sessionID:sessionID)
        var req = URLRequest(url:Self.origin.appendingPathComponent(Self.prefix+path))
        req.httpMethod = body == nil ? "GET" : "POST"
        req.setValue("Bearer "+access.token,forHTTPHeaderField:"Authorization")
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject:body);req.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        let (bytes,response) = try await http.bytes(for:req)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw RemoteSpeakerError.unavailableCommand }
        if path == "/artwork" { guard ["image/jpeg","image/png","image/webp"].contains(response.mimeType ?? "") else { throw RemoteSpeakerError.unavailableCommand } }
        var data = Data();for try await byte in bytes { guard data.count < maxBytes else { throw RemoteSpeakerError.unavailableCommand };data.append(byte) }
        guard try RemoteSpeakerKeychain.access(sessionID:sessionID) == access else { throw RemoteSpeakerError.sessionChanged }
        return data
    }
    func snapshot() async throws -> RemoteSpeakerAttributes {
        let result = try JSONDecoder().decode(Publication.self,from:await request("/snapshot"))
        guard result.kind == "update",let attributes = result.attributes,attributes.id == sessionID else { throw RemoteSpeakerError.unavailableCommand }
        return attributes
    }
    func send(sessionID: String, revision: Int, action: String, position: Double?) async throws -> RemoteSpeakerAttributes {
        guard self.sessionID == sessionID,!commandPending else { throw RemoteSpeakerError.unavailableCommand }
        commandPending = true;defer { commandPending = false }
        let fresh = try await snapshot()
        guard fresh.revision == revision else { throw RemoteSpeakerError.sessionChanged }
        var body: [String:Any] = ["action":action,"revision":revision,"commandId":UUID().uuidString]
        if let position { body["position"] = position }
        // A timeout is surfaced; never replay a skip with a new command identity.
        let result = try JSONDecoder().decode(Publication.self,from:await request("/commands",body:body))
        guard result.kind == "update",let attributes = result.attributes,attributes.id == sessionID else { throw RemoteSpeakerError.sessionChanged }
        return attributes
    }
    func registerPush(_ token: Data) async throws {
        _ = try await request("/push-token",body:["pushToken":token.map { String(format:"%02x",$0) }.joined()])
    }
    func artwork(_ artworkID: String) -> Artwork {
        Artwork(id:sessionID+":"+artworkID) { _ in
            let before = try await self.snapshot()
            guard before.artworkID == artworkID else { throw RemoteSpeakerError.sessionChanged }
            let data = try await self.request("/artwork",maxBytes:2*1024*1024)
            let after = try await self.snapshot()
            guard after.artworkID == artworkID,after.trackID == before.trackID else { throw RemoteSpeakerError.sessionChanged }
            return try ArtworkRepresentation(data:data)
        }
    }
}
