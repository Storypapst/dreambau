import Foundation
import Security

/// The opaque ledger retains event types written by other clients during a merge.
typealias Events = [String: [String: Any]]

struct SyncFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

private struct Login: Codable {
    let profileId: String
    let token: String
}

private final class RefuseRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum CloudSync {
    private static let session = URLSession(configuration: .ephemeral, delegate: RefuseRedirects(), delegateQueue: nil)

    private static func profilesURL(_ origin: String) throws -> URL {
        guard let parts = URLComponents(string: origin.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", parts.host != nil, parts.user == nil,
              parts.password == nil, parts.query == nil, parts.fragment == nil,
              ["", "/"].contains(parts.path), let base = parts.url else {
            throw SyncFailure("Gib die HTTPS-Adresse des Kieselalarm-Servers ein.")
        }
        return base.appendingPathComponent("api/v1/profiles")
    }

    private static func lookup(_ localID: String, _ api: URL) -> [String: Any] {
        let account = [localID, api.absoluteString].joined(separator: "/")
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "Kieselalarm.sync.v1",
            kSecAttrAccount as String: account
        ]
    }

    static func importLogin(origin: String, localID: String, profileID: String, token: String) throws {
        guard UUID(uuidString: profileID) != nil, token.count >= 32, token.count <= 256,
              token.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else {
            throw SyncFailure("Der Serverzugang in der Datei ist ungültig.")
        }
        let query = lookup(localID, try profilesURL(origin))
        let data = try JSONEncoder().encode(Login(profileId: profileID, token: token))
        var item = query
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        item[kSecValueData as String] = data
        let added = SecItemAdd(item as CFDictionary, nil)
        if added == errSecDuplicateItem {
            guard SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess
            else { throw SyncFailure("Der Schlüsselbund konnte den Zugang nicht aktualisieren.") }
        } else if added != errSecSuccess {
            throw SyncFailure("Der Schlüsselbund konnte den Zugang nicht speichern.")
        }
    }

    static func merge(origin: String, localID: String, local: Events) async throws -> Events {
        let api = try profilesURL(origin)
        let query = lookup(localID, api)
        var read = query
        read[kSecReturnData as String] = true
        var found: CFTypeRef?
        let result = SecItemCopyMatching(read as CFDictionary, &found)
        let login: Login
        if result == errSecSuccess, let data = found as? Data {
            login = try JSONDecoder().decode(Login.self, from: data)
        } else if result == errSecItemNotFound {
            let (_, obj) = try await request(api, "POST", body: [:], expected: [201])
            guard let id = obj["profileId"] as? String, let token = obj["token"] as? String else {
                throw SyncFailure("Der Server hat kein Profil zurückgegeben.")
            }
            login = Login(profileId: id, token: token)
            var item = query
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            item[kSecValueData as String] = try JSONEncoder().encode(login)
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
                throw SyncFailure("Der Schlüsselbund konnte den Zugang nicht speichern.")
            }
        } else {
            throw SyncFailure("Der Schlüsselbund ist gerade nicht verfügbar.")
        }
        let path = api.appendingPathComponent(login.profileId).appendingPathComponent("progress")
        var (_, snapshot) = try await request(path, "GET", token: login.token, expected: [200])
        var combined = local
        for _ in 0..<4 {
            guard let revision = snapshot["revision"] as? Int, let progress = snapshot["progress"] as? [String: Any] else {
                throw SyncFailure("Der Server hat einen unbekannten Lernstand zurückgegeben.")
            }
            if !progress.isEmpty {
                guard progress["version"] as? Int == 1, let remote = progress["events"] as? Events else {
                    throw SyncFailure("Dieser Lernstand benötigt eine neuere App-Version.")
                }
                combined.merge(remote) { _, server in server }
            }
            let payload: [String: Any] = ["revision": revision, "progress": ["version": 1, "events": combined]]
            let (code, response) = try await request(path, "PUT", token: login.token, body: payload, expected: [200, 409])
            if code == 200 { return combined }
            snapshot = response
        }
        throw SyncFailure("Das Profil wurde gleichzeitig geändert. Bitte gleiche es erneut ab.")
    }

    private static func request(_ url: URL, _ method: String, token: String? = nil,
                                body: [String: Any]? = nil, expected: [Int]) async throws -> (Int, [String: Any]) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode, expected.contains(status),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SyncFailure("Der Server konnte den Lernstand nicht abgleichen.")
        }
        return (status, json)
    }
}
