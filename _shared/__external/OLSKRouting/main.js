(function(global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
		typeof define === 'function' && define.amd ? define(['exports'], factory) :
			(factory((global.OLSKRouting = global.OLSKRouting || {})));
}(this, (function(exports) { 'use strict';

	const mod = {

		OLSKRoutingModelIsValid (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				return false;
			}

			if (typeof inputData.OLSKRoutePath !== 'string') {
				return false;
			}

			if (inputData.OLSKRouteRedirect !== undefined) {
				if (typeof inputData.OLSKRouteRedirect !== 'string') {
					return false;
				}

				return true;
			}

			if (typeof inputData.OLSKRouteMethod !== 'string') {
				return false;
			}

			if (typeof inputData.OLSKRouteFunction !== 'function') {
				return false;
			}

			if (inputData.OLSKRouteSignature !== undefined) {
				if (typeof inputData.OLSKRouteSignature !== 'string') {
					return false;
				}

				if (inputData.OLSKRouteSignature.match(/\s/)) {
					return false;
				};
			}

			if (inputData.OLSKRouteIsHidden) {
				if (typeof inputData.OLSKRouteIsHidden !== 'boolean') {
					return false;
				}
			}

			if (inputData.OLSKRouteMiddlewares) {
				if (!Array.isArray(inputData.OLSKRouteMiddlewares)) {
					return false;
				}
			}

			return true;
		},

		_OLSKRoutingQuerify (inputData) {
			return Object.entries(inputData).map(function (e) {
				return e.join('=');
			}).join('&')
		},

		OLSKRoutingCanonicalPath (routePath, params = {}) {
			if (typeof routePath !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			params = Object.assign({}, params);

			let canonicalPath = mod.OLSKRoutingSubstitutionFunction(routePath)(params);

			if (params && params.OLSKRoutingLanguage) {
				canonicalPath = ['/', params.OLSKRoutingLanguage, canonicalPath].join('');

				delete params.OLSKRoutingLanguage;
			}

			if (params && params.OLSKRoutingOrigin) {
				canonicalPath = [params.OLSKRoutingOrigin, canonicalPath].join('');

				delete params.OLSKRoutingOrigin;
			}

			if (params && params.OLSKRoutingHash) {
				canonicalPath = canonicalPath + '#' + mod._OLSKRoutingQuerify(params.OLSKRoutingHash);

				delete params.OLSKRoutingHash;
			}

			const query = mod._OLSKRoutingQuerify(params);

			return canonicalPath + (query ? `?${ query }` : '');
		},

		OLSKRoutingSubstitutionFunction (routePath) {
			if (typeof routePath !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			var functionString = (
				function(inputData) {
					if (typeof inputData !== 'object' || inputData === null) {
						throw new Error('OLSKErrorInputNotValidMissingInput');
					}

					var substitutedPath = 'OLSKRoutingSubstitutionFunctionTemplate';

					(substitutedPath.match(/(:[\w]+(\(.*\))?)/g) || []).forEach(function(e) {
						if (!inputData[e.split(':').pop().split('(').shift()]) {
							throw new Error('OLSKErrorInputNotValidMissingRouteParam');
						}

						substitutedPath = substitutedPath.replace(e, inputData[e.split(':').pop().split('(').shift()]);

						delete inputData[e.split(':').pop().split('(').shift()]
					});

					return substitutedPath;
				}
			).toString().replace('OLSKRoutingSubstitutionFunctionTemplate', routePath);

			var alfa;
			eval('alfa = ' + functionString);
			return alfa;
		},
		
	};

	Object.assign(exports, mod);

	Object.defineProperty(exports, '__esModule', {
		value: true
	});

})));
