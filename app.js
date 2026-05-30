import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://PROJECT_ID.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "PUBLISHABLE_KEY_ONLY";
const DASHBOARD_LABEL = "github-pages-dashboard";
const POLL_MS = 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  selectedDeviceId: "",
  devices: [],
  deviceShadow: null,
  telemetry: [],
  events: [],
  commands: [],
  session: null,
  demoMode: false,
  channels: [],
};

const $ = (id) => document.getElementById(id);

const el = {
  deviceSelect: $("device-select"),
  authState: $("auth-state"),
  authForm: $("auth-form"),
  authEmail: $("auth-email"),
  authPassword: $("auth-password"),
  btnDemo: $("btn-demo"),
  btnSignout: $("btn-signout"),
  btnEmergency: $("btn-emergency"),
  warnings: $("warnings"),
  commandFeedback: $("command-feedback"),
  beam: $("beam"),
  beamRaw: $("beam-raw"),
  beamFused: $("beam-fused"),
  eventsList: $("events-list"),
  commandsList: $("commands-list"),
  leftPercent: $("left-percent"),
  rightPercent: $("right-percent"),
  leftValue: $("left-value"),
  rightValue: $("right-value"),
  btnSendManual: $("btn-send-manual"),
  btnPidSave: $("btn-pid-save"),
  pidForm: $("pid-form"),
};

function fmt(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  return Number(v).toFixed(digits);
}

function setFeedback(message, isError = false) {
  el.commandFeedback.textContent = message;
  el.commandFeedback.style.color = isError ? "#ff6b76" : "#7ad7ff";
}

function setPill(id, text, type = "neutral") {
  const node = $(id);
  node.textContent = text;
  node.style.background = {
    ok: "#1f5735",
    warn: "#5a3a18",
    bad: "#60242a",
    neutral: "#2a3450",
  }[type] || "#2a3450";
}

function renderWarnings() {
  const banners = [];
  const ds = state.deviceShadow;
  if (!state.selectedDeviceId) banners.push("<span class='warn-banner'>No device selected</span>");
  if (ds && ds.cloud_control_enabled === false) banners.push("<span class='warn-banner'>Cloud control disabled</span>");
  if (ds && ds.online === false) banners.push("<span class='warn-banner'>Device offline</span>");
  if (state.demoMode) banners.push("<span class='warn-banner'>Demo mode enabled</span>");
  el.warnings.innerHTML = banners.join("");
}

function renderDeviceShadow() {
  const ds = state.deviceShadow;
  if (!ds) {
    setPill("status-online", "unknown", "neutral");
    setPill("status-mode", "-", "neutral");
    setPill("status-armed", "-", "neutral");
    setPill("status-mpu", "-", "neutral");
    setPill("status-cloud", "-", "neutral");
    renderWarnings();
    return;
  }

  setPill("status-online", ds.online ? "online" : "offline", ds.online ? "ok" : "bad");
  setPill("status-mode", ds.mode || "-", "neutral");
  setPill("status-armed", ds.armed ? "armed" : "disarmed", ds.armed ? "warn" : "neutral");
  setPill("status-mpu", ds.mpu_healthy ? "healthy" : "unhealthy", ds.mpu_healthy ? "ok" : "bad");
  setPill("status-cloud", ds.cloud_control_enabled ? "enabled" : "disabled", ds.cloud_control_enabled ? "ok" : "bad");
  renderWarnings();
}

function renderBeam() {
  const t = state.telemetry[0] || {};
  const raw = Number(t.raw_angle_deg);
  const fused = Number(t.fused_angle_deg);
  const angle = Number.isFinite(fused) ? fused : Number.isFinite(raw) ? raw : 0;
  el.beam.style.transform = `rotate(${angle}deg)`;
  el.beamRaw.textContent = fmt(raw, 2);
  el.beamFused.textContent = fmt(fused, 2);
}

function renderTelemetry() {
  const t = state.telemetry[0] || {};
  [
    "raw_angle_deg",
    "fused_angle_deg",
    "pitch_deg",
    "roll_deg",
    "gyro_roll_dps",
    "temp_c",
  ].forEach((k) => {
    const node = $(`metric-${k}`);
    if (node) node.textContent = fmt(t[k], 2);
  });

  $("metric-left_motor").textContent = `${fmt(t.left_motor_percent, 1)}% / ${fmt(t.left_motor_us, 0)}us`;
  $("metric-right_motor").textContent = `${fmt(t.right_motor_percent, 1)}% / ${fmt(t.right_motor_us, 0)}us`;
}

function renderLogs() {
  el.eventsList.innerHTML = state.events
    .map((item) => `<li>[${new Date(item.created_at || Date.now()).toLocaleTimeString()}] ${item.event_type || "event"} ${item.message || ""}</li>`)
    .join("");

  el.commandsList.innerHTML = state.commands
    .map((item) => `<li>[${new Date(item.created_at || Date.now()).toLocaleTimeString()}] ${item.command_type} → <strong>${item.status || "pending"}</strong></li>`)
    .join("");
}

function updateControlState() {
  const disabled = !state.selectedDeviceId;
  document.querySelectorAll("button.cmd").forEach((btn) => {
    btn.disabled = disabled;
  });
  el.btnEmergency.disabled = disabled;
}

function setDeviceOptions() {
  const options = [`<option value="">Select device</option>`].concat(
    state.devices.map((d) => `<option value="${d}" ${d === state.selectedDeviceId ? "selected" : ""}>${d}</option>`),
  );
  el.deviceSelect.innerHTML = options.join("");
}

