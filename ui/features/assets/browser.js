/* The venture-library browser. It owns search, destination and dialog state;
   loading, playback, insertion and project refresh are injected by the app. */
(function exposeStudioAssetBrowser(global) {
  "use strict";

  function create(deps) {
    const { get, loadAssets, insertAsset, afterInsert, playAsset, stopPlayer,
            voiceAvatar, voiceLabel, clock, escapeHtml } = deps;
    const browser = {
      context: null,
      data: null,

      async open({ projectId, projectName, at = null }) {
        this.context = { projectId, projectName, at };
        this.data = await loadAssets(projectId);
        const assets = (this.data.assets || []).filter(asset => asset.collection !== "music");
        const venture = this.data.venture || "This venture";
        get("assetTitle").textContent = at === null
          ? "Add from the venture library" : "Insert from the venture library";
        get("assetWhere").textContent = `${venture} · ${assets.length} reusable ` +
          `clip${assets.length === 1 ? "" : "s"} · ${this.destination()}`;
        get("assetSearch").value = "";
        get("assetSearch").hidden = !assets.length;
        get("assetStatus").textContent = "";
        get("assetStatus").className = "status";
        this.draw();
        get("assetDialog").showModal();
        if (assets.length) get("assetSearch").focus();
      },

      destination() {
        const { projectName, at } = this.context;
        if (at === null) return `adds to the end of “${projectName}”`;
        if (Number(at) === 0) return `adds before part 1 of “${projectName}”`;
        return `adds after part ${at} of “${projectName}”`;
      },

      draw() {
        const assets = (this.data?.assets || []).filter(asset => asset.collection !== "music");
        const venture = this.data?.venture || "this venture";
        const query = get("assetSearch").value.trim().toLowerCase();
        const box = get("assetList");
        box.innerHTML = "";
        if (!assets.length) {
          box.innerHTML = `<div class="empty"><b>The library is empty</b>` +
            `Upload an intro, outro or stinger inside ` +
            `<b>${escapeHtml(venture)} › Assets</b>. It will then be available ` +
            `to every production in this venture.</div>`;
          return;
        }
        const matches = assets.filter(asset => {
          const haystack = `${asset.folder} ${asset.text} ${asset.title || ""} ` +
            `${voiceLabel(asset.voice)}`;
          return !query || haystack.toLowerCase().includes(query);
        });
        if (!matches.length) {
          box.innerHTML = '<div class="empty compact"><b>No matching assets</b>Try another name, folder or voice.</div>';
          return;
        }

        let folder = null;
        for (const asset of matches) {
          if (asset.folder !== folder) {
            folder = asset.folder;
            const heading = document.createElement("div");
            heading.className = "asset-group-heading";
            heading.innerHTML = `<span>${escapeHtml(folder)}</span><small>` +
              `${matches.filter(item => item.folder === folder).length}</small>`;
            box.appendChild(heading);
          }
          box.appendChild(this.row(asset));
        }
      },

      row(asset) {
        const row = document.createElement("div");
        row.className = "asset-row";
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "icon-btn asset-preview";
        preview.title = `Hear ${asset.title || asset.text || "this asset"}`;
        preview.setAttribute("aria-label", preview.title);
        preview.textContent = "▶";
        preview.onclick = () => playAsset(asset, preview);

        const identity = document.createElement("div");
        identity.className = "asset-identity";
        identity.innerHTML = voiceAvatar(asset.voice, 30);

        const body = document.createElement("span");
        body.className = "body";
        body.innerHTML = `<b dir="auto">${escapeHtml((asset.title || asset.text || "Untitled asset").slice(0, 90))}</b>` +
          `<span>${escapeHtml(voiceLabel(asset.voice))}</span>`;

        const length = document.createElement("span");
        length.className = "len";
        length.textContent = clock((asset.duration_ms || 0) / 1000);

        const insert = document.createElement("button");
        insert.type = "button";
        insert.className = "ghost fit asset-insert";
        insert.textContent = "Insert";
        insert.onclick = async () => {
          insert.disabled = true;
          insert.textContent = "Inserting…";
          const context = { ...this.context };
          const result = await insertAsset({
            projectId: context.projectId, assetId: asset.id, at: context.at,
          });
          if (result.error) {
            insert.disabled = false;
            insert.textContent = "Insert";
            get("assetStatus").textContent = result.error;
            get("assetStatus").className = "status err";
            return;
          }
          this.close();
          await afterInsert({ context, asset, result });
        };

        row.append(preview, identity, body, length, insert);
        return row;
      },

      close() {
        stopPlayer();
        if (get("assetDialog").open) get("assetDialog").close();
        this.context = null;
        this.data = null;
      },
    };

    get("assetSearch").addEventListener("input", () => browser.draw());
    get("assetCancel").addEventListener("click", () => browser.close());
    get("assetDialog").addEventListener("cancel", event => {
      event.preventDefault();
      browser.close();
    });
    return browser;
  }

  global.StudioAssetBrowser = Object.freeze({ create });
})(window);
