'use strict';

const Module = require('module');

/**
 * Replace `got-scraping` in the require cache with a fake before the node is
 * loaded, so execute() never hits the network. Returns a controller object:
 *   - calls:   array of option objects gotScraping was called with
 *   - setResponse(res): the next (and subsequent) responses to return
 *   - setError(err):    make the next call reject
 */
function mockGotScraping() {
	const controller = {
		calls: [],
		_response: null,
		_error: null,
		setResponse(res) {
			this._response = res;
			this._error = null;
		},
		setError(err) {
			this._error = err;
		},
	};

	const fakeGotScraping = async (opts) => {
		controller.calls.push(opts);
		if (controller._error) throw controller._error;
		return controller._response;
	};

	const id = require.resolve('got-scraping');
	require.cache[id] = {
		id,
		filename: id,
		loaded: true,
		exports: { gotScraping: fakeGotScraping },
	};

	return controller;
}

/**
 * Build a minimal fake IExecuteFunctions for a single input item.
 * @param {object} params  flat map of parameter name -> value
 * @param {object} opts    { continueOnFail }
 */
function makeContext(params, opts = {}) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _i, fallback) =>
			name in params ? params[name] : fallback,
		continueOnFail: () => opts.continueOnFail === true,
		getNode: () => ({ name: 'Google Maps Fetch', type: 'googleMapsFetch' }),
	};
}

/** A canned successful response from gotScraping. */
function fakeResponse(overrides = {}) {
	return {
		url: 'https://www.google.com/maps/search/test',
		statusCode: 200,
		headers: { 'content-type': 'text/html' },
		body: '<html>maps</html>',
		...overrides,
	};
}

module.exports = { mockGotScraping, makeContext, fakeResponse };
