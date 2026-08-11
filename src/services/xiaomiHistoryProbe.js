const crypto = require('crypto');

const ACCOUNT_BASE = 'https://account.xiaomi.com';
const API_BASE = 'https://api.io.mi.com/app';
const FLOW_TTL_MS = 15 * 60 * 1000;
const USER_AGENT = 'Android-7.1.1-1.0.0-ONEPLUS A3010-136-%s APP/xiaomi.smarthome APPV/62830';
const TARGET_MODELS = new Set(['lumi.acpartner.mcn02', 'cuco.plug.v3']);
const xiaomiCloudAuthStore = require('./xiaomiCloudAuthStore');

class ProbeError extends Error {
  constructor(message, kind = 'failed', details = {}) {
    super(message);
    this.kind = kind;
    Object.assign(this, details);
  }
}

class MemoryCookieJar {
  constructor() {
    this.values = new Map();
  }

  absorb(response) {
    const headers = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const header of headers) {
      const pair = String(header).split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  set(name, value) {
    this.values.set(name, String(value));
  }

  get(name) {
    return this.values.get(name);
  }

  header(extra = {}) {
    return [...this.values, ...Object.entries(extra)]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function decodeXiaomiJson(text) {
  return JSON.parse(String(text).replace(/^&&&START&&&/, ''));
}

function rc4(key, input) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + key[i % key.length]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
  }
  let i = 0;
  j = 0;
  const crypt = byte => {
    i = (i + 1) & 255;
    j = (j + state[i]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
    return byte ^ state[(state[i] + state[j]) & 255];
  };
  for (let discarded = 0; discarded < 1024; discarded += 1) crypt(0);
  return Buffer.from(Array.from(input, crypt));
}

function makeNonce(now = Date.now()) {
  const nonce = Buffer.alloc(12);
  crypto.randomFillSync(nonce, 0, 8);
  nonce.writeUInt32BE(Math.floor(now / 60000), 8);
  return nonce.toString('base64');
}

function signedNonce(ssecurity, nonce) {
  return crypto.createHash('sha256')
    .update(Buffer.concat([Buffer.from(ssecurity, 'base64'), Buffer.from(nonce, 'base64')]))
    .digest('base64');
}

function sha1Sign(method, url, params, nonce) {
  let pathname = new URL(url).pathname;
  if (pathname.startsWith('/app/')) pathname = pathname.slice(4);
  const parts = [method.toUpperCase(), pathname];
  for (const [key, value] of Object.entries(params)) parts.push(`${key}=${value}`);
  parts.push(nonce);
  return crypto.createHash('sha1').update(parts.join('&')).digest('base64');
}

function encodeRc4Request(method, url, data, ssecurity) {
  const nonce = makeNonce();
  const secret = signedNonce(ssecurity, nonce);
  const key = Buffer.from(secret, 'base64');
  const params = { data: JSON.stringify(data) };
  params.rc4_hash__ = sha1Sign(method, url, params, secret);
  for (const name of Object.keys(params)) {
    params[name] = rc4(key, Buffer.from(params[name])).toString('base64');
  }
  params.signature = sha1Sign(method, url, params, secret);
  params.ssecurity = ssecurity;
  params._nonce = nonce;
  return params;
}

function decodeRc4Response(body, ssecurity, nonce) {
  const secret = signedNonce(ssecurity, nonce);
  return rc4(Buffer.from(secret, 'base64'), Buffer.from(body, 'base64')).toString('utf8');
}

function numericValues(value, output = []) {
  if (typeof value === 'number' && Number.isFinite(value)) output.push(value);
  else if (Array.isArray(value)) value.forEach(item => numericValues(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => numericValues(item, output));
  return output;
}

function parseStoredValue(value) {
  let parsed = value;
  for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  const numbers = numericValues(parsed);
  if (numbers.length > 0) return numbers[numbers.length - 1];
  const numeric = Number(parsed);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseStatisticsValue(value) {
  let parsed = value;
  for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  const numeric = Number(parsed);
  return Number.isFinite(numeric) ? numeric : null;
}

function beijingTodayStartSeconds(now = Date.now()) {
  const shifted = new Date(now + 8 * 60 * 60 * 1000);
  return Math.floor((Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  ) - 8 * 60 * 60 * 1000) / 1000);
}

class LegacySession {
  constructor(username, password, fetchImpl = global.fetch) {
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.deviceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    this.userAgent = USER_AGENT.replace('%s', this.deviceId);
    this.cookies = new MemoryCookieJar();
    this.cookies.set('sdkVersion', '3.8.6');
    this.cookies.set('deviceId', this.deviceId);
  }

  static fromAuth(auth, fetchImpl = global.fetch) {
    const session = new LegacySession('', '', fetchImpl);
    session.deviceId = String(auth.deviceId);
    session.userAgent = USER_AGENT.replace('%s', session.deviceId);
    session.userId = String(auth.userId);
    session.ssecurity = String(auth.ssecurity);
    session.serviceToken = String(auth.serviceToken);
    return session;
  }

  exportAuth() {
    if (!this.deviceId || !this.userId || !this.ssecurity || !this.serviceToken) {
      throw new ProbeError('米家云端会话不完整，无法保存');
    }
    return {
      version: 1,
      region: 'cn',
      deviceId: this.deviceId,
      userId: this.userId,
      ssecurity: this.ssecurity,
      serviceToken: this.serviceToken
    };
  }

  async fetchWithCookies(url, options = {}, redirectCount = 0) {
    const headers = new Headers(options.headers || {});
    const cookie = this.cookies.header(options.extraCookies);
    if (cookie) headers.set('Cookie', cookie);
    headers.set('User-Agent', this.userAgent);
    const response = await this.fetchImpl(url, {
      ...options,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000)
    });
    this.cookies.absorb(response);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
      if (redirectCount >= 10) throw new ProbeError('小米登录重定向次数过多');
      const nextUrl = new URL(response.headers.get('location'), url).toString();
      const preserveBody = response.status === 307 || response.status === 308;
      return this.fetchWithCookies(nextUrl, preserveBody ? options : { method: 'GET' }, redirectCount + 1);
    }
    return response;
  }

  async accountJson(path, options = {}) {
    const response = await this.fetchWithCookies(new URL(path, ACCOUNT_BASE).toString(), options);
    const text = await response.text();
    try { return { response, data: decodeXiaomiJson(text) }; }
    catch { throw new ProbeError(`小米登录响应无法识别（HTTP ${response.status}）`); }
  }

  async login(captcha) {
    const step1Url = new URL('/pass/serviceLogin', ACCOUNT_BASE);
    step1Url.search = new URLSearchParams({ sid: 'xiaomiio', _json: 'true' });
    const { data: auth } = await this.accountJson(step1Url.toString());
    const form = new URLSearchParams({
      user: this.username,
      hash: crypto.createHash('md5').update(this.password).digest('hex').toUpperCase(),
      callback: auth.callback || '',
      sid: auth.sid || 'xiaomiio',
      qs: auth.qs || '',
      _sign: auth._sign || ''
    });
    if (captcha) form.set('captCode', captcha);
    const loginUrl = new URL('/pass/serviceLoginAuth2', ACCOUNT_BASE);
    loginUrl.searchParams.set('_json', 'true');
    if (captcha) loginUrl.searchParams.set('_dc', String(Date.now()));
    const { data } = await this.accountJson(loginUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      extraCookies: captcha && this.captchaIck ? { ick: this.captchaIck } : {}
    });
    if (data.userId) this.userId = String(data.userId);
    if (data.ssecurity) this.ssecurity = data.ssecurity;
    if (data.location) {
      const response = await this.fetchWithCookies(data.location, { method: 'GET' });
      if (!response.ok || !this.cookies.get('serviceToken')) {
        throw new ProbeError('小米登录已通过，但没有取得云端会话令牌');
      }
      this.serviceToken = this.cookies.get('serviceToken');
      return { status: 'authenticated' };
    }
    if (data.notificationUrl) {
      this.verificationUrl = new URL(data.notificationUrl, ACCOUNT_BASE).toString();
      return { status: 'verification', verificationUrl: this.verificationUrl };
    }
    if (data.captchaUrl) {
      const captchaUrl = new URL(data.captchaUrl, ACCOUNT_BASE).toString();
      const response = await this.fetchWithCookies(captchaUrl, { method: 'GET' });
      const image = Buffer.from(await response.arrayBuffer());
      this.captchaIck = this.cookies.get('ick');
      if (!this.captchaIck || image.length === 0) throw new ProbeError('验证码获取失败');
      return { status: 'captcha', captchaImage: `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${image.toString('base64')}` };
    }
    if ([20003, 70002, 70016].includes(data.code)) throw new ProbeError('小米账号或密码不正确', 'credentials');
    throw new ProbeError(`小米登录失败（代码 ${data.code ?? '未知'}）`);
  }

