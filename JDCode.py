#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# name: 京东小程序Code
# cron: 0 */2 * * *
"""
京东小程序 code 登录并同步青龙。

账号配置示例：
  export YYB_SERVER='应用宝地址@openid'
  export QL_URL='青龙地址'
  export QL_CLIENT_ID='你的client_id'
  export QL_CLIENT_SECRET='你的client_secret'

可选：
  export JD_ACCOUNTS_JSON='[{"name":"京东账号1","ref":"1"},{"name":"京东账号2","ref":"2"}]'  # 单/多账号配置，不填则自动读取 YYB_SERVER 的 /accounts
"""

from __future__ import annotations

import json
import html
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from typing import Any, Dict, Iterable, List, Optional, Tuple


# ========== 非敏感默认配置（环境变量优先） ==========

CONFIG_JD_PT_APPID = "wx2f5d8f9715c59d10"
CONFIG_JD_PT_APP = "300"
CONFIG_JD_PT_RETURN_URL = "https://my.m.jd.com/account/index.html"
CONFIG_QL_URL = ""
CONFIG_QL_CLIENT_ID = ""
CONFIG_QL_CLIENT_SECRET = ""
CONFIG_JD_LOGIN_MODE = "auto"
CONFIG_JD_COOKIE_MODE = "pt"
CONFIG_JD_APPID = "wx91d27dbf599dff74"
CONFIG_QL_COOKIE_ENV_NAME = "JD_COOKIE"

# ========== 账号配置（可直接在这里修改） ==========
#
# 留空 []：自动读取 YYB_SERVER 的 /accounts，只处理已经扫码保存的账号。
# 手动指定示例：
# CONFIG_ACCOUNTS = [
#     {"name": "京东账号1", "ref": "3"},
#     {"name": "京东账号2", "ref": "4"},
#     {"name": "京东账号3", "ref": "5"},
# ]
# ref 可以填 /accounts 返回的 id、openid、alias 或 uin。

CONFIG_ACCOUNTS = []


# ========== 运行配置 ==========


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name) or default).strip()


JD_APPID = _env("JD_APPID", CONFIG_JD_APPID)
YYB_SERVER = _env("YYB_SERVER").rstrip("/")
if YYB_SERVER and not YYB_SERVER.startswith("http"):
    YYB_SERVER = "http://" + YYB_SERVER
# 多行 YYB_SERVER（地址@ref）取第一行纯地址作为 base URL
if YYB_SERVER and '@' in YYB_SERVER.splitlines()[0]:
    YYB_SERVER = YYB_SERVER.splitlines()[0][:YYB_SERVER.splitlines()[0].index('@')].rstrip('/')
JD_PT_APPID = _env("JD_PT_APPID", CONFIG_JD_PT_APPID)
JD_PT_APP = _env("JD_PT_APP", CONFIG_JD_PT_APP)
JD_PT_RETURN_URL = _env("JD_PT_RETURN_URL", CONFIG_JD_PT_RETURN_URL)
QL_URL = _env("QL_URL", CONFIG_QL_URL).rstrip("/")
QL_CLIENT_ID = _env("QL_CLIENT_ID", CONFIG_QL_CLIENT_ID)
QL_CLIENT_SECRET = _env("QL_CLIENT_SECRET", CONFIG_QL_CLIENT_SECRET)
QL_COOKIE_ENV_NAME = _env("QL_COOKIE_ENV_NAME", CONFIG_QL_COOKIE_ENV_NAME)
LOGIN_MODE = _env("JD_LOGIN_MODE", CONFIG_JD_LOGIN_MODE).lower()
COOKIE_MODE = _env("JD_COOKIE_MODE", CONFIG_JD_COOKIE_MODE).lower()

try:
    REQUEST_TIMEOUT = max(5, min(int(_env("REQUEST_TIMEOUT", "30")), 90))
except ValueError:
    REQUEST_TIMEOUT = 30

UA_WX = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    f"MicroMessenger/8.0.49 NetType/WIFI Language/zh_CN miniProgram/{JD_APPID}"
)


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class CookieOpener:
    def __init__(self):
        self.cookie_jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            NoRedirectHandler(),
        )

    def open(self, request, timeout=30):
        return self.opener.open(request, timeout=timeout)


def redact_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse(parsed._replace(query="", fragment=""))


