// ===== THE PASS: the rules (Tasks tab; Tim, Oct 28 2026) =====
// Pure functions, no DOM. A ticket is never stored: it's folded from its
// events (who did what, when). The server keeps the same rules in Python
// (pass_api.py fold / apply / derive / clarity) and refuses an event they
// don't allow; tests/test_pass.py runs both on the same events.
// Loaded by the hub page before pass.js, and by node in the tests.
(function (root) {
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const LEVELS = [null,
    { n: 1, name: "Do as directed", desc: "Follow the plan exactly. Ask before changing anything." },
    { n: 2, name: "Recommend", desc: "Look into it and bring me options. I decide." },
    { n: 3, name: "Decide, then tell me", desc: "You choose the approach. Tell me before you act." },
    { n: 4, name: "Act, then report", desc: "Handle it your way. Tell me what you did." },
    { n: 5, name: "Own it", desc: "It's fully yours. Just turn it in when it's done." }];
  const CADENCES = { none: "No check-ins", midpoint: "Halfway", daily: "Daily", weekly: "Weekly" };
  const OPEN = ["delegated", "negotiating", "accepted", "in_progress", "blocked", "submitted"];
  const WORKING = ["accepted", "in_progress", "blocked"];
  const OWNER_LOAD = ["delegated", "negotiating", "accepted", "in_progress", "blocked"];

  function changeDue(t, due, at) {
    if (at > t.due) t.lateExtension = true;   // moved after it was already late
    t.due = due; t.dueChanges++;
  }

  function apply(t, e) {
    const d = e.data || {}, s = t.status;
    const isOwner = e.by === t.owner, isDel = e.by === t.delegator;
    const open = OPEN.includes(s), working = WORKING.includes(s);
    switch (e.type) {
      case "backbrief":
        if (!isOwner || s !== "delegated" || !d.summary) return false;
        t.backbrief = { summary: d.summary, plan: d.plan || "", at: e.at };
        t.acceptedAt = e.at; t.status = "accepted"; t.health = "on_track"; return true;
      case "counter":
        if (!isOwner || s !== "delegated" || !d.due) return false;
        t.counter = { due: d.due, reason: d.reason || "", at: e.at }; t.status = "negotiating"; return true;
      case "counter_accept":
        if (!isDel || s !== "negotiating") return false;
        changeDue(t, t.counter.due, e.at); t.counter = null; t.status = "delegated"; return true;
      case "counter_reject":
        if (!isDel || s !== "negotiating") return false;
        t.counter = null; t.status = "delegated"; return true;
      case "checkin": {
        if (!isOwner || !working) return false;
        const h = ["on_track", "at_risk", "blocked"].includes(d.health) ? d.health : "on_track";
        t.checkins.push({ at: e.at, health: h, note: d.note || "" });
        t.health = h; t.status = h === "blocked" ? "blocked" : "in_progress"; return true;
      }
      case "submit":
        if (!isOwner || !working) return false;
        t.submittedAt = e.at; t.evidence = d.evidence || ""; if (d.photo) t.photo = d.photo;
        t.status = "submitted"; return true;
      case "verify":
        if (!isDel || s !== "submitted") return false;
        t.rating = d.rating === "elite" ? "elite" : "meets"; t.feedback = d.feedback || ""; t.aar = d.aar || "";
        t.closedAt = e.at; t.onTime = t.submittedAt <= t.due && !t.lateExtension; t.status = "verified"; return true;
      case "return":
        if (!isDel || s !== "submitted") return false;
        t.returns++; t.lastReturn = { at: e.at, feedback: d.feedback || "" };
        t.submittedAt = null; t.status = "in_progress"; t.health = "at_risk"; return true;
      case "edit":
        if (!isDel || !open) return false;
        ["title", "outcome", "intent", "priority", "area", "cadence"].forEach(k => { if (typeof d[k] === "string" && d[k]) t[k] = d[k]; });
        if (d.level) t.level = Math.min(5, Math.max(1, parseInt(d.level, 10) || t.level));
        if (d.due && d.due !== t.due) changeDue(t, d.due, e.at);
        return true;
      case "reassign":
        if (!isDel || !open || !d.owner || d.owner === t.owner) return false;
        t.owner = d.owner; t.status = "delegated"; t.backbrief = null; t.acceptedAt = null;
        t.delegatedAt = e.at; t.checkins = []; t.health = null; t.counter = null; t.submittedAt = null; return true;
      case "cancel":
        if (!isDel || !open) return false;
        t.status = "cancelled"; t.closedAt = e.at; t.cancelReason = d.reason || ""; return true;
      case "comment":
        return !!d.text;
    }
    return false;
  }

  function fold(events) {
    const tasks = {};
    const sorted = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const e of sorted) {
      if (e.type === "created") {
        const d = e.data;
        tasks[e.taskId] = {
          id: e.taskId, number: d.number, title: d.title, outcome: d.outcome || "", intent: d.intent || "",
          owner: d.owner, delegator: e.by, due: d.due, originalDue: d.due, level: d.level || 3,
          cadence: d.cadence || "midpoint", priority: d.priority || "normal", area: d.area || "", clarity: d.clarity || 0,
          createdAt: e.at, delegatedAt: e.at, status: "delegated", health: null, backbrief: null, acceptedAt: null,
          counter: null, checkins: [], submittedAt: null, evidence: "", photo: null, returns: 0, rating: null,
          feedback: "", aar: "", closedAt: null, onTime: null, lateExtension: false, dueChanges: 0,
          timeline: [{ ...e, ok: true }], lastAt: e.at
        };
        continue;
      }
      const t = tasks[e.taskId];
      if (!t) continue;
      const ok = apply(t, e);
      t.timeline.push({ ...e, ok });
      if (ok) t.lastAt = e.at;
    }
    return tasks;
  }

  function derive(t, now) {
    const open = OPEN.includes(t.status);
    const r = { open };
    r.late = open && t.status !== "submitted" && now > t.due;
    r.dueSoon = open && !r.late && t.status !== "submitted" && t.due - now < 12 * HOUR;
    r.actor = { delegated: t.owner, negotiating: t.delegator, accepted: t.owner, in_progress: t.owner, blocked: t.owner, submitted: t.delegator }[t.status] || null;
    r.nextCheckin = null;
    if (WORKING.includes(t.status) && t.cadence !== "none" && t.acceptedAt) {
      if (t.cadence === "midpoint") {
        if (!t.checkins.length) r.nextCheckin = t.acceptedAt + (t.due - t.acceptedAt) / 2;
      } else {
        const last = t.checkins.length ? t.checkins[t.checkins.length - 1].at : t.acceptedAt;
        r.nextCheckin = last + (t.cadence === "daily" ? DAY : 7 * DAY);
      }
      if (r.nextCheckin && r.nextCheckin >= t.due) r.nextCheckin = null;
    }
    r.checkinDue = !!(r.nextCheckin && now >= r.nextCheckin);
    r.unheardFor = t.status === "delegated" ? now - t.delegatedAt : 0;
    r.unheard = r.unheardFor > 12 * HOUR;
    return r;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // One closed ticket's score, 0..1: half on-time, half quality, minus redos.
  function ticketScore(t) {
    return clamp(0.5 * (t.onTime ? 1 : 0) + 0.5 * (t.rating === "elite" ? 1 : 0.7) - 0.2 * Math.min(t.returns, 2), 0, 1);
  }

  const PRIOR = 0.6, PRIOR_WEIGHT = 3;   // new people start at 60 and move as evidence arrives

  function personStats(tasks, pid, now) {
    const all = Object.values(tasks);
    const owned = all.filter(t => t.owner === pid);
    const verified = owned.filter(t => t.status === "verified").sort((a, b) => b.closedAt - a.closedAt);
    const n = verified.length;
    const sum = verified.reduce((a, t) => a + ticketScore(t), 0);
    const trust = Math.round(100 * (sum + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT));
    const rate = f => (n ? verified.filter(f).length / n : null);
    const heard = owned.filter(t => t.acceptedAt).map(t => (t.acceptedAt - t.delegatedAt) / HOUR);
    const load = owned.filter(t => OWNER_LOAD.includes(t.status)).length;
    const late = owned.filter(t => derive(t, now).late).length;

    const recent = verified.slice(0, 10);
    const maxLevel = recent.length ? Math.max(...recent.map(t => t.level)) : null;
    const atMax = recent.filter(t => t.level === maxLevel);
    let advice = null;
    if (n >= 3 && trust < 55) {
      advice = { kind: "tighten", text: "Tighten the loop: level 1–2 and daily check-ins until on-time work is steady." };
    } else if (maxLevel && maxLevel < 5 && atMax.length >= 3 && mean(atMax.map(ticketScore)) >= 0.8) {
      advice = { kind: "ready", level: maxLevel + 1, text: `Ready for level ${maxLevel + 1}: ${LEVELS[maxLevel + 1].name}` };
    }
    const suggestedLevel = advice ? (advice.kind === "ready" ? advice.level : Math.min(2, maxLevel || 2)) : maxLevel;

    const given = all.filter(t => t.delegator === pid);
    const verifyLag = median(given.filter(t => t.status === "verified").map(t => (t.closedAt - t.submittedAt) / HOUR));
    return {
      n, trust, load, late,
      onTimeRate: rate(t => t.onTime), eliteRate: rate(t => t.rating === "elite"), firstPassRate: rate(t => t.returns === 0),
      heardHours: median(heard), maxLevel, suggestedLevel, advice, verified,
      given: given.length, awaitingVerify: given.filter(t => t.status === "submitted").length,
      verifyLagHours: verifyLag, avgClarity: mean(given.map(t => t.clarity || 0))
    };
  }

  // Seven things a clean handoff has. Mirrors how good orders are written.
  function clarity(d, now) {
    const due = d.due || 0, outcome = (d.outcome || "").trim();
    const items = [
      { ok: !!d.owner, label: "One owner", hint: "Pick the one person who owns it." },
      { ok: (d.title || "").trim().length >= 6, label: "Task named", hint: "Name the task in a few words." },
      { ok: outcome.length >= 20, label: "Done looks like", hint: "Describe what finished looks like." },
      { ok: /\d|\bevery\b|\ball\b|\beach\b|\bzero\b|\bno\b|\bnone\b|\bby\b|\bbefore\b/i.test(outcome), label: "Checkable", hint: "Make done checkable: a number, \"every\", \"by 2 PM\"." },
      { ok: (d.intent || "").trim().length >= 12, label: "Why it matters", hint: "Say why it matters so they can make good calls." },
      { ok: due > now, label: "Due time", hint: "Set a due time in the future." },
      { ok: !((d.level || 3) <= 2 || due - now > 2 * DAY) || (d.cadence && d.cadence !== "none"), label: "Check-ins fit", hint: "Add check-ins for low-authority or multi-day work." }
    ];
    return { score: items.filter(i => i.ok).length, max: items.length, items };
  }

  const api = { LEVELS, CADENCES, OPEN, WORKING, HOUR, DAY, fold, derive, personStats, clarity, ticketScore };
  root.PassEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
