import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

export class GoogleMapsFetch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Maps Fetch',
		name: 'googleMapsFetch',
		icon: 'file:gmaps.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["searchQuery"] }}',
		description:
			'Fetches Google Maps search HTML with browser-like fingerprint and full cookie capture (NID, CONSENT, SOCS, AEC)',
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
						description: 'HTTP/HTTPS/SOCKS proxy URL (e.g. Evomi residential)',
						typeOptions: { password: true },
					},
					{
						displayName: 'Existing Cookies',
						name: 'cookies',
						type: 'string',
						default: '',
						description:
							'Cookie string to send with request. Format: "NID=...; CONSENT=...; SOCS=..."',
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const searchQuery = this.getNodeParameter('searchQuery', i) as string;
				const lat = this.getNodeParameter('lat', i) as string;
				const lng = this.getNodeParameter('lng', i) as string;
				const zoom = this.getNodeParameter('zoom', i) as number;
				const hl = this.getNodeParameter('hl', i) as string;
				const gl = this.getNodeParameter('gl', i) as string;
				const options = this.getNodeParameter('options', i, {}) as {
					proxyUrl?: string;
					cookies?: string;
					device?: string;
					timeout?: number;
					returnHtml?: boolean;
					followRedirect?: boolean;
				};

				// Build URL — same pattern as your HTTP node
				const encoded = encodeURIComponent(searchQuery).replace(/%20/g, '+');
				let url = `https://www.google.com/maps/search/${encoded}`;
				if (lat && lng) {
					url += `/@${lat},${lng},${zoom}z`;
				}
				url += `?hl=${hl}&gl=${gl}`;

				// Cookie jar — captures Set-Cookie from every response in the redirect chain
				const jar = new CookieJar();
				if (options.cookies) {
					const cookieParts = options.cookies
						.split(';')
						.map((c) => c.trim())
						.filter(Boolean);
					for (const part of cookieParts) {
						try {
							await jar.setCookie(part, 'https://www.google.com');
						} catch {
							/* ignore malformed */
						}
					}
				}

				// Device fingerprint profile for header-generator
				const deviceMap: Record<string, any> = {
					'chrome-desktop': {
						devices: ['desktop'],
						operatingSystems: ['windows'],
						browsers: [{ name: 'chrome', minVersion: 120 }],
					},
					'chrome-mobile': {
						devices: ['mobile'],
						operatingSystems: ['android'],
						browsers: [{ name: 'chrome', minVersion: 120 }],
					},
					'firefox-desktop': {
						devices: ['desktop'],
						operatingSystems: ['windows'],
						browsers: [{ name: 'firefox', minVersion: 120 }],
					},
				};
				const headerOptions = deviceMap[options.device || 'chrome-desktop'];

				const response = await gotScraping({
					url,
					cookieJar: jar,
					timeout: { request: options.timeout ?? 30000 },
					proxyUrl: options.proxyUrl || undefined,
					followRedirect: options.followRedirect !== false,
					headerGeneratorOptions: headerOptions,
					retry: { limit: 0 },
					throwHttpErrors: false,
				});

				// Read all cookies in the jar (covers redirect chain too)
				const allCookies = await jar.getCookies('https://www.google.com');
				const cookieMap: Record<string, string> = {};
				for (const c of allCookies) {
					cookieMap[c.key] = c.value;
				}
				const cookieString = allCookies
					.map((c) => `${c.key}=${c.value}`)
					.join('; ');

				const out: Record<string, any> = {
					url,
					final_url: response.url,
					status: response.statusCode,
					cookies: cookieMap,
					cookie_string: cookieString,
					nid: cookieMap.NID || null,
					consent: cookieMap.CONSENT || null,
					socs: cookieMap.SOCS || null,
					aec: cookieMap.AEC || null,
					response_headers: response.headers,
					html_length: response.body.length,
				};

				if (options.returnHtml !== false) {
					out.html = response.body;
				}

				returnData.push({ json: out, pairedItem: i });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: i,
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}