def request_text(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    data: Any = None,
    opener: Optional[CookieOpener] = None,
    json_body: bool = True,
) -> Tuple[int, Dict[str, str], str]:
    request_headers = dict(headers or {})
    body = None
    if data is not None:
        if json_body:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        else:
            body = data.encode("utf-8") if isinstance(data, str) else data
    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method.upper(),
    )
    try:
        response = (
            opener.open(request, timeout=REQUEST_TIMEOUT)
            if opener is not None
            else urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT)
        )
        with response as resp:
            response_headers: Dict[str, str] = {}
            for header_name, header_value in resp.headers.items():
                # 同名 Set-Cookie 不能用普通 dict 覆盖，否则可能丢掉 pt_key 或 pt_pin。
                if header_name.lower() == "set-cookie" and header_name in response_headers:
                    response_headers[header_name] += "; " + str(header_value)
                else:
                    response_headers[header_name] = str(header_value)
            return (
                int(getattr(resp, "status", 200)),
                response_headers,
                resp.read().decode("utf-8", "replace"),
            )
    except urllib.error.HTTPError as exc:
        response_headers: Dict[str, str] = {}
        for header_name, header_value in exc.headers.items():
            if header_name.lower() == "set-cookie" and header_name in response_headers:
                response_headers[header_name] += "; " + str(header_value)
            else:
                response_headers[header_name] = str(header_value)
        return (
            int(exc.code),
            response_headers,
            exc.read().decode("utf-8", "replace"),
        )
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(
            f"请求失败 {method.upper()} {redact_url(url)}：{reason}"
        ) from exc


def parse_jsonish(raw: str) -> Dict[str, Any]:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {"value": value}
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            try:
                value = json.loads(text[start : end + 1])
                return value if isinstance(value, dict) else {"value": value}
            except json.JSONDecodeError:
                pass
    return {}


def response_message(payload: Any) -> str:
    value = nested_value(
        payload,
        (
            "errmsg",
            "errMsg",
            "message",
            "msg",
            "error",
            "retMsg",
            "resultMsg",
            "errorMessage",
        ),
    )
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)[:300]
    return str(value or "").strip()[:300]


def jd_login_message(payload: Any) -> str:
    message = response_message(payload)
    ret_code = str(
        nested_value(payload, ("retCode", "resultCode", "errorCode")) or ""
    ).strip()
    lowered = message.lower()
    if ret_code == "201" or "pin not exist" in lowered:
        return "该微信尚未关联可用的京东账号，请先在京东小程序完成登录/绑定"
    if ret_code == "202" or "risk user" in lowered:
        return "京东判定当前账号存在风控，请先在京东 App 或小程序完成安全验证"
    return message


def request_json(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    data: Any = None,
    opener: Optional[CookieOpener] = None,
) -> Dict[str, Any]:
    status, _headers, raw = request_text(method, url, headers, data, opener)
    payload = parse_jsonish(raw)
    if status < 200 or status >= 300:
        message = response_message(payload)
        if status == 409 and "login_buffer expired" in message.lower():
            message = "应用宝账号登录缓存已过期，请打开 /scan 重新扫码"
        suffix = f"：{message}" if message else ""
        raise RuntimeError(
            f"HTTP {status} {method.upper()} {redact_url(url)}{suffix}"
        )
    if not payload and raw.strip():
        raise RuntimeError(
            f"接口未返回 JSON：{method.upper()} {redact_url(url)}"
        )
    return payload


def unwrap_service_payload(payload: Any) -> Dict[str, Any]:
    """兼容第二个插件使用的 {code, data, msg} 响应格式。"""
    if not isinstance(payload, dict):
        return {"value": payload}
    if "code" in payload and "data" in payload:
        code = str(payload.get("code"))
        if code not in {"0", "200", "201"}:
            raise RuntimeError(response_message(payload) or f"接口业务状态异常：{code}")
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        if isinstance(data, str) and data.strip().startswith(("{", "[")):
            decoded = parse_jsonish(data)
            if decoded:
                return decoded
        return {"value": data}
    return payload


def nested_value(payload: Any, keys: Iterable[str]) -> Any:
    wanted = set(keys)
    wanted_lower = {str(key).lower() for key in wanted}
    if isinstance(payload, dict):
        for key, value in payload.items():
            if (
                (key in wanted or str(key).lower() in wanted_lower)
                and value not in (None, "")
            ):
                return value
        for value in payload.values():
            found = nested_value(value, wanted)
            if found not in (None, ""):
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = nested_value(value, wanted)
            if found not in (None, ""):
                return found
    elif isinstance(payload, str):
        text = payload.strip()
        if text.startswith(("{", "[")):
            try:
                decoded = json.loads(text)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, (dict, list)):
                return nested_value(decoded, wanted)
    return None


