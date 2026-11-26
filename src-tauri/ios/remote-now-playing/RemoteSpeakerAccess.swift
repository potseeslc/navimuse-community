import Foundation
import Security

struct RemoteSpeakerAccess: Codable, Equatable {
    let token: String
    let expiresAt: Double
    let sessionID: String
    let scope: String
    let installationID: String
}

enum RemoteSpeakerKeychain {
    static let service = "com.developer.navimuse.remote-now-playing"
    static func query(_ account: String) throws -> [String: Any] {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "NaviMuseRemoteKeychainAccessGroup") as? String,
              !group.isEmpty, !group.contains("$(") else { throw AccessError.unavailable }
        return [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,
                kSecAttrAccount as String:account,kSecAttrAccessGroup as String:group]
    }
    static func read(_ account: String) throws -> Data? {
        var q = try query(account); q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw AccessError.unavailable }
        return data
    }
    static func save(_ data: Data, account: String) throws {
        let q = try query(account)
        let attributes: [String: Any] = [kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary,nil) == errSecSuccess else { throw AccessError.unavailable }
        } else if status != errSecSuccess { throw AccessError.unavailable }
    }
    static func clear() throws {
        let status = SecItemDelete(try query("access") as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw AccessError.unavailable }
    }
    static func access(sessionID: String? = nil) throws -> RemoteSpeakerAccess {
        guard let data = try read("access") else { throw AccessError.expired }
        let access = try JSONDecoder().decode(RemoteSpeakerAccess.self,from:data)
        guard access.expiresAt > Date().timeIntervalSince1970*1000,
              sessionID == nil || access.sessionID == sessionID else { throw AccessError.expired }
        return access
    }
    static func installationID() throws -> String {
        if let data = try read("installation"), let value = String(data:data,encoding:.utf8), UUID(uuidString:value) != nil { return value }
        let value = UUID().uuidString.lowercased();try save(Data(value.utf8),account:"installation");return value
    }
    enum AccessError: Error { case unavailable, expired }
}
