// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/client/api.js";
import { loadWorkspaceGithub, refreshWorkspaceGithub } from "../src/client/workspace-github-client.js";
import { loadWorkspacePreferences, saveWorkspacePreferences, defaultWorkspacePreferences } from "../src/client/workspace-preferences-client.js";
vi.mock("../src/client/api.js",()=>({api:vi.fn()}));
afterEach(()=>vi.mocked(api).mockReset());
describe("workspace GitHub and preference clients",()=>{
 it("reads only the selected source/id and uses an explicit POST for manual refresh",async()=>{
  vi.mocked(api).mockResolvedValue({status:"unconfigured",items:[],limitReached:false,retryAfter:null});
  const signal=new AbortController().signal;
  await loadWorkspaceGithub("test-run","run/one",signal);
  await refreshWorkspaceGithub("evidence-run","run/two",signal);
  expect(api).toHaveBeenNthCalledWith(1,"/workspace/runs/test-run/run%2Fone/github",{signal});
  expect(api).toHaveBeenNthCalledWith(2,"/workspace/runs/evidence-run/run%2Ftwo/github/refresh",{method:"POST",signal});
 });
 it("uses the existing viewer-scoped preference envelope and normalizes missing defaults",async()=>{
  vi.mocked(api).mockResolvedValueOnce({key:"workspace-defaults",value:null});
  expect(await loadWorkspacePreferences()).toEqual(defaultWorkspacePreferences());
  const preferences={rememberFilters:false,refreshMinutes:0 as const,filtersByProject:{oriso:{source:"evidence-run" as const,environment:"dev" as const}}};
  vi.mocked(api).mockResolvedValueOnce({key:"workspace-defaults",value:preferences});
  expect(await saveWorkspacePreferences(preferences)).toEqual(preferences);
  expect(api).toHaveBeenLastCalledWith("/auth/me/preferences/workspace-defaults",{method:"PUT",body:JSON.stringify({value:preferences})});
 });
});
