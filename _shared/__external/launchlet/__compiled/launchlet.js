var Launchlet = (function () {
	'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function commonjsRequire () {
		throw new Error('Dynamic requires are not currently supported by rollup-plugin-commonjs');
	}

	function unwrapExports (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var main = createCommonjsModule(function (module, exports) {
	const _require = commonjsRequire;

	const mod = {

		OLSKSpecUIArguments (inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('OLSKErrorInputNotValid');
			}

			return inputData.map(function (e) {
				if (e.match(/^match=/)) {
					return e.replace(/^match=/, '-os-match=');
				}

				if (e.match(/^skip=/)) {
					return e.replace(/^skip=/, '-os-skip=');
				}

				return e;
			});
		},

		OLSKSpecUITestPaths (inputData) {
			if (typeof inputData !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			if (!_require().OLSKDiskIsRealFolderPath(inputData)) {
				throw new Error('OLSKErrorInputNotValid');
			}

			return _require().sync('**/ui-test-*.js', {
				cwd: inputData,
				realpath: true,
			}).filter(function (e) {
				return !e.match(_require().OLSKDiskStandardIgnorePattern());
			});
		},

		OLSKSpecUISourcePaths (inputData) {
			if (typeof inputData !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			if (!_require().OLSKDiskIsRealFolderPath(inputData)) {
				throw new Error('OLSKErrorInputNotValid');
			}

			return _require().sync('**/+(ui-behaviour.js|*.ejs|*.md|*.html)', {
				cwd: inputData,
				realpath: true,
			}).filter(function (e) {
				if (e.match('__compiled')) {
					return true;
				}
				
				return !e.match(_require().OLSKDiskStandardIgnorePattern());
			});
		},

		OLSKSpecMochaPaths (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('OLSKErrorInputNotValid');
			}

			if (typeof inputData.ParamPackageDirectory !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			if (typeof inputData.ParamWorkingDirectory !== 'string') {
				throw new Error('OLSKErrorInputNotValid');
			}

			return [
				_require().join(inputData.ParamPackageDirectory, './node_modules/.bin/mocha'),
				_require().join(inputData.ParamPackageDirectory, '../.bin/mocha'),
				_require().join(inputData.ParamWorkingDirectory, './node_modules/.bin/mocha'),
				];
		},

		_OLSKSpecMochaReplaceES6Import (inputData) {
			const exportable = [];
			
			inputData = inputData
				.replace(/^import \* as (\w+) from ['"]([^'"]+)['"];?/gm, 'var $1 = require("$2");')
				// .replace(/^import (\w+) from ['"]([^'"]+)['"];?/gm, 'var {default: $1} = require("$2");')
				.replace(/^import (\w+) from ['"]([^'"]+)['"];?/gm, 'var _$1 = require("$2"); const $1 = _$1.default || _$1')
				.replace(/^import {([^}]+)} from ['"](.+)['"];?/gm, 'var {$1} = require("$2");')
				.replace(/^export default /gm, 'exports.default = ')
				.replace(/^export (const|let|var|class|function) (\w+)/gm, (match, type, name) => {
					exportable.push(name);
					return `${type} ${name}`;
				})
				.replace(/^export \{([^}]+)\}(?: from ['"]([^'"]+)['"];?)?/gm, (match, names, source) => {
					names.split(',').filter(Boolean).forEach(name => {
						exportable.push(name);
					});

					return source ? `const { ${names} } = require("${source}");` : '';
				})
				.replace(/^export function (\w+)/gm, 'exports.$1 = function $1');

			exportable.forEach(name => {
				inputData += `\nexports.${name} = ${name};`;
			});

			return inputData;
		},
		
	};

	Object.assign(exports, mod);

	{
		exports.OLSK_SPEC_UI = function () {
			if (typeof navigator === 'undefined') {
				return false;
			}

			if (typeof window !== 'undefined' && window.location.hostname === 'loc.tests') {
				return true;
			}

			return navigator.appName === 'Zombie';
		};
	}
	});
	var main_1 = main.OLSK_SPEC_UI;

	const mod = {

		LCHFormulaSafeStringFields: [
			'LCHFormulaID',
			'LCHFormulaName',
			'LCHFormulaSignature',
			'LCHFormulaInputTypes',
			'LCHFormulaOutputType',
			'LCHFormulaStyle',
			'LCHFormulaURLFilter',
			'LCHFormulaCreationDate',
			'LCHFormulaModificationDate',
			'LCHFormulaSyntaxErrorMessage',
			'@context',
		],

		LCHFormulaErrors (inputData, options = {}) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			const errors = {};

			if (inputData.LCHFormulaName !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaName !== 'string') {
					errors.LCHFormulaName = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaSignature !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaSignature !== 'string') {
					errors.LCHFormulaSignature = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaInputTypes !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaInputTypes !== 'string') {
					errors.LCHFormulaInputTypes = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaOutputType !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaOutputType !== 'string') {
					errors.LCHFormulaOutputType = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaIsHidden !== undefined) {
				if (typeof inputData.LCHFormulaIsHidden !== 'function') {
					errors.LCHFormulaIsHidden = [
						'LCHErrorNotFunction',
					];
				}
			}

			if (inputData.LCHFormulaURLFilter !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaURLFilter !== 'string') {
					errors.LCHFormulaURLFilter = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaIsAutomatic !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaIsAutomatic !== 'boolean') {
					errors.LCHFormulaIsAutomatic = [
						'LCHErrorNotBoolean',
					];
				}
			}

			if (inputData.LCHFormulaStyle !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaStyle !== 'string') {
					errors.LCHFormulaStyle = [
						'LCHErrorNotString',
					];
				}
			}

			if (inputData.LCHFormulaIsFlagged !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHFormulaIsFlagged !== 'boolean') {
					errors.LCHFormulaIsFlagged = [
						'LCHErrorNotBoolean',
					];
				}
			}

			return Object.entries(errors).length ? errors : null;
		},

		LCHFormulaFrom (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			return Object.entries(inputData).reduce(function (coll, item) {
				coll[item[0].replace(/LCH[A-Z][a-z]+/, 'LCHFormula')] = item[1];

				return coll;
			}, {});
		},

		LCHFormulaTo (param1, param2) {
			if (typeof param1 !== 'object' || param1 === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof param2 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			return Object.entries(param1).reduce(function (coll, item) {
				coll[item[0].replace('LCHFormula', param2)] = item[1];

				return coll;
			}, {});
		},

		LCHFormulaToEvaluate (inputData) {
			if (mod.LCHFormulaErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			let outputData = Object.fromEntries(Object.entries(inputData).filter(function (e) {
				return !mod.LCHFormulaSafeStringFields.includes(e[0]);
			}));

			if (outputData.LCHFormulaCallbackArgs || outputData.LCHFormulaCallbackBody) {
				outputData.LCHFormulaCallbackRaw = `(function (${ outputData.LCHFormulaCallbackArgs || '' }) { ${ outputData.LCHFormulaCallbackBody || '' } })`;
				delete outputData.LCHFormulaCallbackArgs;
				delete outputData.LCHFormulaCallbackBody;
			}

			if (outputData.LCHFormulaCanonicalExampleCallbackBody) {
				outputData.LCHFormulaCanonicalExampleCallbackRaw = `(function () { ${ outputData.LCHFormulaCanonicalExampleCallbackBody || '' } })`;
				delete outputData.LCHFormulaCanonicalExampleCallbackBody;
			}

			return outputData;
		},

	};

	const mod$1 = {

		LCHRuntimeURLFilter (param1, param2) {
			if (typeof param1 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof param2 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!param2) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (param1 === '*') {
				return true;
			}

			let match = param1.match(/^\/(.*)\/(\w*)/i);

			if (!match || !match.shift()) {
				return param2.includes(param1);
			}

			return !!param2.match(new RegExp(match[0], match[1]));
		},

		LCHRuntimeInputTypes(inputData) {
			if (typeof inputData !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			return inputData.split(',').map(function (e) {
				return e.trim();
			}).filter(function (e) {
				return !!e;
			});
		},

		LCHRuntimeAPI(inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			const outputData = {
				fn (signature) {
					if (typeof signature !== 'string') {
						throw new Error('LCHErrorIdentifierNotString');
					}

					if (signature === '') {
						throw new Error('LCHErrorIdentifierBlank');
					}

					if (signature.trim() !== signature) {
						throw new Error('LCHErrorIdentifierContainsUntrimmedWhitespace');
					}

					let functionObject = inputData.filter(function (e) {
						return e.LCHRecipeSignature === signature;
					}).shift();

					if (!functionObject) {
						throw new Error('LCHErrorIdentifierNotDefined');
					}

					return functionObject.LCHRecipeCallback.bind({
						api: outputData,
					});
				},
			};

			Object.assign(outputData, inputData.reduce(function (coll, item) {
				if (!coll[item.LCHRecipeSignature]) {
					coll[item.LCHRecipeSignature] = function () {
						const args = arguments;

						(item.LCHRecipeInputTypes ? mod$1.LCHRuntimeInputTypes(item.LCHRecipeInputTypes) : []).forEach(function (e, i) {
							if (!coll[e](args[i])) {
								throw new Error('LCHErrorTypeMismatch');
							}
						});

						return item.LCHRecipeCallback.apply({
							api: outputData,
						}, args);
					};
				}

				return coll;
			}, {}));

			Object.freeze(outputData);

			return outputData;
		},

	};

	const LCHTypeServiceSearchCallback = function(inputData) {
		if (!inputData.LCHRecipeName) {
			return false;
		}
		
		if (inputData.LCHRecipeCallback.length) {
			return false;
		}
		
		if (inputData.LCHRecipeOutputType !== 'ServiceSearchURLTemplate') {
			return false;
		}

		return true;
	};

	const LCHTypeServiceSearchCanonicalExampleCallback = function() {
		return {
			LCHRecipeName: 'alfa',
			LCHRecipeCallback () {
				return 'https://example.com?q=LCHSEARCHTOKEN';
			},
			LCHRecipeOutputType: 'ServiceSearchURLTemplate',
		};
	};

	const LCHTypeServiceSearchRecipe = function() {
		return {
			LCHRecipeSignature: 'ServiceSearch',
			LCHRecipeCallback: LCHTypeServiceSearchCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHTypeServiceSearchCanonicalExampleCallback,
		};
	};

	var ServiceSearch = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHTypeServiceSearchCallback: LCHTypeServiceSearchCallback,
		LCHTypeServiceSearchCanonicalExampleCallback: LCHTypeServiceSearchCanonicalExampleCallback,
		LCHTypeServiceSearchRecipe: LCHTypeServiceSearchRecipe
	});

	const LCHPrimitiveBoolCallback = function(inputData) {
		return !!inputData;
	};

	const LCHPrimitiveBoolRecipe = function() {
		return {
			LCHRecipeSignature: 'Bool',
			LCHRecipeCallback: LCHPrimitiveBoolCallback,
		};
	};

	var Bool = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveBoolCallback: LCHPrimitiveBoolCallback,
		LCHPrimitiveBoolRecipe: LCHPrimitiveBoolRecipe
	});

	const LCHPrimitiveDateCallback = function(inputData) {
		if (!(inputData instanceof Date)) {
			return false;
		}

		if (Number.isNaN(inputData.getTime())) {
			return false;
		}

		return true;
	};

	const LCHPrimitiveDateCanonicalExampleCallback = function() {
		return new Date(0);
	};

	const LCHPrimitiveDateRecipe = function() {
		return {
			LCHRecipeSignature: 'Date',
			LCHRecipeCallback: LCHPrimitiveDateCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHPrimitiveDateCanonicalExampleCallback,
		};
	};

	var Date$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveDateCallback: LCHPrimitiveDateCallback,
		LCHPrimitiveDateCanonicalExampleCallback: LCHPrimitiveDateCanonicalExampleCallback,
		LCHPrimitiveDateRecipe: LCHPrimitiveDateRecipe
	});

	const LCHPrimitiveDOMElementCallback = function(inputData) {
		if (typeof inputData !== 'object' || inputData === null) {
			return false;
		}

		if (typeof inputData.focus !== 'function') {
			return false;
		}

		return true;
	};

	const LCHPrimitiveDOMElementCanonicalExampleCallback = function() {
		return {
			focus () {},
		};
	};

	const LCHPrimitiveDOMElementRecipe = function() {
		return {
			LCHRecipeCallback: LCHPrimitiveDOMElementCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHPrimitiveDOMElementCanonicalExampleCallback,
			LCHRecipeSignature: 'DOMElement',
			_LCHRecipeTypeIsExclusive: true,
		};
	};

	var DOMElement = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveDOMElementCallback: LCHPrimitiveDOMElementCallback,
		LCHPrimitiveDOMElementCanonicalExampleCallback: LCHPrimitiveDOMElementCanonicalExampleCallback,
		LCHPrimitiveDOMElementRecipe: LCHPrimitiveDOMElementRecipe
	});

	/**
	 * Check if we're required to add a port number.
	 *
	 * @see https://url.spec.whatwg.org/#default-port
	 * @param {Number|String} port Port number we need to check
	 * @param {String} protocol Protocol we need to check against.
	 * @returns {Boolean} Is it a default port for the given protocol
	 * @api private
	 */
	var requiresPort = function required(port, protocol) {
	  protocol = protocol.split(':')[0];
	  port = +port;

	  if (!port) return false;

	  switch (protocol) {
	    case 'http':
	    case 'ws':
	    return port !== 80;

	    case 'https':
	    case 'wss':
	    return port !== 443;

	    case 'ftp':
	    return port !== 21;

	    case 'gopher':
	    return port !== 70;

	    case 'file':
	    return false;
	  }

	  return port !== 0;
	};

	var has = Object.prototype.hasOwnProperty
	  , undef;

	/**
	 * Decode a URI encoded string.
	 *
	 * @param {String} input The URI encoded string.
	 * @returns {String|Null} The decoded string.
	 * @api private
	 */
	function decode(input) {
	  try {
	    return decodeURIComponent(input.replace(/\+/g, ' '));
	  } catch (e) {
	    return null;
	  }
	}

	/**
	 * Attempts to encode a given input.
	 *
	 * @param {String} input The string that needs to be encoded.
	 * @returns {String|Null} The encoded string.
	 * @api private
	 */
	function encode(input) {
	  try {
	    return encodeURIComponent(input);
	  } catch (e) {
	    return null;
	  }
	}

	/**
	 * Simple query string parser.
	 *
	 * @param {String} query The query string that needs to be parsed.
	 * @returns {Object}
	 * @api public
	 */
	function querystring(query) {
	  var parser = /([^=?#&]+)=?([^&]*)/g
	    , result = {}
	    , part;

	  while (part = parser.exec(query)) {
	    var key = decode(part[1])
	      , value = decode(part[2]);

	    //
	    // Prevent overriding of existing properties. This ensures that build-in
	    // methods like `toString` or __proto__ are not overriden by malicious
	    // querystrings.
	    //
	    // In the case if failed decoding, we want to omit the key/value pairs
	    // from the result.
	    //
	    if (key === null || value === null || key in result) continue;
	    result[key] = value;
	  }

	  return result;
	}

	/**
	 * Transform a query string to an object.
	 *
	 * @param {Object} obj Object that should be transformed.
	 * @param {String} prefix Optional prefix.
	 * @returns {String}
	 * @api public
	 */
	function querystringify(obj, prefix) {
	  prefix = prefix || '';

	  var pairs = []
	    , value
	    , key;

	  //
	  // Optionally prefix with a '?' if needed
	  //
	  if ('string' !== typeof prefix) prefix = '?';

	  for (key in obj) {
	    if (has.call(obj, key)) {
	      value = obj[key];

	      //
	      // Edge cases where we actually want to encode the value to an empty
	      // string instead of the stringified value.
	      //
	      if (!value && (value === null || value === undef || isNaN(value))) {
	        value = '';
	      }

	      key = encode(key);
	      value = encode(value);

	      //
	      // If we failed to encode the strings, we should bail out as we don't
	      // want to add invalid strings to the query.
	      //
	      if (key === null || value === null) continue;
	      pairs.push(key +'='+ value);
	    }
	  }

	  return pairs.length ? prefix + pairs.join('&') : '';
	}

	//
	// Expose the module.
	//
	var stringify = querystringify;
	var parse = querystring;

	var querystringify_1 = {
		stringify: stringify,
		parse: parse
	};

	var slashes = /^[A-Za-z][A-Za-z0-9+-.]*:\/\//
	  , protocolre = /^([a-z][a-z0-9.+-]*:)?(\/\/)?([\S\s]*)/i
	  , whitespace = '[\\x09\\x0A\\x0B\\x0C\\x0D\\x20\\xA0\\u1680\\u180E\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u202F\\u205F\\u3000\\u2028\\u2029\\uFEFF]'
	  , left = new RegExp('^'+ whitespace +'+');

	/**
	 * Trim a given string.
	 *
	 * @param {String} str String to trim.
	 * @public
	 */
	function trimLeft(str) {
	  return (str ? str : '').toString().replace(left, '');
	}

	/**
	 * These are the parse rules for the URL parser, it informs the parser
	 * about:
	 *
	 * 0. The char it Needs to parse, if it's a string it should be done using
	 *    indexOf, RegExp using exec and NaN means set as current value.
	 * 1. The property we should set when parsing this value.
	 * 2. Indication if it's backwards or forward parsing, when set as number it's
	 *    the value of extra chars that should be split off.
	 * 3. Inherit from location if non existing in the parser.
	 * 4. `toLowerCase` the resulting value.
	 */
	var rules = [
	  ['#', 'hash'],                        // Extract from the back.
	  ['?', 'query'],                       // Extract from the back.
	  function sanitize(address) {          // Sanitize what is left of the address
	    return address.replace('\\', '/');
	  },
	  ['/', 'pathname'],                    // Extract from the back.
	  ['@', 'auth', 1],                     // Extract from the front.
	  [NaN, 'host', undefined, 1, 1],       // Set left over value.
	  [/:(\d+)$/, 'port', undefined, 1],    // RegExp the back.
	  [NaN, 'hostname', undefined, 1, 1]    // Set left over.
	];

	/**
	 * These properties should not be copied or inherited from. This is only needed
	 * for all non blob URL's as a blob URL does not include a hash, only the
	 * origin.
	 *
	 * @type {Object}
	 * @private
	 */
	var ignore = { hash: 1, query: 1 };

	/**
	 * The location object differs when your code is loaded through a normal page,
	 * Worker or through a worker using a blob. And with the blobble begins the
	 * trouble as the location object will contain the URL of the blob, not the
	 * location of the page where our code is loaded in. The actual origin is
	 * encoded in the `pathname` so we can thankfully generate a good "default"
	 * location from it so we can generate proper relative URL's again.
	 *
	 * @param {Object|String} loc Optional default location object.
	 * @returns {Object} lolcation object.
	 * @public
	 */
	function lolcation(loc) {
	  var globalVar;

	  if (typeof window !== 'undefined') globalVar = window;
	  else if (typeof commonjsGlobal !== 'undefined') globalVar = commonjsGlobal;
	  else if (typeof self !== 'undefined') globalVar = self;
	  else globalVar = {};

	  var location = globalVar.location || {};
	  loc = loc || location;

	  var finaldestination = {}
	    , type = typeof loc
	    , key;

	  if ('blob:' === loc.protocol) {
	    finaldestination = new Url(unescape(loc.pathname), {});
	  } else if ('string' === type) {
	    finaldestination = new Url(loc, {});
	    for (key in ignore) delete finaldestination[key];
	  } else if ('object' === type) {
	    for (key in loc) {
	      if (key in ignore) continue;
	      finaldestination[key] = loc[key];
	    }

	    if (finaldestination.slashes === undefined) {
	      finaldestination.slashes = slashes.test(loc.href);
	    }
	  }

	  return finaldestination;
	}

	/**
	 * @typedef ProtocolExtract
	 * @type Object
	 * @property {String} protocol Protocol matched in the URL, in lowercase.
	 * @property {Boolean} slashes `true` if protocol is followed by "//", else `false`.
	 * @property {String} rest Rest of the URL that is not part of the protocol.
	 */

	/**
	 * Extract protocol information from a URL with/without double slash ("//").
	 *
	 * @param {String} address URL we want to extract from.
	 * @return {ProtocolExtract} Extracted information.
	 * @private
	 */
	function extractProtocol(address) {
	  address = trimLeft(address);
	  var match = protocolre.exec(address);

	  return {
	    protocol: match[1] ? match[1].toLowerCase() : '',
	    slashes: !!match[2],
	    rest: match[3]
	  };
	}

	/**
	 * Resolve a relative URL pathname against a base URL pathname.
	 *
	 * @param {String} relative Pathname of the relative URL.
	 * @param {String} base Pathname of the base URL.
	 * @return {String} Resolved pathname.
	 * @private
	 */
	function resolve(relative, base) {
	  if (relative === '') return base;

	  var path = (base || '/').split('/').slice(0, -1).concat(relative.split('/'))
	    , i = path.length
	    , last = path[i - 1]
	    , unshift = false
	    , up = 0;

	  while (i--) {
	    if (path[i] === '.') {
	      path.splice(i, 1);
	    } else if (path[i] === '..') {
	      path.splice(i, 1);
	      up++;
	    } else if (up) {
	      if (i === 0) unshift = true;
	      path.splice(i, 1);
	      up--;
	    }
	  }

	  if (unshift) path.unshift('');
	  if (last === '.' || last === '..') path.push('');

	  return path.join('/');
	}

	/**
	 * The actual URL instance. Instead of returning an object we've opted-in to
	 * create an actual constructor as it's much more memory efficient and
	 * faster and it pleases my OCD.
	 *
	 * It is worth noting that we should not use `URL` as class name to prevent
	 * clashes with the global URL instance that got introduced in browsers.
	 *
	 * @constructor
	 * @param {String} address URL we want to parse.
	 * @param {Object|String} [location] Location defaults for relative paths.
	 * @param {Boolean|Function} [parser] Parser for the query string.
	 * @private
	 */
	function Url(address, location, parser) {
	  address = trimLeft(address);

	  if (!(this instanceof Url)) {
	    return new Url(address, location, parser);
	  }

	  var relative, extracted, parse, instruction, index, key
	    , instructions = rules.slice()
	    , type = typeof location
	    , url = this
	    , i = 0;

	  //
	  // The following if statements allows this module two have compatibility with
	  // 2 different API:
	  //
	  // 1. Node.js's `url.parse` api which accepts a URL, boolean as arguments
	  //    where the boolean indicates that the query string should also be parsed.
	  //
	  // 2. The `URL` interface of the browser which accepts a URL, object as
	  //    arguments. The supplied object will be used as default values / fall-back
	  //    for relative paths.
	  //
	  if ('object' !== type && 'string' !== type) {
	    parser = location;
	    location = null;
	  }

	  if (parser && 'function' !== typeof parser) parser = querystringify_1.parse;

	  location = lolcation(location);

	  //
	  // Extract protocol information before running the instructions.
	  //
	  extracted = extractProtocol(address || '');
	  relative = !extracted.protocol && !extracted.slashes;
	  url.slashes = extracted.slashes || relative && location.slashes;
	  url.protocol = extracted.protocol || location.protocol || '';
	  address = extracted.rest;

	  //
	  // When the authority component is absent the URL starts with a path
	  // component.
	  //
	  if (!extracted.slashes) instructions[3] = [/(.*)/, 'pathname'];

	  for (; i < instructions.length; i++) {
	    instruction = instructions[i];

	    if (typeof instruction === 'function') {
	      address = instruction(address);
	      continue;
	    }

	    parse = instruction[0];
	    key = instruction[1];

	    if (parse !== parse) {
	      url[key] = address;
	    } else if ('string' === typeof parse) {
	      if (~(index = address.indexOf(parse))) {
	        if ('number' === typeof instruction[2]) {
	          url[key] = address.slice(0, index);
	          address = address.slice(index + instruction[2]);
	        } else {
	          url[key] = address.slice(index);
	          address = address.slice(0, index);
	        }
	      }
	    } else if ((index = parse.exec(address))) {
	      url[key] = index[1];
	      address = address.slice(0, index.index);
	    }

	    url[key] = url[key] || (
	      relative && instruction[3] ? location[key] || '' : ''
	    );

	    //
	    // Hostname, host and protocol should be lowercased so they can be used to
	    // create a proper `origin`.
	    //
	    if (instruction[4]) url[key] = url[key].toLowerCase();
	  }

	  //
	  // Also parse the supplied query string in to an object. If we're supplied
	  // with a custom parser as function use that instead of the default build-in
	  // parser.
	  //
	  if (parser) url.query = parser(url.query);

	  //
	  // If the URL is relative, resolve the pathname against the base URL.
	  //
	  if (
	      relative
	    && location.slashes
	    && url.pathname.charAt(0) !== '/'
	    && (url.pathname !== '' || location.pathname !== '')
	  ) {
	    url.pathname = resolve(url.pathname, location.pathname);
	  }

	  //
	  // We should not add port numbers if they are already the default port number
	  // for a given protocol. As the host also contains the port number we're going
	  // override it with the hostname which contains no port number.
	  //
	  if (!requiresPort(url.port, url.protocol)) {
	    url.host = url.hostname;
	    url.port = '';
	  }

	  //
	  // Parse down the `auth` for the username and password.
	  //
	  url.username = url.password = '';
	  if (url.auth) {
	    instruction = url.auth.split(':');
	    url.username = instruction[0] || '';
	    url.password = instruction[1] || '';
	  }

	  url.origin = url.protocol && url.host && url.protocol !== 'file:'
	    ? url.protocol +'//'+ url.host
	    : 'null';

	  //
	  // The href is just the compiled result.
	  //
	  url.href = url.toString();
	}

	/**
	 * This is convenience method for changing properties in the URL instance to
	 * insure that they all propagate correctly.
	 *
	 * @param {String} part          Property we need to adjust.
	 * @param {Mixed} value          The newly assigned value.
	 * @param {Boolean|Function} fn  When setting the query, it will be the function
	 *                               used to parse the query.
	 *                               When setting the protocol, double slash will be
	 *                               removed from the final url if it is true.
	 * @returns {URL} URL instance for chaining.
	 * @public
	 */
	function set(part, value, fn) {
	  var url = this;

	  switch (part) {
	    case 'query':
	      if ('string' === typeof value && value.length) {
	        value = (fn || querystringify_1.parse)(value);
	      }

	      url[part] = value;
	      break;

	    case 'port':
	      url[part] = value;

	      if (!requiresPort(value, url.protocol)) {
	        url.host = url.hostname;
	        url[part] = '';
	      } else if (value) {
	        url.host = url.hostname +':'+ value;
	      }

	      break;

	    case 'hostname':
	      url[part] = value;

	      if (url.port) value += ':'+ url.port;
	      url.host = value;
	      break;

	    case 'host':
	      url[part] = value;

	      if (/:\d+$/.test(value)) {
	        value = value.split(':');
	        url.port = value.pop();
	        url.hostname = value.join(':');
	      } else {
	        url.hostname = value;
	        url.port = '';
	      }

	      break;

	    case 'protocol':
	      url.protocol = value.toLowerCase();
	      url.slashes = !fn;
	      break;

	    case 'pathname':
	    case 'hash':
	      if (value) {
	        var char = part === 'pathname' ? '/' : '#';
	        url[part] = value.charAt(0) !== char ? char + value : value;
	      } else {
	        url[part] = value;
	      }
	      break;

	    default:
	      url[part] = value;
	  }

	  for (var i = 0; i < rules.length; i++) {
	    var ins = rules[i];

	    if (ins[4]) url[ins[1]] = url[ins[1]].toLowerCase();
	  }

	  url.origin = url.protocol && url.host && url.protocol !== 'file:'
	    ? url.protocol +'//'+ url.host
	    : 'null';

	  url.href = url.toString();

	  return url;
	}

	/**
	 * Transform the properties back in to a valid and full URL string.
	 *
	 * @param {Function} stringify Optional query stringify function.
	 * @returns {String} Compiled version of the URL.
	 * @public
	 */
	function toString(stringify) {
	  if (!stringify || 'function' !== typeof stringify) stringify = querystringify_1.stringify;

	  var query
	    , url = this
	    , protocol = url.protocol;

	  if (protocol && protocol.charAt(protocol.length - 1) !== ':') protocol += ':';

	  var result = protocol + (url.slashes ? '//' : '');

	  if (url.username) {
	    result += url.username;
	    if (url.password) result += ':'+ url.password;
	    result += '@';
	  }

	  result += url.host + url.pathname;

	  query = 'object' === typeof url.query ? stringify(url.query) : url.query;
	  if (query) result += '?' !== query.charAt(0) ? '?'+ query : query;

	  if (url.hash) result += url.hash;

	  return result;
	}

	Url.prototype = { set: set, toString: toString };

	//
	// Expose the URL parser and some additional properties that might be useful for
	// others or testing.
	//
	Url.extractProtocol = extractProtocol;
	Url.location = lolcation;
	Url.trimLeft = trimLeft;
	Url.qs = querystringify_1;

	var urlParse = Url;

	var _URLParser = /*#__PURE__*/Object.freeze({
		__proto__: null,
		'default': urlParse,
		__moduleExports: urlParse
	});

	const URLParser = typeof _URLParser === 'function' ? _URLParser : urlParse;

	const LCHPrimitiveURLCallback = function(inputData) {
		if (typeof inputData !== 'string') {
			// throw new Error('LCHErrorInputNotValid');
			return false;
		}

		if (!(new URLParser(inputData, {})).hostname) { // To parse an input independently of the browser's current URL (e.g. for functionality parity with the library in a Node environment), pass an empty location object as the second parameter
			return false;
		}

		return true;
	};

	const LCHPrimitiveStringCanonicalExampleCallback = function() {
		return 'https://example.com';
	};

	const LCHPrimitiveURLRecipe = function() {
		return {
			LCHRecipeSignature: 'URL',
			LCHRecipeCallback: LCHPrimitiveURLCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHPrimitiveStringCanonicalExampleCallback,
		};
	};

	var URL = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveURLCallback: LCHPrimitiveURLCallback,
		LCHPrimitiveStringCanonicalExampleCallback: LCHPrimitiveStringCanonicalExampleCallback,
		LCHPrimitiveURLRecipe: LCHPrimitiveURLRecipe
	});

	const LCHPrimitiveServiceSearchURLTemplateCallback = function(inputData) {
		if (!LCHPrimitiveURLCallback(inputData)) {
			return false;
		}

		if (!inputData.match(/LCHSEARCHTOKEN/i)) {
			return false;
		}

		return true;
	};

	const LCHPrimitiveServiceSearchURLTemplateCanonicalExampleCallback = function() {
		return 'https://example.com?q=LCHSEARCHTOKEN';
	};

	const LCHPrimitiveServiceSearchURLTemplateRecipe = function() {
		return {
			LCHRecipeCallback: LCHPrimitiveServiceSearchURLTemplateCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHPrimitiveServiceSearchURLTemplateCanonicalExampleCallback,
			LCHRecipeSignature: 'ServiceSearchURLTemplate',
			_LCHRecipeTypeIsExclusive: true,
		};
	};

	var ServiceSearchURLTemplate = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveServiceSearchURLTemplateCallback: LCHPrimitiveServiceSearchURLTemplateCallback,
		LCHPrimitiveServiceSearchURLTemplateCanonicalExampleCallback: LCHPrimitiveServiceSearchURLTemplateCanonicalExampleCallback,
		LCHPrimitiveServiceSearchURLTemplateRecipe: LCHPrimitiveServiceSearchURLTemplateRecipe
	});

	const LCHPrimitiveStringCallback = function(inputData) {
		return typeof inputData === 'string';
	};

	const LCHPrimitiveStringCanonicalExampleCallback$1 = function() {
		return '';
	};

	const LCHPrimitiveStringRecipe = function() {
		return {
			LCHRecipeSignature: 'String',
			LCHRecipeCallback: LCHPrimitiveStringCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHPrimitiveStringCanonicalExampleCallback$1,
		};
	};

	var String$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHPrimitiveStringCallback: LCHPrimitiveStringCallback,
		LCHPrimitiveStringCanonicalExampleCallback: LCHPrimitiveStringCanonicalExampleCallback$1,
		LCHPrimitiveStringRecipe: LCHPrimitiveStringRecipe
	});

	const LCHTypeCommandCallback = function(inputData) {
		// if (LCHRecipesErrors(inputData)) {
		// 	throw new Error('LCHErrorInputNotValid');
		// }

		if (!inputData.LCHRecipeName) {
			return false;
		}
		
		if (inputData.LCHRecipeCallback.length) {
			return false;
		}

		return true;
	};

	const LCHTypeStringCanonicalExampleCallback = function() {
		return {
			LCHRecipeName: 'alfa',
			LCHRecipeCallback () {},
		};
	};

	const LCHTypeCommandRecipe = function() {
		return {
			LCHRecipeSignature: 'Command',
			LCHRecipeCallback: LCHTypeCommandCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHTypeStringCanonicalExampleCallback,
		};
	};

	var Command = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHTypeCommandCallback: LCHTypeCommandCallback,
		LCHTypeStringCanonicalExampleCallback: LCHTypeStringCanonicalExampleCallback,
		LCHTypeCommandRecipe: LCHTypeCommandRecipe
	});

	const LCHTypeSubjectContainerCallback = function(inputData) {
		if (!inputData.LCHRecipeName) {
			return false;
		}
		
		if (inputData.LCHRecipeOutputType !== 'SubjectContainer') {
			return false;
		}

		return true;
	};

	const LCHTypeSubjectContainerCanonicalExampleCallback = function() {
		return {
			LCHRecipeName: 'alfa',
			LCHRecipeCallback () {},
			LCHRecipeOutputType: 'SubjectContainer',
		};
	};

	const LCHTypeSubjectContainerRecipe = function() {
		return {
			LCHRecipeSignature: 'SubjectContainer',
			LCHRecipeCallback: LCHTypeSubjectContainerCallback,
			LCHRecipeOutputType: 'Bool',
			LCHRecipeCanonicalExampleCallback: LCHTypeSubjectContainerCanonicalExampleCallback,
			_LCHRecipeTypeIsExclusive: true,
		};
	};

	var SubjectContainer = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHTypeSubjectContainerCallback: LCHTypeSubjectContainerCallback,
		LCHTypeSubjectContainerCanonicalExampleCallback: LCHTypeSubjectContainerCanonicalExampleCallback,
		LCHTypeSubjectContainerRecipe: LCHTypeSubjectContainerRecipe
	});

	const LCHDateLocalOffsetSubtractedCallback = function(inputData) {
		return new Date(Date.parse(inputData) - inputData.getTimezoneOffset() * 1000 * 60);
	};

	const LCHDateLocalOffsetSubtractedRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHDateLocalOffsetSubtracted',
			LCHRecipeInputTypes: 'Date',
			LCHRecipeCallback: LCHDateLocalOffsetSubtractedCallback,
		};
	};

	var LCHDateLocalOffsetSubtracted = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHDateLocalOffsetSubtractedCallback: LCHDateLocalOffsetSubtractedCallback,
		LCHDateLocalOffsetSubtractedRecipe: LCHDateLocalOffsetSubtractedRecipe
	});

	const LCHReadTextFileCallback = async function(inputData = {}) {
		return new Promise(function (res, rej) {
			return Object.assign(document.createElement('input'), inputData, {
				type: 'file',
				onchange (event) {
					return Object.assign(new FileReader(), {
						onload (event) {
							return res(event.target.result);
						},
					}).readAsText(event.target.files[0]);
				},
			}).click();
		});
	};

	const LCHReadTextFileRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHReadTextFile',
			LCHRecipeCallback: LCHReadTextFileCallback,
		};
	};

	var LCHReadTextFile = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHReadTextFileCallback: LCHReadTextFileCallback,
		LCHReadTextFileRecipe: LCHReadTextFileRecipe
	});

	const LCHReadTextFileObjectsCallback = async function(inputData = {}) {
		return new Promise(function (res, rej) {
			return Object.assign(document.createElement('input'), inputData, {
				type: 'file',
				onchange (event) {
					return res(Promise.all([...event.target.files].map(function (e) {
						return new Promise(function (res, rej) {
							return Object.assign(new FileReader(), {
								onload (event) {
									return res(Object.assign(e, {
										_LCHReadTextFileObjectContent: event.target.result,
									}));
								},
							}).readAsText(e);
						});
					})));
				},
			}).click();
		});
	};

	const LCHReadTextFileObjectsRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHReadTextFileObjects',
			LCHRecipeCallback: LCHReadTextFileObjectsCallback,
		};
	};

	var LCHReadTextFileObjects = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHReadTextFileObjectsCallback: LCHReadTextFileObjectsCallback,
		LCHReadTextFileObjectsRecipe: LCHReadTextFileObjectsRecipe
	});

	var FileSaver_min = createCommonjsModule(function (module, exports) {
	(function(a,b){b();})(commonjsGlobal,function(){function b(a,b){return "undefined"==typeof b?b={autoBom:!1}:"object"!=typeof b&&(console.warn("Deprecated: Expected third argument to be a object"),b={autoBom:!b}),b.autoBom&&/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(a.type)?new Blob(["\uFEFF",a],{type:a.type}):a}function c(b,c,d){var e=new XMLHttpRequest;e.open("GET",b),e.responseType="blob",e.onload=function(){a(e.response,c,d);},e.onerror=function(){console.error("could not download file");},e.send();}function d(a){var b=new XMLHttpRequest;b.open("HEAD",a,!1);try{b.send();}catch(a){}return 200<=b.status&&299>=b.status}function e(a){try{a.dispatchEvent(new MouseEvent("click"));}catch(c){var b=document.createEvent("MouseEvents");b.initMouseEvent("click",!0,!0,window,0,0,0,80,20,!1,!1,!1,!1,0,null),a.dispatchEvent(b);}}var f="object"==typeof window&&window.window===window?window:"object"==typeof self&&self.self===self?self:"object"==typeof commonjsGlobal&&commonjsGlobal.global===commonjsGlobal?commonjsGlobal:void 0,a=f.saveAs||("object"!=typeof window||window!==f?function(){}:"download"in HTMLAnchorElement.prototype?function(b,g,h){var i=f.URL||f.webkitURL,j=document.createElement("a");g=g||b.name||"download",j.download=g,j.rel="noopener","string"==typeof b?(j.href=b,j.origin===location.origin?e(j):d(j.href)?c(b,g,h):e(j,j.target="_blank")):(j.href=i.createObjectURL(b),setTimeout(function(){i.revokeObjectURL(j.href);},4E4),setTimeout(function(){e(j);},0));}:"msSaveOrOpenBlob"in navigator?function(f,g,h){if(g=g||f.name||"download","string"!=typeof f)navigator.msSaveOrOpenBlob(b(f,h),g);else if(d(f))c(f,g,h);else {var i=document.createElement("a");i.href=f,i.target="_blank",setTimeout(function(){e(i);});}}:function(a,b,d,e){if(e=e||open("","_blank"),e&&(e.document.title=e.document.body.innerText="downloading..."),"string"==typeof a)return c(a,b,d);var g="application/octet-stream"===a.type,h=/constructor/i.test(f.HTMLElement)||f.safari,i=/CriOS\/[\d]+/.test(navigator.userAgent);if((i||g&&h)&&"object"==typeof FileReader){var j=new FileReader;j.onloadend=function(){var a=j.result;a=i?a:a.replace(/^data:[^;]*;/,"data:attachment/file;"),e?e.location.href=a:location=a,e=null;},j.readAsDataURL(a);}else {var k=f.URL||f.webkitURL,l=k.createObjectURL(a);e?e.location=l:location.href=l,e=null,setTimeout(function(){k.revokeObjectURL(l);},4E4);}});f.saveAs=a.saveAs=a,(module.exports=a);});


	});

	const LCHSaveFileCallback = function(param1, param2) {
		if (typeof param1 !== 'string') {
			throw new Error('LCHErrorInputNotValid');
		}

		if (typeof param2 !== 'string') {
			throw new Error('LCHErrorInputNotValid');
		}

		if (!param2.trim()) {
			throw new Error('LCHErrorInputNotValid');
		}

		return FileSaver_min.saveAs(new Blob([param1], {type: 'text/plain;charset=utf-8'}), param2);
	};

	const LCHSaveFileRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHSaveFile',
			LCHRecipeCallback: LCHSaveFileCallback,
		};
	};

	var LCHSaveFile = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHSaveFileCallback: LCHSaveFileCallback,
		LCHSaveFileRecipe: LCHSaveFileRecipe
	});

	// https://stackoverflow.com/questions/1599660/which-html-elements-can-receive-focus
	const LCHFocusElementsSelector= [
		'a[href]:not([tabindex="-1"])',
	  // 'area[href]:not([tabindex="-1"])',
	  'input:not([disabled]):not([tabindex="-1"]):not([type="hidden"])',
	  // 'select:not([disabled]):not([tabindex="-1"])',
	  // 'textarea:not([disabled]):not([tabindex="-1"])',
	  'button:not([disabled]):not([tabindex="-1"])',
	  // 'iframe:not([tabindex="-1"])',
	  // '[tabindex]:not([tabindex="-1"])',
	  // '[contentEditable=true]:not([tabindex="-1"])',
	].join(',');

	const LCHActiveDocumentsFocusElements = function(inputData) {
		if (typeof inputData !== 'object' || inputData === null || typeof inputData.querySelectorAll !== 'function') {
			throw new Error('LCHErrorInputNotValid');
		}

		const aggregate = {
			ids: {},
		};

		return [].concat.apply([], inputData.querySelectorAll(LCHFocusElementsSelector)).filter(function (e) {
			return {
				'A': function FocusElementAnchorFilter (e) {
					if (!e.href) {
						return false;
					}				
					if (!e.textContent.trim() && !e.title.trim()) {
						return false;
					}				
					return true;
				},
				'INPUT': function FocusElementInputFilter (e) {
					if (!aggregate.labels) {
						aggregate.labels = Array.from(inputData.querySelectorAll('label'));
					}
					aggregate.ids[e.id] = aggregate.labels.filter(function (label) {
						return label.getAttribute('for') === e.id;
					}).map(function (e) {
						return e.textContent.trim();
					}).shift();

					if (!e.name.trim() && !e.placeholder.trim() && !aggregate.ids[e.id]) {
						return false;
					}
					return true;
				},
				'BUTTON': function FocusElementButtonFilter (e) {
					if (!e.textContent.trim()) {
						return false;
					}
					return true;
				}
			}[e.tagName](e);
		}).map(function (e) {
			return {
				LCHRecipeName: {
					'A': function FocusElementAnchorNameg (e) {
						return e.textContent.trim() || e.title.trim()
					},
					'INPUT': function FocusElementInputNameg (e) {
						return aggregate.ids[e.id] || e.placeholder.trim() || e.name.trim();
					},
					'BUTTON': function FocusElementButtonName (e) {
						return e.textContent.trim();
					},
				}[e.tagName](e),
				LCHRecipeCallback () {
					return e;
				},
				LCHRecipeOutputType: 'DOMElement',
			};
		});
	};

	const LCHActiveDocumentFocusElementsCallback = function() {
		return LCHActiveDocumentsFocusElements(document);
	};

	const LCHActiveDocumentFocusElementsRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHActiveDocumentFocusElements',
			LCHRecipeOutputType: 'SubjectContainer',
			LCHRecipeCallback: LCHActiveDocumentFocusElementsCallback,
		};
	};

	var LCHActiveDocumentFocusElements = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHActiveDocumentsFocusElements: LCHActiveDocumentsFocusElements,
		LCHActiveDocumentFocusElementsCallback: LCHActiveDocumentFocusElementsCallback,
		LCHActiveDocumentFocusElementsRecipe: LCHActiveDocumentFocusElementsRecipe
	});

	const LCHCopyToClipboardCallback = function(inputData) {
		if (typeof inputData !== 'string') {
			throw new Error('LCHErrorInputNotValid');
		}

		if (!inputData.trim().length) {
			throw new Error('LCHErrorInputNotValid');
		}

		// if (typeof navigator !== 'undefined' && navigator.clipboard) {
		// 	return Promise.resolve((async function () {
		// 		return await navigator.clipboard.writeText(inputData);
		// 	})());
		// }

		// if (typeof document !== 'undefined') {
		// 	(function () {
		// 		const el = document.createElement('textarea');
				
		// 		el.value = inputData;
				
		// 		el.setAttribute('readonly', '');
		// 		el.style.position = 'fixed';
		// 		el.style.top = 0;
				
		// 		document.body.appendChild(el);
		// 		el.select();
		// 		document.execCommand('copy');
				
		// 		el.remove();
		// 	})();
		// }

		return {
			LCHComponentDescriptorName: 'LCHCopyToClipboard',
			LCHComponentDescriptorProps: {
				inputData: inputData,
			},
			LCHComponentDescriptorCompletionHandlerSignature: 'LCHCopyToClipboardCompletionHandler',
			LCHComponentDescriptorOLSKLocalized: true,
		};
	};

	const LCHCopyToClipboardRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHCopyToClipboard',
			LCHRecipeInputTypes: 'String',
			LCHRecipeCallback: LCHCopyToClipboardCallback,
		};
	};

	var LCHCopyToClipboard = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHCopyToClipboardCallback: LCHCopyToClipboardCallback,
		LCHCopyToClipboardRecipe: LCHCopyToClipboardRecipe
	});

	const LCHDOMElementFocusCallback = function(inputData) {
		if (!inputData) {
			return;
		}

		inputData.focus();
	};

	const LCHDOMElementFocusRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHDOMElementFocus',
			LCHRecipeInputTypes: 'DOMElement',
			LCHRecipeCallback: LCHDOMElementFocusCallback,
		};
	};

	var LCHDOMElementFocus = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHDOMElementFocusCallback: LCHDOMElementFocusCallback,
		LCHDOMElementFocusRecipe: LCHDOMElementFocusRecipe
	});

	const LCHLargeTextCallback = function(inputData) {
		if (typeof document === 'undefined') {
			return;
		}

		const rootElement = document.createElement('div');
		rootElement.className = 'LCHLargeTextContainer';

		for (let [key, value] of Object.entries({
			width: '100%',

			position: 'fixed',
			top: '45%',
			left: '0',

			textAlign: 'center',

			cursor: 'default',
		})) {
			rootElement.style[key] = value;
		}

		const span = document.createElement('span');
		span.textContent = inputData;
		rootElement.appendChild(span);

		for (let [key, value] of Object.entries({
			display: 'block-inline',
			borderRadius: '20px',
			boxShadow: '0 0 10px 0px hsla(0, 0%, 0%, 0.1)',
			padding: '20px',

			background: 'hsla(0, 0%, 0%, 0.8)',
			color: 'white',
			fontFamily: 'Arial',
			fontSize: '72pt',
			fontWeight: 'bold',
			textAlign: 'center',
			textShadow: '5px 5px 10px hsla(0, 0%, 0%, 0.5)',
			overflowWrap: 'break-word',
		})) {
			span.style[key] = value;
		}
		
		document.body.appendChild(rootElement);

		let handler = function (event) {
			event.preventDefault();

			if (!event.key && rootElement.contains(event.target)) {
		  	return;
			}
			
			window.removeEventListener('click', handler);
			window.removeEventListener('keydown', handler);
			
			rootElement.remove();
		};

		setTimeout(function () {
			window.addEventListener('click', handler);
			window.addEventListener('keydown', handler);
		});
	};

	const LCHLargeTextRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHLargeText',
			LCHRecipeInputTypes: 'String',
			LCHRecipeCallback: LCHLargeTextCallback,
		};
	};

	var LCHLargeText = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHLargeTextCallback: LCHLargeTextCallback,
		LCHLargeTextRecipe: LCHLargeTextRecipe
	});

	const LCHRunCommandCallback = function(inputData) {
		return inputData;
	};

	const LCHRunCommandRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHRunCommand',
			LCHRecipeInputTypes: 'Command',
			LCHRecipeCallback: LCHRunCommandCallback,
		};
	};

	var LCHRunCommand = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHRunCommandCallback: LCHRunCommandCallback,
		LCHRunCommandRecipe: LCHRunCommandRecipe
	});

	const LCHFlip = function(param1, param2) {
		if (typeof param1 !== 'function') {
			throw new Error('LCHErrorInputNotValid');
		}

		return function() {
			return param1.apply(param2, [...arguments].reverse());
		};
	};

	const LCHSearchActionURLFrom = function(param1, param2) {
		if (typeof param1 !== 'string') {
			throw new Error('LCHErrorInputNotValid');
		}

		if (typeof param2 !== 'string') {
			throw new Error('LCHErrorInputNotValid');
		}

		if (!param1.match(/LCHSEARCHTOKEN/i)) {
			return param1;
		}

		return param1.replace(/LCHSEARCHTOKEN/i, param2.split(' ').map(function (e) {
			return encodeURIComponent(e);
		}).join('+'));
	};

	const LCHSearchWithCallback = function(param1, param2) {
		return this.api.fn('LCHURLOpen')(LCHSearchActionURLFrom(param2, param1));
	};

	const LCHSearchWithRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHSearchWith',
			LCHRecipeInputTypes: 'String,ServiceSearchURLTemplate',
			LCHRecipeCallback: LCHSearchWithCallback,
		};
	};
	const LCHSearchForCallback = function() {
		return LCHFlip(LCHSearchWithCallback, this)(...arguments);
	};

	const LCHSearchForRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHSearchFor',
			LCHRecipeInputTypes: 'ServiceSearchURLTemplate,String',
			LCHRecipeCallback: LCHSearchForCallback,
		};
	};

	var LCHSearchAction = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHSearchActionURLFrom: LCHSearchActionURLFrom,
		LCHSearchWithCallback: LCHSearchWithCallback,
		LCHSearchWithRecipe: LCHSearchWithRecipe,
		LCHSearchForCallback: LCHSearchForCallback,
		LCHSearchForRecipe: LCHSearchForRecipe
	});

	const LCHServiceSearchWikipediaCallback = function() {
		return 'https://wikipedia.org/w/index.php?search=LCHSEARCHTOKEN';
	};

	const LCHServiceSearchWikipediaRecipe = function() {
		return {
			LCHRecipeName: 'Wikipedia',
			LCHRecipeOutputType: 'ServiceSearchURLTemplate',
			LCHRecipeCallback: LCHServiceSearchWikipediaCallback,
			LCHRecipeSignature: 'LCHServiceSearchWikipedia',
		};
	};

	var LCHServiceSearchWikipedia = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHServiceSearchWikipediaCallback: LCHServiceSearchWikipediaCallback,
		LCHServiceSearchWikipediaRecipe: LCHServiceSearchWikipediaRecipe
	});

	const LCHSubjectContainerShowContentsCallback = function(inputData) {
		return inputData;
	};

	const LCHSubjectContainerShowContentsRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHSubjectContainerShowContents',
			LCHRecipeInputTypes: 'SubjectContainer',
			LCHRecipeCallback: LCHSubjectContainerShowContentsCallback,
		};
	};

	var LCHSubjectContainerShowContents = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHSubjectContainerShowContentsCallback: LCHSubjectContainerShowContentsCallback,
		LCHSubjectContainerShowContentsRecipe: LCHSubjectContainerShowContentsRecipe
	});

	const LCHURLOpenCallback = function(inputData) {
		if (!inputData) {
			return;
		}

		window.open(inputData, '_blank').focus();
	};

	const LCHURLOpenRecipe = function() {
		return {
			LCHRecipeSignature: 'LCHURLOpen',
			LCHRecipeInputTypes: 'URL',
			LCHRecipeCallback: LCHURLOpenCallback,
		};
	};

	var LCHURLOpen = /*#__PURE__*/Object.freeze({
		__proto__: null,
		LCHURLOpenCallback: LCHURLOpenCallback,
		LCHURLOpenRecipe: LCHURLOpenRecipe
	});

	const LCHLauncherStandardRecipes = function() {
		return [].concat.apply([], [
			Bool,
			Date$1,
			DOMElement,
			ServiceSearchURLTemplate,
			String$1,
			URL,
			
			Command,
			ServiceSearch,
			SubjectContainer,
			
			LCHActiveDocumentFocusElements,

			LCHDateLocalOffsetSubtracted,
			LCHReadTextFile,
			LCHReadTextFileObjects,
			LCHSaveFile,

			LCHCopyToClipboard,
			LCHDOMElementFocus,
			LCHLargeText,
			LCHRunCommand,
			LCHSearchAction,
			LCHServiceSearchWikipedia,
			LCHSubjectContainerShowContents,
			LCHURLOpen,
		].map(function (e) {
			return Object.entries(e).filter(function (e) {
				return e.shift().includes('Recipe');
			}).map(function (e) {
				return e.pop()();
			}).map(function (e) {
				return e;
			});
		}));
	};

	Array.prototype._LCHIntersect = function() {
		return this.map(function (e) {
			return new Set(e);
		}).reduce(function (a, b) {
			return a.filter(i => b.has(i));
		}, [...new Set([].concat.apply([], this))]);
	};

	const mod$2 = {

		LCHRecipesErrors (inputData, options = {}) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			const errors = mod.LCHFormulaTo(mod.LCHFormulaErrors(mod.LCHFormulaFrom(inputData)) || {}, 'LCHRecipe');

			if (typeof inputData.LCHRecipeCallback !== 'function') {
				errors.LCHRecipeCallback = [
					'LCHErrorNotFunction',
				];
			}

			if (typeof inputData.LCHRecipeName === 'string') {
				if (!inputData.LCHRecipeName.trim()) {
					errors.LCHRecipeName = [
						'LCHErrorNotFilled',
					];
				}
			}

			if (typeof inputData.LCHRecipeInputTypes === 'string') {
				if (inputData.LCHRecipeInputTypes.trim() !== inputData.LCHRecipeInputTypes) {
					errors.LCHRecipeInputTypes = [
						'LCHErrorNotTrimmed',
					];
				}

				if (!inputData.LCHRecipeInputTypes.trim()) {
					errors.LCHRecipeInputTypes = [
						'LCHErrorNotFilled',
					];
				}
			}

			if (typeof inputData.LCHRecipeOutputType === 'string') {
				if (inputData.LCHRecipeOutputType.trim() !== inputData.LCHRecipeOutputType) {
					errors.LCHRecipeOutputType = [
						'LCHErrorNotTrimmed',
					];
				}

				if (!inputData.LCHRecipeOutputType.trim()) {
					errors.LCHRecipeOutputType = [
						'LCHErrorNotFilled',
					];
				}
			}

			if (inputData.LCHRecipeCanonicalExampleCallback !== undefined || options.LCHOptionValidateIfNotPresent) {
				if (typeof inputData.LCHRecipeCanonicalExampleCallback !== 'function') {
					errors.LCHRecipeCanonicalExampleCallback = [
						'LCHErrorNotFunction',
					];
				}
			}

			if (typeof inputData.LCHRecipeSignature === 'string') {
				if (!inputData.LCHRecipeSignature.trim()) {
					errors.LCHRecipeSignature = [
						'LCHErrorNotFilled',
					];
				} else if (inputData.LCHRecipeSignature.trim() !== inputData.LCHRecipeSignature) {
					errors.LCHRecipeSignature = [
						'LCHErrorNotTrimmed',
					];
				}
			}

			return Object.entries(errors).length ? errors : null;
		},

		LCHRecipesIsCommand (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!inputData.LCHRecipeName) {
				return false;
			}
			
			if (inputData.LCHRecipeInputTypes) {
				return false;
			}

			if (inputData.LCHRecipeOutputType) {
				return false;
			}

			return true;
		},

		LCHRecipesIsSubject (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!inputData.LCHRecipeName) {
				return false;
			}
			
			// if (inputData.LCHRecipeInputTypes) {
			// 	return false;
			// }

			if (!inputData.LCHRecipeOutputType) {
				return false;
			}

			return true;
		},

		LCHRecipesIsAction (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!inputData.LCHRecipeName) {
				return false;
			}

			if (!inputData.LCHRecipeInputTypes) {
				return false;
			}
			
			// if (!inputData.LCHRecipeCallback.length) {
			// 	return false;
			// }

			return true;
		},

		LCHRecipesIsType (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}
			
			// if (inputData.LCHRecipeCallback.length !== 1) {
			// 	return false;
			// }

			if (inputData.LCHRecipeOutputType !== 'Bool') {
				return false;
			}

			if (!inputData.LCHRecipeCanonicalExampleCallback) {
				return false;
			}

			if (!inputData.LCHRecipeSignature) {
				return false;
			}

			return true;
		},

		LCHRecipesIsTask (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}
			
			// if (inputData.LCHRecipeCallback.length) {
			// 	return false;
			// }

			if (!inputData.LCHRecipeURLFilter) {
				return false;
			}

			if (inputData.LCHRecipeIsAutomatic !== true) {
				return false;
			}

			return true;
		},

		LCHLauncherConvertTypeServiceSearch (inputData, _stringCallback) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return inputData.filter(function (e) {
				if (typeof e !== 'object' || e === null) {
					return false;
				}
				
				return true;
			}).map(function (e) {
				if (!LCHTypeServiceSearchRecipe().LCHRecipeCallback(e)) {
					return e;
				}

				return {
					LCHRecipeName: _stringCallback(e.LCHRecipeName),
					LCHRecipeInputTypes: 'String',
					LCHRecipeCallback (inputData) {
						return this.api.fn('LCHSearchWith')(inputData, e);
					},
					_LCHLauncherGenerated: true,
				};
			});
		},

		LCHRecipesActionTakesObject (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!mod$2.LCHRecipesIsAction(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}
			
			if (mod$1.LCHRuntimeInputTypes(inputData.LCHRecipeInputTypes).length < 2) {
				return false;
			}
			
			// if (inputData.LCHRecipeCallback.length < 2) {
			// 	return false;
			// }

			return true;
		},

		LCHRecipesActionTakesParams (inputData) {
			if (mod$2.LCHRecipesErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!mod$2.LCHRecipesIsAction(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}
			
			if (mod$1.LCHRuntimeInputTypes(inputData.LCHRecipeInputTypes).pop() !== 'Object') {
				return false;
			}
			
			// if (inputData.LCHRecipeCallback.length !== LCHRuntime.LCHRuntimeInputTypes(inputData.LCHRecipeInputTypes).length) {
			// 	return false;
			// }

			return true;
		},

		LCHAPITypeEquivalenceMapForRecipes (inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			const uniqueSignatures = [];
			const validRecipes = inputData.filter(function (e) {
				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}

				if (!mod$2.LCHRecipesIsType(e)) {
					return false;
				}

				if (!e.LCHRecipeCallback(e.LCHRecipeCanonicalExampleCallback())) {
					return false;
				}

				if (uniqueSignatures.includes(e.LCHRecipeSignature)) {
					return false;
				}

				uniqueSignatures.push(e.LCHRecipeSignature);

				return true;
			});

			return validRecipes.reduce(function (coll, item) {
				coll[item.LCHRecipeSignature] = validRecipes.filter(function (e) {
					if (item === e) {
						return true;
					}

					if (e._LCHRecipeTypeIsExclusive) {
						return false;
					}

					if (item._LCHRecipeTypeIsExclusive) {
						return false;
					}

					return e.LCHRecipeCallback(item.LCHRecipeCanonicalExampleCallback());
				}).map(function (e) {
					return e.LCHRecipeSignature;
				});

				return coll;
			}, {});
		},

		LCHAPITypeNameMap (inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			const validRecipes = inputData.filter(function (e) {
				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}

				return mod$2.LCHRecipesIsType(e);
			});

			return validRecipes.reduce(function (coll, item) {
				if (coll[item.LCHRecipeSignature]) {
					return coll;
				}

				coll[item.LCHRecipeSignature] = item.LCHRecipeName || item.LCHRecipeSignature;

				return coll;
			}, {});
		},

		LCHAPIActionsForType (param1, param2) {
			if (typeof param1 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!Array.isArray(param2)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return param2.filter(function (e) {
				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}

				if (!mod$2.LCHRecipesIsAction(e)) {
					return false;
				}

				if (mod$1.LCHRuntimeInputTypes(e.LCHRecipeInputTypes).shift() !== param1) {
					return false;
				}

				return true;
			});
		},

		LCHAPISubjectsForType (param1, param2) {
			if (typeof param1 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!Array.isArray(param2)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return param2.filter(function (e) {
				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}

				if (!mod$2.LCHRecipesIsSubject(e)) {
					return false;
				}

				if (e.LCHRecipeOutputType !== param1) {
					return false;
				}

				return true;
			});
		},

		LCHCompositionErrors (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!inputData.LCHCompositionAction) {
				return {
					LCHCompositionAction: [
						'LCHErrorInputNotPresent',
					],
				};
			}

			if (!mod$2.LCHRecipesIsAction(inputData.LCHCompositionAction)) {
				return {
					LCHCompositionAction: [
						'LCHErrorInputNotValid',
					],
				};
			}

			const errors = {};

			if (!inputData.LCHCompositionSubjectPrimary) {
				return {
					LCHCompositionSubjectPrimary: [
						'LCHErrorInputNotPresent',
					],
				};
			} else if (inputData.LCHCompositionAction.LCHRecipeInputTypes === 'Command' && mod$2.LCHRecipesIsCommand(inputData.LCHCompositionSubjectPrimary)) ;

			// if (!mod.LCHRecipesIsSubject(inputData.LCHCompositionSubjectPrimary)) {
			// 	errors.LCHCompositionSubjectPrimary = [
			// 		'LCHErrorInputNotValid',
			// 	];
			// }

			else if (inputData.LCHCompositionAction.LCHRecipeInputTypes && !mod$1.LCHRuntimeInputTypes(inputData.LCHCompositionAction.LCHRecipeInputTypes).includes(inputData.LCHCompositionSubjectPrimary.LCHRecipeOutputType)) {
				errors.LCHCompositionSubjectPrimary = [
					'LCHErrorInputNotValid',
				];
			}

			if (inputData.LCHCompositionAction.LCHRecipeInputTypes && mod$1.LCHRuntimeInputTypes(inputData.LCHCompositionAction.LCHRecipeInputTypes).length === 2 && !inputData.LCHCompositionSubjectSecondary) {
				errors.LCHCompositionSubjectSecondary = [
					'LCHErrorInputNotValid',
				];
			}

			if (inputData.LCHCompositionSubjectSecondary !== undefined) {
				if (!mod$2.LCHRecipesIsSubject(inputData.LCHCompositionSubjectSecondary)) {
					errors.LCHCompositionSubjectSecondary = [
						'LCHErrorInputNotValid',
					];
				}

				if (inputData.LCHCompositionAction.LCHRecipeInputTypes && !mod$1.LCHRuntimeInputTypes(inputData.LCHCompositionAction.LCHRecipeInputTypes).includes(inputData.LCHCompositionSubjectSecondary.LCHRecipeOutputType)) {
					errors.LCHCompositionSubjectSecondary = [
						'LCHErrorInputNotValid',
					];
				}
			}

			return Object.entries(errors).length ? errors : null;
		},

		async LCHAPIExecuteComposition (inputData, api = {}) {
			if (mod$2.LCHCompositionErrors(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof api.fn !== 'function') {
				throw new Error('LCHErrorInputNotValid');
			}

			return mod$2.LCHAPIExecuteRecipe(inputData.LCHCompositionAction, [
				await mod$2.LCHAPIExecuteRecipe(inputData.LCHCompositionSubjectPrimary, [], api),
			].concat(inputData.LCHCompositionSubjectSecondary ? [
				await mod$2.LCHAPIExecuteRecipe(inputData.LCHCompositionSubjectSecondary, [], api),
			] : []), api);
		},

		async LCHAPIExecuteRecipe (param1, param2 = [], param3 = {}) {
			if (mod$2.LCHRecipesErrors(param1)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!Array.isArray(param2)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof param3.fn !== 'function') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (param1.LCHRecipeStyle && typeof document !== 'undefined') {
				document.body.appendChild(document.createElement('style')).innerHTML = param1.LCHRecipeStyle;
			}

			return Promise.resolve(param1.LCHRecipeCallback.apply({
				api: param3,
			}, param2.length ? param2 : undefined)); // #mysterious Firefox throws `Permission denied to access property "length"` if array is empty
		},

		LCHComponentDescriptorsErrors (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			const errors = {};

			if (typeof inputData.LCHComponentDescriptorName !== 'string') {
				errors.LCHComponentDescriptorName = [
					'LCHErrorNotString',
				];
			}

			if (typeof inputData.LCHComponentDescriptorName === 'string' && !inputData.LCHComponentDescriptorName) {
				errors.LCHComponentDescriptorName = [
					'LCHErrorNotFilled',
				];
			}

			if (typeof inputData.LCHComponentDescriptorName === 'string' && inputData.LCHComponentDescriptorName.trim() !== inputData.LCHComponentDescriptorName) {
				errors.LCHComponentDescriptorName = [
					'LCHErrorNotTrimmed',
				];
			}

			if (typeof inputData.LCHComponentDescriptorCompletionHandlerSignature !== 'string') {
				errors.LCHComponentDescriptorCompletionHandlerSignature = [
					'LCHErrorNotString',
				];
			}

			if (typeof inputData.LCHComponentDescriptorCompletionHandlerSignature === 'string' && !inputData.LCHComponentDescriptorCompletionHandlerSignature) {
				errors.LCHComponentDescriptorCompletionHandlerSignature = [
					'LCHErrorNotFilled',
				];
			}

			if (typeof inputData.LCHComponentDescriptorCompletionHandlerSignature === 'string' && inputData.LCHComponentDescriptorCompletionHandlerSignature.trim() !== inputData.LCHComponentDescriptorCompletionHandlerSignature) {
				errors.LCHComponentDescriptorCompletionHandlerSignature = [
					'LCHErrorNotTrimmed',
				];
			}

			if (inputData.LCHComponentDescriptorProps !== undefined) {
				if (typeof inputData.LCHComponentDescriptorProps !== 'object' || inputData.LCHComponentDescriptorProps === null) {
					errors.LCHComponentDescriptorProps = [
						'LCHErrorNotObject',
					];
				}
			}

			return Object.entries(errors).length ? errors : null;
		},

		LCHRuntimeFilteredRecipes  (param1, param2) {
			if (!Array.isArray(param1)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof param2 !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			return param1.filter(function (e) {
				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}

				if (typeof e.LCHRecipeURLFilter === 'undefined') {
					return true;
				}

				return mod$1.LCHRuntimeURLFilter(e.LCHRecipeURLFilter, param2);
			});
		},

		LCHRuntimeFilteredTasks  (inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return inputData.filter(function (e) {
				if (!mod$2.LCHRecipesIsTask(e)) {
					return false;
				}

				if (e.LCHRecipeIsExcluded) {
					return !e.LCHRecipeIsExcluded();
				}

				return true;
			});
		},

		LCHAPIRunTasks  () {
			const inputData = mod$2.LCHRuntimeFilteredRecipes.apply(null, [...arguments]);
			const api = mod$1.LCHRuntimeAPI(LCHLauncherStandardRecipes().concat(inputData));

			return Promise.all(mod$2.LCHRuntimeFilteredTasks(inputData).map(function (e) {
				return mod$2.LCHAPIExecuteRecipe(e, [], api);
			}));
		},

		LCHRecipeProxyErrors (inputData, options = {}) {
			if (typeof inputData !== 'object' || inputData === null) {
				return {};
			}

			const errors = {};

			if (typeof inputData.LCHRecipeProxyName !== 'string') {
				errors.LCHRecipeProxyName = [
					'LCHErrorNotString',
				];
			}

			if (typeof inputData.LCHRecipeProxySignature !== 'string') {
				errors.LCHRecipeProxySignature = [
					'LCHErrorNotString',
				];
			}

			return Object.entries(errors).length ? errors : null;
		},

	};

	const mod$3 = {

		LCHLauncherOptions (inputData, notify = function () {}) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof inputData.LCHOptionRecipes === 'undefined') {
				inputData.LCHOptionRecipes = [];
			}
			if (!Array.isArray(inputData.LCHOptionRecipes)) {
				throw new Error('LCHOptionRecipesNotArray');
			}
			inputData.LCHOptionRecipes = inputData.LCHOptionRecipes.filter(function (e) {
				const errors = mod$2.LCHRecipesErrors(e);

				if (errors) {
					notify('LCHOptionRecipesItemNotValid', e, errors);
				}
				return !errors;
			});

			if (typeof inputData.LCHOptionMode === 'undefined') {
				inputData.LCHOptionMode = mod$3.LCHLauncherModes().shift();
			}
			if (typeof inputData.LCHOptionMode !== 'undefined') {
				if (!mod$3.LCHLauncherModes().includes(inputData.LCHOptionMode)) {
					throw new Error('LCHOptionModeNotValid');
				}		}
			if (typeof inputData.LCHOptionCompletionHandler !== 'undefined') {
				if (typeof inputData.LCHOptionCompletionHandler !== 'function') {
					throw new Error('LCHOptionCompletionHandlerNotFunction');
				}		}
			if (typeof inputData.LCHOptionLanguage === 'undefined') {
				inputData.LCHOptionLanguage = 'en';
			}
			if (typeof inputData.LCHOptionLanguage !== 'string') {
				throw new Error('LCHOptionLanguageNotString')
			}
			return inputData;
		},

		LCHLauncherModeCommit () {
			return 'kLCHLauncherModeCommit';
		},

		LCHLauncherModePreview () {
			return 'kLCHLauncherModePreview';
		},

		LCHLauncherModePipe () {
			return 'kLCHLauncherModePipe';
		},

		LCHLauncherModeTask () {
			return 'kLCHLauncherModeTask';
		},

		LCHLauncherModes () {
			return [
				mod$3.LCHLauncherModeCommit(),
				mod$3.LCHLauncherModePreview(),
				mod$3.LCHLauncherModePipe(),
				mod$3.LCHLauncherModeTask(),
			];
		},

		LCHLauncherUIRecipesForMode (param1, param2) {
			if (!Array.isArray(param1)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (!mod$3.LCHLauncherModes().includes(param2)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return param1.filter(function (e) {
				if (typeof e !== 'object' || e === null) {
					return false;
				}

				if (typeof e.LCHRecipeInputTypes === 'string' && e.LCHRecipeInputTypes.split(',').length > 2) {
					return false;
				}

				if (param2 === mod$3.LCHLauncherModeCommit()) {
					return mod$2.LCHRecipesIsCommand(e);
					// if (LCHLauncherAPI.LCHRecipesIsCommand(e)) {
					// 	return true;
					// };

					// if (!LCHLauncherAPI.LCHRecipesIsAction(e)) {
					// 	return false;
					// };

					// if (e.LCHRecipeCallback.length !== 1) {
					// 	return false;
					// };

					// if (e.LCHRecipeInputTypes !== 'String') {
					// 	return false;
					// };

					// if (e._LCHLauncherGenerated !== true) {
					// 	return false;
					// };
				}

				if (param2 === mod$3.LCHLauncherModePreview()) {
					return mod$2.LCHRecipesIsCommand(e);
				}
				
				return true;
			});
		},

		// import * as _fuzzysearch from 'fuzzysearch';
		// const fuzzysearch = typeof _fuzzysearch === 'function' ? _fuzzysearch : _fuzzysearch.default;
		// LCHLauncherFilterForText (inputData) {
		// 	if (typeof inputData !== 'string') {
		// 		throw new Error('LCHErrorInputNotValid');
		// 	}

		// 	return function (e) {
		// 		return [e.LCHRecipeName].filter(function (e) {
		// 			if (!e) {
		// 				return false;
		// 			}

		// 			return fuzzysearch(inputData.toLowerCase(), e.toLowerCase());
		// 		}).length > 0;
		// 	};
		// };

		LCHLauncherThrottleDuration: main_1() ? 25 : 1000,

		LCHLauncherKeyboardEventIsTextInput (inputData) {
			if (typeof inputData !== 'object' || inputData === null) {
				throw new Error('LCHErrorInputNotValid');
			}

			if ([
				inputData.metaKey,
				inputData.shiftKey,
				inputData.ctrlKey,
				inputData.altKey,
			].includes(true)) {
				return false;
			}

			if (!inputData.key) {
				return false;
			}
			
			if ([
				'Unidentified',
				'Tab',
				'CapsLock',
				'ArrowRight',
				'ArrowLeft',
				'Backspace',
				'\\',
				'.',
				',',
				' ',
			].includes(inputData.key)) {
				return false;
			}
			
			return true;
		},

		LCHLauncherActionComparator (inputData) {
			if (typeof inputData !== 'string') {
				throw new Error('LCHErrorInputNotValid');
			}

			return function (a, b) {
				const param1s = [
					a.LCHRecipeInputTypes.split(',')[0],
					b.LCHRecipeInputTypes.split(',')[0],
				];
				const param2s = [
					a.LCHRecipeInputTypes.split(',')[1],
					b.LCHRecipeInputTypes.split(',')[1],
				];

				if (param1s[0] === inputData && param1s[1] === inputData) {
					if (!param2s[0] && param2s[1]) {
						return -1;
					}

					if (param2s[0] && !param2s[1]) {
						return 1;
					}
				}

				if (param1s[0] === inputData && param1s[1] !== inputData) {
					return -1;
				}

				if (param1s[1] === inputData && param1s[0] !== inputData) {
					return 1;
				}

				return 1;
			};
		},

		LCHLauncherConstrainIndex (param1, param2) {
			if (!Array.isArray(param1)) {
				throw new Error('LCHErrorInputNotValid');
			}

			if (typeof param2 !== 'number') {
				throw new Error('LCHErrorInputNotValid');
			}

			if (param2 < 0) {
				return param1.length - 1;
			}

			if (param2 >= param1.length) {
				return 0;
			}

			return param2;
		},

		LCHLauncherReloadableSubjects (inputData) {
			if (!Array.isArray(inputData)) {
				throw new Error('LCHErrorInputNotValid');
			}

			return [].concat.apply([], inputData).filter(function (e) {
				if (typeof e !== 'object' || e === null) {
					return false;
				}

				if (mod$2.LCHRecipesErrors(e)) {
					return false;
				}
				if (!mod$2.LCHRecipesIsSubject(e)) {
					return false;
				}
				return true;
			});
		},

	};

	const LCHModeCommit = mod$3.LCHLauncherModeCommit();
	const LCHModePreview = mod$3.LCHLauncherModePreview();
	const LCHModePipe = mod$3.LCHLauncherModePipe();

	const mod$4 = {

		// DATA

		DataSingletonExists () {
			return !!mod$4._ValueSingleton;
		},

		// VALUE

		_ValueClass: undefined,
		
		_ValueTarget: undefined,
		
		_ValueSingleton: undefined,

		// CONTROL

		ControlRunTasks (inputData) {
			mod$2.LCHAPIRunTasks(inputData, window.location.href);
		},
		
		// LIFECYCLE

		LifecycleSingletonCreate (inputData = {}) {
			if (mod$4._ValueSingleton) {
				mod$4.LifecycleSingletonDestroy();
			}

			if (typeof document !== 'undefined') {
				document.body.appendChild(mod$4._ValueTarget = document.createElement('div'));
			}

			mod$4._ValueSingleton = new mod$4._ValueClass({
				target: mod$4._ValueTarget,
				props: {
					LRTOptions: inputData,
					LRTDidFinish () {
						mod$4.LifecycleSingletonDestroy();

						if (typeof inputData.LCHOptionCompletionHandler !== 'function') {
							return;
						}

						inputData.LCHOptionCompletionHandler();
					},
				},
			});
		},

		LifecycleSingletonDestroy () {
			mod$4._ValueSingleton.$destroy();
			
			delete mod$4._ValueSingleton;

			if (typeof document === 'undefined') {
				return;
			}

			mod$4._ValueTarget.remove();

			delete mod$4._ValueTarget;
		},

	};

	const LCHPackage = function () {
		const outputData = {
			LCHModeCommit,
			LCHModePreview,
			LCHModePipe,

			LCHSingletonCreate: mod$4.LifecycleSingletonCreate,
			LCHSingletonExists: mod$4.DataSingletonExists,
			LCHSingletonDestroy: mod$4.LifecycleSingletonDestroy,

			LCHTasksRun: mod$4.ControlRunTasks,
		};

		Object.freeze(outputData);

		return outputData;
	};

	var uiBehaviour = createCommonjsModule(function (module, exports) {
	!function(e,t){module.exports=t();}(commonjsGlobal,(function(){function t(){}function r(e,t){for(const r in t)e[r]=t[r];return e}function o(e){return e()}function n(){return Object.create(null)}function i(e){e.forEach(o);}function a(e){return "function"==typeof e}function c(e,t){return e!=e?t==t:e!==t||e&&"object"==typeof e||"function"==typeof e}function l(e,t,r,o){if(e){const n=u(e,t,r,o);return e[0](n)}}function u(e,t,o,n){return e[1]&&n?r(o.ctx.slice(),e[1](n(t))):o.ctx}function p(e,t,r,o,n,i,a){const c=function(e,t,r,o){if(e[2]&&o){const n=e[2](o(r));if(void 0===t.dirty)return n;if("object"==typeof n){const e=[],r=Math.max(t.dirty.length,n.length);for(let o=0;o<r;o+=1)e[o]=t.dirty[o]|n[o];return e}return t.dirty|n}return t.dirty}(t,o,n,i);if(c){const n=u(t,r,o,a);e.p(n,c);}}function s(e){return null==e?"":e}function L(e,t){e.appendChild(t);}function C(e,t,r){e.insertBefore(t,r||null);}function m(e){e.parentNode.removeChild(e);}function d(e,t){for(let r=0;r<e.length;r+=1)e[r]&&e[r].d(t);}function f(e){return document.createElement(e)}function H(e){return document.createTextNode(e)}function h(){return H(" ")}function b(){return H("")}function y(e,t,r,o){return e.addEventListener(t,r,o),()=>e.removeEventListener(t,r,o)}function S(e,t,r){null==r?e.removeAttribute(t):e.getAttribute(t)!==r&&e.setAttribute(t,r);}function P(e,t){t=""+t,e.wholeText!==t&&(e.data=t);}function g(e,t){e.value=null==t?"":t;}function R(e,t,r){e.classList[r?"add":"remove"](t);}let I;function O(e){I=e;}function v(){if(!I)throw new Error("Function called outside component initialization");return I}function T(e){v().$$.on_mount.push(e);}function E(){const e=v();return (t,r)=>{const o=e.$$.callbacks[t];if(o){const n=function(e,t){const r=document.createEvent("CustomEvent");return r.initCustomEvent(e,!1,!1,t),r}(t,r);o.slice().forEach((t=>{t.call(e,n);}));}}}const w=[],_=[],x=[],V=[],j=Promise.resolve();let A=!1;function k(e){x.push(e);}let D=!1;const N=new Set;function F(){if(!D){D=!0;do{for(let e=0;e<w.length;e+=1){const t=w[e];O(t),M(t.$$);}for(O(null),w.length=0;_.length;)_.pop()();for(let e=0;e<x.length;e+=1){const t=x[e];N.has(t)||(N.add(t),t());}x.length=0;}while(w.length);for(;V.length;)V.pop()();A=!1,D=!1,N.clear();}}function M(e){if(null!==e.fragment){e.update(),i(e.before_update);const t=e.dirty;e.dirty=[-1],e.fragment&&e.fragment.p(e.ctx,t),e.after_update.forEach(k);}}const K=new Set;let $;function U(){$={r:0,c:[],p:$};}function B(){$.r||i($.c),$=$.p;}function z(e,t){e&&e.i&&(K.delete(e),e.i(t));}function q(e,t,r,o){if(e&&e.o){if(K.has(e))return;K.add(e),$.c.push((()=>{K.delete(e),o&&(r&&e.d(1),o());})),e.o(t);}}const W="undefined"!=typeof window?window:"undefined"!=typeof globalThis?globalThis:commonjsGlobal;function Z(e){e&&e.c();}function G(e,t,r){const{fragment:n,on_mount:c,on_destroy:l,after_update:u}=e.$$;n&&n.m(t,r),k((()=>{const t=c.map(o).filter(a);l?l.push(...t):i(t),e.$$.on_mount=[];})),u.forEach(k);}function J(e,t){const r=e.$$;null!==r.fragment&&(i(r.on_destroy),r.fragment&&r.fragment.d(t),r.on_destroy=r.fragment=null,r.ctx=[]);}function X(e,t){-1===e.$$.dirty[0]&&(w.push(e),A||(A=!0,j.then(F)),e.$$.dirty.fill(0)),e.$$.dirty[t/31|0]|=1<<t%31;}function Y(e,r,o,a,c,l,u=[-1]){const p=I;O(e);const s=r.props||{},L=e.$$={fragment:null,ctx:null,props:l,update:t,not_equal:c,bound:n(),on_mount:[],on_destroy:[],before_update:[],after_update:[],context:new Map(p?p.$$.context:[]),callbacks:n(),dirty:u,skip_bound:!1};let C=!1;if(L.ctx=o?o(e,s,((t,r,...o)=>{const n=o.length?o[0]:r;return L.ctx&&c(L.ctx[t],L.ctx[t]=n)&&(!L.skip_bound&&L.bound[t]&&L.bound[t](n),C&&X(e,t)),r})):[],L.update(),C=!0,i(L.before_update),L.fragment=!!a&&a(L.ctx),r.target){if(r.hydrate){const e=function(e){return Array.from(e.childNodes)}(r.target);L.fragment&&L.fragment.l(e),e.forEach(m);}else L.fragment&&L.fragment.c();r.intro&&z(e.$$.fragment),G(e,r.target,r.anchor),F();}O(p);}class Q{$destroy(){J(this,1),this.$destroy=t;}$on(e,t){const r=this.$$.callbacks[e]||(this.$$.callbacks[e]=[]);return r.push(t),()=>{const e=r.indexOf(t);-1!==e&&r.splice(e,1);}}$set(e){var t;this.$$set&&(t=e,0!==Object.keys(t).length)&&(this.$$.skip_bound=!0,this.$$set(e),this.$$.skip_bound=!1);}}var ee="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:"undefined"!=typeof commonjsGlobal?commonjsGlobal:"undefined"!=typeof self?self:{};function te(){throw new Error("Dynamic requires are not currently supported by rollup-plugin-commonjs")}function re(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}function oe(e,t){return e(t={exports:{}},t.exports),t.exports}var ne=oe((function(e,t){const r=te,o={OLSKSpecUIArguments(e){if(!Array.isArray(e))throw new Error("OLSKErrorInputNotValid");return e.map((function(e){return e.match(/^match=/)?e.replace(/^match=/,"-os-match="):e.match(/^skip=/)?e.replace(/^skip=/,"-os-skip="):e}))},OLSKSpecUITestPaths(e){if("string"!=typeof e)throw new Error("OLSKErrorInputNotValid");if(!r().OLSKDiskIsRealFolderPath(e))throw new Error("OLSKErrorInputNotValid");return r().sync("**/ui-test-*.js",{cwd:e,realpath:!0}).filter((function(e){return !e.match(r().OLSKDiskStandardIgnorePattern())}))},OLSKSpecUISourcePaths(e){if("string"!=typeof e)throw new Error("OLSKErrorInputNotValid");if(!r().OLSKDiskIsRealFolderPath(e))throw new Error("OLSKErrorInputNotValid");return r().sync("**/+(ui-behaviour.js|*.ejs|*.md|*.html)",{cwd:e,realpath:!0}).filter((function(e){return !!e.match("__compiled")||!e.match(r().OLSKDiskStandardIgnorePattern())}))},OLSKSpecMochaPaths(e){if("object"!=typeof e||null===e)throw new Error("OLSKErrorInputNotValid");if("string"!=typeof e.ParamPackageDirectory)throw new Error("OLSKErrorInputNotValid");if("string"!=typeof e.ParamWorkingDirectory)throw new Error("OLSKErrorInputNotValid");return [r().join(e.ParamPackageDirectory,"./node_modules/.bin/mocha"),r().join(e.ParamPackageDirectory,"../.bin/mocha"),r().join(e.ParamWorkingDirectory,"./node_modules/.bin/mocha")]},_OLSKSpecMochaReplaceES6Import(e){const t=[];return e=e.replace(/^import \* as (\w+) from ['"]([^'"]+)['"];?/gm,'var $1 = require("$2");').replace(/^import (\w+) from ['"]([^'"]+)['"];?/gm,'var _$1 = require("$2"); const $1 = _$1.default || _$1').replace(/^import {([^}]+)} from ['"](.+)['"];?/gm,'var {$1} = require("$2");').replace(/^export default /gm,"exports.default = ").replace(/^export (const|let|var|class|function) (\w+)/gm,((e,r,o)=>(t.push(o),`${r} ${o}`))).replace(/^export \{([^}]+)\}(?: from ['"]([^'"]+)['"];?)?/gm,((e,r,o)=>(r.split(",").filter(Boolean).forEach((e=>{t.push(e);})),o?`const { ${r} } = require("${o}");`:""))).replace(/^export function (\w+)/gm,"exports.$1 = function $1"),t.forEach((t=>{e+=`\nexports.${t} = ${t};`;})),e}};Object.assign(t,o),t.OLSK_SPEC_UI=function(){return "undefined"!=typeof navigator&&("undefined"!=typeof window&&"loc.tests"===window.location.hostname||"Zombie"===navigator.appName)};})).OLSK_SPEC_UI;const ie={LCHFormulaSafeStringFields:["LCHFormulaID","LCHFormulaName","LCHFormulaSignature","LCHFormulaInputTypes","LCHFormulaOutputType","LCHFormulaStyle","LCHFormulaURLFilter","LCHFormulaCreationDate","LCHFormulaModificationDate","LCHFormulaSyntaxErrorMessage","@context"],LCHFormulaErrors(e,t={}){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");const r={};return (void 0!==e.LCHFormulaName||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaName&&(r.LCHFormulaName=["LCHErrorNotString"]),(void 0!==e.LCHFormulaSignature||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaSignature&&(r.LCHFormulaSignature=["LCHErrorNotString"]),(void 0!==e.LCHFormulaInputTypes||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaInputTypes&&(r.LCHFormulaInputTypes=["LCHErrorNotString"]),(void 0!==e.LCHFormulaOutputType||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaOutputType&&(r.LCHFormulaOutputType=["LCHErrorNotString"]),void 0!==e.LCHFormulaIsHidden&&"function"!=typeof e.LCHFormulaIsHidden&&(r.LCHFormulaIsHidden=["LCHErrorNotFunction"]),(void 0!==e.LCHFormulaURLFilter||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaURLFilter&&(r.LCHFormulaURLFilter=["LCHErrorNotString"]),(void 0!==e.LCHFormulaIsAutomatic||t.LCHOptionValidateIfNotPresent)&&"boolean"!=typeof e.LCHFormulaIsAutomatic&&(r.LCHFormulaIsAutomatic=["LCHErrorNotBoolean"]),(void 0!==e.LCHFormulaStyle||t.LCHOptionValidateIfNotPresent)&&"string"!=typeof e.LCHFormulaStyle&&(r.LCHFormulaStyle=["LCHErrorNotString"]),(void 0!==e.LCHFormulaIsFlagged||t.LCHOptionValidateIfNotPresent)&&"boolean"!=typeof e.LCHFormulaIsFlagged&&(r.LCHFormulaIsFlagged=["LCHErrorNotBoolean"]),Object.entries(r).length?r:null},LCHFormulaFrom(e){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");return Object.entries(e).reduce((function(e,t){return e[t[0].replace(/LCH[A-Z][a-z]+/,"LCHFormula")]=t[1],e}),{})},LCHFormulaTo(e,t){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");if("string"!=typeof t)throw new Error("LCHErrorInputNotValid");return Object.entries(e).reduce((function(e,r){return e[r[0].replace("LCHFormula",t)]=r[1],e}),{})},LCHFormulaToEvaluate(e){if(ie.LCHFormulaErrors(e))throw new Error("LCHErrorInputNotValid");let t=Object.fromEntries(Object.entries(e).filter((function(e){return !ie.LCHFormulaSafeStringFields.includes(e[0])})));return (t.LCHFormulaCallbackArgs||t.LCHFormulaCallbackBody)&&(t.LCHFormulaCallbackRaw=`(function (${t.LCHFormulaCallbackArgs||""}) { ${t.LCHFormulaCallbackBody||""} })`,delete t.LCHFormulaCallbackArgs,delete t.LCHFormulaCallbackBody),t.LCHFormulaCanonicalExampleCallbackBody&&(t.LCHFormulaCanonicalExampleCallbackRaw=`(function () { ${t.LCHFormulaCanonicalExampleCallbackBody||""} })`,delete t.LCHFormulaCanonicalExampleCallbackBody),t}},ae={LCHRuntimeURLFilter(e,t){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if("string"!=typeof t)throw new Error("LCHErrorInputNotValid");if(!t)throw new Error("LCHErrorInputNotValid");if("*"===e)return !0;let r=e.match(/^\/(.*)\/(\w*)/i);return r&&r.shift()?!!t.match(new RegExp(r[0],r[1])):t.includes(e)},LCHRuntimeInputTypes(e){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");return e.split(",").map((function(e){return e.trim()})).filter((function(e){return !!e}))},LCHRuntimeAPI(e){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");const t={fn(r){if("string"!=typeof r)throw new Error("LCHErrorIdentifierNotString");if(""===r)throw new Error("LCHErrorIdentifierBlank");if(r.trim()!==r)throw new Error("LCHErrorIdentifierContainsUntrimmedWhitespace");let o=e.filter((function(e){return e.LCHRecipeSignature===r})).shift();if(!o)throw new Error("LCHErrorIdentifierNotDefined");return o.LCHRecipeCallback.bind({api:t})}};return Object.assign(t,e.reduce((function(e,r){return e[r.LCHRecipeSignature]||(e[r.LCHRecipeSignature]=function(){const o=arguments;return (r.LCHRecipeInputTypes?ae.LCHRuntimeInputTypes(r.LCHRecipeInputTypes):[]).forEach((function(t,r){if(!e[t](o[r]))throw new Error("LCHErrorTypeMismatch")})),r.LCHRecipeCallback.apply({api:t},o)}),e}),{})),Object.freeze(t),t}},ce=function(e){return !!e.LCHRecipeName&&(!e.LCHRecipeCallback.length&&"ServiceSearchURLTemplate"===e.LCHRecipeOutputType)},le=function(){return {LCHRecipeName:"alfa",LCHRecipeCallback:()=>"https://example.com?q=LCHSEARCHTOKEN",LCHRecipeOutputType:"ServiceSearchURLTemplate"}},ue=function(){return {LCHRecipeSignature:"ServiceSearch",LCHRecipeCallback:ce,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:le}};var pe=Object.freeze({__proto__:null,LCHTypeServiceSearchCallback:ce,LCHTypeServiceSearchCanonicalExampleCallback:le,LCHTypeServiceSearchRecipe:ue});const se=function(e){return !!e};var Le=Object.freeze({__proto__:null,LCHPrimitiveBoolCallback:se,LCHPrimitiveBoolRecipe:function(){return {LCHRecipeSignature:"Bool",LCHRecipeCallback:se}}});const Ce=function(e){return e instanceof Date&&!Number.isNaN(e.getTime())},me=function(){return new Date(0)};var de=Object.freeze({__proto__:null,LCHPrimitiveDateCallback:Ce,LCHPrimitiveDateCanonicalExampleCallback:me,LCHPrimitiveDateRecipe:function(){return {LCHRecipeSignature:"Date",LCHRecipeCallback:Ce,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:me}}});const fe=function(e){return "object"==typeof e&&null!==e&&"function"==typeof e.focus},He=function(){return {focus(){}}};var he=Object.freeze({__proto__:null,LCHPrimitiveDOMElementCallback:fe,LCHPrimitiveDOMElementCanonicalExampleCallback:He,LCHPrimitiveDOMElementRecipe:function(){return {LCHRecipeCallback:fe,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:He,LCHRecipeSignature:"DOMElement",_LCHRecipeTypeIsExclusive:!0}}}),be=function(e,t){if(t=t.split(":")[0],!(e=+e))return !1;switch(t){case"http":case"ws":return 80!==e;case"https":case"wss":return 443!==e;case"ftp":return 21!==e;case"gopher":return 70!==e;case"file":return !1}return 0!==e},ye=Object.prototype.hasOwnProperty;function Se(e){try{return decodeURIComponent(e.replace(/\+/g," "))}catch(e){return null}}function Pe(e){try{return encodeURIComponent(e)}catch(e){return null}}var ge={stringify:function(e,t){t=t||"";var r,o,n=[];for(o in "string"!=typeof t&&(t="?"),e)if(ye.call(e,o)){if((r=e[o])||null!=r&&!isNaN(r)||(r=""),o=Pe(o),r=Pe(r),null===o||null===r)continue;n.push(o+"="+r);}return n.length?t+n.join("&"):""},parse:function(e){for(var t,r=/([^=?#&]+)=?([^&]*)/g,o={};t=r.exec(e);){var n=Se(t[1]),i=Se(t[2]);null===n||null===i||n in o||(o[n]=i);}return o}},Re=/^[A-Za-z][A-Za-z0-9+-.]*:\/\//,Ie=/^([a-z][a-z0-9.+-]*:)?(\/\/)?([\S\s]*)/i,Oe=new RegExp("^[\\x09\\x0A\\x0B\\x0C\\x0D\\x20\\xA0\\u1680\\u180E\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u202F\\u205F\\u3000\\u2028\\u2029\\uFEFF]+");function ve(e){return (e||"").toString().replace(Oe,"")}var Te=[["#","hash"],["?","query"],function(e){return e.replace("\\","/")},["/","pathname"],["@","auth",1],[NaN,"host",void 0,1,1],[/:(\d+)$/,"port",void 0,1],[NaN,"hostname",void 0,1,1]],Ee={hash:1,query:1};function we(e){var t,r=("undefined"!=typeof window?window:void 0!==ee?ee:"undefined"!=typeof self?self:{}).location||{},o={},n=typeof(e=e||r);if("blob:"===e.protocol)o=new xe(unescape(e.pathname),{});else if("string"===n)for(t in o=new xe(e,{}),Ee)delete o[t];else if("object"===n){for(t in e)t in Ee||(o[t]=e[t]);void 0===o.slashes&&(o.slashes=Re.test(e.href));}return o}function _e(e){e=ve(e);var t=Ie.exec(e);return {protocol:t[1]?t[1].toLowerCase():"",slashes:!!t[2],rest:t[3]}}function xe(e,t,r){if(e=ve(e),!(this instanceof xe))return new xe(e,t,r);var o,n,i,a,c,l,u=Te.slice(),p=typeof t,s=this,L=0;for("object"!==p&&"string"!==p&&(r=t,t=null),r&&"function"!=typeof r&&(r=ge.parse),t=we(t),o=!(n=_e(e||"")).protocol&&!n.slashes,s.slashes=n.slashes||o&&t.slashes,s.protocol=n.protocol||t.protocol||"",e=n.rest,n.slashes||(u[3]=[/(.*)/,"pathname"]);L<u.length;L++)"function"!=typeof(a=u[L])?(i=a[0],l=a[1],i!=i?s[l]=e:"string"==typeof i?~(c=e.indexOf(i))&&("number"==typeof a[2]?(s[l]=e.slice(0,c),e=e.slice(c+a[2])):(s[l]=e.slice(c),e=e.slice(0,c))):(c=i.exec(e))&&(s[l]=c[1],e=e.slice(0,c.index)),s[l]=s[l]||o&&a[3]&&t[l]||"",a[4]&&(s[l]=s[l].toLowerCase())):e=a(e);r&&(s.query=r(s.query)),o&&t.slashes&&"/"!==s.pathname.charAt(0)&&(""!==s.pathname||""!==t.pathname)&&(s.pathname=function(e,t){if(""===e)return t;for(var r=(t||"/").split("/").slice(0,-1).concat(e.split("/")),o=r.length,n=r[o-1],i=!1,a=0;o--;)"."===r[o]?r.splice(o,1):".."===r[o]?(r.splice(o,1),a++):a&&(0===o&&(i=!0),r.splice(o,1),a--);return i&&r.unshift(""),"."!==n&&".."!==n||r.push(""),r.join("/")}(s.pathname,t.pathname)),be(s.port,s.protocol)||(s.host=s.hostname,s.port=""),s.username=s.password="",s.auth&&(a=s.auth.split(":"),s.username=a[0]||"",s.password=a[1]||""),s.origin=s.protocol&&s.host&&"file:"!==s.protocol?s.protocol+"//"+s.host:"null",s.href=s.toString();}xe.prototype={set:function(e,t,r){var o=this;switch(e){case"query":"string"==typeof t&&t.length&&(t=(r||ge.parse)(t)),o[e]=t;break;case"port":o[e]=t,be(t,o.protocol)?t&&(o.host=o.hostname+":"+t):(o.host=o.hostname,o[e]="");break;case"hostname":o[e]=t,o.port&&(t+=":"+o.port),o.host=t;break;case"host":o[e]=t,/:\d+$/.test(t)?(t=t.split(":"),o.port=t.pop(),o.hostname=t.join(":")):(o.hostname=t,o.port="");break;case"protocol":o.protocol=t.toLowerCase(),o.slashes=!r;break;case"pathname":case"hash":if(t){var n="pathname"===e?"/":"#";o[e]=t.charAt(0)!==n?n+t:t;}else o[e]=t;break;default:o[e]=t;}for(var i=0;i<Te.length;i++){var a=Te[i];a[4]&&(o[a[1]]=o[a[1]].toLowerCase());}return o.origin=o.protocol&&o.host&&"file:"!==o.protocol?o.protocol+"//"+o.host:"null",o.href=o.toString(),o},toString:function(e){e&&"function"==typeof e||(e=ge.stringify);var t,r=this,o=r.protocol;o&&":"!==o.charAt(o.length-1)&&(o+=":");var n=o+(r.slashes?"//":"");return r.username&&(n+=r.username,r.password&&(n+=":"+r.password),n+="@"),n+=r.host+r.pathname,(t="object"==typeof r.query?e(r.query):r.query)&&(n+="?"!==t.charAt(0)?"?"+t:t),r.hash&&(n+=r.hash),n}},xe.extractProtocol=_e,xe.location=we,xe.trimLeft=ve,xe.qs=ge;var Ve=xe,je=Object.freeze({__proto__:null,default:Ve,__moduleExports:Ve});const Ae="function"==typeof je?je:Ve,ke=function(e){return "string"==typeof e&&!!new Ae(e,{}).hostname},De=function(){return "https://example.com"};var Ne=Object.freeze({__proto__:null,LCHPrimitiveURLCallback:ke,LCHPrimitiveStringCanonicalExampleCallback:De,LCHPrimitiveURLRecipe:function(){return {LCHRecipeSignature:"URL",LCHRecipeCallback:ke,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:De}}});const Fe=function(e){return !!ke(e)&&!!e.match(/LCHSEARCHTOKEN/i)},Me=function(){return "https://example.com?q=LCHSEARCHTOKEN"};var Ke=Object.freeze({__proto__:null,LCHPrimitiveServiceSearchURLTemplateCallback:Fe,LCHPrimitiveServiceSearchURLTemplateCanonicalExampleCallback:Me,LCHPrimitiveServiceSearchURLTemplateRecipe:function(){return {LCHRecipeCallback:Fe,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:Me,LCHRecipeSignature:"ServiceSearchURLTemplate",_LCHRecipeTypeIsExclusive:!0}}});const $e=function(e){return "string"==typeof e},Ue=function(){return ""};var Be=Object.freeze({__proto__:null,LCHPrimitiveStringCallback:$e,LCHPrimitiveStringCanonicalExampleCallback:Ue,LCHPrimitiveStringRecipe:function(){return {LCHRecipeSignature:"String",LCHRecipeCallback:$e,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:Ue}}});const ze=function(e){return !!e.LCHRecipeName&&!e.LCHRecipeCallback.length},qe=function(){return {LCHRecipeName:"alfa",LCHRecipeCallback(){}}};var We=Object.freeze({__proto__:null,LCHTypeCommandCallback:ze,LCHTypeStringCanonicalExampleCallback:qe,LCHTypeCommandRecipe:function(){return {LCHRecipeSignature:"Command",LCHRecipeCallback:ze,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:qe}}});const Ze=function(e){return !!e.LCHRecipeName&&"SubjectContainer"===e.LCHRecipeOutputType},Ge=function(){return {LCHRecipeName:"alfa",LCHRecipeCallback(){},LCHRecipeOutputType:"SubjectContainer"}};var Je=Object.freeze({__proto__:null,LCHTypeSubjectContainerCallback:Ze,LCHTypeSubjectContainerCanonicalExampleCallback:Ge,LCHTypeSubjectContainerRecipe:function(){return {LCHRecipeSignature:"SubjectContainer",LCHRecipeCallback:Ze,LCHRecipeOutputType:"Bool",LCHRecipeCanonicalExampleCallback:Ge,_LCHRecipeTypeIsExclusive:!0}}});const Xe=function(e){return new Date(Date.parse(e)-1e3*e.getTimezoneOffset()*60)};var Ye=Object.freeze({__proto__:null,LCHDateLocalOffsetSubtractedCallback:Xe,LCHDateLocalOffsetSubtractedRecipe:function(){return {LCHRecipeSignature:"LCHDateLocalOffsetSubtracted",LCHRecipeInputTypes:"Date",LCHRecipeCallback:Xe}}});const Qe=async function(e={}){return new Promise((function(t,r){return Object.assign(document.createElement("input"),e,{type:"file",onchange:e=>Object.assign(new FileReader,{onload:e=>t(e.target.result)}).readAsText(e.target.files[0])}).click()}))};var et=Object.freeze({__proto__:null,LCHReadTextFileCallback:Qe,LCHReadTextFileRecipe:function(){return {LCHRecipeSignature:"LCHReadTextFile",LCHRecipeCallback:Qe}}});const tt=async function(e={}){return new Promise((function(t,r){return Object.assign(document.createElement("input"),e,{type:"file",onchange:e=>t(Promise.all([...e.target.files].map((function(e){return new Promise((function(t,r){return Object.assign(new FileReader,{onload:r=>t(Object.assign(e,{_LCHReadTextFileObjectContent:r.target.result}))}).readAsText(e)}))}))))}).click()}))};var rt=Object.freeze({__proto__:null,LCHReadTextFileObjectsCallback:tt,LCHReadTextFileObjectsRecipe:function(){return {LCHRecipeSignature:"LCHReadTextFileObjects",LCHRecipeCallback:tt}}}),ot=oe((function(e,t){!function(){function t(e,t){return void 0===t?t={autoBom:!1}:"object"!=typeof t&&(console.warn("Deprecated: Expected third argument to be a object"),t={autoBom:!t}),t.autoBom&&/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(e.type)?new Blob(["\ufeff",e],{type:e.type}):e}function r(e,t,r){var o=new XMLHttpRequest;o.open("GET",e),o.responseType="blob",o.onload=function(){a(o.response,t,r);},o.onerror=function(){console.error("could not download file");},o.send();}function o(e){var t=new XMLHttpRequest;t.open("HEAD",e,!1);try{t.send();}catch(e){}return 200<=t.status&&299>=t.status}function n(e){try{e.dispatchEvent(new MouseEvent("click"));}catch(r){var t=document.createEvent("MouseEvents");t.initMouseEvent("click",!0,!0,window,0,0,0,80,20,!1,!1,!1,!1,0,null),e.dispatchEvent(t);}}var i="object"==typeof window&&window.window===window?window:"object"==typeof self&&self.self===self?self:"object"==typeof ee&&ee.global===ee?ee:void 0,a=i.saveAs||("object"!=typeof window||window!==i?function(){}:"download"in HTMLAnchorElement.prototype?function(e,t,a){var c=i.URL||i.webkitURL,l=document.createElement("a");t=t||e.name||"download",l.download=t,l.rel="noopener","string"==typeof e?(l.href=e,l.origin===location.origin?n(l):o(l.href)?r(e,t,a):n(l,l.target="_blank")):(l.href=c.createObjectURL(e),setTimeout((function(){c.revokeObjectURL(l.href);}),4e4),setTimeout((function(){n(l);}),0));}:"msSaveOrOpenBlob"in navigator?function(e,i,a){if(i=i||e.name||"download","string"!=typeof e)navigator.msSaveOrOpenBlob(t(e,a),i);else if(o(e))r(e,i,a);else {var c=document.createElement("a");c.href=e,c.target="_blank",setTimeout((function(){n(c);}));}}:function(e,t,o,n){if((n=n||open("","_blank"))&&(n.document.title=n.document.body.innerText="downloading..."),"string"==typeof e)return r(e,t,o);var a="application/octet-stream"===e.type,c=/constructor/i.test(i.HTMLElement)||i.safari,l=/CriOS\/[\d]+/.test(navigator.userAgent);if((l||a&&c)&&"object"==typeof FileReader){var u=new FileReader;u.onloadend=function(){var e=u.result;e=l?e:e.replace(/^data:[^;]*;/,"data:attachment/file;"),n?n.location.href=e:location=e,n=null;},u.readAsDataURL(e);}else {var p=i.URL||i.webkitURL,s=p.createObjectURL(e);n?n.location=s:location.href=s,n=null,setTimeout((function(){p.revokeObjectURL(s);}),4e4);}});i.saveAs=a.saveAs=a,e.exports=a;}();}));const nt=function(e,t){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if("string"!=typeof t)throw new Error("LCHErrorInputNotValid");if(!t.trim())throw new Error("LCHErrorInputNotValid");return ot.saveAs(new Blob([e],{type:"text/plain;charset=utf-8"}),t)};var it=Object.freeze({__proto__:null,LCHSaveFileCallback:nt,LCHSaveFileRecipe:function(){return {LCHRecipeSignature:"LCHSaveFile",LCHRecipeCallback:nt}}});const at=['a[href]:not([tabindex="-1"])','input:not([disabled]):not([tabindex="-1"]):not([type="hidden"])','button:not([disabled]):not([tabindex="-1"])'].join(","),ct=function(e){if("object"!=typeof e||null===e||"function"!=typeof e.querySelectorAll)throw new Error("LCHErrorInputNotValid");const t={ids:{}};return [].concat.apply([],e.querySelectorAll(at)).filter((function(r){return {A:function(e){return !!e.href&&!(!e.textContent.trim()&&!e.title.trim())},INPUT:function(r){return t.labels||(t.labels=Array.from(e.querySelectorAll("label"))),t.ids[r.id]=t.labels.filter((function(e){return e.getAttribute("for")===r.id})).map((function(e){return e.textContent.trim()})).shift(),!!(r.name.trim()||r.placeholder.trim()||t.ids[r.id])},BUTTON:function(e){return !!e.textContent.trim()}}[r.tagName](r)})).map((function(e){return {LCHRecipeName:{A:function(e){return e.textContent.trim()||e.title.trim()},INPUT:function(e){return t.ids[e.id]||e.placeholder.trim()||e.name.trim()},BUTTON:function(e){return e.textContent.trim()}}[e.tagName](e),LCHRecipeCallback:()=>e,LCHRecipeOutputType:"DOMElement"}}))},lt=function(){return ct(document)};var ut=Object.freeze({__proto__:null,LCHActiveDocumentsFocusElements:ct,LCHActiveDocumentFocusElementsCallback:lt,LCHActiveDocumentFocusElementsRecipe:function(){return {LCHRecipeSignature:"LCHActiveDocumentFocusElements",LCHRecipeOutputType:"SubjectContainer",LCHRecipeCallback:lt}}});const pt=function(e){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if(!e.trim().length)throw new Error("LCHErrorInputNotValid");return {LCHComponentDescriptorName:"LCHCopyToClipboard",LCHComponentDescriptorProps:{inputData:e},LCHComponentDescriptorCompletionHandlerSignature:"LCHCopyToClipboardCompletionHandler",LCHComponentDescriptorOLSKLocalized:!0}};var st=Object.freeze({__proto__:null,LCHCopyToClipboardCallback:pt,LCHCopyToClipboardRecipe:function(){return {LCHRecipeSignature:"LCHCopyToClipboard",LCHRecipeInputTypes:"String",LCHRecipeCallback:pt}}});const Lt=function(e){e&&e.focus();};var Ct=Object.freeze({__proto__:null,LCHDOMElementFocusCallback:Lt,LCHDOMElementFocusRecipe:function(){return {LCHRecipeSignature:"LCHDOMElementFocus",LCHRecipeInputTypes:"DOMElement",LCHRecipeCallback:Lt}}});const mt=function(e){if("undefined"==typeof document)return;const t=document.createElement("div");t.className="LCHLargeTextContainer";for(let[e,r]of Object.entries({width:"100%",position:"fixed",top:"45%",left:"0",textAlign:"center",cursor:"default"}))t.style[e]=r;const r=document.createElement("span");r.textContent=e,t.appendChild(r);for(let[e,t]of Object.entries({display:"block-inline",borderRadius:"20px",boxShadow:"0 0 10px 0px hsla(0, 0%, 0%, 0.1)",padding:"20px",background:"hsla(0, 0%, 0%, 0.8)",color:"white",fontFamily:"Arial",fontSize:"72pt",fontWeight:"bold",textAlign:"center",textShadow:"5px 5px 10px hsla(0, 0%, 0%, 0.5)",overflowWrap:"break-word"}))r.style[e]=t;document.body.appendChild(t);let o=function(e){e.preventDefault(),!e.key&&t.contains(e.target)||(window.removeEventListener("click",o),window.removeEventListener("keydown",o),t.remove());};setTimeout((function(){window.addEventListener("click",o),window.addEventListener("keydown",o);}));};var dt=Object.freeze({__proto__:null,LCHLargeTextCallback:mt,LCHLargeTextRecipe:function(){return {LCHRecipeSignature:"LCHLargeText",LCHRecipeInputTypes:"String",LCHRecipeCallback:mt}}});const ft=function(e){return e},Ht=function(){return {LCHRecipeSignature:"LCHRunCommand",LCHRecipeInputTypes:"Command",LCHRecipeCallback:ft}};var ht=Object.freeze({__proto__:null,LCHRunCommandCallback:ft,LCHRunCommandRecipe:Ht});const bt=function(e,t){if("function"!=typeof e)throw new Error("LCHErrorInputNotValid");return function(){return e.apply(t,[...arguments].reverse())}},yt=function(e,t){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if("string"!=typeof t)throw new Error("LCHErrorInputNotValid");return e.match(/LCHSEARCHTOKEN/i)?e.replace(/LCHSEARCHTOKEN/i,t.split(" ").map((function(e){return encodeURIComponent(e)})).join("+")):e},St=function(e,t){return this.api.fn("LCHURLOpen")(yt(t,e))},Pt=function(){return bt(St,this)(...arguments)};var gt=Object.freeze({__proto__:null,LCHSearchActionURLFrom:yt,LCHSearchWithCallback:St,LCHSearchWithRecipe:function(){return {LCHRecipeSignature:"LCHSearchWith",LCHRecipeInputTypes:"String,ServiceSearchURLTemplate",LCHRecipeCallback:St}},LCHSearchForCallback:Pt,LCHSearchForRecipe:function(){return {LCHRecipeSignature:"LCHSearchFor",LCHRecipeInputTypes:"ServiceSearchURLTemplate,String",LCHRecipeCallback:Pt}}});const Rt=function(){return "https://wikipedia.org/w/index.php?search=LCHSEARCHTOKEN"};var It=Object.freeze({__proto__:null,LCHServiceSearchWikipediaCallback:Rt,LCHServiceSearchWikipediaRecipe:function(){return {LCHRecipeName:"Wikipedia",LCHRecipeOutputType:"ServiceSearchURLTemplate",LCHRecipeCallback:Rt,LCHRecipeSignature:"LCHServiceSearchWikipedia"}}});const Ot=function(e){return e};var vt=Object.freeze({__proto__:null,LCHSubjectContainerShowContentsCallback:Ot,LCHSubjectContainerShowContentsRecipe:function(){return {LCHRecipeSignature:"LCHSubjectContainerShowContents",LCHRecipeInputTypes:"SubjectContainer",LCHRecipeCallback:Ot}}});const Tt=function(e){e&&window.open(e,"_blank").focus();};var Et=Object.freeze({__proto__:null,LCHURLOpenCallback:Tt,LCHURLOpenRecipe:function(){return {LCHRecipeSignature:"LCHURLOpen",LCHRecipeInputTypes:"URL",LCHRecipeCallback:Tt}}});const wt=function(){return [].concat.apply([],[Le,de,he,Ke,Be,Ne,We,pe,Je,ut,Ye,et,rt,it,st,Ct,dt,ht,gt,It,vt,Et].map((function(e){return Object.entries(e).filter((function(e){return e.shift().includes("Recipe")})).map((function(e){return e.pop()()})).map((function(e){return e}))})))};Array.prototype._LCHIntersect=function(){return this.map((function(e){return new Set(e)})).reduce((function(e,t){return e.filter((e=>t.has(e)))}),[...new Set([].concat.apply([],this))])};const _t={LCHRecipesErrors(e,t={}){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");const r=ie.LCHFormulaTo(ie.LCHFormulaErrors(ie.LCHFormulaFrom(e))||{},"LCHRecipe");return "function"!=typeof e.LCHRecipeCallback&&(r.LCHRecipeCallback=["LCHErrorNotFunction"]),"string"==typeof e.LCHRecipeName&&(e.LCHRecipeName.trim()||(r.LCHRecipeName=["LCHErrorNotFilled"])),"string"==typeof e.LCHRecipeInputTypes&&(e.LCHRecipeInputTypes.trim()!==e.LCHRecipeInputTypes&&(r.LCHRecipeInputTypes=["LCHErrorNotTrimmed"]),e.LCHRecipeInputTypes.trim()||(r.LCHRecipeInputTypes=["LCHErrorNotFilled"])),"string"==typeof e.LCHRecipeOutputType&&(e.LCHRecipeOutputType.trim()!==e.LCHRecipeOutputType&&(r.LCHRecipeOutputType=["LCHErrorNotTrimmed"]),e.LCHRecipeOutputType.trim()||(r.LCHRecipeOutputType=["LCHErrorNotFilled"])),(void 0!==e.LCHRecipeCanonicalExampleCallback||t.LCHOptionValidateIfNotPresent)&&"function"!=typeof e.LCHRecipeCanonicalExampleCallback&&(r.LCHRecipeCanonicalExampleCallback=["LCHErrorNotFunction"]),"string"==typeof e.LCHRecipeSignature&&(e.LCHRecipeSignature.trim()?e.LCHRecipeSignature.trim()!==e.LCHRecipeSignature&&(r.LCHRecipeSignature=["LCHErrorNotTrimmed"]):r.LCHRecipeSignature=["LCHErrorNotFilled"]),Object.entries(r).length?r:null},LCHRecipesIsCommand(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");return !!e.LCHRecipeName&&(!e.LCHRecipeInputTypes&&!e.LCHRecipeOutputType)},LCHRecipesIsSubject(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");return !!e.LCHRecipeName&&!!e.LCHRecipeOutputType},LCHRecipesIsAction(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");return !!e.LCHRecipeName&&!!e.LCHRecipeInputTypes},LCHRecipesIsType(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");return "Bool"===e.LCHRecipeOutputType&&(!!e.LCHRecipeCanonicalExampleCallback&&!!e.LCHRecipeSignature)},LCHRecipesIsTask(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");return !!e.LCHRecipeURLFilter&&!0===e.LCHRecipeIsAutomatic},LCHLauncherConvertTypeServiceSearch(e,t){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");return e.filter((function(e){return "object"==typeof e&&null!==e})).map((function(e){return ue().LCHRecipeCallback(e)?{LCHRecipeName:t(e.LCHRecipeName),LCHRecipeInputTypes:"String",LCHRecipeCallback(t){return this.api.fn("LCHSearchWith")(t,e)},_LCHLauncherGenerated:!0}:e}))},LCHRecipesActionTakesObject(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");if(!_t.LCHRecipesIsAction(e))throw new Error("LCHErrorInputNotValid");return !(ae.LCHRuntimeInputTypes(e.LCHRecipeInputTypes).length<2)},LCHRecipesActionTakesParams(e){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");if(!_t.LCHRecipesIsAction(e))throw new Error("LCHErrorInputNotValid");return "Object"===ae.LCHRuntimeInputTypes(e.LCHRecipeInputTypes).pop()},LCHAPITypeEquivalenceMapForRecipes(e){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");const t=[],r=e.filter((function(e){return !_t.LCHRecipesErrors(e)&&(!!_t.LCHRecipesIsType(e)&&(!!e.LCHRecipeCallback(e.LCHRecipeCanonicalExampleCallback())&&(!t.includes(e.LCHRecipeSignature)&&(t.push(e.LCHRecipeSignature),!0))))}));return r.reduce((function(e,t){return e[t.LCHRecipeSignature]=r.filter((function(e){return t===e||!e._LCHRecipeTypeIsExclusive&&(!t._LCHRecipeTypeIsExclusive&&e.LCHRecipeCallback(t.LCHRecipeCanonicalExampleCallback()))})).map((function(e){return e.LCHRecipeSignature})),e}),{})},LCHAPITypeNameMap(e){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");return e.filter((function(e){return !_t.LCHRecipesErrors(e)&&_t.LCHRecipesIsType(e)})).reduce((function(e,t){return e[t.LCHRecipeSignature]||(e[t.LCHRecipeSignature]=t.LCHRecipeName||t.LCHRecipeSignature),e}),{})},LCHAPIActionsForType(e,t){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if(!Array.isArray(t))throw new Error("LCHErrorInputNotValid");return t.filter((function(t){return !_t.LCHRecipesErrors(t)&&(!!_t.LCHRecipesIsAction(t)&&ae.LCHRuntimeInputTypes(t.LCHRecipeInputTypes).shift()===e)}))},LCHAPISubjectsForType(e,t){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");if(!Array.isArray(t))throw new Error("LCHErrorInputNotValid");return t.filter((function(t){return !_t.LCHRecipesErrors(t)&&(!!_t.LCHRecipesIsSubject(t)&&t.LCHRecipeOutputType===e)}))},LCHCompositionErrors(e){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");if(!e.LCHCompositionAction)return {LCHCompositionAction:["LCHErrorInputNotPresent"]};if(!_t.LCHRecipesIsAction(e.LCHCompositionAction))return {LCHCompositionAction:["LCHErrorInputNotValid"]};const t={};return e.LCHCompositionSubjectPrimary?("Command"===e.LCHCompositionAction.LCHRecipeInputTypes&&_t.LCHRecipesIsCommand(e.LCHCompositionSubjectPrimary)||e.LCHCompositionAction.LCHRecipeInputTypes&&!ae.LCHRuntimeInputTypes(e.LCHCompositionAction.LCHRecipeInputTypes).includes(e.LCHCompositionSubjectPrimary.LCHRecipeOutputType)&&(t.LCHCompositionSubjectPrimary=["LCHErrorInputNotValid"]),e.LCHCompositionAction.LCHRecipeInputTypes&&2===ae.LCHRuntimeInputTypes(e.LCHCompositionAction.LCHRecipeInputTypes).length&&!e.LCHCompositionSubjectSecondary&&(t.LCHCompositionSubjectSecondary=["LCHErrorInputNotValid"]),void 0!==e.LCHCompositionSubjectSecondary&&(_t.LCHRecipesIsSubject(e.LCHCompositionSubjectSecondary)||(t.LCHCompositionSubjectSecondary=["LCHErrorInputNotValid"]),e.LCHCompositionAction.LCHRecipeInputTypes&&!ae.LCHRuntimeInputTypes(e.LCHCompositionAction.LCHRecipeInputTypes).includes(e.LCHCompositionSubjectSecondary.LCHRecipeOutputType)&&(t.LCHCompositionSubjectSecondary=["LCHErrorInputNotValid"])),Object.entries(t).length?t:null):{LCHCompositionSubjectPrimary:["LCHErrorInputNotPresent"]}},async LCHAPIExecuteComposition(e,t={}){if(_t.LCHCompositionErrors(e))throw new Error("LCHErrorInputNotValid");if("function"!=typeof t.fn)throw new Error("LCHErrorInputNotValid");return _t.LCHAPIExecuteRecipe(e.LCHCompositionAction,[await _t.LCHAPIExecuteRecipe(e.LCHCompositionSubjectPrimary,[],t)].concat(e.LCHCompositionSubjectSecondary?[await _t.LCHAPIExecuteRecipe(e.LCHCompositionSubjectSecondary,[],t)]:[]),t)},async LCHAPIExecuteRecipe(e,t=[],r={}){if(_t.LCHRecipesErrors(e))throw new Error("LCHErrorInputNotValid");if(!Array.isArray(t))throw new Error("LCHErrorInputNotValid");if("function"!=typeof r.fn)throw new Error("LCHErrorInputNotValid");return e.LCHRecipeStyle&&"undefined"!=typeof document&&(document.body.appendChild(document.createElement("style")).innerHTML=e.LCHRecipeStyle),Promise.resolve(e.LCHRecipeCallback.apply({api:r},t.length?t:void 0))},LCHComponentDescriptorsErrors(e){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");const t={};return "string"!=typeof e.LCHComponentDescriptorName&&(t.LCHComponentDescriptorName=["LCHErrorNotString"]),"string"!=typeof e.LCHComponentDescriptorName||e.LCHComponentDescriptorName||(t.LCHComponentDescriptorName=["LCHErrorNotFilled"]),"string"==typeof e.LCHComponentDescriptorName&&e.LCHComponentDescriptorName.trim()!==e.LCHComponentDescriptorName&&(t.LCHComponentDescriptorName=["LCHErrorNotTrimmed"]),"string"!=typeof e.LCHComponentDescriptorCompletionHandlerSignature&&(t.LCHComponentDescriptorCompletionHandlerSignature=["LCHErrorNotString"]),"string"!=typeof e.LCHComponentDescriptorCompletionHandlerSignature||e.LCHComponentDescriptorCompletionHandlerSignature||(t.LCHComponentDescriptorCompletionHandlerSignature=["LCHErrorNotFilled"]),"string"==typeof e.LCHComponentDescriptorCompletionHandlerSignature&&e.LCHComponentDescriptorCompletionHandlerSignature.trim()!==e.LCHComponentDescriptorCompletionHandlerSignature&&(t.LCHComponentDescriptorCompletionHandlerSignature=["LCHErrorNotTrimmed"]),void 0!==e.LCHComponentDescriptorProps&&("object"==typeof e.LCHComponentDescriptorProps&&null!==e.LCHComponentDescriptorProps||(t.LCHComponentDescriptorProps=["LCHErrorNotObject"])),Object.entries(t).length?t:null},LCHRuntimeFilteredRecipes(e,t){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");if("string"!=typeof t)throw new Error("LCHErrorInputNotValid");return e.filter((function(e){return !_t.LCHRecipesErrors(e)&&(void 0===e.LCHRecipeURLFilter||ae.LCHRuntimeURLFilter(e.LCHRecipeURLFilter,t))}))},LCHRuntimeFilteredTasks(e){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");return e.filter((function(e){return !!_t.LCHRecipesIsTask(e)&&(!e.LCHRecipeIsExcluded||!e.LCHRecipeIsExcluded())}))},LCHAPIRunTasks(){const e=_t.LCHRuntimeFilteredRecipes.apply(null,[...arguments]),t=ae.LCHRuntimeAPI(wt().concat(e));return Promise.all(_t.LCHRuntimeFilteredTasks(e).map((function(e){return _t.LCHAPIExecuteRecipe(e,[],t)})))},LCHRecipeProxyErrors(e,t={}){if("object"!=typeof e||null===e)return {};const r={};return "string"!=typeof e.LCHRecipeProxyName&&(r.LCHRecipeProxyName=["LCHErrorNotString"]),"string"!=typeof e.LCHRecipeProxySignature&&(r.LCHRecipeProxySignature=["LCHErrorNotString"]),Object.entries(r).length?r:null}},xt={LCHLauncherOptions(e,t=function(){}){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");if(void 0===e.LCHOptionRecipes&&(e.LCHOptionRecipes=[]),!Array.isArray(e.LCHOptionRecipes))throw new Error("LCHOptionRecipesNotArray");if(e.LCHOptionRecipes=e.LCHOptionRecipes.filter((function(e){const r=_t.LCHRecipesErrors(e);return r&&t("LCHOptionRecipesItemNotValid",e,r),!r})),void 0===e.LCHOptionMode&&(e.LCHOptionMode=xt.LCHLauncherModes().shift()),void 0!==e.LCHOptionMode&&!xt.LCHLauncherModes().includes(e.LCHOptionMode))throw new Error("LCHOptionModeNotValid");if(void 0!==e.LCHOptionCompletionHandler&&"function"!=typeof e.LCHOptionCompletionHandler)throw new Error("LCHOptionCompletionHandlerNotFunction");if(void 0===e.LCHOptionLanguage&&(e.LCHOptionLanguage="en"),"string"!=typeof e.LCHOptionLanguage)throw new Error("LCHOptionLanguageNotString");return e},LCHLauncherModeCommit:()=>"kLCHLauncherModeCommit",LCHLauncherModePreview:()=>"kLCHLauncherModePreview",LCHLauncherModePipe:()=>"kLCHLauncherModePipe",LCHLauncherModeTask:()=>"kLCHLauncherModeTask",LCHLauncherModes:()=>[xt.LCHLauncherModeCommit(),xt.LCHLauncherModePreview(),xt.LCHLauncherModePipe(),xt.LCHLauncherModeTask()],LCHLauncherUIRecipesForMode(e,t){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");if(!xt.LCHLauncherModes().includes(t))throw new Error("LCHErrorInputNotValid");return e.filter((function(e){return "object"==typeof e&&null!==e&&(!("string"==typeof e.LCHRecipeInputTypes&&e.LCHRecipeInputTypes.split(",").length>2)&&(t===xt.LCHLauncherModeCommit()?_t.LCHRecipesIsCommand(e):t!==xt.LCHLauncherModePreview()||_t.LCHRecipesIsCommand(e)))}))},LCHLauncherThrottleDuration:ne()?25:1e3,LCHLauncherKeyboardEventIsTextInput(e){if("object"!=typeof e||null===e)throw new Error("LCHErrorInputNotValid");return ![e.metaKey,e.shiftKey,e.ctrlKey,e.altKey].includes(!0)&&(!!e.key&&!["Unidentified","Tab","CapsLock","ArrowRight","ArrowLeft","Backspace","\\",".",","," "].includes(e.key))},LCHLauncherActionComparator(e){if("string"!=typeof e)throw new Error("LCHErrorInputNotValid");return function(t,r){const o=[t.LCHRecipeInputTypes.split(",")[0],r.LCHRecipeInputTypes.split(",")[0]],n=[t.LCHRecipeInputTypes.split(",")[1],r.LCHRecipeInputTypes.split(",")[1]];if(o[0]===e&&o[1]===e){if(!n[0]&&n[1])return -1;if(n[0]&&!n[1])return 1}return o[0]===e&&o[1]!==e?-1:1}},LCHLauncherConstrainIndex(e,t){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");if("number"!=typeof t)throw new Error("LCHErrorInputNotValid");return t<0?e.length-1:t>=e.length?0:t},LCHLauncherReloadableSubjects(e){if(!Array.isArray(e))throw new Error("LCHErrorInputNotValid");return [].concat.apply([],e).filter((function(e){return "object"==typeof e&&null!==e&&(!_t.LCHRecipesErrors(e)&&!!_t.LCHRecipesIsSubject(e))}))}};var Vt=oe((function(t,r){!function(t){const r={OLSKInternationalDefaultIdentifier:()=>"i18n",OLSKInternationalIsTranslationFileBasename:e=>"string"==typeof e&&!!e.split(".").pop().match(/ya?ml/i)&&e.split(".").shift()===r.OLSKInternationalDefaultIdentifier()&&!!r._OLSKInternationalLanguageID(e),OLSKInternationalLanguageID(e){if(!r.OLSKInternationalIsTranslationFileBasename(e))throw new Error("OLSKErrorInputNotValid");return r._OLSKInternationalLanguageID(e)},OLSKInternationalSimplifiedLanguageCode(e){if("string"!=typeof e)throw new Error("OLSKErrorInputNotValid");return e.split("-").shift()},_OLSKInternationalLanguageID(e){var t=e.split(".");return t.pop(),t.shift(),t.pop()},OLSKInternationalLocalizedString(e,t){if("object"!=typeof t||null===t)throw new Error("OLSKErrorInputNotValid");var r=t[e];return r||(r="TRANSLATION_MISSING",console.log([r,e])),r},OLSKInternationalLocalizedStringCallback(e,t){if("object"!=typeof e||null===e)throw new Error("OLSKErrorInputNotValid");if(!Array.isArray(t))throw new Error("OLSKErrorInputNotValid");const o=Object.keys(e).reverse().concat(...t.map((function(e){return [r.OLSKInternationalSimplifiedLanguageCode(e),e]})).reverse());return function(t,n){if(!Array.isArray(n))throw new Error("OLSKErrorInputNotValid");let i,a=o.concat(...n.map((function(e){return [r.OLSKInternationalSimplifiedLanguageCode(e),e]})).reverse(),[]);for(;!i&&a.length;)i=(e[a.pop()]||{})[t];return i||console.log([i="TRANSLATION_MISSING",t].join(" ")),i}},_OLSKInternationalPaths(e,t){if("string"!=typeof e||!e.trim())throw new Error("OLSKErrorInputNotValid");const o=te;return o().sync(`**/*${r.OLSKInternationalDefaultIdentifier()}*.y*(a)ml`,{cwd:e,realpath:!0}).filter((function(e){return !t||!e.match(t)})).filter((function(e){return r.OLSKInternationalIsTranslationFileBasename(o().basename(e))}))},_OLSKInternationalConstructedDictionary(e){if(!Array.isArray(e))throw new Error("OLSKErrorInputNotValid");const t=te;return e.reduce((function(e,o){const n=r.OLSKInternationalLanguageID(t().basename(o));return e[n]=Object.assign(e[n]||{},t().load(t().readFileSync(o,"utf8"))),e}),{})},OLSKInternationalDictionary(e){return this._OLSKInternationalConstructedDictionary(this._OLSKInternationalPaths(e))},_OLSKInternationalCompilationObject(e,t){const o=te;return this._OLSKInternationalPaths(e,/node_modules|__external/).filter((function(e){return !t||r.OLSKInternationalLanguageID(o().basename(e))===t})).reduce((function(e,t){return Object.assign(e,{[t]:o().load(o().readFileSync(t,"utf8"))})}),{})},_OLSKInternationalCompilationFilePath(e){if("string"!=typeof e||!e.trim())throw new Error("OLSKErrorInputNotValid");return te().join(e,"__compiled",r.OLSKInternationalDefaultIdentifier()+"-compilation.yml")},_SafeDump:e=>te().safeDump(e,{lineWidth:1/0}),OLSKInternationalWriteCompilationFile(e,t){const o=te,n=r._SafeDump(this._OLSKInternationalCompilationObject(e,t)),i=o().dirname(r._OLSKInternationalCompilationFilePath(e));o().existsSync(i)||o().mkdirSync(i),o().writeFileSync(r._OLSKInternationalCompilationFilePath(e),n);},OLSKInternationalSpreadCompilationFile(e,t){if("string"!=typeof e||!e.trim())throw new Error("OLSKErrorInputNotValid");const o=te,n=o().load(o().readFileSync(r._OLSKInternationalCompilationFilePath(e),"utf8"));Object.keys(n).map((function(e){return o().writeFileSync(e,r._SafeDump(n[e]))}));},OLSKInternationalAddControllerLanguageCode(t,r){if("string"!=typeof t||!t.trim())throw new Error("OLSKErrorInputNotValid");if("string"!=typeof r||!r.trim())throw new Error("OLSKErrorInputNotValid");const o=te;o().sync("controller.js",{cwd:t,matchBase:!0,realpath:!0}).forEach((function(t){if(t.match(/.*(\.git|DS_Store|node_modules|vendor|__\w+)\/.*/i))return;const n=o();if("function"!=typeof n.OLSKControllerRoutes)return;if(!(i=n.OLSKControllerRoutes(),Array.isArray(i)?i:Object.entries(i).reduce((function(e,t){return e.concat(Object.assign(t[1],{OLSKRouteSignature:t[0]}))}),[])).filter((function(e){return e.OLSKRouteLanguageCodes})).filter((function(e){return !e.OLSKRouteLanguageCodes.includes(r)})).length)return;var i;const a=o().readFileSync(t,"utf8").match(/OLSKRouteLanguageCodes: \[.*\]/g);if(!a)throw new Error("invalid OLSKRouteLanguageCodes syntax in "+e);a.map((function(e){const n=e.match(/\[.*\]/);return o().writeFileSync(t,o().readFileSync(t,"utf8").replace(/OLSKRouteLanguageCodes: \[.*\]/,`OLSKRouteLanguageCodes: ['${JSON.parse(n[0].replace(/\'/g,'"')).concat(r).join("', '")}']`))}));})),process.argv[2].endsWith("olsk-i18n-add")&&process.exit();}};Object.assign(t,r),Object.defineProperty(t,"__esModule",{value:!0});}(r),r.OLSKLocalized=function(e){return r.OLSKInternationalLocalizedString(e,JSON.parse('{"en":{"LCHLauncherInputPlaceholderDefault":"Type to search","LCHLauncherInputPlaceholderPreview":"Type to filter","LCHLauncherSubjectPromptPlaceholderText":"Type to search","LCHLauncherSubjectPromptHeadingText":"Subject","LCHLauncherActionPromptHeadingText":"Action","LCHLauncherObjectPromptHeadingText":"Object","LCHCopyToClipboardButtonText":"Copy to clipboard","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Active Document Focus Elements","LCHCopyToClipboard":"Copy to clipboard","LCHLargeText":"Large text","LCHDOMElementFocus":"Focus","LCHRunCommand":"Run Command","LCHSearchWith":"Search With","LCHSearchFor":"Search For","LCHSubjectContainerShowContents":"Show Contents","LCHURLOpen":"Open URL","SubjectContainer":"Subject Container","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Search Service URL Template","DOMElement":"DOM Element"}},"es":{"LCHLauncherInputPlaceholderDefault":"Escribir para buscar","LCHLauncherInputPlaceholderPreview":"Escribir para filtrar","LCHLauncherSubjectPromptPlaceholderText":"Escribir para buscar","LCHLauncherSubjectPromptHeadingText":"Sujeto","LCHLauncherActionPromptHeadingText":"Acto","LCHLauncherObjectPromptHeadingText":"Objeto","LCHCopyToClipboardButtonText":"Copiar al portapapeles","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Elementos enfocados del documento activo","LCHCopyToClipboard":"Copiar al portapapeles","LCHLargeText":"Texto aumentado","LCHDOMElementFocus":"Enfocar","LCHRunCommand":"Ejecutar comando","LCHSearchWith":"Buscar con","LCHSearchFor":"Buscar para","LCHSubjectContainerShowContents":"Mostrar contenidos","LCHURLOpen":"Abrir URL","SubjectContainer":"Contenido de sujetos","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Plantilla URL de servicio de búsqueda","DOMElement":"Elemento DOM"}},"fr":{"LCHLauncherInputPlaceholderDefault":"Taper pour chercher","LCHLauncherInputPlaceholderPreview":"Taper pour filtrer","LCHLauncherSubjectPromptPlaceholderText":"Taper pour chercher","LCHLauncherSubjectPromptHeadingText":"Sujet","LCHLauncherActionPromptHeadingText":"Action","LCHLauncherObjectPromptHeadingText":"Objet","LCHCopyToClipboardButtonText":"Copier dans le presse-papier","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Éléments au points du document active","LCHCopyToClipboard":"Copier dans le presse-papier","LCHLargeText":"Texte élargi","LCHDOMElementFocus":"Faire le point","LCHRunCommand":"Exécuter la commande","LCHSearchWith":"Chercher avec","LCHSearchFor":"Chercher pour","LCHSubjectContainerShowContents":"Montrer le contenu","LCHURLOpen":"Ouvrir l\'URL","SubjectContainer":"Contenant des sujets","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Modèle URL de service de recherche","DOMElement":"Élément DOM"}},"pt":{"LCHLauncherInputPlaceholderDefault":"Digitar para pesquisar","LCHLauncherInputPlaceholderPreview":"Digitar para filtrar","LCHLauncherSubjectPromptPlaceholderText":"Digitar para pesquisar","LCHLauncherSubjectPromptHeadingText":"Sujeito","LCHLauncherActionPromptHeadingText":"Ação","LCHLauncherObjectPromptHeadingText":"Objeto","LCHCopyToClipboardButtonText":"Cópia na área de transferência","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Elementos de foco no documento ativo","LCHCopyToClipboard":"Cópia na área de transferência","LCHLargeText":"Texto grande","LCHDOMElementFocus":"Foco","LCHRunCommand":"Executar Comando","LCHSearchWith":"Buscar com","LCHSearchFor":"Buscar por","LCHSubjectContainerShowContents":"Mostrar conteúdo","LCHURLOpen":"Abrir URL","SubjectContainer":"Contêiner do Sujeito","String":"Sequência","Date":"Data","URL":"URL","ServiceSearchURLTemplate":"Modelo de URL do serviço de pesquisa","DOMElement":"Elemento do DOM"}}}')[window.OLSKPublicConstants("OLSKSharedPageCurrentLanguage")])};})),jt=re(Vt),At=(Vt.OLSKLocalized,oe((function(e){var t,r;t=ee,r=function(){var e="undefined"==typeof window,t=new Map,r=new Map,o=[];o.total=0;var n=[],i=[];function a(){t.clear(),r.clear(),n=[],i=[];}function c(e){for(var t=-9007199254740991,r=e.length-1;r>=0;--r){var o=e[r];if(null!==o){var n=o.score;n>t&&(t=n);}}return -9007199254740991===t?null:t}function l(e,t){var r=e[t];if(void 0!==r)return r;var o=t;Array.isArray(t)||(o=t.split("."));for(var n=o.length,i=-1;e&&++i<n;)e=e[o[i]];return e}function u(e){return "object"==typeof e}var p=function(){var e=[],t=0,r={};function o(){for(var r=0,o=e[r],n=1;n<t;){var i=n+1;r=n,i<t&&e[i].score<e[n].score&&(r=i),e[r-1>>1]=e[r],n=1+(r<<1);}for(var a=r-1>>1;r>0&&o.score<e[a].score;a=(r=a)-1>>1)e[r]=e[a];e[r]=o;}return r.add=function(r){var o=t;e[t++]=r;for(var n=o-1>>1;o>0&&r.score<e[n].score;n=(o=n)-1>>1)e[o]=e[n];e[o]=r;},r.poll=function(){if(0!==t){var r=e[0];return e[0]=e[--t],o(),r}},r.peek=function(r){if(0!==t)return e[0]},r.replaceTop=function(t){e[0]=t,o();},r},s=p();return function L(C){var m={single:function(e,t,r){return e?(u(e)||(e=m.getPreparedSearch(e)),t?(u(t)||(t=m.getPrepared(t)),((r&&void 0!==r.allowTypo?r.allowTypo:!C||void 0===C.allowTypo||C.allowTypo)?m.algorithm:m.algorithmNoTypo)(e,t,e[0])):null):null},go:function(e,t,r){if(!e)return o;var n=(e=m.prepareSearch(e))[0],i=r&&r.threshold||C&&C.threshold||-9007199254740991,a=r&&r.limit||C&&C.limit||9007199254740991,p=(r&&void 0!==r.allowTypo?r.allowTypo:!C||void 0===C.allowTypo||C.allowTypo)?m.algorithm:m.algorithmNoTypo,L=0,d=0,f=t.length;if(r&&r.keys)for(var H=r.scoreFn||c,h=r.keys,b=h.length,y=f-1;y>=0;--y){for(var S=t[y],P=new Array(b),g=b-1;g>=0;--g)(O=l(S,I=h[g]))?(u(O)||(O=m.getPrepared(O)),P[g]=p(e,O,n)):P[g]=null;P.obj=S;var R=H(P);null!==R&&(R<i||(P.score=R,L<a?(s.add(P),++L):(++d,R>s.peek().score&&s.replaceTop(P))));}else if(r&&r.key){var I=r.key;for(y=f-1;y>=0;--y)(O=l(S=t[y],I))&&(u(O)||(O=m.getPrepared(O)),null!==(v=p(e,O,n))&&(v.score<i||(v={target:v.target,_targetLowerCodes:null,_nextBeginningIndexes:null,score:v.score,indexes:v.indexes,obj:S},L<a?(s.add(v),++L):(++d,v.score>s.peek().score&&s.replaceTop(v)))));}else for(y=f-1;y>=0;--y){var O,v;(O=t[y])&&(u(O)||(O=m.getPrepared(O)),null!==(v=p(e,O,n))&&(v.score<i||(L<a?(s.add(v),++L):(++d,v.score>s.peek().score&&s.replaceTop(v)))));}if(0===L)return o;var T=new Array(L);for(y=L-1;y>=0;--y)T[y]=s.poll();return T.total=L+d,T},goAsync:function(t,r,n){var i=!1,a=new Promise((function(a,s){if(!t)return a(o);var L=(t=m.prepareSearch(t))[0],d=p(),f=r.length-1,H=n&&n.threshold||C&&C.threshold||-9007199254740991,h=n&&n.limit||C&&C.limit||9007199254740991,b=(n&&void 0!==n.allowTypo?n.allowTypo:!C||void 0===C.allowTypo||C.allowTypo)?m.algorithm:m.algorithmNoTypo,y=0,S=0;function P(){if(i)return s("canceled");var p=Date.now();if(n&&n.keys)for(var C=n.scoreFn||c,g=n.keys,R=g.length;f>=0;--f){for(var I=r[f],O=new Array(R),v=R-1;v>=0;--v)(w=l(I,E=g[v]))?(u(w)||(w=m.getPrepared(w)),O[v]=b(t,w,L)):O[v]=null;O.obj=I;var T=C(O);if(null!==T&&!(T<H)&&(O.score=T,y<h?(d.add(O),++y):(++S,T>d.peek().score&&d.replaceTop(O)),f%1e3==0&&Date.now()-p>=10))return void(e?setImmediate(P):setTimeout(P))}else if(n&&n.key){for(var E=n.key;f>=0;--f)if((w=l(I=r[f],E))&&(u(w)||(w=m.getPrepared(w)),null!==(_=b(t,w,L))&&!(_.score<H)&&(_={target:_.target,_targetLowerCodes:null,_nextBeginningIndexes:null,score:_.score,indexes:_.indexes,obj:I},y<h?(d.add(_),++y):(++S,_.score>d.peek().score&&d.replaceTop(_)),f%1e3==0&&Date.now()-p>=10)))return void(e?setImmediate(P):setTimeout(P))}else for(;f>=0;--f){var w,_;if((w=r[f])&&(u(w)||(w=m.getPrepared(w)),null!==(_=b(t,w,L))&&!(_.score<H)&&(y<h?(d.add(_),++y):(++S,_.score>d.peek().score&&d.replaceTop(_)),f%1e3==0&&Date.now()-p>=10)))return void(e?setImmediate(P):setTimeout(P))}if(0===y)return a(o);for(var x=new Array(y),V=y-1;V>=0;--V)x[V]=d.poll();x.total=y+S,a(x);}e?setImmediate(P):P();}));return a.cancel=function(){i=!0;},a},highlight:function(e,t,r){if(null===e)return null;void 0===t&&(t="<b>"),void 0===r&&(r="</b>");for(var o="",n=0,i=!1,a=e.target,c=a.length,l=e.indexes,u=0;u<c;++u){var p=a[u];if(l[n]===u){if(i||(i=!0,o+=t),++n===l.length){o+=p+r+a.substr(u+1);break}}else i&&(i=!1,o+=r);o+=p;}return o},prepare:function(e){if(e)return {target:e,_targetLowerCodes:m.prepareLowerCodes(e),_nextBeginningIndexes:null,score:null,indexes:null,obj:null}},prepareSlow:function(e){if(e)return {target:e,_targetLowerCodes:m.prepareLowerCodes(e),_nextBeginningIndexes:m.prepareNextBeginningIndexes(e),score:null,indexes:null,obj:null}},prepareSearch:function(e){if(e)return m.prepareLowerCodes(e)},getPrepared:function(e){if(e.length>999)return m.prepare(e);var r=t.get(e);return void 0!==r||(r=m.prepare(e),t.set(e,r)),r},getPreparedSearch:function(e){if(e.length>999)return m.prepareSearch(e);var t=r.get(e);return void 0!==t||(t=m.prepareSearch(e),r.set(e,t)),t},algorithm:function(e,t,r){for(var o=t._targetLowerCodes,a=e.length,c=o.length,l=0,u=0,p=0,s=0;;){if(r===o[u]){if(n[s++]=u,++l===a)break;r=e[0===p?l:p===l?l+1:p===l-1?l-1:l];}if(++u>=c)for(;;){if(l<=1)return null;if(0===p){if(r===e[--l])continue;p=l;}else {if(1===p)return null;if((r=e[1+(l=--p)])===e[l])continue}u=n[(s=l)-1]+1;break}}l=0;var L=0,C=!1,d=0,f=t._nextBeginningIndexes;null===f&&(f=t._nextBeginningIndexes=m.prepareNextBeginningIndexes(t.target));var H=u=0===n[0]?0:f[n[0]-1];if(u!==c)for(;;)if(u>=c){if(l<=0){if(++L>a-2)break;if(e[L]===e[L+1])continue;u=H;continue}--l,u=f[i[--d]];}else if(e[0===L?l:L===l?l+1:L===l-1?l-1:l]===o[u]){if(i[d++]=u,++l===a){C=!0;break}++u;}else u=f[u];if(C)var h=i,b=d;else h=n,b=s;for(var y=0,S=-1,P=0;P<a;++P)S!==(u=h[P])-1&&(y-=u),S=u;for(C?0!==L&&(y+=-20):(y*=1e3,0!==p&&(y+=-20)),y-=c-a,t.score=y,t.indexes=new Array(b),P=b-1;P>=0;--P)t.indexes[P]=h[P];return t},algorithmNoTypo:function(e,t,r){for(var o=t._targetLowerCodes,a=e.length,c=o.length,l=0,u=0,p=0;;){if(r===o[u]){if(n[p++]=u,++l===a)break;r=e[l];}if(++u>=c)return null}l=0;var s=!1,L=0,C=t._nextBeginningIndexes;if(null===C&&(C=t._nextBeginningIndexes=m.prepareNextBeginningIndexes(t.target)),(u=0===n[0]?0:C[n[0]-1])!==c)for(;;)if(u>=c){if(l<=0)break;--l,u=C[i[--L]];}else if(e[l]===o[u]){if(i[L++]=u,++l===a){s=!0;break}++u;}else u=C[u];if(s)var d=i,f=L;else d=n,f=p;for(var H=0,h=-1,b=0;b<a;++b)h!==(u=d[b])-1&&(H-=u),h=u;for(s||(H*=1e3),H-=c-a,t.score=H,t.indexes=new Array(f),b=f-1;b>=0;--b)t.indexes[b]=d[b];return t},prepareLowerCodes:function(e){for(var t=e.length,r=[],o=e.toLowerCase(),n=0;n<t;++n)r[n]=o.charCodeAt(n);return r},prepareBeginningIndexes:function(e){for(var t=e.length,r=[],o=0,n=!1,i=!1,a=0;a<t;++a){var c=e.charCodeAt(a),l=c>=65&&c<=90,u=l||c>=97&&c<=122||c>=48&&c<=57,p=l&&!n||!i||!u;n=l,i=u,p&&(r[o++]=a);}return r},prepareNextBeginningIndexes:function(e){for(var t=e.length,r=m.prepareBeginningIndexes(e),o=[],n=r[0],i=0,a=0;a<t;++a)n>a?o[a]=n:(n=r[++i],o[a]=void 0===n?t:n);return o},cleanup:a,new:L};return m}()},e.exports?e.exports=r():t.fuzzysort=r();}))),kt=oe((function(e,t){const r={OLSKThrottleIsValid:e=>"object"==typeof e&&null!==e&&("function"==typeof e.OLSKThrottleCallback&&"number"==typeof e.OLSKThrottleDuration),OLSKThrottleTimeoutFor(e){if(!r.OLSKThrottleIsValid(e))throw new Error("OLSKErrorInputNotValid");return e._OLSKThrottleTimeoutID&&clearTimeout(e._OLSKThrottleTimeoutID),e._OLSKThrottleTimeoutID=setTimeout((function(){r._OLSKThrottleFire(e);}),e.OLSKThrottleDuration),e._OLSKThrottleTimeoutID},OLSKThrottleSkip(e){if(!r.OLSKThrottleIsValid(e))throw new Error("OLSKErrorInputNotValid");return clearTimeout(e._OLSKThrottleTimeoutID),r._OLSKThrottleFire(e)},_OLSKThrottleFire:e=>(delete e._OLSKThrottleTimeoutID,e.OLSKThrottleCallback()),OLSKThrottleMappedTimeout(e,t,o){if("object"!=typeof e||null===e)throw new Error("OLSKErrorInputNotValid");if("string"!=typeof t)throw new Error("OLSKErrorInputNotValid");if(!r.OLSKThrottleIsValid(o))throw new Error("OLSKErrorInputNotValid");return e[t]||(e[t]=Object.assign(Object.assign({},o),{OLSKThrottleCallback(){r._OLSKThrottleFire(o),delete e[t];}})),o._OLSKThrottleTimeoutID=r.OLSKThrottleTimeoutFor(e[t])}};Object.assign(t,r);})),Dt=re(oe((function(e,t){
	/*!
	     * clipboard.js v2.0.6
	     * https://clipboardjs.com/
	     * 
	     * Licensed MIT © Zeno Rocha
	     */
	var r;r=function(){return function(e){var t={};function r(o){if(t[o])return t[o].exports;var n=t[o]={i:o,l:!1,exports:{}};return e[o].call(n.exports,n,n.exports,r),n.l=!0,n.exports}return r.m=e,r.c=t,r.d=function(e,t,o){r.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:o});},r.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0});},r.t=function(e,t){if(1&t&&(e=r(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var o=Object.create(null);if(r.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var n in e)r.d(o,n,function(t){return e[t]}.bind(null,n));return o},r.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return r.d(t,"a",t),t},r.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},r.p="",r(r.s=6)}([function(e,t){e.exports=function(e){var t;if("SELECT"===e.nodeName)e.focus(),t=e.value;else if("INPUT"===e.nodeName||"TEXTAREA"===e.nodeName){var r=e.hasAttribute("readonly");r||e.setAttribute("readonly",""),e.select(),e.setSelectionRange(0,e.value.length),r||e.removeAttribute("readonly"),t=e.value;}else {e.hasAttribute("contenteditable")&&e.focus();var o=window.getSelection(),n=document.createRange();n.selectNodeContents(e),o.removeAllRanges(),o.addRange(n),t=o.toString();}return t};},function(e,t){function r(){}r.prototype={on:function(e,t,r){var o=this.e||(this.e={});return (o[e]||(o[e]=[])).push({fn:t,ctx:r}),this},once:function(e,t,r){var o=this;function n(){o.off(e,n),t.apply(r,arguments);}return n._=t,this.on(e,n,r)},emit:function(e){for(var t=[].slice.call(arguments,1),r=((this.e||(this.e={}))[e]||[]).slice(),o=0,n=r.length;o<n;o++)r[o].fn.apply(r[o].ctx,t);return this},off:function(e,t){var r=this.e||(this.e={}),o=r[e],n=[];if(o&&t)for(var i=0,a=o.length;i<a;i++)o[i].fn!==t&&o[i].fn._!==t&&n.push(o[i]);return n.length?r[e]=n:delete r[e],this}},e.exports=r,e.exports.TinyEmitter=r;},function(e,t,r){var o=r(3),n=r(4);e.exports=function(e,t,r){if(!e&&!t&&!r)throw new Error("Missing required arguments");if(!o.string(t))throw new TypeError("Second argument must be a String");if(!o.fn(r))throw new TypeError("Third argument must be a Function");if(o.node(e))return function(e,t,r){return e.addEventListener(t,r),{destroy:function(){e.removeEventListener(t,r);}}}(e,t,r);if(o.nodeList(e))return function(e,t,r){return Array.prototype.forEach.call(e,(function(e){e.addEventListener(t,r);})),{destroy:function(){Array.prototype.forEach.call(e,(function(e){e.removeEventListener(t,r);}));}}}(e,t,r);if(o.string(e))return function(e,t,r){return n(document.body,e,t,r)}(e,t,r);throw new TypeError("First argument must be a String, HTMLElement, HTMLCollection, or NodeList")};},function(e,t){t.node=function(e){return void 0!==e&&e instanceof HTMLElement&&1===e.nodeType},t.nodeList=function(e){var r=Object.prototype.toString.call(e);return void 0!==e&&("[object NodeList]"===r||"[object HTMLCollection]"===r)&&"length"in e&&(0===e.length||t.node(e[0]))},t.string=function(e){return "string"==typeof e||e instanceof String},t.fn=function(e){return "[object Function]"===Object.prototype.toString.call(e)};},function(e,t,r){var o=r(5);function n(e,t,r,o,n){var a=i.apply(this,arguments);return e.addEventListener(r,a,n),{destroy:function(){e.removeEventListener(r,a,n);}}}function i(e,t,r,n){return function(r){r.delegateTarget=o(r.target,t),r.delegateTarget&&n.call(e,r);}}e.exports=function(e,t,r,o,i){return "function"==typeof e.addEventListener?n.apply(null,arguments):"function"==typeof r?n.bind(null,document).apply(null,arguments):("string"==typeof e&&(e=document.querySelectorAll(e)),Array.prototype.map.call(e,(function(e){return n(e,t,r,o,i)})))};},function(e,t){if("undefined"!=typeof Element&&!Element.prototype.matches){var r=Element.prototype;r.matches=r.matchesSelector||r.mozMatchesSelector||r.msMatchesSelector||r.oMatchesSelector||r.webkitMatchesSelector;}e.exports=function(e,t){for(;e&&9!==e.nodeType;){if("function"==typeof e.matches&&e.matches(t))return e;e=e.parentNode;}};},function(e,t,r){r.r(t);var o=r(0),n=r.n(o),i="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},a=function(){function e(e,t){for(var r=0;r<t.length;r++){var o=t[r];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,r,o){return r&&e(t.prototype,r),o&&e(t,o),t}}(),c=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.resolveOptions(t),this.initSelection();}return a(e,[{key:"resolveOptions",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this.action=e.action,this.container=e.container,this.emitter=e.emitter,this.target=e.target,this.text=e.text,this.trigger=e.trigger,this.selectedText="";}},{key:"initSelection",value:function(){this.text?this.selectFake():this.target&&this.selectTarget();}},{key:"selectFake",value:function(){var e=this,t="rtl"==document.documentElement.getAttribute("dir");this.removeFake(),this.fakeHandlerCallback=function(){return e.removeFake()},this.fakeHandler=this.container.addEventListener("click",this.fakeHandlerCallback)||!0,this.fakeElem=document.createElement("textarea"),this.fakeElem.style.fontSize="12pt",this.fakeElem.style.border="0",this.fakeElem.style.padding="0",this.fakeElem.style.margin="0",this.fakeElem.style.position="absolute",this.fakeElem.style[t?"right":"left"]="-9999px";var r=window.pageYOffset||document.documentElement.scrollTop;this.fakeElem.style.top=r+"px",this.fakeElem.setAttribute("readonly",""),this.fakeElem.value=this.text,this.container.appendChild(this.fakeElem),this.selectedText=n()(this.fakeElem),this.copyText();}},{key:"removeFake",value:function(){this.fakeHandler&&(this.container.removeEventListener("click",this.fakeHandlerCallback),this.fakeHandler=null,this.fakeHandlerCallback=null),this.fakeElem&&(this.container.removeChild(this.fakeElem),this.fakeElem=null);}},{key:"selectTarget",value:function(){this.selectedText=n()(this.target),this.copyText();}},{key:"copyText",value:function(){var e=void 0;try{e=document.execCommand(this.action);}catch(t){e=!1;}this.handleResult(e);}},{key:"handleResult",value:function(e){this.emitter.emit(e?"success":"error",{action:this.action,text:this.selectedText,trigger:this.trigger,clearSelection:this.clearSelection.bind(this)});}},{key:"clearSelection",value:function(){this.trigger&&this.trigger.focus(),document.activeElement.blur(),window.getSelection().removeAllRanges();}},{key:"destroy",value:function(){this.removeFake();}},{key:"action",set:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:"copy";if(this._action=e,"copy"!==this._action&&"cut"!==this._action)throw new Error('Invalid "action" value, use either "copy" or "cut"')},get:function(){return this._action}},{key:"target",set:function(e){if(void 0!==e){if(!e||"object"!==(void 0===e?"undefined":i(e))||1!==e.nodeType)throw new Error('Invalid "target" value, use a valid Element');if("copy"===this.action&&e.hasAttribute("disabled"))throw new Error('Invalid "target" attribute. Please use "readonly" instead of "disabled" attribute');if("cut"===this.action&&(e.hasAttribute("readonly")||e.hasAttribute("disabled")))throw new Error('Invalid "target" attribute. You can\'t cut text from elements with "readonly" or "disabled" attributes');this._target=e;}},get:function(){return this._target}}]),e}(),l=r(1),u=r.n(l),p=r(2),s=r.n(p),L="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},C=function(){function e(e,t){for(var r=0;r<t.length;r++){var o=t[r];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,r,o){return r&&e(t.prototype,r),o&&e(t,o),t}}(),m=function(e){function t(e,r){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,t);var o=function(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}(this,(t.__proto__||Object.getPrototypeOf(t)).call(this));return o.resolveOptions(r),o.listenClick(e),o}return function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}(t,e),C(t,[{key:"resolveOptions",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};this.action="function"==typeof e.action?e.action:this.defaultAction,this.target="function"==typeof e.target?e.target:this.defaultTarget,this.text="function"==typeof e.text?e.text:this.defaultText,this.container="object"===L(e.container)?e.container:document.body;}},{key:"listenClick",value:function(e){var t=this;this.listener=s()(e,"click",(function(e){return t.onClick(e)}));}},{key:"onClick",value:function(e){var t=e.delegateTarget||e.currentTarget;this.clipboardAction&&(this.clipboardAction=null),this.clipboardAction=new c({action:this.action(t),target:this.target(t),text:this.text(t),container:this.container,trigger:t,emitter:this});}},{key:"defaultAction",value:function(e){return d("action",e)}},{key:"defaultTarget",value:function(e){var t=d("target",e);if(t)return document.querySelector(t)}},{key:"defaultText",value:function(e){return d("text",e)}},{key:"destroy",value:function(){this.listener.destroy(),this.clipboardAction&&(this.clipboardAction.destroy(),this.clipboardAction=null);}}],[{key:"isSupported",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:["copy","cut"],t="string"==typeof e?[e]:e,r=!!document.queryCommandSupported;return t.forEach((function(e){r=r&&!!document.queryCommandSupported(e);})),r}}]),t}(u.a);function d(e,t){var r="data-clipboard-"+e;if(t.hasAttribute(r))return t.getAttribute(r)}t.default=m;}]).default},e.exports=r();})));function Nt(e){let r,o,n=e[1]("LCHCopyToClipboardButtonText")+"";return {c(){r=f("button"),o=H(n),S(r,"class","LCHCopyToClipboardButton"),S(r,"data-clipboard-text",e[0]);},m(t,n){C(t,r,n),L(r,o),e[4](r);},p(e,[t]){2&t&&n!==(n=e[1]("LCHCopyToClipboardButtonText")+"")&&P(o,n),1&t&&S(r,"data-clipboard-text",e[0]);},i:t,o:t,d(t){t&&m(r),e[4](null);}}}function Ft(e,t,r){let o,n,{inputData:i}=t,{LCHCopyToClipboardCompletionHandler:a}=t,{OLSKLocalized:c}=t,l=!1;function u(){l||(n.destroy(),a(),l=!0);}return T((function(){n=new Dt(o),n.on("success",(function(e){u();})),n.on("error",(function(e){u();})),o.addEventListener("click",(function(e){u();})),o.focus(),ne()||o.click();})),e.$$set=e=>{"inputData"in e&&r(0,i=e.inputData),"LCHCopyToClipboardCompletionHandler"in e&&r(3,a=e.LCHCopyToClipboardCompletionHandler),"OLSKLocalized"in e&&r(1,c=e.OLSKLocalized);},[i,c,o,a,function(e){_[e?"unshift":"push"]((()=>{o=e,r(2,o);}));}]}const Mt=class extends Q{constructor(e){super(),Y(this,e,Ft,Nt,c,{inputData:0,LCHCopyToClipboardCompletionHandler:3,OLSKLocalized:1});}};var Kt=Object.freeze({__proto__:null,LCHCopyToClipboard:Mt}),$t=oe((function(e,t){const r={OLSKResultsConstrainIndex(e,t){if(!Array.isArray(e))throw new Error("OLSKErrorInputNotValid");if("number"!=typeof t)throw new Error("OLSKErrorInputNotValid");return t<0?e.length-1:t>=e.length?0:t}};Object.assign(t,r);}));const Ut=e=>({OLSKResultsListItem:1&e}),Bt=e=>({OLSKResultsListItem:e[10]});function zt(e,t,r){const o=e.slice();return o[10]=t[r],o}const qt=e=>({OLSKResultsListItem:1&e}),Wt=e=>({OLSKResultsListItem:e[10]});function Zt(e){let t,r;const o=e[8].OLSKResultsEmpty,n=l(o,e,e[7],Bt);return {c(){t=f("div"),n&&n.c(),S(t,"class","OLSKResultsEmpty");},m(e,o){C(e,t,o),n&&n.m(t,null),r=!0;},p(e,t){n&&n.p&&129&t&&p(n,o,e,e[7],t,Ut,Bt);},i(e){r||(z(n,e),r=!0);},o(e){q(n,e),r=!1;},d(e){e&&m(t),n&&n.d(e);}}}function Gt(e){let t,r,o=e[0],n=[];for(let t=0;t<o.length;t+=1)n[t]=Jt(zt(e,o,t));const i=e=>q(n[e],1,1,(()=>{n[e]=null;}));return {c(){t=f("div");for(let e=0;e<n.length;e+=1)n[e].c();S(t,"class","OLSKResultsList");},m(e,o){C(e,t,o);for(let e=0;e<n.length;e+=1)n[e].m(t,null);r=!0;},p(e,r){if(135&r){let a;for(o=e[0],a=0;a<o.length;a+=1){const i=zt(e,o,a);n[a]?(n[a].p(i,r),z(n[a],1)):(n[a]=Jt(i),n[a].c(),z(n[a],1),n[a].m(t,null));}for(U(),a=o.length;a<n.length;a+=1)i(a);B();}},i(e){if(!r){for(let e=0;e<o.length;e+=1)z(n[e]);r=!0;}},o(e){n=n.filter(Boolean);for(let e=0;e<n.length;e+=1)q(n[e]);r=!1;},d(e){e&&m(t),d(n,e);}}}function Jt(e){let t,r,o,n,i;const a=e[8].default,c=l(a,e,e[7],Wt);function u(){return e[9](e[10])}return {c(){t=f("div"),c&&c.c(),r=h(),S(t,"class","OLSKResultsListItem svelte-1tcoest"),R(t,"OLSKResultsListItemSelected",e[10]===e[1]);},m(e,a){C(e,t,a),c&&c.m(t,null),L(t,r),o=!0,n||(i=y(t,"click",u),n=!0);},p(r,o){e=r,c&&c.p&&129&o&&p(c,a,e,e[7],o,qt,Wt),3&o&&R(t,"OLSKResultsListItemSelected",e[10]===e[1]);},i(e){o||(z(c,e),o=!0);},o(e){q(c,e),o=!1;},d(e){e&&m(t),c&&c.d(e),n=!1,i();}}}function Xt(e){let t,r,o,n,i,a;const c=[Gt,Zt],l=[];function u(e,t){return e[0].length?0:1}return r=u(e),o=l[r]=c[r](e),{c(){t=f("div"),o.c(),S(t,"class","OLSKResults");},m(o,c){C(o,t,c),l[r].m(t,null),n=!0,i||(a=y(window,"keydown",e[3].InterfaceWindowDidKeydown),i=!0);},p(e,[n]){let i=r;r=u(e),r===i?l[r].p(e,n):(U(),q(l[i],1,1,(()=>{l[i]=null;})),B(),o=l[r],o?o.p(e,n):(o=l[r]=c[r](e),o.c()),z(o,1),o.m(t,null));},i(e){n||(z(o),n=!0);},o(e){q(o),n=!1;},d(e){e&&m(t),l[r].d(),i=!1,a();}}}function Yt(e,t,r){let{$$slots:o={},$$scope:n}=t,{OLSKResultsListItems:i}=t,{OLSKResultsListItemSelected:a}=t,{OLSKResultsDispatchArrow:c}=t,{OLSKResultsDispatchClick:l}=t,{OLSKResultsEnableLooping:u=!1}=t,{OLSKResultsIgnoreKeyboard:p=!1}=t;const s={InterfaceWindowDidKeydown(e){if(p)return;if(!i.length)return;const t={ArrowUp:()=>((u||i[0]!==a)&&s.ControlArrowIncrement(-1),e.preventDefault()),ArrowDown:()=>((u||i.slice(-1).pop()!==a)&&s.ControlArrowIncrement(1),e.preventDefault())};t[e.code]&&t[e.code]();},ControlArrowIncrement(e){c(i[$t.OLSKResultsConstrainIndex(i,i.indexOf(a)+e)]);}};return e.$$set=e=>{"OLSKResultsListItems"in e&&r(0,i=e.OLSKResultsListItems),"OLSKResultsListItemSelected"in e&&r(1,a=e.OLSKResultsListItemSelected),"OLSKResultsDispatchArrow"in e&&r(4,c=e.OLSKResultsDispatchArrow),"OLSKResultsDispatchClick"in e&&r(2,l=e.OLSKResultsDispatchClick),"OLSKResultsEnableLooping"in e&&r(5,u=e.OLSKResultsEnableLooping),"OLSKResultsIgnoreKeyboard"in e&&r(6,p=e.OLSKResultsIgnoreKeyboard),"$$scope"in e&&r(7,n=e.$$scope);},[i,a,l,s,c,u,p,n,o,e=>l(e)]}class Qt extends Q{constructor(e){super(),Y(this,e,Yt,Xt,c,{OLSKResultsListItems:0,OLSKResultsListItemSelected:1,OLSKResultsDispatchArrow:4,OLSKResultsDispatchClick:2,OLSKResultsEnableLooping:5,OLSKResultsIgnoreKeyboard:6});}}function er(e){let t,r,o,n;return {c(){t=f("br"),r=h(),o=f("span"),n=H(e[1]),S(o,"class","LCHLauncherPipeItemSubtitle svelte-vzui22");},m(e,i){C(e,t,i),C(e,r,i),C(e,o,i),L(o,n);},p(e,t){2&t&&P(n,e[1]);},d(e){e&&m(t),e&&m(r),e&&m(o);}}}function tr(e){let t,r,o,n;return {c(){t=f("br"),r=h(),o=f("span"),n=H(e[2]),S(o,"class","LCHLauncherPipeItemSource svelte-vzui22");},m(e,i){C(e,t,i),C(e,r,i),C(e,o,i),L(o,n);},p(e,t){4&t&&P(n,e[2]);},d(e){e&&m(t),e&&m(r),e&&m(o);}}}function rr(e){let r,o,n,i,a,c=e[1]&&er(e),l=e[2]&&tr(e);return {c(){r=f("div"),o=f("span"),n=H(e[0]),i=h(),c&&c.c(),a=h(),l&&l.c(),S(o,"class","LCHLauncherPipeItemTitle"),S(r,"class","LCHLauncherPipeItem svelte-vzui22");},m(e,t){C(e,r,t),L(r,o),L(o,n),L(r,i),c&&c.m(r,null),L(r,a),l&&l.m(r,null);},p(e,[t]){1&t&&P(n,e[0]),e[1]?c?c.p(e,t):(c=er(e),c.c(),c.m(r,a)):c&&(c.d(1),c=null),e[2]?l?l.p(e,t):(l=tr(e),l.c(),l.m(r,null)):l&&(l.d(1),l=null);},i:t,o:t,d(e){e&&m(r),c&&c.d(),l&&l.d();}}}function or(e,t,r){let{PipeItemTitle:o=""}=t,{PipeItemSubtitle:n=""}=t,{PipeItemSource:i=""}=t;return e.$$set=e=>{"PipeItemTitle"in e&&r(0,o=e.PipeItemTitle),"PipeItemSubtitle"in e&&r(1,n=e.PipeItemSubtitle),"PipeItemSource"in e&&r(2,i=e.PipeItemSource);},[o,n,i]}class nr extends Q{constructor(e){super(),Y(this,e,or,rr,c,{PipeItemTitle:0,PipeItemSubtitle:1,PipeItemSource:2});}}function ir(e){let t,r;return t=new nr({props:{PipeItemTitle:e[0].LCHRecipeName,PipeItemSubtitle:e[0]._LCHRecipeOutputTypeName,PipeItemSource:e[0]._LCHRecipeSource}}),{c(){Z(t.$$.fragment);},m(e,o){G(t,e,o),r=!0;},p(e,r){const o={};1&r&&(o.PipeItemTitle=e[0].LCHRecipeName),1&r&&(o.PipeItemSubtitle=e[0]._LCHRecipeOutputTypeName),1&r&&(o.PipeItemSource=e[0]._LCHRecipeSource),t.$set(o);},i(e){r||(z(t.$$.fragment,e),r=!0);},o(e){q(t.$$.fragment,e),r=!1;},d(e){J(t,e);}}}function ar(e){let t;const r=e[6].default,o=l(r,e,e[7],null);return {c(){o&&o.c();},m(e,r){o&&o.m(e,r),t=!0;},p(e,t){o&&o.p&&128&t&&p(o,r,e,e[7],t,null,null);},i(e){t||(z(o,e),t=!0);},o(e){q(o,e),t=!1;},d(e){o&&o.d(e);}}}function cr(e){let t,r;return t=new Qt({props:{OLSKResultsListItems:e[1],OLSKResultsListItemSelected:e[0],OLSKResultsDispatchClick:e[5],OLSKResultsDispatchArrow:e[4],OLSKResultsEnableLooping:!0,$$slots:{default:[lr,({OLSKResultsListItem:e})=>({9:e}),({OLSKResultsListItem:e})=>e?512:0]},$$scope:{ctx:e}}}),{c(){Z(t.$$.fragment);},m(e,o){G(t,e,o),r=!0;},p(e,r){const o={};2&r&&(o.OLSKResultsListItems=e[1]),1&r&&(o.OLSKResultsListItemSelected=e[0]),640&r&&(o.$$scope={dirty:r,ctx:e}),t.$set(o);},i(e){r||(z(t.$$.fragment,e),r=!0);},o(e){q(t.$$.fragment,e),r=!1;},d(e){J(t,e);}}}function lr(e){let t,r;return t=new nr({props:{PipeItemTitle:e[9].LCHRecipeName,PipeItemSubtitle:e[9]._LCHRecipeOutputTypeName,PipeItemSource:e[9]._LCHRecipeSource}}),{c(){Z(t.$$.fragment);},m(e,o){G(t,e,o),r=!0;},p(e,r){const o={};512&r&&(o.PipeItemTitle=e[9].LCHRecipeName),512&r&&(o.PipeItemSubtitle=e[9]._LCHRecipeOutputTypeName),512&r&&(o.PipeItemSource=e[9]._LCHRecipeSource),t.$set(o);},i(e){r||(z(t.$$.fragment,e),r=!0);},o(e){q(t.$$.fragment,e),r=!1;},d(e){J(t,e);}}}function ur(e){let t,r,o,n,i,a,c;const l=[ar,ir],u=[];function p(e,t){return !e[0]||e[3]?0:1}n=p(e),i=u[n]=l[n](e);let s=!e[2]&&cr(e);return {c(){t=f("div"),r=f("div"),o=f("div"),i.c(),a=h(),s&&s.c(),S(o,"class","LCHLauncherZoneInputBezel svelte-es8kzu"),S(r,"class","LCHLauncherZoneInput svelte-es8kzu"),S(t,"class","LCHLauncherPrompt");},m(e,i){C(e,t,i),L(t,r),L(r,o),u[n].m(o,null),L(t,a),s&&s.m(t,null),c=!0;},p(e,[r]){let a=n;n=p(e),n===a?u[n].p(e,r):(U(),q(u[a],1,1,(()=>{u[a]=null;})),B(),i=u[n],i?i.p(e,r):(i=u[n]=l[n](e),i.c()),z(i,1),i.m(o,null)),e[2]?s&&(U(),q(s,1,1,(()=>{s=null;})),B()):s?(s.p(e,r),4&r&&z(s,1)):(s=cr(e),s.c(),z(s,1),s.m(t,null));},i(e){c||(z(i),z(s),c=!0);},o(e){q(i),q(s),c=!1;},d(e){e&&m(t),u[n].d(),s&&s.d();}}}function pr(e,t,r){let{$$slots:o={},$$scope:n}=t,{PromptItems:i=[]}=t,{ResultsHidden:a=!1}=t,{ItemSelected:c=null}=t,{ItemSelectedHidden:l=!1}=t;const u=E();return e.$$set=e=>{"PromptItems"in e&&r(1,i=e.PromptItems),"ResultsHidden"in e&&r(2,a=e.ResultsHidden),"ItemSelected"in e&&r(0,c=e.ItemSelected),"ItemSelectedHidden"in e&&r(3,l=e.ItemSelectedHidden),"$$scope"in e&&r(7,n=e.$$scope);},[c,i,a,l,function(e){u("ResultListDispatchArrow",r(0,c=e));},function(e){u("ResultListDispatchClick",r(0,c=e));},o,n]}class sr extends Q{constructor(e){super(),Y(this,e,pr,ur,c,{PromptItems:1,ResultsHidden:2,ItemSelected:0,ItemSelectedHidden:3});}}const{window:Lr}=W;function Cr(e,t,r){const o=e.slice();return o[16]=t[r],o[17]=t,o[18]=r,o}function mr(e){let t,r,o,n,i,a,c,l=e[0].LCHOptionMode===xt.LCHLauncherModePipe(),u=l&&dr(e);function p(){return e[12](e[16])}return o=new sr({props:{PromptItems:e[16].LCHPromptItemsVisible,ItemSelected:e[16].LCHPromptItemSelected,ItemSelectedHidden:e[0].LCHOptionMode!==xt.LCHLauncherModePipe()||e[16].LCHPromptDotModeEnabled,ResultsHidden:!1!==e[16].LCHPromptResultsThrottle,$$slots:{default:[br]},$$scope:{ctx:e}}}),o.$on("ResultListDispatchArrow",e[10]),o.$on("ResultListDispatchClick",e[11]),{c(){t=f("div"),u&&u.c(),r=h(),Z(o.$$.fragment),S(t,"class",n=s(e[16].LCHPromptClass)+" svelte-txcag0"),R(t,"LCHLauncherPromptSelected",e[1]._ValuePromptObjects[e[1]._ValuePromptActiveIndex]===e[16]);},m(e,n){C(e,t,n),u&&u.m(t,null),L(t,r),G(o,t,null),i=!0,a||(c=y(t,"click",p),a=!0);},p(a,c){e=a,1&c&&(l=e[0].LCHOptionMode===xt.LCHLauncherModePipe()),l?u?u.p(e,c):(u=dr(e),u.c(),u.m(t,r)):u&&(u.d(1),u=null);const p={};2&c&&(p.PromptItems=e[16].LCHPromptItemsVisible),2&c&&(p.ItemSelected=e[16].LCHPromptItemSelected),3&c&&(p.ItemSelectedHidden=e[0].LCHOptionMode!==xt.LCHLauncherModePipe()||e[16].LCHPromptDotModeEnabled),2&c&&(p.ResultsHidden=!1!==e[16].LCHPromptResultsThrottle),524291&c&&(p.$$scope={dirty:c,ctx:e}),o.$set(p),(!i||2&c&&n!==(n=s(e[16].LCHPromptClass)+" svelte-txcag0"))&&S(t,"class",n),2&c&&R(t,"LCHLauncherPromptSelected",e[1]._ValuePromptObjects[e[1]._ValuePromptActiveIndex]===e[16]);},i(e){i||(z(o.$$.fragment,e),i=!0);},o(e){q(o.$$.fragment,e),i=!1;},d(e){e&&m(t),u&&u.d(),J(o),a=!1,c();}}}function dr(e){let t,r,o=(e[16].LCHPromptFilterText&&e[16].LCHPromptFilterText.toUpperCase()||e[16].LCHPromptHeading)+"";return {c(){t=f("strong"),r=H(o),S(t,"class","LCHLauncherPromptHeading svelte-txcag0"),R(t,"LCHLauncherPromptHeadingMatchStop",e[16].LCHPromptMatchStop);},m(e,o){C(e,t,o),L(t,r);},p(e,n){2&n&&o!==(o=(e[16].LCHPromptFilterText&&e[16].LCHPromptFilterText.toUpperCase()||e[16].LCHPromptHeading)+"")&&P(r,o),2&n&&R(t,"LCHLauncherPromptHeadingMatchStop",e[16].LCHPromptMatchStop);},d(e){e&&m(t);}}}function fr(e){let r;return {c(){r=f("span"),r.textContent=""+e[2]("LCHLauncherSubjectPromptPlaceholderText"),S(r,"class","LCHLauncherSubjectPromptPlaceholder svelte-txcag0");},m(e,t){C(e,r,t);},p:t,d(e){e&&m(r);}}}function Hr(e){let t,r,o,n;return {c(){t=f("input"),S(t,"class","LCHLauncherFilterInput svelte-txcag0"),S(t,"placeholder",r=e[0].LCHOptionMode===xt.LCHLauncherModePreview()?e[2]("LCHLauncherInputPlaceholderPreview"):e[2]("LCHLauncherInputPlaceholderDefault")),t.autofocus=!0;},m(r,i){C(r,t,i),g(t,e[1]._ValuePromptObjects[0].LCHPromptFilterText),e[7](t),t.focus(),o||(n=[y(t,"input",e[6]),y(t,"input",e[8])],o=!0);},p(e,o){1&o&&r!==(r=e[0].LCHOptionMode===xt.LCHLauncherModePreview()?e[2]("LCHLauncherInputPlaceholderPreview"):e[2]("LCHLauncherInputPlaceholderDefault"))&&S(t,"placeholder",r),2&o&&t.value!==e[1]._ValuePromptObjects[0].LCHPromptFilterText&&g(t,e[1]._ValuePromptObjects[0].LCHPromptFilterText);},d(r){r&&m(t),e[7](null),o=!1,i(n);}}}function hr(e){let t,r,o;function n(){e[9].call(t,e[17],e[18]);}return {c(){t=f("input"),S(t,"class","LCHLauncherPromptDotModeInput svelte-txcag0"),t.autofocus=!0;},m(i,c){C(i,t,c),g(t,e[16].LCHPromptDotModeText),t.focus(),r||(o=[y(t,"input",n),y(t,"input",(function(){a(e[1].InterfaceDotModeFieldDidInput)&&e[1].InterfaceDotModeFieldDidInput.apply(this,arguments);}))],r=!0);},p(r,o){e=r,2&o&&t.value!==e[16].LCHPromptDotModeText&&g(t,e[16].LCHPromptDotModeText);},d(e){e&&m(t),r=!1,i(o);}}}function br(e){let t,r,o,n=!["LCHLauncherFilterPrompt","LCHLauncherActionPrompt"].includes(e[16].LCHPromptClass)&&e[16].LCHPromptDotModeEnabled,i="LCHLauncherSubjectPrompt"===e[16].LCHPromptClass&&!e[16].LCHPromptDotModeEnabled&&fr(e),a="LCHLauncherFilterPrompt"===e[16].LCHPromptClass&&Hr(e),c=n&&hr(e);return {c(){i&&i.c(),t=h(),a&&a.c(),r=h(),c&&c.c(),o=b();},m(e,n){i&&i.m(e,n),C(e,t,n),a&&a.m(e,n),C(e,r,n),c&&c.m(e,n),C(e,o,n);},p(e,l){"LCHLauncherSubjectPrompt"!==e[16].LCHPromptClass||e[16].LCHPromptDotModeEnabled?i&&(i.d(1),i=null):i?i.p(e,l):(i=fr(e),i.c(),i.m(t.parentNode,t)),"LCHLauncherFilterPrompt"===e[16].LCHPromptClass?a?a.p(e,l):(a=Hr(e),a.c(),a.m(r.parentNode,r)):a&&(a.d(1),a=null),2&l&&(n=!["LCHLauncherFilterPrompt","LCHLauncherActionPrompt"].includes(e[16].LCHPromptClass)&&e[16].LCHPromptDotModeEnabled),n?c?c.p(e,l):(c=hr(e),c.c(),c.m(o.parentNode,o)):c&&(c.d(1),c=null);},d(e){i&&i.d(e),e&&m(t),a&&a.d(e),e&&m(r),c&&c.d(e),e&&m(o);}}}function yr(e){let t,r,o=e[16].LCHPromptIsVisible&&mr(e);return {c(){o&&o.c(),t=b();},m(e,n){o&&o.m(e,n),C(e,t,n),r=!0;},p(e,r){e[16].LCHPromptIsVisible?o?(o.p(e,r),2&r&&z(o,1)):(o=mr(e),o.c(),z(o,1),o.m(t.parentNode,t)):o&&(U(),q(o,1,1,(()=>{o=null;})),B());},i(e){r||(z(o),r=!0);},o(e){q(o),r=!1;},d(e){o&&o.d(e),e&&m(t);}}}function Sr(e){let t,o,n;const i=[e[1]._ValueSecondaryComponentDescriptor.LCHInstanceProps];var a=e[1]._ValueSecondaryComponentDescriptor.LCHInstanceClass;function c(e){let t={};for(let e=0;e<i.length;e+=1)t=r(t,i[e]);return {props:t}}return a&&(t=new a(c())),{c(){t&&Z(t.$$.fragment),o=b();},m(e,r){t&&G(t,e,r),C(e,o,r),n=!0;},p(e,r){const n=2&r?function(e,t){const r={},o={},n={$$scope:1};let i=e.length;for(;i--;){const a=e[i],c=t[i];if(c){for(const e in a)e in c||(o[e]=1);for(const e in c)n[e]||(r[e]=c[e],n[e]=1);e[i]=c;}else for(const e in a)n[e]=1;}for(const e in o)e in r||(r[e]=void 0);return r}(i,[(l=e[1]._ValueSecondaryComponentDescriptor.LCHInstanceProps,"object"==typeof l&&null!==l?l:{})]):{};var l;if(a!==(a=e[1]._ValueSecondaryComponentDescriptor.LCHInstanceClass)){if(t){U();const e=t;q(e.$$.fragment,1,0,(()=>{J(e,1);})),B();}a?(t=new a(c()),Z(t.$$.fragment),z(t.$$.fragment,1),G(t,o.parentNode,o)):t=null;}else a&&t.$set(n);},i(e){n||(t&&z(t.$$.fragment,e),n=!0);},o(e){t&&q(t.$$.fragment,e),n=!1;},d(e){e&&m(o),t&&J(t,e);}}}function Pr(e){let t,r,o,n,c,l,u,p=ne(),s=e[1]._ValuePromptObjects,H=[];for(let t=0;t<s.length;t+=1)H[t]=yr(Cr(e,s,t));const P=e=>q(H[e],1,1,(()=>{H[e]=null;}));let g=p&&function(e){let t,r,o;return {c(){t=f("button"),S(t,"id","TestLCHDebugCloseButton"),S(t,"class","svelte-txcag0");},m(n,i){C(n,t,i),r||(o=y(t,"click",(function(){a(e[1].ControlExit)&&e[1].ControlExit.apply(this,arguments);})),r=!0);},p(t,r){e=t;},d(e){e&&m(t),r=!1,o();}}}(e),R=e[1]._ValueSecondaryComponentDescriptor&&Sr(e);return {c(){t=f("div");for(let e=0;e<H.length;e+=1)H[e].c();r=h(),g&&g.c(),o=h(),R&&R.c(),n=b(),S(t,"class","Container LCHLauncher svelte-txcag0");},m(i,p){C(i,t,p);for(let e=0;e<H.length;e+=1)H[e].m(t,null);L(t,r),g&&g.m(t,null),e[13](t),C(i,o,p),R&&R.m(i,p),C(i,n,p),c=!0,l||(u=[y(Lr,"keydown",(function(){a(e[1].interfaceDidKeydown)&&e[1].interfaceDidKeydown.apply(this,arguments);})),y(Lr,"click",(function(){a(e[1].InterfaceBodyDidClick)&&e[1].InterfaceBodyDidClick.apply(this,arguments);})),y(Lr,"touchstart",(function(){a(e[1].InterfaceBodyDidClick)&&e[1].InterfaceBodyDidClick.apply(this,arguments);}))],l=!0);},p(o,[i]){if(e=o,31&i){let o;for(s=e[1]._ValuePromptObjects,o=0;o<s.length;o+=1){const n=Cr(e,s,o);H[o]?(H[o].p(n,i),z(H[o],1)):(H[o]=yr(n),H[o].c(),z(H[o],1),H[o].m(t,r));}for(U(),o=s.length;o<H.length;o+=1)P(o);B();}p&&g.p(e,i),e[1]._ValueSecondaryComponentDescriptor?R?(R.p(e,i),2&i&&z(R,1)):(R=Sr(e),R.c(),z(R,1),R.m(n.parentNode,n)):R&&(U(),q(R,1,1,(()=>{R=null;})),B());},i(e){if(!c){for(let e=0;e<s.length;e+=1)z(H[e]);z(R),c=!0;}},o(e){H=H.filter(Boolean);for(let e=0;e<H.length;e+=1)q(H[e]);q(R),c=!1;},d(r){r&&m(t),d(H,r),g&&g.d(),e[13](null),r&&m(o),R&&R.d(r),r&&m(n),l=!1,i(u);}}}function gr(e,t,r){let{LRTOptions:o={}}=t,{LRTDidFinish:n=null}=t;o=xt.LCHLauncherOptions(o,ne()?void 0:console.warn);const i=function(e){return jt.OLSKInternationalLocalizedString(e,JSON.parse('{"en":{"LCHLauncherInputPlaceholderDefault":"Type to search","LCHLauncherInputPlaceholderPreview":"Type to filter","LCHLauncherSubjectPromptPlaceholderText":"Type to search","LCHLauncherSubjectPromptHeadingText":"Subject","LCHLauncherActionPromptHeadingText":"Action","LCHLauncherObjectPromptHeadingText":"Object","LCHCopyToClipboardButtonText":"Copy to clipboard","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Active Document Focus Elements","LCHCopyToClipboard":"Copy to clipboard","LCHLargeText":"Large text","LCHDOMElementFocus":"Focus","LCHRunCommand":"Run Command","LCHSearchWith":"Search With","LCHSearchFor":"Search For","LCHSubjectContainerShowContents":"Show Contents","LCHURLOpen":"Open URL","SubjectContainer":"Subject Container","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Search Service URL Template","DOMElement":"DOM Element"}},"es":{"LCHLauncherInputPlaceholderDefault":"Escribir para buscar","LCHLauncherInputPlaceholderPreview":"Escribir para filtrar","LCHLauncherSubjectPromptPlaceholderText":"Escribir para buscar","LCHLauncherSubjectPromptHeadingText":"Sujeto","LCHLauncherActionPromptHeadingText":"Acto","LCHLauncherObjectPromptHeadingText":"Objeto","LCHCopyToClipboardButtonText":"Copiar al portapapeles","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Elementos enfocados del documento activo","LCHCopyToClipboard":"Copiar al portapapeles","LCHLargeText":"Texto aumentado","LCHDOMElementFocus":"Enfocar","LCHRunCommand":"Ejecutar comando","LCHSearchWith":"Buscar con","LCHSearchFor":"Buscar para","LCHSubjectContainerShowContents":"Mostrar contenidos","LCHURLOpen":"Abrir URL","SubjectContainer":"Contenido de sujetos","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Plantilla URL de servicio de búsqueda","DOMElement":"Elemento DOM"}},"fr":{"LCHLauncherInputPlaceholderDefault":"Taper pour chercher","LCHLauncherInputPlaceholderPreview":"Taper pour filtrer","LCHLauncherSubjectPromptPlaceholderText":"Taper pour chercher","LCHLauncherSubjectPromptHeadingText":"Sujet","LCHLauncherActionPromptHeadingText":"Action","LCHLauncherObjectPromptHeadingText":"Objet","LCHCopyToClipboardButtonText":"Copier dans le presse-papier","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Éléments au points du document active","LCHCopyToClipboard":"Copier dans le presse-papier","LCHLargeText":"Texte élargi","LCHDOMElementFocus":"Faire le point","LCHRunCommand":"Exécuter la commande","LCHSearchWith":"Chercher avec","LCHSearchFor":"Chercher pour","LCHSubjectContainerShowContents":"Montrer le contenu","LCHURLOpen":"Ouvrir l\'URL","SubjectContainer":"Contenant des sujets","String":"String","Date":"Date","URL":"URL","ServiceSearchURLTemplate":"Modèle URL de service de recherche","DOMElement":"Élément DOM"}},"pt":{"LCHLauncherInputPlaceholderDefault":"Digitar para pesquisar","LCHLauncherInputPlaceholderPreview":"Digitar para filtrar","LCHLauncherSubjectPromptPlaceholderText":"Digitar para pesquisar","LCHLauncherSubjectPromptHeadingText":"Sujeito","LCHLauncherActionPromptHeadingText":"Ação","LCHLauncherObjectPromptHeadingText":"Objeto","LCHCopyToClipboardButtonText":"Cópia na área de transferência","LCHStandardRecipeNames":{"LCHActiveDocumentFocusElements":"Elementos de foco no documento ativo","LCHCopyToClipboard":"Cópia na área de transferência","LCHLargeText":"Texto grande","LCHDOMElementFocus":"Foco","LCHRunCommand":"Executar Comando","LCHSearchWith":"Buscar com","LCHSearchFor":"Buscar por","LCHSubjectContainerShowContents":"Mostrar conteúdo","LCHURLOpen":"Abrir URL","SubjectContainer":"Contêiner do Sujeito","String":"Sequência","Date":"Data","URL":"URL","ServiceSearchURLTemplate":"Modelo de URL do serviço de pesquisa","DOMElement":"Elemento do DOM"}}}')[o.LCHOptionLanguage])};function a(e){r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText=e,u),function(){for(var e=0;e<u._ValuePromptObjects.length;e++)e&&e!==u._ValuePromptActiveIndex&&(r(1,u._ValuePromptObjects[e].LCHPromptFilterText="",u),r(1,u._ValuePromptObjects[e].LCHPromptMatchStop=!1,u));}(),o.LCHOptionMode===xt.LCHLauncherModePipe()&&(!1===u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptInputThrottle&&r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptMatchStop=!1,u),u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText||r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptMatchStop=!1,u)),function(){if(o.LCHOptionMode!==xt.LCHLauncherModePipe())return;if(!u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText)return;const e=u._ValuePromptActiveIndex;kt.OLSKThrottleMappedTimeout(u._ValuePromptObjects[e],"LCHPromptInputThrottle",{OLSKThrottleDuration:xt.LCHLauncherThrottleDuration,OLSKThrottleCallback(){setTimeout((function(){r(1,u._ValuePromptObjects[e].LCHPromptInputThrottle=!1,u);}));}});}(),function(){if(o.LCHOptionMode!==xt.LCHLauncherModePipe())return;if(!u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText)return;const e=u._ValuePromptActiveIndex;kt.OLSKThrottleMappedTimeout(u._ValuePromptObjects[e],"LCHPromptResultsThrottle",{OLSKThrottleDuration:xt.LCHLauncherThrottleDuration,OLSKThrottleCallback(){setTimeout((function(){r(1,u._ValuePromptObjects[e].LCHPromptResultsThrottle=!1,u);}));}});}(),c(function(){if(o.LCHOptionMode===xt.LCHLauncherModePipe()&&!u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText&&!1===u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle)return u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsVisible;if(!u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText)return o.LCHOptionMode===xt.LCHLauncherModePreview()?u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsAll:[];const e=u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsAll.filter((function(e){return !e.LCHRecipeIsExcluded||!e.LCHRecipeIsExcluded()}));let t=At.go(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText,e,{key:"LCHRecipeName"});return t.length||!ne()||u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText.slice(0,3).match(/[^A-Z]/)?o.LCHOptionMode===xt.LCHLauncherModePipe()&&u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsVisible.length&&!t.length?(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle&&kt.OLSKThrottleSkip(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle),r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptMatchStop=!0,u),u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsVisible):t.sort((function(e,t){return e.score<t.score?1:e.score>t.score?-1:0})).map((function(e){return e.obj})):e.filter((function(e){return e.LCHRecipeSignature===u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText}))}());}function c(e){r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsVisible=e,u),l(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemsVisible[0]);}function l(e){r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemSelected=e,u),o.LCHOptionMode===xt.LCHLauncherModePreview()&&u.ControlRun(u._ValuePromptObjects[0].LCHPromptItemSelected),o.LCHOptionMode===xt.LCHLauncherModePipe()&&(!function(){if(0===u._ValuePromptActiveIndex){if(!u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptItemSelected)return r(1,u._ValuePromptObjects[1].LCHPromptItemsVisible=r(1,u._ValuePromptObjects[1].LCHPromptItemsAll=[],u),u),void delete u._ValuePromptObjects[1].LCHPromptItemSelected;r(1,u._ValuePromptObjects[1].LCHPromptItemsAll=u._ValueAllActions.filter((function(t){return u._ValueTypeEquivalenceMap[e.LCHRecipeOutputType||"Command"].filter((function(e){return ae.LCHRuntimeInputTypes(t.LCHRecipeInputTypes).shift()===e})).length})).sort(xt.LCHLauncherActionComparator(e.LCHRecipeOutputType||"Command")),u),r(1,u._ValuePromptObjects[1].LCHPromptItemsVisible=u._ValuePromptObjects[1].LCHPromptItemsAll,u),r(1,u._ValuePromptObjects[1].LCHPromptItemSelected=u._ValuePromptObjects[1].LCHPromptItemsVisible[0],u);}}(),u._ValuePromptActiveIndex>1||u._ValuePromptObjects[1].LCHPromptItemSelected&&(r(1,u._ValuePromptObjects[2].LCHPromptIsVisible=_t.LCHRecipesActionTakesObject(u._ValuePromptObjects[1].LCHPromptItemSelected),u),r(1,u._ValuePromptObjects[2].LCHPromptItemsAll=u._ValuePromptObjects[2].LCHPromptIsVisible&&"String"!==ae.LCHRuntimeInputTypes(u._ValuePromptObjects[1].LCHPromptItemSelected.LCHRecipeInputTypes).pop()?u._ValueAllSubjects.filter((function(e){return u._ValueTypeEquivalenceMap[ae.LCHRuntimeInputTypes(u._ValuePromptObjects[1].LCHPromptItemSelected.LCHRecipeInputTypes).pop()].includes(e.LCHRecipeOutputType)})):[],u),r(1,u._ValuePromptObjects[2].LCHPromptItemsVisible=u._ValuePromptObjects[2].LCHPromptItemsAll,u),r(1,u._ValuePromptObjects[2].LCHPromptItemSelected=u._ValuePromptObjects[2].LCHPromptItemsVisible[0],u)));}const u={_ValuePromptActiveIndex:0,_ValuePromptObjects:[],_ValueAllPromptRecipes:[],_ValueAllSubjects:[],_ValueAllActions:[],ValuePromptActiveIndex(e){if(void 0===e)return u._ValuePromptActiveIndex;o.LCHOptionMode===xt.LCHLauncherModePipe()&&(kt.OLSKThrottleIsValid(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptInputThrottle)&&clearTimeout(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptInputThrottle._OLSKThrottleTimeoutID),r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptInputThrottle=void 0,u),kt.OLSKThrottleIsValid(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle)&&clearTimeout(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle._OLSKThrottleTimeoutID),r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle=void 0,u)),u._ValuePromptObjects[1].LCHPromptItemsAll.length&&(r(1,u._ValuePromptActiveIndex=e,u),2===u._ValuePromptActiveIndex&&"String"===ae.LCHRuntimeInputTypes(u._ValuePromptObjects[1].LCHPromptItemSelected.LCHRecipeInputTypes).pop()&&(u.ValuePromptDotModeEnabled(!0),u.ValuePromptDotModeText(u.ValuePromptDotModeText())));},ValuePromptDotModeEnabled(e){if(void 0===e)return u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeEnabled;r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeEnabled=e,u);},ValuePromptDotModeText(e){if(void 0===e)return u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText;r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText=e,u),c(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText?[{LCHRecipeName:u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText,LCHRecipeCallback:()=>e,LCHRecipeOutputType:ke(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText)?"URL":"String"}]:[]);},ValuePromptResultsIsVisible(e){if(void 0===e)return !1===u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle;r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle=!e&&void 0,u);},DataComposition:()=>o.LCHOptionMode===xt.LCHLauncherModePipe()?{LCHCompositionAction:u._ValuePromptObjects[1].LCHPromptItemSelected,LCHCompositionSubjectPrimary:u._ValuePromptObjects[0].LCHPromptItemSelected,LCHCompositionSubjectSecondary:u._ValuePromptObjects[2].LCHPromptItemSelected}:{LCHCompositionAction:Object.assign(Ht(),{LCHRecipeName:i("LCHStandardRecipeNames")[Ht().LCHRecipeSignature]}),LCHCompositionSubjectPrimary:u._ValuePromptObjects[0].LCHPromptItemSelected},InterfaceBodyDidClick(e){u._ValueComponentDidMount&&(u._ValueRootElementInstance.contains(e.target)||u.ControlExit());},interfaceDidClickPrompt(e){o.LCHOptionMode===xt.LCHLauncherModePipe()&&u.ValuePromptActiveIndex(u._ValuePromptObjects.indexOf(e));},interfaceDidKeydown(e){u.ControlHandleEventKeydown(e);},InterfaceDotModeFieldDidInput(e){u.ValuePromptDotModeText(this.value);},_ControlHandleEventKeydownModeDotMode(e){const t={Escape:()=>(e.preventDefault(),e.stopPropagation(),u.ValuePromptDotModeEnabled(!1)||!0),Tab:()=>(e.preventDefault(),e.stopPropagation(),!u.ValuePromptDotModeText()||u.ValuePromptDotModeEnabled(!1)),Enter:()=>u.ValuePromptDotModeEnabled(!1)};return !t[e.key]||t[e.key]()},_ControlHandleEventKeydownEscape:e=>(e.preventDefault(),e.stopPropagation(),o.LCHOptionMode===xt.LCHLauncherModePipe()&&u.ValuePromptResultsIsVisible()?u.ValuePromptResultsIsVisible(!1):o.LCHOptionMode!==xt.LCHLauncherModePipe()&&u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText?a(""):void u.ControlExit()),_ControlHandleEventKeydownTab(e){e.preventDefault(),o.LCHOptionMode===xt.LCHLauncherModePipe()&&u.ValuePromptActiveIndex(xt.LCHLauncherConstrainIndex(u._ValuePromptObjects.filter((function(e){return e.LCHPromptIsVisible})),u._ValuePromptActiveIndex+(e.shiftKey?-1:1)*(!u._ValuePromptActiveIndex&&u._ValuePromptObjects[2].LCHPromptIsVisible&&1===u._ValuePromptObjects[1].LCHPromptItemsAll.length?2:1)));},_ControlHandleEventKeydownEnter(e){e.preventDefault(),e.stopPropagation(),_t.LCHCompositionErrors(u.DataComposition())||u.ControlTerminate();},_ControlHandleEventKeydownArrow(e){if(o.LCHOptionMode===xt.LCHLauncherModePipe()){if(e.preventDefault(),!u.ValuePromptResultsIsVisible())return u.ValuePromptResultsIsVisible(!0);u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle&&kt.OLSKThrottleSkip(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle);}},_ControlHandleEventKeydownArrowDown(e){o.LCHOptionMode===xt.LCHLauncherModePipe()&&(e.preventDefault(),void 0!==u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle?u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle&&kt.OLSKThrottleSkip(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle):r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle=!1,u));},_ControlHandleEventKeydownDot(e){o.LCHOptionMode===xt.LCHLauncherModePipe()&&(e.preventDefault(),0===u._ValuePromptActiveIndex&&(kt.OLSKThrottleIsValid(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle)&&clearTimeout(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle._OLSKThrottleTimeoutID),u.ValuePromptResultsIsVisible(!1),u.ValuePromptDotModeEnabled(!0),a(""),u.ValuePromptDotModeText(u.ValuePromptDotModeText()),u.ValuePromptDotModeText()||(r(1,u._ValuePromptObjects[1].LCHPromptItemsAll=[],u),r(1,u._ValuePromptObjects[1].LCHPromptItemsVisible=[],u),delete u._ValuePromptObjects[1].LCHPromptItemSelected)));},_ControlHandleEventKeydownBackspace(e){if(o.LCHOptionMode===xt.LCHLauncherModePipe()){if(e.preventDefault(),u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle)return a(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText.slice(0,-1));if(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText)return r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptMatchStop=!1,u),a("");c([]),r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptResultsThrottle=void 0,u),r(1,u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeText="",u);}},ControlHandleEventKeydown(e){if(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeEnabled&&u._ControlHandleEventKeydownModeDotMode(e))return;const t={Escape:u._ControlHandleEventKeydownEscape,Tab:u._ControlHandleEventKeydownTab,".":u._ControlHandleEventKeydownDot,Enter:u._ControlHandleEventKeydownEnter,ArrowUp:u._ControlHandleEventKeydownArrow,ArrowDown:u._ControlHandleEventKeydownArrowDown,Backspace:u._ControlHandleEventKeydownBackspace};if(t[e.key])return t[e.key](e);u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptDotModeEnabled||o.LCHOptionMode===xt.LCHLauncherModePipe()&&(e.preventDefault(),xt.LCHLauncherKeyboardEventIsTextInput(e)&&a(u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptInputThrottle?u._ValuePromptObjects[u._ValuePromptActiveIndex].LCHPromptFilterText+e.key:e.key));},ControlReloadSubjects(e){let t=xt.LCHLauncherReloadableSubjects([e]);return !!t.length&&(r(1,u._ValuePromptObjects[0].LCHPromptItemsVisible=[],u),r(1,u._ValuePromptObjects[0].LCHPromptItemsAll=t,u),u.ValuePromptActiveIndex(0),l(t[0]),!0)},async ControlTerminate(){o.LCHOptionMode===xt.LCHLauncherModePipe()&&u.ControlReloadSubjects(await u.ControlRun(u.DataComposition()))||(o.LCHOptionMode===xt.LCHLauncherModeCommit()&&await u.ControlRun(u._ValuePromptObjects[0].LCHPromptItemSelected),u.ControlExit());},ControlRun:async e=>u._ControlRun(e.LCHCompositionAction?await _t.LCHAPIExecuteComposition(e,u._ValueSharedAPI):await _t.LCHAPIExecuteRecipe(e,[],u._ValueSharedAPI)),_ControlRun:async e=>e?"object"!=typeof e||_t.LCHComponentDescriptorsErrors(e)?Promise.resolve(e):new Promise((function(t,o){let n=e.LCHComponentDescriptorProps;e.LCHComponentDescriptorOLSKLocalized&&Object.assign(n,{OLSKLocalized:i}),n[e.LCHComponentDescriptorCompletionHandlerSignature]=function(){delete u._ValueSecondaryComponentDescriptor,u.ControlExit();},r(1,u._ValueSecondaryComponentDescriptor={LCHInstanceClass:Kt[e.LCHComponentDescriptorName],LCHInstanceProps:n},u);})):Promise.resolve(e),ControlExit(){if(u._ValueFilterInputInstance===document.activeElement&&u._ValueFilterInputInstance.blur(),"function"==typeof n)return n()},ReactFocusFilterInput(){o.LCHOptionMode!==xt.LCHLauncherModePipe()&&setTimeout((function(){u._ValueFilterInputInstance.focus();}),20);},ReactScrollSelectedItemIntoView(){if(ne())return;let e=document.querySelector(".OLSKResultsListItemSelected");e&&e.scrollIntoView({block:"nearest",inline:"nearest"});},async SetupEverything(){u.SetupSharedRecipes(),await u.SetupPageRecipes(),u.SetupSharedAPI(),u.SetupTasks(),u.SetupPromptObjects();},SetupSharedRecipes(){r(1,u._ValueSharedRecipes=wt().map((function(e){return Object.assign(e,{LCHRecipeName:e.LCHRecipeName||i("LCHStandardRecipeNames")[e.LCHRecipeSignature]})})).concat(_t.LCHRuntimeFilteredRecipes(o.LCHOptionRecipes,window.location.href)),u);},async SetupPageRecipes(){if(!o.LCHOptionIncludePageRecipes)return;let e=window.LCHPageRecipes;e||(e=(window.wrappedJSObject||{}).LCHPageRecipes),!e&&window.location.origin&&"null"!==window.location.origin&&await new Promise((function(t,r){window.addEventListener("message",(function r(o){if(o.source!==window&&!ne())return console.log("not window");"LCHPageRecipes"!==o.data&&Array.isArray(o.data)&&(window.removeEventListener("message",r),e=o.data.filter((function(e){return !_t.LCHRecipeProxyErrors(e)})).map((function(e){return {LCHRecipeName:e.LCHRecipeProxyName,LCHRecipeSignature:e.LCHRecipeProxySignature,LCHRecipeCallback(){window.postMessage(e.LCHRecipeProxySignature,window.location.origin);}}})),t());}),!1),window.postMessage("LCHPageRecipes",window.location.origin),setTimeout(t,20);})),Array.isArray(e)&&u._ValueSharedRecipes.push(...Array.from(e).map((function(e){return delete e.LCHRecipeURLFilter,delete e.LCHRecipeIsAutomatic,e._LCHRecipeSource=window.location.host,e})).filter((function(e){return !_t.LCHRecipesErrors(e)})));},SetupSharedAPI(){r(1,u._ValueSharedAPI=ae.LCHRuntimeAPI(u._ValueSharedRecipes),u);},SetupTasks(){o.LCHOptionRunAutomaticRecipes&&_t.LCHAPIRunTasks(u._ValueSharedRecipes,window.location.href);},SetupPromptObjects(){if(r(1,u._ValueAllPromptRecipes=xt.LCHLauncherUIRecipesForMode(u._ValueSharedRecipes,o.LCHOptionMode),u),o.LCHOptionMode===xt.LCHLauncherModePipe()){r(1,u._ValueTypeEquivalenceMap=_t.LCHAPITypeEquivalenceMapForRecipes(u._ValueSharedRecipes),u);const e=_t.LCHAPITypeNameMap(u._ValueSharedRecipes);r(1,u._ValueAllSubjects=u._ValueAllPromptRecipes.filter((function(e){return !!_t.LCHRecipesIsSubject(e)||!!_t.LCHRecipesIsCommand(e)})).filter((function(e){return !e.LCHRecipeOutputType||Object.keys(u._ValueTypeEquivalenceMap).includes(e.LCHRecipeOutputType)})).map((function(t){return Object.assign(t,{_LCHRecipeOutputTypeName:e[t.LCHRecipeOutputType]})})),u),r(1,u._ValueAllActions=u._ValueAllPromptRecipes.filter(_t.LCHRecipesIsAction),u);const t=Object.keys(u._ValueTypeEquivalenceMap).filter((function(e){return u._ValueAllActions.filter((function(t){return ae.LCHRuntimeInputTypes(t.LCHRecipeInputTypes).shift()===e})).length}));return u._ValuePromptObjects.push({LCHPromptClass:"LCHLauncherSubjectPrompt",LCHPromptHeading:i("LCHLauncherSubjectPromptHeadingText"),LCHPromptItemsVisible:[],LCHPromptItemsAll:u._ValueAllSubjects.filter((function(e){return !e.LCHRecipeOutputType||t.includes(e.LCHRecipeOutputType)})),LCHPromptInputThrottle:void 0,LCHPromptFilterText:"",LCHPromptMatchStop:!1,LCHPromptResultsThrottle:void 0,LCHPromptDotModeText:"",LCHPromptIsVisible:!0},{LCHPromptClass:"LCHLauncherActionPrompt",LCHPromptHeading:i("LCHLauncherActionPromptHeadingText"),LCHPromptItemsVisible:[],LCHPromptItemsAll:[],LCHPromptInputThrottle:void 0,LCHPromptFilterText:"",LCHPromptMatchStop:!1,LCHPromptResultsThrottle:void 0,LCHPromptIsVisible:!0},{LCHPromptClass:"LCHLauncherObjectPrompt",LCHPromptHeading:i("LCHLauncherObjectPromptHeadingText"),LCHPromptItemsVisible:[],LCHPromptItemsAll:[],LCHPromptInputThrottle:void 0,LCHPromptFilterText:"",LCHPromptMatchStop:!1,LCHPromptResultsThrottle:void 0,LCHPromptDotModeText:"",LCHPromptIsVisible:!1})}u._ValuePromptObjects.push({LCHPromptClass:"LCHLauncherFilterPrompt",LCHPromptItemsVisible:[],LCHPromptItemsAll:u._ValueAllPromptRecipes,LCHPromptFilterText:"",LCHPromptResultsThrottle:!1,LCHPromptIsVisible:!0}),o.LCHOptionMode===xt.LCHLauncherModePreview()&&(r(1,u._ValuePromptObjects[0].LCHPromptItemsVisible=u._ValuePromptObjects[0].LCHPromptItemsAll,u),r(1,u._ValuePromptObjects[0].LCHPromptItemSelected=u._ValuePromptObjects[0].LCHPromptItemsAll.filter((function(e){return e._LCHRecipeIsSelected})).shift(),u));},LifecycleModuleWillMount(){u.SetupEverything();},LifecycleModuleDidMount(){setTimeout((function(){r(1,u._ValueComponentDidMount=!0,u);}),1);},LifecycleModuleDidUpdate(){u.ReactScrollSelectedItemIntoView();}};var p;u.LifecycleModuleWillMount(),T(u.LifecycleModuleDidMount),p=u.LifecycleModuleDidUpdate,v().$$.after_update.push(p);return e.$$set=e=>{"LRTOptions"in e&&r(0,o=e.LRTOptions),"LRTDidFinish"in e&&r(5,n=e.LRTDidFinish);},[o,u,i,a,l,n,function(){u._ValuePromptObjects[0].LCHPromptFilterText=this.value,r(1,u);},function(e){_[e?"unshift":"push"]((()=>{u._ValueFilterInputInstance=e,r(1,u);}));},()=>a(u._ValueFilterInputInstance.value),function(e,t){e[t].LCHPromptDotModeText=this.value,r(1,u);},e=>l(e.detail),e=>l(e.detail)||u.ControlTerminate(),e=>u.interfaceDidClickPrompt(e),function(e){_[e?"unshift":"push"]((()=>{u._ValueRootElementInstance=e,r(1,u);}));}]}return class extends Q{constructor(e){super(),Y(this,e,gr,Pr,c,{LRTOptions:0,LRTDidFinish:5});}}}));

	});

	var Main = unwrapExports(uiBehaviour);

	mod$4._ValueClass = Main;

	var rollupStart = LCHPackage();

	return rollupStart;

}());
//# sourceMappingURL=launchlet.js.map