  async loginWithTicket(ticket) {
    if (!this.verificationUrl) throw new ProbeError('验证状态已丢失，请重新开始');
    const identityUrl = this.verificationUrl.replace('fe/service/identity/authStart', 'identity/list');
    if (identityUrl === this.verificationUrl) throw new ProbeError('小米返回了无法识别的验证地址');
    const { data: identity } = await this.accountJson(identityUrl, { method: 'GET' });
    const identitySession = this.cookies.get('identity_session');
    if (!identitySession) throw new ProbeError('没有取得小米验证会话，请重新开始');
    const options = Array.isArray(identity.options) && identity.options.length
      ? identity.options
      : [identity.flag ?? 4];
    let verified;
    for (const flag of options) {
      const path = Number(flag) === 4
        ? '/identity/auth/verifyPhone'
        : Number(flag) === 8 ? '/identity/auth/verifyEmail' : null;
      if (!path) continue;
      const url = new URL(path, ACCOUNT_BASE);
      url.searchParams.set('_dc', String(Date.now()));
      const { data } = await this.accountJson(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ _flag: String(flag), ticket, trust: 'false', _json: 'true' }),
        extraCookies: { identity_session: identitySession }
      });
      if (data.code === 0 && data.location) {
        verified = data;
        break;
      }
    }
    if (!verified) throw new ProbeError('短信或邮件验证码未被小米接受，请检查后重试', 'verification');

    let response = await this.fetchWithCookies(verified.location, { method: 'GET' });
    if (!this.cookies.get('serviceToken')) {
      const finalUrl = new URL(response.url);
      if (finalUrl.pathname.startsWith('/fe/') && finalUrl.searchParams.get('skipUrl')) {
        response = await this.fetchWithCookies(new URL(finalUrl.searchParams.get('skipUrl'), ACCOUNT_BASE).toString(), { method: 'GET' });
      }
    }
    this.serviceToken = this.cookies.get('serviceToken');
    this.userId = String(this.cookies.get('userId') || this.userId || '');

    // Some Xiaomi identity flows only mark the account challenge as complete.
    // A second serviceLogin request in the same cookie session then returns the
    // xiaomiio signing secret and final STS location.
    if (!this.serviceToken || !this.userId || !this.ssecurity) {
      const step1Url = new URL('/pass/serviceLogin', ACCOUNT_BASE);
      step1Url.search = new URLSearchParams({ sid: 'xiaomiio', _json: 'true' });
      const { data: auth } = await this.accountJson(step1Url.toString());
      if (auth.userId) this.userId = String(auth.userId);
      if (auth.ssecurity) this.ssecurity = auth.ssecurity;
      if (auth.location) {
        response = await this.fetchWithCookies(auth.location, { method: 'GET' });
        this.serviceToken = this.cookies.get('serviceToken');
        this.userId = String(this.cookies.get('userId') || this.userId || '');
      }
    }
    if (!response.ok || !this.serviceToken || !this.userId || !this.ssecurity) {
      throw new ProbeError('小米已接受验证码，但没有签发完整的云端会话，请重新开始');
    }
    return { status: 'authenticated' };
  }

  apiCookieHeader() {
    return this.cookies.header({
      userId: this.userId,
      yetAnotherServiceToken: this.serviceToken,
      serviceToken: this.serviceToken,
      locale: 'zh_CN',
      timezone: 'GMT+08:00',
      is_daylight: '0',
      dst_offset: '0',
      channel: 'MI_APP_STORE'
    });
  }

  async apiPost(path, data) {
    const url = `${API_BASE}/${String(path).replace(/^\/+/, '')}`;
    const params = encodeRc4Request('POST', url, data, this.ssecurity);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        Cookie: this.apiCookieHeader(),
        'X-XIAOMI-PROTOCAL-FLAG-CLI': 'PROTOCAL-HTTP2',
        'MIOT-ENCRYPT-ALGORITHM': 'ENCRYPT-RC4',
        'Accept-Encoding': 'identity'
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30000)
    });
    let text = await response.text();
    if (!response.ok) throw new ProbeError(`小米云请求失败（HTTP ${response.status}）`);
    if (!text.trim().startsWith('{')) text = decodeRc4Response(text, this.ssecurity, params._nonce);
    let body;
    try { body = JSON.parse(text); } catch { throw new ProbeError('小米云返回了无法识别的数据'); }
    if (body.code !== 0) throw new ProbeError(`小米云返回错误（${body.code ?? '未知'}：${body.message || '无详情'}）`);
    return body.result;
  }

  async targetDevices() {
    const byDid = new Map();
    const addDevices = devices => {
      for (const device of Array.isArray(devices) ? devices : []) {
        if (!device || !device.did) continue;
        byDid.set(String(device.did), { ...(byDid.get(String(device.did)) || {}), ...device });
      }
    };
    const result = await this.apiPost('home/device_list', {
      getVirtualModel: true,
      getHuamiDevices: 1,
      get_split_device: false,
      support_smart_home: true
    });
    addDevices(result?.list);

    const homes = await this.apiPost('v2/homeroom/gethome_merged', {
      fg: true,
      fetch_share: true,
      fetch_share_dev: true,
      fetch_cariot: true,
      limit: 300,
      app_ver: 7,
      plat_form: 0
    });
    const homeList = Array.isArray(homes?.homelist) ? homes.homelist : [];
    for (const home of homeList) {
      let startDid = '';
      for (let page = 0; page < 10; page += 1) {
        const pageResult = await this.apiPost('v2/home/home_device_list', {
          home_owner: Number(home.uid || 0),
          home_id: Number(home.id || 0),
          limit: 300,
          start_did: startDid,
          get_split_device: false,
          support_smart_home: true,
          get_cariot_device: true,
          get_third_device: true
        });
        addDevices(pageResult?.device_info);
        startDid = String(pageResult?.max_did || '');
        if (!pageResult?.has_more || !startDid) break;
      }
    }

    const devices = [...byDid.values()];
    return {
      targets: devices.filter(device => TARGET_MODELS.has(device.model)),
      scannedCount: devices.length,
      scannedModels: [...new Set(devices.map(device => device.model).filter(Boolean))].sort()
    };
  }

  async statistics(did, key, dataType, { timeStart, timeEnd, limit = 31 } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return this.apiPost('v2/user/statistics', {
      did,
      key,
      data_type: dataType,
      time_start: timeStart ?? now - 32 * 86400,
      time_end: timeEnd ?? now + 60,
      limit
    });
  }

  async readEnergy({ days = 32 } = {}) {
    const inventory = await this.targetDevices();
    const devices = inventory.targets;
    const definitions = {
      'lumi.acpartner.mcn02': { label: '空调插座', key: 'powerCost', ratio: 0.001, dataType: 'stat_day' },
      'cuco.plug.v3': { label: '热水器', key: '11.1', ratio: 0.01, dataType: 'stat_day_v3' }
    };
    const todayStart = beijingTodayStartSeconds();
    const readings = [];
    for (const device of devices) {
      const definition = definitions[device.model];
      const candidates = [];
      try {
        const now = Math.floor(Date.now() / 1000);
        const seenTimes = new Set();
        for (let offset = 0; offset < days; offset += 31) {
          const timeEnd = now + 60 - offset * 86400;
          const windowDays = Math.min(32, days - offset + 1);
          const rows = await this.statistics(device.did, definition.key, definition.dataType, {
            timeStart: timeEnd - windowDays * 86400,
            timeEnd,
            limit: 31
          });
          for (const row of Array.isArray(rows) ? rows : []) {
            const time = Number(row?.time || 0);
            if (!time || seenTimes.has(time)) continue;
            seenTimes.add(time);
            const raw = parseStatisticsValue(row?.value);
            if (raw === null) continue;
            candidates.push({
              type: definition.dataType,
              time,
              raw,
              isToday: time >= todayStart,
              kwh: Math.round(raw * definition.ratio * 1000) / 1000
            });
          }
        }
      } catch (error) {
        candidates.push({ type: definition.dataType, error: error.message });
      }
      candidates.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
      readings.push({
        name: String(device.name || definition.label),
        label: definition.label,
        model: device.model,
        candidates,
        value: candidates.find(item => item.isToday && Number.isFinite(item.kwh))?.kwh ?? null
      });
    }
    return {
      success: readings.some(item => item.value !== null),
      readings,
      scannedCount: inventory.scannedCount,
      scannedModels: inventory.scannedModels,
      missingModels: [...TARGET_MODELS].filter(model => !devices.some(device => device.model === model))
    };
  }

  destroy() {
    this.username = undefined;
    this.password = undefined;
    this.ssecurity = undefined;
    this.serviceToken = undefined;
    this.cookies = new MemoryCookieJar();
  }
}

