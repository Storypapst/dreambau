import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ContactRoundIcon, DownloadIcon, MailIcon, FilterXIcon, LanguagesIcon, ListChecksIcon, LogOutIcon, RouteIcon, SearchIcon, SlidersHorizontalIcon, StarIcon, MoreHorizontalIcon, FlaskConicalIcon } from "lucide-react";
import { DEFAULT_FILTERS, countActiveFilters, domainList, domainValues, fixtureValues, initialFilters, lifecycleValues, readFiltersFromLocation, saveLastFilters, toggleDomain, writeFiltersToLocation, type FilterState } from "@/filter-state";
import { api } from "@/api";
import { distinctRoleOptions, labelConversation, labelFixture, labelLifecycle, canonicalRole, labelLinkedEnvironment, labelProject, labelRole, labelTopic, roleSearchTerms, t, type Locale } from "@/i18n";
import { domainClass, sortAccountsForWork } from "@/presentation";
import { loginTargetsEndpoint, type LoginTarget, type ProjectLoginTargets } from "./account-login-target";
import { accountAccessDate } from "./account-context-display";
import { accountPasswordDate, accountTestProject, conversationTypesEndpoint, type ProjectConversationTypes } from "./account-test-context";
import { SearchHistory, rememberSearchPhrase } from "./search-history";
import { SearchSelection } from "./search-selection";
import { AccountCard } from "./account-card";
import { AccountDetailSheet } from "./account-detail-sheet";
import { AccountTable } from "./account-table";
import { AccountRowSummary } from "./account-row-summary";
import { FavoriteButton } from "./favorite-button";
import { useFavoriteDisplay, useFavorites } from "@/favorites";
import { FavoriteAccountView } from "./favorite-account-view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MetadataEditor } from "./metadata-editor";
import { DeleteCandidateCleanup } from "./delete-candidate-cleanup";
import { TaxonomySettings } from "./taxonomy-settings";
import { VersionBulkAction } from "./version-bulk-action";
import { MultiSelect } from "./multi-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { teamProjects, type AccountMetadata, type AccountView, type HumanEntitlements, type LinkedTestAccount, type Taxonomies, type TeamProject } from "@/types";
import { SelectedTags } from "./selected-tags";
import { EmployeeManagement } from "./employee-management";
import { PasskeyManager } from "./passkey-manager";
import { FilterPresets } from "./filter-presets";
import { CoordinationDashboard } from "./coordination-dashboard";
import { ReleaseListPage } from "./release-list";
import { EvidenceWorkspace } from "./evidence-workspace";
import { AccountRunLinks } from "./account-run-links";
import { directoryRoute, workspaceProject } from "@/directory-route";

const searchLanguages: Locale[] = ["de", "en"];
const projectNames = { oriso: "ORISO", orimo: "ORIMO", dreambau: "Dreambau" } as const;
const projectFilters = { oriso: "ORISO", orimo: "ORIMO", dreambau: "DREAMBAU" } as const;
const WEBMAIL_URL = "https://mail.dreambau.com/";

