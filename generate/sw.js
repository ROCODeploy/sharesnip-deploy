(function() {
			const mod = (function OLSKServiceWorkerModule (param1, param2, param3, param4) {
		if (typeof param1 !== 'object' || param1 === null) {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param1.addEventListener !== 'function') {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param2 !== 'object' || param2 === null) {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param2.keys !== 'function') {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param3 !== 'function') {
			throw new Error('OLSKErrorInputNotValid');
		}

		const mod = {

			// VALUE

			_ValueSelf: param1,
			_ValueCaches: param2,
			_ValueFetch: param3,
			_ValuePersistenceCacheURLs: [],

			// DATA

			_DataVersionCacheName: 'OLSKServiceWorkerVersionCache-1677826463661',
			_DataPersistenceCacheName: 'OLSKServiceWorkerPersistenceCache',
			_DataOriginPage: '/generate',

			// CONTROL

			async ControlClearCache () {
				return Promise.all(
					(await mod._ValueCaches.keys()).filter(function (e) {
						return e !== mod._DataPersistenceCacheName;
					}).map(function (e) {
						return mod._ValueCaches.delete(e);
					})
				);
			},

			ControlAddPersistenceCacheURL (inputData) {
				if (typeof inputData !== 'string') {
					throw new Error('OLSKErrorInputNotValid');
				}

				if (mod._ValuePersistenceCacheURLs.includes(inputData)) {
					return;
				}

				mod._ValuePersistenceCacheURLs.push(inputData);
			},

			// MESSAGE

			OLSKServiceWorkerDidActivate (event) {
				event.waitUntil(mod.ControlClearCache());
			},

			async OLSKServiceWorkerDidFetch (event) {
				if (event.request.method !== 'GET') {
					return;
				}

				if (event.request.url.match('sw.js')) {
					return;
				}

				if (event.request.mode === 'cors' && !mod._ValuePersistenceCacheURLs.includes(event.request.url)) {
					return;
				}

				if (event.request.mode === 'navigate' && !event.request.url.includes(mod._DataOriginPage)) {
					return;
				}

				if (event.request.mode !== 'navigate' && !event.request.referrer.includes(mod._DataOriginPage)) {
					return;
				}

				// if (!(event.request.referrer.match(//generate/) && event.request.mode === 'no-cors') && !event.request.url.match(//generate/)) {
				// 	return console.log('ignoring referrer', event.request);
				// };

				return event.respondWith(async function() {
					const cacheResponse = await mod._ValueCaches.match(event.request);

					if (cacheResponse) {
						return cacheResponse;
					}

					const networkResponse = param4 ? await fetch(event.request) : await mod._ValueFetch(event.request);

					if (networkResponse.status === 200) {
						(await mod._ValueCaches.open(mod._ValuePersistenceCacheURLs.includes(event.request.url) ? mod._DataPersistenceCacheName : mod._DataVersionCacheName)).put(event.request, networkResponse.clone());
					}

					return networkResponse;
				}());
			},

			async OLSKServiceWorkerDidReceiveMessage (event) {
				const OLSKMessageSignature = event.data.OLSKMessageSignature || event.data;

				if (typeof OLSKMessageSignature !== 'string') {
					return;
				}

				if (!OLSKMessageSignature.startsWith('OLSKServiceWorker_')) {
					return;
				}

				return event.source.postMessage({
					OLSKMessageSignature,
					OLSKMessageArguments: event.data.OLSKMessageArguments,
					OLSKMessageResponse: await mod[OLSKMessageSignature](...[].concat(event.data.OLSKMessageArguments || [])),
				});
			},

			OLSKServiceWorker_ClearVersionCache () {
				return mod.ControlClearCache();
			},

			OLSKServiceWorker_SkipWaiting () {
				return mod._ValueSelf.skipWaiting();
			},

			OLSKServiceWorker_AddPersistenceCacheURL (inputData) {
				return mod.ControlAddPersistenceCacheURL(inputData);
			},
		
		};
		
		return mod;
	})(self, caches, fetch, true);

			(function OLSKServiceWorkerInitialization (param1, param2) {
		if (typeof param1 !== 'object' || param1 === null) {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param1.addEventListener !== 'function') {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param2 !== 'object' || param2 === null) {
			throw new Error('OLSKErrorInputNotValid');
		}

		if (typeof param2.OLSKServiceWorkerDidReceiveMessage !== 'function') {
			throw new Error('OLSKErrorInputNotValid');
		}

		param1.addEventListener('activate', param2.OLSKServiceWorkerDidActivate);
		param1.addEventListener('fetch', param2.OLSKServiceWorkerDidFetch);
		param1.addEventListener('message', param2.OLSKServiceWorkerDidReceiveMessage);
	})(self, mod);
		})();
