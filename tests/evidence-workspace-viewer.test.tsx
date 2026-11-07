// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveViewer } from "../src/client/api.js";
import { EvidenceWorkspaceViewer } from "../src/client/components/evidence-workspace-viewer.js";
import type { WorkspaceFile } from "../src/shared/workspace.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const file:WorkspaceFile={id:"image-1",runId:"run-1",kind:"screenshot",filename:"proof.png",caption:"Recorded proof",contentType:"image/png",byteSize:1024,sha256:"a".repeat(64),publicUrl:"https://evidence.dreambau.com/e/public/file/proof.png",viewerUrl:null,previewUrl:"/testmails/api/workspace/evidence/run-1/files/image-1/content?viewer=viewer-a",downloadUrl:"/testmails/api/workspace/evidence/run-1/files/image-1/content?viewer=viewer-a&download=1",processingState:"ready"};
describe("EvidenceWorkspaceViewer",()=>{
 let root:Root;let container:HTMLDivElement;
 beforeEach(()=>{container=document.createElement("div");document.body.append(container);root=createRoot(container);setActiveViewer("viewer-a");});
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();setActiveViewer(null);vi.unstubAllGlobals();});
 const render=(value:WorkspaceFile)=>act(async()=>root.render(<EvidenceWorkspaceViewer file={value} locale="en" onClose={()=>undefined}/>));
 it("renders only a ready authenticated media preview, with a safe canonical public link",async()=>{
  await render(file);expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe(file.previewUrl);
  const link=document.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="'+file.publicUrl+'"]');expect(link?.rel).toContain("noopener");
  await act(async()=>document.querySelector('[role="dialog"] img')!.dispatchEvent(new Event("error")));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Preview unavailable");
 });
 it("never embeds HTML, unsafe external preview URLs, or rejected files",async()=>{
  await render({...file,kind:"playwright-report",contentType:"text/html",previewUrl:"https://evil.test/report.html",publicUrl:"javascript:alert(1)",viewerUrl:"javascript:alert(1)"});
  expect(document.querySelector('[role="dialog"] iframe, [role="dialog"] img, [role="dialog"] video')).toBeNull();
  expect(document.querySelector('[role="dialog"] a[href^="javascript:"]')).toBeNull();
  await render({...file,processingState:"rejected"});expect(document.querySelector('[role="dialog"] img')).toBeNull();
  expect(document.querySelector('[role="dialog"] a[download]')).toBeNull();
 });
 it("discards late document text after another file is selected",async()=>{
  let resolve!:(value:Response)=>void;const old=new Promise<Response>(done=>{resolve=done;});
  vi.stubGlobal("fetch",vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(new Response("Current document",{headers:{"content-type":"text/plain"}})));
  const first={...file,kind:"document" as const,contentType:"text/plain"};await render(first);
  await render({...first,id:"text-2",previewUrl:"/testmails/api/workspace/evidence/run-1/files/text-2/content?viewer=viewer-a"});
  await act(async()=>resolve(new Response("STALE PRIVATE DOCUMENT",{headers:{"content-type":"text/plain"}})));
  expect(document.querySelector('[role="dialog"] pre')?.textContent).toBe("Current document");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("STALE PRIVATE DOCUMENT");
 });
});
