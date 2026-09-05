const {spawnSync}=require("child_process");
const path=require("path");
const results=[];
for(const nodes of [1000,5000,10000,20000]){const run=spawnSync(process.execPath,[path.join(__dirname,"run-e2e.js")],{cwd:path.resolve(__dirname,".."),env:{...process.env,FIXTURE_PATH:`tests/benchmark.html?nodes=${nodes}`,CDP_SCRIPT:"cdp-benchmark.js"},encoding:"utf8",timeout:120000});process.stdout.write(run.stdout||"");process.stderr.write(run.stderr||"");if(run.status!==0)process.exit(run.status||1);const line=(run.stdout||"").split(/\r?\n/).find(x=>x.startsWith("BENCHMARK_JSON "));if(!line)throw new Error("benchmark output missing");results.push(JSON.parse(line.slice(15)))}
console.log(JSON.stringify({generatedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,results},null,2));
