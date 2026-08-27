window.__ModuleLoader__.load({
  id: "dsh-remote",
  factory: (require) => {
    var module = { exports: {} };
    var React = require("react");
    var name = "dsh-remote";
    var inject = ["slots", "connection"];
    var CHANNEL = "/dsh-remote";
    var styles = {
      card: { maxWidth: 680, padding: 24, borderRadius: 16, border: "1px solid var(--dsw-alias-border-l2,#ddd)", background: "var(--dsw-alias-bg-layer-1,#fff)" },
      header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
      title: { margin: 0, fontSize: 22 },
      status: { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 999, fontSize: 13, background: "var(--dsw-alias-bg-layer-2,#f5f5f5)" },
      dot: { width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto" },
      intro: { margin: "18px 0 4px", textAlign: "center", fontSize: 16, fontWeight: 600 },
      row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
      button: { minHeight: 36, padding: "0 16px", borderRadius: 999, border: "1px solid var(--dsw-alias-border-l2,#ddd)", cursor: "pointer", background: "var(--dsw-alias-bg-layer-2,#f5f5f5)", color: "inherit" },
      primary: { minHeight: 38, padding: "0 18px", borderRadius: 999, border: "none", cursor: "pointer", background: "var(--dsw-alias-brand-primary,#4f6ef7)", color: "#fff" },
      danger: { minHeight: 36, padding: "0 16px", borderRadius: 999, border: "1px solid var(--dsw-alias-state-error-primary,#c33)", cursor: "pointer", background: "transparent", color: "var(--dsw-alias-state-error-primary,#c33)" },
      muted: { color: "var(--dsw-alias-label-tertiary,#777)", fontSize: 13, lineHeight: 1.6 },
      qr: { display: "block", width: 260, height: 260, maxWidth: "100%", margin: "14px auto", borderRadius: 14, background: "#fff" },
      devices: { marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--dsw-alias-border-l2,#ddd)" },
      deviceList: { display: "grid", gap: 10, listStyle: "none", margin: "14px 0 0", padding: 0 },
      device: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, border: "1px solid var(--dsw-alias-border-l2,#ddd)" },
      deviceName: { margin: "0 0 3px", fontSize: 15, fontWeight: 650 },
      details: { marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--dsw-alias-border-l2,#ddd)" },
      summary: { cursor: "pointer", fontSize: 14, fontWeight: 600 },
      error: { color: "var(--dsw-alias-state-error-primary,#c33)", fontSize: 13, lineHeight: 1.5 }
    };

    function timeText(value, empty) {
      if (!value) return empty;
      var date = new Date(value);
      return Number.isNaN(date.getTime()) ? empty : date.toLocaleString();
    }

    function RemoteSettings(props) {
      var [status, setStatus] = React.useState(null);
      var [error, setError] = React.useState(null);
      var [busy, setBusy] = React.useState(false);
      var [revokeBusy, setRevokeBusy] = React.useState(null);
      var call = async (endpoint, payload) => {
        var result = await props.rpcCall(endpoint, payload || {});
        if (!result?.ok) throw new Error(result?.error?.message || "手机访问请求失败");
        return result.value;
      };
      var loadStatus = React.useCallback(async () => {
        try { setStatus(await call("remote.status")); } catch (e) { setError(e.message); }
      }, []);
      var loadAuthorizations = React.useCallback(async () => {
        try { setStatus(await call("remote.authorizations")); } catch (e) { setError(e.message); }
      }, []);
      React.useEffect(() => {
        loadStatus();
        var statusTimer = setInterval(loadStatus, 3000);
        return () => clearInterval(statusTimer);
      }, []);
      React.useEffect(() => {
        if (status?.phase !== "running") return undefined;
        loadAuthorizations();
        var devicesTimer = setInterval(loadAuthorizations, 15000);
        return () => clearInterval(devicesTimer);
      }, [status?.phase]);
      var act = async (endpoint, payload) => {
        setBusy(true); setError(null);
        try { setStatus(await call(endpoint, payload)); } catch (e) { setError(e.message); }
        finally { setBusy(false); }
      };
      var copy = async () => {
        try { await navigator.clipboard.writeText(status.connectUrl); }
        catch { setError("无法复制连接链接。"); }
      };
      var rotate = async () => {
        if (!window.confirm("重新生成后，旧二维码和全部已授权手机会立即失效。确定继续吗？")) return;
        await act("remote.rotate-pairing");
      };
      var revoke = async (device) => {
        if (!window.confirm(`撤销“${device.name}”的访问权限吗？其他手机不会受到影响。`)) return;
        setRevokeBusy(device.authorizationId); setError(null);
        try { setStatus(await call("remote.revoke-authorization", { authorizationId: device.authorizationId })); }
        catch (e) { setError(e.message); }
        finally { setRevokeBusy(null); }
      };
      var phase = status?.phase || "loading";
      var available = phase === "running";
      var working = phase === "starting" || phase === "registering" || phase === "loading";
      var disabled = phase === "disabled";
      var statusText = available ? "可连接" : working ? "正在准备…" : disabled ? "未开启" : "暂时不可用";
      var dotColor = available ? "#22a06b" : working ? "#d99a00" : disabled ? "#777" : "#c33";
      var technicalError = status?.error || status?.authorizationError || error;
      var devices = Array.isArray(status?.authorizations) ? status.authorizations : [];

      return React.createElement("section", { style: styles.card },
        React.createElement("div", { style: styles.header },
          React.createElement("h2", { style: styles.title }, "手机访问"),
          React.createElement("span", { style: styles.status },
            React.createElement("span", { style: { ...styles.dot, background: dotColor } }),
            statusText
          )
        ),
        status?.qrCodeDataUrl ? React.createElement(React.Fragment, null,
          React.createElement("p", { style: styles.intro }, "用手机相机扫描二维码"),
          React.createElement("img", { src: status.qrCodeDataUrl, alt: "DSH Remote 连接二维码", style: styles.qr }),
          React.createElement("p", { style: { ...styles.muted, textAlign: "center", margin: "0 auto", maxWidth: 420 } },
            "已安装 DSH Remote 会直接打开；未安装时会进入下载页面。"
          )
        ) : React.createElement(React.Fragment, null,
          React.createElement("p", { style: styles.intro }, working ? "正在生成连接二维码…" : disabled ? "手机访问尚未开启" : "暂时无法生成连接二维码"),
          !working ? React.createElement("div", { style: { ...styles.row, justifyContent: "center", marginTop: 14 } },
            React.createElement("button", { type: "button", style: styles.primary, disabled: busy, onClick: () => act("remote.start") }, disabled ? "开启手机访问" : "重试")
          ) : null
        ),
        !disabled ? React.createElement("section", { style: styles.devices },
          React.createElement("h3", { style: { margin: 0, fontSize: 17 } }, "已授权手机"),
          !status?.authorizationsLoaded ? React.createElement("p", { style: styles.muted }, "正在加载已授权手机…")
            : devices.length === 0 ? React.createElement("p", { style: styles.muted }, "还没有已授权手机。扫码连接后会显示在这里。")
            : React.createElement("ul", { style: styles.deviceList }, devices.map((device) =>
              React.createElement("li", { key: device.authorizationId, style: styles.device },
                React.createElement("div", null,
                  React.createElement("p", { style: styles.deviceName }, device.name),
                  React.createElement("div", { style: styles.muted }, device.platform === "ios" ? "iOS" : "Android", " · 授权于 ", timeText(device.authorizedAt, "未知")),
                  React.createElement("div", { style: styles.muted }, "最近使用：", timeText(device.lastSeenAt, "尚未使用"))
                ),
                React.createElement("button", {
                  type: "button",
                  style: styles.danger,
                  disabled: busy || revokeBusy !== null,
                  onClick: () => revoke(device)
                }, revokeBusy === device.authorizationId ? "正在撤销…" : "撤销授权")
              )
            ))
        ) : React.createElement("p", { style: { ...styles.muted, textAlign: "center" } }, "只有点击开启后，插件才会向托管服务注册这台 Mac 并启动加密隧道。"),
        technicalError ? React.createElement("p", { style: { ...styles.error, textAlign: "center" } }, "连接服务暂时不可用，请稍后重试。") : null,
        React.createElement("details", { style: styles.details },
          React.createElement("summary", { style: styles.summary }, "安全与高级设置"),
          React.createElement("div", { style: { marginTop: 14 } },
            React.createElement("p", { style: styles.muted }, "连接二维码等同于访问凭据。只分享给你信任的人。"),
            status?.connectUrl ? React.createElement("div", { style: styles.row },
              React.createElement("button", { type: "button", style: styles.button, disabled: busy, onClick: copy }, "复制连接链接"),
              React.createElement("button", { type: "button", style: styles.button, disabled: busy, onClick: rotate }, "重新生成二维码"),
              available ? React.createElement("button", { type: "button", style: styles.danger, disabled: busy, onClick: () => act("remote.stop") }, "暂停手机访问") : null
            ) : null,
            !disabled && !available && !working ? React.createElement("button", { type: "button", style: styles.primary, disabled: busy, onClick: () => act("remote.start") }, "开启手机访问") : null,
            React.createElement("p", { style: { ...styles.muted, marginBottom: 0 } }, "诊断状态：", phase),
            technicalError ? React.createElement("p", { style: styles.error }, technicalError) : null
          )
        )
      );
    }

    function isLoopbackLocation() {
      var host = String(window.location.hostname || "").toLowerCase();
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
    }

    function apply(ctx) {
      if (!isLoopbackLocation()) return;
      var rpcCall = (endpoint, payload, signal) => ctx.connection.rpc.call(CHANNEL, endpoint, payload, signal);
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-remote",
        order: 2,
        label: () => "手机访问",
        inject: () => ({ rpcCall })
      }, RemoteSettings));
    }

    module.exports = { name, inject, apply };
    return module.exports;
  }
});
