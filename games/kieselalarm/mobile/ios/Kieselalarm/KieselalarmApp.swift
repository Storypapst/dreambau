import Combine
import SwiftUI
import UniformTypeIdentifiers

@main
struct KieselalarmApp: App {
    @StateObject private var practice = Practice()
    var body: some Scene {
        WindowGroup { PracticeScreen(game: practice) }
    }
}

private struct PracticeScreen: View {
    @ObservedObject var game: Practice
    @Environment(\.scenePhase) private var scene
    @State private var showProfiles = false
    @State private var nickname = ""
    @State private var importing = false
    @AppStorage("kieselalarm.server") private var origin = ""
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let leaf = Color(red: 0.72, green: 0.94, blue: 0.65)

    var body: some View {
        ZStack {
            Color(red: 0.07, green: 0.15, blue: 0.13).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 22) {
                    if game.phase == .home { home }
                    else if game.phase == .summary { summary }
                    else { field }
                    if !game.storageMessage.isEmpty {
                        Text(game.storageMessage).font(.footnote)
                    }
                }
                .frame(maxWidth: 540)
                .padding(24)
                .frame(maxWidth: .infinity)
            }
        }
        .preferredColorScheme(.dark)
        .foregroundStyle(.white)
        .tint(leaf)
        .buttonStyle(.bordered)
        .controlSize(.large)
        .sheet(isPresented: $showProfiles) { profiles }
        .onReceive(timer) { _ in game.tick() }
        .onChange(of: scene) { phase in if phase != .active { game.pause() } }
    }

    private var home: some View {
        VStack(spacing: 22) {
            AntBadge().frame(width: 120, height: 100).accessibilityHidden(true)
            Text("Kieselalarm").font(.largeTitle.bold())
            Text("Hör dir das Wort an und setze es Buchstabe für Buchstabe zusammen.")
                .multilineTextAlignment(.center)
            Button("Strecke starten") { game.start(practice: false) }
                .buttonStyle(.borderedProminent).disabled(game.catalog.isEmpty)
            Button("Fehlerwörter üben") { game.start(practice: true) }
            if game.availableBonus > 0 { Text("+\(game.availableBonus) Sekunden für deine nächste Strecke") }
            Button { showProfiles = true } label: {
                Label(game.profiles[game.active] ?? "Lernprofil", systemImage: "person.crop.circle")
            }
        }.padding(.vertical, 28)
    }

    @ViewBuilder private var field: some View {
        if game.phase == .paused {
            Text("Pause").font(.largeTitle.bold())
            Button("Weiterspielen") { game.resume() }.buttonStyle(.borderedProminent)
            Button("Runde beenden") { game.finish() }
        } else if let word = game.task {
            HStack {
                Text(game.review ? "Fehlerwörter" : "\(game.seconds) s")
                    .monospacedDigit()
                Spacer()
                Text("\(game.words) Wörter")
                Spacer()
                Button("Pause") { game.pause() }
            }.font(.headline)
            AntBadge().frame(width: 82, height: 72).accessibilityHidden(true)
            if !game.fallback.isEmpty { Text(game.fallback) }
            switch game.phase {
            case .prompt:
                Text("Hör genau hin.").font(.title.bold())
                Text("\(word.text.count) Buchstaben")
                audioButtons
                Button(game.review ? "Buchstaben ordnen" : "Buchstaben sammeln") { game.phase = .choosing }
                    .buttonStyle(.borderedProminent)
            case .choosing where game.review:
                Text(game.arranged.isEmpty ? "Ordne die Buchstaben." : game.arranged)
                    .font(.title.bold())
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 48))]) {
                    ForEach(game.tiles.indices, id: \.self) { i in
                        Button(game.tiles[i]) { game.used.append(i) }.disabled(game.used.contains(i))
                    }
                }
                Button("Letzten zurücknehmen") { if !game.used.isEmpty { game.used.removeLast() } }
                    .disabled(game.used.isEmpty)
                Button("Wort prüfen") { game.submit() }
                    .buttonStyle(.borderedProminent).disabled(game.used.count != game.tiles.count)
                audioButtons
            case .choosing:
                Text(Array(word.text).enumerated().map { $0.offset < game.cursor ? String($0.element) : "·" }.joined(separator: " "))
                    .font(.system(.title, design: .rounded).bold())
                    .accessibilityLabel("Buchstabe \(game.cursor + 1) von \(word.text.count)")
                HStack(spacing: 12) {
                    ForEach(game.options, id: \.self) { letter in
                        Button(letter) { game.choose(letter) }
                            .font(.title.bold()).frame(maxWidth: .infinity)
                            .accessibilityLabel("Buchstabe " + letter)
                    }
                }
                audioButtons
            case .hint:
                Text(game.feedback).font(.largeTitle.bold())
                Text(word.hint).multilineTextAlignment(.center)
                Button("Langsam anhören") { game.speak(slow: true) }
                Button("Noch einmal versuchen") { game.retry() }.buttonStyle(.borderedProminent)
            case .done:
                Text(word.text).font(.largeTitle.bold()).foregroundStyle(leaf)
                Button("Nächstes Wort") { game.nextWord() }.buttonStyle(.borderedProminent)
            default: EmptyView()
            }
        }
    }

    private var audioButtons: some View {
        HStack {
            Button { game.speak(slow: false) } label: { Label("Anhören", systemImage: "speaker.wave.2") }
            Button("Langsam") { game.speak(slow: true) }
        }
    }

    private var summary: some View {
        VStack(spacing: 18) {
            Text("Runde beendet").font(.largeTitle.bold())
            Text("\(game.words) Wörter geschafft")
            if game.award > 0 { Text("+\(game.award) Sekunden beim nächsten Start") }
            if !game.review {
                Button("Fehlerwörter sortieren") { game.start(practice: true) }
            }
            Button("Zur Übersicht") { game.phase = .home }.buttonStyle(.borderedProminent)
        }.padding(.vertical, 70)
    }

    private var profiles: some View {
        NavigationStack {
            Form {
                Section("Lernprofil") {
                    ForEach(game.profiles.keys.sorted { (game.profiles[$0] ?? "") < (game.profiles[$1] ?? "") }, id: \.self) { id in
                        Button { game.select(id) } label: {
                            HStack {
                                Text(game.profiles[id] ?? "")
                                Spacer()
                                if game.active == id { Image(systemName: "checkmark") }
                            }
                        }
                    }
                    TextField("Neuer Spitzname", text: $nickname)
                    Button("Profil anlegen") { game.addProfile(nickname); nickname = "" }
                        .disabled(nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Profildatei importieren") { importing = true }
                }.disabled(game.syncing)
                Section {
                    TextField("https://dein-server.de", text: $origin)
                        .keyboardType(.URL).autocorrectionDisabled().textInputAutocapitalization(.never)
                    Button(game.syncing ? "Abgleich läuft …" : "Lernstand abgleichen") {
                        Task { await game.synchronize(origin: origin) }
                    }.disabled(game.syncing || origin.isEmpty)
                    if !game.syncMessage.isEmpty { Text(game.syncMessage).font(.footnote) }
                } header: { Text("Eigener Kieselalarm-Server") } footer: {
                    Text("Beim ersten Abgleich legt die App auf diesem Server ein anonymes Profil an. Dein Spitzname bleibt auf dem Gerät.")
                }
            }
            .navigationTitle("Profile")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                do {
                    if let endpoint = try game.importProfile(result.get()) { origin = endpoint }
                } catch { game.syncMessage = error.localizedDescription }
            }
            .toolbar { Button("Fertig") { showProfiles = false } }
        }
    }
}

private struct AntBadge: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 120, size.height / 100)
            context.translateBy(x: size.width / 2, y: size.height / 2)
            context.scaleBy(x: scale, y: scale)
            let copper = Color(red: 0.96, green: 0.64, blue: 0.40)
            for side in [CGFloat(-1), CGFloat(1)] {
                for index in 0..<3 {
                    let y = CGFloat(index * 8 - 8)
                    var leg = Path()
                    leg.move(to: CGPoint(x: side * 6, y: y))
                    leg.addLine(to: CGPoint(x: side * 21, y: y * 1.4))
                    leg.addLine(to: CGPoint(x: side * 28, y: y * 1.8 + 4))
                    context.stroke(leg, with: .color(copper), lineWidth: 3)
                }
                var antenna = Path()
                antenna.move(to: CGPoint(x: side * 4, y: -16))
                antenna.addLine(to: CGPoint(x: side * 17, y: -34))
                context.stroke(antenna, with: .color(copper), lineWidth: 2)
            }
            for (y, r) in [(CGFloat(15), CGFloat(12)), (0, 8), (-15, 11)] {
                context.fill(Path(ellipseIn: CGRect(x: -r, y: y-r, width: 2*r, height: 2*r)), with: .color(copper))
            }
        }
    }
}
