'use strict';

/**
 * Build a fake httpRequest (n8n's this.helpers.httpRequest) that records every
 * call and returns queued responses in order (the last queued response repeats
 * for any extra calls, e.g. redirect hops).
 *
 * @param {Array<object|function>} responses  response objects, or functions
 *        (opts) => response. A response is { statusCode, headers, body }.
 *        Pass a single Error to make every call reject.
 */
function makeHttpRequest(responses) {
	if (responses instanceof Error) {
		const err = responses;
		const fn = async (opts) => {
			fn.calls.push(opts);
			throw err;
		};
		fn.calls = [];
		return fn;
	}

	const queue = Array.isArray(responses) ? responses : [responses];
	let i = 0;
	const fn = async (opts) => {
		fn.calls.push(opts);
		const r = queue[Math.min(i, queue.length - 1)];
		i++;
		return typeof r === 'function' ? r(opts) : r;
	};
	fn.calls = [];
	return fn;
}

/**
 * Build a minimal fake IExecuteFunctions for a single input item.
 * @param {object} params flat map of parameter name -> value
 * @param {object} opts   { continueOnFail, httpRequest }
 */
function makeContext(params, opts = {}) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _i, fallback) =>
			name in params ? params[name] : fallback,
		continueOnFail: () => opts.continueOnFail === true,
		getNode: () => ({ name: 'Google Maps Fetch', type: 'googleMapsFetch' }),
		helpers: {
			httpRequest: opts.httpRequest || makeHttpRequest(fakeResponse()),
		},
	};
}

/** A canned successful full-response (returnFullResponse shape). */
function fakeResponse(overrides = {}) {
	return {
		statusCode: 200,
		headers: { 'content-type': 'text/html' },
		body: '<html>maps</html>',
		...overrides,
	};
}

module.exports = { makeHttpRequest, makeContext, fakeResponse };
