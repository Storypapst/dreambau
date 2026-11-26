import AVFoundation
import Foundation
import SwiftUI

struct Word: Codable, Identifiable {
    let id: String
    let text: String
    let speech: String?
    let hint: String
    let tier: Int
    let traps: [String: String]
}

enum Phase: Equatable { case home, prompt, choosing, hint, done, paused, summary }

@MainActor
final class Practice: ObservableObject {
    private let synth = AVSpeechSynthesizer()
    private var player: AVAudioPlayer?
    private lazy var recordings: [String: Data] = {
        guard let url = Bundle.main.url(forResource: "audio", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: Data].self, from: data)) ?? [:]
    }()
    private let defaults = UserDefaults.standard
    private(set) var catalog: [Word] = []
    private var recent: [String] = []
    private var reviewed: Set<String> = []
    private var assisted = false
    private var cleanReview = 0
    private var previous = Phase.choosing
    private var attempts: [String: Events] = [:]
    @Published private(set) var profiles: [String: String] = [:]
    @Published private(set) var active = ""
    @Published var phase = Phase.home
    @Published var task: Word?
    @Published var options: [String] = []
    @Published var cursor = 0
    @Published var words = 0
    @Published var seconds = 85
    @Published var review = false
    @Published var feedback = ""
    @Published var fallback = ""
    @Published var syncMessage = ""
    @Published var syncing = false
    @Published var storageMessage = ""
    @Published var award = 0
    @Published var tiles: [String] = []
    @Published var used: [Int] = []

    var arranged: String { used.map { tiles[$0] }.joined() }

    init() {
        if let url = Bundle.main.url(forResource: "catalog", withExtension: "json") {
            do { catalog = try JSONDecoder().decode([Word].self, from: Data(contentsOf: url)) }
            catch { storageMessage = "Der Wortschatz konnte nicht gelesen werden." }
        } else { storageMessage = "Der Wortschatz fehlt." }
        profiles = defaults.dictionary(forKey: "learner.names") as? [String: String] ?? [:]
        let stored = defaults.string(forKey: "learner.active") ?? ""
        if profiles.isEmpty { addProfile("Gast") }
        else { active = profiles[stored] != nil ? stored : profiles.keys.sorted()[0] }
        for id in profiles.keys {
            if let data = defaults.data(forKey: "ledger." + id) {
                do {
                    guard let ledger = try JSONSerialization.jsonObject(with: data) as? Events else { throw SyncFailure("") }
                    attempts[id] = ledger
                } catch {
                    storageMessage = "Ein gespeicherter Lernstand war beschädigt. Eine Kopie ist auf dem Gerät gesichert."
                    defaults.set(data, forKey: "ledger.recovery." + id)
                }
            }
        }
    }

    func addProfile(_ raw: String) {
        let name = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        guard !name.isEmpty else { return }
        if let existing = profiles.first(where: { $0.value.localizedCaseInsensitiveCompare(name) == .orderedSame }) {
            select(existing.key)
            return
        }
        let id = UUID().uuidString
        profiles[id] = name
        defaults.set(profiles, forKey: "learner.names")
        select(id)
    }

    func select(_ id: String) {
        guard profiles[id] != nil else { return }
        active = id
        defaults.set(id, forKey: "learner.active")
        syncMessage = ""
    }

    private var ledger: Events { attempts[active] ?? [:] }

    private func save(_ id: String) {
        do { defaults.set(try JSONSerialization.data(withJSONObject: attempts[id] ?? [:]), forKey: "ledger." + id) }
        catch { storageMessage = "Der Lernstand konnte nicht gespeichert werden." }
    }

    private func event(_ value: [String: Any]) {
        var entry = value
        entry["at"] = Int(Date().timeIntervalSince1970 * 1000)
        attempts[active, default: [:]][UUID().uuidString.lowercased()] = entry
        save(active)
    }

    private var awards: [String: Int] {
        let spent = Set(ledger.values.filter { $0["type"] as? String == "redeem" }
            .flatMap { $0["awards"] as? [String] ?? [] })
        return ledger.reduce(into: [:]) { result, pair in
            if !spent.contains(pair.key), pair.value["type"] as? String == "award",
               let seconds = pair.value["seconds"] as? Int, seconds > 0 {
                result[pair.key] = seconds
            }
        }
    }
    var availableBonus: Int { awards.values.reduce(0, +) }

    private var latest: [String: (time: Int, correct: Bool)] {
        var result: [String: (time: Int, correct: Bool)] = [:]
        for (_, entry) in ledger.sorted(by: { $0.key < $1.key }) {
            guard entry["type"] as? String == "answer", entry["assisted"] as? Bool != true, let id = entry["taskId"] as? String,
                  let at = entry["at"] as? Int, let correct = entry["correct"] as? Bool else { continue }
            if at >= (result[id]?.time ?? -1) { result[id] = (at, correct) }
        }
        return result
    }

    func start(practice: Bool) {
        guard !catalog.isEmpty else { return }
        review = practice
        phase = .prompt
        words = 0
        cleanReview = 0
        award = 0
        recent.removeAll()
        reviewed.removeAll()
        let bank = awards
        seconds = 85
        if !practice && !bank.isEmpty {
            seconds += bank.values.reduce(0, +)
            event(["type":"redeem", "awards":Array(bank.keys)])
        }
        nextWord()
    }

    func nextWord() {
        let last = latest
        let independent = Set(ledger.values.compactMap { e -> String? in
            guard e["type"] as? String == "answer", e["correct"] as? Bool == true,
                  e["review"] as? Bool != true, e["assisted"] as? Bool != true else { return nil }
            return e["taskId"] as? String
        })
        let clean = catalog.filter { independent.contains($0.id) }
        let tier = clean.filter { $0.tier == 1 }.count < 8 ? 1 : (clean.filter { $0.tier == 2 }.count < 12 ? 2 : 3)
        var candidates = catalog.filter { word in
            review ? (last[word.id]?.correct == false && !reviewed.contains(word.id)) : word.tier <= tier
        }
        guard !candidates.isEmpty else { finish(); return }
        let fresh = candidates.filter { !recent.contains($0.id) }
        if !fresh.isEmpty { candidates = fresh }
        let missed = candidates.filter { last[$0.id]?.correct == false }
        if !missed.isEmpty { candidates = missed }
        guard let item = candidates.randomElement() else { return }
        task = item
        recent.append(item.id)
        if recent.count > 6 { recent.removeFirst() }
        if review { reviewed.insert(item.id) }
        cursor = 0
        assisted = false
        phase = .prompt
        if review { prepareTiles() } else { setOptions() }
        speak(slow: false)
    }

    private func setOptions() {
        guard let task else { return }
        let correct = String(Array(task.text)[cursor])
        let extras = (task.traps[String(cursor)] ?? "").map(String.init)
        let pool = extras + "aeinrstldgpmubkowfvhzcjüäö".map(String.init).shuffled()
        var choices = [correct]
        for c in pool {
            let candidate = correct == correct.uppercased() ? c.uppercased() : c.lowercased()
            if candidate.count == 1 && !choices.contains(candidate) { choices.append(candidate) }
            if choices.count == 3 { break }
        }
        options = choices.shuffled()
    }

    func choose(_ letter: String) {
        guard !review, phase == .choosing, let task, options.contains(letter) else { return }
        let expected = String(Array(task.text)[cursor])
        if expected != letter {
            seconds = max(0, seconds - 2)
            assisted = true
            event(["type":"answer", "taskId":task.id, "correct":false,
                   "given":letter, "expected":expected, "index":cursor, "review":review])
            feedback = "\(letter) → \(expected)"
            phase = .hint
            speak(slow: true)
            return
        }
        cursor += 1
        if cursor == task.text.count {
            words += 1
            if !assisted {
                event(["type":"answer", "taskId":task.id, "correct":true, "review":review])
            }
            if !review { seconds += 4 }
            phase = .done
            silence()
        } else { setOptions() }
    }

    private func prepareTiles() {
        guard let task else { return }
        used = []
        tiles = task.text.map(String.init).shuffled()
        if tiles.joined() == task.text && tiles.count > 1 {
            let first = tiles.removeFirst()
            tiles.append(first)
        }
    }
    func submit() {
        guard phase == .choosing, review, let task, used.count == tiles.count else { return }
        let answer = Array(arranged)
        let expected = Array(task.text)
        if let i = answer.indices.first(where: { answer[$0] != expected[$0] }) {
            assisted = true
            event(["type":"answer", "taskId":task.id, "correct":false, "review":true,
                   "given":String(answer[i]), "expected":String(expected[i]), "index":i])
            feedback = String(answer[i]) + " → " + String(expected[i])
            phase = .hint
            speak(slow: true)
        } else {
            if !assisted {
                event(["type":"answer", "taskId":task.id, "correct":true, "review":true])
                cleanReview += 1
            }
            words += 1
            phase = .done
            silence()
        }
    }
    func retry() {
        if !review && seconds == 0 { finish(); return }
        if review { prepareTiles() } else { setOptions() }
        phase = .choosing
    }
    func tick() {
        if phase == .choosing && !review {
            seconds = max(0, seconds - 1)
            if seconds == 0 { finish() }
        }
    }
    func pause() {
        guard [.choosing, .hint, .prompt, .done].contains(phase) else { return }
        previous = phase
        phase = .paused
        silence()
    }
    func resume() {
        phase = previous
        if phase == .prompt || phase == .choosing || phase == .hint { speak(slow: phase == .hint) }
    }
    func finish() {
        if phase == .summary { return }
        silence()
        phase = .summary
        if review && cleanReview > 0 {
            award = cleanReview * 5 * (cleanReview >= 5 ? 3 : cleanReview == 4 ? 2 : 1)
            event(["type":"award", "seconds":award])
        }
    }

    private func silence() { player?.stop(); synth.stopSpeaking(at: .immediate) }
    func speak(slow: Bool) {
        guard let task else { return }
        silence()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        fallback = ""
        if let bytes = recordings[task.id], let clip = try? AVAudioPlayer(data: bytes) {
            player = clip
            clip.enableRate = true
            clip.rate = slow ? 0.75 : 1.0
            if clip.play() { return }
        }
        guard let voice = AVSpeechSynthesisVoice(language: "de-DE") else {
            fallback = review || phase == .hint ? "Lies: " + task.text : "Sprachausgabe nicht verfügbar."
            return
        }
        let utterance = AVSpeechUtterance(string: task.speech ?? task.text)
        utterance.voice = voice
        utterance.rate = slow ? 0.35 : 0.44
        synth.speak(utterance)
    }

    func importProfile(_ url: URL) throws -> String? {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let bytes = try Data(contentsOf: url)
        guard bytes.count <= 8_000_000,
              let file = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              file["format"] as? String == "kieselalarm-profile", file["version"] as? Int == 1,
              let id = file["id"] as? String, UUID(uuidString: id) != nil,
              let name = file["name"] as? String, !name.isEmpty,
              let progress = file["progress"] as? [String: Any], progress["version"] as? Int == 1,
              let imported = progress["events"] as? Events else {
            throw SyncFailure("Diese Datei enthält kein gültiges Kieselalarm-Profil.")
        }
        var endpoint: String?
        if let server = file["server"] as? [String: Any] {
            guard let origin = server["origin"] as? String, let profileID = server["profileId"] as? String,
                  let token = server["token"] as? String else { throw SyncFailure("Der Serverzugang ist unvollständig.") }
            try CloudSync.importLogin(origin: origin, localID: id, profileID: profileID, token: token)
            endpoint = origin
        }
        profiles[id] = String(name.prefix(40))
        attempts[id, default: [:]].merge(imported) { existing, _ in existing }
        save(id)
        defaults.set(profiles, forKey: "learner.names")
        select(id)
        syncMessage = "Profil importiert."
        return endpoint
    }

    func synchronize(origin: String) async {
        guard !syncing else { return }
        syncing = true
        let id = active
        defer { syncing = false }
        do {
            let union = try await CloudSync.merge(origin: origin, localID: id, local: attempts[id] ?? [:])
            attempts[id, default: [:]].merge(union) { _, server in server }
            save(id)
            syncMessage = "Lernstand abgeglichen."
        } catch {
            syncMessage = error.localizedDescription
        }
    }
}