export function AccountDirectory({ initialAccounts, initialTaxonomies, locale, onLocaleChange, onLogout, isAdmin, canManagePasskeys, entitlements, projects }: { initialAccounts: AccountView[]; initialTaxonomies: Taxonomies; locale: Locale; onLocaleChange: (locale: Locale) => void; onLogout: () => void; isAdmin: boolean; canManagePasskeys: boolean; entitlements: HumanEntitlements; projects: TeamProject[] }) {
  const [showCoordination, setShowCoordination] = useState(false);
  // /testmails/releases is a shareable deep link; the server already answers it with the SPA shell.
  const [route, setRoute] = useState(() => directoryRoute(window.location.pathname));
  const [runProject, setRunProject] = useState(() => workspaceProject(window.location.search, projects));
  const accountsUrl = useRef("/testmails/");
  function setShowReleases(show: boolean) {
    // Coming back restores the account view with its filter query string.
    if (show) accountsUrl.current = window.location.pathname + window.location.search;
    window.history.pushState(null, "", show ? "/testmails/releases" : accountsUrl.current);
    setRoute(show ? "releases" : "accounts");
  }
  useEffect(() => {
    const onPopState = () => {
      setRoute(directoryRoute(window.location.pathname));
      setRunProject(workspaceProject(window.location.search, projects));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [projects]);
  const [catalog, setAccounts] = useState(initialAccounts);
  const [projectConversationTypes, setProjectConversationTypes] = useState<ProjectConversationTypes>({});
  const [projectLoginTargets, setProjectLoginTargets] = useState<ProjectLoginTargets>({});
  useEffect(() => {
    let active = true;
    for (const project of projects) {
      void api<{ values: string[] }>(conversationTypesEndpoint(project)).then((result) => {
        if (active) setProjectConversationTypes((current) => ({ ...current, [project]: result.values }));
      }).catch(() => {});
      void api<{ values: LoginTarget[] }>(loginTargetsEndpoint(project)).then((result) => {
        if (active) setProjectLoginTargets((current) => ({ ...current, [project]: result.values }));
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [projects]);
  const [taxonomies, setTaxonomies] = useState(initialTaxonomies);
  // Structured filters survive reload. Free-text search stays in the session.
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const { query, domain, status, quality, project, versionAfter, roles: roleFilters, topics: topicFilters, conversations: conversationFilters } = filters;
  const allowedProjects = teamProjects.filter((item) => projects.includes(item));
  const selectedProject = allowedProjects.find((item) =>
    projectFilters[item] === project || (item === "orimo" && project === "TRAIL.IST")
  ) ?? allowedProjects[0];
  const accounts = useMemo(() => catalog.filter((account) =>
    accountTestProject(account) === selectedProject
  ), [catalog, selectedProject]);
  const duplicateEmails = accounts.length - new Set(accounts.map((account) => account.email.trim().toLowerCase())).size;
  const encryptedCount = accounts.filter((account) => account.encryption?.state === "encrypted").length;
  const unencryptedCount = accounts.filter((account) => account.encryption?.state === "disabled").length;
  const patchFilters = (patch: Partial<FilterState>) => setFilters((current) => ({ ...current, ...patch }));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const setQuery = (value: string) => patchFilters({ query: value });
  function typeSearch(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    if (value.trim()) searchTimer.current = setTimeout(() => void rememberSearchPhrase(value, locale), 900);
  }
  const executeSearch = (value: string) => {
    const phrase = value.trim().replace(/\s+/g, " ");
    clearTimeout(searchTimer.current);
    setQuery(phrase);
    void rememberSearchPhrase(phrase, locale);
  };
  const setDomain = (value: string) => patchFilters({ domain: value });
  const { favorites, ready: favoritesReady, error: favoritesError, toggle: toggleFavoriteAccount, move: moveFavorite } = useFavorites();
  const favoriteDisplay = useFavoriteDisplay();
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const selectedDomains = domainList(domain);
  const advancedCount = [selectedDomains.length > 0, status !== "all", quality !== "all", versionAfter !== "", roleFilters.length > 0, topicFilters.length > 0, conversationFilters.length > 0].filter(Boolean).length;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const setStatus = (value: FilterState["status"]) => patchFilters({ status: value });
  const setQuality = (value: FilterState["quality"]) => patchFilters({ quality: value });
  const setVersionAfter = (value: string) => patchFilters({ versionAfter: value });
  const setRoleFilters = (update: string[] | ((current: string[]) => string[])) => setFilters((current) => ({ ...current, roles: typeof update === "function" ? update(current.roles) : update }));
  const setTopicFilters = (update: string[] | ((current: string[]) => string[])) => setFilters((current) => ({ ...current, topics: typeof update === "function" ? update(current.topics) : update }));
  const setConversationFilters = (update: string[] | ((current: string[]) => string[])) => setFilters((current) => ({ ...current, conversations: typeof update === "function" ? update(current.conversations) : update }));
  const activeFilterCount = countActiveFilters({ ...filters, project: "all" }) + (onlyFavorites ? 1 : 0);
  function resetFilters() { clearTimeout(searchTimer.current); setFilters({ ...DEFAULT_FILTERS, project }); setOnlyFavorites(false); }
  const onSpecialPage = () => directoryRoute(window.location.pathname) !== "accounts";
  useEffect(() => { if (onSpecialPage()) return; writeFiltersToLocation(filters); saveLastFilters(filters); }, [filters]);
  useEffect(() => {
    const onPopState = () => { if (!onSpecialPage()) setFilters(readFiltersFromLocation() ?? DEFAULT_FILTERS); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [selected, setSelected] = useState<AccountView | null>(null); const [detailOpen, setDetailOpen] = useState(false); const [editOpen, setEditOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => accounts.filter((account) => {
    const metadata = account.metadata;
    const loginTarget = projectLoginTargets[accountTestProject(account)]?.find((target) => target.url === metadata.loginTargetUrl);
    const searchable = [
      account.displayName, account.email, account.domain,
      metadata.shippedVersion, metadata.shippedVersion && `v${metadata.shippedVersion}`,
      metadata.lifecycleStatus, metadata.project, metadata.fixtureQuality,
      metadata.notes, metadata.documentedUsername, metadata.carrier, metadata.postalCode, metadata.supervisor,
      loginTarget?.label, metadata.loginTargetUrl, ...(metadata.agencies ?? []),
      ...metadata.topics, ...metadata.conversationTypes,
      ...metadata.roles.flatMap(roleSearchTerms),
      ...searchLanguages.flatMap((language) => [
        accountPasswordDate(account, language), accountAccessDate(account, language)?.value, labelLifecycle(language, metadata.lifecycleStatus),
        labelProject(language, metadata.project), labelFixture(language, metadata.fixtureQuality),
        ...metadata.topics.map((topic) => labelTopic(language, topic)),
        ...metadata.conversationTypes.map((type) => labelConversation(language, type))
      ]),
      ...(account.linkedAccess ?? []).filter((access) => !access.deleted).flatMap((access) => [
        access.username, access.environment, ...searchLanguages.map((language) => labelLinkedEnvironment(language, [access])),
        ...access.roles.flatMap(roleSearchTerms)
      ])
    ];
    const matchesSearch = searchable.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    const aboveVersion = !versionAfter || (account.metadata.shippedVersion && compareVersions(account.metadata.shippedVersion, versionAfter) > 0);
    return (selectedDomains.length === 0 || selectedDomains.includes(account.domain)) && (status === "all" || account.metadata.lifecycleStatus === status) && (quality === "all" || account.metadata.fixtureQuality === quality) && aboveVersion && roleFilters.every((item) => account.metadata.roles.some((role) => canonicalRole(role) === canonicalRole(item))) && topicFilters.every((item) => account.metadata.topics.includes(item)) && conversationFilters.every((item) => account.metadata.conversationTypes.includes(item)) && matchesSearch;
  }), [accounts, domain, status, quality, normalizedQuery, versionAfter, roleFilters, topicFilters, conversationFilters, projectLoginTargets]);
  const managedAccounts = useMemo(() => sortAccountsForWork(filtered), [filtered]);
  const visibleByEmail = useMemo(() => new Map(filtered.map((account) => [account.email, account])), [filtered]);
  const favoriteAccounts = useMemo(() => favorites.flatMap((email) => {
    const account = visibleByEmail.get(email);
    return account ? [account] : [];
  }), [favorites, visibleByEmail]);
  const visibleFavorites = useMemo(() => new Set(favoriteAccounts.map((account) => account.email)), [favoriteAccounts]);
  const visibleAccounts = onlyFavorites ? favoriteAccounts : managedAccounts;
  const [selectedRow, setSelectedRow] = useState<string | null | undefined>(() => {
    const match = /^#account=(.+)$/.exec(window.location.hash);
    try { return match ? decodeURIComponent(match[1]) : undefined; } catch { return undefined; }
  });
  const expandedEmail = selectedRow === null || visibleAccounts.some((account) => account.email === selectedRow)
    ? selectedRow ?? null
    : visibleAccounts[0]?.email ?? null;
  const toggleRow = (email: string) => setSelectedRow(expandedEmail === email ? null : email);
  const replaceMetadata = useCallback((metadata: AccountMetadata) => {
    const update = (account: AccountView) => account.email === metadata.email
      && (account.metadata.updatedAt ?? "") <= metadata.updatedAt ? { ...account, metadata } : account;
    setAccounts((current) => current.map(update));
    setSelected((current) => current ? update(current) : current);
  }, []);
  function updateProjectTypes(project: TeamProject, values: string[], previous?: string, value?: string) {
    setProjectConversationTypes((current) => ({ ...current, [project]: values }));
    if (!previous || !value) return;
    const update = (account: AccountView) => {
      if (accountTestProject(account) !== project || !account.metadata.conversationTypes.includes(previous)) return account;
      return { ...account, metadata: { ...account.metadata,
        conversationTypes: [...new Set(account.metadata.conversationTypes.map((type) => type === previous ? value : type))] } };
    };
    setAccounts((current) => current.map(update));
    setSelected((current) => current ? update(current) : current);
  }
  const contextOptions = {
    projectConversationTypes, onTypesChanged: updateProjectTypes, projectLoginTargets,
    onLoginTargetsChanged: (project: TeamProject, values: LoginTarget[]) =>
      setProjectLoginTargets((current) => ({ ...current, [project]: values }))
  };
  function detachLinkedAccess(linked: LinkedTestAccount, metadata: AccountMetadata) {
    const update = (account: AccountView): AccountView => {
      if (account.email.toLowerCase() !== linked.email.toLowerCase()) return account;
      const isResetLink = (record: LinkedTestAccount) => record.id === linked.id && record.linkRevision === linked.linkRevision;
      if (!account.linkedAccess?.some(isResetLink)) return account;
      return {
        ...account,
        linkedAccess: account.linkedAccess.filter((record) => !isResetLink(record)),
        metadata: account.metadata.updatedAt <= metadata.updatedAt ? metadata : account.metadata
      };
    };
    setAccounts((current) => current.map(update));
    setSelected((current) => current ? update(current) : current);
  }
  const onLinkReset = isAdmin && canManagePasskeys ? detachLinkedAccess : undefined;
  const scopedConversations = [...new Set([
    ...(selectedProject ? projectConversationTypes[selectedProject] ?? [] : []),
    ...accounts.flatMap((account) => account.metadata.conversationTypes)
  ])];
  function attachLinkedAccess(email: string, linked: LinkedTestAccount, metadata?: AccountMetadata) { if (metadata) replaceMetadata(metadata); setAccounts((current) => current.map((account) => account.email === email ? { ...account, linkedAccess: account.linkedAccess?.some((existing) => existing.id === linked.id) ? account.linkedAccess.map((existing) => existing.id === linked.id ? linked : existing) : [linked, ...(account.linkedAccess ?? [])] } : account)); }
  function edit(account: AccountView) { setSelected(account); setDetailOpen(false); setEditOpen(true); }
  async function logout() { clearTimeout(searchTimer.current); await api("/auth/logout", { method: "POST" }); onLogout(); }
  function openRuns(nextProject = selectedProject) {
    if (!nextProject || !allowedProjects.includes(nextProject)) return;
    if (route === "accounts") accountsUrl.current = window.location.pathname + window.location.search;
    window.history.pushState(null, "", `/testmails/runs?project=${projectFilters[nextProject]}`);
    setRunProject(nextProject);
    setRoute("runs");
  }
  const permittedRunProject = workspaceProject(`?project=${runProject ?? ""}`, allowedProjects);
  if (route === "runs" && permittedRunProject) return <EvidenceWorkspace locale={locale} project={permittedRunProject}
    projects={allowedProjects} onProjectChange={openRuns} onLocaleChange={onLocaleChange}
    onBack={() => { window.history.pushState(null, "", accountsUrl.current); setRoute("accounts"); }} />;
  if (route === "releases") return <ReleaseListPage locale={locale} onLocaleChange={onLocaleChange} onBack={() => setShowReleases(false)} />;
  if (showCoordination) return <CoordinationDashboard locale={locale} onBack={() => setShowCoordination(false)} />;
  const de = locale === "de";
  const coordinationLabel = de ? "Koordinationszentrum" : "Coordination center";
  const releaseLabel = de ? "Release-Liste" : "Release list";
  const runsLabel = de ? "Testläufe und Belege" : "Test runs and evidence";
  const manageLabel = de ? "Konten verwalten" : "Manage accounts";
  const filterLabel = (de ? "Filter" : "Filters") + (advancedCount ? ` (${advancedCount})` : "");
  const favoriteCount = accounts.filter((account) => favoriteSet.has(account.email)).length;
  const selectedAccount = selected && accountTestProject(selected) === selectedProject ? selected : null;
  return <main data-testmails-selection-scope className="min-h-screen">
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-bold tracking-tight sm:text-2xl">
            {selectedProject && (allowedProjects.length > 1 ? (
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <button type="button" data-testid="project-switch"
                    className="inline-flex items-center gap-1 rounded-md focus-visible:outline-2"
                    aria-label={de ? `Projekt wechseln, ${projectNames[selectedProject]}` : `Switch project, ${projectNames[selectedProject]}`}>
                    {projectNames[selectedProject]}<ChevronDownIcon className="size-5 rounded border p-0.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-44 space-y-1 p-1.5" aria-label={de ? "Projekt wechseln" : "Switch project"}>
                  {allowedProjects.map((item) => (
                    <Button key={item} type="button" variant={item === selectedProject ? "secondary" : "ghost"}
                      className="w-full justify-start" data-testid="project-option" aria-pressed={item === selectedProject}
                      onClick={() => {
                        patchFilters({ project: projectFilters[item] });
                        setDetailOpen(false);
                        setEditOpen(false);
                        setProjectOpen(false);
                      }}>{projectNames[item]}</Button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : <span>{projectNames[selectedProject]}</span>)}
            <span>{de ? "Testkonten" : "test accounts"}</span>
          </h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button type="button" variant="outline" size="icon" title={runsLabel} aria-label={runsLabel} disabled={!selectedProject} onClick={() => openRuns()}><FlaskConicalIcon /></Button>
              <Button type="button" variant="outline" size="icon" title={coordinationLabel} aria-label={coordinationLabel} onClick={() => setShowCoordination(true)}><RouteIcon /></Button>
              <Button variant="outline" size="icon" asChild><a href={WEBMAIL_URL} target="_blank" rel="noreferrer" title={t(locale, "page.webmail")} aria-label={t(locale, "page.webmail")}><MailIcon /></a></Button>
              <Button type="button" variant="outline" size="icon" title={releaseLabel} aria-label={releaseLabel} onClick={() => setShowReleases(true)}><ListChecksIcon /></Button>
              <TaxonomySettings compact taxonomies={taxonomies} locale={locale} onSaved={setTaxonomies} />
            </div>
            <Popover>
              <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" data-testid="more-toggle" title={de ? "Mehr" : "More"} aria-label={de ? "Mehr" : "More"}><MoreHorizontalIcon /></Button></PopoverTrigger>
              <PopoverContent align="end" className="flex max-h-[70vh] w-60 max-w-[calc(100vw-2rem)] flex-col gap-1.5 overflow-y-auto bg-card p-2">
                <Button variant="ghost" className="justify-start sm:hidden" disabled={!selectedProject} onClick={() => openRuns()}><FlaskConicalIcon />{runsLabel}</Button>
                <Button variant="ghost" className="justify-start sm:hidden" onClick={() => setShowCoordination(true)}><RouteIcon />{coordinationLabel}</Button>
                <Button variant="ghost" className="justify-start sm:hidden" asChild><a href={WEBMAIL_URL} target="_blank" rel="noreferrer"><MailIcon />{t(locale, "page.webmail")}</a></Button>
                <Button variant="ghost" className="justify-start sm:hidden" onClick={() => setShowReleases(true)}><ListChecksIcon />{releaseLabel}</Button>
                <div className="sm:hidden"><TaxonomySettings taxonomies={taxonomies} locale={locale} onSaved={setTaxonomies} /></div>
                <Button variant="ghost" className="justify-start" asChild><a href="/testmails/testmails.md"><DownloadIcon />{de ? "Markdown · alle Projekte" : "Markdown · all projects"}</a></Button>
                {isAdmin && <EmployeeManagement locale={locale} />}
                {!onlyFavorites && isAdmin && canManagePasskeys && <DeleteCandidateCleanup locale={locale} onCleaned={async () => setAccounts(await api<AccountView[]>("/accounts"))} />}
                {canManagePasskeys && <PasskeyManager locale={locale} />}
                <Button variant="ghost" className="justify-start" onClick={() => onLocaleChange(de ? "en" : "de")} aria-label={t(locale, "page.language")}><LanguagesIcon />{de ? "EN" : "DE"}</Button>
                <Button variant="ghost" className="justify-start" onClick={logout}><LogOutIcon />{t(locale, "page.logout")}</Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" maxLength={200} aria-label={de ? "Suche" : "Search"} placeholder={de ? "Suche" : "Search"} value={query}
              onChange={(event) => typeSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                executeSearch(query);
              }} />
          </div>
          <SearchHistory locale={locale} onPick={executeSearch} />
          <Button type="button" variant="outline" size="icon" title={filterLabel} aria-label={filterLabel}
            aria-expanded={advancedOpen} aria-controls="advanced-filters" data-testid="advanced-toggle" onClick={() => setAdvancedOpen((open) => !open)}>
            <SlidersHorizontalIcon /><span className="sr-only">{filterLabel}</span>
          </Button>
          <Button type="button" size="icon" variant={onlyFavorites ? "outline" : "default"} aria-pressed={!onlyFavorites}
            title={manageLabel} aria-label={manageLabel} onClick={() => setOnlyFavorites(false)}><ContactRoundIcon /></Button>
          <Toggle variant="outline" disabled={!favoritesReady} pressed={onlyFavorites} onPressedChange={setOnlyFavorites}
            className="shrink-0 border-amber-300 bg-amber-50 px-2.5 text-slate-950 hover:bg-amber-100 data-[state=on]:border-amber-500 data-[state=on]:bg-amber-200"
            title={de ? "Favoriten" : "Favorites"} aria-label={de ? "Nur Favoriten zeigen" : "Show favorites only"} data-testid="favorites-filter">
            <StarIcon className="fill-amber-400 text-slate-950" />
            <span aria-hidden="true" className="tabular-nums">{favoriteCount}</span>
          </Toggle>
        </div>
    <div id="advanced-filters" hidden={!advancedOpen} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,12rem))_auto]">
        <div className="grid gap-1">
          <span id="status-filter-label" className="text-sm font-medium">{t(locale, "page.status")}</span>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-full" aria-labelledby="status-filter-label"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{lifecycleValues.map((value) => <SelectItem key={value} value={value}>{value === "all" ? (locale === "de" ? "Alle Status" : "All statuses") : labelLifecycle(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span id="fixture-filter-label" className="text-sm font-medium">{t(locale, "page.testData")}</span>
          <Select value={quality} onValueChange={(value) => setQuality(value as typeof quality)}>
            <SelectTrigger className="w-full" aria-labelledby="fixture-filter-label"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{fixtureValues.map((value) => <SelectItem key={value} value={value}>{value === "all" ? (locale === "de" ? "Alle Testdaten" : "All test data") : labelFixture(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
        {!onlyFavorites && <VersionBulkAction accounts={accounts} locale={locale} onMarked={(emails) => setAccounts((current) => current.map((account) => emails.includes(account.email) ? { ...account, metadata: { ...account.metadata, lifecycleStatus: "delete_candidate" } } : account))} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input aria-label={locale === "de" ? "Konten nach Version filtern" : "Filter accounts by version"} placeholder={locale === "de" ? "Nach Version filtern (>)" : "Filter by version (>)"} value={versionAfter} onChange={(event) => setVersionAfter(event.target.value)} /><MultiSelect label={locale === "de" ? "Rollen filtern" : "Filter roles"} options={distinctRoleOptions(taxonomies.roles)} value={roleFilters} onChange={setRoleFilters} locale={locale} /><MultiSelect label={locale === "de" ? "Themen filtern" : "Filter topics"} options={taxonomies.topics} value={topicFilters} onChange={setTopicFilters} formatOption={(value) => labelTopic(locale, value)} locale={locale} /><MultiSelect label={locale === "de" ? "Konversationen filtern" : "Filter conversations"} options={scopedConversations} value={conversationFilters} onChange={setConversationFilters} locale={locale} /></div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{locale === "de" ? "E-Mail-Domain" : "Email domain"}</span><ToggleGroup type="multiple" value={selectedDomains.length ? selectedDomains : ["all"]} onValueChange={(next) => { const current = selectedDomains.length ? selectedDomains : ["all"]; const added = next.find((item) => !current.includes(item)); if (added) setDomain(added === "all" ? "all" : toggleDomain(domain, added)); else { const removed = current.find((item) => !next.includes(item)); if (removed && removed !== "all") setDomain(toggleDomain(domain, removed)); } }} variant="outline" className="max-w-full flex-wrap justify-start" aria-label={locale === "de" ? "Domains filtern (mehrere möglich)" : "Filter domains (several allowed)"}>{domainValues.map((value) => <ToggleGroupItem key={value} value={value} className={`domain-filter ${value === "all" ? "domain-neutral" : domainClass(value)}`}>{value === "all" ? t(locale, "page.all") : value}</ToggleGroupItem>)}</ToggleGroup></div><FilterPresets locale={locale} current={filters} onApply={setFilters} /></div>
    {(roleFilters.length > 0 || topicFilters.length > 0 || conversationFilters.length > 0) && <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-2"><SelectedTags values={roleFilters} formatOption={(value) => labelRole(locale, value)} tone="role" removeLabel={locale === "de" ? "Filter entfernen" : "remove filter"} onRemove={(removed) => setRoleFilters((current) => current.filter((value) => value !== removed))} /><SelectedTags values={topicFilters} formatOption={(value) => labelTopic(locale, value)} tone="topic" removeLabel={locale === "de" ? "Filter entfernen" : "remove filter"} onRemove={(removed) => setTopicFilters((current) => current.filter((value) => value !== removed))} /><SelectedTags values={conversationFilters} formatOption={(value) => labelConversation(locale, value)} tone="conversation" removeLabel={locale === "de" ? "Filter entfernen" : "remove filter"} onRemove={(removed) => setConversationFilters((current) => current.filter((value) => value !== removed))} /></div>}
    {(activeFilterCount > 0 || onlyFavorites || favoritesError) && <div className="flex max-w-full flex-wrap items-center gap-2">
      {activeFilterCount > 0 && <Button type="button" variant="outline" size="sm" data-testid="reset-filters" onClick={resetFilters}>
        <FilterXIcon />{t(locale, "page.resetFilters", { count: activeFilterCount })}
      </Button>}
      {onlyFavorites && <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" disabled={!favoriteDisplay.ready}>
            <SlidersHorizontalIcon data-icon="inline-start" />
            {locale === "de" ? "Anzeige" : "Display"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={locale === "de" ? "Favoritenanzeige" : "Favorites display"} className="w-52 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={favoriteDisplay.display.testContext}
              onChange={(event) => void favoriteDisplay.setDisplay({ testContext: event.target.checked })} />
            {locale === "de" ? "Testkontext" : "Test context"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={favoriteDisplay.display.notes}
              onChange={(event) => void favoriteDisplay.setDisplay({ notes: event.target.checked })} />
            {locale === "de" ? "Notizen" : "Notes"}
          </label>
        </PopoverContent>
      </Popover>}
      {(favoritesError || (onlyFavorites && favoriteDisplay.error)) && <span className="text-xs text-destructive" role="alert">
        {locale === "de" ? "Favoriten konnten nicht geladen oder gespeichert werden." : "Favorites could not be loaded or saved."}
      </span>}
    </div>}
    </div></header>
    <section className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-6 max-[360px]:px-2 lg:px-8"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t(locale, "page.filteredCount", { shown: visibleAccounts.length, total: accounts.length })}</p>{!onlyFavorites && <div className="flex gap-2"><Badge variant="outline">{encryptedCount} S/MIME</Badge><Badge variant="secondary">{unencryptedCount} {locale === "de" ? "ohne Verschlüsselung" : "unencrypted"}</Badge></div>}</div>{duplicateEmails > 0 && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Doppelte Mailadressen" : "Duplicate mailbox addresses"}</AlertTitle><AlertDescription>{locale === "de" ? "Der geladene Katalog enthält doppelte Mailadressen. Bitte den Katalog prüfen." : "The loaded catalogue contains duplicate mailbox addresses. Please check the catalogue."}</AlertDescription></Alert>}{visibleAccounts.length ? onlyFavorites ? (
      <FavoriteAccountView accounts={favoriteAccounts} locale={locale} display={favoriteDisplay.display}
        expandedEmail={expandedEmail} onToggleExpanded={toggleRow}
        onSaved={replaceMetadata} onToggleFavorite={(email) => void toggleFavoriteAccount(email)}
        onMove={(email, direction) => void moveFavorite(email, direction, visibleFavorites)} />
    ) : (
      <ul role="list" className="min-w-0 divide-y rounded-xl border bg-card">
        {managedAccounts.map((account) => {
          const expanded = expandedEmail === account.email;
          const openDetail = () => { setSelected(account); setDetailOpen(true); };
          const detailProps = {
            ...contextOptions, locale, taxonomies, onSaved: replaceMetadata, onDetail: openDetail,
            canDeleteOrisoAdmin: isAdmin && canManagePasskeys,
            orisoProvisioningEnvironments: entitlements.orisoProvisioning.environments,
            onProvisioned: attachLinkedAccess, onLinkReset
          };
          return <li key={account.email}>
            <AccountRowSummary account={account} locale={locale} expanded={expanded} onToggle={() => toggleRow(account.email)}>
              <FavoriteButton disabled={!favoritesReady} favorite={favoriteSet.has(account.email)} locale={locale}
                name={account.displayName} onToggle={() => void toggleFavoriteAccount(account.email)} />
            </AccountRowSummary>
            {expanded && <div className="px-2 pb-2 sm:px-3">
              <AccountTable {...detailProps} accounts={[account]} onEdit={edit} />
              <AccountCard {...detailProps} account={account} onEdit={() => edit(account)} />
              {selectedProject && <AccountRunLinks email={account.email} project={selectedProject} locale={locale} />}
            </div>}
          </li>;
        })}
      </ul>
    ) : <Card><CardContent><Empty><EmptyHeader><EmptyTitle>{onlyFavorites && activeFilterCount === 1 ? (locale === "de" ? "Noch keine Favoriten" : "No favorites yet") : t(locale, "page.noAccounts")}</EmptyTitle><EmptyDescription>{onlyFavorites && activeFilterCount === 1 ? (locale === "de" ? "Markiere in der Kontoverwaltung die Konten, die du häufig nutzt." : "Star the accounts you use often in Manage accounts.") : t(locale, "page.adjustFilters")}</EmptyDescription></EmptyHeader></Empty></CardContent></Card>}</section>
    <SearchSelection locale={locale} onSearch={(phrase) => { setDetailOpen(false); executeSearch(phrase); }} />
    <AccountDetailSheet onSaved={replaceMetadata} onLinkReset={onLinkReset} account={selectedAccount} locale={locale} open={detailOpen && selectedAccount !== null} onOpenChange={setDetailOpen} onEdit={() => selected && edit(selected)} /><MetadataEditor account={selectedAccount} taxonomies={taxonomies} projectConversationTypes={projectConversationTypes} locale={locale} open={editOpen && selectedAccount !== null} onOpenChange={setEditOpen} onSaved={replaceMetadata} />
  </main>;
}

function compareVersions(left: string, right: string) { const a = left.split(".").map(Number), b = right.split(".").map(Number); for (let index = 0; index < 3; index += 1) { const difference = (a[index] ?? 0) - (b[index] ?? 0); if (difference) return difference; } return 0; }
