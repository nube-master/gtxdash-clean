/* GTX Live Viewers Snippet v7-6
 * Multi-strategy player time detection (VTurb iframe + window.smartplayer + raw video + temporal fallback).
 * Meta tags suportadas:
 *   <meta name="player-id" content="...">
 *   <meta name="player-name" content="[ML-TOM] PITCH 33:13">
 *   <meta name="pitch-second" content="1990">
 *   <meta name="operation-slug" content="gtx-midia">
 *   <meta name="product-slug" content="mmp">
 */
(function () {
  var BASE = "https://taeduxiandktefcwgspx.supabase.co/functions/v1";
  var PING_URL = BASE + "/viewer-ping";
  var EVENT_URL = BASE + "/viewer-event";
  var INTERVAL = 15000;

  var currentSec = 0;
  var sessionStartMs = Date.now();

  function sid() {
    var k = "_gtx_live_sid";
    var v = sessionStorage.getItem(k);
    if (!v) {
      v = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(36).slice(2));
      sessionStorage.setItem(k, v);
    }
    return v;
  }
  function deviceType() {
    var ua = navigator.userAgent.toLowerCase();
    if (/tablet|ipad/.test(ua)) return "tablet";
    if (/mobile|iphone|android/.test(ua)) return "mobile";
    return "desktop";
  }
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute("content") : null;
  }
  function updateSec(s) {
    s = Number(s) || 0;
    if (s > currentSec) currentSec = Math.floor(s);
  }
  function playerInfo() {
    var v = document.querySelector("video");
    if (v && v.currentTime) updateSec(v.currentTime);
    try {
      if (window.smartplayer && window.smartplayer.instances) {
        var insts = window.smartplayer.instances;
        for (var k in insts) {
          var p = insts[k];
          if (p && typeof p.getCurrentTime === "function") updateSec(p.getCurrentTime());
          else if (p && typeof p.currentTime === "number") updateSec(p.currentTime);
        }
      }
    } catch (e) {}
    var vturb = document.querySelector('[id^="vid_"]');
    var pid = (vturb && vturb.id && vturb.id.replace(/^vid_/, "")) || meta("player-id") || "unknown";
    var pname = meta("player-name") || document.title || null;
    return {
      player_id: pid,
      player_name: pname,
      current_second_in_video: currentSec,
    };
  }
  function utm() {
    var p = new URLSearchParams(location.search);
    var camp = p.get("utm_campaign");
    var ad = p.get("ad_id");
    if (!ad && camp) {
      var m = camp.match(/\[([HVAD0-9]{6,})\]/);
      if (m) ad = m[1];
    }
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: camp,
      utm_content: p.get("utm_content"),
      utm_term: p.get("utm_term"),
      ad_id: ad,
      clickid: p.get("rtkcid") || p.get("tid") || p.get("subid") || p.get("clickid") || null,
    };
  }
  function send(url, payload, beacon) {
    try {
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, JSON.stringify(payload));
        return;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  function checkPitch(pitchSec) {
    if (sessionStorage.getItem("_gtx_pitch")) return;
    if (currentSec >= pitchSec) {
      sessionStorage.setItem("_gtx_pitch", "1");
      event("pitch_reached", currentSec);
      return;
    }
    var elapsedSec = (Date.now() - sessionStartMs) / 1000;
    if (elapsedSec >= pitchSec) {
      sessionStorage.setItem("_gtx_pitch", "1");
      event("pitch_reached", Math.floor(elapsedSec));
    }
  }
  function ping() {
    var pi = playerInfo();
    var u = utm();
    send(PING_URL, Object.assign({
      session_id: sid(),
      player_id: pi.player_id,
      player_name: pi.player_name,
      current_second_in_video: pi.current_second_in_video,
      pitch_reached: !!sessionStorage.getItem("_gtx_pitch"),
      cta_clicked: !!sessionStorage.getItem("_gtx_cta"),
      device_type: deviceType(),
      user_agent: navigator.userAgent,
      op: meta("operation-slug"),
      product_slug: meta("product-slug"),
    }, u));
  }
  function event(type, second, metadata) {
    var pi = playerInfo();
    send(EVENT_URL, {
      session_id: sid(),
      player_id: pi.player_id,
      event_type: type,
      second_in_video: second != null ? second : pi.current_second_in_video,
      metadata: metadata || null,
    }, type === "exit");
  }

  function start() {
    event("vsl_start", 0);
    ping();
    setInterval(ping, INTERVAL);
    window.addEventListener("beforeunload", function () { event("exit"); });
    window.addEventListener("pagehide", function () { event("exit"); });
    var pitchSec = parseInt(meta("pitch-second") || "1990", 10);

    // 1. <video> timeupdate (re-attach via MutationObserver)
    var attachedVideos = new WeakSet();
    function attachPitchListener() {
      document.querySelectorAll("video").forEach(function (v) {
        if (attachedVideos.has(v)) return;
        attachedVideos.add(v);
        v.addEventListener("timeupdate", function () {
          updateSec(v.currentTime);
          checkPitch(pitchSec);
        });
      });
    }
    attachPitchListener();
    new MutationObserver(attachPitchListener).observe(document.body, { childList: true, subtree: true });
    setInterval(attachPitchListener, 2000);

    // 2. postMessage do iframe VTurb (cross-origin compatível)
    window.addEventListener("message", function (ev) {
      try {
        var d = ev.data;
        if (!d) return;
        if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
        var t = null;
        if (typeof d.currentTime === "number") t = d.currentTime;
        else if (d.data && typeof d.data.currentTime === "number") t = d.data.currentTime;
        else if (typeof d.value === "number" && (d.name === "currentTime" || d.name === "time")) t = d.value;
        else if (typeof d.time === "number") t = d.time;
        if (t != null) {
          updateSec(t);
          checkPitch(pitchSec);
        }
      } catch (e) {}
    });

    // 3. Poll window.smartplayer + fallback temporal
    setInterval(function () {
      playerInfo();
      checkPitch(pitchSec);
    }, 3000);

    // CTA click
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a,button");
      if (!a) return;
      var txt = (a.textContent || "").toLowerCase();
      if (/comprar|comprar agora|buy|order|checkout|garantir|quero|cta/.test(txt) && !sessionStorage.getItem("_gtx_cta")) {
        sessionStorage.setItem("_gtx_cta", "1");
        event("cta_click");
      }
    }, true);
  }

  window.GTXLive = { ping: ping, event: event, updateSec: updateSec };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
