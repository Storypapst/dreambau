// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
import {WorkStateDetails} from "../src/client/components/work-state-details.js";
it("shows an observed FAIL and criterion independently of missing deployment qualification",async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const receipt={receiptId:"fail",producer:"qa",kind:"acceptance",result:"FAIL",criterion:"Critical workflow",environment:"dev",observedAt:new Date().toISOString(),sourceCommit:"b".repeat(40),imageDigest:"sha256:"+"c".repeat(64),evidenceLinks:["https://example.test/proof"]};
 const detail={pr:{url:"https://github.com/org/repo/pull/7",base:"dev",head:"feature",headSha:"a".repeat(40),facets:{}},workItems:[],reasons:[],deployment:"not_recorded",acceptance:"deployment_unverified",sources:{board:[],deploymentReceipt:null,acceptanceReceipt:receipt}};
 vi.stubGlobal("fetch",async()=>new Response(JSON.stringify(detail)));
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 try{await act(async()=>{root.render(<WorkStateDetails selection={{repositoryId:"1",number:7}} revision={1} locale="en" mode="normal" onClose={()=>{}} onPermissionDenied={()=>{}} onRestoreFocus={()=>{}}/>);await new Promise(r=>setTimeout(r,10));});expect(document.body.textContent).toContain("FAIL");expect(document.body.textContent).toContain("Critical workflow");expect(document.body.textContent).toContain("Matching deployment missing");}
 finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
