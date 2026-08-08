/* Transport shared by every browser client. Domain services know endpoints;
   features receive domain methods and never know fetch, headers or guards. */
(function exposeStudioApiClient(global) {
  "use strict";

  function create({ fetchImpl = global.fetch.bind(global), confirmSpend } = {}) {
    async function decode(response) {
      try {
        const payload = await response.json();
        if (!response.ok && !payload.error)
          payload.error = `Request failed (${response.status}).`;
        return payload;
      } catch {
        return { error: `The server returned an unreadable response (${response.status}).`,
                 http_status: response.status };
      }
    }

    async function send(path, options = {}) {
      try {
        return await decode(await fetchImpl(path, options));
      } catch {
        return { error: "Voice Studio could not reach its server. Check that it is running, then try again.",
                 network_error: true };
      }
    }

    function request(path, body, extraHeaders) {
      if (body === undefined) return send(path);
      return send(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify(body),
      });
    }

    function upload(path, body, headers = {}) {
      return send(path, { method: "POST", headers, body });
    }

    async function spendGuarded(path, body, describe) {
      let result = await request(path, body);
      if (!result.needs_confirmation) return result;
      const approved = await confirmSpend?.({
        describe,
        estimate: Number(result.estimate || 0),
        warnAbove: Number(result.warn_above || 0),
      });
      if (!approved) return null;
      result = await request(path, { ...body, confirmed: true });
      return result;
    }

    return Object.freeze({ request, upload, spendGuarded });
  }

  global.StudioApiClient = Object.freeze({ create });
})(window);
