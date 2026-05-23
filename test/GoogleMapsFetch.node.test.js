'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mockGotScraping, makeContext, fakeResponse } = require('./helpers');

// Mock got-scraping BEFORE the node module is required (it does
// `require('got-scraping')` at load time).
const got = mockGotScraping();

const { GoogleMapsFetch } = require('../dist/nodes/GoogleMapsFetch/GoogleMapsFetch.node.js');

function run(params, opts) {
	const node = new GoogleMapsFetch();
	return node.execute.call(makeContext(params, opts));
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
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	await run(baseParams);

	assert.equal(got.calls.length, 1);
	assert.equal(
		got.calls[0].url,
		'https://www.google.com/maps/search/restaurants+in+delhi?hl=en&gl=in',
	);
});

test('encodes spaces as "+" in the query', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	await run({ ...baseParams, searchQuery: 'cafe near me' });

	assert.match(got.calls[0].url, /\/maps\/search\/cafe\+near\+me\?/);
});

test('appends @lat,lng,zoomz when coordinates are provided', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	await run({ ...baseParams, lat: '28.6139', lng: '77.2090', zoom: 15 });

	assert.equal(
		got.calls[0].url,
		'https://www.google.com/maps/search/restaurants+in+delhi/@28.6139,77.2090,15z?hl=en&gl=in',
	);
});

test('passes proxy, timeout and followRedirect options through to gotScraping', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	await run({
		...baseParams,
		options: {
			proxyUrl: 'http://user:pass@host:8080',
			timeout: 5000,
			followRedirect: false,
			device: 'firefox-desktop',
		},
	});

	const call = got.calls[0];
	assert.equal(call.proxyUrl, 'http://user:pass@host:8080');
	assert.deepEqual(call.timeout, { request: 5000 });
	assert.equal(call.followRedirect, false);
	assert.deepEqual(call.headerGeneratorOptions.browsers, [
		{ name: 'firefox', minVersion: 120 },
	]);
});

test('defaults to chrome-desktop fingerprint and 30s timeout', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	await run(baseParams);

	const call = got.calls[0];
	assert.deepEqual(call.timeout, { request: 30000 });
	assert.equal(call.followRedirect, true);
	assert.deepEqual(call.headerGeneratorOptions.operatingSystems, ['windows']);
});

test('parses incoming cookie string and extracts named cookies', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	const result = await run({
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

test('shapes the output with status, urls and html length', async () => {
	got.calls.length = 0;
	got.setResponse(
		fakeResponse({
			url: 'https://www.google.com/maps/final',
			statusCode: 302,
			body: '<html>0123456789</html>',
		}),
	);

	const result = await run(baseParams);
	const out = result[0][0].json;

	assert.equal(out.status, 302);
	assert.equal(out.final_url, 'https://www.google.com/maps/final');
	assert.equal(out.html_length, '<html>0123456789</html>'.length);
	assert.equal(out.html, '<html>0123456789</html>');
});

test('omits html body when returnHtml is false', async () => {
	got.calls.length = 0;
	got.setResponse(fakeResponse());

	const result = await run({
		...baseParams,
		options: { returnHtml: false },
	});

	const out = result[0][0].json;
	assert.equal(out.html, undefined);
	assert.equal(out.html_length, '<html>maps</html>'.length);
});

test('continueOnFail captures the error instead of throwing', async () => {
	got.calls.length = 0;
	got.setError(new Error('network down'));

	const result = await run(baseParams, { continueOnFail: true });

	assert.equal(result[0][0].json.error, 'network down');
});

test('throws a NodeOperationError when continueOnFail is off', async () => {
	got.calls.length = 0;
	got.setError(new Error('boom'));

	await assert.rejects(() => run(baseParams, { continueOnFail: false }), /boom/);
});