async function loadDeviceShadow() {
  const { data, error } = await supabase
    .from("device_shadow")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const seen = new Set();
  const rows = [];
  for (const row of data || []) {
    if (!row.device_id || seen.has(row.device_id)) continue;
    seen.add(row.device_id);
    rows.push(row);
  }

  state.devices = rows.map((r) => r.device_id);
  if (!state.selectedDeviceId && state.devices.length) state.selectedDeviceId = state.devices[0];
  state.deviceShadow = rows.find((r) => r.device_id === state.selectedDeviceId) || null;

  setDeviceOptions();
  renderDeviceShadow();
  updateControlState();
}

async function loadTelemetry() {
  if (!state.selectedDeviceId) {
    state.telemetry = [];
    renderBeam();
    renderTelemetry();
    return;
  }
  const { data, error } = await supabase
    .from("telemetry_samples")
    .select("*")
    .eq("device_id", state.selectedDeviceId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  state.telemetry = data || [];
  renderBeam();
  renderTelemetry();
}

async function loadEvents() {
  if (!state.selectedDeviceId) {
    state.events = [];
    renderLogs();
    return;
  }
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("device_id", state.selectedDeviceId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  state.events = data || [];
  renderLogs();
}

async function loadCommands() {
  if (!state.selectedDeviceId) {
    state.commands = [];
    renderLogs();
    return;
  }
  const { data, error } = await supabase
    .from("remote_commands")
    .select("*")
    .eq("device_id", state.selectedDeviceId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  state.commands = data || [];
  renderLogs();
}

async function refreshAll() {
  try {
    await loadDeviceShadow();
    await Promise.all([loadTelemetry(), loadEvents(), loadCommands()]);
  } catch (err) {
    setFeedback(`Load failed: ${err.message}`, true);
  }
}

async function sendCommand(commandType, payload = {}, { priority, expiryMs = 10000 } = {}) {
  if (!state.selectedDeviceId) {
    setFeedback("Select a device first", true);
    return;
  }

  const command = {
    device_id: state.selectedDeviceId,
    command_type: commandType,
    payload,
    status: "pending",
    expires_at: new Date(Date.now() + expiryMs).toISOString(),
    requested_by_label: DASHBOARD_LABEL,
  };
  if (priority !== undefined) command.priority = priority;

  const { error } = await supabase.from("remote_commands").insert(command);
  if (error) {
    setFeedback(`Command failed: ${error.message}`, true);
    return;
  }

  setFeedback(`Command sent: ${commandType}`);
  await loadCommands();
}

function bindBasicControls() {
  el.deviceSelect.addEventListener("change", async (e) => {
    state.selectedDeviceId = e.target.value;
    await Promise.all([loadDeviceShadow(), loadTelemetry(), loadEvents(), loadCommands()]);
  });

  el.leftPercent.addEventListener("input", () => (el.leftValue.textContent = el.leftPercent.value));
  el.rightPercent.addEventListener("input", () => (el.rightValue.textContent = el.rightPercent.value));

  document.querySelectorAll("button.cmd[data-command]").forEach((btn) => {
    btn.addEventListener("click", () => sendCommand(btn.dataset.command, {}));
  });

  el.btnSendManual.addEventListener("click", () => {
    const left = Math.min(40, Number(el.leftPercent.value));
    const right = Math.min(40, Number(el.rightPercent.value));
    sendCommand("manual_set_motors", { left_percent: left, right_percent: right, ttl_s: 3 });
  });

  el.btnEmergency.addEventListener("click", () => {
    sendCommand("emergency_stop", {}, { priority: 100, expiryMs: 10000 });
  });

  el.btnPidSave.addEventListener("click", () => {
    const formData = new FormData(el.pidForm);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (value === "") continue;
      const asNum = Number(value);
      payload[key] = Number.isFinite(asNum) ? asNum : value;
    }
    if (payload.max_motor_percent !== undefined) {
      payload.max_motor_percent = Math.min(40, Number(payload.max_motor_percent));
    }
    sendCommand("pid_update_config", payload);
  });
}

async function setupAuth() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;
  } catch (_err) {
    state.session = null;
  }

  updateAuthStatus();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAuthStatus();
  });

  el.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    if (!email || !password) {
      setFeedback("Provide email and password", true);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFeedback(`Auth failed (${error.message}). Use demo mode if auth is not configured.`, true);
      return;
    }
    state.demoMode = false;
    setFeedback("Signed in");
  });

  el.btnDemo.addEventListener("click", () => {
    state.demoMode = true;
    updateAuthStatus();
    renderWarnings();
  });

  el.btnSignout.addEventListener("click", async () => {
    state.demoMode = false;
    await supabase.auth.signOut();
    setFeedback("Signed out");
  });
}

function updateAuthStatus() {
  if (state.demoMode) {
    el.authState.textContent = "Auth: demo mode (commands still use publishable key permissions)";
    return;
  }
  if (state.session?.user?.email) {
    el.authState.textContent = `Auth: ${state.session.user.email}`;
    return;
  }
  el.authState.textContent = "Auth: not signed in (use auth or demo mode)";
}

function setupRealtimeAndPolling() {
  const onRefresh = () => {
    refreshAll();
  };

  const channelDefs = [
    { name: "device-shadow", table: "device_shadow", event: "UPDATE" },
    { name: "events", table: "events", event: "INSERT" },
    { name: "commands", table: "remote_commands", event: "UPDATE" },
  ];

  state.channels = channelDefs.map((def) =>
    supabase
      .channel(`dashboard-${def.name}`)
      .on("postgres_changes", { event: def.event, schema: "public", table: def.table }, onRefresh)
      .subscribe(),
  );

  setInterval(onRefresh, POLL_MS);
}

async function init() {
  updateControlState();
  renderWarnings();
  bindBasicControls();
  await setupAuth();
  await refreshAll();
  setupRealtimeAndPolling();
}

init();
