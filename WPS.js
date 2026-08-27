// name: WPS
// cron: 32 7,19 * * *
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
// ====================== YYB Go 账号（环境变量 YYB_SERVER = 地址@微信账号标识，多行） ======================
const SERVERS = (process.env.YYB_SERVER || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
if (!SERVERS.length) {
    console.error("未配置环境变量 YYB_SERVER，请设置后重试（格式：地址@微信账号标识，多行换行）");
    process.exit(1);
}
function parseYybGoEntry(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return { server: "", ref: "" };
    const atIndex = value.indexOf("@");
    if (atIndex === -1) {
        console.log("YYB_SERVER 格式应为 地址@微信账号标识，当前值: " + value);
        return { server: "", ref: "" };
    }
    let server = value.slice(0, atIndex).trim();
    const ref = value.slice(atIndex + 1).trim();
    if (server.startsWith("http://")) server = server.slice(7);
    else if (server.startsWith("https://")) server = server.slice(8);
    server = server.replace(/\/+$/, "");
    if (!server || !ref) return { server: "", ref: "" };
    return { server, ref };
}
async function getCode(server, appId = MINI_APP_ID) {
    const { server: parsedServer, ref } = parseYybGoEntry(server);
    if (!parsedServer || !ref) return null;
    const url = "http://" + parsedServer + "/wxapp/getCode";
    try {
        const headers = process.env.YYB_API_KEY ? { "X-API-Key": process.env.YYB_API_KEY } : {};
        const { data } = await axios.post(url, { ref, app_id: appId }, { timeout: 20000, proxy: false, headers });
        const code = data && data.data && data.data.result && data.data.result.code;
        if (!data || data.code !== 0 || !code) {
            console.log(parsedServer + " 获取code失败: " + JSON.stringify(data));
            return null;
        }
        console.log(parsedServer + " 获取code成功");
        return code;
    } catch (e) {
        console.log(parsedServer + " 获取code异常: " + e.message);
        return null;
    }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomSleep(min, max = min) {
  const lower = Math.max(0, Number(min) || 0);
  const upper = Math.max(lower, Number(max) || lower);
  return sleep(Math.floor(lower + Math.random() * (upper - lower + 1)));
}

function envFlag(name, fallback = true) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(value).trim().toLowerCase());
}

function envNumber(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function decodeJsonish(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return value;
  const text = value.trim();
  try {
    if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text);
  } catch (_) {}
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8").trim();
    if (decoded.startsWith("{") || decoded.startsWith("[")) return JSON.parse(decoded);
  } catch (_) {}
  return value;
}