class XiaomiHistoryProbe {
  constructor({ fetchImpl = global.fetch, now = () => Date.now() } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.flows = new Map();
  }

  cleanup() {
    for (const [id, flow] of this.flows) {
      if (this.now() - flow.createdAt > FLOW_TTL_MS) {
        flow.session.destroy();
        this.flows.delete(id);
      }
    }
  }

  async start(username, password) {
    this.cleanup();
    if (!username || !password || username.length > 160 || password.length > 256) throw new ProbeError('请输入有效的小米账号和密码');
    const id = crypto.randomBytes(16).toString('hex');
    const session = new LegacySession(username, password, this.fetchImpl);
    this.flows.set(id, { session, createdAt: this.now() });
    return this.advance(id);
  }

  async advance(id, input = {}) {
    this.cleanup();
    const flow = this.flows.get(String(id || ''));
    if (!flow) throw new ProbeError('测试已过期，请重新开始');
    try {
      const login = input.verifyTicket
        ? await flow.session.loginWithTicket(input.verifyTicket)
        : await flow.session.login(input.captcha);
      if (login.status !== 'authenticated') return { ...login, flowId: id };
      const result = await flow.session.readEnergy();
      await xiaomiCloudAuthStore.save(flow.session.exportAuth());
      flow.session.destroy();
      this.flows.delete(id);
      return { status: 'complete', stored: true, ...result };
    } catch (error) {
      if (error.kind === 'credentials') {
        flow.session.destroy();
        this.flows.delete(id);
      }
      throw error;
    }
  }
}

module.exports = new XiaomiHistoryProbe();
module.exports.XiaomiHistoryProbe = XiaomiHistoryProbe;
module.exports.LegacySession = LegacySession;
module.exports._test = {
  rc4,
  signedNonce,
  sha1Sign,
  parseStoredValue,
  parseStatisticsValue,
  beijingTodayStartSeconds,
  decodeRc4Response
};
