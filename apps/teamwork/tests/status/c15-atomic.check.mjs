import { execFileSync } from 'node:child_process';
import { check, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';
await run(async()=>{
 const python=String.raw`
import importlib.util, pathlib, tempfile, threading, json, os, time
from unittest.mock import patch
s=importlib.util.spec_from_file_location('status', pathlib.Path('status/teamwork_status.py'))
m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 out=pathlib.Path(d)/'out';out.mkdir();history=pathlib.Path(d)/'history';history.mkdir()
 c={'format':1,'zones':[{'id':'zone','name':'Zone','color':'cyan'}],'programs':[]}
 status={'format':1,'checkedAt':'2026-10-07T12:00:00Z','reachable':[]}
 m.publish(str(out),c,status)
 errors=[]; stop=threading.Event()
 def reader():
  while not stop.is_set():
   for name in ['programs.json','status.json']:
    try:
     value=json.loads((out/name).read_bytes());assert value['format']==1
    except BaseException as e: errors.append(type(e).__name__)
 threads=[threading.Thread(target=reader) for _ in range(3)]
 for t in threads:t.start()
 for i in range(200):m.publish(str(out),c,status)
 stop.set()
 for t in threads:t.join()
 assert not errors
 assert sorted(p.name for p in out.iterdir())==['programs.json','status.json']
 assert all((p.stat().st_mode&0o777)==0o644 for p in out.iterdir())
 print('PASS C15 three readers survive 200 atomic publications without partial JSON or temporary files')
 before={p.name:(p.read_bytes(),p.stat().st_mtime_ns) for p in out.iterdir()}
 original=m.os.replace
 def fail_status(source,target):
  if pathlib.Path(target).name=='status.json':raise OSError('synthetic failure')
  original(source,target)
 try:
  with patch.object(m.os,'replace',side_effect=fail_status):m.publish(str(out),dict(c,extra=True),status)
 except OSError:pass
 else:raise AssertionError('expected file failure')
 assert before=={p.name:(p.read_bytes(),p.stat().st_mtime_ns) for p in out.iterdir()}
 print('PASS C19 second-file failure restores original content and modification times')
 m.archive_list(b'first',str(history));m.archive_list(b'first',str(history));assert len(list(history.iterdir()))==1
 m.archive_list(b'second',str(history));assert len(list(history.iterdir()))==2
 assert sorted(p.read_bytes() for p in history.iterdir())==[b'first',b'second']
 assert all((p.stat().st_mode&0o777)==0o600 for p in history.iterdir())
 print('PASS C16 changed history within one second preserves both copies; unchanged input adds no copy')
 assert m.validation_errors(dict(c,zones=[{'id':'zone','name':'\ud800','color':'cyan'}]))
 print('PASS C2 non-Unicode text is a validation error')
`;
 try{ const result=execFileSync('python3',['-c',python],{cwd:ROOT,encoding:'utf8',timeout:30000}); for(const line of result.trim().split('\n'))check(line.replace(/^PASS /,''),true); }catch(error){check('C15 C16 C19 atomic publication and history',false,String(error.stderr||error.message).slice(-400));}
});