function findNestedValue(value, keys, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return undefined;
  const current = decodeJsonish(value);
  if (current && typeof current === "object") {
    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null && current[key] !== "") return current[key];
    }
    for (const child of Object.values(current)) {
      const found = findNestedValue(child, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
let userIdx = 1;

const MINI_APP_ID = "wx2f333d84a103825d";
const ACCOUNT_PLUGIN_APPID = "wxe5f87d6a233b5aab";
const WPS_MPID = "app_op_act";
const CLIENT_TYPE = 1;
const TOKEN_CACHE_FILE = path.join(__dirname, "token_caches", "wps_token_cache.json");
try { fs.mkdirSync(path.dirname(TOKEN_CACHE_FILE), { recursive: true }); } catch (e) {}

const ACCOUNT_BASE = "https://account.wps.cn";
const PERSONAL_BUS = "https://personal-bus.wps.cn";
const PERSONAL_ACT = "https://personal-act.wps.cn";
const CLOCK_INFO = `${PERSONAL_BUS}/activity/clock_in/v1/info`;
const CLOCK_IN = `${PERSONAL_BUS}/activity/clock_in/v1/clock_in`;
const TASK_OUTLINE = `${PERSONAL_BUS}/activity/clock_in/v1/task/outline`;
const TASK_START_BROWSE = `${PERSONAL_BUS}/activity/clock_in/v1/task/start_browse`;
const TASK_FINISH_BROWSE = `${PERSONAL_BUS}/activity/clock_in/v1/task/finish_browse`;
const LOTTERY_TIMES = `${PERSONAL_BUS}/activity/clock_in/v1/task/lottery_times`;
const ACTIVITY_CONFIG = "https://personal-act.wpscdn.cn/srcapi/act/rubik-service/honeycomb-adapter/client/module-info?pid=113&mg_id=47736&id=48312";
const LOTTERY_PAGE = "https://personal-act.wps.cn/rubik2/portal/HD2024082815116866/YM2024082815122017";
const COMPONENT_ACTION = `${PERSONAL_ACT}/activity-rubik/activity/component_action`;
const LOTTERY_ACTIVITY = "HD2024082815116866";
const LOTTERY_PAGE_NO = "YM2024082815122017";
const LOTTERY_COMPONENT_NO = "ZJ2025092916516585";
const LOTTERY_COMPONENT_NODE_ID = "FN1766995952bvx3";

// 从附件脚本移植的活动配置。活动编号会变更，所有功能均可通过环境变量关闭。
const TASK_CENTER = {
  activity: "HD2025031821201822",
  page: "YM2025040908558269",
  component: "ZJ2025040709458367",
  node: "FN1744160180RthG",
  type: 35,
  filter: {
    cs_from: "web_vipcenter_banner_inpublic",
    mk_key: "4b9deqIfqNO3KCZrgH17WPH1kdzMoKUEvya",
    position: "pc_aty_ban3_kaixue_test_b",
  },
  lotteryComponent: "ZJ2025092916516585",
  lotteryNode: "FN1762345949vdR1",
  lotterySession: 2,
};
const WELFARE = {
  activity: "HD2025031721339450",
  page: "YM2025031721331326",
  component: "ZJ2025061815363325",
  node: "FN1750234948dBVL",
  filter: { cs_from: "ad_ucsty_rwzx", position: "ad_ucsty_rwzx" },
  lotteryComponent: "ZJ2025092916515917",
  lotteryNode: "FN1761875116m2x8",
  lotterySession: 1,
};
const CHALLENGE = {
  activity: "HD2025121517384715",
  page: "YM2025121517381164",
  component: "ZJ2025031817022062",
  node: "FN17642133971jKe",
  filter: { cs_from: "pc_ucsty_rwzx_task", position: "pc_rwzx_task" },
  type: 35,
};
const SVIP_MARKET_URL = "https://tiance.wps.cn/dce/exec/api/market/activity";
const SVIP_CHANNEL_CODE = "WPSPDFGJ1001";
const FEATURE_TASK_CENTER = envFlag("WPS_TASK_CENTER", true);
const FEATURE_WELFARE = envFlag("WPS_WELFARE", true);
const FEATURE_CHALLENGE = envFlag("WPS_CHALLENGE", true);
const FEATURE_SVIP_APPLET = envFlag("WPS_SVIP_APPLET", true);
const FEATURE_OFFICE_ASSISTANT = envFlag("WPS_OFFICE_ASSISTANT", false);
const BROWSE_WAIT_SECONDS = envNumber("WPS_BROWSE_WAIT", 10, 1, 120);
const LOTTERY_LIMIT = envNumber("WPS_LOTTERY_LIMIT", 5, 0, 50);

function readCache() {
  try {
    if (!fs.existsSync(TOKEN_CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.log(`token缓存写入失败: ${e.message || e}`);
  }
}

function md5(text) {
  return crypto.createHash("md5").update(String(text)).digest("hex");
}

function hmacSha256Hex(text, key) {
  return crypto.createHmac("sha256", key).update(String(text)).digest("hex");
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function mask(value = "") {
  value = String(value);
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}***`;
  return `${value.slice(0, 6)}***${value.slice(-6)}`;
}

function parseCookie(cookie = "") {
  if (!cookie || typeof cookie !== "string") return {};
  return Object.fromEntries(
    cookie
      .split(/;\s*/)
      .filter((v) => v.includes("="))
      .map((v) => [v.slice(0, v.indexOf("=")).trim(), v.slice(v.indexOf("=") + 1).trim()])
  );
}

function cookieHeader(cookies = {}) {
  return Object.entries(cookies)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
}

function mergeSetCookie(setCookie = [], current = {}) {
  const cookies = { ...current };
  for (const line of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const first = String(line || "").split(";")[0];
    if (!first.includes("=")) continue;
    const key = first.slice(0, first.indexOf("=")).trim();
    const value = first.slice(first.indexOf("=") + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

function parseAccount(raw) {
  const text = String(raw || "").trim();
  if (!text) return { openid: "", cookie: "", secret: "" };

  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      return {
        openid: data.openid || data.openId || data.account || "",
        cookie: data.cookie || data.Cookie || "",
        secret: data.secret || data.jsrsasign_secret || "",
      };
    } catch {}
  }

  for (const sep of ["#", "|"]) {
    if (text.includes(sep)) {
      const [openid, cookie, secret] = text.split(sep);
      return { openid: openid.trim(), cookie: (cookie || "").trim(), secret: (secret || "").trim() };
    }
  }

  if (text.includes("wps_sid=") || text.includes("kso_sid=")) return { openid: "", cookie: text, secret: "" };
  return { openid: text, cookie: "", secret: "" };
}

function canonicalJson(data = {}) {
  const sorted = {};
  Object.keys(data || {})
    .sort()
    .forEach((key) => {
      sorted[key] = data[key];
    });
  return JSON.stringify(sorted);
}

function makeSignature(data, config = {}) {
  const key = config.key || "";
  const ss = config.ss || "";
  if (!key || !ss) return {};
  const date = new Date().toUTCString();
  const payload = `${key}${md5(canonicalJson(data))}${date}`;
  return {
    Date: date,
    Signature: hmacSha256Hex(payload, ss),
  };
}

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function makePopToken(method, url, secret, cv = "") {
  if (!secret) return "";
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = {
    htm: String(method || "GET").toUpperCase(),
    htu: new URL(url).pathname,
    iat: Math.floor(Date.now() / 1000),
  };
  if (cv) body.cv = cv;
  const payload = base64url(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", Buffer.from(secret)).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function genEcKeyPair() {
  return crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
}

function signEc(privateKey, text) {
  return crypto
    .sign("sha256", Buffer.from(String(text)), {
      key: privateKey.export({ type: "pkcs8", format: "pem" }),
      dsaEncoding: "der",
    })
    .toString("base64url");
}

function deriveSecret(privateKey, serverJwkB64) {
  const jwk = JSON.parse(Buffer.from(serverJwkB64, "base64url").toString("utf8"));
  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return crypto.diffieHellman({ privateKey, publicKey }).toString("base64url");
}

async function accountRequest(method, urlPath, { data = null, cookies = {}, secret = "" } = {}) {
  const url = `${ACCOUNT_BASE}${urlPath}`;
  const headers = {
    platform: "wx_mini",
    app_name: "account_wx_mini_plugin",
    Cookie: `csrf=1234567890${cookieHeader(cookies) ? `;${cookieHeader(cookies)}` : ""}`,
    "X-CSRFToken": "1234567890",
    "User-Agent": "Mozilla/5.0 MicroMessenger MiniProgramEnv/Windows",
    Referer: `https://servicewechat.com/${MINI_APP_ID}/249/page-frame.html`,
  };
  const pop = makePopToken(method, urlPath, secret, cookies.cv || "");
  if (pop) headers["X-Pop-Token"] = pop;
  const res = await axios({
    method,
    url,
    data,
    headers,
    timeout: 20000,
    validateStatus: () => true,
  });
  return { data: res.data, cookies: mergeSetCookie(res.headers["set-cookie"], cookies), status: res.status };
}

async function wpsRequest(method, url, { data = null, params = null, cookies = {}, secret = "", signed = false, clockConfig = {}, headers: extraHeaders = {} } = {}) {
  const csrf = "1234567890";
  const headers = {
    "X-CSRFToken": csrf,
    Cookie: `${cookieHeader(cookies)};csrf=${csrf}`,
    "User-Agent": "Mozilla/5.0 MicroMessenger MiniProgramEnv/Windows",
    Referer: `https://servicewechat.com/${MINI_APP_ID}/249/page-frame.html`,
    ...extraHeaders,
  };
  const pop = makePopToken(method, url, secret, cookies.cv || "");
  if (pop) headers["X-Pop-Token"] = pop;
  if (signed) Object.assign(headers, makeSignature(data || {}, clockConfig));

  const res = await axios({
    method,
    url,
    data,
    params,
    headers,
    timeout: 20000,
    validateStatus: () => true,
  });
  return { data: res.data, cookies: mergeSetCookie(res.headers["set-cookie"], cookies), status: res.status };
}

function assertOk(res, action) {
  if (!res || res.result !== "ok") {
    throw new Error(`${action}失败: ${res?.msg || res?.result || JSON.stringify(res)}`);
  }
  return res.data ?? res;
}

class Task {
  constructor(raw) {
    this.server = raw;
    const _yyb = parseYybGoEntry(this.server);
    this.ref = _yyb.ref;
    this.openid = _yyb.ref;
    this.index = userIdx++;
    const account = parseAccount(raw);
    // YYB_SERVER 的 ref 才是账号标识，不能被整行 "地址@ref" 覆盖。
    if (!this.openid) this.openid = account.openid;
    this.cookies = parseCookie(account.cookie);
    this.secret = account.secret || "";
    this.uid = this.cookies.uid || "";
    this.clockConfig = {};
    this.cacheKey = this.openid || this.cookies.uid || (account.cookie ? md5(account.cookie).slice(0, 16) : `account_${this.index}`);
  }

  getCached() {
    return readCache()[this.cacheKey] || {};
  }

  saveCache(extra = {}) {
    const cache = readCache();
    cache[this.cacheKey] = {
      ...(cache[this.cacheKey] || {}),
      openid: this.openid || this.getCached().openid || "",
      uid: this.uid || this.cookies.uid || "",
      cookie: cookieHeader(this.cookies),
      secret: this.secret,
      ...extra,
      updatedAt: new Date().toISOString(),
    };
    writeCache(cache);
  }

  removeLogin() {
    const cache = readCache();
    if (cache[this.cacheKey]) {
      delete cache[this.cacheKey].cookie;
      delete cache[this.cacheKey].secret;
      writeCache(cache);
    }
    this.cookies = {};
    this.secret = "";
  }

  loadCache() {
    const cache = this.getCached();
    if (!this.openid && cache.openid) this.openid = cache.openid;
    if (!this.secret && cache.secret) this.secret = cache.secret;
    if (!Object.keys(this.cookies).length && cache.cookie) this.cookies = parseCookie(cache.cookie);
    this.uid = this.cookies.uid || cache.uid || this.uid || "";
  }

  async login() {
    if (!this.openid) throw new Error("缺少 openid，无法自动登录。可设置 wps=openid 或 wps=openid#Cookie");
    const authCode = await getCode(this.server, ACCOUNT_PLUGIN_APPID);
    if (!authCode) throw new Error("YYB 未返回 WPS 登录 code，请确认该账号已绑定 WPS 小程序");
    const keyPair = genEcKeyPair();
    const body = {
      type: "wxapp",
      appid: ACCOUNT_PLUGIN_APPID,
      auth_code: authCode,
      public_key: base64url(JSON.stringify(keyPair.publicKey.export({ format: "jwk" }))),
      auth_code_sign: signEc(keyPair.privateKey, authCode),
      slv: "none",
    };
    const res = await accountRequest("POST", "/passport/secure/api/easy_login", { data: body });
    const data = assertOk(res.data, "WPS自动登录");
    if (data.further_action) throw new Error(`WPS登录需要额外操作: ${data.further_action}`);
    if (!data.jwk) throw new Error(`WPS登录未返回 jwk: ${JSON.stringify(res.data)}`);
    this.cookies = res.cookies;
    this.secret = deriveSecret(keyPair.privateKey, data.jwk);
    this.uid = data.user_id || this.cookies.uid || "";
    this.saveCache();
    console.log(`账号[${this.index}] WPS登录成功: ${mask(this.uid || this.cookies.wps_sid)}`);
  }

  async ensureLogin() {
    this.loadCache();
    if (this.cookies.kso_sid && this.cookies.wps_sid && this.secret) return;
    await this.login();
  }

  async request(method, url, options = {}) {
    await this.ensureLogin();
    const res = await wpsRequest(method, url, {
      ...options,
      cookies: this.cookies,
      secret: this.secret,
      clockConfig: this.clockConfig,
    });
    this.cookies = res.cookies;
    this.saveCache();
    if (res.data?.msg === "empty wps_sid" || res.data?.result === "userNotLogin") {
      if (!this.openid) throw new Error("WPS登录态失效，且缺少 openid 无法刷新");
      console.log(`账号[${this.index}] WPS登录态失效，重新登录`);
      this.removeLogin();
      await this.login();
      const retry = await wpsRequest(method, url, {
        ...options,
        cookies: this.cookies,
        secret: this.secret,
        clockConfig: this.clockConfig,
      });
      this.cookies = retry.cookies;
      this.saveCache();
      return retry.data;
    }
    return res.data;
  }

  async loadClockConfig() {
    const res = await axios.get(ACTIVITY_CONFIG, {
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        "User-Agent": "Mozilla/5.0 MicroMessenger MiniProgramEnv/Windows",
        Referer: `https://servicewechat.com/${MINI_APP_ID}/249/page-frame.html`,
      },
    });
    if (res.data?.result === "ok" && res.data?.data?.value) {
      this.clockConfig = res.data.data.value;
      if (!this.clockConfig.key && this.clockConfig.s_key) this.clockConfig.key = this.clockConfig.s_key;
    }
  }

  async userInfo() {
    const data = assertOk(await this.request("POST", "https://account.wps.cn/p/auth/check"), "查询用户信息");
    this.uid = data.userid || data.id || this.uid || this.cookies.uid || "";
    this.saveCache({ nickname: data.nickname || data.username || "" });
    console.log(`账号[${this.index}] 用户: ${mask(data.nickname || data.username || this.uid)}`);
  }

  async sign() {
    const body = { client_type: CLIENT_TYPE };
    const res = await this.request("POST", CLOCK_IN, { data: body, signed: true });
    if (res.result === "ok") {
      const data = res.data || {};
      console.log(`账号[${this.index}] 签到成功: 连续${data.continuous_days ?? data.continuousDays ?? "未知"}天`);
      return;
    }
    if (res.msg === "already clocked in today") {
      console.log(`账号[${this.index}] 今日已签到`);
      return;
    }
    throw new Error(`签到失败: ${res.msg || JSON.stringify(res)}`);
  }

  async clockInfo() {
    try {
      const res = await this.request("GET", CLOCK_INFO, {
        params: {
          client_type: CLIENT_TYPE,
          page_index: 0,
          page_size: 10,
        },
      });
      if (res.result === "ok") {
        const d = res.data || {};
        if (d.s_key) this.clockConfig.key = d.s_key;
        console.log(`账号[${this.index}] 签到信息: 连续${d.continuous_days ?? 0}天，累计${d.clock_in_total_num ?? "未知"}人打卡`);
      }
    } catch (e) {
      console.log(`账号[${this.index}] 查询签到信息失败: ${e.message || e}`);
    }
  }

  async getMainCode() {
    if (!this.openid) return "";
    return getCode(this.server, MINI_APP_ID);
  }

  async operateWxData(apiName, appId = MINI_APP_ID, payloadData = {}, env = 1) {
    if (!this.ref) return null;
    const cached = this.getCached().wxData;
    if (cached && cached.apiName === apiName && cached.appId === appId && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const parsed = parseYybGoEntry(this.server);
    if (!parsed.server) return null;
    const url = `http://${parsed.server}/wxapp/operateWxData`;
    const headers = process.env.YYB_API_KEY ? { "X-API-Key": process.env.YYB_API_KEY } : {};
    try {
      const response = await axios.post(url, {
        ref: this.ref,
        app_id: appId,
        payload: { api_name: apiName, data: payloadData, env },
      }, { timeout: 20000, proxy: false, headers, validateStatus: () => true });
      const body = response.data;
      if (response.status < 200 || response.status >= 300 || body?.code !== 0) {
        console.log(`账号[${this.index}] YYB operateWxData失败: ${JSON.stringify(body)}`);
        return null;
      }
      let value = body?.data?.result?.data ?? body?.data?.result ?? body?.result ?? body?.data;
      value = decodeJsonish(value);
      this.saveCache({ wxData: { apiName, appId, data: value, expiresAt: Date.now() + 300000 } });
      return value;
    } catch (e) {
      console.log(`账号[${this.index}] YYB operateWxData异常: ${e.message || e}`);
      return null;
    }
  }

  async componentAction(config, componentType, action, payload = {}, referer = "") {
    const actCsrf = randomHex(16);
    const cookies = { ...this.cookies, act_csrf_token: actCsrf };
    const body = {
      component_uniq_number: {
        activity_number: config.activity,
        page_number: config.page,
        component_number: config.component,
        component_node_id: config.node,
        ...(config.filter ? { filter_params: config.filter } : {}),
      },
      component_type: componentType,
      component_action: action,
      ...payload,
    };
    const result = await wpsRequest("POST", COMPONENT_ACTION, {
      data: body,
      cookies,
      secret: this.secret,
      headers: {
        "Content-Type": "application/json",
        "X-Act-Csrf-Token": actCsrf,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    this.cookies = result.cookies;
    this.saveCache();
    return result.data;
  }

  async taskOutline() {
    const authCode = await this.getMainCode();
    if (!authCode) throw new Error("缺少 openid，无法获取任务 auth_code");
    const res = await this.request("GET", TASK_OUTLINE, {
      params: {
        mp_id: WPS_MPID,
        auth_code: authCode,
      },
    });
    return assertOk(res, "查询任务列表") || {};
  }

  async lotteryTimes() {
    const res = await this.request("GET", LOTTERY_TIMES, {
      params: {
        position: "wx_xcx_clock_activity",
      },
    });
    if (res.result === "ok") {
      console.log(`账号[${this.index}] 可抽奖次数: ${res.data ?? 0}`);
      return Number(res.data || 0);
    }
    console.log(`账号[${this.index}] 查询抽奖次数失败: ${res.msg || JSON.stringify(res)}`);
    return 0;
  }

  flattenTasks(outline = {}) {
    const tasks = [];
    const collect = (type, item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach((v) => collect(type, v));
      } else if (typeof item === "object") {
        tasks.push({ ...item, type });
      }
    };
    for (const [type, value] of Object.entries(outline)) collect(type, value);
    return tasks;
  }

  async doBrowseTask(task) {
    const authCode = await this.getMainCode();
    const clientType = task.client_type || "wechat";
    const startBody = {
      mp_id: WPS_MPID,
      auth_code: authCode,
      browse_app_id: task.app_id || MINI_APP_ID,
      client_type: clientType,
      version: "new",
    };
    if (clientType !== "wechat" && task.path) startBody.path = task.path;
    const start = await this.request("POST", TASK_START_BROWSE, { data: startBody });
    if (start.result !== "ok" && start.msg !== "任务已完成") {
      console.log(`账号[${this.index}] 浏览任务启动失败[${task.title || task.task_id || task.app_id}]: ${start.msg || JSON.stringify(start)}`);
      return false;
    }

    await randomSleep(BROWSE_WAIT_SECONDS * 1000, BROWSE_WAIT_SECONDS * 1000 + 1000);

    const finish = await this.request("POST", TASK_FINISH_BROWSE, {
      data: {
        mp_id: WPS_MPID,
        auth_code: await this.getMainCode(),
        app_id: clientType === "wechat_web" ? MINI_APP_ID : task.app_id || MINI_APP_ID,
        client_type: clientType,
        path: clientType === "wechat_web" ? task.path || "" : "",
        version: "new",
        user_id: Number(this.uid || this.cookies.uid || 0),
      },
    });
    if (finish.result === "ok" || finish.msg === "任务已完成") {
      console.log(`账号[${this.index}] 浏览任务完成: ${task.title || task.task_id || task.app_id || task.path || ""}`);
      return true;
    }
    console.log(`账号[${this.index}] 浏览任务完成失败[${task.title || task.task_id || task.app_id}]: ${finish.msg || JSON.stringify(finish)}`);
    return false;
  }

  async svipMarketTasks() {
    const result = await this.request("POST", SVIP_MARKET_URL, {
      data: {
        channel_code: SVIP_CHANNEL_CODE,
        platform: 16,
        rmsp: "vip_clock",
        version: "release",
        device: 5,
        filter_info: { mini_platfrom: "android", isPad: "no", support_virtual: 1 },
      },
    });
    const activity = Array.isArray(result?.data) ? result.data[0] : null;
    const material = activity?.config?.material;
    const elements = Array.isArray(material) ? material[0]?.element : null;
    const browse = Array.isArray(elements?.browse) ? elements.browse : [];
    if (!browse.length) return [];
    let outline = {};
    try { outline = await this.taskOutline(); } catch (_) {}
    const statuses = new Map(this.flattenTasks(outline).map((item) => [item.app_id, item]));
    return browse.map((task) => ({ ...task, ...(statuses.get(task.app_id) || {}) }));
  }

  async browseTasks() {
    let tasks = [];
    try { tasks = await this.svipMarketTasks(); } catch (e) {
      console.log(`账号[${this.index}] 动态获取小程序任务失败，使用备用列表: ${e.message || e}`);
    }
    if (!tasks.length) {
      try {
        const outline = await this.taskOutline();
        tasks = this.flattenTasks(outline).filter((t) => t.type === "browse");
      } catch (e) {
        console.log(`账号[${this.index}] 查询任务列表失败: ${e.message || e}`);
        return;
      }
    }
    tasks = tasks.filter((t) => !this.taskDone(t));
    if (!tasks.length) {
      console.log(`账号[${this.index}] 暂无待完成浏览任务`);
      return;
    }
    console.log(`账号[${this.index}] 待浏览任务: ${tasks.length}个`);
    for (const task of tasks) {
      try {
        await this.doBrowseTask(task);
      } catch (e) {
        console.log(`账号[${this.index}] 浏览任务异常: ${e.message || e}`);
      }
    }
  }

  async tryLotteryOnce(index, config = null, sessionId = 1) {
    const lotteryConfig = config || {
      activity: LOTTERY_ACTIVITY,
      page: LOTTERY_PAGE_NO,
      component: LOTTERY_COMPONENT_NO,
      node: LOTTERY_COMPONENT_NODE_ID,
      filter: {},
    };
    const result = await this.componentAction(lotteryConfig, 45, "lottery_v2.exec", {
      lottery_v2: { session_id: sessionId },
    }, `${PERSONAL_ACT}/rubik2/portal/${lotteryConfig.activity}/${lotteryConfig.page}`)
      .catch((e) => ({ result: "error", msg: e.message || String(e) }));
    if (result?.result === "ok" && result.data?.lottery_v2?.success) {
      const reward = result.data.lottery_v2;
      console.log(`账号[${this.index}] 抽奖[${index}]成功: ${reward.reward_name || reward.reward_type || JSON.stringify(reward).slice(0, 120)}`);
      return true;
    }
    const detail = result?.data?.lottery_v2?.error_code ? `错误码${result.data.lottery_v2.error_code}` : result?.msg || JSON.stringify(result);
    console.log(`账号[${this.index}] 抽奖[${index}]失败: ${detail}`);
    return false;
  }

  async lottery() {
    let dynamic = null;
    try { dynamic = await this.svipLotteryConfig(); } catch (_) {}
    const count = dynamic?.lotteryTimes ?? await this.lotteryTimes();
    const limit = Math.min(count, LOTTERY_LIMIT);
    for (let i = 1; i <= limit; i++) {
      const ok = await this.tryLotteryOnce(i, dynamic?.config || null, dynamic?.sessionId || 1);
      if (!ok) break;
      await randomSleep(1000, 1800);
    }
  }

  async svipLotteryConfig() {
    const config = {
      activity: LOTTERY_ACTIVITY,
      page: LOTTERY_PAGE_NO,
      component: LOTTERY_COMPONENT_NO,
      node: LOTTERY_COMPONENT_NODE_ID,
      filter: { virtualPayEnabled: "1" },
    };
    const items = await this.activityPage(config);
    let component = config;
    let lotteryTimes = 0;
    let sessionId = 1;
    for (const item of items) {
      if (item?.type !== 45 || !item.lottery_v2) continue;
      const uniq = item.component_uniq_number || {};
      component = { ...config, component: uniq.component_number || config.component, node: uniq.component_node_id || config.node };
      for (const session of item.lottery_v2.lottery_list || []) {
        if (Number(session.times || 0) > lotteryTimes) {
          lotteryTimes = Number(session.times || 0);
          sessionId = session.session_id ?? sessionId;
        }
      }
    }
    return { config: component, lotteryTimes, sessionId };
  }

  async activityPage(config) {
    const result = await this.request("GET", `${PERSONAL_ACT}/activity-rubik/activity/page_info`, {
      params: {
        activity_number: config.activity,
        page_number: config.page,
        filter_params: JSON.stringify(config.filter || {}),
      },
    });
    if (result?.result !== "ok") throw new Error(result?.msg || "活动页面信息获取失败");
    return Array.isArray(result.data) ? result.data : [];
  }

  async taskCenterPageInfo() {
    const items = await this.activityPage(TASK_CENTER);
    const tasks = [];
    let lotteryTimes = 0;
    for (const item of items) {
      if (item?.task_center?.task_list) tasks.push(...item.task_center.task_list);
      if (item?.type === 45 && item.lottery_v2) {
        for (const session of item.lottery_v2.lottery_list || []) {
          if (Number(session.session_id) === TASK_CENTER.lotterySession) lotteryTimes = Number(session.times || 0);
        }
      }
    }
    return { tasks, lotteryTimes };
  }

  taskTitle(task) {
    return String(task?.title || task?.name || task?.task_name || task?.task_id || "未命名任务");
  }

  taskDone(task) {
    return Number(task?.task_status) === 2 || Number(task?.status) === 1 || task?.completed === true;
  }

  taskSkipped(title) {
    return ["邀请", "PDF转换", "PDF合并", "语音速记", "关注", "消费", "开通会员", "认证", "上喜马拉雅", "微博", "苏宁易购", "添加"].some((word) => title.includes(word));
  }

  async taskCenterSign() {
    let encrypted = await this.operateWxData("webapi_getuserencryptkey", MINI_APP_ID);
    if (!encrypted) {
      try {
        const response = await this.request("GET", `${PERSONAL_BUS}/sign_in/v1/encrypt/key`);
        encrypted = response?.data ?? response;
      } catch (e) {
        console.log(`账号[${this.index}] 任务中心签到密钥获取失败: ${e.message || e}`);
        return false;
      }
    }
    const direct = findNestedValue(encrypted, ["encryptData", "encrypt_data", "encryptedData", "encrypted_data"]);
    const value = direct ?? encrypted;
    if (value === undefined || value === null || value === "") {
      console.log(`账号[${this.index}] 任务中心签到未返回有效加密数据，跳过`);
      return false;
    }
    const body = value && typeof value === "object" && (value.encryptData || value.encrypt_data || value.encryptedData || value.userId)
      ? { ...value, userId: value.userId || Number(this.uid || this.cookies.uid || 0) }
      : { encryptData: value, userId: Number(this.uid || this.cookies.uid || 0) };
    const result = await this.request("POST", `${PERSONAL_BUS}/sign_in/v1/sign_in`, { data: body });
    if (result?.result === "ok" || /already|has sign|已签到/i.test(String(result?.msg || ""))) {
      console.log(`账号[${this.index}] 任务中心签到完成`);
      return true;
    }
    console.log(`账号[${this.index}] 任务中心签到失败: ${result?.msg || JSON.stringify(result)}`);
    return false;
  }

  async taskCenterAction(taskId, action) {
    return this.componentAction(TASK_CENTER, TASK_CENTER.type, action, { task_center: { task_id: taskId } },
      `${PERSONAL_ACT}/rubik2/portal/${TASK_CENTER.activity}/${TASK_CENTER.page}`);
  }

  async finishTaskCenterBrowse(token, title) {
    const batchTag = Date.now();
    const info = await this.request("GET", `${PERSONAL_ACT}/activity-rubik/user/task_center/task_info`, {
      params: { batch_tag: batchTag, token },
    });
    if (info?.result !== "ok") {
      console.log(`账号[${this.index}] 浏览任务信息失败[${title}]: ${info?.msg || JSON.stringify(info)}`);
      return false;
    }
    await randomSleep(BROWSE_WAIT_SECONDS * 1000, BROWSE_WAIT_SECONDS * 1000 + 1000);
    const finish = await this.request("POST", `${PERSONAL_ACT}/activity-rubik/user/task_center/task_finish`, {
      data: { batch_tag: batchTag + Number(info?.data?.start_at || 0), token },
    });
    if (finish?.result === "ok" || /已完成|完成成功/i.test(String(finish?.msg || ""))) {
      console.log(`账号[${this.index}] 浏览任务完成: ${title}`);
      return true;
    }
    console.log(`账号[${this.index}] 浏览任务完成失败[${title}]: ${finish?.msg || JSON.stringify(finish)}`);
    return false;
  }

  async runTaskCenter() {
    try {
      let page = await this.taskCenterPageInfo();
      if (!page.tasks.length) {
        console.log(`账号[${this.index}] 任务中心暂无待完成任务`);
      } else {
        await this.taskCenterSign();
        for (const task of page.tasks) {
          const title = this.taskTitle(task);
          if (this.taskDone(task) || this.taskSkipped(title)) continue;
          try {
            if (title.includes("浏览")) {
              const started = await this.taskCenterAction(task.task_id, "task_center.start");
              const token = started?.data?.task_center?.token || started?.task_center?.token;
              if (!token || !(await this.finishTaskCenterBrowse(token, title))) continue;
            } else {
              const finished = await this.taskCenterAction(task.task_id, "task_center.finish");
              if (!finished?.data?.task_center?.success && !finished?.task_center?.success) continue;
            }
            await randomSleep(800, 1400);
            const reward = await this.taskCenterAction(task.task_id, "task_center.reward");
            const ok = reward?.data?.task_center?.success || reward?.task_center?.success;
            console.log(`账号[${this.index}] ${ok ? "领取" : "领取失败"}任务奖励: ${title}`);
          } catch (e) {
            console.log(`账号[${this.index}] 任务中心任务异常[${title}]: ${e.message || e}`);
          }
        }
        page = await this.taskCenterPageInfo().catch(() => page);
      }
      const lotteryLimit = Math.min(Number(page.lotteryTimes || 0), LOTTERY_LIMIT);
      const lotteryConfig = { ...TASK_CENTER, component: TASK_CENTER.lotteryComponent, node: TASK_CENTER.lotteryNode };
      for (let i = 1; i <= lotteryLimit; i++) {
        if (!(await this.tryLotteryOnce(i, lotteryConfig, TASK_CENTER.lotterySession))) break;
        await randomSleep(800, 1400);
      }
    } catch (e) {
      console.log(`账号[${this.index}] 任务中心执行失败: ${e.message || e}`);
    }
  }

  async welfarePageInfo() {
    const items = await this.activityPage(WELFARE);
    let lotteryTimes = 0;
    for (const item of items) {
      for (const session of item?.lottery_v2?.lottery_list || []) {
        if (Number(session.session_id) === WELFARE.lotterySession) lotteryTimes = Number(session.times || 0);
      }
    }
    return { lotteryTimes };
  }

  async welfareSign() {
    const result = await this.componentAction(WELFARE, 42, "fragment_collect.sign_in", {
      fragment_collect: { sign_date: new Date().toISOString().slice(0, 10), series_id: "", is_new_sign_series: true },
    }, `${PERSONAL_ACT}/rubik2/portal/${WELFARE.activity}/${WELFARE.page}`);
    const data = result?.data?.fragment_collect;
    if (result?.result === "ok" && data?.success) console.log(`账号[${this.index}] 天天领福利签到成功: ${data.reason || "已领取"}`);
    else if (/Duplicate|已签到|already/i.test(String(result?.msg || data?.reason || ""))) console.log(`账号[${this.index}] 天天领福利今日已签到`);
    else console.log(`账号[${this.index}] 天天领福利签到失败: ${result?.msg || data?.reason || JSON.stringify(result)}`);
    return result?.result === "ok" && (data?.success || /Duplicate|已签到|already/i.test(String(result?.msg || "")));
  }

  async runWelfare() {
    try {
      await this.welfareSign();
      const page = await this.welfarePageInfo();
      const limit = Math.min(page.lotteryTimes, LOTTERY_LIMIT);
      const lotteryConfig = { ...WELFARE, component: WELFARE.lotteryComponent, node: WELFARE.lotteryNode };
      for (let i = 1; i <= limit; i++) {
        if (!(await this.tryLotteryOnce(i, lotteryConfig, WELFARE.lotterySession))) break;
        await randomSleep(800, 1400);
      }
    } catch (e) {
      console.log(`账号[${this.index}] 天天领福利执行失败: ${e.message || e}`);
    }
  }

  async challengePageInfo() {
    const items = await this.activityPage(CHALLENGE);
    const tasks = [];
    for (const item of items) if (item?.task_center?.task_list) tasks.push(...item.task_center.task_list);
    return tasks;
  }

  async runChallenge() {
    try {
      const tasks = await this.challengePageInfo();
      for (const task of tasks) {
        const title = this.taskTitle(task);
        if (this.taskDone(task) || this.taskSkipped(title)) continue;
        const done = await this.componentAction(CHALLENGE, CHALLENGE.type, "task_center.finish", { task_center: { task_id: task.task_id } },
          `${PERSONAL_ACT}/rubik2/portal/${CHALLENGE.activity}/${CHALLENGE.page}`);
        const success = done?.data?.task_center?.success || done?.task_center?.success;
        if (success) {
          await randomSleep(700, 1200);
          const reward = await this.componentAction(CHALLENGE, CHALLENGE.type, "task_center.reward", { task_center: { task_id: task.task_id } },
            `${PERSONAL_ACT}/rubik2/portal/${CHALLENGE.activity}/${CHALLENGE.page}`);
          console.log(`账号[${this.index}] 挑战计划${reward?.data?.task_center?.success || reward?.task_center?.success ? "领取成功" : "领取失败"}: ${title}`);
        }
      }
    } catch (e) {
      console.log(`账号[${this.index}] 挑战计划执行失败: ${e.message || e}`);
    }
  }

  async run() {
    console.log(`\n账号[${this.index}] ${mask(this.openid || this.cacheKey)}`);
    await this.ensureLogin();
    await this.loadClockConfig();
    await this.userInfo();
    if (FEATURE_SVIP_APPLET) {
      await this.clockInfo();
      await this.sign();
      await this.browseTasks();
      await this.lottery();
    }
    if (FEATURE_TASK_CENTER) await this.runTaskCenter();
    if (FEATURE_WELFARE) await this.runWelfare();
    if (FEATURE_OFFICE_ASSISTANT) {
      console.log(`账号[${this.index}] 办公助手功能已启用，但该活动已标记结束，跳过请求`);
    }
    if (FEATURE_CHALLENGE) await this.runChallenge();
  }
}

!(async () => {
  
  if (!SERVERS.length) return;
  for (const account of SERVERS) {
    try {
      await new Task(account).run();
    } catch (e) {
      console.log(`账号执行失败: ${e.message || e}`);
    }
  }
})()
  .catch((e) => console.log(`脚本异常: ${e.message || e}`))
