'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { makeHttpRequest, makeContext, fakeResponse } = require('./helpers');

const { GoogleMapsFetch } = require('../dist/nodes/GoogleMapsFetch/GoogleMapsFetch.node.js');

// Run the node with given params; `responses` controls the fake httpRequest.
function run(params, { responses, continueOnFail } = {}) {
	const http = makeHttpRequest(responses ?? fakeResponse());
	const node = new GoogleMapsFetch();
	const ctx = makeContext(params, { httpRequest: http, continueOnFail });
	return node.execute.call(ctx).then((result) => ({ result, http }));
}

const baseParams = {
	searchQuery: 'restaurants in delhi',
	lat: '',
	lng: '',
	zoom: 13,
	hl: 'en',
	gl: 'in',
	options: {},
};

test('builds a basic search URL without coordinates', async () => {
	const { http } = await run(baseParams);
	assert.equal(http.calls.length, 1);
	assert.equal(
		http.calls[0].url,
		'https://www.google.com/maps/search/restaurants+in+delhi?hl=en&gl=in',
	);
});

test('encodes spaces as "+" in the query', async () => {
	const { http } = await run({ ...baseParams, searchQuery: 'cafe near me' });
	assert.match(http.calls[0].url, /\/maps\/search\/cafe\+near\+me\?/);
});

test('appends @lat,lng,zoomz when coordinates are provided', async () => {
	const { http } = await run({ ...baseParams, lat: '28.6139', lng: '77.2090', zoom: 15 });
	assert.equal(
		http.calls[0].url,
		'https://www.google.com/maps/search/restaurants+in+delhi/@28.6139,77.2090,15z?hl=en&gl=in',
	);
});

test('parses proxy URL into n8n proxy option with auth', async () => {
	const { http } = await run({
		...baseParams,
		options: { proxyUrl: 'http://user:p%40ss@host.example:8080' },
	});
	assert.deepEqual(http.calls[0].proxy, {
		host: 'host.example',
		port: 8080,
		protocol: 'http',
		auth: { username: 'user', password: 'p@ss' },
	});
});

test('passes timeout through and disables auto-redirect', async () => {
	const { http } = await run({ ...baseParams, options: { timeout: 5000 } });
	const call = http.calls[0];
	assert.equal(call.timeout, 5000);
	assert.equal(call.disableFollowRedirect, true);
	assert.equal(call.returnFullResponse, true);
	assert.equal(call.ignoreHttpStatusErrors, true);
});

test('defaults to 30s timeout and chrome-desktop fingerprint', async () => {
	const { http } = await run(baseParams);
	const call = http.calls[0];
	assert.equal(call.timeout, 30000);
	assert.match(call.headers['User-Agent'], /Chrome\/\d+.*Safari/);
	assert.equal(call.headers['sec-ch-ua-platform'], '"Windows"');
});

test('selects firefox fingerprint when requested', async () => {
	const { http } = await run({ ...baseParams, options: { device: 'firefox-desktop' } });
	assert.match(http.calls[0].headers['User-Agent'], /Firefox\/\d+/);
});

test('parses incoming cookie string and extracts named cookies', async () => {
	const { result } = await run({
		...baseParams,
		options: { cookies: 'NID=abc123; CONSENT=YES+1; SOCS=xyz' },
	});
	const out = result[0][0].json;
	assert.equal(out.nid, 'abc123');
	assert.equal(out.consent, 'YES+1');
	assert.equal(out.socs, 'xyz');
	assert.equal(out.aec, null);
	assert.equal(out.cookies.NID, 'abc123');
	assert.match(out.cookie_string, /NID=abc123/);
});

test('sends jar cookies in the Cookie request header', async () => {
	const { http } = await run({
		...baseParams,
		options: { cookies: 'NID=abc123' },
	});
	assert.match(http.calls[0].headers.Cookie, /NID=abc123/);
});

test('follows redirects manually and captures Set-Cookie from every hop', async () => {
	const responses = [
		fakeResponse({
			statusCode: 302,
			headers: {
				location: 'https://www.google.com/maps/final',
				'set-cookie': ['NID=fromhop1; Domain=.google.com; Path=/'],
			},
			body: '',
		}),
		fakeResponse({
			statusCode: 200,
			headers: {
				'set-cookie': ['SOCS=fromhop2; Domain=.google.com; Path=/'],
			},
			body: '<html>final</html>',
		}),
	];

	const { result, http } = await run(baseParams, { responses });
	const out = result[0][0].json;

	assert.equal(http.calls.length, 2, 'should make two requests (initial + redirect)');
	assert.equal(out.final_url, 'https://www.google.com/maps/final');
	assert.equal(out.status, 200);
	assert.equal(out.nid, 'fromhop1');
	assert.equal(out.socs, 'fromhop2');
	assert.equal(out.html, '<html>final</html>');
});

test('does not follow redirects when followRedirect is false', async () => {
	const responses = [
		fakeResponse({
			statusCode: 302,
			headers: { location: 'https://www.google.com/maps/final' },
			body: '',
		}),
	];
	const { result, http } = await run(
		{ ...baseParams, options: { followRedirect: false } },
		{ responses },
	);
	assert.equal(http.calls.length, 1);
	assert.equal(result[0][0].json.status, 302);
});

test('shapes the output with status, urls and html length', async () => {
	const { result } = await run(baseParams, {
		responses: fakeResponse({
			statusCode: 200,
			body: '<html>0123456789</html>',
		}),
	});
	const out = result[0][0].json;
	assert.equal(out.status, 200);
	assert.equal(out.html_length, '<html>0123456789</html>'.length);
	assert.equal(out.html, '<html>0123456789</html>');
});

test('omits html body when returnHtml is false', async () => {
	const { result } = await run({ ...baseParams, options: { returnHtml: false } });
	const out = result[0][0].json;
	assert.equal(out.html, undefined);
	assert.equal(out.html_length, '<html>maps</html>'.length);
});

test('continueOnFail captures the error instead of throwing', async () => {
	const { result } = await run(baseParams, {
		responses: new Error('network down'),
		continueOnFail: true,
	});
	assert.equal(result[0][0].json.error, 'network down');
});

test('throws a NodeOperationError when continueOnFail is off', async () => {
	await assert.rejects(
		() => run(baseParams, { responses: new Error('boom'), continueOnFail: false }),
		/boom/,
	);
});
