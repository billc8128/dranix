import fs from "node:fs";
const p = "dist/index.js";
let s = fs.readFileSync(p, "utf8");
if (!s.startsWith("#!")) s = "#!/usr/bin/env node\n" + s;
fs.writeFileSync(p, s);
fs.chmodSync(p, 0o755);