def nested_string(payload: Any, keys: Iterable[str]) -> str:
    value = nested_value(payload, keys)
    if isinstance(value, str):
        return value.strip()
    return ""


def normalize_accounts(values: Any, source_name: str) -> List[Dict[str, str]]:
    accounts: List[Dict[str, str]] = []
    source = values if isinstance(values, list) else []
    for index, item in enumerate(source, 1):
        if not isinstance(item, dict):
            continue
        ref = str(
            item.get("ref")
            or item.get("openid")
            or item.get("openId")
            or item.get("id")
            or item.get("uin")
            or item.get("alias")
            or ""
        ).strip()
        if not ref:
            continue
        accounts.append(
            {
                "name": str(
                    item.get("name")
                    or item.get("nickname")
                    or item.get("alias")
                    or f"京东账号{index}"
                ).strip(),
                "ref": ref,
                "remark": str(item.get("remark") or "").strip(),
            }
        )
    if not accounts:
        raise RuntimeError(f"{source_name} 中没有有效 ref")
    return accounts


def load_service_accounts() -> List[Dict[str, str]]:
    """自动读取 YYB_SERVER 已扫码保存的账号。"""
    payload = request_json("GET", f"{YYB_SERVER}/accounts")
    values: Any = payload.get("value") if isinstance(payload, dict) else None
    if values is None and isinstance(payload, dict):
        values = payload.get("data")
    if isinstance(values, dict):
        values = values.get("data") or values.get("list") or values.get("items")
    return normalize_accounts(values, "YYB_SERVER /accounts")


def parse_yyb_go_env() -> List[Dict[str, str]]:
    """解析 YYB_SERVER 环境变量，格式：地址@微信账号标识，多行换行。"""
    raw = _env("YYB_SERVER")
    if not raw:
        return []
    accounts = []
    for index, line in enumerate(raw.splitlines(), 1):
        value = str(line or "").strip()
        if not value:
            continue
        at_index = value.find("@")
        if at_index == -1:
            print(f"  [YYB_SERVER 第{index}行] 格式错误，缺少 @ 分隔符：{value}")
            continue
        server = value[:at_index].strip()
        ref = value[at_index + 1 :].strip()
        # 去掉 http:// 或 https:// 前缀
        if server.startswith("http://"):
            server = server[7:]
        elif server.startswith("https://"):
            server = server[8:]
        server = server.rstrip("/")
        if not server or not ref:
            print(f"  [YYB_SERVER 第{index}行] 地址或 ref 为空，已跳过")
            continue
        accounts.append(
            {
                "name": f"YYB_SERVER账号{index}",
                "ref": ref,
                "remark": "",
            }
        )
    return accounts


def load_accounts() -> List[Dict[str, str]]:
    raw = _env("JD_ACCOUNTS_JSON")
    if raw:
        try:
            values = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"JD_ACCOUNTS_JSON 不是有效 JSON：{exc}") from exc
        return normalize_accounts(values, "JD_ACCOUNTS_JSON")
    yyb_go_accounts = parse_yyb_go_env()
    if yyb_go_accounts:
        return yyb_go_accounts
    if CONFIG_ACCOUNTS:
        return normalize_accounts(CONFIG_ACCOUNTS, "脚本 CONFIG_ACCOUNTS")
    return load_service_accounts()


def get_yyb_code(
    account: Dict[str, str],
    app_id: Optional[str] = None,
) -> str:
    request_app_id = str(app_id or JD_APPID).strip()
    payload = request_json(
        "POST",
        f"{YYB_SERVER}/wxapp/getCode",
        data={"ref": account["ref"], "app_id": request_app_id},
    )
    result = unwrap_service_payload(payload)
    # yyb_go 的 data 同时带有 openid；PT 链的账号仍由同一个 ref 标识。
    openid = nested_string(result, ("openid", "openId", "open_id"))
    if openid:
        account["_openid"] = openid
    code = nested_string(result, ("wxCode", "wx_code", "jsCode", "jscode", "code"))
    if len(code) < 8 or code in {"0", "200", "201"}:
        raise RuntimeError("应用宝 getCode 未返回有效一次性 code")
    return code


