export type CoordinationProject = "oriso" | "orimo" | "dreambau";
export type CoordinationResourceKind = "prompt" | "rule" | "adr" | "observability" | "tool";

export interface CoordinationResource {
  kind: CoordinationResourceKind;
  title: string;
  description: string;
  url?: string;
}

export interface CoordinationItem {
  id: string;
  title: string;
  summary: string;
  problem: string;
  projects: CoordinationProject[];
  diagram?: string;
  details: Array<{ title: string; description: string }>;
  resources: CoordinationResource[];
}

const projects = [
  {
    id: "oriso" as const,
    name: "ORISO",
    description: "Beratungsplattform mit Pre-Dev- und Dev-Qualitätsgates."
  },
  {
    id: "orimo" as const,
    name: "ORIMO",
    description: "Eigenständiger Projektkontext mit isolierten Regeln und Testdaten."
  },
  {
    id: "dreambau" as const,
    name: "Dreambau",
    description: "Gemeinsame Betriebsplattform für Testzugang, Secrets und Automatisierung."
  }
];

const items: CoordinationItem[] = [
  {
    id: "oriso-delivery",
    title: "ORISO Delivery",
    summary: "Ablaufhilfe vom GitHub-Ticket bis zum bestätigten Test auf Dev.",
    problem: "Ein Review, ein Merge, ein laufendes Deployment und ein bestandener Test sind getrennte Nachweise. Den aktuellen Ticketstand zeigt das ORISO Roadmap-Board.",
    projects: ["oriso"],
    diagram: `flowchart LR
      A["GitHub issue"] --> B["PR against dev"]
      B --> C["Human review and merge"]
      C --> D["Confirm deployment"]
      D --> E["Verify on Dev"]`,
    details: [
      { title: "Ticket klären", description: "Problem, Ziel und überprüfbares Ergebnis im GitHub-Ticket festhalten." },
      { title: "Änderung vorbereiten", description: "Von dev abzweigen, lokal prüfen und einen Pull Request gegen dev mit Testbelegen und Reviewern öffnen." },
      { title: "Review und Merge", description: "Ein Mensch prüft die Änderung und entscheidet, ob und wann der Pull Request gemergt wird." },
      { title: "Deployment abgleichen", description: "Prüfen, welches Image tatsächlich auf Dev läuft." },
      { title: "Auf Dev nachtesten", description: "Die betroffene Funktion in der laufenden Umgebung prüfen und das Ergebnis im Ticket festhalten." }
    ],
    resources: [
      { kind: "tool", title: "ORISO Roadmap", description: "Aktuelle Tickets und ihre Zustände.", url: "https://github.com/orgs/OpenResilienceInitiative/projects/1" },
      { kind: "tool", title: "Understand Anything", description: "ORISO-Plattformgraph, Repositories und ihre Zusammenhänge.", url: "https://understand.oriso.org/" },
      { kind: "observability", title: "SigNoz Dev", description: "Traces, Logs und Metriken für ORISO Dev.", url: "https://signoz.oriso.org" },
      { kind: "rule", title: "AGENTS.md Router", description: "Lädt globale, projekt- und repositoryspezifische Regeln progressiv." },
      { kind: "prompt", title: "Issue Prompt", description: "Vorlage für Feature Requests, Bugs und Sub-Issues." },
      { kind: "adr", title: "ADR Timeline", description: "Chronologische Architekturentscheidungen mit aktuellem Gültigkeitsstatus." }
    ]
  },
  {
    id: "dreambau-platform",
    title: "Dreambau Platform",
    summary: "Zentrale Betriebswerkzeuge für Menschen und Agenten.",
    problem: "Beseitigt verstreute Zugangsdaten, lokale Sonderwege und unsichtbare Betriebszustände.",
    projects: ["dreambau"],
    details: [
      { title: "Test Access", description: "Projekt- und umgebungsbegrenzte Testidentitäten ohne Passwörter in Prompts." },
      { title: "Infisical", description: "Zentrale Secret-Verwaltung für Menschen und Maschinenidentitäten." },
      { title: "Kio", description: "Review- und Bugfix-Orchestrator mit menschlichem PR-Gate." }
    ],
    resources: [
      { kind: "tool", title: "Testkonten", description: "Passkey-geschütztes Verzeichnis und Machine API.", url: "/testmails/" },
      { kind: "tool", title: "Infisical", description: "Self-hosted Secret Management.", url: "https://secrets.dreambau.com" },
      { kind: "tool", title: "Kio Bugfix", description: "Slack Intake, private Artefakte und Draft-PR-Automation.", url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7" },
      { kind: "rule", title: "Project Router", description: "Trennt Dreambau-, ORISO-, ORIMO- und private Kontexte." },
      { kind: "prompt", title: "Prompt Registry", description: "Source of Truth für Systemprompts, Skills und Toolregeln." },
      { kind: "adr", title: "ADR Timeline", description: "Betriebs- und Architekturentscheidungen mit Links zum Diskussionskontext." }
    ]
  },
  {
    id: "orimo-delivery",
    title: "ORIMO Delivery",
    summary: "Isolierter Delivery- und Wissenskontext für ORIMO.",
    problem: "Verhindert, dass ORISO- oder private Informationen in ORIMO-Agentenkontext gelangen.",
    projects: ["orimo"],
    details: [{ title: "Projektisolation", description: "Eigene Regeln, Repositories, Secrets und Testidentitäten." }],
    resources: [{ kind: "rule", title: "ORIMO AGENTS.md", description: "Projektlokaler Router für den ORIMO-Kontext." }]
  }
];

export const coordinationItemIds = items.map((item) => item.id);

export function coordinationItemById(itemId: string) {
  return items.find((item) => item.id === itemId);
}

export function coordinationForProjects(allowedProjects: CoordinationProject[]) {
  const allowed = new Set(allowedProjects);
  const scopedItems = items.filter((item) => item.projects.some((project) => allowed.has(project)));
  return {
    projects: projects.filter((project) => allowed.has(project.id)),
    items: scopedItems,
    resourceKinds: [...new Set(scopedItems.flatMap((item) => item.resources.map((resource) => resource.kind)))]
  };
}
