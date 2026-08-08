"use strict";

const assert = require("node:assert/strict");
global.window = { location: { pathname: "/", search: "" } };
global.history = { pushState() {}, replaceState() {} };
require("./projects-core.js");
require("./features/projects/workspace-state.js");

const levels = {
  venture: { one: "venture", holds: "project", holdsMany: "projects" },
  project: { one: "project", holds: "folder", holdsMany: "folders" },
  folder: { one: "folder", holds: null, holdsMany: "recordings" },
};
const levelOf = item => levels[item.level] || levels.folder;
const items = [
  { id: 1, parent_id: null, level: "venture", container_type: "venture", name: "Venture" },
  { id: 2, parent_id: 1, level: "project", container_type: "project", name: "Project" },
  { id: 3, parent_id: 2, level: "folder", container_type: "production", name: "Production" },
  { id: 4, parent_id: null, level: "venture", container_type: "inbox", system_role: "inbox", name: "Inbox" },
  { id: 5, parent_id: 1, level: "project", container_type: "library", system_role: "venture_assets", name: "Renamed library" },
  { id: 6, parent_id: 5, level: "folder", container_type: "asset_collection", system_role: "assets:music", name: "Sound beds" },
];
const hierarchy = window.ProjectCore.hierarchy(items);

const folder = window.ProjectWorkspaceState.derive({
  ...items[2], children: [],
  parts: [{ kind: "draft" }, { kind: "audio" }, { kind: "audio" }],
}, hierarchy, levelOf);
assert.equal(folder.holdsParts, true);
assert.equal(folder.showPartAdd, true);
assert.equal(folder.showRecordDrafts, true);
assert.equal(folder.showStitch, true);
assert.equal(folder.showProjectNew, false);
assert.equal(folder.showExports, false);

const exportedFolder = window.ProjectWorkspaceState.derive({
  ...items[2], children: [],
  parts: [{ kind: "audio" }, { kind: "stitch" }],
}, hierarchy, levelOf);
assert.equal(exportedFolder.pieces, 1);
assert.equal(exportedFolder.exports, 1);
assert.equal(exportedFolder.showExports, true);

const project = window.ProjectWorkspaceState.derive({
  ...items[1], children: [{ id: 3 }], parts: [],
}, hierarchy, levelOf);
assert.equal(project.holdsParts, false);
assert.equal(project.showFoldersBlock, true);
assert.equal(project.showStructureGroup, true);
assert.equal(project.showProduction, false);

const unsorted = window.ProjectWorkspaceState.derive({
  ...items[3], bucket: true, children: [], parts: [{ kind: "audio" }],
}, hierarchy, levelOf);
assert.equal(unsorted.bucket, true);
assert.equal(unsorted.showSettings, false);
assert.equal(unsorted.showProduction, false);
assert.equal(unsorted.showPartsList, true);

const musicLibrary = window.ProjectWorkspaceState.derive({
  ...items[5], children: [], parts: [{ kind: "audio" }],
}, hierarchy, levelOf);
assert.equal(musicLibrary.libraryFolder, true);
assert.equal(musicLibrary.showAssetLibrary, true);
assert.equal(musicLibrary.showPartAdd, false);
assert.equal(musicLibrary.showPartSilence, false);
assert.equal(musicLibrary.showStitch, false);
assert.equal(musicLibrary.showProduction, false);
assert.equal(musicLibrary.showPartsList, true);

console.log("Projects workspace state verified");
