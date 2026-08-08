const fs = require("fs");
const vm = require("vm");

global.window = global;
vm.runInThisContext(fs.readFileSync(__dirname + "/projects-api.js", "utf8"));

const calls = [];
const api = StudioProjectsApi.create({
  request: (url, payload) => { calls.push({ url, payload }); return { ok: true }; },
  upload: () => ({ ok: true }),
});

api.addSilence(17, 2.5, 4);
const silence = calls.at(-1);
if (silence.url !== "/api/project/silence" ||
    silence.payload.project_id !== 17 || silence.payload.seconds !== 2.5 ||
    silence.payload.insert_at !== 4 || "id" in silence.payload) {
  throw new Error(`Invalid silence transport: ${JSON.stringify(silence)}`);
}

api.stitch(17);
const stitch = calls.at(-1);
if (stitch.url !== "/api/project/stitch" || stitch.payload.id !== 17) {
  throw new Error(`Invalid stitch transport: ${JSON.stringify(stitch)}`);
}

console.log("projects-api tests passed");
