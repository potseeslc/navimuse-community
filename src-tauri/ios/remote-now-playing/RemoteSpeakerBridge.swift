import Foundation
import WebKit
import UIKit

@available(iOS 27.0, *)
@objc(NMRemoteSpeakerBridge)
@MainActor
final class RemoteSpeakerBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let publisher = RemoteSpeakerPublisher()
    private weak var webview: WKWebView?
    private var epoch = 0
    private var tail: Task<Void, Error>?
    @objc(installOn:) static func install(on webview: WKWebView) {
        guard Bundle.main.object(forInfoDictionaryKey:"NaviMuseRemoteNowPlayingEnabled") as? Bool == true else { return }
        let bridge = RemoteSpeakerBridge();bridge.webview = webview
        webview.configuration.userContentController.addScriptMessageHandler(bridge,contentWorld:.page,name:"navimuseRemoteSpeaker")
        let source = "Object.defineProperty(window,'__NAVIMUSE_REMOTE_NOW_PLAYING__',{value:Object.freeze({request:payload=>window.webkit.messageHandlers.navimuseRemoteSpeaker.postMessage(payload)}),configurable:false});"
        webview.configuration.userContentController.addUserScript(WKUserScript(source:source,injectionTime:.atDocumentStart,forMainFrameOnly:true))
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,origin.protocol == "https",origin.host == "navimuse.example.com",(origin.port == 0 || origin.port == 443),
              let body = message.body as? [String:Any],let action = body["action"] as? String else { replyHandler(nil,"Untrusted remote player request");return }
        if action == "end" { epoch += 1 }
        let generation = epoch,previous = tail
        let work = Task { @MainActor in
            _ = try? await previous?.value
            if action == "end" {
                try RemoteSpeakerKeychain.clear()
                try await publisher.endConfirmedOwnership()
                return
            }
            guard generation == epoch,action == "update",UIApplication.shared.applicationState == .active,
                  let scope = body["scope"] as? String,!scope.isEmpty,scope.count < 160,
                  let sessionID = body["sessionID"] as? String,UUID(uuidString:sessionID) != nil else { throw RemoteSpeakerError.sessionChanged }
            let userInitiated = body["userInitiated"] as? Bool == true
            let access = try? RemoteSpeakerKeychain.access(sessionID:sessionID)
            if access?.scope != scope || (access?.expiresAt ?? 0) < Date().timeIntervalSince1970*1000+60000 {
                try await authorize(scope:scope,sessionID:sessionID,generation:generation)
            }
            guard generation == epoch else { throw RemoteSpeakerError.sessionChanged }
            let client = RemoteSpeakerClient(sessionID:sessionID)
            let attributes = try await client.snapshot()
            guard generation == epoch else { throw RemoteSpeakerError.sessionChanged }
            try await publisher.reconcile(attributes,verifiedScope:scope,userInitiatedTransfer:userInitiated)
        }
        tail = work
        Task { do { try await work.value;replyHandler(["ok":true],nil) } catch { replyHandler(nil,"Remote system player unavailable") } }
    }
    private func authorize(scope:String,sessionID:String,generation:Int) async throws {
        guard let webview else { throw RemoteSpeakerError.sessionChanged }
        let cookies = await webview.configuration.websiteDataStore.httpCookieStore.allCookies()
        var url = URLComponents(url:RemoteSpeakerClient.origin.appendingPathComponent(RemoteSpeakerClient.prefix+"/grant"),resolvingAgainstBaseURL:false)!
        url.queryItems = [URLQueryItem(name:"accountScope",value:scope)]
        var request = URLRequest(url:url.url!);request.httpMethod = "POST"
        let matching = cookies.filter { ($0.domain == "navimuse.example.com" || $0.domain == ".example.com" || $0.domain == ".navimuse.example.com") && RemoteSpeakerClient.prefix.hasPrefix($0.path) }
        for (key,value) in HTTPCookie.requestHeaderFields(with:matching) { request.setValue(value,forHTTPHeaderField:key) }
        request.setValue(RemoteSpeakerClient.origin.absoluteString,forHTTPHeaderField:"Origin")
        request.setValue("XMLHttpRequest",forHTTPHeaderField:"X-Requested-With")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        let installationID = try RemoteSpeakerKeychain.installationID()
        request.httpBody = try JSONSerialization.data(withJSONObject:["installationID":installationID,"sessionID":sessionID])
        let config = URLSessionConfiguration.ephemeral;config.httpCookieStorage = nil;config.httpShouldSetCookies = false;config.timeoutIntervalForRequest = 10
        let http = URLSession(configuration:config,delegate:RemoteSpeakerNoRedirect(),delegateQueue:nil)
        defer { http.invalidateAndCancel() }
        let (bytes,response) = try await http.bytes(for:request)
        guard (response as? HTTPURLResponse)?.statusCode == 201 else { throw RemoteSpeakerError.unavailableCommand }
        var data = Data();for try await byte in bytes { guard data.count < 65536 else { throw RemoteSpeakerError.unavailableCommand };data.append(byte) }
        struct Grant: Decodable { let token:String;let expiresAt:Double;let sessionID:String }
        let grant = try JSONDecoder().decode(Grant.self,from:data)
        guard generation == epoch,grant.sessionID == sessionID else { throw RemoteSpeakerError.sessionChanged }
        let access = RemoteSpeakerAccess(token:grant.token,expiresAt:grant.expiresAt,sessionID:sessionID,scope:scope,installationID:installationID)
        try RemoteSpeakerKeychain.save(JSONEncoder().encode(access),account:"access")
    }
}
