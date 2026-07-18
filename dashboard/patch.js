const fs = require('fs');
const code = fs.readFileSync('mock-server/debugServer.js', 'utf8');
const newCode = code.replace(
  'if (req.method === "POST" && url.pathname === "/debug/start-csv-demo") {',
  'if (req.method === "POST" && url.pathname === "/debug/error") {\n        let body = "";\n        req.on("data", chunk => { body += chunk.toString(); });\n        req.on("end", () => {\n          console.log("[FRONTEND ERROR]", body);\n          res.writeHead(200); res.end("OK");\n        });\n        return;\n      }\n      if (req.method === "POST" && url.pathname === "/debug/start-csv-demo") {'
);
fs.writeFileSync('mock-server/debugServer.js', newCode);
