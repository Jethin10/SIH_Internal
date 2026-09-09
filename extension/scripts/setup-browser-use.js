"use strict";
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const repo=path.resolve(__dirname,"../..");
const steps = [];
if (!require("node:fs").existsSync(path.join(repo,".venv-browser-use"))) steps.push(["venv","--python","3.14",".venv-browser-use"]);
steps.push(["pip","install","--python",process.platform==="win32"?".venv-browser-use/Scripts/python.exe":".venv-browser-use/bin/python","-r","adapters/browser-use/requirements.lock.txt"]);
for(const args of steps) {
  const result=spawnSync("uv",args,{cwd:repo,stdio:"inherit",windowsHide:true});
  if(result.error || result.status!==0){console.error("Install uv, then rerun setup:browser-use.");process.exit(1);}
}
