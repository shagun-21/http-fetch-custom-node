"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleMapsFetch = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const tough_cookie_1 = require("tough-cookie");
const HEADER_PROFILES = {
    'chrome-desktop': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    },
    'chrome-mobile': {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    },
    'firefox-desktop': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    },
};
class GoogleMapsFetch {
    constructor() {
        this.description = {
            displayName: 'Google Maps Fetch',
            name: 'googleMapsFetch',
            icon: 'file:gmaps.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{ $parameter["searchQuery"] }}',
            description: 'Fetches Google Maps search HTML with browser-like fingerprint and full cookie capture (NID, CONSENT, SOCS, AEC)',
            defaults: { name: 'Google Maps Fetch' },
            inputs: ['main'],
            outputs: ['main'],
            properties: [
                {
                    displayName: 'Search Query',
                    name: 'searchQuery',
                    type: 'string',
                    default: '',
                    required: true,
                    placeholder: 'restaurants in delhi',
                },
                {
                    displayName: 'Latitude',
                    name: 'lat',
                    type: 'string',
                    default: '',
                    placeholder: '28.6139',
                },
                {
                    displayName: 'Longitude',
                    name: 'lng',
                    type: 'string',
                    default: '',
                    placeholder: '77.2090',
                },
                {
                    displayName: 'Zoom',
                    name: 'zoom',
                    type: 'number',
                    default: 13,
                    typeOptions: { minValue: 3, maxValue: 21 },
                },
                {
                    displayName: 'Language',
                    name: 'hl',
                    type: 'string',
                    default: 'en',
                },
                {
                    displayName: 'Country',
                    name: 'gl',
                    type: 'string',
                    default: 'in',
                },
                {
                    displayName: 'Options',
                    name: 'options',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Proxy URL',
                            name: 'proxyUrl',
                            type: 'string',
                            default: '',
                            placeholder: 'http://user:pass@host:port',
                            description: 'HTTP/HTTPS proxy URL (e.g. Evomi residential)',
                            typeOptions: { password: true },
                        },
                        {
                            displayName: 'Existing Cookies',
                            name: 'cookies',
                            type: 'string',
                            default: '',
                            description: 'Cookie string to send with request. Format: "NID=...; CONSENT=...; SOCS=..."',
                            typeOptions: { password: true, rows: 3 },
                        },
                        {
                            displayName: 'Device Profile',
                            name: 'device',
                            type: 'options',
                            default: 'chrome-desktop',
                            options: [
                                { name: 'Chrome Desktop (Windows)', value: 'chrome-desktop' },
                                { name: 'Chrome Mobile (Android)', value: 'chrome-mobile' },
                                { name: 'Firefox Desktop', value: 'firefox-desktop' },
                            ],
                        },
                        {
                            displayName: 'Timeout (ms)',
                            name: 'timeout',
                            type: 'number',
                            default: 30000,
                        },
                        {
                            displayName: 'Return HTML',
                            name: 'returnHtml',
                            type: 'boolean',
                            default: true,
                            description: 'Whether to include the full HTML body in output',
                        },
                        {
                            displayName: 'Follow Redirects',
                            name: 'followRedirect',
                            type: 'boolean',
                            default: true,
                        },
                    ],
                },
            ],
        };
    }
    async execute() {
        var _a, _b;
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const searchQuery = this.getNodeParameter('searchQuery', i);
                const lat = this.getNodeParameter('lat', i);
                const lng = this.getNodeParameter('lng', i);
                const zoom = this.getNodeParameter('zoom', i);
                const hl = this.getNodeParameter('hl', i);
                const gl = this.getNodeParameter('gl', i);
                const options = this.getNodeParameter('options', i, {});
                const encoded = encodeURIComponent(searchQuery).replace(/%20/g, '+');
                let url = `https://www.google.com/maps/search/${encoded}`;
                if (lat && lng) {
                    url += `/@${lat},${lng},${zoom}z`;
                }
                url += `?hl=${hl}&gl=${gl}`;
                const jar = new tough_cookie_1.CookieJar();
                if (options.cookies) {
                    const cookieParts = options.cookies
                        .split(';')
                        .map((c) => c.trim())
                        .filter(Boolean);
                    for (const part of cookieParts) {
                        try {
                            await jar.setCookie(part, 'https://www.google.com');
                        }
                        catch {
                        }
                    }
                }
                const baseHeaders = {
                    ...(HEADER_PROFILES[options.device || 'chrome-desktop'] ||
                        HEADER_PROFILES['chrome-desktop']),
                };
                let proxy;
                if (options.proxyUrl) {
                    const p = new URL(options.proxyUrl);
                    proxy = {
                        host: p.hostname,
                        port: Number(p.port) || (p.protocol === 'https:' ? 443 : 80),
                        protocol: p.protocol.replace(':', ''),
                    };
                    if (p.username || p.password) {
                        proxy.auth = {
                            username: decodeURIComponent(p.username),
                            password: decodeURIComponent(p.password),
                        };
                    }
                }
                const followRedirect = options.followRedirect !== false;
                const maxRedirects = 10;
                let currentUrl = url;
                let response;
                let redirects = 0;
                while (true) {
                    const cookieHeader = await jar.getCookieString(currentUrl);
                    const headers = { ...baseHeaders };
                    if (cookieHeader)
                        headers.Cookie = cookieHeader;
                    response = (await this.helpers.httpRequest({
                        url: currentUrl,
                        method: 'GET',
                        headers,
                        timeout: (_a = options.timeout) !== null && _a !== void 0 ? _a : 30000,
                        proxy,
                        encoding: 'text',
                        disableFollowRedirect: true,
                        returnFullResponse: true,
                        ignoreHttpStatusErrors: true,
                    }));
                    const setCookie = response.headers['set-cookie'];
                    if (setCookie) {
                        const list = Array.isArray(setCookie) ? setCookie : [setCookie];
                        for (const sc of list) {
                            try {
                                await jar.setCookie(sc, currentUrl);
                            }
                            catch {
                            }
                        }
                    }
                    const status = response.statusCode;
                    const location = response.headers.location;
                    if (followRedirect && status >= 300 && status < 400 && location && redirects < maxRedirects) {
                        currentUrl = new URL(location, currentUrl).toString();
                        redirects++;
                        continue;
                    }
                    break;
                }
                const allCookies = await jar.getCookies('https://www.google.com');
                const cookieMap = {};
                for (const c of allCookies) {
                    cookieMap[c.key] = c.value;
                }
                const cookieString = allCookies
                    .map((c) => `${c.key}=${c.value}`)
                    .join('; ');
                const body = (_b = response.body) !== null && _b !== void 0 ? _b : '';
                const out = {
                    url,
                    final_url: currentUrl,
                    status: response.statusCode,
                    cookies: cookieMap,
                    cookie_string: cookieString,
                    nid: cookieMap.NID || null,
                    consent: cookieMap.CONSENT || null,
                    socs: cookieMap.SOCS || null,
                    aec: cookieMap.AEC || null,
                    response_headers: response.headers,
                    html_length: body.length,
                };
                if (options.returnHtml !== false) {
                    out.html = body;
                }
                returnData.push({ json: out, pairedItem: i });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: { error: error.message },
                        pairedItem: i,
                    });
                    continue;
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, {
                    itemIndex: i,
                });
            }
        }
        return [returnData];
    }
}
exports.GoogleMapsFetch = GoogleMapsFetch;
//# sourceMappingURL=GoogleMapsFetch.node.js.map