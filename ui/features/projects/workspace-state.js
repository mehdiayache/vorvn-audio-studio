/* Pure Projects workspace decisions. The controller applies this state to the
   DOM; this module decides what the current context can contain and produce. */
(function exposeProjectWorkspaceState(global) {
  "use strict";

  function derive(detail, hierarchy, levelOf) {
    const context = hierarchy.contextFor(detail);
    const parts = detail.parts || [];
    const children = detail.children || [];
    const bucket = context.isUnsorted;
    const locked = !!detail.locked;
    const level = levelOf(detail);
    const holdsParts = context.canContainParts;
    const libraryFolder = detail.container_type === "asset_collection";
    const libraryRoot = detail.container_type === "library";
    const ventureRoot = detail.container_type === "venture";
    const folders = children.length;
    const projectCount = children.filter(child => child.container_type === "project").length;
    const libraryCount = children.filter(child => child.container_type === "library").length;
    const sourceParts = parts.filter(part => part.kind !== "stitch");
    const pieces = sourceParts.length;
    const exports = parts.filter(part => part.kind === "stitch").length;
    const drafts = parts.filter(part => part.kind === "draft").length;
    const recorded = parts.filter(part => part.kind === "audio").length;
    const stray = !holdsParts && !libraryFolder && sourceParts.length > 0;
    const blank = !folders && !pieces && !exports && !bucket;
    const both = folders > 0 && pieces > 0;

    return Object.freeze({
      context, bucket, locked, level, holdsParts, libraryFolder, libraryRoot,
      folders, pieces, exports, drafts,
      recorded, stray, blank, both,
      contentsHeading: bucket ? "Everything unfiled"
        : libraryFolder ? `${detail.name} library`
        : libraryRoot ? "Asset collections"
        : ventureRoot ? "Venture workspace"
        : holdsParts ? "Recording sequence"
        : `${level.holdsMany[0].toUpperCase()}${level.holdsMany.slice(1)} inside`,
      contentsSummary: bucket ? "" : libraryFolder
        ? `${pieces} file${pieces === 1 ? "" : "s"}` : ventureRoot ? [
        projectCount ? `${projectCount} project${projectCount === 1 ? "" : "s"}` : "",
        libraryCount ? `${libraryCount} library` : "",
      ].filter(Boolean).join(" · ") || "empty" : [
        folders ? `${folders} ${folders === 1 ? level.holds : level.holdsMany}` : "",
        pieces ? `${pieces} part${pieces === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ") || "empty",
      showFoldersBlock: !!folders && !bucket,
      showSequenceBlock: (holdsParts && (pieces > 0 || bucket || blank) && !libraryFolder) ||
                         (libraryFolder && pieces > 0) || stray,
      showPartsList: pieces > 0 || bucket || (blank && !libraryFolder),
      showAssetLibrary: libraryFolder,
      showPartSilence: !bucket && !libraryFolder && pieces > 0,
      showPartAsset: !bucket && holdsParts && !context.isLibrary,
      showRecordDrafts: !bucket && !libraryFolder && drafts > 0,
      showStitch: !bucket && !libraryFolder && recorded >= 2,
      showPlayAll: !bucket && !libraryFolder && recorded > 0,
      showPartAdd: !bucket && holdsParts && !libraryFolder,
      showProjectNew: context.canCreateChild,
      showCreateGroup: !bucket && holdsParts && !libraryFolder,
      showPaceGroup: !bucket && !libraryFolder && pieces > 0,
      showStructureGroup: !bucket && context.canCreateChild,
      showFinishGroup: !libraryFolder && (drafts > 0 || recorded >= 2),
      showExports: !libraryFolder && exports > 0,
      showProduction: !bucket && holdsParts && !libraryFolder,
      showLength: !bucket && !libraryFolder && pieces > 0,
      showSettings: !bucket && !locked,
    });
  }

  global.ProjectWorkspaceState = Object.freeze({ derive });
})(window);
