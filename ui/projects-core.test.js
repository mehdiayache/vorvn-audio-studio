"use strict";

const assert = require("node:assert/strict");
global.window = { location: { pathname: "/", search: "" } };
global.history = { pushState() {}, replaceState() {} };
require("./projects-core.js");

const items = [
  { id: 1, parent_id: null, level: "venture", container_type: "venture", name: "Heartsnotes" },
  { id: 2, parent_id: 1, level: "project", container_type: "project", name: "Sleeping guides" },
  { id: 3, parent_id: 2, level: "folder", container_type: "production", name: "Arabic night" },
  { id: 4, parent_id: null, level: "venture", container_type: "inbox", system_role: "inbox", name: "Renamable inbox" },
  { id: 5, parent_id: 1, level: "project", container_type: "project", name: "Assets" },
];
const model = window.ProjectCore.hierarchy(items);

assert.deepEqual(model.childrenOf(1).map(item => item.id), [2, 5]);
assert.deepEqual(model.descendantsOf(1).map(item => item.id), [2, 3, 5]);
assert.equal(model.pathOf(3), "Heartsnotes › Sleeping guides › Arabic night");
assert.deepEqual(model.search("arabic").map(item => item.id), [3]);
assert.equal(model.contextFor(items[0]).canCreateChild, true);
assert.equal(model.contextFor(items[1]).canContainParts, false);
assert.equal(model.contextFor(items[2]).canContainParts, true);
assert.equal(model.contextFor(items[2]).venture.id, 1);
assert.equal(model.contextFor(items[2]).project.id, 2);
assert.equal(model.contextFor(items[3]).isUnsorted, true);
assert.equal(model.contextFor(items[4]).isLibrary, false);

console.log("Projects hierarchy contract verified");