def get_yyb_user_info(account: Dict[str, str]) -> Dict[str, str]:
    payload = request_json(
        "POST",
        f"{YYB_SERVER}/wxapp/operateWxData",
        data={
            "ref": account["ref"],
            "app_id": JD_APPID,
            # yyb_go 会把 payload 原样交给小程序 API；必须打开
            # withCredentials，才能稳定拿到 encryptedData/iv/rawData。
            "payload": {
                "api_name": "getUserInfo",
                "data": {"withCredentials": True},
                "env": 1,
            },
        },
    )
    result = unwrap_service_payload(payload)
    raw_data = nested_value(result, ("rawData", "raw_data"))
    # 部分 operateWxData 版本只返回 userInfo，不返回 rawData。
    # 微信端的 rawData 本质上就是 JSON.stringify(userInfo)，可按原字段顺序重建。
    if raw_data in (None, ""):
        user_info = nested_value(result, ("userInfo", "user_info"))
        if isinstance(user_info, str) and user_info.strip().startswith("{"):
            try:
                user_info = json.loads(user_info)
            except json.JSONDecodeError:
                user_info = None
        if not isinstance(user_info, dict):
            standard_keys = (
                "nickName",
                "gender",
                "language",
                "city",
                "province",
                "country",
                "avatarUrl",
            )
            direct_info: Dict[str, Any] = {}
            for key in standard_keys:
                value = nested_value(result, (key,))
                if value is not None:
                    direct_info[key] = value
            user_info = direct_info or None
        if isinstance(user_info, dict) and user_info:
            raw_data = json.dumps(
                user_info,
                ensure_ascii=False,
                separators=(",", ":"),
            )
    if isinstance(raw_data, (dict, list)):
        raw_data_text = json.dumps(
            raw_data,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    else:
        raw_data_text = str(raw_data or "").strip()
    encrypted = nested_string(
        result,
        (
            "encryptedData",
            "encrytData",
            "encrypted_data",
            "encrypteddata",
        ),
    )
    info = {
        "rawData": raw_data_text,
        "signature": nested_string(result, ("signature",)),
        "encrytData": encrypted,
        "iv": nested_string(result, ("iv",)),
        "openid": nested_string(result, ("openid", "openId", "open_id")),
    }
    missing = [
        key
        for key in ("rawData", "signature", "encrytData", "iv")
        if not info[key]
    ]
    if missing:
        result_keys = []
        if isinstance(result, dict):
            result_keys = [str(key) for key in result.keys()][:20]
        detail = "；返回字段=" + ",".join(result_keys) if result_keys else ""
        raise RuntimeError(
            "应用宝 getUserInfo 缺少字段：" + ",".join(missing) + detail
        )
    return info


def login_headers() -> Dict[str, str]:
    return {
        "User-Agent": UA_WX,
        "Referer": f"https://servicewechat.com/{JD_APPID}/873/page-frame.html",
        "Accept": "application/json,text/plain,*/*",
    }


def call_login_lt(
    opener: CookieOpener,
    code: str,
    user_info: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    # login_lt 即使是 code-only 也需要 appid 和完整的小程序上下文；
    # isIgnoreCookie 必须为 false，否则京东不会把 pt_key/pt_pin 写入会话。
    params = {
        "appid": JD_APPID,
        "code": code,
        "type": "silent",
        "isPopup": "false",
        "isIgnoreCookie": "false",
        "isOfficialPin": "false",
        "loginColor": "{}",
        "returnUrl": "pages/my/index/index",
        "deviceName": "iPhone",
        "deviceOS": "iOS",
        "deviceOSVersion": "17.0",
        "deviceVersion": "8.0.49",
        "g_tk": "0",
        "g_ty": "ls",
    }
    if user_info:
        params.update(
            {
                "rawData": user_info["rawData"],
                "signature": user_info["signature"],
                "encrytData": user_info["encrytData"],
                "encryptedData": user_info["encrytData"],
                "iv": user_info["iv"],
                "ou": user_info.get("openid", ""),
            }
        )
    url = "https://wq.jd.com/mlogin/wxapp/login_lt?" + urllib.parse.urlencode(params)
    status, response_headers, raw = request_text(
        "GET",
        url,
        headers=login_headers(),
        opener=opener,
    )
    header_cookie = cookie_from_headers(response_headers)
    if header_cookie:
        opener.last_response_cookie = header_cookie
    if status < 200 or status >= 400:
        raise RuntimeError(f"login_lt HTTP {status}")
    return parse_jsonish(raw)


def normalize_pt_cookie(cookie: Any) -> str:
    if isinstance(cookie, CookieJar):
        values: Dict[str, str] = {}
        for item in cookie:
            if item.name in {"pt_key", "pt_pin"} and item.value:
                values[item.name] = str(item.value)
        if values.get("pt_key") and values.get("pt_pin"):
            return f"pt_key={values['pt_key']};pt_pin={values['pt_pin']};"
        return ""

    text = str(cookie or "")
    key_match = re.search(r"(?:^|[;?,\s])pt_key=([^;?,\s]+)", text)
    pin_match = re.search(r"(?:^|[;?,\s])pt_pin=([^;?,\s]+)", text)
    if not key_match or not pin_match:
        return ""
    return f"pt_key={key_match.group(1)};pt_pin={pin_match.group(1)};"


def cookie_from_headers(headers: Dict[str, Any]) -> str:
    """CookieJar 未接住 3xx/异常响应时，从 Set-Cookie 头补取标准 Cookie。"""
    for key, value in (headers or {}).items():
        if str(key).lower() not in {"set-cookie", "set-cookie2"}:
            continue
        cookie = normalize_pt_cookie(str(value))
        if cookie:
            return cookie
    return ""


def cookie_from_payload(payload: Any) -> str:
    pt_key = nested_string(payload, ("pt_key", "ptKey"))
    pt_pin = nested_string(payload, ("pt_pin", "ptPin"))
    if pt_key and pt_pin:
        return normalize_pt_cookie(f"pt_key={pt_key};pt_pin={pt_pin};")
    return normalize_pt_cookie(str(payload or ""))


def all_cookie_text(jar: CookieJar) -> str:
    values: Dict[str, str] = {}
    for cookie in jar:
        if cookie.name and cookie.value is not None:
            values[cookie.name] = str(cookie.value)
    return ";".join(f"{key}={value}" for key, value in values.items()) + (
        ";" if values else ""
    )


def cookie_pin(cookie: str) -> str:
    pure = normalize_pt_cookie(cookie)
    match = re.search(r"(?:^|[;,\s])pt_pin=([^;,\s]+)", pure)
    return match.group(1) if match else ""


def normalize_pin(pin: str) -> str:
    raw = str(pin or "").strip()
    if not raw:
        return ""
    try:
        return urllib.parse.quote(urllib.parse.unquote(raw), safe="")
    except Exception:
        return raw


def pin_variants(pin: str) -> set:
    raw = str(pin or "").strip()
    if not raw:
        return set()
    values = {raw}
    try:
        values.add(urllib.parse.unquote(raw))
    except Exception:
        pass
    try:
        values.add(urllib.parse.quote(raw, safe=""))
        values.add(urllib.parse.quote(urllib.parse.unquote(raw), safe=""))
    except Exception:
        pass
    return {value for value in values if value}


def login_info(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    info = payload.get("info")
    if isinstance(info, dict):
        return info
    data = payload.get("data")
    if isinstance(data, dict):
        nested = data.get("info")
        return nested if isinstance(nested, dict) else data
    return payload


def allowed_jd_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (
        host == "jd.com" or host.endswith(".jd.com")
    )


def follow_server_refresh(opener: CookieOpener, payload: Dict[str, Any]) -> str:
    info = login_info(payload)
    current = nested_string(info, ("ACRJUrl", "acrjUrl"))
    state = nested_string(info, ("ACRJState", "acrjState"))
    if not current:
        return ""
    if current.startswith("//"):
        current = "https:" + current
    elif current.startswith("/"):
        current = "https://wq.jd.com" + current
    if state and "ACRJState=" not in current:
        parsed = urllib.parse.urlparse(current)
        query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        query.append(("ACRJState", state))
        current = urllib.parse.urlunparse(
            parsed._replace(query=urllib.parse.urlencode(query))
        )

    headers = dict(login_headers())
    headers["Accept"] = "text/html,application/xhtml+xml,application/json,*/*;q=0.8"
    for _ in range(8):
        if not allowed_jd_url(current):
            raise RuntimeError("服务端刷新地址不是受信任的京东 HTTPS 域名，已停止")
        status, response_headers, _raw = request_text(
            "GET",
            current,
            headers=headers,
            opener=opener,
        )
        result = normalize_pt_cookie(opener.cookie_jar)
        if not result:
            result = cookie_from_headers(response_headers)
        if result:
            return result
        location = (
            response_headers.get("Location")
            or response_headers.get("location")
            or ""
        )
        if status not in {301, 302, 303, 307, 308} or not location:
            break
        current = urllib.parse.urljoin(current, location)
    return normalize_pt_cookie(opener.cookie_jar)


def jd_pt_headers() -> Dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 10; Pixel 4 XL) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 "
            "Mobile Safari/537.36 MicroMessenger/7.0.20.1781 "
            "NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9",
    }


def jd_pt_allowed_redirect(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (
        host == "jd.com"
        or host.endswith(".jd.com")
        or host == "jd.hk"
        or host.endswith(".jd.hk")
        or host == "3.cn"
        or host.endswith(".3.cn")
    )


def jd_pt_html_redirect(base_url: str, raw: str) -> str:
    """处理部分京东节点用 HTTP 200 + JS/meta 跳转代替 3xx 的情况。"""
    text = html.unescape(str(raw or ""))
    patterns = (
        r"<meta[^>]+url\s*=\s*[\"']?([^\"' >]+)",
        r"(?:window\.)?location(?:\.href)?\s*=\s*[\"']([^\"']+)",
        r"location\.replace\s*\(\s*[\"']([^\"']+)",
        r"location\.assign\s*\(\s*[\"']([^\"']+)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            candidate = urllib.parse.urljoin(base_url, match.group(1).strip())
            if candidate:
                return candidate
    return ""


def jd_pt_cookie_login(code: str) -> str:
    """移植 yyb_go_pure/internal/httpapi/jdpt.go 的 PT OAuth 跳转链。"""
    session = CookieOpener()
    login_url = "https://plogin.m.jd.com/user/login.action?" + urllib.parse.urlencode(
        {"appid": JD_PT_APP, "returnurl": JD_PT_RETURN_URL}
    )
    status, headers, _raw = request_text(
        "GET", login_url, headers=jd_pt_headers(), opener=session
    )
    location = headers.get("Location") or headers.get("location") or ""
    if not location or status < 300 or status >= 400:
        raise RuntimeError(f"JD PT login.action 未跳转：HTTP {status}")
    oauth_url = urllib.parse.urljoin(login_url, location)
    oauth = urllib.parse.urlparse(oauth_url)
    oauth_query = urllib.parse.parse_qs(oauth.query, keep_blank_values=True)
    if oauth_query.get("appid", [""])[0] != JD_PT_APPID:
        raise RuntimeError("JD PT OAuth appid 不匹配")
    redirect_uri = oauth_query.get("redirect_uri", [""])[0]
    state = oauth_query.get("state", [""])[0]
    if not redirect_uri or not state:
        raise RuntimeError("JD PT OAuth 缺少 redirect_uri/state")
    callback = urllib.parse.urlparse(redirect_uri)
    callback_query = urllib.parse.parse_qsl(callback.query, keep_blank_values=True)
    callback_query.extend([("code", code), ("state", state)])
    callback = callback._replace(query=urllib.parse.urlencode(callback_query))
    current = urllib.parse.urlunparse(callback)

    last_status = 0
    for _ in range(8):
        if not jd_pt_allowed_redirect(current):
            raise RuntimeError("JD PT 刷新跳转超出允许的京东域名")
        last_status, response_headers, raw = request_text(
            "GET", current, headers=jd_pt_headers(), opener=session
        )
        cookie = normalize_pt_cookie(session.cookie_jar)
        if not cookie:
            cookie = cookie_from_headers(response_headers)
        if not cookie:
            cookie = normalize_pt_cookie(raw)
        if cookie:
            return cookie
        location = (
            response_headers.get("Location")
            or response_headers.get("location")
            or ""
        )
        if not location and last_status == 200:
            location = jd_pt_html_redirect(current, raw)
        if not location or (
            last_status not in {200, 301, 302, 303, 307, 308}
        ):
            break
        current = urllib.parse.urljoin(current, location)
    cookie_names = ",".join(
        sorted({item.name for item in session.cookie_jar if item.name})
    ) or "无"
    raise RuntimeError(
        "JD PT 刷新链未返回 pt_key/pt_pin；"
        f"last_status={last_status}；Cookie字段={cookie_names}"
    )


def exchange_pt_cookie(account: Dict[str, str]) -> str:
    """使用旧 8000 yyb_go 重新取 PT 专用 code，再执行 jdpt.go 的 OAuth 链。"""
    pt_code = get_yyb_code(account, app_id=JD_PT_APPID)
    return jd_pt_cookie_login(pt_code)


def attempt_code_login(account: Dict[str, str], full: bool = False) -> str:
    session = CookieOpener()
    # 每次 attempt 都取全新 code，失败后绝不复用。
    code = get_yyb_code(account)
    user_info = get_yyb_user_info(account) if full else None
    payload = call_login_lt(session, code, user_info)
    cookie = normalize_pt_cookie(session.cookie_jar)
    if not cookie:
        cookie = str(getattr(session, "last_response_cookie", "") or "")
    if not cookie:
        cookie = cookie_from_payload(payload)
    if not cookie:
        cookie = follow_server_refresh(session, payload)
    if cookie:
        if COOKIE_MODE == "all":
            return all_cookie_text(session.cookie_jar)
        return normalize_pt_cookie(cookie)
    exchange_error = ""
    if COOKIE_MODE in {"pt", "all"}:
        try:
            return exchange_pt_cookie(account)
        except Exception as exc:
            exchange_error = str(exc)
    message = jd_login_message(payload)
    ret_code = nested_value(payload, ("retCode", "resultCode", "errorCode"))
    payload_fields = (
        ",".join(str(key) for key in payload.keys())
        if isinstance(payload, dict)
        else ""
    )
    jar_fields = ",".join(sorted({item.name for item in session.cookie_jar}))
    detail = []
    if ret_code not in (None, ""):
        detail.append("业务码=" + str(ret_code))
    if payload_fields:
        detail.append("响应字段=" + payload_fields)
    if jar_fields:
        detail.append("Cookie字段=" + jar_fields)
    suffix = "；" + "；".join(detail) if detail else ""
    if exchange_error:
        suffix += "；PT exchange=" + exchange_error
    raise RuntimeError(
        (message or "login_lt 未返回 pt_key/pt_pin 或可用 ACRJUrl") + suffix
    )


def login_via_code(account: Dict[str, str]) -> str:
    if LOGIN_MODE == "code":
        return attempt_code_login(account, full=False)
    if LOGIN_MODE == "full":
        return attempt_code_login(account, full=True)
    if LOGIN_MODE != "auto":
        raise RuntimeError("JD_LOGIN_MODE 只能是 auto、code 或 full")
    try:
        return attempt_code_login(account, full=False)
    except Exception as code_error:
        if "登录缓存已过期" in str(code_error) or "login_buffer expired" in str(code_error):
            raise
        print(f"  code-only 未完成登录，改用全参数新 code：{code_error}")
        return attempt_code_login(account, full=True)


def ql_ok(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("success") is True:
        return True
    if "code" not in payload:
        return True
    return str(payload.get("code")) in {"0", "200", "201"}


def ql_items(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("data", "list", "items", "envs", "records"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        if any(key in data for key in ("name", "value", "id", "_id")):
            return [data]
    return []


def ensure_ql_ok(payload: Dict[str, Any], action: str) -> Dict[str, Any]:
    if not ql_ok(payload):
        raise RuntimeError(f"{action}失败：{response_message(payload) or payload}")
    return payload


def ql_request(token: str, method: str, path: str, data: Any = None) -> Dict[str, Any]:
    return request_json(
        method,
        QL_URL + path,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        data=data,
    )


def ql_token() -> str:
    query = urllib.parse.urlencode(
        {"client_id": QL_CLIENT_ID, "client_secret": QL_CLIENT_SECRET}
    )
    payload = request_json("GET", f"{QL_URL}/open/auth/token?{query}")
    ensure_ql_ok(payload, "获取青龙 token")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    token = str(data.get("token") or data.get("access_token") or payload.get("token") or "")
    if not token:
        raise RuntimeError("青龙未返回 token")
    return token


def ql_envs(token: str) -> List[Dict[str, Any]]:
    query = urllib.parse.urlencode({"searchValue": QL_COOKIE_ENV_NAME})
    payload = ql_request(token, "GET", f"/open/envs?{query}")
    ensure_ql_ok(payload, "读取青龙变量")
    return [
        item
        for item in ql_items(payload)
        if item.get("name") == QL_COOKIE_ENV_NAME
    ]


def env_id(item: Dict[str, Any]) -> Any:
    return item.get("id") if item.get("id") is not None else item.get("_id")


def account_remark(account: Dict[str, str], cookie: str) -> str:
    if account.get("remark"):
        return account["remark"]
    pin = normalize_pin(cookie_pin(cookie))
    return pin or f"JD_COOKIE-{account['name']}"


def find_existing_env(
    envs: List[Dict[str, Any]],
    cookie: str,
    remark: str,
) -> Optional[Dict[str, Any]]:
    target_pin = normalize_pin(cookie_pin(cookie))
    target_variants = pin_variants(target_pin)
    for item in envs:
        old_cookie = normalize_pt_cookie(item.get("value") or "")
        old_pin = normalize_pin(cookie_pin(old_cookie))
        old_remark = str(item.get("remarks") or item.get("remark") or "").strip()
        if old_pin and pin_variants(old_pin).intersection(target_variants):
            return item
        if old_remark and pin_variants(old_remark).intersection(target_variants):
            return item
        if old_remark == remark or old_cookie == normalize_pt_cookie(cookie):
            return item
    return None


def update_ql_env(
    token: str,
    item_id: Any,
    cookie: str,
    remark: str,
) -> None:
    base = {
        "name": QL_COOKIE_ENV_NAME,
        "value": cookie,
        "remarks": remark,
    }
    identifier = str(item_id)
    candidates: List[Dict[str, Any]] = []
    if identifier.isdigit():
        candidates.append(dict(base, id=int(identifier)))
        candidates.append(dict(base, _id=identifier))
    else:
        candidates.append(dict(base, _id=identifier))
        candidates.append(dict(base, id=identifier))
    errors: List[str] = []
    for body in candidates:
        try:
            payload = ql_request(token, "PUT", "/open/envs", body)
            if ql_ok(payload):
                return
            errors.append(response_message(payload) or str(payload))
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError("更新青龙变量失败：" + "；".join(errors))


def create_ql_env(token: str, cookie: str, remark: str) -> None:
    item = {
        "name": QL_COOKIE_ENV_NAME,
        "value": cookie,
        "remarks": remark,
    }
    errors: List[str] = []
    for body in ([item], item):
        try:
            payload = ql_request(token, "POST", "/open/envs", body)
            if ql_ok(payload):
                return
            errors.append(response_message(payload) or str(payload))
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError("创建青龙变量失败：" + "；".join(errors))


def enable_ql_env(token: str, item_id: Any) -> None:
    identifier = int(item_id) if str(item_id).isdigit() else item_id
    for body in ([identifier], [str(item_id)]):
        try:
            payload = ql_request(token, "PUT", "/open/envs/enable", body)
            if ql_ok(payload):
                return
        except Exception:
            pass


def sync_ql(
    token: str,
    account: Dict[str, str],
    cookie: str,
) -> str:
    pure_cookie = normalize_pt_cookie(cookie)
    if not pure_cookie:
        raise RuntimeError("待同步结果缺少 pt_key/pt_pin")
    value = cookie if COOKIE_MODE == "all" else pure_cookie
    new_remark = account_remark(account, pure_cookie)
    envs = ql_envs(token)
    existing = find_existing_env(envs, pure_cookie, new_remark)
    if existing:
        item_id = env_id(existing)
        if item_id in (None, ""):
            raise RuntimeError("已有青龙变量缺少 id/_id")
        old_remark = str(existing.get("remarks") or "").strip()
        old_pin = normalize_pin(cookie_pin(existing.get("value") or ""))
        # 旧备注等于旧 pt_pin → 未被手动改过，用新 pt_pin 覆盖；否则保留旧备注
        final_remark = new_remark if old_remark == old_pin else (old_remark or new_remark)
        update_ql_env(token, item_id, value, final_remark)
        enable_ql_env(token, item_id)
        return "update"
    create_ql_env(token, value, new_remark)
    return "create"


def validate_url(name: str, value: str) -> None:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError(f"{name} 必须是包含 http:// 或 https:// 的完整地址")


def validate_config() -> None:
    validate_url("YYB_SERVER", YYB_SERVER)
    validate_url("QL_URL", QL_URL)
    if not QL_CLIENT_ID or not QL_CLIENT_SECRET:
        raise RuntimeError("必须通过环境变量配置 QL_CLIENT_ID 和 QL_CLIENT_SECRET")
    if LOGIN_MODE not in {"auto", "code", "full"}:
        raise RuntimeError("JD_LOGIN_MODE 只能是 auto、code 或 full")
    if COOKIE_MODE not in {"pt", "all"}:
        raise RuntimeError("JD_COOKIE_MODE 只能是 pt 或 all")


def main() -> int:
    validate_config()
    accounts = load_accounts()
    print(
        "京东小程序 code 登录："
        f"mode={LOGIN_MODE}, "
        f"cookie={COOKIE_MODE}, accounts={len(accounts)}"
    )
    print(f"应用宝 code 服务：{YYB_SERVER}")
    print("PT exchange：脚本内置 yyb_go_pure jdpt.go OAuth 链")
    if COOKIE_MODE == "all":
        print("⚠️ all 模式会向青龙写入全部 Cookie；普通京东任务建议使用 pt 模式")
    token = ql_token()
    succeeded = 0
    for account in accounts:
        print(f"开始：{account['name']} ref={account['ref']}")
        try:
            cookie = login_via_code(account)
            if not normalize_pt_cookie(cookie):
                raise RuntimeError("登录结果缺少 pt_key/pt_pin")
            action = sync_ql(token, account, cookie)
            print("  已更新青龙变量" if action == "update" else "  已创建青龙变量")
            succeeded += 1
        except Exception as exc:
            print(f"  失败：{exc}")
        time.sleep(1)
    failed = len(accounts) - succeeded
    print(f"完成：成功 {succeeded}，失败 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
