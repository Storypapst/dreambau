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
    summary: "Vom Feature Request bis zum menschlich freigegebenen Dev-Stand.",
    problem: "Verhindert, dass KI schnell Code erzeugt, aber Entscheidungsgrund, Testbeweis und Verantwortlichkeit verloren gehen.",
    projects: ["oriso"],
    diagram: `flowchart LR
      A["Feature Request"] --> B["Wayfinder Dialog"]
      B --> C["Grill with Docs"]
      C --> D["ADR"]
      D --> E["Specs"]
      E --> F["Parent Issue + Sub-Issues"]
      F --> G["Draft PR"]
      G --> H["Self Review"]
      H --> I["Pre-Dev E2E"]
      I --> J["Human Dev Gate"]
      J --> K["Dev Smoke + E2E"]`,
    details: [
      { title: "Feature Request", description: "Hält Problem, Nutzerwert und erwartetes Ergebnis in GitHub fest." },
      { title: "ADR", description: "Dokumentiert die tragende Entscheidung samt Alternativen und Folgen auf einer Zeitachse." },
      { title: "Parent Issue + Sub-Issues", description: "Teilt die freigegebene Spezifikation in kleine, überprüfbare Arbeitspakete." },
      { title: "Draft PR", description: "Verbindet Code, Tests, Issue-Status und Reviewbeweis ohne automatischen Merge." },
      { title: "Pre-Dev E2E", description: "Beweist die Funktion auf dem internen Quality Gate mit echten Browserabläufen." },
      { title: "Human Dev Gate", description: "Ein Mensch entscheidet über den Übergang in das kundenzeigbare Dev-Staging." },
      { title: "Dev Smoke + E2E", description: "Prüft nach dem Merge erneut die tatsächlich laufende Umgebung." }
    ],
    resources: [
      { kind: "rule", title: "AGENTS.md Router", description: "Lädt globale, projekt- und repositoryspezifische Regeln progressiv." },
      { kind: "prompt", title: "Issue Prompt", description: "Kanonische Vorlage für Feature Requests, Bugs und Sub-Issues." },
      { kind: "adr", title: "ADR Timeline", description: "Chronologische Architekturentscheidungen mit aktuellem Gültigkeitsstatus." },
      { kind: "observability", title: "SigNoz", description: "Traces, Logs, Metriken und Alerts für Pre-Dev und Dev.", url: "https://signoz.oriso-dev.site" },
      { kind: "tool", title: "Understand Anything", description: "Durchsuchbarer Wissensgraph und Projektfragen über API." }
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
      { kind: "adr", title: "ADR Timeline", description: "Betriebs- und Architekturentscheidungen mit Links zum Diskussionskontext." },
      { kind: "observability", title: "SigNoz", description: "Gemeinsamer Einstieg zu Live-Systemzuständen.", url: "https://signoz.oriso-dev.site" },
      { kind: "tool", title: "Understand Anything", description: "Projektwissen und Fragen per API." }
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
