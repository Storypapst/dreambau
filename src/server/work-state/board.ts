import type { BoardObservation } from "./sources.js";
const PROJECT="PVT_kwDODkeBP84BHH8p",STATUS="PVTSSF_lADODkeBP84BHH8pzg3-C9U",PRIORITY="IFSS_kgDOAjh1Eg";
const QUERY=`query WorkStateIssueBoard($owner:String!,$repo:String!,$number:Int!,$fieldsAfter:String,$projectsAfter:String){repository(owner:$owner,name:$repo){issue(number:$number){url issueFieldValues(first:30,after:$fieldsAfter){nodes{__typename ...on IssueFieldSingleSelectValue{name field{...on IssueFieldSingleSelect{id}}} ...on IssueFieldMultiSelectValue{field{...on IssueFieldMultiSelect{id}}}} pageInfo{hasNextPage endCursor}} projectItems(first:30,after:$projectsAfter,includeArchived:false){nodes{project{id} fieldValueByName(name:"Status"){...on ProjectV2ItemFieldSingleSelectValue{name field{...on ProjectV2SingleSelectField{id}}}}} pageInfo{hasNextPage endCursor}}}}}`;
const mapping:Record<string,"P0"|"P1"|"P2"|"P3">={Urgent:"P0",High:"P1",Medium:"P2",Low:"P3"};
/** One fixed query, independent cursors. No source bodies and no mutations. */
export async function readIssueBoard(options:{fullName:string;number:number;now?:()=>number;transport?:typeof fetch;token:(signal?:AbortSignal)=>Promise<string>;signal?:AbortSignal}):Promise<BoardObservation>{
 if(!/^OpenResilienceInitiative\/[A-Za-z0-9_.-]+$/i.test(options.fullName)||!Number.isSafeInteger(options.number)||options.number<1)throw new Error("invalid_board_target");
 const now=options.now??Date.now,at=new Date(now()).toISOString(),[owner,repo]=options.fullName.split("/"),url=`https://github.com/${options.fullName}/issues/${options.number}`;
 let fieldsAfter:string|null=null,projectsAfter:string|null=null,fieldsDone=false,projectsDone=false,status:string|null=null,priority:BoardObservation["priority"]=null;
 const seenFields=new Set<string>(),seenProjects=new Set<string>();
 for(let page=0;page<100;page++){
  try{
   const response=await (options.transport??fetch)("https://api.github.com/graphql",{method:"POST",redirect:"error",signal:options.signal,headers:{Authorization:`Bearer ${await options.token(options.signal)}`,"Content-Type":"application/json","X-GitHub-Api-Version":"2026-03-10"},body:JSON.stringify({query:QUERY,variables:{owner,repo,number:options.number,fieldsAfter,projectsAfter}})});
   if(!response.ok)throw new Error();const json=await response.json() as any,issue=json.data?.repository?.issue;if(json.errors?.length||!issue||issue.url!==url)throw new Error();
   if(!fieldsDone){const connection=issue.issueFieldValues;if(!connection||!Array.isArray(connection.nodes)||!connection.pageInfo)throw new Error();
    for(const value of connection.nodes){if(value.field?.id===PRIORITY){if(value.__typename!=="IssueFieldSingleSelectValue"||!mapping[value.name])throw new Error();priority=mapping[value.name];}else if(!["IssueFieldSingleSelectValue","IssueFieldMultiSelectValue"].includes(value.__typename))throw new Error();}
    const info=connection.pageInfo;if(info.hasNextPage){if(!info.endCursor||seenFields.has(info.endCursor))throw new Error();seenFields.add(info.endCursor);fieldsAfter=info.endCursor;}else fieldsDone=true;
   }
   if(!projectsDone){const connection=issue.projectItems;if(!connection||!Array.isArray(connection.nodes)||!connection.pageInfo)throw new Error();
    for(const item of connection.nodes){if(item.project?.id===PROJECT){const value=item.fieldValueByName;if(value&&value.field?.id!==STATUS)throw new Error();status=value?.name??null;}}
    const info=connection.pageInfo;if(info.hasNextPage){if(!info.endCursor||seenProjects.has(info.endCursor))throw new Error();seenProjects.add(info.endCursor);projectsAfter=info.endCursor;}else projectsDone=true;
   }
   if(fieldsDone&&projectsDone)return {status,priority,url,observedAt:at,coverage:"complete"};
  }catch{throw new Error("board_source_incomplete");}
 }
 throw new Error("board_source_incomplete");
}
