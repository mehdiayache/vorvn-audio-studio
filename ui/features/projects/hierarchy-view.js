/* Three views of one Projects hierarchy model. They share identity and
   semantics without pretending a navigation rail, content card and picker are
   the same interaction. No API or global project state lives here. */
(function exposeProjectHierarchyViews(global) {
  "use strict";

  function create({ levelOf, isBucket, projectBadge, icon, escapeHtml }) {
    const countOf = project => ["library", "asset_collection"].includes(project.container_type)
      ? project.all_files : project.all_parts;

    function rail(project, options = {}) {
      const { depth = 0, hasKids = false, expanded = false, active = false,
              showPath = false, path = project.name, onOpen, onToggle } = options;
      const row = document.createElement("div");
      row.className = `tree-row ${project.level || "folder"}-row${active ? " on" : ""}`;
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.setAttribute("aria-label", `Open ${levelOf(project).one} ${path}`);
      row.title = path;
      // The data hierarchy may be deep, but indentation must not consume the
      // name column. Type styling and expanders carry the hierarchy after the
      // first step; every deeper row keeps a readable title width.
      const visualDepth = Math.min(depth, 1);
      row.dataset.depth = String(depth);
      row.style.paddingLeft = `${6 + visualDepth * 10}px`;
      row.innerHTML =
        (hasKids
          ? `<span class="tree-twist" style="width:12px;cursor:pointer;color:var(--muted);` +
            `font-size:10px;flex:0 0 auto">${expanded ? "▾" : "▸"}</span>`
          : `<span class="tree-indent"></span>`) +
        projectBadge(project, "folder-badge tree-badge") +
        `<span class="tree-copy"><span class="tree-name" dir="auto">` +
          `${escapeHtml(project.name)}</span>` +
        (showPath ? `<span class="tree-path" dir="auto">${escapeHtml(path)} · ` +
          `${levelOf(project).one}</span>` : "") +
        `</span><span class="tree-count">${countOf(project) || ""}</span>`;
      const open = () => onOpen?.(project);
      row.onclick = open;
      row.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      };
      const twist = row.querySelector(".tree-twist");
      if (twist) {
        twist.setAttribute("role", "button");
        twist.tabIndex = 0;
        twist.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${project.name}`);
        const toggle = event => {
          event.stopPropagation();
          onToggle?.(project);
        };
        twist.onclick = toggle;
        twist.onkeydown = event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle(event);
          }
        };
      }
      return row;
    }

    function wireCard(el, project, { path, onOpen, onSettings }) {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Open ${levelOf(project).one} ${path}`);
      const open = () => onOpen?.(project);
      el.onclick = open;
      el.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      };
      el.querySelector("[data-card-settings]")?.addEventListener("click", event => {
        event.stopPropagation();
        onSettings?.(project);
      });
      return el;
    }

    function ventureCard(project, options = {}) {
      const { children = [], path = project.name, onOpen, onSettings } = options;
      const projects = children.filter(child => child.container_type === "project");
      const el = document.createElement("div");
      el.className = "venture-tile";
      el.innerHTML =
        `<header>${projectBadge(project, "venture-mark brand-badge")}` +
          `<span class="venture-kind">Venture</span>` +
          (project.locked ? `<span class="pill">always here</span>` : "") +
          `<button class="icon-btn" data-card-settings title="Venture settings">${icon("cog")}</button>` +
        `</header>` +
        `<h3 dir="auto">${escapeHtml(project.name)}</h3>` +
        `<p dir="auto">${escapeHtml(project.description ||
          "Brand workspace, reusable assets and production defaults.")}</p>` +
        `<div class="venture-metrics"><span><b>${projects.length}</b> project${projects.length === 1 ? "" : "s"}</span>` +
          `<span><b>${project.all_parts}</b> parts produced</span>` +
          `<span><b>$${project.all_cost.toFixed(4)}</b> audio spend</span></div>` +
        `<footer><div class="venture-project-peek">${projects
          .slice(0, 3).map(child => `<span>${escapeHtml(child.name)}</span>`).join("")}</div>` +
          `<span class="open-label">Open venture →</span></footer>`;
      return wireCard(el, project, { path, onOpen, onSettings });
    }

    function projectCard(project, options = {}) {
      const { children = [], path = project.name, onOpen, onSettings } = options;
      const library = project.container_type === "library";
      const el = document.createElement("div");
      el.className = `project-tile${library ? " asset-root-tile" : ""}`;
      el.innerHTML =
        `<div class="project-tile-mark">${projectBadge(project)}</div>` +
        `<div class="project-tile-copy"><span class="project-kind">${library ? "Venture library" : "Project"}</span>` +
          `<h3 dir="auto">${escapeHtml(project.name)}</h3>` +
          `<p dir="auto">${escapeHtml(project.description || (library
            ? "Intros, outros, music and stingers shared across the venture."
            : "Organize finished pieces into Productions."))}</p>` +
          `<div class="project-tile-meta"><span>${children.length} ${library ? "collection" : "Production"}${children.length === 1 ? "" : "s"}</span>` +
            `<span>${library ? project.all_files : project.all_parts} ${library ? "file" : "part"}${(library ? project.all_files : project.all_parts) === 1 ? "" : "s"}</span></div></div>` +
        (project.locked ? "" : `<button class="icon-btn" data-card-settings title="Project settings">${icon("cog")}</button>`) +
        `<span class="project-open">Open →</span>`;
      return wireCard(el, project, { path, onOpen, onSettings });
    }

    function folderCard(project, options = {}) {
      const { path = project.name, onOpen, onSettings } = options;
      const inbox = project.container_type === "inbox" || isBucket(project);
      const library = project.container_type === "asset_collection";
      const el = document.createElement("div");
      el.className = `folder-tile${inbox ? " inbox" : ""}${library ? " library-collection-tile" : ""}`;
      el.innerHTML =
        `<div class="folder-tile-mark">${projectBadge(project)}</div>` +
        `<div class="folder-tile-copy"><span class="folder-kind">${inbox ? "Inbox" :
          library ? "Asset collection" : "Production · finished piece"}</span>` +
          `<h3 dir="auto">${escapeHtml(project.name)}</h3>` +
          (project.description ? `<p dir="auto">${escapeHtml(project.description)}</p>` : "") +
          `<span class="folder-parts">${library ? project.all_files : project.all_parts} ${library ? "file" : "part"}${(library ? project.all_files : project.all_parts) === 1 ? "" : "s"}</span></div>` +
        (inbox || project.locked ? "" : `<button class="icon-btn" data-card-settings title="Production settings">${icon("cog")}</button>`) +
        `<span class="folder-open">›</span>`;
      return wireCard(el, project, { path, onOpen, onSettings });
    }

    function picker(project, options = {}) {
      const { depth = 0, blocked = "", current = false, selected = false,
              onSelect } = options;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "picker-row";
      row.style.paddingLeft = `${8 + depth * 18}px`;
      row.disabled = !!blocked;
      row.title = blocked || `Choose ${project.name}`;
      row.setAttribute("aria-selected", String(selected));
      row.innerHTML =
        projectBadge(project, "folder-badge") +
        `<span class="nm" dir="auto">${escapeHtml(project.name)}</span>` +
        (current ? `<span class="here">where it is now</span>` : "") +
        `<span class="ct">${countOf(project) || ""}</span>`;
      row.onclick = () => onSelect?.(project, row);
      return row;
    }

    return Object.freeze({ rail, ventureCard, projectCard, folderCard, picker });
  }

  global.ProjectHierarchyViews = Object.freeze({ create });
})(window);
