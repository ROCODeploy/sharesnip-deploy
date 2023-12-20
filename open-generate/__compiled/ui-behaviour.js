var Main = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function compute_slots(slots) {
        const result = {};
        for (const key in slots) {
            result[key] = true;
        }
        return result;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function init_binding_group(group) {
        let _inputs;
        return {
            /* push */ p(...inputs) {
                _inputs = inputs;
                _inputs.forEach(input => group.push(input));
            },
            /* remove */ r() {
                _inputs.forEach(input => group.splice(group.indexOf(input), 1));
            }
        };
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Schedules a callback to run immediately after the component has been updated.
     *
     * The first time the callback runs will be after the initial `onMount`
     */
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    /**
     * Schedules a callback to run immediately before the component is unmounted.
     *
     * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
     * only one that runs inside a server-side component.
     *
     * https://svelte.dev/docs#run-time-svelte-ondestroy
     */
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

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
    (function(global, factory) {
    	 factory(exports) ;
    }(commonjsGlobal, (function(exports) {
    	const mod = {

    		OLSKInternationalDefaultIdentifier () {
    			return 'i18n';
    		},

    		OLSKInternationalIsTranslationFileBasename (inputData) {
    			if (typeof inputData !== 'string') {
    				return false;
    			}

    			if (inputData.split('.').length < 2) {
    				return false;
    			}

    			if (!inputData.split('.').pop().match(/ya?ml/i)) {
    				return false;
    			}

    			if (inputData.split('-').shift() !== mod.OLSKInternationalDefaultIdentifier()) {
    				return false;
    			}

    			if (!mod._OLSKInternationalLanguageID(inputData)) {
    				return false;
    			}

    			return true;
    		},

    		OLSKInternationalLanguageID (inputData) {
    			if (!mod.OLSKInternationalIsTranslationFileBasename(inputData)) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return mod._OLSKInternationalLanguageID(inputData);
    		},

    		OLSKInternationalSimplifiedLanguageCode (inputData) {
    			if (typeof inputData !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return inputData.split('-').shift();
    		},

    		_OLSKInternationalLanguageID (inputData) {
    			return inputData.replace(mod.OLSKInternationalDefaultIdentifier() + '-', '').split('.').shift();
    		},

    		OLSKInternationalLocalizedString (translationKey, translationDictionary) {
    			if (typeof translationDictionary !== 'object' || translationDictionary === null) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			var localizedString = translationDictionary[translationKey];

    			if (!localizedString) {
    				localizedString = 'TRANSLATION_MISSING';
    				console.log([
    					localizedString,
    					translationKey,
    					]);
    			}

    			return localizedString;
    		},

    		OLSKInternationalLocalizedStringCallback (dictionary, fallbackLocales) {
    			if (typeof dictionary !== 'object' || dictionary === null) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (!Array.isArray(fallbackLocales)) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			const _locales = Object.keys(dictionary).reverse().concat(...fallbackLocales.map(function (e) {
    					return [mod.OLSKInternationalSimplifiedLanguageCode(e), e]
    				}).reverse());

    			return function (signature, requestLocales) {
    				if (!Array.isArray(requestLocales)) {
    					throw new Error('OLSKErrorInputNotValid');
    				}

    				let locales = _locales.concat(...requestLocales.map(function (e) {
    					return [mod.OLSKInternationalSimplifiedLanguageCode(e), e]
    				}).reverse(), []);

    				let outputData;

    				while (!outputData && locales.length) {
    					outputData = (dictionary[locales.pop()] || {})[signature];
    				}

    				if (!outputData) {
    					console.log([outputData = 'TRANSLATION_MISSING', signature].join(' '));
    				}

    				return outputData;				
    			};
    		},

    		_OLSKInternationalPaths (cwd, filter) {
    			if (typeof cwd !== 'string' || !cwd.trim()) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			const _require = commonjsRequire;

    			return _require().globSync(`**/*${ mod.OLSKInternationalDefaultIdentifier() }*.y*(a)ml`, {
    				cwd,
    				realpath: true,
    			}).filter(function (e) {
    				if (!filter) {
    					return true;
    				}

    				return !e.match(filter);
    			}).filter(function (e) {
    				return mod.OLSKInternationalIsTranslationFileBasename(_require().basename(e));
    			});
    		},

    		_OLSKInternationalConstructedDictionary (inputData) {
    			if (!Array.isArray(inputData)) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			const _require = commonjsRequire;

    			return inputData.reduce(function (coll, item) {
    				const key = mod.OLSKInternationalLanguageID(_require().basename(item));

    				coll[key] = Object.assign(coll[key] || {}, _require().load(_require().readFileSync(item, 'utf8')));

    				return coll;
    			}, {});
    		},

    		OLSKInternationalDictionary (cwd) {
    			return this._OLSKInternationalConstructedDictionary(this._OLSKInternationalPaths(cwd));
    		},

    		_OLSKInternationalCompilationObject (cwd, languageID) {
    			const _require = commonjsRequire;

    			return this._OLSKInternationalPaths(cwd, /node_modules|__external/).filter(function (e) {
    				if (!languageID) {
    					return true;
    				}

    				return mod.OLSKInternationalLanguageID(_require().basename(e)) === languageID;
    			}).reduce(function (coll, item) {
    				return Object.assign(coll, {
    					[item]: _require().load(_require().readFileSync(item, 'utf8')),
    				});
    			}, {});
    		},

    		_OLSKInternationalCompilationFilePath (cwd) {
    			if (typeof cwd !== 'string' || !cwd.trim()) {
    				throw new Error('OLSKErrorInputNotValid');
    			}
    			const _require = commonjsRequire;

    			return _require().join(cwd, '__compiled', mod.OLSKInternationalDefaultIdentifier() + '-compilation.yml')
    		},

    		_SafeDump (inputData) {
    			const _require = commonjsRequire;

    			return _require().dump(inputData, {
    				lineWidth: Infinity,
    			});
    		},

    		OLSKInternationalWriteCompilationFile (cwd, languageID) {
    			const _require = commonjsRequire;

    			const data = mod._SafeDump(this._OLSKInternationalCompilationObject(cwd, languageID));

    			const outputDirectory = _require().dirname(mod._OLSKInternationalCompilationFilePath(cwd));

    			if (!_require().existsSync(outputDirectory)){
    				_require().mkdirSync(outputDirectory);
    			}

    			_require().writeFileSync(mod._OLSKInternationalCompilationFilePath(cwd), data);
    		},

    		OLSKInternationalSpreadCompilationFile (cwd, languageID) {
    			if (typeof cwd !== 'string' || !cwd.trim()) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			const _require = commonjsRequire;

    			const compilation = _require().load(_require().readFileSync(mod._OLSKInternationalCompilationFilePath(cwd), 'utf8'));

    			Object.keys(compilation).map(function (e) {
    				return _require().writeFileSync(e, mod._SafeDump(compilation[e]));
    			});
    		},

    		OLSKInternationalAddControllerLanguageCode (cwd, languageID) {
    			if (typeof cwd !== 'string' || !cwd.trim()) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof languageID !== 'string' || !languageID.trim()) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			const _require = commonjsRequire;

    			_require().globSync('controller.js', {
    				cwd,
    				matchBase: true,
    				realpath: true,
    			}).forEach(function (file) {
    				if (file.match(/.*(\.git|DS_Store|node_modules|vendor|__\w+)\/.*/i)) {
    					return
    				}

    				const item = _require();

    				if (typeof item.OLSKControllerRoutes !== 'function') {
    					return;
    				}

    				if (!(function(inputData) {
    					if (Array.isArray(inputData)) {
    						return inputData;
    					}
    					return Object.entries(inputData).reduce(function (coll, item) {
    						return coll.concat(Object.assign(item[1], {
    							OLSKRouteSignature: item[0],
    						}));
    					}, []);
    				})(item.OLSKControllerRoutes()).filter(function (e) {
    					return e.OLSKRouteLanguageCodes;
    				}).filter(function (e) {
    					return !e.OLSKRouteLanguageCodes.includes(languageID);
    				}).length) {
    					return
    				}
    				const match = _require().readFileSync(file, 'utf8').match(/OLSKRouteLanguageCodes: \[.*\]/g);

    				if (!match) {
    					throw new Error(`invalid OLSKRouteLanguageCodes syntax in ${ e }`);
    				}

    				match.map(function (e) {
    					const match = e.match(/\[.*\]/);
    					return _require().writeFileSync(file, _require().readFileSync(file, 'utf8').replace(/OLSKRouteLanguageCodes: \[.*\]/, `OLSKRouteLanguageCodes: ['${JSON.parse(match[0].replace(/\'/g, '"')).concat(languageID).join('\', \'')}']`));
    				});
    			});

    			if (process.argv[2].endsWith('olsk-i18n-add')) {
    				process.exit();
    			}
    		},

    	};
    	
    	Object.assign(exports, mod);

    	Object.defineProperty(exports, '__esModule', {
    		value: true
    	});

    })));

    {
    	exports.OLSKLocalized = function (inputData) {
    		return exports.OLSKInternationalLocalizedString(inputData, {"pt":{"SNPCollectShareLinkFieldText":"Link","SNPCollectShareCopyButtonText":"Copiar link","SNPScanStartButtonText":"Comecar escanear","SNPScanReadErrorTextFormat":"Erro de escanear: %@","SNPScanStopButtonText":"Parar escanear","SNPScanParseErrorTextFormat":"Erro de parsear: %@","SNPMakeScanButtonText":"Escanear","SNPMakeTypesNoteButtonText":"texto","SNPMakeTypesSiteButtonText":"link","SNPMakeTypesEmailButtonText":"email","SNPMakeTypesPhoneButtonText":"telefone","SNPMakeTypesContactButtonText":"contato","SNPMakeHeadingText":"Fazer um código","SNPDownloadHeadingText":"Fazer um código","SNPCollectDetailToolbarBackButtonText":"Voltar","SNPCollectDetailToolbarCloneButtonText":"Clonar","SNPCollectDetailToolbarDiscardButtonText":"Descartar","SNPCollectDetailFormNameFieldText":"Nome","SNPCollectDetailDataFieldText":"Dados","SNPCollectDetailDataOpenButtonText":"Abrir","SNPFormBaseSaveButtonText":"Guardar","SNPFormWifiNetworkFieldText":"Nome da rede","SNPFormWifiPasswordFieldText":"Senha","SNPFormWifiSecurityNoneOptionText":"Nenhuma","SNPFormNoteFieldText":"texto","SNPFormContactFirstNameFieldText":"Nome","SNPFormContactLastNameFieldText":"Sobrenome","SNPFormContactPhoneFieldText":"Telefone","SNPFormContactEmailFieldText":"Email","SNPFormContactSiteFieldText":"Link","SNPFormContactOrganizationFieldText":"Organisação","SNPVitrineTitle":"Sharesnip","SNPVitrineDescription":"Criar ou escanear rapidamente códigos QR","OLSKLandingBlurbText":"Zero opções de personalização.","SNPGuideTitle":"Guia Sharesnip","SNPGuideDescription":"Documentação do projeto","SNPGenerateShareLinkTextFormat":"Compartilhar %@","SNPGenerateReadErrorNoCamerasText":"Não há câmeras disponíveis","SNPGenerateTitle":"Gerador e escâner gratis de códigos QR","SNPCollectTitle":"Coletar","SNPCollectToggleFormButtonText":"Adicionar","SNPCollectShareModalTitleText":"Compartilhar","ROCORootLinkText":"Visitar rosano.ca","SWARLinkText":"Parte do Pequeno Anel de Aplicação Web","ROCOGlossaryHeadingText":"Uma nova geração de aplicações","ROCOGlossaryDoorlessLinkText":"Filosofia 'doorless' (sem porta)","ROCOGlossaryDoorlessBlurbText":"Aplicativo como espaços públicos não-exclusivos.","ROCOGlossaryZeroDataLinkText":"Aprender mais sobre applicativos Zero Data","ROCOGlossaryZeroDataBlurbText":"Ser dono dos seus dados, todos eles.","ROCOGlossaryGoingWebLinkText":"Indo totalmente para a web","ROCOGlossaryGoingWebBlurbText":"Por que deixei de fazer aplicações iOS após doze anos.","ROCOGlossaryAppsLinkText":"Minhas outras aplicações","ROCOGlossaryAppsBlurbText":"Ferramentas para agência","ROCOGazetteHeadingText":"Acompanhe minha jornada","ROCOBulletinSubmitButtonText":"Assinar à lista de distribuição","ROCOBulletinFeedbackText":"Verifique na sua caixa de entrada (e talvez a pasta de spam) para um link de ativação.","OLSKWordingDownloadText":"Baixar","OLSKWordingOpenApp":"Abrir app","OLSKWordingFeatures":"Características","OLSKWordingOpenGuide":"Ler o guia","OLSKWordingDeeperHeading":"Ir mais fundo","OLSKWordingVideo":"Vídeo","OLSKWordingTestimonials":"Testemunhos","OLSKWordingFeedbackHeading":"Feedback","OLSKWordingFeedbackBlurb":"De dentro do aplicativo, toque no botão ℹ︎, depois selecione \"Enviar feedback\".","OLSKWordingTypeToSearch":"Digitar para pesquisar","OLSKWordingTypeToFilter":"Digitar para filtrar","OLSKWordingConfirmText":"Você tem certeza?","OLSKWordingCancelText":"Cancelar","OLSKWordingSubmitText":"Enviar","OLSKWordingEditText":"Editar","OLSKWordingDebugObjectText":"Depurar este objeto","OLSKWebViewWindowButtonText":"Abrir em nova janela","OLSKTransportLauncherItemImportJSONText":"Importar JSON (beta)","OLSKTransportLauncherItemImportJSONErrorNotFilledAlertText":"Entrada não preenchida","OLSKTransportLauncherItemImportJSONErrorNotValidAlertText":"Entrada não válida","OLSKTransportLauncherItemExportJSONText":"Exportar JSON (beta)","OLSKServiceWorkerUpdateAlertLabelText":"Atualização disponível","OLSKServiceWorkerUpdateAlertReloadButtonText":"Recarregar","OLSKServiceWorkerLauncherItemReloadText":"Recarregar","OLSKServiceWorkerLauncherItemDebugForceUpdateText":"Forçar atualização","OLSKRootLinkTextHome":"Voltar para a página inicial","OLSKRemoteStorageLauncherItemOpenLoginLinkText":"Abrir link de acesso","OLSKRemoteStorageLauncherItemOpenLoginLinkPromptText":"Link de acesso","OLSKRemoteStorageLauncherItemCopyLoginLinkText":"Copiar link de acesso privado","OLSKRemoteStorageLauncherItemDebugFlushDataText":"Fazer sair os dados","OLSKRemoteStorageLauncherItemDebugFlushDataConfirmText":"Você tem certeza?","OLSKRemoteStorageConnectConfirmText":"Conecte sua nuvem para continuar. Você gostaria de fazer isso agora?","OLSKReloadButtonText":"Reload","OLSKPlaceholderText":"Nenhum artículo selecionado","OLSKNarrowFilterFieldText":"Filtrar","OLSKModalViewCloseButtonText":"OK","OLSKLanguageSwitcherVersionFormat":"Versão no %@ / %@","OLSKLanguageSwitcherVersionName":{"en":"inglês","fr":"francês","es":"espanhol","pt":"português","de":"alemão"},"OLSKInstallAlertHeadingText":"Instalar em seu dispositivo","OLSKInstallAlertBlurbHTMLFormat":"Tap <em>Compartir</em> %$1@, depois <em>Adicionar à tela inicial</em> %$2@","OLSKInstallAlertDismissButtonText":"Fechar","OLSKInputWrapperClearButtonText":"Limpar texto","OLSKFundGrantErrorConnectionText":"Erro de conexão","OLSKFundGrantErrorDecryptionText":"Erro de desencriptação","OLSKFundGrantErrorSigningText":"Erro de assinatura","OLSKFundGrantErrorExpiredText":"Acesso expirado","OLSKFundGateText":"Desbloquear documentos ilimitados fazendo uma contribuição para o projeto. Você gostaria de fazer isso agora?","OLSKFundWebViewTitleText":"Financiar um projeto","OLSKFundLauncherItemEnterClueText":"Insira o código de confirmação","OLSKFundLauncherItemEnterCluePromptText":"Digite o código de confirmação","OLSKFundLauncherItemClearClueText":"Zerar autorização","OLSKFundLauncherItemClearClueConfirmText":"Você tem certeza?","OLSKFollowTextFormat":"Me encontre no %$1@ ou no %$2@.","OLSKEditText":"Editar isso","OLSKCloudRenewButtonText":"Renovar","OLSKCloudStatusSyncStartButtonText":"Sincronizar","OLSKCloudStatusSyncStopButtonText":"Parar","OLSKCloudStatusDisconnectButtonText":"Desconectar","OLSKCloudStatusDisconnectConfirmText":"Você tem certeza?","OLSKCloudFormConnectButtonText":"Conectar","OLSKCloudFormRegisterLinkText":"Obter uma nuvem","OLSKCatalogMasterPlaceholderText":"Toque + para criar um artículo.","OLSKCatalogStashPlaceholderTextFormat":"Artículos selecionados: %@","OLSKAproposHeadingText":"Sobre","OLSKAproposFeedbackButtonText":"Enviar feedback","OLSKAproposShareButtonText":"Dizer a um amigo","OLSKAppToolbarCloudStatusOnline":"Online","OLSKAppToolbarCloudStatusOffline":"Offline","OLSKAppToolbarCloudStatusError":"Erro","OLSKAppToolbarAproposButtonText":"Mais informação","OLSKAppToolbarLanguageButtonText":"Idioma","OLSKAppToolbarGuideLinkText":"Guia","OLSKAppToolbarFundButtonText":"Financiar","OLSKAppToolbarClubButtonText":"Adesão","OLSKAppToolbarLauncherButtonText":"Lançador","OLSKAppToolbarCloudButtonText":"Nuvem","OLSKAppFeatureListArray":[["Acessível em qualquer lugar.","Funciona em dispositivos móveis, tablet e desktop'."],["Sem Wi-Fi, sem problemas.","Funciona offline sem acesso à Internet."],["Seus dados em todos os seus dispositivos.","Sincronização automática na nuven com o remoteStorage ou Fission."],["Fluxo de trabalho eficiente.","Atalhos do teclado para a maioria das coisas."],["Mova os dados livremente.","Importar e exportar dados JSON (beta)."],["Amigo dos cegos.","Etiquetas de texto em todos os elementos."],["Privado, não assustador.","Nenhuma análise de comportamento ou rastreadores inter-sitios."],["Ser dono dos seus dados.","100% seus em um aplicativo <a href=\"https://0data.app\">0data</a>."]],"OLSKAppFeatureOpenSourceNameText":"Código aberto.","OLSKAppFeatureOpenSourceBlurbFormat":"O código é <a href=\"%@\">público</a> para ler e modificar."},"fr":{"SNPCollectShareLinkFieldText":"Lien","SNPCollectShareCopyButtonText":"Copier le lien","SNPScanStartButtonText":"Commencer à scanner","SNPScanReadErrorTextFormat":"Erreur de scanner: %@","SNPScanStopButtonText":"Arrêter de scanner","SNPScanParseErrorTextFormat":"Erreur d'analyse: %@","SNPMakeScanButtonText":"Scanner","SNPMakeTypesNoteButtonText":"texte","SNPMakeTypesSiteButtonText":"lien","SNPMakeTypesEmailButtonText":"courriel","SNPMakeTypesPhoneButtonText":"téléphone","SNPMakeTypesContactButtonText":"contacte","SNPMakeHeadingText":"Faire un code","SNPDownloadHeadingText":"Opções de arquivo","SNPCollectDetailToolbarBackButtonText":"Retour","SNPCollectDetailToolbarCloneButtonText":"Cloner","SNPCollectDetailToolbarDiscardButtonText":"Jeter","SNPCollectDetailFormNameFieldText":"Nom","SNPCollectDetailDataFieldText":"Données","SNPCollectDetailDataOpenButtonText":"Ouvrir","SNPFormBaseSaveButtonText":"Sauvegarder","SNPFormWifiNetworkFieldText":"Nom du réseau","SNPFormWifiPasswordFieldText":"Mot de passe","SNPFormWifiSecurityNoneOptionText":"Aucun","SNPFormNoteFieldText":"texte","SNPFormContactFirstNameFieldText":"Prénom","SNPFormContactLastNameFieldText":"Nom de famille","SNPFormContactPhoneFieldText":"Téléphone","SNPFormContactEmailFieldText":"Courriel","SNPFormContactSiteFieldText":"Lien","SNPFormContactOrganizationFieldText":"Organisation","SNPVitrineTitle":"Sharesnip","SNPVitrineDescription":"Créer ou numériser rapidement des codes QR","OLSKLandingBlurbText":"Aucune option de personnalisation.","SNPGuideTitle":"Guide Sharesnip","SNPGuideDescription":"Documentation du projet","SNPGenerateShareLinkTextFormat":"Partager %@","SNPGenerateReadErrorNoCamerasText":"Aucune appareil photo disponible","SNPGenerateTitle":"Générateur y scanneur gratuit de codes QR","SNPCollectTitle":"Rassembler","SNPCollectToggleFormButtonText":"Ajouter","SNPCollectShareModalTitleText":"Partager","ROCORootLinkText":"Visiter rosano.ca","SWARLinkText":"Ça fait partie du Doorless App Ring","ROCOGlossaryHeadingText":"Une nouvelle génération d'applications","ROCOGlossaryDoorlessLinkText":"La philosophie 'doorless' (sans porte)","ROCOGlossaryDoorlessBlurbText":"Des applications comme espaces publics non exclusifs.","ROCOGlossaryZeroDataLinkText":"Apprendre plus à propos des applis Zero Data","ROCOGlossaryZeroDataBlurbText":"Être propriétaire de vos données, tout.","ROCOGlossaryGoingWebLinkText":"Entièrement sur le web","ROCOGlossaryGoingWebBlurbText":"Pourquoi j'ai arrêté de faire des applications iOS après douze ans.","ROCOGlossaryAppsLinkText":"Mes autres applications","ROCOGlossaryAppsBlurbText":"Outils pour la capacité d'agir","ROCOGazetteHeadingText":"Suivez mon parcours","ROCOBulletinSubmitButtonText":"S'inscrire à la liste de diffusion","ROCOBulletinFeedbackText":"Veuillez regarder votre boîte de réception (et aussi peut-être le dossier de pourriel) pour un lien d'activation.","OLSKWordingDownloadText":"Télécharger","OLSKWordingOpenApp":"Ouvrir l'app","OLSKWordingFeatures":"Fonctionnalités","OLSKWordingOpenGuide":"Voir le guide","OLSKWordingDeeperHeading":"Aller plus profond","OLSKWordingVideo":"Vidéo","OLSKWordingTestimonials":"Des témoignages","OLSKWordingFeedbackHeading":"Feedback","OLSKWordingFeedbackBlurb":"Dans l'application, touchez le bouton ℹ︎, puis sélectionnez « Envoyer des commentaires ».","OLSKWordingTypeToSearch":"Taper pour chercher","OLSKWordingTypeToFilter":"Taper pour filtrer","OLSKWordingConfirmText":"Êtes-vous sûr.e ?","OLSKWordingCancelText":"Annuler","OLSKWordingSubmitText":"Soumettre","OLSKWordingEditText":"Modifier","OLSKWordingDebugObjectText":"Déboguer cet objet","OLSKWebViewWindowButtonText":"Ouvrir dans une nouvelle fenêtre","OLSKTransportLauncherItemImportJSONText":"Importer JSON (béta)","OLSKTransportLauncherItemImportJSONErrorNotFilledAlertText":"Entrée non remplie","OLSKTransportLauncherItemImportJSONErrorNotValidAlertText":"Entrée non valide","OLSKTransportLauncherItemExportJSONText":"Exporter JSON (béta)","OLSKServiceWorkerUpdateAlertLabelText":"Mise à jour disponible","OLSKServiceWorkerUpdateAlertReloadButtonText":"Recharger","OLSKServiceWorkerLauncherItemReloadText":"Recharger","OLSKServiceWorkerLauncherItemDebugForceUpdateText":"Forcer mis à jour","OLSKRootLinkTextHome":"Retour à l'accueil","OLSKRemoteStorageLauncherItemOpenLoginLinkText":"Ouvrir lien d'accès","OLSKRemoteStorageLauncherItemOpenLoginLinkPromptText":"Lien d'accès","OLSKRemoteStorageLauncherItemCopyLoginLinkText":"Copier lien d'accès privé","OLSKRemoteStorageLauncherItemDebugFlushDataText":"Flusher les données","OLSKRemoteStorageLauncherItemDebugFlushDataConfirmText":"Êtes-vous sûr.e ?","OLSKRemoteStorageConnectConfirmText":"Veuillez brancher votre stockage afin de continuer. Souhaitez-vous faire ça maintenant ?","OLSKReloadButtonText":"Recharger","OLSKPlaceholderText":"Aucun article sélectionné","OLSKNarrowFilterFieldText":"Filtrer","OLSKModalViewCloseButtonText":"OK","OLSKLanguageSwitcherVersionFormat":"Version en %@ / %@","OLSKLanguageSwitcherVersionName":{"en":"anglais","fr":"français","es":"espagnol","pt":"portugais","de":"allemand"},"OLSKInstallAlertHeadingText":"Installer dans votre appareil","OLSKInstallAlertBlurbHTMLFormat":"Touchez <em>Partager</em> %$1@, puis <em>Ajouter à l'Écran d'accueil</em> %$2@","OLSKInstallAlertDismissButtonText":"Écarter","OLSKInputWrapperClearButtonText":"Effacer le texte","OLSKFundGrantErrorConnectionText":"Erreur de connexion","OLSKFundGrantErrorDecryptionText":"Erreur de déchiffrement","OLSKFundGrantErrorSigningText":"Erreur de signature","OLSKFundGrantErrorExpiredText":"Accès expiré","OLSKFundGateText":"Déverrouiller des documents sans limite en contribuant au projet. Souhaitez-vous le faire maintenant ?","OLSKFundWebViewTitleText":"Financer un projet","OLSKFundLauncherItemEnterClueText":"Entrer code de confirmation","OLSKFundLauncherItemEnterCluePromptText":"Entrer code de confirmation","OLSKFundLauncherItemClearClueText":"Enlever autorisation","OLSKFundLauncherItemClearClueConfirmText":"Êtes-vous sûr.e ?","OLSKFollowTextFormat":"Trouvez-moi sur %$1@ ou %$2@.","OLSKEditText":"Editer ceci","OLSKCloudRenewButtonText":"Renouveler","OLSKCloudStatusSyncStartButtonText":"Synchroniser","OLSKCloudStatusSyncStopButtonText":"Stop","OLSKCloudStatusDisconnectButtonText":"Débrancher","OLSKCloudStatusDisconnectConfirmText":"Êtes-vous sûr.e ?","OLSKCloudFormConnectButtonText":"Brancher","OLSKCloudFormRegisterLinkText":"Obtenir stockage","OLSKCatalogMasterPlaceholderText":"Appuyez sur + pour créer un article.","OLSKCatalogStashPlaceholderTextFormat":"Articles sélectionnés : %@","OLSKAproposHeadingText":"À propos","OLSKAproposFeedbackButtonText":"Envoyer des commentaires","OLSKAproposShareButtonText":"Dire à un ami.e","OLSKAppToolbarCloudStatusOnline":"En ligne","OLSKAppToolbarCloudStatusOffline":"Hors connexion","OLSKAppToolbarCloudStatusError":"Erreur","OLSKAppToolbarAproposButtonText":"Plus d'info","OLSKAppToolbarLanguageButtonText":"Langage","OLSKAppToolbarGuideLinkText":"Guide","OLSKAppToolbarFundButtonText":"Financer","OLSKAppToolbarClubButtonText":"Adhésion","OLSKAppToolbarLauncherButtonText":"Lanceur","OLSKAppToolbarCloudButtonText":"Stockage","OLSKAppFeatureListArray":[["Accessible partout.","Fonctionne sur les appareils mobiles, les tablettes et les ordinateurs de bureau."],["Pas de Wi-Fi, pas de problème.","Fonctionne hors ligne sans accès à Internet."],["Vos données en tous vos appareils.","Synchronisation automatique sur le cloud avec remoteStorage ou Fission."],["Flux de travail efficace.","Raccourcis clavier pour la plupart des choses."],["Déplacer les données librement.","Importer et exporter des données JSON (béta)."],["Blind-friendly.","Étiquettes de texte sur tous les éléments."],["Privé, pas effrayant.","Pas d'analyse comportementale ni de traceurs intersites."],["Vos données vous appartiennent.","100% à vous dans une application <a href=\"https://0data.app\">0data</a>."]],"OLSKAppFeatureOpenSourceNameText":"Source ouvert.","OLSKAppFeatureOpenSourceBlurbFormat":"Le code is <a href=\"%@\">public</a> pour lire et modifier."},"es":{"SNPCollectShareLinkFieldText":"Enlace","SNPCollectShareCopyButtonText":"Copiar enlace","SNPScanStartButtonText":"Empezar escanear","SNPScanReadErrorTextFormat":"Error de escaneo: %@","SNPScanStopButtonText":"Dejar escanear","SNPScanParseErrorTextFormat":"Error de analizar: %@","SNPMakeScanButtonText":"Escanear","SNPMakeTypesNoteButtonText":"texto","SNPMakeTypesSiteButtonText":"enlace","SNPMakeTypesEmailButtonText":"correo","SNPMakeTypesPhoneButtonText":"teléfono","SNPMakeTypesContactButtonText":"contacto","SNPMakeHeadingText":"Hacer un código","SNPDownloadHeadingText":"Opciones de archivo","SNPCollectDetailToolbarBackButtonText":"Volver","SNPCollectDetailToolbarCloneButtonText":"Clonar","SNPCollectDetailToolbarDiscardButtonText":"Descartar","SNPCollectDetailFormNameFieldText":"Nombre","SNPCollectDetailDataFieldText":"Datos","SNPCollectDetailDataOpenButtonText":"Abrir","SNPFormBaseSaveButtonText":"Guarder","SNPFormWifiNetworkFieldText":"Nombre de la red","SNPFormWifiPasswordFieldText":"Contraseña","SNPFormWifiSecurityNoneOptionText":"Ninguno","SNPFormNoteFieldText":"texto","SNPFormContactFirstNameFieldText":"Nombre","SNPFormContactLastNameFieldText":"Apellido","SNPFormContactPhoneFieldText":"Teléfono","SNPFormContactEmailFieldText":"Correo","SNPFormContactSiteFieldText":"Enlace","SNPFormContactOrganizationFieldText":"Organización","SNPVitrineTitle":"Sharesnip","SNPVitrineDescription":"Crear o escanear rápidamente códigos QR","OLSKLandingBlurbText":"Cero opciones de personalización.","SNPGuideTitle":"Guía de Sharesnip","SNPGuideDescription":"Documentación para el proyecto","SNPGenerateShareLinkTextFormat":"Compartir %@","SNPGenerateReadErrorNoCamerasText":"No hay cámaras disponibles","SNPGenerateTitle":"Generador e escáner gratis de códigos QR","SNPCollectTitle":"Juntar","SNPCollectToggleFormButtonText":"Añadir","SNPCollectShareModalTitleText":"Compartir","ROCORootLinkText":"Visitar rosano.ca","SWARLinkText":"Hace parte del Doorless App Ring","ROCOGlossaryHeadingText":"Una nueva clase de aplicaciones","ROCOGlossaryDoorlessLinkText":"Filosofía 'doorless' (sin puerta)","ROCOGlossaryDoorlessBlurbText":"Las aplicaciones como espacios públicos no excluyentes.","ROCOGlossaryZeroDataLinkText":"Aprender más sobre applicaciónes Zero Data","ROCOGlossaryZeroDataBlurbText":"Ser dueno de tus datos, todos ellos.","ROCOGlossaryGoingWebLinkText":"Totalmente web","ROCOGlossaryGoingWebBlurbText":"Por qué dejé de hacer aplicaciones iOS después de doce años.","ROCOGlossaryAppsLinkText":"Mis otras aplicaciones","ROCOGlossaryAppsBlurbText":"Herramientas para la agencia","ROCOGazetteHeadingText":"Sigue mi viaje","ROCOBulletinSubmitButtonText":"Suscribirse a la lista de correo","ROCOBulletinFeedbackText":"Mira tu bandeja de entrada (y quizá también la carpeta de spam) para un enlace de activación.","OLSKWordingDownloadText":"Descargar","OLSKWordingOpenApp":"Abrir app","OLSKWordingFeatures":"Características","OLSKWordingOpenGuide":"Ver la guía","OLSKWordingDeeperHeading":"Profundizar más","OLSKWordingVideo":"Video","OLSKWordingTestimonials":"Recomendaciones","OLSKWordingFeedbackHeading":"Feedback","OLSKWordingFeedbackBlurb":"Desde dentro de la aplicación, toca el botón ℹ︎, y después elegir \"Enviar feedback\".","OLSKWordingTypeToSearch":"Escribir para buscar","OLSKWordingTypeToFilter":"Escribir para filtrar","OLSKWordingConfirmText":"¿Est@as segur@?","OLSKWordingCancelText":"Cancelar","OLSKWordingSubmitText":"Enviar","OLSKWordingEditText":"Editar","OLSKWordingDebugObjectText":"Depurar este objeto","OLSKWebViewWindowButtonText":"Abrir en una nueva ventana","OLSKTransportLauncherItemImportJSONText":"Importar JSON (beta)","OLSKTransportLauncherItemImportJSONErrorNotFilledAlertText":"Entrada no cargada","OLSKTransportLauncherItemImportJSONErrorNotValidAlertText":"Entrada no valida","OLSKTransportLauncherItemExportJSONText":"Exportar JSON (beta)","OLSKServiceWorkerUpdateAlertLabelText":"Actualización disponible","OLSKServiceWorkerUpdateAlertReloadButtonText":"Recargar","OLSKServiceWorkerLauncherItemReloadText":"Recargar","OLSKServiceWorkerLauncherItemDebugForceUpdateText":"Forzar actualización","OLSKRootLinkTextHome":"Regresar a la pagina de inicio","OLSKRemoteStorageLauncherItemOpenLoginLinkText":"Abrir enlace de acceso","OLSKRemoteStorageLauncherItemOpenLoginLinkPromptText":"Enlace de acceso","OLSKRemoteStorageLauncherItemCopyLoginLinkText":"Copiar enlace de acceso privado","OLSKRemoteStorageLauncherItemDebugFlushDataText":"Pulgar los datos","OLSKRemoteStorageLauncherItemDebugFlushDataConfirmText":"Estás segur@?","OLSKRemoteStorageConnectConfirmText":"Conecta tu almacenamiento para continuar. ¿Te gustaría hacer esto ahora?","OLSKReloadButtonText":"Recargar","OLSKPlaceholderText":"Ningún artículo seleccionado","OLSKNarrowFilterFieldText":"Filtrar","OLSKModalViewCloseButtonText":"OK","OLSKLanguageSwitcherVersionFormat":"Versión en %@ / %@","OLSKLanguageSwitcherVersionName":{"en":"Inglés","fr":"Francés","es":"Español","pt":"Portugués","de":"Alemán"},"OLSKInstallAlertHeadingText":"Instalar en tu dispositivo","OLSKInstallAlertBlurbHTMLFormat":"Toca <em>Compartir</em> %$1@, y después <em>Adicionar a la Tela de Inicio</em> %$2@","OLSKInstallAlertDismissButtonText":"Descartar","OLSKInputWrapperClearButtonText":"Despejar el texto","OLSKFundGrantErrorConnectionText":"Error de conexión","OLSKFundGrantErrorDecryptionText":"Error de deciframiento","OLSKFundGrantErrorSigningText":"Error de signatura","OLSKFundGrantErrorExpiredText":"Acceso vencido","OLSKFundGateText":"Desbloquear documentos ilimitados por contribuir al proyecto. ¿Te gustaría hacer eso ahora?","OLSKFundWebViewTitleText":"Financiar un proyecto","OLSKFundLauncherItemEnterClueText":"Entrar código de confirmación","OLSKFundLauncherItemEnterCluePromptText":"Entrar código de confirmación","OLSKFundLauncherItemClearClueText":"Despejar autorización","OLSKFundLauncherItemClearClueConfirmText":"¿Est@s segur@?","OLSKFollowTextFormat":"Encuentre-me en %$1@ o %$2@.","OLSKEditText":"Editar eso","OLSKCloudRenewButtonText":"Renovar","OLSKCloudStatusSyncStartButtonText":"Sincronizar","OLSKCloudStatusSyncStopButtonText":"Parar","OLSKCloudStatusDisconnectButtonText":"Desconectar","OLSKCloudStatusDisconnectConfirmText":"¿Estás segur@?","OLSKCloudFormConnectButtonText":"Conectar","OLSKCloudFormRegisterLinkText":"Conseguir almacenamiento","OLSKCatalogMasterPlaceholderText":"Pulse + para crear un artículo.","OLSKCatalogStashPlaceholderTextFormat":"Artículo seleccionados: %@","OLSKAproposHeadingText":"Sobre","OLSKAproposFeedbackButtonText":"Enviar feedback","OLSKAproposShareButtonText":"Decirlo a un amig@","OLSKAppToolbarCloudStatusOnline":"En líneo","OLSKAppToolbarCloudStatusOffline":"Sin conexión","OLSKAppToolbarCloudStatusError":"Error","OLSKAppToolbarAproposButtonText":"Más información","OLSKAppToolbarLanguageButtonText":"Lenguaje","OLSKAppToolbarGuideLinkText":"Guía","OLSKAppToolbarFundButtonText":"Financiar","OLSKAppToolbarClubButtonText":"Membresía","OLSKAppToolbarLauncherButtonText":"Lanzador","OLSKAppToolbarCloudButtonText":"Almacenamiento","OLSKAppFeatureListArray":[["Accesible en cualquier lugar.","Foncione en dispositivos mobiles, tabletas y computadoras."],["Sin Wi-Fi, sin problema.","Foncione offline sin acesso al internet."],["Tus dados en todos tus dispositivos.","Sincronizar al nube automáticamente con remoteStorage o Fission."],["Flujo de trabajo eficiente.","Atajos de teclado para la mayoría de las cosas."],["Mueve los datos libremente.","Importar y exportar datos JSON (beta)"],["Blind-friendly.","Etiquetas de texto en todos los elementos."],["Privado, no creepy.","No hay análisis de comportamiento ni rastreadores inter-sitios."],["Ser dueno de tus datos.","100% tuyo en una aplicación <a href=\"https://0data.app\">0data</a>."]],"OLSKAppFeatureOpenSourceNameText":"Código aberto.","OLSKAppFeatureOpenSourceBlurbFormat":"El código es <a href=\"%@\">público</a> para leer e modificar."},"en":{"SNPCollectShareLinkFieldText":"Link","SNPCollectShareCopyButtonText":"Copy link","SNPScanStartButtonText":"Start scanning","SNPScanReadErrorTextFormat":"Scan error: %@","SNPScanStopButtonText":"Stop scanning","SNPScanParseErrorTextFormat":"Parse error: %@","SNPMakeScanButtonText":"Scan","SNPMakeTypesNoteButtonText":"text","SNPMakeTypesSiteButtonText":"link","SNPMakeTypesEmailButtonText":"email","SNPMakeTypesPhoneButtonText":"phone","SNPMakeTypesContactButtonText":"contact","SNPMakeHeadingText":"Make a code","SNPDownloadHeadingText":"File options","SNPCollectDetailToolbarBackButtonText":"Back","SNPCollectDetailToolbarCloneButtonText":"Clone","SNPCollectDetailToolbarDiscardButtonText":"Discard","SNPCollectDetailFormNameFieldText":"Name","SNPCollectDetailDataFieldText":"Data","SNPCollectDetailDataOpenButtonText":"Open","SNPFormBaseSaveButtonText":"Save","SNPFormWifiNetworkFieldText":"Network name","SNPFormWifiPasswordFieldText":"Password","SNPFormWifiSecurityNoneOptionText":"None","SNPFormNoteFieldText":"text","SNPFormContactFirstNameFieldText":"First name","SNPFormContactLastNameFieldText":"Last name","SNPFormContactPhoneFieldText":"Phone","SNPFormContactEmailFieldText":"E-mail","SNPFormContactSiteFieldText":"Link","SNPFormContactOrganizationFieldText":"Organization","SNPVitrineTitle":"Sharesnip","SNPVitrineDescription":"Quickly create or scan QR codes.","OLSKLandingBlurbText":"Zero customization options.","SNPGuideTitle":"Sharesnip Guide","SNPGuideDescription":"Documentation for project","SNPGenerateShareLinkTextFormat":"Share %@","SNPGenerateReadErrorNoCamerasText":"No available cameras","SNPGenerateTitle":"Free QR code generator and scanner","SNPCollectTitle":"Collect","SNPCollectToggleFormButtonText":"Add","SNPCollectShareModalTitleText":"Share","ROCORootLinkText":"Visit rosano.ca","SWARLinkText":"Part of the Doorless App Ring","ROCOGlossaryHeadingText":"A new breed of apps","ROCOGlossaryDoorlessLinkText":"Doorless philosophy","ROCOGlossaryDoorlessBlurbText":"Apps as non-exclusionary public spaces.","ROCOGlossaryZeroDataLinkText":"Learn more about Zero Data apps","ROCOGlossaryZeroDataBlurbText":"Own your data, 100%","ROCOGlossaryGoingWebLinkText":"Going fully web","ROCOGlossaryGoingWebBlurbText":"Why I stopped making iOS apps after twelve years.","ROCOGlossaryAppsLinkText":"My other apps","ROCOGlossaryAppsBlurbText":"Tools for agency","ROCOGazetteHeadingText":"Follow my journey","ROCOBulletinSubmitButtonText":"Subscribe to mailing list","ROCOBulletinFeedbackText":"Check your inbox (and maybe the spam folder) for an activation link.","OLSKWordingDownloadText":"Download","OLSKWordingOpenApp":"Open app","OLSKWordingFeatures":"Features","OLSKWordingOpenGuide":"See the guide","OLSKWordingDeeperHeading":"Go deeper","OLSKWordingVideo":"Video","OLSKWordingTestimonials":"Testimonials","OLSKWordingFeedbackHeading":"Feedback","OLSKWordingFeedbackBlurb":"From within the app, tap the ℹ︎ button, then select \"Send feedback\".","OLSKWordingTypeToSearch":"Type to search","OLSKWordingTypeToFilter":"Type to filter","OLSKWordingConfirmText":"Are you sure?","OLSKWordingCancelText":"Cancel","OLSKWordingSubmitText":"Submit","OLSKWordingEditText":"Edit","OLSKWordingDebugObjectText":"Debug this object","OLSKWebViewWindowButtonText":"Open in new window","OLSKTransportLauncherItemImportJSONText":"Import JSON (beta)","OLSKTransportLauncherItemImportJSONErrorNotFilledAlertText":"Input not filled","OLSKTransportLauncherItemImportJSONErrorNotValidAlertText":"Input not valid","OLSKTransportLauncherItemExportJSONText":"Export JSON (beta)","OLSKServiceWorkerUpdateAlertLabelText":"Update available","OLSKServiceWorkerUpdateAlertReloadButtonText":"Reload","OLSKServiceWorkerLauncherItemReloadText":"Reload","OLSKServiceWorkerLauncherItemDebugForceUpdateText":"Force update","OLSKRootLinkTextHome":"Return to the homepage","OLSKRemoteStorageLauncherItemOpenLoginLinkText":"Open access link","OLSKRemoteStorageLauncherItemOpenLoginLinkPromptText":"Access link","OLSKRemoteStorageLauncherItemCopyLoginLinkText":"Copy private access link","OLSKRemoteStorageLauncherItemDebugFlushDataText":"Flush data","OLSKRemoteStorageLauncherItemDebugFlushDataConfirmText":"Are you sure?","OLSKRemoteStorageConnectConfirmText":"Connect your cloud to continue. Would you like to do this now?","OLSKReloadButtonText":"Reload","OLSKPlaceholderText":"No item selected","OLSKNarrowFilterFieldText":"Filter","OLSKModalViewCloseButtonText":"Done","OLSKLanguageSwitcherVersionFormat":"Version in %@ / %@","OLSKLanguageSwitcherVersionName":{"en":"English","fr":"French","es":"Spanish","pt":"Portuguese","de":"German"},"OLSKInstallAlertHeadingText":"Install on your device","OLSKInstallAlertBlurbHTMLFormat":"Tap <em>Share</em> %$1@, then <em>Add to Home Screen</em> %$2@","OLSKInstallAlertDismissButtonText":"Dismiss","OLSKInputWrapperClearButtonText":"Clear text","OLSKFundGrantErrorConnectionText":"Connection error","OLSKFundGrantErrorDecryptionText":"Decryption error","OLSKFundGrantErrorSigningText":"Signing error","OLSKFundGrantErrorExpiredText":"Access expired","OLSKFundGateText":"Unlock unlimited documents by making a contribution to the project. Would you like to do this now?","OLSKFundWebViewTitleText":"Fund a project","OLSKFundLauncherItemEnterClueText":"Enter confirmation code","OLSKFundLauncherItemEnterCluePromptText":"Enter confirmation code","OLSKFundLauncherItemClearClueText":"Clear authorization","OLSKFundLauncherItemClearClueConfirmText":"Are you sure?","OLSKFollowTextFormat":"Find me on %$1@ or %$2@.","OLSKEditText":"Edit this","OLSKCloudRenewButtonText":"Renew","OLSKCloudStatusSyncStartButtonText":"Sync","OLSKCloudStatusSyncStopButtonText":"Stop","OLSKCloudStatusDisconnectButtonText":"Disconnect","OLSKCloudStatusDisconnectConfirmText":"Are you sure?","OLSKCloudFormConnectButtonText":"Connect","OLSKCloudFormRegisterLinkText":"Get a cloud","OLSKCatalogMasterPlaceholderText":"Tap + to create an item.","OLSKCatalogStashPlaceholderTextFormat":"Items selected: %@","OLSKAproposHeadingText":"About","OLSKAproposFeedbackButtonText":"Send feedback","OLSKAproposShareButtonText":"Tell a friend","OLSKAppToolbarCloudStatusOnline":"Online","OLSKAppToolbarCloudStatusOffline":"Offline","OLSKAppToolbarCloudStatusError":"Error","OLSKAppToolbarAproposButtonText":"More info","OLSKAppToolbarLanguageButtonText":"Language","OLSKAppToolbarGuideLinkText":"Guide","OLSKAppToolbarFundButtonText":"Fund","OLSKAppToolbarClubButtonText":"Membership","OLSKAppToolbarLauncherButtonText":"Launcher","OLSKAppToolbarCloudButtonText":"Cloud","OLSKAppFeatureListArray":[["Accessible anywhere.","Works on mobile, tablet, and desktop devices."],["No Wi-Fi, no problem.","Works offline without internet access."],["Your data on all your devices.","Automatic cloud sync with remoteStorage or Fission."],["Efficient workflow.","Keyboard shortcuts for most things."],["Move data freely.","Import and export JSON data (beta)."],["Blind-friendly.","Text labels on all elements."],["Private, not creepy.","No behavioural analytics or cross-site trackers."],["Own your data.","100% yours in a <a href=\"https://0data.app\">0data</a> app."]],"OLSKAppFeatureOpenSourceNameText":"Open-source.","OLSKAppFeatureOpenSourceBlurbFormat":"The code is <a href=\"%@\">public</a> to read and modify."},"de":{"ROCORootLinkText":"Besuchen rosano.ca","ROCOGazetteHeadingText":"Folge meine Reise","ROCOBulletinSubmitButtonText":"Abonniere dir die Mailingliste","ROCOBulletinFeedbackText":"Schau in deinem Posteingang (und vielleicht im Spam-Ordner) nach einem Aktivierungslink.","OLSKRootLinkTextHome":"Zurück zur Homepage","OLSKLanguageSwitcherVersionFormat":"Versão no %@ / %@","OLSKLanguageSwitcherVersionName":{"en":"Englisch","fr":"Französisch","es":"Spanisch","pt":"Portugiesisch","de":"Deutsch"}},"compilation":{"/Users/rozano/Mega/jbx/jbx-web/os-app/open-guide/i18n.pt.yml":{"JBXGuideTitle":"Guia Joybox","JBXGuideDescription":"Documentação do projeto"},"/Users/rozano/Mega/jbx/jbx-web/os-app/open-play/i18n.pt.yml":{"JBXPlayTitle":"Tocar","JBXPlayStashButtonText":"Empilhar","JBXPlayToggleFormButtonText":"Adicionar","JBXPlayClearInboxButtonText":"Limpar caixa de entrada","JBXPlayFormFieldText":"Cole seus links aqui.","JBXPlayFormSubmitButtonText":"Enviar","JBXPlayChunkInboxText":"Caixa de entrada","JBXPlayChunkTodayText":"Hoje","JBXPlayChunkYesterdayText":"Ontem","JBXPlayChunkArchiveText":"Arquivo","JBXPlayRevealArchiveButtonText":"Revelar o arquivo","JBXPlayShareModalTitleText":"Compartilhar"},"/Users/rozano/Mega/jbx/jbx-web/os-app/open-vitrine/i18n.pt.yml":{"JBXVitrineTitle":"Joybox","JBXVitrineDescription":"A pinboard for media.","OLSKLandingBlurbText":"Coletar, tocar e compartilhar múltiplas plataformas em um só lugar."},"/Users/rozano/Mega/jbx/jbx-web/os-app/sub-detail/i18n.pt.yml":{"JBXPlayDetailToolbarBackButtonText":"Voltar","JBXPlayDetailToolbarQueueButtonText":"Adicionar à coleção","JBXPlayDetailToolbarArchiveButtonText":"Arquivar","JBXPlayDetailToolbarUnarchiveButtonText":"Desarquivar","JBXPlayDetailToolbarDiscardButtonText":"Descartar","JBXPlayDetailDiscardConfirmText":"Você tem certeza?","JBXPlayDetailMediaURLFieldText":"URL","JBXPlayDetailMediaOpenButtonText":"Abrir","JBXPlayDetailMediaFetchButtonText":"Buscar","JBXPlayDetailFormNameFieldText":"Nome","JBXPlayDetailFormNotesFieldText":"Notas"},"/Users/rozano/Mega/jbx/jbx-web/os-app/sub-share/i18n.pt.yml":{"JBXPlayShareLinkFieldText":"Link","JBXPlayShareCopyButtonText":"Copiar link"}}}[window.OLSKPublicConstants('OLSKSharedPageCurrentLanguage')]);
    	};
    }
    });

    unwrapExports(main);
    var main_1 = main.OLSKLocalized;

    var main$1 = createCommonjsModule(function (module, exports) {
    (function(global, factory) {
    	 factory(exports) ;
    }(commonjsGlobal, (function(exports) {
    	const mod = {

    		OLSKStringFormatted (inputData) {
    			if (typeof inputData !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			var substitutions = Object.values(arguments).slice(1);

    			if (!substitutions.length) {
    				return inputData;
    			}

    			var formattedString = inputData;

    			(inputData.match(/%@/g) || []).forEach(function(e, i) {
    				formattedString = formattedString.replace(e, substitutions[i]);
    			});

    			mod._OLSKStringAllMatches(/%\$(\d*)@/g, inputData).forEach(function(e) {
    				formattedString = formattedString.replace(e[0], substitutions[e[1] - 1]);
    			});

    			return formattedString;
    		},

    		_OLSKStringAllMatches (regex, string) {
    			var matches = [];

    			var match = regex.exec(string);

    			while (match != null) {
    				matches.push(match);

    				match = regex.exec(string);
    			}

    			return matches;
    		},

    		OLSKStringReplaceTokens (param1, param2) {
    			if (typeof param1 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof param2 !== 'object' || param2 === null) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return Object.entries(param2).reduce(function (coll, item) {
    				return coll.replace(new RegExp(item.shift(), 'g'), item.pop());
    			}, param1);
    		},

    		OLSKStringPatch (param1, param2, param3) {
    			if (typeof param1 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof param2 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof param3 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (!param1.includes(param2) && !param1.includes(param3)) {
    				console.error(`source includes neither of "${ param2 }" or "${ param3 }"`);
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (param3.includes(param2)) {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return param1.split(param2).join(param3);
    		},

    		OLSKStringMatch (param1, param2, param3 = 'includes') {
    			if (typeof param1 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof param2 !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			if (typeof param3 !== 'undefined') {
    				if (typeof param3 !== 'string') {
    					throw new Error('OLSKErrorInputNotValid');
    				}
    			}

    			// Searching and sorting text with diacritical marks in JavaScript | Thread Engineering https://thread.engineering/2018-08-29-searching-and-sorting-text-with-diacritical-marks-in-javascript/
    			return param2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')[param3](param1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    		},

    		OLSKStringSnippet (inputData) {
    			if (typeof inputData !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return inputData.length <= 100 ? inputData : inputData.slice(0, 100).split(' ').slice(0, -1).join(' ').concat('…');
    		},

    		OLSKStringEncode (inputData) {
    			if (typeof inputData !== 'string') {
    				throw new Error('OLSKErrorInputNotValid');
    			}

    			return mod.OLSKStringReplaceTokens(encodeURIComponent(inputData), {
    				'\\(': '%28',
    				'\\)': '%29',
    			});
    		},

    	};

    	Object.assign(exports, mod);

    	Object.defineProperty(exports, '__esModule', {
    		value: true
    	});

    })));

    {
    	exports.OLSKFormatted = exports.OLSKStringFormatted;
    }
    });

    var OLSKString = unwrapExports(main$1);
    var main_1$1 = main$1.OLSKFormatted;

    var main$2 = createCommonjsModule(function (module, exports) {
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

    		return _require().globSync('**/ui-test-*.js', {
    			cwd: inputData,
    			absolute: true,
    		}).filter(function (e) {
    			return !e.match(_require().OLSKDiskStandardIgnorePattern());
    		});
    	},

    	OLSKSpecUITestPathsFilterFunction (inputData) {
    		if (!Array.isArray(inputData)) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		const args = inputData.slice();

    		let include = args.filter(function (e) {
    			return e.match(/^-?-?os-match=(.+)/i)
    		}).shift();

    		if (include) {
    			args.splice(args.indexOf(include), 1);

    			include = include.match(/^-?-?os-match=(.+)/i)[1];

    			const regex = include.match(/^\/(.+)\/(.+)?$/);

    			if (regex) {
    				include = new RegExp(regex[1], regex[2]);
    			}
    		}
    		
    		let exclude = args.filter(function (e) {
    			return e.match(/^-?-?os-skip=(.+)/i)
    		}).shift();

    		if (exclude) {
    			args.splice(args.indexOf(exclude), 1);

    			exclude = exclude.match(/^-?-?os-skip=(.+)/i)[1];

    			const regex = exclude.match(/^\/(.+)\/(.+)?$/);

    			if (regex) {
    				exclude = new RegExp(regex[1], regex[2]);
    			}
    		}

    		return function (e) {
    			if (include && e.match(include)) {
    				return true;
    			}
    			
    			if (exclude && e.match(exclude)) {
    				return false;
    			}

    			if (include && !e.match(include)) {
    				return false;
    			}
    			
    			if (exclude && !e.match(exclude)) {
    				return true;
    			}
    			
    			return true;
    		};
    	},

    	OLSKSpecUISourcePaths (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!_require().OLSKDiskIsRealFolderPath(inputData)) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return _require().globSync('**/+(ui-behaviour.js|*.ejs|*.md|*.html|*.hbs)', {
    			cwd: inputData,
    			absolute: true,
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

    	OLSKSpecMochaStandardConfiguration (inputData) {
    		if (!Array.isArray(inputData)) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return [].concat.apply([], [
    			'--file', _require().join(__dirname, 'mocha-start.js'),
    			_require().existsSync(_require().join(process.cwd(), 'mocha-start.js')) ? ['--file', _require().join(process.cwd(), 'mocha-start.js')] : [],
    			inputData.includes('--reporter') ? [] : ['--reporter', 'min'],
    			inputData.length
    			? inputData
    			: [],
    		]);
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

    		if (navigator.userAgent.includes('HeadlessChrome')) {
    			return true;
    		}

    		return navigator.appName === 'Zombie';
    	};
    }
    });
    var main_1$2 = main$2.OLSK_SPEC_UI;

    var main$3 = createCommonjsModule(function (module, exports) {
    const mod = {

    	OLSKLanguageSwitcherCodesMap () {
    		return {
    			en: 'English',
    			fr: 'Français',
    			es: 'Español',
    			pt: 'Português',
    			de: 'Deutsch',
    		};
    	},

    	OLSKLanguageSwitcherLauncherFakeItemProxy () {
    		return {
    			LCHRecipeName: 'OLSKLanguageSwitcherLauncherFakeItemProxy',
    			LCHRecipeCallback () {},
    		};
    	},

    	OLSKLanguageSwitcherLauncherItemSwitch (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamLanguageCode !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamRouteConstant !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKCanonical !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: ['OLSKLanguageSwitcherLauncherItemSwitch', params.ParamLanguageCode].join('-'),
    			LCHRecipeName: mod.OLSKLanguageSwitcherCodesMap()[params.ParamLanguageCode],
    			LCHRecipeCallback () {
    				(debug.DebugWindow || window).location.href = params.OLSKCanonical(params.ParamRouteConstant, {
    					OLSKRoutingLanguage: params.ParamLanguageCode,
    				});
    			},
    			LCHRecipeIsExcluded () {
    				return !!params.ParamAuthorized;
    			},
    		};
    	},

    	OLSKLanguageSwitcherRecipes (params) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!Array.isArray(params.ParamLanguageCodes)) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamCurrentLanguage !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamSpecUI !== 'boolean') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return [
    			mod.OLSKLanguageSwitcherLauncherFakeItemProxy(),
    		].concat(params.ParamLanguageCodes.filter(function (e) {
    			return e !== params.ParamCurrentLanguage;
    		}).map(function (ParamLanguageCode) {
    			return mod.OLSKLanguageSwitcherLauncherItemSwitch(Object.assign(Object.assign(Object.assign({}, params), {}), {
    				ParamLanguageCode,
    			}))
    		})).filter(function (e) {
    			if (params.ParamSpecUI) {
    				return true;
    			}

    			return !(e.LCHRecipeSignature || e.LCHRecipeName).match(/Fake/);
    		});
    	},

    };

    Object.assign(exports, mod);
    });

    var main_1$3 = createCommonjsModule(function (module, exports) {
    const main = {

    	OLSKServiceWorkerModule (param1, param2, param3, param4) {
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

    			_DataVersionCacheName: 'OLSKServiceWorkerVersionCache-VERSION_ID_TOKEN',
    			_DataPersistenceCacheName: 'OLSKServiceWorkerPersistenceCache',
    			_DataOriginPage: 'ORIGIN_PAGE_PATH_TOKEN',

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

    				// if (!(event.request.referrer.match(/ORIGIN_PAGE_PATH_TOKEN/) && event.request.mode === 'no-cors') && !event.request.url.match(/ORIGIN_PAGE_PATH_TOKEN/)) {
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
    	},

    	OLSKServiceWorkerInitialization (param1, param2) {
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
    	},

    	OLSKServiceWorkerViewTemplate () {
    		return `(function() {
			const mod = (function ${ main.OLSKServiceWorkerModule.toString() })(self, caches, fetch, true);

			(function ${ main.OLSKServiceWorkerInitialization.toString() })(self, mod);
		})();`;
    	},

    	OLSKServiceWorkerView (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof inputData.VERSION_ID_TOKEN !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!inputData.VERSION_ID_TOKEN) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (inputData.VERSION_ID_TOKEN.match(/\s/)) {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof inputData.ORIGIN_PAGE_PATH_TOKEN !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!inputData.ORIGIN_PAGE_PATH_TOKEN) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return main.OLSKServiceWorkerViewTemplate()
    			.split('VERSION_ID_TOKEN').join(inputData.VERSION_ID_TOKEN)
    			.split('ORIGIN_PAGE_PATH_TOKEN').join(inputData.ORIGIN_PAGE_PATH_TOKEN);
    	},

    	OLSKServiceWorkerLauncherFakeItemProxy () {
    		return {
    			LCHRecipeName: 'OLSKServiceWorkerLauncherFakeItemProxy',
    			LCHRecipeCallback () {},
    		};
    	},

    	OLSKServiceWorkerLauncherItemReload (param1, OLSKLocalized) {
    		if (!param1.location) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKServiceWorkerLauncherItemReload',
    			LCHRecipeName: OLSKLocalized('OLSKServiceWorkerLauncherItemReloadText'),
    			LCHRecipeCallback () {
    				return param1.location.reload();
    			},
    		};
    	},

    	OLSKServiceWorkerLauncherItemDebugForceUpdate (param1, param2, OLSKLocalized) {
    		if (!param1.location) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!param2.serviceWorker) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKServiceWorkerLauncherItemDebugForceUpdate',
    			LCHRecipeName: OLSKLocalized('OLSKServiceWorkerLauncherItemDebugForceUpdateText'),
    			async LCHRecipeCallback () {
    				const item = await param2.serviceWorker.getRegistration();

    				if (item.waiting) {
    					return item.waiting.postMessage('OLSKServiceWorker_SkipWaiting');
    				}

    				param2.serviceWorker.controller.postMessage('OLSKServiceWorker_ClearVersionCache');

    				param1.location.reload();
    			},
    		};
    	},

    	OLSKServiceWorkerRecipes (param1, param2, param3, param4) {
    		if (!param1.location) {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (!param2.serviceWorker) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof param3 !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof param4 !== 'boolean') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return [
    			main.OLSKServiceWorkerLauncherFakeItemProxy(),
    			main.OLSKServiceWorkerLauncherItemReload(param1, param3),
    			main.OLSKServiceWorkerLauncherItemDebugForceUpdate(param1, param2, param3),
    		].filter(function (e) {
    			if (param4) {
    				return true;
    			}

    			return !(e.LCHRecipeSignature || e.LCHRecipeName).match(/Fake/);
    		});
    	},
    	
    };

    Object.assign(exports, main);
    });

    function createError(message) {
        var err = new Error(message);
        err.source = "ulid";
        return err;
    }
    // These values should NEVER change. If
    // they do, we're no longer making ulids!
    var ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
    var ENCODING_LEN = ENCODING.length;
    var TIME_MAX = Math.pow(2, 48) - 1;
    var TIME_LEN = 10;
    var RANDOM_LEN = 16;
    function randomChar(prng) {
        var rand = Math.floor(prng() * ENCODING_LEN);
        if (rand === ENCODING_LEN) {
            rand = ENCODING_LEN - 1;
        }
        return ENCODING.charAt(rand);
    }
    function encodeTime(now, len) {
        if (isNaN(now)) {
            throw new Error(now + " must be a number");
        }
        if (now > TIME_MAX) {
            throw createError("cannot encode time greater than " + TIME_MAX);
        }
        if (now < 0) {
            throw createError("time must be positive");
        }
        if (Number.isInteger(now) === false) {
            throw createError("time must be an integer");
        }
        var mod = void 0;
        var str = "";
        for (; len > 0; len--) {
            mod = now % ENCODING_LEN;
            str = ENCODING.charAt(mod) + str;
            now = (now - mod) / ENCODING_LEN;
        }
        return str;
    }
    function encodeRandom(len, prng) {
        var str = "";
        for (; len > 0; len--) {
            str = randomChar(prng) + str;
        }
        return str;
    }
    function detectPrng() {
        var allowInsecure = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : (typeof require === 'undefined' && typeof navigator !== 'undefined' && navigator.appName === 'Zombie');
        var root = arguments[1];

        if (!root) {
            root = typeof window !== "undefined" ? window : null;
        }
        var browserCrypto = root && (root.crypto || root.msCrypto);
        if (browserCrypto) {
            return function () {
                var buffer = new Uint8Array(1);
                browserCrypto.getRandomValues(buffer);
                return buffer[0] / 0xff;
            };
        } else {
            try {
                var nodeCrypto = require("crypto");
                return function () {
                    return nodeCrypto.randomBytes(1).readUInt8() / 0xff;
                };
            } catch (e) {}
        }
        if (allowInsecure) {
            return function () {
                return Math.random();
            };
        }
        throw createError("secure crypto unusable, insecure Math.random not allowed");
    }
    function factory(currPrng) {
        if (!currPrng) {
            currPrng = detectPrng();
        }
        return function ulid(seedTime) {
            if (isNaN(seedTime)) {
                seedTime = Date.now();
            }
            return encodeTime(seedTime, TIME_LEN) + encodeRandom(RANDOM_LEN, currPrng);
        };
    }
    var ulid = factory();

    var main$4 = createCommonjsModule(function (module, exports) {

    const mod = {

    	OLSKRemoteStorageChangeDelegateConflictSelectRecent (inputData) {
    		if (inputData.origin !== 'conflict') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (Object.entries(inputData.oldValue).filter(function (e) {
    			if (!e[0].match('ModificationDate')) {
    				return false;
    			}

    			return e[1] > inputData.newValue[e[0]];
    		}).length) {
    			return inputData.oldValue;
    		}

    		return inputData.newValue;
    	},

    	OLSKRemoteStorageIsCollection (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof inputData.OLSKRemoteStorageCollectionName !== 'string') {
    			return false;
    		}

    		if (!inputData.OLSKRemoteStorageCollectionName.trim()) {
    			return false;
    		}

    		if (typeof inputData.OLSKRemoteStorageCollectionExports !== 'object' || inputData.OLSKRemoteStorageCollectionExports === null) {
    			return false;
    		}

    		return true;
    	},

    	_OLSKRemoteStorageIsPath (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return !!inputData.trim();
    	},

    	OLSKRemoteStorageSafeCopy (inputData) {
    		return Object.keys(inputData).reduce(function (coll, item) {
    			if (item[0] !== '$') {
    				coll[item] = inputData[item];
    			}

    			return coll
    		}, {});
    	},

    	OLSKRemoteStoragePostJSONParse (inputData) {
    		if (!inputData) {
    			return inputData;
    		}

    		if (Array.isArray(inputData)) {
    			return inputData.map(mod.OLSKRemoteStoragePostJSONParse);
    		}

    		for (const key in inputData) {
    			if (key.slice(-4) === 'Date') {
    				inputData[key] = new Date(inputData[key]);
    			} else if (Array.isArray(inputData[key])) {
    				inputData[key].map(mod.OLSKRemoteStoragePostJSONParse);
    			} else if (typeof inputData[key] === 'object') {
    				mod.OLSKRemoteStoragePostJSONParse(inputData[key]);
    			}
    		}

    		return inputData;
    	},

    	OLSKRemoteStorageQueryFunction (param1, param2, param3, param4) {
    		if (typeof param1 !== 'function' || !param1.prototype) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof param2 !== 'object' || param2 === null || !param2.name) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof param3 !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof param4 !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return function (inputData) {
    			if (typeof inputData !== 'function') {
    				throw new Error('OLSKErrorInputNotValid');
    			}
    			const storageClient = new (param1)({
    				cache: false,
    				modules: [param2],
    			});

    			storageClient.access.claim(param2.name, 'rw');

    			storageClient.stopSync();

    			return new Promise(function (res, rej) {
    				let didReject, outputData;

    				storageClient.on('error', function (err) {
    					if (didReject) {
    						return;
    					}

    					didReject = true;
    					return rej(err);
    				});

    				storageClient.on('connected', async function () {
    					try {
    						outputData = await inputData(storageClient);
    					} catch (e) {
    						didReject = true;
    						return rej(e);
    					}

    					res(outputData);
    					
    					return storageClient.disconnect();
    				});

    				storageClient.connect(param3, param4);
    			});
    		};
    	},

    	OLSKRemoteStorageLauncherFakeItemProxy () {
    		return {
    			LCHRecipeName: 'OLSKRemoteStorageLauncherFakeItemProxy',
    			LCHRecipeCallback () {},
    		};
    	},

    	OLSKRemoteStorageLauncherItemFakeFlipConnected (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeName: 'OLSKRemoteStorageLauncherItemFakeFlipConnected',
    			LCHRecipeCallback () {
    				if (inputData.__ValueOLSKRemoteStorage) {
    					inputData._ValueOLSKRemoteStorage = inputData.__ValueOLSKRemoteStorage;
    					
    					delete inputData.__ValueOLSKRemoteStorage;

    					return inputData.OLSKRemoteStorageLauncherItemFakeFlipConnectedDidFinish();
    				}
    				inputData.__ValueOLSKRemoteStorage = inputData._ValueOLSKRemoteStorage;

    				inputData._ValueOLSKRemoteStorage = (inputData.__ValueOLSKRemoteStorage.access.scopes || []).reduce(function (coll, item) {
    					return Object.assign(coll, {
    						[item.name]: inputData.__ValueOLSKRemoteStorage[item.name],
    					});
    				}, Object.assign({}, inputData.__ValueOLSKRemoteStorage));
    				inputData._ValueOLSKRemoteStorage.connected = true;
    				inputData._ValueOLSKRemoteStorage.remote = Object.assign(inputData._ValueOLSKRemoteStorage.remote, {
    					userAddress: 'OLSK_REMOTE_STORAGE_FAKE_REMOTE_ADDRESS',
    					token: 'OLSK_REMOTE_STORAGE_FAKE_REMOTE_TOKEN',
    				});

    				inputData.OLSKRemoteStorageLauncherItemFakeFlipConnectedDidFinish();

    				if (typeof window !== 'undefined') {
    					window.FakeOLSKConnected = true;
    				}
    			},
    		};
    	},

    	OLSKRemoteStorageLauncherItemOpenLoginLink (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!params.ParamStorage.remote) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKRemoteStorageLauncherItemOpenLoginLink',
    			LCHRecipeName: params.OLSKLocalized('OLSKRemoteStorageLauncherItemOpenLoginLinkText'),
    			LCHRecipeCallback () {
    				const item = (debug.DebugWindow || window).prompt(params.OLSKLocalized('OLSKRemoteStorageLauncherItemOpenLoginLinkPromptText'));

    				if (!item) {
    					return;
    				}

    				(debug.DebugWindow || window).location.href = item;
    				(debug.DebugWindow || window).location.reload();
    			},
    			LCHRecipeIsExcluded () {
    				return !!params.ParamStorage.connected;
    			},
    		};
    	},

    	OLSKRemoteStorageLauncherItemCopyLoginLink (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!params.ParamStorage.remote) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKRemoteStorageLauncherItemCopyLoginLink',
    			LCHRecipeName: params.OLSKLocalized('OLSKRemoteStorageLauncherItemCopyLoginLinkText'),
    			LCHRecipeCallback () {
    				return this.api.LCHCopyToClipboard(`${ (debug.DebugWindow || window).location.href }#remotestorage=${ params.ParamStorage.remote.userAddress }&access_token=${ params.ParamStorage.remote.token }`.replace(/#+/g, '#'));
    			},
    			LCHRecipeIsExcluded () {
    				return !params.ParamStorage.connected;
    			},
    		};
    	},

    	OLSKRemoteStorageLauncherItemDebugFlushData (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!params.ParamStorage.remote) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKRemoteStorageLauncherItemDebugFlushData',
    			LCHRecipeName: params.OLSKLocalized('OLSKRemoteStorageLauncherItemDebugFlushDataText'),
    			async LCHRecipeCallback () {
    				if (!(debug.DebugWindow || window).confirm(params.OLSKLocalized('OLSKRemoteStorageLauncherItemDebugFlushDataConfirmText'))) {
    					return;
    				}

    				await Promise.all(Object.getOwnPropertyNames(params.ParamStorage).filter(function (e) {
    					return params.ParamStorage[e].__HOTFIX;
    				}).map(function (e) {
    					return params.ParamStorage[e].__HOTFIX.__OLSKRemoteStorageHotfixFlushData();
    				}));

    				return new Promise(function (res, rej) {
    					setTimeout(function() {
    						res((debug.DebugWindow || window).location.reload());
    					}, 1000);
    				});
    			},
    			LCHRecipeIsExcluded () {
    				return !params.ParamStorage.connected;
    			},
    		};
    	},

    	OLSKRemoteStorageRecipes (params) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamMod !== 'object' || params.ParamMod === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamSpecUI !== 'boolean') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return [
    			mod.OLSKRemoteStorageLauncherFakeItemProxy(),
    			mod.OLSKRemoteStorageLauncherItemFakeFlipConnected(params.ParamMod),
    			mod.OLSKRemoteStorageLauncherItemOpenLoginLink(params),
    			mod.OLSKRemoteStorageLauncherItemCopyLoginLink(params),
    			mod.OLSKRemoteStorageLauncherItemDebugFlushData(params),
    		].filter(function (e) {
    			if (params.ParamSpecUI) {
    				return true;
    			}

    			return !(e.LCHRecipeSignature || e.LCHRecipeName).match(/Fake/);
    		});
    	},

    };

    Object.assign(exports, mod);
    });

    var main$5 = createCommonjsModule(function (module, exports) {
    const mod = {

    	OLSKLinkRelativeURL (url, path) {
    		if (typeof url !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof path !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return (new URL(path, url)).href;
    	},

    	OLSKLinkCompareURL (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return inputData.toLowerCase().replace(/^https/, 'http').replace('www.', '').replace(/\/$/, '');
    	},

    	OLSKLinkValid (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		try {
    			if (new URL('', inputData).hostname) {
    				return true;
    			}
    		} catch (err) {
    			return false;
    		}
    	},

    	OLSKEmailValid (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (!inputData.match('@')) {
    			return '';
    		}

    		if (!inputData.split('@').shift().trim()) {
    			return '';
    		}

    		if (!inputData.split('@').pop().match(/\./)) {
    			return '';
    		}

    		if (inputData.split('@').pop().split('.').pop().trim().length < 2) {
    			return '';
    		}

    		if (!inputData.split('@').pop().split('.').shift().trim()) {
    			return '';
    		}

    		if (inputData.trim().match(/\s/)) {
    			return '';
    		}

    		return inputData.trim();
    	},

    };

    Object.assign(exports, mod);
    });

    var ical = createCommonjsModule(function (module) {
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2021 */

    /* jshint ignore:start */
    var ICAL;
    (function() {
      /* istanbul ignore next */
      {
        // CommonJS, where exports may be different each time.
        ICAL = module.exports;
      }
    })();
    /* jshint ignore:end */
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */

    /**
     * The number of characters before iCalendar line folding should occur
     * @type {Number}
     * @default 75
     */
    ICAL.foldLength = 75;


    /**
     * The character(s) to be used for a newline. The default value is provided by
     * rfc5545.
     * @type {String}
     * @default "\r\n"
     */
    ICAL.newLineChar = '\r\n';


    /**
     * Helper functions used in various places within ical.js
     * @namespace
     */
    ICAL.helpers = {
      /**
       * Compiles a list of all referenced TZIDs in all subcomponents and
       * removes any extra VTIMEZONE subcomponents. In addition, if any TZIDs
       * are referenced by a component, but a VTIMEZONE does not exist,
       * an attempt will be made to generate a VTIMEZONE using ICAL.TimezoneService.
       *
       * @param {ICAL.Component} vcal     The top-level VCALENDAR component.
       * @return {ICAL.Component}         The ICAL.Component that was passed in.
       */
      updateTimezones: function(vcal) {
        var allsubs, properties, vtimezones, reqTzid, i, tzid;

        if (!vcal || vcal.name !== "vcalendar") {
          //not a top-level vcalendar component
          return vcal;
        }

        //Store vtimezone subcomponents in an object reference by tzid.
        //Store properties from everything else in another array
        allsubs = vcal.getAllSubcomponents();
        properties = [];
        vtimezones = {};
        for (i = 0; i < allsubs.length; i++) {
          if (allsubs[i].name === "vtimezone") {
            tzid = allsubs[i].getFirstProperty("tzid").getFirstValue();
            vtimezones[tzid] = allsubs[i];
          } else {
            properties = properties.concat(allsubs[i].getAllProperties());
          }
        }

        //create an object with one entry for each required tz
        reqTzid = {};
        for (i = 0; i < properties.length; i++) {
          if ((tzid = properties[i].getParameter("tzid"))) {
            reqTzid[tzid] = true;
          }
        }

        //delete any vtimezones that are not on the reqTzid list.
        for (i in vtimezones) {
          if (vtimezones.hasOwnProperty(i) && !reqTzid[i]) {
            vcal.removeSubcomponent(vtimezones[i]);
          }
        }

        //create any missing, but registered timezones
        for (i in reqTzid) {
          if (
            reqTzid.hasOwnProperty(i) &&
            !vtimezones[i] &&
            ICAL.TimezoneService.has(i)
          ) {
            vcal.addSubcomponent(ICAL.TimezoneService.get(i).component);
          }
        }

        return vcal;
      },

      /**
       * Checks if the given type is of the number type and also NaN.
       *
       * @param {Number} number     The number to check
       * @return {Boolean}          True, if the number is strictly NaN
       */
      isStrictlyNaN: function(number) {
        return typeof(number) === 'number' && isNaN(number);
      },

      /**
       * Parses a string value that is expected to be an integer, when the valid is
       * not an integer throws a decoration error.
       *
       * @param {String} string     Raw string input
       * @return {Number}           Parsed integer
       */
      strictParseInt: function(string) {
        var result = parseInt(string, 10);

        if (ICAL.helpers.isStrictlyNaN(result)) {
          throw new Error(
            'Could not extract integer from "' + string + '"'
          );
        }

        return result;
      },

      /**
       * Creates or returns a class instance of a given type with the initialization
       * data if the data is not already an instance of the given type.
       *
       * @example
       * var time = new ICAL.Time(...);
       * var result = ICAL.helpers.formatClassType(time, ICAL.Time);
       *
       * (result instanceof ICAL.Time)
       * // => true
       *
       * result = ICAL.helpers.formatClassType({}, ICAL.Time);
       * (result isntanceof ICAL.Time)
       * // => true
       *
       *
       * @param {Object} data       object initialization data
       * @param {Object} type       object type (like ICAL.Time)
       * @return {?}                An instance of the found type.
       */
      formatClassType: function formatClassType(data, type) {
        if (typeof(data) === 'undefined') {
          return undefined;
        }

        if (data instanceof type) {
          return data;
        }
        return new type(data);
      },

      /**
       * Identical to indexOf but will only match values when they are not preceded
       * by a backslash character.
       *
       * @param {String} buffer         String to search
       * @param {String} search         Value to look for
       * @param {Number} pos            Start position
       * @return {Number}               The position, or -1 if not found
       */
      unescapedIndexOf: function(buffer, search, pos) {
        while ((pos = buffer.indexOf(search, pos)) !== -1) {
          if (pos > 0 && buffer[pos - 1] === '\\') {
            pos += 1;
          } else {
            return pos;
          }
        }
        return -1;
      },

      /**
       * Find the index for insertion using binary search.
       *
       * @param {Array} list            The list to search
       * @param {?} seekVal             The value to insert
       * @param {function(?,?)} cmpfunc The comparison func, that can
       *                                  compare two seekVals
       * @return {Number}               The insert position
       */
      binsearchInsert: function(list, seekVal, cmpfunc) {
        if (!list.length)
          return 0;

        var low = 0, high = list.length - 1,
            mid, cmpval;

        while (low <= high) {
          mid = low + Math.floor((high - low) / 2);
          cmpval = cmpfunc(seekVal, list[mid]);

          if (cmpval < 0)
            high = mid - 1;
          else if (cmpval > 0)
            low = mid + 1;
          else
            break;
        }

        if (cmpval < 0)
          return mid; // insertion is displacing, so use mid outright.
        else if (cmpval > 0)
          return mid + 1;
        else
          return mid;
      },

      /**
       * Convenience function for debug output
       * @private
       */
      dumpn: /* istanbul ignore next */ function() {
        if (!ICAL.debug) {
          return;
        }

        if (typeof (console) !== 'undefined' && 'log' in console) {
          ICAL.helpers.dumpn = function consoleDumpn(input) {
            console.log(input);
          };
        } else {
          ICAL.helpers.dumpn = function geckoDumpn(input) {
            dump(input + '\n');
          };
        }

        ICAL.helpers.dumpn(arguments[0]);
      },

      /**
       * Clone the passed object or primitive. By default a shallow clone will be
       * executed.
       *
       * @param {*} aSrc            The thing to clone
       * @param {Boolean=} aDeep    If true, a deep clone will be performed
       * @return {*}                The copy of the thing
       */
      clone: function(aSrc, aDeep) {
        if (!aSrc || typeof aSrc != "object") {
          return aSrc;
        } else if (aSrc instanceof Date) {
          return new Date(aSrc.getTime());
        } else if ("clone" in aSrc) {
          return aSrc.clone();
        } else if (Array.isArray(aSrc)) {
          var arr = [];
          for (var i = 0; i < aSrc.length; i++) {
            arr.push(aDeep ? ICAL.helpers.clone(aSrc[i], true) : aSrc[i]);
          }
          return arr;
        } else {
          var obj = {};
          for (var name in aSrc) {
            // uses prototype method to allow use of Object.create(null);
            /* istanbul ignore else */
            if (Object.prototype.hasOwnProperty.call(aSrc, name)) {
              if (aDeep) {
                obj[name] = ICAL.helpers.clone(aSrc[name], true);
              } else {
                obj[name] = aSrc[name];
              }
            }
          }
          return obj;
        }
      },

      /**
       * Performs iCalendar line folding. A line ending character is inserted and
       * the next line begins with a whitespace.
       *
       * @example
       * SUMMARY:This line will be fold
       *  ed right in the middle of a word.
       *
       * @param {String} aLine      The line to fold
       * @return {String}           The folded line
       */
      foldline: function foldline(aLine) {
        var result = "";
        var line = aLine || "", pos = 0, line_length = 0;
        //pos counts position in line for the UTF-16 presentation
        //line_length counts the bytes for the UTF-8 presentation
        while (line.length) {
          var cp = line.codePointAt(pos);
          if (cp < 128) ++line_length;
          else if (cp < 2048) line_length += 2;//needs 2 UTF-8 bytes
          else if (cp < 65536) line_length += 3;
          else line_length += 4; //cp is less than 1114112
          if (line_length < ICAL.foldLength + 1)
            pos += cp > 65535 ? 2 : 1;
          else {
            result += ICAL.newLineChar + " " + line.substring(0, pos);
            line = line.substring(pos);
            pos = line_length = 0;
          }
        }
        return result.substr(ICAL.newLineChar.length + 1);
      },

      /**
       * Pads the given string or number with zeros so it will have at least two
       * characters.
       *
       * @param {String|Number} data    The string or number to pad
       * @return {String}               The number padded as a string
       */
      pad2: function pad(data) {
        if (typeof(data) !== 'string') {
          // handle fractions.
          if (typeof(data) === 'number') {
            data = parseInt(data);
          }
          data = String(data);
        }

        var len = data.length;

        switch (len) {
          case 0:
            return '00';
          case 1:
            return '0' + data;
          default:
            return data;
        }
      },

      /**
       * Truncates the given number, correctly handling negative numbers.
       *
       * @param {Number} number     The number to truncate
       * @return {Number}           The truncated number
       */
      trunc: function trunc(number) {
        return (number < 0 ? Math.ceil(number) : Math.floor(number));
      },

      /**
       * Poor-man's cross-browser inheritance for JavaScript. Doesn't support all
       * the features, but enough for our usage.
       *
       * @param {Function} base     The base class constructor function.
       * @param {Function} child    The child class constructor function.
       * @param {Object} extra      Extends the prototype with extra properties
       *                              and methods
       */
      inherits: function(base, child, extra) {
        function F() {}
        F.prototype = base.prototype;
        child.prototype = new F();

        if (extra) {
          ICAL.helpers.extend(extra, child.prototype);
        }
      },

      /**
       * Poor-man's cross-browser object extension. Doesn't support all the
       * features, but enough for our usage. Note that the target's properties are
       * not overwritten with the source properties.
       *
       * @example
       * var child = ICAL.helpers.extend(parent, {
       *   "bar": 123
       * });
       *
       * @param {Object} source     The object to extend
       * @param {Object} target     The object to extend with
       * @return {Object}           Returns the target.
       */
      extend: function(source, target) {
        for (var key in source) {
          var descr = Object.getOwnPropertyDescriptor(source, key);
          if (descr && !Object.getOwnPropertyDescriptor(target, key)) {
            Object.defineProperty(target, key, descr);
          }
        }
        return target;
      }
    };
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */

    /** @namespace ICAL */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.design = (function() {

      var FROM_ICAL_NEWLINE = /\\\\|\\;|\\,|\\[Nn]/g;
      var TO_ICAL_NEWLINE = /\\|;|,|\n/g;
      var FROM_VCARD_NEWLINE = /\\\\|\\,|\\[Nn]/g;
      var TO_VCARD_NEWLINE = /\\|,|\n/g;

      function createTextType(fromNewline, toNewline) {
        var result = {
          matches: /.*/,

          fromICAL: function(aValue, structuredEscape) {
            return replaceNewline(aValue, fromNewline, structuredEscape);
          },

          toICAL: function(aValue, structuredEscape) {
            var regEx = toNewline;
            if (structuredEscape)
              regEx = new RegExp(regEx.source + '|' + structuredEscape);
            return aValue.replace(regEx, function(str) {
              switch (str) {
              case "\\":
                return "\\\\";
              case ";":
                return "\\;";
              case ",":
                return "\\,";
              case "\n":
                return "\\n";
              /* istanbul ignore next */
              default:
                return str;
              }
            });
          }
        };
        return result;
      }

      // default types used multiple times
      var DEFAULT_TYPE_TEXT = { defaultType: "text" };
      var DEFAULT_TYPE_TEXT_MULTI = { defaultType: "text", multiValue: "," };
      var DEFAULT_TYPE_TEXT_STRUCTURED = { defaultType: "text", structuredValue: ";" };
      var DEFAULT_TYPE_INTEGER = { defaultType: "integer" };
      var DEFAULT_TYPE_DATETIME_DATE = { defaultType: "date-time", allowedTypes: ["date-time", "date"] };
      var DEFAULT_TYPE_DATETIME = { defaultType: "date-time" };
      var DEFAULT_TYPE_URI = { defaultType: "uri" };
      var DEFAULT_TYPE_UTCOFFSET = { defaultType: "utc-offset" };
      var DEFAULT_TYPE_RECUR = { defaultType: "recur" };
      var DEFAULT_TYPE_DATE_ANDOR_TIME = { defaultType: "date-and-or-time", allowedTypes: ["date-time", "date", "text"] };

      function replaceNewlineReplace(string) {
        switch (string) {
          case "\\\\":
            return "\\";
          case "\\;":
            return ";";
          case "\\,":
            return ",";
          case "\\n":
          case "\\N":
            return "\n";
          /* istanbul ignore next */
          default:
            return string;
        }
      }

      function replaceNewline(value, newline, structuredEscape) {
        // avoid regex when possible.
        if (value.indexOf('\\') === -1) {
          return value;
        }
        if (structuredEscape)
          newline = new RegExp(newline.source + '|\\\\' + structuredEscape);
        return value.replace(newline, replaceNewlineReplace);
      }

      var commonProperties = {
        "categories": DEFAULT_TYPE_TEXT_MULTI,
        "url": DEFAULT_TYPE_URI,
        "version": DEFAULT_TYPE_TEXT,
        "uid": DEFAULT_TYPE_TEXT
      };

      var commonValues = {
        "boolean": {
          values: ["TRUE", "FALSE"],

          fromICAL: function(aValue) {
            switch (aValue) {
              case 'TRUE':
                return true;
              case 'FALSE':
                return false;
              default:
                //TODO: parser warning
                return false;
            }
          },

          toICAL: function(aValue) {
            if (aValue) {
              return 'TRUE';
            }
            return 'FALSE';
          }

        },
        float: {
          matches: /^[+-]?\d+\.\d+$/,

          fromICAL: function(aValue) {
            var parsed = parseFloat(aValue);
            if (ICAL.helpers.isStrictlyNaN(parsed)) {
              // TODO: parser warning
              return 0.0;
            }
            return parsed;
          },

          toICAL: function(aValue) {
            return String(aValue);
          }
        },
        integer: {
          fromICAL: function(aValue) {
            var parsed = parseInt(aValue);
            if (ICAL.helpers.isStrictlyNaN(parsed)) {
              return 0;
            }
            return parsed;
          },

          toICAL: function(aValue) {
            return String(aValue);
          }
        },
        "utc-offset": {
          toICAL: function(aValue) {
            if (aValue.length < 7) {
              // no seconds
              // -0500
              return aValue.substr(0, 3) +
                     aValue.substr(4, 2);
            } else {
              // seconds
              // -050000
              return aValue.substr(0, 3) +
                     aValue.substr(4, 2) +
                     aValue.substr(7, 2);
            }
          },

          fromICAL: function(aValue) {
            if (aValue.length < 6) {
              // no seconds
              // -05:00
              return aValue.substr(0, 3) + ':' +
                     aValue.substr(3, 2);
            } else {
              // seconds
              // -05:00:00
              return aValue.substr(0, 3) + ':' +
                     aValue.substr(3, 2) + ':' +
                     aValue.substr(5, 2);
            }
          },

          decorate: function(aValue) {
            return ICAL.UtcOffset.fromString(aValue);
          },

          undecorate: function(aValue) {
            return aValue.toString();
          }
        }
      };

      var icalParams = {
        // Although the syntax is DQUOTE uri DQUOTE, I don't think we should
        // enfoce anything aside from it being a valid content line.
        //
        // At least some params require - if multi values are used - DQUOTEs
        // for each of its values - e.g. delegated-from="uri1","uri2"
        // To indicate this, I introduced the new k/v pair
        // multiValueSeparateDQuote: true
        //
        // "ALTREP": { ... },

        // CN just wants a param-value
        // "CN": { ... }

        "cutype": {
          values: ["INDIVIDUAL", "GROUP", "RESOURCE", "ROOM", "UNKNOWN"],
          allowXName: true,
          allowIanaToken: true
        },

        "delegated-from": {
          valueType: "cal-address",
          multiValue: ",",
          multiValueSeparateDQuote: true
        },
        "delegated-to": {
          valueType: "cal-address",
          multiValue: ",",
          multiValueSeparateDQuote: true
        },
        // "DIR": { ... }, // See ALTREP
        "encoding": {
          values: ["8BIT", "BASE64"]
        },
        // "FMTTYPE": { ... }, // See ALTREP
        "fbtype": {
          values: ["FREE", "BUSY", "BUSY-UNAVAILABLE", "BUSY-TENTATIVE"],
          allowXName: true,
          allowIanaToken: true
        },
        // "LANGUAGE": { ... }, // See ALTREP
        "member": {
          valueType: "cal-address",
          multiValue: ",",
          multiValueSeparateDQuote: true
        },
        "partstat": {
          // TODO These values are actually different per-component
          values: ["NEEDS-ACTION", "ACCEPTED", "DECLINED", "TENTATIVE",
                   "DELEGATED", "COMPLETED", "IN-PROCESS"],
          allowXName: true,
          allowIanaToken: true
        },
        "range": {
          values: ["THISANDFUTURE"]
        },
        "related": {
          values: ["START", "END"]
        },
        "reltype": {
          values: ["PARENT", "CHILD", "SIBLING"],
          allowXName: true,
          allowIanaToken: true
        },
        "role": {
          values: ["REQ-PARTICIPANT", "CHAIR",
                   "OPT-PARTICIPANT", "NON-PARTICIPANT"],
          allowXName: true,
          allowIanaToken: true
        },
        "rsvp": {
          values: ["TRUE", "FALSE"]
        },
        "sent-by": {
          valueType: "cal-address"
        },
        "tzid": {
          matches: /^\//
        },
        "value": {
          // since the value here is a 'type' lowercase is used.
          values: ["binary", "boolean", "cal-address", "date", "date-time",
                   "duration", "float", "integer", "period", "recur", "text",
                   "time", "uri", "utc-offset"],
          allowXName: true,
          allowIanaToken: true
        }
      };

      // When adding a value here, be sure to add it to the parameter types!
      var icalValues = ICAL.helpers.extend(commonValues, {
        text: createTextType(FROM_ICAL_NEWLINE, TO_ICAL_NEWLINE),

        uri: {
          // TODO
          /* ... */
        },

        "binary": {
          decorate: function(aString) {
            return ICAL.Binary.fromString(aString);
          },

          undecorate: function(aBinary) {
            return aBinary.toString();
          }
        },
        "cal-address": {
          // needs to be an uri
        },
        "date": {
          decorate: function(aValue, aProp) {
            if (design.strict) {
              return ICAL.Time.fromDateString(aValue, aProp);
            } else {
              return ICAL.Time.fromString(aValue, aProp);
            }
          },

          /**
           * undecorates a time object.
           */
          undecorate: function(aValue) {
            return aValue.toString();
          },

          fromICAL: function(aValue) {
            // from: 20120901
            // to: 2012-09-01
            if (!design.strict && aValue.length >= 15) {
              // This is probably a date-time, e.g. 20120901T130000Z
              return icalValues["date-time"].fromICAL(aValue);
            } else {
              return aValue.substr(0, 4) + '-' +
                     aValue.substr(4, 2) + '-' +
                     aValue.substr(6, 2);
            }
          },

          toICAL: function(aValue) {
            // from: 2012-09-01
            // to: 20120901
            var len = aValue.length;

            if (len == 10) {
              return aValue.substr(0, 4) +
                     aValue.substr(5, 2) +
                     aValue.substr(8, 2);
            } else if (len >= 19) {
              return icalValues["date-time"].toICAL(aValue);
            } else {
              //TODO: serialize warning?
              return aValue;
            }

          }
        },
        "date-time": {
          fromICAL: function(aValue) {
            // from: 20120901T130000
            // to: 2012-09-01T13:00:00
            if (!design.strict && aValue.length == 8) {
              // This is probably a date, e.g. 20120901
              return icalValues.date.fromICAL(aValue);
            } else {
              var result = aValue.substr(0, 4) + '-' +
                           aValue.substr(4, 2) + '-' +
                           aValue.substr(6, 2) + 'T' +
                           aValue.substr(9, 2) + ':' +
                           aValue.substr(11, 2) + ':' +
                           aValue.substr(13, 2);

              if (aValue[15] && aValue[15] === 'Z') {
                result += 'Z';
              }

              return result;
            }
          },

          toICAL: function(aValue) {
            // from: 2012-09-01T13:00:00
            // to: 20120901T130000
            var len = aValue.length;

            if (len == 10 && !design.strict) {
              return icalValues.date.toICAL(aValue);
            } else if (len >= 19) {
              var result = aValue.substr(0, 4) +
                           aValue.substr(5, 2) +
                           // grab the (DDTHH) segment
                           aValue.substr(8, 5) +
                           // MM
                           aValue.substr(14, 2) +
                           // SS
                           aValue.substr(17, 2);

              if (aValue[19] && aValue[19] === 'Z') {
                result += 'Z';
              }
              return result;
            } else {
              // TODO: error
              return aValue;
            }
          },

          decorate: function(aValue, aProp) {
            if (design.strict) {
              return ICAL.Time.fromDateTimeString(aValue, aProp);
            } else {
              return ICAL.Time.fromString(aValue, aProp);
            }
          },

          undecorate: function(aValue) {
            return aValue.toString();
          }
        },
        duration: {
          decorate: function(aValue) {
            return ICAL.Duration.fromString(aValue);
          },
          undecorate: function(aValue) {
            return aValue.toString();
          }
        },
        period: {

          fromICAL: function(string) {
            var parts = string.split('/');
            parts[0] = icalValues['date-time'].fromICAL(parts[0]);

            if (!ICAL.Duration.isValueString(parts[1])) {
              parts[1] = icalValues['date-time'].fromICAL(parts[1]);
            }

            return parts;
          },

          toICAL: function(parts) {
            if (!design.strict && parts[0].length == 10) {
              parts[0] = icalValues.date.toICAL(parts[0]);
            } else {
              parts[0] = icalValues['date-time'].toICAL(parts[0]);
            }

            if (!ICAL.Duration.isValueString(parts[1])) {
              if (!design.strict && parts[1].length == 10) {
                parts[1] = icalValues.date.toICAL(parts[1]);
              } else {
                parts[1] = icalValues['date-time'].toICAL(parts[1]);
              }
            }

            return parts.join("/");
          },

          decorate: function(aValue, aProp) {
            return ICAL.Period.fromJSON(aValue, aProp, !design.strict);
          },

          undecorate: function(aValue) {
            return aValue.toJSON();
          }
        },
        recur: {
          fromICAL: function(string) {
            return ICAL.Recur._stringToData(string, true);
          },

          toICAL: function(data) {
            var str = "";
            for (var k in data) {
              /* istanbul ignore if */
              if (!Object.prototype.hasOwnProperty.call(data, k)) {
                continue;
              }
              var val = data[k];
              if (k == "until") {
                if (val.length > 10) {
                  val = icalValues['date-time'].toICAL(val);
                } else {
                  val = icalValues.date.toICAL(val);
                }
              } else if (k == "wkst") {
                if (typeof val === 'number') {
                  val = ICAL.Recur.numericDayToIcalDay(val);
                }
              } else if (Array.isArray(val)) {
                val = val.join(",");
              }
              str += k.toUpperCase() + "=" + val + ";";
            }
            return str.substr(0, str.length - 1);
          },

          decorate: function decorate(aValue) {
            return ICAL.Recur.fromData(aValue);
          },

          undecorate: function(aRecur) {
            return aRecur.toJSON();
          }
        },

        time: {
          fromICAL: function(aValue) {
            // from: MMHHSS(Z)?
            // to: HH:MM:SS(Z)?
            if (aValue.length < 6) {
              // TODO: parser exception?
              return aValue;
            }

            // HH::MM::SSZ?
            var result = aValue.substr(0, 2) + ':' +
                         aValue.substr(2, 2) + ':' +
                         aValue.substr(4, 2);

            if (aValue[6] === 'Z') {
              result += 'Z';
            }

            return result;
          },

          toICAL: function(aValue) {
            // from: HH:MM:SS(Z)?
            // to: MMHHSS(Z)?
            if (aValue.length < 8) {
              //TODO: error
              return aValue;
            }

            var result = aValue.substr(0, 2) +
                         aValue.substr(3, 2) +
                         aValue.substr(6, 2);

            if (aValue[8] === 'Z') {
              result += 'Z';
            }

            return result;
          }
        }
      });

      var icalProperties = ICAL.helpers.extend(commonProperties, {

        "action": DEFAULT_TYPE_TEXT,
        "attach": { defaultType: "uri" },
        "attendee": { defaultType: "cal-address" },
        "calscale": DEFAULT_TYPE_TEXT,
        "class": DEFAULT_TYPE_TEXT,
        "comment": DEFAULT_TYPE_TEXT,
        "completed": DEFAULT_TYPE_DATETIME,
        "contact": DEFAULT_TYPE_TEXT,
        "created": DEFAULT_TYPE_DATETIME,
        "description": DEFAULT_TYPE_TEXT,
        "dtend": DEFAULT_TYPE_DATETIME_DATE,
        "dtstamp": DEFAULT_TYPE_DATETIME,
        "dtstart": DEFAULT_TYPE_DATETIME_DATE,
        "due": DEFAULT_TYPE_DATETIME_DATE,
        "duration": { defaultType: "duration" },
        "exdate": {
          defaultType: "date-time",
          allowedTypes: ["date-time", "date"],
          multiValue: ','
        },
        "exrule": DEFAULT_TYPE_RECUR,
        "freebusy": { defaultType: "period", multiValue: "," },
        "geo": { defaultType: "float", structuredValue: ";" },
        "last-modified": DEFAULT_TYPE_DATETIME,
        "location": DEFAULT_TYPE_TEXT,
        "method": DEFAULT_TYPE_TEXT,
        "organizer": { defaultType: "cal-address" },
        "percent-complete": DEFAULT_TYPE_INTEGER,
        "priority": DEFAULT_TYPE_INTEGER,
        "prodid": DEFAULT_TYPE_TEXT,
        "related-to": DEFAULT_TYPE_TEXT,
        "repeat": DEFAULT_TYPE_INTEGER,
        "rdate": {
          defaultType: "date-time",
          allowedTypes: ["date-time", "date", "period"],
          multiValue: ',',
          detectType: function(string) {
            if (string.indexOf('/') !== -1) {
              return 'period';
            }
            return (string.indexOf('T') === -1) ? 'date' : 'date-time';
          }
        },
        "recurrence-id": DEFAULT_TYPE_DATETIME_DATE,
        "resources": DEFAULT_TYPE_TEXT_MULTI,
        "request-status": DEFAULT_TYPE_TEXT_STRUCTURED,
        "rrule": DEFAULT_TYPE_RECUR,
        "sequence": DEFAULT_TYPE_INTEGER,
        "status": DEFAULT_TYPE_TEXT,
        "summary": DEFAULT_TYPE_TEXT,
        "transp": DEFAULT_TYPE_TEXT,
        "trigger": { defaultType: "duration", allowedTypes: ["duration", "date-time"] },
        "tzoffsetfrom": DEFAULT_TYPE_UTCOFFSET,
        "tzoffsetto": DEFAULT_TYPE_UTCOFFSET,
        "tzurl": DEFAULT_TYPE_URI,
        "tzid": DEFAULT_TYPE_TEXT,
        "tzname": DEFAULT_TYPE_TEXT
      });

      // When adding a value here, be sure to add it to the parameter types!
      var vcardValues = ICAL.helpers.extend(commonValues, {
        text: createTextType(FROM_VCARD_NEWLINE, TO_VCARD_NEWLINE),
        uri: createTextType(FROM_VCARD_NEWLINE, TO_VCARD_NEWLINE),

        date: {
          decorate: function(aValue) {
            return ICAL.VCardTime.fromDateAndOrTimeString(aValue, "date");
          },
          undecorate: function(aValue) {
            return aValue.toString();
          },
          fromICAL: function(aValue) {
            if (aValue.length == 8) {
              return icalValues.date.fromICAL(aValue);
            } else if (aValue[0] == '-' && aValue.length == 6) {
              return aValue.substr(0, 4) + '-' + aValue.substr(4);
            } else {
              return aValue;
            }
          },
          toICAL: function(aValue) {
            if (aValue.length == 10) {
              return icalValues.date.toICAL(aValue);
            } else if (aValue[0] == '-' && aValue.length == 7) {
              return aValue.substr(0, 4) + aValue.substr(5);
            } else {
              return aValue;
            }
          }
        },

        time: {
          decorate: function(aValue) {
            return ICAL.VCardTime.fromDateAndOrTimeString("T" + aValue, "time");
          },
          undecorate: function(aValue) {
            return aValue.toString();
          },
          fromICAL: function(aValue) {
            var splitzone = vcardValues.time._splitZone(aValue, true);
            var zone = splitzone[0], value = splitzone[1];

            //console.log("SPLIT: ",splitzone);

            if (value.length == 6) {
              value = value.substr(0, 2) + ':' +
                      value.substr(2, 2) + ':' +
                      value.substr(4, 2);
            } else if (value.length == 4 && value[0] != '-') {
              value = value.substr(0, 2) + ':' + value.substr(2, 2);
            } else if (value.length == 5) {
              value = value.substr(0, 3) + ':' + value.substr(3, 2);
            }

            if (zone.length == 5 && (zone[0] == '-' || zone[0] == '+')) {
              zone = zone.substr(0, 3) + ':' + zone.substr(3);
            }

            return value + zone;
          },

          toICAL: function(aValue) {
            var splitzone = vcardValues.time._splitZone(aValue);
            var zone = splitzone[0], value = splitzone[1];

            if (value.length == 8) {
              value = value.substr(0, 2) +
                      value.substr(3, 2) +
                      value.substr(6, 2);
            } else if (value.length == 5 && value[0] != '-') {
              value = value.substr(0, 2) + value.substr(3, 2);
            } else if (value.length == 6) {
              value = value.substr(0, 3) + value.substr(4, 2);
            }

            if (zone.length == 6 && (zone[0] == '-' || zone[0] == '+')) {
              zone = zone.substr(0, 3) + zone.substr(4);
            }

            return value + zone;
          },

          _splitZone: function(aValue, isFromIcal) {
            var lastChar = aValue.length - 1;
            var signChar = aValue.length - (isFromIcal ? 5 : 6);
            var sign = aValue[signChar];
            var zone, value;

            if (aValue[lastChar] == 'Z') {
              zone = aValue[lastChar];
              value = aValue.substr(0, lastChar);
            } else if (aValue.length > 6 && (sign == '-' || sign == '+')) {
              zone = aValue.substr(signChar);
              value = aValue.substr(0, signChar);
            } else {
              zone = "";
              value = aValue;
            }

            return [zone, value];
          }
        },

        "date-time": {
          decorate: function(aValue) {
            return ICAL.VCardTime.fromDateAndOrTimeString(aValue, "date-time");
          },

          undecorate: function(aValue) {
            return aValue.toString();
          },

          fromICAL: function(aValue) {
            return vcardValues['date-and-or-time'].fromICAL(aValue);
          },

          toICAL: function(aValue) {
            return vcardValues['date-and-or-time'].toICAL(aValue);
          }
        },

        "date-and-or-time": {
          decorate: function(aValue) {
            return ICAL.VCardTime.fromDateAndOrTimeString(aValue, "date-and-or-time");
          },

          undecorate: function(aValue) {
            return aValue.toString();
          },

          fromICAL: function(aValue) {
            var parts = aValue.split('T');
            return (parts[0] ? vcardValues.date.fromICAL(parts[0]) : '') +
                   (parts[1] ? 'T' + vcardValues.time.fromICAL(parts[1]) : '');
          },

          toICAL: function(aValue) {
            var parts = aValue.split('T');
            return vcardValues.date.toICAL(parts[0]) +
                   (parts[1] ? 'T' + vcardValues.time.toICAL(parts[1]) : '');

          }
        },
        timestamp: icalValues['date-time'],
        "language-tag": {
          matches: /^[a-zA-Z0-9-]+$/ // Could go with a more strict regex here
        }
      });

      var vcardParams = {
        "type": {
          valueType: "text",
          multiValue: ","
        },
        "value": {
          // since the value here is a 'type' lowercase is used.
          values: ["text", "uri", "date", "time", "date-time", "date-and-or-time",
                   "timestamp", "boolean", "integer", "float", "utc-offset",
                   "language-tag"],
          allowXName: true,
          allowIanaToken: true
        }
      };

      var vcardProperties = ICAL.helpers.extend(commonProperties, {
        "adr": { defaultType: "text", structuredValue: ";", multiValue: "," },
        "anniversary": DEFAULT_TYPE_DATE_ANDOR_TIME,
        "bday": DEFAULT_TYPE_DATE_ANDOR_TIME,
        "caladruri": DEFAULT_TYPE_URI,
        "caluri": DEFAULT_TYPE_URI,
        "clientpidmap": DEFAULT_TYPE_TEXT_STRUCTURED,
        "email": DEFAULT_TYPE_TEXT,
        "fburl": DEFAULT_TYPE_URI,
        "fn": DEFAULT_TYPE_TEXT,
        "gender": DEFAULT_TYPE_TEXT_STRUCTURED,
        "geo": DEFAULT_TYPE_URI,
        "impp": DEFAULT_TYPE_URI,
        "key": DEFAULT_TYPE_URI,
        "kind": DEFAULT_TYPE_TEXT,
        "lang": { defaultType: "language-tag" },
        "logo": DEFAULT_TYPE_URI,
        "member": DEFAULT_TYPE_URI,
        "n": { defaultType: "text", structuredValue: ";", multiValue: "," },
        "nickname": DEFAULT_TYPE_TEXT_MULTI,
        "note": DEFAULT_TYPE_TEXT,
        "org": { defaultType: "text", structuredValue: ";" },
        "photo": DEFAULT_TYPE_URI,
        "related": DEFAULT_TYPE_URI,
        "rev": { defaultType: "timestamp" },
        "role": DEFAULT_TYPE_TEXT,
        "sound": DEFAULT_TYPE_URI,
        "source": DEFAULT_TYPE_URI,
        "tel": { defaultType: "uri", allowedTypes: ["uri", "text"] },
        "title": DEFAULT_TYPE_TEXT,
        "tz": { defaultType: "text", allowedTypes: ["text", "utc-offset", "uri"] },
        "xml": DEFAULT_TYPE_TEXT
      });

      var vcard3Values = ICAL.helpers.extend(commonValues, {
        binary: icalValues.binary,
        date: vcardValues.date,
        "date-time": vcardValues["date-time"],
        "phone-number": {
          // TODO
          /* ... */
        },
        uri: icalValues.uri,
        text: icalValues.text,
        time: icalValues.time,
        vcard: icalValues.text,
        "utc-offset": {
          toICAL: function(aValue) {
            return aValue.substr(0, 7);
          },

          fromICAL: function(aValue) {
            return aValue.substr(0, 7);
          },

          decorate: function(aValue) {
            return ICAL.UtcOffset.fromString(aValue);
          },

          undecorate: function(aValue) {
            return aValue.toString();
          }
        }
      });

      var vcard3Params = {
        "type": {
          valueType: "text",
          multiValue: ","
        },
        "value": {
          // since the value here is a 'type' lowercase is used.
          values: ["text", "uri", "date", "date-time", "phone-number", "time",
                   "boolean", "integer", "float", "utc-offset", "vcard", "binary"],
          allowXName: true,
          allowIanaToken: true
        }
      };

      var vcard3Properties = ICAL.helpers.extend(commonProperties, {
        fn: DEFAULT_TYPE_TEXT,
        n: { defaultType: "text", structuredValue: ";", multiValue: "," },
        nickname: DEFAULT_TYPE_TEXT_MULTI,
        photo: { defaultType: "binary", allowedTypes: ["binary", "uri"] },
        bday: {
          defaultType: "date-time",
          allowedTypes: ["date-time", "date"],
          detectType: function(string) {
            return (string.indexOf('T') === -1) ? 'date' : 'date-time';
          }
        },

        adr: { defaultType: "text", structuredValue: ";", multiValue: "," },
        label: DEFAULT_TYPE_TEXT,

        tel: { defaultType: "phone-number" },
        email: DEFAULT_TYPE_TEXT,
        mailer: DEFAULT_TYPE_TEXT,

        tz: { defaultType: "utc-offset", allowedTypes: ["utc-offset", "text"] },
        geo: { defaultType: "float", structuredValue: ";" },

        title: DEFAULT_TYPE_TEXT,
        role: DEFAULT_TYPE_TEXT,
        logo: { defaultType: "binary", allowedTypes: ["binary", "uri"] },
        agent: { defaultType: "vcard", allowedTypes: ["vcard", "text", "uri"] },
        org: DEFAULT_TYPE_TEXT_STRUCTURED,

        note: DEFAULT_TYPE_TEXT_MULTI,
        prodid: DEFAULT_TYPE_TEXT,
        rev: {
          defaultType: "date-time",
          allowedTypes: ["date-time", "date"],
          detectType: function(string) {
            return (string.indexOf('T') === -1) ? 'date' : 'date-time';
          }
        },
        "sort-string": DEFAULT_TYPE_TEXT,
        sound: { defaultType: "binary", allowedTypes: ["binary", "uri"] },

        class: DEFAULT_TYPE_TEXT,
        key: { defaultType: "binary", allowedTypes: ["binary", "text"] }
      });

      /**
       * iCalendar design set
       * @type {ICAL.design.designSet}
       */
      var icalSet = {
        value: icalValues,
        param: icalParams,
        property: icalProperties
      };

      /**
       * vCard 4.0 design set
       * @type {ICAL.design.designSet}
       */
      var vcardSet = {
        value: vcardValues,
        param: vcardParams,
        property: vcardProperties
      };

      /**
       * vCard 3.0 design set
       * @type {ICAL.design.designSet}
       */
      var vcard3Set = {
        value: vcard3Values,
        param: vcard3Params,
        property: vcard3Properties
      };

      /**
       * The design data, used by the parser to determine types for properties and
       * other metadata needed to produce correct jCard/jCal data.
       *
       * @alias ICAL.design
       * @namespace
       */
      var design = {
        /**
         * A designSet describes value, parameter and property data. It is used by
         * ther parser and stringifier in components and properties to determine they
         * should be represented.
         *
         * @typedef {Object} designSet
         * @memberOf ICAL.design
         * @property {Object} value       Definitions for value types, keys are type names
         * @property {Object} param       Definitions for params, keys are param names
         * @property {Object} property    Defintions for properties, keys are property names
         */

        /**
         * Can be set to false to make the parser more lenient.
         */
        strict: true,

        /**
         * The default set for new properties and components if none is specified.
         * @type {ICAL.design.designSet}
         */
        defaultSet: icalSet,

        /**
         * The default type for unknown properties
         * @type {String}
         */
        defaultType: 'unknown',

        /**
         * Holds the design set for known top-level components
         *
         * @type {Object}
         * @property {ICAL.design.designSet} vcard       vCard VCARD
         * @property {ICAL.design.designSet} vevent      iCalendar VEVENT
         * @property {ICAL.design.designSet} vtodo       iCalendar VTODO
         * @property {ICAL.design.designSet} vjournal    iCalendar VJOURNAL
         * @property {ICAL.design.designSet} valarm      iCalendar VALARM
         * @property {ICAL.design.designSet} vtimezone   iCalendar VTIMEZONE
         * @property {ICAL.design.designSet} daylight    iCalendar DAYLIGHT
         * @property {ICAL.design.designSet} standard    iCalendar STANDARD
         *
         * @example
         * var propertyName = 'fn';
         * var componentDesign = ICAL.design.components.vcard;
         * var propertyDetails = componentDesign.property[propertyName];
         * if (propertyDetails.defaultType == 'text') {
         *   // Yep, sure is...
         * }
         */
        components: {
          vcard: vcardSet,
          vcard3: vcard3Set,
          vevent: icalSet,
          vtodo: icalSet,
          vjournal: icalSet,
          valarm: icalSet,
          vtimezone: icalSet,
          daylight: icalSet,
          standard: icalSet
        },


        /**
         * The design set for iCalendar (rfc5545/rfc7265) components.
         * @type {ICAL.design.designSet}
         */
        icalendar: icalSet,

        /**
         * The design set for vCard (rfc6350/rfc7095) components.
         * @type {ICAL.design.designSet}
         */
        vcard: vcardSet,

        /**
         * The design set for vCard (rfc2425/rfc2426/rfc7095) components.
         * @type {ICAL.design.designSet}
         */
        vcard3: vcard3Set,

        /**
         * Gets the design set for the given component name.
         *
         * @param {String} componentName        The name of the component
         * @return {ICAL.design.designSet}      The design set for the component
         */
        getDesignSet: function(componentName) {
          var isInDesign = componentName && componentName in design.components;
          return isInDesign ? design.components[componentName] : design.defaultSet;
        }
      };

      return design;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * Contains various functions to convert jCal and jCard data back into
     * iCalendar and vCard.
     * @namespace
     */
    ICAL.stringify = (function() {

      var LINE_ENDING = '\r\n';
      var DEFAULT_VALUE_TYPE = 'unknown';

      var design = ICAL.design;
      var helpers = ICAL.helpers;

      /**
       * Convert a full jCal/jCard array into a iCalendar/vCard string.
       *
       * @function ICAL.stringify
       * @variation function
       * @param {Array} jCal    The jCal/jCard document
       * @return {String}       The stringified iCalendar/vCard document
       */
      function stringify(jCal) {
        if (typeof jCal[0] == "string") {
          // This is a single component
          jCal = [jCal];
        }

        var i = 0;
        var len = jCal.length;
        var result = '';

        for (; i < len; i++) {
          result += stringify.component(jCal[i]) + LINE_ENDING;
        }

        return result;
      }

      /**
       * Converts an jCal component array into a ICAL string.
       * Recursive will resolve sub-components.
       *
       * Exact component/property order is not saved all
       * properties will come before subcomponents.
       *
       * @function ICAL.stringify.component
       * @param {Array} component
       *        jCal/jCard fragment of a component
       * @param {ICAL.design.designSet} designSet
       *        The design data to use for this component
       * @return {String}       The iCalendar/vCard string
       */
      stringify.component = function(component, designSet) {
        var name = component[0].toUpperCase();
        var result = 'BEGIN:' + name + LINE_ENDING;

        var props = component[1];
        var propIdx = 0;
        var propLen = props.length;

        var designSetName = component[0];
        // rfc6350 requires that in vCard 4.0 the first component is the VERSION
        // component with as value 4.0, note that 3.0 does not have this requirement.
        if (designSetName === 'vcard' && component[1].length > 0 &&
                !(component[1][0][0] === "version" && component[1][0][3] === "4.0")) {
          designSetName = "vcard3";
        }
        designSet = designSet || design.getDesignSet(designSetName);

        for (; propIdx < propLen; propIdx++) {
          result += stringify.property(props[propIdx], designSet) + LINE_ENDING;
        }

        // Ignore subcomponents if none exist, e.g. in vCard.
        var comps = component[2] || [];
        var compIdx = 0;
        var compLen = comps.length;

        for (; compIdx < compLen; compIdx++) {
          result += stringify.component(comps[compIdx], designSet) + LINE_ENDING;
        }

        result += 'END:' + name;
        return result;
      };

      /**
       * Converts a single jCal/jCard property to a iCalendar/vCard string.
       *
       * @function ICAL.stringify.property
       * @param {Array} property
       *        jCal/jCard property array
       * @param {ICAL.design.designSet} designSet
       *        The design data to use for this property
       * @param {Boolean} noFold
       *        If true, the line is not folded
       * @return {String}       The iCalendar/vCard string
       */
      stringify.property = function(property, designSet, noFold) {
        var name = property[0].toUpperCase();
        var jsName = property[0];
        var params = property[1];

        var line = name;

        var paramName;
        for (paramName in params) {
          var value = params[paramName];

          /* istanbul ignore else */
          if (params.hasOwnProperty(paramName)) {
            var multiValue = (paramName in designSet.param) && designSet.param[paramName].multiValue;
            if (multiValue && Array.isArray(value)) {
              if (designSet.param[paramName].multiValueSeparateDQuote) {
                multiValue = '"' + multiValue + '"';
              }
              value = value.map(stringify._rfc6868Unescape);
              value = stringify.multiValue(value, multiValue, "unknown", null, designSet);
            } else {
              value = stringify._rfc6868Unescape(value);
            }


            line += ';' + paramName.toUpperCase();
            line += '=' + stringify.propertyValue(value);
          }
        }

        if (property.length === 3) {
          // If there are no values, we must assume a blank value
          return line + ':';
        }

        var valueType = property[2];

        if (!designSet) {
          designSet = design.defaultSet;
        }

        var propDetails;
        var multiValue = false;
        var structuredValue = false;
        var isDefault = false;

        if (jsName in designSet.property) {
          propDetails = designSet.property[jsName];

          if ('multiValue' in propDetails) {
            multiValue = propDetails.multiValue;
          }

          if (('structuredValue' in propDetails) && Array.isArray(property[3])) {
            structuredValue = propDetails.structuredValue;
          }

          if ('defaultType' in propDetails) {
            if (valueType === propDetails.defaultType) {
              isDefault = true;
            }
          } else {
            if (valueType === DEFAULT_VALUE_TYPE) {
              isDefault = true;
            }
          }
        } else {
          if (valueType === DEFAULT_VALUE_TYPE) {
            isDefault = true;
          }
        }

        // push the VALUE property if type is not the default
        // for the current property.
        if (!isDefault) {
          // value will never contain ;/:/, so we don't escape it here.
          line += ';VALUE=' + valueType.toUpperCase();
        }

        line += ':';

        if (multiValue && structuredValue) {
          line += stringify.multiValue(
            property[3], structuredValue, valueType, multiValue, designSet, structuredValue
          );
        } else if (multiValue) {
          line += stringify.multiValue(
            property.slice(3), multiValue, valueType, null, designSet, false
          );
        } else if (structuredValue) {
          line += stringify.multiValue(
            property[3], structuredValue, valueType, null, designSet, structuredValue
          );
        } else {
          line += stringify.value(property[3], valueType, designSet, false);
        }

        return noFold ? line : ICAL.helpers.foldline(line);
      };

      /**
       * Handles escaping of property values that may contain:
       *
       *    COLON (:), SEMICOLON (;), or COMMA (,)
       *
       * If any of the above are present the result is wrapped
       * in double quotes.
       *
       * @function ICAL.stringify.propertyValue
       * @param {String} value      Raw property value
       * @return {String}           Given or escaped value when needed
       */
      stringify.propertyValue = function(value) {

        if ((helpers.unescapedIndexOf(value, ',') === -1) &&
            (helpers.unescapedIndexOf(value, ':') === -1) &&
            (helpers.unescapedIndexOf(value, ';') === -1)) {

          return value;
        }

        return '"' + value + '"';
      };

      /**
       * Converts an array of ical values into a single
       * string based on a type and a delimiter value (like ",").
       *
       * @function ICAL.stringify.multiValue
       * @param {Array} values      List of values to convert
       * @param {String} delim      Used to join the values (",", ";", ":")
       * @param {String} type       Lowecase ical value type
       *        (like boolean, date-time, etc..)
       * @param {?String} innerMulti If set, each value will again be processed
       *        Used for structured values
       * @param {ICAL.design.designSet} designSet
       *        The design data to use for this property
       *
       * @return {String}           iCalendar/vCard string for value
       */
      stringify.multiValue = function(values, delim, type, innerMulti, designSet, structuredValue) {
        var result = '';
        var len = values.length;
        var i = 0;

        for (; i < len; i++) {
          if (innerMulti && Array.isArray(values[i])) {
            result += stringify.multiValue(values[i], innerMulti, type, null, designSet, structuredValue);
          } else {
            result += stringify.value(values[i], type, designSet, structuredValue);
          }

          if (i !== (len - 1)) {
            result += delim;
          }
        }

        return result;
      };

      /**
       * Processes a single ical value runs the associated "toICAL" method from the
       * design value type if available to convert the value.
       *
       * @function ICAL.stringify.value
       * @param {String|Number} value       A formatted value
       * @param {String} type               Lowercase iCalendar/vCard value type
       *  (like boolean, date-time, etc..)
       * @return {String}                   iCalendar/vCard value for single value
       */
      stringify.value = function(value, type, designSet, structuredValue) {
        if (type in designSet.value && 'toICAL' in designSet.value[type]) {
          return designSet.value[type].toICAL(value, structuredValue);
        }
        return value;
      };

      /**
       * Internal helper for rfc6868. Exposing this on ICAL.stringify so that
       * hackers can disable the rfc6868 parsing if the really need to.
       *
       * @param {String} val        The value to unescape
       * @return {String}           The escaped value
       */
      stringify._rfc6868Unescape = function(val) {
        return val.replace(/[\n^"]/g, function(x) {
          return RFC6868_REPLACE_MAP[x];
        });
      };
      var RFC6868_REPLACE_MAP = { '"': "^'", "\n": "^n", "^": "^^" };

      return stringify;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * Contains various functions to parse iCalendar and vCard data.
     * @namespace
     */
    ICAL.parse = (function() {

      var CHAR = /[^ \t]/;
      var VALUE_DELIMITER = ':';
      var PARAM_DELIMITER = ';';
      var PARAM_NAME_DELIMITER = '=';
      var DEFAULT_VALUE_TYPE = 'unknown';
      var DEFAULT_PARAM_TYPE = 'text';

      var design = ICAL.design;
      var helpers = ICAL.helpers;

      /**
       * An error that occurred during parsing.
       *
       * @param {String} message        The error message
       * @memberof ICAL.parse
       * @extends {Error}
       * @class
       */
      function ParserError(message) {
        this.message = message;
        this.name = 'ParserError';

        try {
          throw new Error();
        } catch (e) {
          if (e.stack) {
            var split = e.stack.split('\n');
            split.shift();
            this.stack = split.join('\n');
          }
        }
      }

      ParserError.prototype = Error.prototype;

      /**
       * Parses iCalendar or vCard data into a raw jCal object. Consult
       * documentation on the {@tutorial layers|layers of parsing} for more
       * details.
       *
       * @function ICAL.parse
       * @variation function
       * @todo Fix the API to be more clear on the return type
       * @param {String} input      The string data to parse
       * @return {Object|Object[]}  A single jCal object, or an array thereof
       */
      function parser(input) {
        var state = {};
        var root = state.component = [];

        state.stack = [root];

        parser._eachLine(input, function(err, line) {
          parser._handleContentLine(line, state);
        });


        // when there are still items on the stack
        // throw a fatal error, a component was not closed
        // correctly in that case.
        if (state.stack.length > 1) {
          throw new ParserError(
            'invalid ical body. component began but did not end'
          );
        }

        state = null;

        return (root.length == 1 ? root[0] : root);
      }

      /**
       * Parse an iCalendar property value into the jCal for a single property
       *
       * @function ICAL.parse.property
       * @param {String} str
       *   The iCalendar property string to parse
       * @param {ICAL.design.designSet=} designSet
       *   The design data to use for this property
       * @return {Object}
       *   The jCal Object containing the property
       */
      parser.property = function(str, designSet) {
        var state = {
          component: [[], []],
          designSet: designSet || design.defaultSet
        };
        parser._handleContentLine(str, state);
        return state.component[1][0];
      };

      /**
       * Convenience method to parse a component. You can use ICAL.parse() directly
       * instead.
       *
       * @function ICAL.parse.component
       * @see ICAL.parse(function)
       * @param {String} str    The iCalendar component string to parse
       * @return {Object}       The jCal Object containing the component
       */
      parser.component = function(str) {
        return parser(str);
      };

      // classes & constants
      parser.ParserError = ParserError;

      /**
       * The state for parsing content lines from an iCalendar/vCard string.
       *
       * @private
       * @memberof ICAL.parse
       * @typedef {Object} parserState
       * @property {ICAL.design.designSet} designSet    The design set to use for parsing
       * @property {ICAL.Component[]} stack             The stack of components being processed
       * @property {ICAL.Component} component           The currently active component
       */


      /**
       * Handles a single line of iCalendar/vCard, updating the state.
       *
       * @private
       * @function ICAL.parse._handleContentLine
       * @param {String} line               The content line to process
       * @param {ICAL.parse.parserState}    The current state of the line parsing
       */
      parser._handleContentLine = function(line, state) {
        // break up the parts of the line
        var valuePos = line.indexOf(VALUE_DELIMITER);
        var paramPos = line.indexOf(PARAM_DELIMITER);

        var lastParamIndex;
        var lastValuePos;

        // name of property or begin/end
        var name;
        var value;
        // params is only overridden if paramPos !== -1.
        // we can't do params = params || {} later on
        // because it sacrifices ops.
        var params = {};

        /**
         * Different property cases
         *
         *
         * 1. RRULE:FREQ=foo
         *    // FREQ= is not a param but the value
         *
         * 2. ATTENDEE;ROLE=REQ-PARTICIPANT;
         *    // ROLE= is a param because : has not happened yet
         */
          // when the parameter delimiter is after the
          // value delimiter then it is not a parameter.

        if ((paramPos !== -1 && valuePos !== -1)) {
          // when the parameter delimiter is after the
          // value delimiter then it is not a parameter.
          if (paramPos > valuePos) {
            paramPos = -1;
          }
        }

        var parsedParams;
        if (paramPos !== -1) {
          name = line.substring(0, paramPos).toLowerCase();
          parsedParams = parser._parseParameters(line.substring(paramPos), 0, state.designSet);
          if (parsedParams[2] == -1) {
            throw new ParserError("Invalid parameters in '" + line + "'");
          }
          params = parsedParams[0];
          lastParamIndex = parsedParams[1].length + parsedParams[2] + paramPos;
          if ((lastValuePos =
            line.substring(lastParamIndex).indexOf(VALUE_DELIMITER)) !== -1) {
            value = line.substring(lastParamIndex + lastValuePos + 1);
          } else {
            throw new ParserError("Missing parameter value in '" + line + "'");
          }
        } else if (valuePos !== -1) {
          // without parmeters (BEGIN:VCAENDAR, CLASS:PUBLIC)
          name = line.substring(0, valuePos).toLowerCase();
          value = line.substring(valuePos + 1);

          if (name === 'begin') {
            var newComponent = [value.toLowerCase(), [], []];
            if (state.stack.length === 1) {
              state.component.push(newComponent);
            } else {
              state.component[2].push(newComponent);
            }
            state.stack.push(state.component);
            state.component = newComponent;
            if (!state.designSet) {
              state.designSet = design.getDesignSet(state.component[0]);
            }
            return;
          } else if (name === 'end') {
            state.component = state.stack.pop();
            return;
          }
          // If it is not begin/end, then this is a property with an empty value,
          // which should be considered valid.
        } else {
          /**
           * Invalid line.
           * The rational to throw an error is we will
           * never be certain that the rest of the file
           * is sane and it is unlikely that we can serialize
           * the result correctly either.
           */
          throw new ParserError(
            'invalid line (no token ";" or ":") "' + line + '"'
          );
        }

        var valueType;
        var multiValue = false;
        var structuredValue = false;
        var propertyDetails;

        if (name in state.designSet.property) {
          propertyDetails = state.designSet.property[name];

          if ('multiValue' in propertyDetails) {
            multiValue = propertyDetails.multiValue;
          }

          if ('structuredValue' in propertyDetails) {
            structuredValue = propertyDetails.structuredValue;
          }

          if (value && 'detectType' in propertyDetails) {
            valueType = propertyDetails.detectType(value);
          }
        }

        // attempt to determine value
        if (!valueType) {
          if (!('value' in params)) {
            if (propertyDetails) {
              valueType = propertyDetails.defaultType;
            } else {
              valueType = DEFAULT_VALUE_TYPE;
            }
          } else {
            // possible to avoid this?
            valueType = params.value.toLowerCase();
          }
        }

        delete params.value;

        /**
         * Note on `var result` juggling:
         *
         * I observed that building the array in pieces has adverse
         * effects on performance, so where possible we inline the creation.
         * It is a little ugly but resulted in ~2000 additional ops/sec.
         */

        var result;
        if (multiValue && structuredValue) {
          value = parser._parseMultiValue(value, structuredValue, valueType, [], multiValue, state.designSet, structuredValue);
          result = [name, params, valueType, value];
        } else if (multiValue) {
          result = [name, params, valueType];
          parser._parseMultiValue(value, multiValue, valueType, result, null, state.designSet, false);
        } else if (structuredValue) {
          value = parser._parseMultiValue(value, structuredValue, valueType, [], null, state.designSet, structuredValue);
          result = [name, params, valueType, value];
        } else {
          value = parser._parseValue(value, valueType, state.designSet, false);
          result = [name, params, valueType, value];
        }
        // rfc6350 requires that in vCard 4.0 the first component is the VERSION
        // component with as value 4.0, note that 3.0 does not have this requirement.
        if (state.component[0] === 'vcard' && state.component[1].length === 0 &&
                !(name === 'version' && value === '4.0')) {
          state.designSet = design.getDesignSet("vcard3");
        }
        state.component[1].push(result);
      };

      /**
       * Parse a value from the raw value into the jCard/jCal value.
       *
       * @private
       * @function ICAL.parse._parseValue
       * @param {String} value          Original value
       * @param {String} type           Type of value
       * @param {Object} designSet      The design data to use for this value
       * @return {Object} varies on type
       */
      parser._parseValue = function(value, type, designSet, structuredValue) {
        if (type in designSet.value && 'fromICAL' in designSet.value[type]) {
          return designSet.value[type].fromICAL(value, structuredValue);
        }
        return value;
      };

      /**
       * Parse parameters from a string to object.
       *
       * @function ICAL.parse._parseParameters
       * @private
       * @param {String} line           A single unfolded line
       * @param {Numeric} start         Position to start looking for properties
       * @param {Object} designSet      The design data to use for this property
       * @return {Object} key/value pairs
       */
      parser._parseParameters = function(line, start, designSet) {
        var lastParam = start;
        var pos = 0;
        var delim = PARAM_NAME_DELIMITER;
        var result = {};
        var name, lcname;
        var value, valuePos = -1;
        var type, multiValue, mvdelim;

        // find the next '=' sign
        // use lastParam and pos to find name
        // check if " is used if so get value from "->"
        // then increment pos to find next ;

        while ((pos !== false) &&
               (pos = helpers.unescapedIndexOf(line, delim, pos + 1)) !== -1) {

          name = line.substr(lastParam + 1, pos - lastParam - 1);
          if (name.length == 0) {
            throw new ParserError("Empty parameter name in '" + line + "'");
          }
          lcname = name.toLowerCase();
          mvdelim = false;
          multiValue = false;

          if (lcname in designSet.param && designSet.param[lcname].valueType) {
            type = designSet.param[lcname].valueType;
          } else {
            type = DEFAULT_PARAM_TYPE;
          }

          if (lcname in designSet.param) {
            multiValue = designSet.param[lcname].multiValue;
            if (designSet.param[lcname].multiValueSeparateDQuote) {
              mvdelim = parser._rfc6868Escape('"' + multiValue + '"');
            }
          }

          var nextChar = line[pos + 1];
          if (nextChar === '"') {
            valuePos = pos + 2;
            pos = helpers.unescapedIndexOf(line, '"', valuePos);
            if (multiValue && pos != -1) {
                var extendedValue = true;
                while (extendedValue) {
                  if (line[pos + 1] == multiValue && line[pos + 2] == '"') {
                    pos = helpers.unescapedIndexOf(line, '"', pos + 3);
                  } else {
                    extendedValue = false;
                  }
                }
              }
            if (pos === -1) {
              throw new ParserError(
                'invalid line (no matching double quote) "' + line + '"'
              );
            }
            value = line.substr(valuePos, pos - valuePos);
            lastParam = helpers.unescapedIndexOf(line, PARAM_DELIMITER, pos);
            if (lastParam === -1) {
              pos = false;
            }
          } else {
            valuePos = pos + 1;

            // move to next ";"
            var nextPos = helpers.unescapedIndexOf(line, PARAM_DELIMITER, valuePos);
            var propValuePos = helpers.unescapedIndexOf(line, VALUE_DELIMITER, valuePos);
            if (propValuePos !== -1 && nextPos > propValuePos) {
              // this is a delimiter in the property value, let's stop here
              nextPos = propValuePos;
              pos = false;
            } else if (nextPos === -1) {
              // no ";"
              if (propValuePos === -1) {
                nextPos = line.length;
              } else {
                nextPos = propValuePos;
              }
              pos = false;
            } else {
              lastParam = nextPos;
              pos = nextPos;
            }

            value = line.substr(valuePos, nextPos - valuePos);
          }

          value = parser._rfc6868Escape(value);
          if (multiValue) {
            var delimiter = mvdelim || multiValue;
            value = parser._parseMultiValue(value, delimiter, type, [], null, designSet);
          } else {
            value = parser._parseValue(value, type, designSet);
          }

          if (multiValue && (lcname in result)) {
            if (Array.isArray(result[lcname])) {
              result[lcname].push(value);
            } else {
              result[lcname] = [
                result[lcname],
                value
              ];
            }
          } else {
            result[lcname] = value;
          }
        }
        return [result, value, valuePos];
      };

      /**
       * Internal helper for rfc6868. Exposing this on ICAL.parse so that
       * hackers can disable the rfc6868 parsing if the really need to.
       *
       * @function ICAL.parse._rfc6868Escape
       * @param {String} val        The value to escape
       * @return {String}           The escaped value
       */
      parser._rfc6868Escape = function(val) {
        return val.replace(/\^['n^]/g, function(x) {
          return RFC6868_REPLACE_MAP[x];
        });
      };
      var RFC6868_REPLACE_MAP = { "^'": '"', "^n": "\n", "^^": "^" };

      /**
       * Parse a multi value string. This function is used either for parsing
       * actual multi-value property's values, or for handling parameter values. It
       * can be used for both multi-value properties and structured value properties.
       *
       * @private
       * @function ICAL.parse._parseMultiValue
       * @param {String} buffer     The buffer containing the full value
       * @param {String} delim      The multi-value delimiter
       * @param {String} type       The value type to be parsed
       * @param {Array.<?>} result        The array to append results to, varies on value type
       * @param {String} innerMulti The inner delimiter to split each value with
       * @param {ICAL.design.designSet} designSet   The design data for this value
       * @return {?|Array.<?>}            Either an array of results, or the first result
       */
      parser._parseMultiValue = function(buffer, delim, type, result, innerMulti, designSet, structuredValue) {
        var pos = 0;
        var lastPos = 0;
        var value;
        if (delim.length === 0) {
          return buffer;
        }

        // split each piece
        while ((pos = helpers.unescapedIndexOf(buffer, delim, lastPos)) !== -1) {
          value = buffer.substr(lastPos, pos - lastPos);
          if (innerMulti) {
            value = parser._parseMultiValue(value, innerMulti, type, [], null, designSet, structuredValue);
          } else {
            value = parser._parseValue(value, type, designSet, structuredValue);
          }
          result.push(value);
          lastPos = pos + delim.length;
        }

        // on the last piece take the rest of string
        value = buffer.substr(lastPos);
        if (innerMulti) {
          value = parser._parseMultiValue(value, innerMulti, type, [], null, designSet, structuredValue);
        } else {
          value = parser._parseValue(value, type, designSet, structuredValue);
        }
        result.push(value);

        return result.length == 1 ? result[0] : result;
      };

      /**
       * Process a complete buffer of iCalendar/vCard data line by line, correctly
       * unfolding content. Each line will be processed with the given callback
       *
       * @private
       * @function ICAL.parse._eachLine
       * @param {String} buffer                         The buffer to process
       * @param {function(?String, String)} callback    The callback for each line
       */
      parser._eachLine = function(buffer, callback) {
        var len = buffer.length;
        var lastPos = buffer.search(CHAR);
        var pos = lastPos;
        var line;
        var firstChar;

        var newlineOffset;

        do {
          pos = buffer.indexOf('\n', lastPos) + 1;

          if (pos > 1 && buffer[pos - 2] === '\r') {
            newlineOffset = 2;
          } else {
            newlineOffset = 1;
          }

          if (pos === 0) {
            pos = len;
            newlineOffset = 0;
          }

          firstChar = buffer[lastPos];

          if (firstChar === ' ' || firstChar === '\t') {
            // add to line
            line += buffer.substr(
              lastPos + 1,
              pos - lastPos - (newlineOffset + 1)
            );
          } else {
            if (line)
              callback(null, line);
            // push line
            line = buffer.substr(
              lastPos,
              pos - lastPos - newlineOffset
            );
          }

          lastPos = pos;
        } while (pos !== len);

        // extra ending line
        line = line.trim();

        if (line.length)
          callback(null, line);
      };

      return parser;

    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.Component = (function() {

      var PROPERTY_INDEX = 1;
      var COMPONENT_INDEX = 2;
      var NAME_INDEX = 0;

      /**
       * @classdesc
       * Wraps a jCal component, adding convenience methods to add, remove and
       * update subcomponents and properties.
       *
       * @class
       * @alias ICAL.Component
       * @param {Array|String} jCal         Raw jCal component data OR name of new
       *                                      component
       * @param {ICAL.Component} parent     Parent component to associate
       */
      function Component(jCal, parent) {
        if (typeof(jCal) === 'string') {
          // jCal spec (name, properties, components)
          jCal = [jCal, [], []];
        }

        // mostly for legacy reasons.
        this.jCal = jCal;

        this.parent = parent || null;
      }

      Component.prototype = {
        /**
         * Hydrated properties are inserted into the _properties array at the same
         * position as in the jCal array, so it is possible that the array contains
         * undefined values for unhydrdated properties. To avoid iterating the
         * array when checking if all properties have been hydrated, we save the
         * count here.
         *
         * @type {Number}
         * @private
         */
        _hydratedPropertyCount: 0,

        /**
         * The same count as for _hydratedPropertyCount, but for subcomponents
         *
         * @type {Number}
         * @private
         */
        _hydratedComponentCount: 0,

        /**
         * The name of this component
         * @readonly
         */
        get name() {
          return this.jCal[NAME_INDEX];
        },

        /**
         * The design set for this component, e.g. icalendar vs vcard
         *
         * @type {ICAL.design.designSet}
         * @private
         */
        get _designSet() {
          var parentDesign = this.parent && this.parent._designSet;
          return parentDesign || ICAL.design.getDesignSet(this.name);
        },

        _hydrateComponent: function(index) {
          if (!this._components) {
            this._components = [];
            this._hydratedComponentCount = 0;
          }

          if (this._components[index]) {
            return this._components[index];
          }

          var comp = new Component(
            this.jCal[COMPONENT_INDEX][index],
            this
          );

          this._hydratedComponentCount++;
          return (this._components[index] = comp);
        },

        _hydrateProperty: function(index) {
          if (!this._properties) {
            this._properties = [];
            this._hydratedPropertyCount = 0;
          }

          if (this._properties[index]) {
            return this._properties[index];
          }

          var prop = new ICAL.Property(
            this.jCal[PROPERTY_INDEX][index],
            this
          );

          this._hydratedPropertyCount++;
          return (this._properties[index] = prop);
        },

        /**
         * Finds first sub component, optionally filtered by name.
         *
         * @param {String=} name        Optional name to filter by
         * @return {?ICAL.Component}     The found subcomponent
         */
        getFirstSubcomponent: function(name) {
          if (name) {
            var i = 0;
            var comps = this.jCal[COMPONENT_INDEX];
            var len = comps.length;

            for (; i < len; i++) {
              if (comps[i][NAME_INDEX] === name) {
                var result = this._hydrateComponent(i);
                return result;
              }
            }
          } else {
            if (this.jCal[COMPONENT_INDEX].length) {
              return this._hydrateComponent(0);
            }
          }

          // ensure we return a value (strict mode)
          return null;
        },

        /**
         * Finds all sub components, optionally filtering by name.
         *
         * @param {String=} name            Optional name to filter by
         * @return {ICAL.Component[]}       The found sub components
         */
        getAllSubcomponents: function(name) {
          var jCalLen = this.jCal[COMPONENT_INDEX].length;
          var i = 0;

          if (name) {
            var comps = this.jCal[COMPONENT_INDEX];
            var result = [];

            for (; i < jCalLen; i++) {
              if (name === comps[i][NAME_INDEX]) {
                result.push(
                  this._hydrateComponent(i)
                );
              }
            }
            return result;
          } else {
            if (!this._components ||
                (this._hydratedComponentCount !== jCalLen)) {
              for (; i < jCalLen; i++) {
                this._hydrateComponent(i);
              }
            }

            return this._components || [];
          }
        },

        /**
         * Returns true when a named property exists.
         *
         * @param {String} name     The property name
         * @return {Boolean}        True, when property is found
         */
        hasProperty: function(name) {
          var props = this.jCal[PROPERTY_INDEX];
          var len = props.length;

          var i = 0;
          for (; i < len; i++) {
            // 0 is property name
            if (props[i][NAME_INDEX] === name) {
              return true;
            }
          }

          return false;
        },

        /**
         * Finds the first property, optionally with the given name.
         *
         * @param {String=} name        Lowercase property name
         * @return {?ICAL.Property}     The found property
         */
        getFirstProperty: function(name) {
          if (name) {
            var i = 0;
            var props = this.jCal[PROPERTY_INDEX];
            var len = props.length;

            for (; i < len; i++) {
              if (props[i][NAME_INDEX] === name) {
                var result = this._hydrateProperty(i);
                return result;
              }
            }
          } else {
            if (this.jCal[PROPERTY_INDEX].length) {
              return this._hydrateProperty(0);
            }
          }

          return null;
        },

        /**
         * Returns first property's value, if available.
         *
         * @param {String=} name    Lowercase property name
         * @return {?String}        The found property value.
         */
        getFirstPropertyValue: function(name) {
          var prop = this.getFirstProperty(name);
          if (prop) {
            return prop.getFirstValue();
          }

          return null;
        },

        /**
         * Get all properties in the component, optionally filtered by name.
         *
         * @param {String=} name        Lowercase property name
         * @return {ICAL.Property[]}    List of properties
         */
        getAllProperties: function(name) {
          var jCalLen = this.jCal[PROPERTY_INDEX].length;
          var i = 0;

          if (name) {
            var props = this.jCal[PROPERTY_INDEX];
            var result = [];

            for (; i < jCalLen; i++) {
              if (name === props[i][NAME_INDEX]) {
                result.push(
                  this._hydrateProperty(i)
                );
              }
            }
            return result;
          } else {
            if (!this._properties ||
                (this._hydratedPropertyCount !== jCalLen)) {
              for (; i < jCalLen; i++) {
                this._hydrateProperty(i);
              }
            }

            return this._properties || [];
          }
        },

        _removeObjectByIndex: function(jCalIndex, cache, index) {
          cache = cache || [];
          // remove cached version
          if (cache[index]) {
            var obj = cache[index];
            if ("parent" in obj) {
                obj.parent = null;
            }
          }

          cache.splice(index, 1);

          // remove it from the jCal
          this.jCal[jCalIndex].splice(index, 1);
        },

        _removeObject: function(jCalIndex, cache, nameOrObject) {
          var i = 0;
          var objects = this.jCal[jCalIndex];
          var len = objects.length;
          var cached = this[cache];

          if (typeof(nameOrObject) === 'string') {
            for (; i < len; i++) {
              if (objects[i][NAME_INDEX] === nameOrObject) {
                this._removeObjectByIndex(jCalIndex, cached, i);
                return true;
              }
            }
          } else if (cached) {
            for (; i < len; i++) {
              if (cached[i] && cached[i] === nameOrObject) {
                this._removeObjectByIndex(jCalIndex, cached, i);
                return true;
              }
            }
          }

          return false;
        },

        _removeAllObjects: function(jCalIndex, cache, name) {
          var cached = this[cache];

          // Unfortunately we have to run through all children to reset their
          // parent property.
          var objects = this.jCal[jCalIndex];
          var i = objects.length - 1;

          // descending search required because splice
          // is used and will effect the indices.
          for (; i >= 0; i--) {
            if (!name || objects[i][NAME_INDEX] === name) {
              this._removeObjectByIndex(jCalIndex, cached, i);
            }
          }
        },

        /**
         * Adds a single sub component.
         *
         * @param {ICAL.Component} component        The component to add
         * @return {ICAL.Component}                 The passed in component
         */
        addSubcomponent: function(component) {
          if (!this._components) {
            this._components = [];
            this._hydratedComponentCount = 0;
          }

          if (component.parent) {
            component.parent.removeSubcomponent(component);
          }

          var idx = this.jCal[COMPONENT_INDEX].push(component.jCal);
          this._components[idx - 1] = component;
          this._hydratedComponentCount++;
          component.parent = this;
          return component;
        },

        /**
         * Removes a single component by name or the instance of a specific
         * component.
         *
         * @param {ICAL.Component|String} nameOrComp    Name of component, or component
         * @return {Boolean}                            True when comp is removed
         */
        removeSubcomponent: function(nameOrComp) {
          var removed = this._removeObject(COMPONENT_INDEX, '_components', nameOrComp);
          if (removed) {
            this._hydratedComponentCount--;
          }
          return removed;
        },

        /**
         * Removes all components or (if given) all components by a particular
         * name.
         *
         * @param {String=} name            Lowercase component name
         */
        removeAllSubcomponents: function(name) {
          var removed = this._removeAllObjects(COMPONENT_INDEX, '_components', name);
          this._hydratedComponentCount = 0;
          return removed;
        },

        /**
         * Adds an {@link ICAL.Property} to the component.
         *
         * @param {ICAL.Property} property      The property to add
         * @return {ICAL.Property}              The passed in property
         */
        addProperty: function(property) {
          if (!(property instanceof ICAL.Property)) {
            throw new TypeError('must instance of ICAL.Property');
          }

          if (!this._properties) {
            this._properties = [];
            this._hydratedPropertyCount = 0;
          }

          if (property.parent) {
            property.parent.removeProperty(property);
          }

          var idx = this.jCal[PROPERTY_INDEX].push(property.jCal);
          this._properties[idx - 1] = property;
          this._hydratedPropertyCount++;
          property.parent = this;
          return property;
        },

        /**
         * Helper method to add a property with a value to the component.
         *
         * @param {String}               name         Property name to add
         * @param {String|Number|Object} value        Property value
         * @return {ICAL.Property}                    The created property
         */
        addPropertyWithValue: function(name, value) {
          var prop = new ICAL.Property(name);
          prop.setValue(value);

          this.addProperty(prop);

          return prop;
        },

        /**
         * Helper method that will update or create a property of the given name
         * and sets its value. If multiple properties with the given name exist,
         * only the first is updated.
         *
         * @param {String}               name         Property name to update
         * @param {String|Number|Object} value        Property value
         * @return {ICAL.Property}                    The created property
         */
        updatePropertyWithValue: function(name, value) {
          var prop = this.getFirstProperty(name);

          if (prop) {
            prop.setValue(value);
          } else {
            prop = this.addPropertyWithValue(name, value);
          }

          return prop;
        },

        /**
         * Removes a single property by name or the instance of the specific
         * property.
         *
         * @param {String|ICAL.Property} nameOrProp     Property name or instance to remove
         * @return {Boolean}                            True, when deleted
         */
        removeProperty: function(nameOrProp) {
          var removed = this._removeObject(PROPERTY_INDEX, '_properties', nameOrProp);
          if (removed) {
            this._hydratedPropertyCount--;
          }
          return removed;
        },

        /**
         * Removes all properties associated with this component, optionally
         * filtered by name.
         *
         * @param {String=} name        Lowercase property name
         * @return {Boolean}            True, when deleted
         */
        removeAllProperties: function(name) {
          var removed = this._removeAllObjects(PROPERTY_INDEX, '_properties', name);
          this._hydratedPropertyCount = 0;
          return removed;
        },

        /**
         * Returns the Object representation of this component. The returned object
         * is a live jCal object and should be cloned if modified.
         * @return {Object}
         */
        toJSON: function() {
          return this.jCal;
        },

        /**
         * The string representation of this component.
         * @return {String}
         */
        toString: function() {
          return ICAL.stringify.component(
            this.jCal, this._designSet
          );
        }
      };

      /**
       * Create an {@link ICAL.Component} by parsing the passed iCalendar string.
       *
       * @param {String} str        The iCalendar string to parse
       */
      Component.fromString = function(str) {
        return new Component(ICAL.parse.component(str));
      };

      return Component;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.Property = (function() {

      var NAME_INDEX = 0;
      var PROP_INDEX = 1;
      var TYPE_INDEX = 2;
      var VALUE_INDEX = 3;

      var design = ICAL.design;

      /**
       * @classdesc
       * Provides a layer on top of the raw jCal object for manipulating a single
       * property, with its parameters and value.
       *
       * @description
       * It is important to note that mutations done in the wrapper
       * directly mutate the jCal object used to initialize.
       *
       * Can also be used to create new properties by passing
       * the name of the property (as a String).
       *
       * @class
       * @alias ICAL.Property
       * @param {Array|String} jCal         Raw jCal representation OR
       *  the new name of the property
       *
       * @param {ICAL.Component=} parent    Parent component
       */
      function Property(jCal, parent) {
        this._parent = parent || null;

        if (typeof(jCal) === 'string') {
          // We are creating the property by name and need to detect the type
          this.jCal = [jCal, {}, design.defaultType];
          this.jCal[TYPE_INDEX] = this.getDefaultType();
        } else {
          this.jCal = jCal;
        }
        this._updateType();
      }

      Property.prototype = {

        /**
         * The value type for this property
         * @readonly
         * @type {String}
         */
        get type() {
          return this.jCal[TYPE_INDEX];
        },

        /**
         * The name of this property, in lowercase.
         * @readonly
         * @type {String}
         */
        get name() {
          return this.jCal[NAME_INDEX];
        },

        /**
         * The parent component for this property.
         * @type {ICAL.Component}
         */
        get parent() {
          return this._parent;
        },

        set parent(p) {
          // Before setting the parent, check if the design set has changed. If it
          // has, we later need to update the type if it was unknown before.
          var designSetChanged = !this._parent || (p && p._designSet != this._parent._designSet);

          this._parent = p;

          if (this.type == design.defaultType && designSetChanged) {
            this.jCal[TYPE_INDEX] = this.getDefaultType();
            this._updateType();
          }

          return p;
        },

        /**
         * The design set for this property, e.g. icalendar vs vcard
         *
         * @type {ICAL.design.designSet}
         * @private
         */
        get _designSet() {
          return this.parent ? this.parent._designSet : design.defaultSet;
        },

        /**
         * Updates the type metadata from the current jCal type and design set.
         *
         * @private
         */
        _updateType: function() {
          var designSet = this._designSet;

          if (this.type in designSet.value) {
            var designType = designSet.value[this.type];

            if ('decorate' in designSet.value[this.type]) {
              this.isDecorated = true;
            } else {
              this.isDecorated = false;
            }

            if (this.name in designSet.property) {
              this.isMultiValue = ('multiValue' in designSet.property[this.name]);
              this.isStructuredValue = ('structuredValue' in designSet.property[this.name]);
            }
          }
        },

        /**
         * Hydrate a single value. The act of hydrating means turning the raw jCal
         * value into a potentially wrapped object, for example {@link ICAL.Time}.
         *
         * @private
         * @param {Number} index        The index of the value to hydrate
         * @return {Object}             The decorated value.
         */
        _hydrateValue: function(index) {
          if (this._values && this._values[index]) {
            return this._values[index];
          }

          // for the case where there is no value.
          if (this.jCal.length <= (VALUE_INDEX + index)) {
            return null;
          }

          if (this.isDecorated) {
            if (!this._values) {
              this._values = [];
            }
            return (this._values[index] = this._decorate(
              this.jCal[VALUE_INDEX + index]
            ));
          } else {
            return this.jCal[VALUE_INDEX + index];
          }
        },

        /**
         * Decorate a single value, returning its wrapped object. This is used by
         * the hydrate function to actually wrap the value.
         *
         * @private
         * @param {?} value         The value to decorate
         * @return {Object}         The decorated value
         */
        _decorate: function(value) {
          return this._designSet.value[this.type].decorate(value, this);
        },

        /**
         * Undecorate a single value, returning its raw jCal data.
         *
         * @private
         * @param {Object} value         The value to undecorate
         * @return {?}                   The undecorated value
         */
        _undecorate: function(value) {
          return this._designSet.value[this.type].undecorate(value, this);
        },

        /**
         * Sets the value at the given index while also hydrating it. The passed
         * value can either be a decorated or undecorated value.
         *
         * @private
         * @param {?} value             The value to set
         * @param {Number} index        The index to set it at
         */
        _setDecoratedValue: function(value, index) {
          if (!this._values) {
            this._values = [];
          }

          if (typeof(value) === 'object' && 'icaltype' in value) {
            // decorated value
            this.jCal[VALUE_INDEX + index] = this._undecorate(value);
            this._values[index] = value;
          } else {
            // undecorated value
            this.jCal[VALUE_INDEX + index] = value;
            this._values[index] = this._decorate(value);
          }
        },

        /**
         * Gets a parameter on the property.
         *
         * @param {String}        name   Parameter name (lowercase)
         * @return {Array|String}        Parameter value
         */
        getParameter: function(name) {
          if (name in this.jCal[PROP_INDEX]) {
            return this.jCal[PROP_INDEX][name];
          } else {
            return undefined;
          }
        },

        /**
         * Gets first parameter on the property.
         *
         * @param {String}        name   Parameter name (lowercase)
         * @return {String}        Parameter value
         */
        getFirstParameter: function(name) {
          var parameters = this.getParameter(name);

          if (Array.isArray(parameters)) {
            return parameters[0];
          }

          return parameters;
        },

        /**
         * Sets a parameter on the property.
         *
         * @param {String}       name     The parameter name
         * @param {Array|String} value    The parameter value
         */
        setParameter: function(name, value) {
          var lcname = name.toLowerCase();
          if (typeof value === "string" &&
              lcname in this._designSet.param &&
              'multiValue' in this._designSet.param[lcname]) {
              value = [value];
          }
          this.jCal[PROP_INDEX][name] = value;
        },

        /**
         * Removes a parameter
         *
         * @param {String} name     The parameter name
         */
        removeParameter: function(name) {
          delete this.jCal[PROP_INDEX][name];
        },

        /**
         * Get the default type based on this property's name.
         *
         * @return {String}     The default type for this property
         */
        getDefaultType: function() {
          var name = this.jCal[NAME_INDEX];
          var designSet = this._designSet;

          if (name in designSet.property) {
            var details = designSet.property[name];
            if ('defaultType' in details) {
              return details.defaultType;
            }
          }
          return design.defaultType;
        },

        /**
         * Sets type of property and clears out any existing values of the current
         * type.
         *
         * @param {String} type     New iCAL type (see design.*.values)
         */
        resetType: function(type) {
          this.removeAllValues();
          this.jCal[TYPE_INDEX] = type;
          this._updateType();
        },

        /**
         * Finds the first property value.
         *
         * @return {String}         First property value
         */
        getFirstValue: function() {
          return this._hydrateValue(0);
        },

        /**
         * Gets all values on the property.
         *
         * NOTE: this creates an array during each call.
         *
         * @return {Array}          List of values
         */
        getValues: function() {
          var len = this.jCal.length - VALUE_INDEX;

          if (len < 1) {
            // it is possible for a property to have no value.
            return [];
          }

          var i = 0;
          var result = [];

          for (; i < len; i++) {
            result[i] = this._hydrateValue(i);
          }

          return result;
        },

        /**
         * Removes all values from this property
         */
        removeAllValues: function() {
          if (this._values) {
            this._values.length = 0;
          }
          this.jCal.length = 3;
        },

        /**
         * Sets the values of the property.  Will overwrite the existing values.
         * This can only be used for multi-value properties.
         *
         * @param {Array} values    An array of values
         */
        setValues: function(values) {
          if (!this.isMultiValue) {
            throw new Error(
              this.name + ': does not not support mulitValue.\n' +
              'override isMultiValue'
            );
          }

          var len = values.length;
          var i = 0;
          this.removeAllValues();

          if (len > 0 &&
              typeof(values[0]) === 'object' &&
              'icaltype' in values[0]) {
            this.resetType(values[0].icaltype);
          }

          if (this.isDecorated) {
            for (; i < len; i++) {
              this._setDecoratedValue(values[i], i);
            }
          } else {
            for (; i < len; i++) {
              this.jCal[VALUE_INDEX + i] = values[i];
            }
          }
        },

        /**
         * Sets the current value of the property. If this is a multi-value
         * property, all other values will be removed.
         *
         * @param {String|Object} value     New property value.
         */
        setValue: function(value) {
          this.removeAllValues();
          if (typeof(value) === 'object' && 'icaltype' in value) {
            this.resetType(value.icaltype);
          }

          if (this.isDecorated) {
            this._setDecoratedValue(value, 0);
          } else {
            this.jCal[VALUE_INDEX] = value;
          }
        },

        /**
         * Returns the Object representation of this component. The returned object
         * is a live jCal object and should be cloned if modified.
         * @return {Object}
         */
        toJSON: function() {
          return this.jCal;
        },

        /**
         * The string representation of this component.
         * @return {String}
         */
        toICALString: function() {
          return ICAL.stringify.property(
            this.jCal, this._designSet, true
          );
        }
      };

      /**
       * Create an {@link ICAL.Property} by parsing the passed iCalendar string.
       *
       * @param {String} str                        The iCalendar string to parse
       * @param {ICAL.design.designSet=} designSet  The design data to use for this property
       * @return {ICAL.Property}                    The created iCalendar property
       */
      Property.fromString = function(str, designSet) {
        return new Property(ICAL.parse.property(str, designSet));
      };

      return Property;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.UtcOffset = (function() {

      /**
       * @classdesc
       * This class represents the "duration" value type, with various calculation
       * and manipulation methods.
       *
       * @class
       * @alias ICAL.UtcOffset
       * @param {Object} aData          An object with members of the utc offset
       * @param {Number=} aData.hours   The hours for the utc offset
       * @param {Number=} aData.minutes The minutes in the utc offset
       * @param {Number=} aData.factor  The factor for the utc-offset, either -1 or 1
       */
      function UtcOffset(aData) {
        this.fromData(aData);
      }

      UtcOffset.prototype = {

        /**
         * The hours in the utc-offset
         * @type {Number}
         */
        hours: 0,

        /**
         * The minutes in the utc-offset
         * @type {Number}
         */
        minutes: 0,

        /**
         * The sign of the utc offset, 1 for positive offset, -1 for negative
         * offsets.
         * @type {Number}
         */
        factor: 1,

        /**
         * The type name, to be used in the jCal object.
         * @constant
         * @type {String}
         * @default "utc-offset"
         */
        icaltype: "utc-offset",

        /**
         * Returns a clone of the utc offset object.
         *
         * @return {ICAL.UtcOffset}     The cloned object
         */
        clone: function() {
          return ICAL.UtcOffset.fromSeconds(this.toSeconds());
        },

        /**
         * Sets up the current instance using members from the passed data object.
         *
         * @param {Object} aData          An object with members of the utc offset
         * @param {Number=} aData.hours   The hours for the utc offset
         * @param {Number=} aData.minutes The minutes in the utc offset
         * @param {Number=} aData.factor  The factor for the utc-offset, either -1 or 1
         */
        fromData: function(aData) {
          if (aData) {
            for (var key in aData) {
              /* istanbul ignore else */
              if (aData.hasOwnProperty(key)) {
                this[key] = aData[key];
              }
            }
          }
          this._normalize();
        },

        /**
         * Sets up the current instance from the given seconds value. The seconds
         * value is truncated to the minute. Offsets are wrapped when the world
         * ends, the hour after UTC+14:00 is UTC-12:00.
         *
         * @param {Number} aSeconds         The seconds to convert into an offset
         */
        fromSeconds: function(aSeconds) {
          var secs = Math.abs(aSeconds);

          this.factor = aSeconds < 0 ? -1 : 1;
          this.hours = ICAL.helpers.trunc(secs / 3600);

          secs -= (this.hours * 3600);
          this.minutes = ICAL.helpers.trunc(secs / 60);
          return this;
        },

        /**
         * Convert the current offset to a value in seconds
         *
         * @return {Number}                 The offset in seconds
         */
        toSeconds: function() {
          return this.factor * (60 * this.minutes + 3600 * this.hours);
        },

        /**
         * Compare this utc offset with another one.
         *
         * @param {ICAL.UtcOffset} other        The other offset to compare with
         * @return {Number}                     -1, 0 or 1 for less/equal/greater
         */
        compare: function icaltime_compare(other) {
          var a = this.toSeconds();
          var b = other.toSeconds();
          return (a > b) - (b > a);
        },

        _normalize: function() {
          // Range: 97200 seconds (with 1 hour inbetween)
          var secs = this.toSeconds();
          var factor = this.factor;
          while (secs < -43200) { // = UTC-12:00
            secs += 97200;
          }
          while (secs > 50400) { // = UTC+14:00
            secs -= 97200;
          }

          this.fromSeconds(secs);

          // Avoid changing the factor when on zero seconds
          if (secs == 0) {
            this.factor = factor;
          }
        },

        /**
         * The iCalendar string representation of this utc-offset.
         * @return {String}
         */
        toICALString: function() {
          return ICAL.design.icalendar.value['utc-offset'].toICAL(this.toString());
        },

        /**
         * The string representation of this utc-offset.
         * @return {String}
         */
        toString: function toString() {
          return (this.factor == 1 ? "+" : "-") +
                  ICAL.helpers.pad2(this.hours) + ':' +
                  ICAL.helpers.pad2(this.minutes);
        }
      };

      /**
       * Creates a new {@link ICAL.UtcOffset} instance from the passed string.
       *
       * @param {String} aString    The string to parse
       * @return {ICAL.Duration}    The created utc-offset instance
       */
      UtcOffset.fromString = function(aString) {
        // -05:00
        var options = {};
        //TODO: support seconds per rfc5545 ?
        options.factor = (aString[0] === '+') ? 1 : -1;
        options.hours = ICAL.helpers.strictParseInt(aString.substr(1, 2));
        options.minutes = ICAL.helpers.strictParseInt(aString.substr(4, 2));

        return new ICAL.UtcOffset(options);
      };

      /**
       * Creates a new {@link ICAL.UtcOffset} instance from the passed seconds
       * value.
       *
       * @param {Number} aSeconds       The number of seconds to convert
       */
      UtcOffset.fromSeconds = function(aSeconds) {
        var instance = new UtcOffset();
        instance.fromSeconds(aSeconds);
        return instance;
      };

      return UtcOffset;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.Binary = (function() {

      /**
       * @classdesc
       * Represents the BINARY value type, which contains extra methods for
       * encoding and decoding.
       *
       * @class
       * @alias ICAL.Binary
       * @param {String} aValue     The binary data for this value
       */
      function Binary(aValue) {
        this.value = aValue;
      }

      Binary.prototype = {
        /**
         * The type name, to be used in the jCal object.
         * @default "binary"
         * @constant
         */
        icaltype: "binary",

        /**
         * Base64 decode the current value
         *
         * @return {String}         The base64-decoded value
         */
        decodeValue: function decodeValue() {
          return this._b64_decode(this.value);
        },

        /**
         * Encodes the passed parameter with base64 and sets the internal
         * value to the result.
         *
         * @param {String} aValue      The raw binary value to encode
         */
        setEncodedValue: function setEncodedValue(aValue) {
          this.value = this._b64_encode(aValue);
        },

        _b64_encode: function base64_encode(data) {
          // http://kevin.vanzonneveld.net
          // +   original by: Tyler Akins (http://rumkin.com)
          // +   improved by: Bayron Guevara
          // +   improved by: Thunder.m
          // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
          // +   bugfixed by: Pellentesque Malesuada
          // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
          // +   improved by: Rafał Kukawski (http://kukawski.pl)
          // *     example 1: base64_encode('Kevin van Zonneveld');
          // *     returns 1: 'S2V2aW4gdmFuIFpvbm5ldmVsZA=='
          // mozilla has this native
          // - but breaks in 2.0.0.12!
          //if (typeof this.window['atob'] == 'function') {
          //    return atob(data);
          //}
          var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                    "abcdefghijklmnopqrstuvwxyz0123456789+/=";
          var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
            ac = 0,
            enc = "",
            tmp_arr = [];

          if (!data) {
            return data;
          }

          do { // pack three octets into four hexets
            o1 = data.charCodeAt(i++);
            o2 = data.charCodeAt(i++);
            o3 = data.charCodeAt(i++);

            bits = o1 << 16 | o2 << 8 | o3;

            h1 = bits >> 18 & 0x3f;
            h2 = bits >> 12 & 0x3f;
            h3 = bits >> 6 & 0x3f;
            h4 = bits & 0x3f;

            // use hexets to index into b64, and append result to encoded string
            tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
          } while (i < data.length);

          enc = tmp_arr.join('');

          var r = data.length % 3;

          return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);

        },

        _b64_decode: function base64_decode(data) {
          // http://kevin.vanzonneveld.net
          // +   original by: Tyler Akins (http://rumkin.com)
          // +   improved by: Thunder.m
          // +      input by: Aman Gupta
          // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
          // +   bugfixed by: Onno Marsman
          // +   bugfixed by: Pellentesque Malesuada
          // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
          // +      input by: Brett Zamir (http://brett-zamir.me)
          // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
          // *     example 1: base64_decode('S2V2aW4gdmFuIFpvbm5ldmVsZA==');
          // *     returns 1: 'Kevin van Zonneveld'
          // mozilla has this native
          // - but breaks in 2.0.0.12!
          //if (typeof this.window['btoa'] == 'function') {
          //    return btoa(data);
          //}
          var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                    "abcdefghijklmnopqrstuvwxyz0123456789+/=";
          var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
            ac = 0,
            dec = "",
            tmp_arr = [];

          if (!data) {
            return data;
          }

          data += '';

          do { // unpack four hexets into three octets using index points in b64
            h1 = b64.indexOf(data.charAt(i++));
            h2 = b64.indexOf(data.charAt(i++));
            h3 = b64.indexOf(data.charAt(i++));
            h4 = b64.indexOf(data.charAt(i++));

            bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;

            o1 = bits >> 16 & 0xff;
            o2 = bits >> 8 & 0xff;
            o3 = bits & 0xff;

            if (h3 == 64) {
              tmp_arr[ac++] = String.fromCharCode(o1);
            } else if (h4 == 64) {
              tmp_arr[ac++] = String.fromCharCode(o1, o2);
            } else {
              tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
            }
          } while (i < data.length);

          dec = tmp_arr.join('');

          return dec;
        },

        /**
         * The string representation of this value
         * @return {String}
         */
        toString: function() {
          return this.value;
        }
      };

      /**
       * Creates a binary value from the given string.
       *
       * @param {String} aString        The binary value string
       * @return {ICAL.Binary}          The binary value instance
       */
      Binary.fromString = function(aString) {
        return new Binary(aString);
      };

      return Binary;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */



    (function() {
      /**
       * @classdesc
       * This class represents the "period" value type, with various calculation
       * and manipulation methods.
       *
       * @description
       * The passed data object cannot contain both and end date and a duration.
       *
       * @class
       * @param {Object} aData                  An object with members of the period
       * @param {ICAL.Time=} aData.start        The start of the period
       * @param {ICAL.Time=} aData.end          The end of the period
       * @param {ICAL.Duration=} aData.duration The duration of the period
       */
      ICAL.Period = function icalperiod(aData) {
        this.wrappedJSObject = this;

        if (aData && 'start' in aData) {
          if (aData.start && !(aData.start instanceof ICAL.Time)) {
            throw new TypeError('.start must be an instance of ICAL.Time');
          }
          this.start = aData.start;
        }

        if (aData && aData.end && aData.duration) {
          throw new Error('cannot accept both end and duration');
        }

        if (aData && 'end' in aData) {
          if (aData.end && !(aData.end instanceof ICAL.Time)) {
            throw new TypeError('.end must be an instance of ICAL.Time');
          }
          this.end = aData.end;
        }

        if (aData && 'duration' in aData) {
          if (aData.duration && !(aData.duration instanceof ICAL.Duration)) {
            throw new TypeError('.duration must be an instance of ICAL.Duration');
          }
          this.duration = aData.duration;
        }
      };

      ICAL.Period.prototype = {

        /**
         * The start of the period
         * @type {ICAL.Time}
         */
        start: null,

        /**
         * The end of the period
         * @type {ICAL.Time}
         */
        end: null,

        /**
         * The duration of the period
         * @type {ICAL.Duration}
         */
        duration: null,

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "icalperiod"
         */
        icalclass: "icalperiod",

        /**
         * The type name, to be used in the jCal object.
         * @constant
         * @type {String}
         * @default "period"
         */
        icaltype: "period",

        /**
         * Returns a clone of the duration object.
         *
         * @return {ICAL.Period}      The cloned object
         */
        clone: function() {
          return ICAL.Period.fromData({
            start: this.start ? this.start.clone() : null,
            end: this.end ? this.end.clone() : null,
            duration: this.duration ? this.duration.clone() : null
          });
        },

        /**
         * Calculates the duration of the period, either directly or by subtracting
         * start from end date.
         *
         * @return {ICAL.Duration}      The calculated duration
         */
        getDuration: function duration() {
          if (this.duration) {
            return this.duration;
          } else {
            return this.end.subtractDate(this.start);
          }
        },

        /**
         * Calculates the end date of the period, either directly or by adding
         * duration to start date.
         *
         * @return {ICAL.Time}          The calculated end date
         */
        getEnd: function() {
          if (this.end) {
            return this.end;
          } else {
            var end = this.start.clone();
            end.addDuration(this.duration);
            return end;
          }
        },

        /**
         * The string representation of this period.
         * @return {String}
         */
        toString: function toString() {
          return this.start + "/" + (this.end || this.duration);
        },

        /**
         * The jCal representation of this period type.
         * @return {Object}
         */
        toJSON: function() {
          return [this.start.toString(), (this.end || this.duration).toString()];
        },

        /**
         * The iCalendar string representation of this period.
         * @return {String}
         */
        toICALString: function() {
          return this.start.toICALString() + "/" +
                 (this.end || this.duration).toICALString();
        }
      };

      /**
       * Creates a new {@link ICAL.Period} instance from the passed string.
       *
       * @param {String} str            The string to parse
       * @param {ICAL.Property} prop    The property this period will be on
       * @return {ICAL.Period}          The created period instance
       */
      ICAL.Period.fromString = function fromString(str, prop) {
        var parts = str.split('/');

        if (parts.length !== 2) {
          throw new Error(
            'Invalid string value: "' + str + '" must contain a "/" char.'
          );
        }

        var options = {
          start: ICAL.Time.fromDateTimeString(parts[0], prop)
        };

        var end = parts[1];

        if (ICAL.Duration.isValueString(end)) {
          options.duration = ICAL.Duration.fromString(end);
        } else {
          options.end = ICAL.Time.fromDateTimeString(end, prop);
        }

        return new ICAL.Period(options);
      };

      /**
       * Creates a new {@link ICAL.Period} instance from the given data object.
       * The passed data object cannot contain both and end date and a duration.
       *
       * @param {Object} aData                  An object with members of the period
       * @param {ICAL.Time=} aData.start        The start of the period
       * @param {ICAL.Time=} aData.end          The end of the period
       * @param {ICAL.Duration=} aData.duration The duration of the period
       * @return {ICAL.Period}                  The period instance
       */
      ICAL.Period.fromData = function fromData(aData) {
        return new ICAL.Period(aData);
      };

      /**
       * Returns a new period instance from the given jCal data array. The first
       * member is always the start date string, the second member is either a
       * duration or end date string.
       *
       * @param {Array<String,String>} aData    The jCal data array
       * @param {ICAL.Property} aProp           The property this jCal data is on
       * @param {Boolean} aLenient              If true, data value can be both date and date-time
       * @return {ICAL.Period}                  The period instance
       */
      ICAL.Period.fromJSON = function(aData, aProp, aLenient) {
        function fromDateOrDateTimeString(aValue, aProp) {
          if (aLenient) {
            return ICAL.Time.fromString(aValue, aProp);
          } else {
            return ICAL.Time.fromDateTimeString(aValue, aProp);
          }
        }

        if (ICAL.Duration.isValueString(aData[1])) {
          return ICAL.Period.fromData({
            start: fromDateOrDateTimeString(aData[0], aProp),
            duration: ICAL.Duration.fromString(aData[1])
          });
        } else {
          return ICAL.Period.fromData({
            start: fromDateOrDateTimeString(aData[0], aProp),
            end: fromDateOrDateTimeString(aData[1], aProp)
          });
        }
      };
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */



    (function() {
      var DURATION_LETTERS = /([PDWHMTS]{1,1})/;

      /**
       * @classdesc
       * This class represents the "duration" value type, with various calculation
       * and manipulation methods.
       *
       * @class
       * @alias ICAL.Duration
       * @param {Object} data               An object with members of the duration
       * @param {Number} data.weeks         Duration in weeks
       * @param {Number} data.days          Duration in days
       * @param {Number} data.hours         Duration in hours
       * @param {Number} data.minutes       Duration in minutes
       * @param {Number} data.seconds       Duration in seconds
       * @param {Boolean} data.isNegative   If true, the duration is negative
       */
      ICAL.Duration = function icalduration(data) {
        this.wrappedJSObject = this;
        this.fromData(data);
      };

      ICAL.Duration.prototype = {
        /**
         * The weeks in this duration
         * @type {Number}
         * @default 0
         */
        weeks: 0,

        /**
         * The days in this duration
         * @type {Number}
         * @default 0
         */
        days: 0,

        /**
         * The days in this duration
         * @type {Number}
         * @default 0
         */
        hours: 0,

        /**
         * The minutes in this duration
         * @type {Number}
         * @default 0
         */
        minutes: 0,

        /**
         * The seconds in this duration
         * @type {Number}
         * @default 0
         */
        seconds: 0,

        /**
         * The seconds in this duration
         * @type {Boolean}
         * @default false
         */
        isNegative: false,

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "icalduration"
         */
        icalclass: "icalduration",

        /**
         * The type name, to be used in the jCal object.
         * @constant
         * @type {String}
         * @default "duration"
         */
        icaltype: "duration",

        /**
         * Returns a clone of the duration object.
         *
         * @return {ICAL.Duration}      The cloned object
         */
        clone: function clone() {
          return ICAL.Duration.fromData(this);
        },

        /**
         * The duration value expressed as a number of seconds.
         *
         * @return {Number}             The duration value in seconds
         */
        toSeconds: function toSeconds() {
          var seconds = this.seconds + 60 * this.minutes + 3600 * this.hours +
                        86400 * this.days + 7 * 86400 * this.weeks;
          return (this.isNegative ? -seconds : seconds);
        },

        /**
         * Reads the passed seconds value into this duration object. Afterwards,
         * members like {@link ICAL.Duration#days days} and {@link ICAL.Duration#weeks weeks} will be set up
         * accordingly.
         *
         * @param {Number} aSeconds     The duration value in seconds
         * @return {ICAL.Duration}      Returns this instance
         */
        fromSeconds: function fromSeconds(aSeconds) {
          var secs = Math.abs(aSeconds);

          this.isNegative = (aSeconds < 0);
          this.days = ICAL.helpers.trunc(secs / 86400);

          // If we have a flat number of weeks, use them.
          if (this.days % 7 == 0) {
            this.weeks = this.days / 7;
            this.days = 0;
          } else {
            this.weeks = 0;
          }

          secs -= (this.days + 7 * this.weeks) * 86400;

          this.hours = ICAL.helpers.trunc(secs / 3600);
          secs -= this.hours * 3600;

          this.minutes = ICAL.helpers.trunc(secs / 60);
          secs -= this.minutes * 60;

          this.seconds = secs;
          return this;
        },

        /**
         * Sets up the current instance using members from the passed data object.
         *
         * @param {Object} aData               An object with members of the duration
         * @param {Number} aData.weeks         Duration in weeks
         * @param {Number} aData.days          Duration in days
         * @param {Number} aData.hours         Duration in hours
         * @param {Number} aData.minutes       Duration in minutes
         * @param {Number} aData.seconds       Duration in seconds
         * @param {Boolean} aData.isNegative   If true, the duration is negative
         */
        fromData: function fromData(aData) {
          var propsToCopy = ["weeks", "days", "hours",
                             "minutes", "seconds", "isNegative"];
          for (var key in propsToCopy) {
            /* istanbul ignore if */
            if (!propsToCopy.hasOwnProperty(key)) {
              continue;
            }
            var prop = propsToCopy[key];
            if (aData && prop in aData) {
              this[prop] = aData[prop];
            } else {
              this[prop] = 0;
            }
          }
        },

        /**
         * Resets the duration instance to the default values, i.e. PT0S
         */
        reset: function reset() {
          this.isNegative = false;
          this.weeks = 0;
          this.days = 0;
          this.hours = 0;
          this.minutes = 0;
          this.seconds = 0;
        },

        /**
         * Compares the duration instance with another one.
         *
         * @param {ICAL.Duration} aOther        The instance to compare with
         * @return {Number}                     -1, 0 or 1 for less/equal/greater
         */
        compare: function compare(aOther) {
          var thisSeconds = this.toSeconds();
          var otherSeconds = aOther.toSeconds();
          return (thisSeconds > otherSeconds) - (thisSeconds < otherSeconds);
        },

        /**
         * Normalizes the duration instance. For example, a duration with a value
         * of 61 seconds will be normalized to 1 minute and 1 second.
         */
        normalize: function normalize() {
          this.fromSeconds(this.toSeconds());
        },

        /**
         * The string representation of this duration.
         * @return {String}
         */
        toString: function toString() {
          if (this.toSeconds() == 0) {
            return "PT0S";
          } else {
            var str = "";
            if (this.isNegative) str += "-";
            str += "P";
            if (this.weeks) str += this.weeks + "W";
            if (this.days) str += this.days + "D";

            if (this.hours || this.minutes || this.seconds) {
              str += "T";
              if (this.hours) str += this.hours + "H";
              if (this.minutes) str += this.minutes + "M";
              if (this.seconds) str += this.seconds + "S";
            }
            return str;
          }
        },

        /**
         * The iCalendar string representation of this duration.
         * @return {String}
         */
        toICALString: function() {
          return this.toString();
        }
      };

      /**
       * Returns a new ICAL.Duration instance from the passed seconds value.
       *
       * @param {Number} aSeconds       The seconds to create the instance from
       * @return {ICAL.Duration}        The newly created duration instance
       */
      ICAL.Duration.fromSeconds = function icalduration_from_seconds(aSeconds) {
        return (new ICAL.Duration()).fromSeconds(aSeconds);
      };

      /**
       * Internal helper function to handle a chunk of a duration.
       *
       * @param {String} letter type of duration chunk
       * @param {String} number numeric value or -/+
       * @param {Object} dict target to assign values to
       */
      function parseDurationChunk(letter, number, object) {
        var type;
        switch (letter) {
          case 'P':
            if (number && number === '-') {
              object.isNegative = true;
            } else {
              object.isNegative = false;
            }
            // period
            break;
          case 'D':
            type = 'days';
            break;
          case 'W':
            type = 'weeks';
            break;
          case 'H':
            type = 'hours';
            break;
          case 'M':
            type = 'minutes';
            break;
          case 'S':
            type = 'seconds';
            break;
          default:
            // Not a valid chunk
            return 0;
        }

        if (type) {
          if (!number && number !== 0) {
            throw new Error(
              'invalid duration value: Missing number before "' + letter + '"'
            );
          }
          var num = parseInt(number, 10);
          if (ICAL.helpers.isStrictlyNaN(num)) {
            throw new Error(
              'invalid duration value: Invalid number "' + number + '" before "' + letter + '"'
            );
          }
          object[type] = num;
        }

        return 1;
      }

      /**
       * Checks if the given string is an iCalendar duration value.
       *
       * @param {String} value      The raw ical value
       * @return {Boolean}          True, if the given value is of the
       *                              duration ical type
       */
      ICAL.Duration.isValueString = function(string) {
        return (string[0] === 'P' || string[1] === 'P');
      };

      /**
       * Creates a new {@link ICAL.Duration} instance from the passed string.
       *
       * @param {String} aStr       The string to parse
       * @return {ICAL.Duration}    The created duration instance
       */
      ICAL.Duration.fromString = function icalduration_from_string(aStr) {
        var pos = 0;
        var dict = Object.create(null);
        var chunks = 0;

        while ((pos = aStr.search(DURATION_LETTERS)) !== -1) {
          var type = aStr[pos];
          var numeric = aStr.substr(0, pos);
          aStr = aStr.substr(pos + 1);

          chunks += parseDurationChunk(type, numeric, dict);
        }

        if (chunks < 2) {
          // There must be at least a chunk with "P" and some unit chunk
          throw new Error(
            'invalid duration value: Not enough duration components in "' + aStr + '"'
          );
        }

        return new ICAL.Duration(dict);
      };

      /**
       * Creates a new ICAL.Duration instance from the given data object.
       *
       * @param {Object} aData               An object with members of the duration
       * @param {Number} aData.weeks         Duration in weeks
       * @param {Number} aData.days          Duration in days
       * @param {Number} aData.hours         Duration in hours
       * @param {Number} aData.minutes       Duration in minutes
       * @param {Number} aData.seconds       Duration in seconds
       * @param {Boolean} aData.isNegative   If true, the duration is negative
       * @return {ICAL.Duration}             The createad duration instance
       */
      ICAL.Duration.fromData = function icalduration_from_data(aData) {
        return new ICAL.Duration(aData);
      };
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2012 */



    (function() {
      var OPTIONS = ["tzid", "location", "tznames",
                     "latitude", "longitude"];

      /**
       * @classdesc
       * Timezone representation, created by passing in a tzid and component.
       *
       * @example
       * var vcalendar;
       * var timezoneComp = vcalendar.getFirstSubcomponent('vtimezone');
       * var tzid = timezoneComp.getFirstPropertyValue('tzid');
       *
       * var timezone = new ICAL.Timezone({
       *   component: timezoneComp,
       *   tzid
       * });
       *
       * @class
       * @param {ICAL.Component|Object} data options for class
       * @param {String|ICAL.Component} data.component
       *        If data is a simple object, then this member can be set to either a
       *        string containing the component data, or an already parsed
       *        ICAL.Component
       * @param {String} data.tzid      The timezone identifier
       * @param {String} data.location  The timezone locationw
       * @param {String} data.tznames   An alternative string representation of the
       *                                  timezone
       * @param {Number} data.latitude  The latitude of the timezone
       * @param {Number} data.longitude The longitude of the timezone
       */
      ICAL.Timezone = function icaltimezone(data) {
        this.wrappedJSObject = this;
        this.fromData(data);
      };

      ICAL.Timezone.prototype = {

        /**
         * Timezone identifier
         * @type {String}
         */
        tzid: "",

        /**
         * Timezone location
         * @type {String}
         */
        location: "",

        /**
         * Alternative timezone name, for the string representation
         * @type {String}
         */
        tznames: "",

        /**
         * The primary latitude for the timezone.
         * @type {Number}
         */
        latitude: 0.0,

        /**
         * The primary longitude for the timezone.
         * @type {Number}
         */
        longitude: 0.0,

        /**
         * The vtimezone component for this timezone.
         * @type {ICAL.Component}
         */
        component: null,

        /**
         * The year this timezone has been expanded to. All timezone transition
         * dates until this year are known and can be used for calculation
         *
         * @private
         * @type {Number}
         */
        expandedUntilYear: 0,

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "icaltimezone"
         */
        icalclass: "icaltimezone",

        /**
         * Sets up the current instance using members from the passed data object.
         *
         * @param {ICAL.Component|Object} aData options for class
         * @param {String|ICAL.Component} aData.component
         *        If aData is a simple object, then this member can be set to either a
         *        string containing the component data, or an already parsed
         *        ICAL.Component
         * @param {String} aData.tzid      The timezone identifier
         * @param {String} aData.location  The timezone locationw
         * @param {String} aData.tznames   An alternative string representation of the
         *                                  timezone
         * @param {Number} aData.latitude  The latitude of the timezone
         * @param {Number} aData.longitude The longitude of the timezone
         */
        fromData: function fromData(aData) {
          this.expandedUntilYear = 0;
          this.changes = [];

          if (aData instanceof ICAL.Component) {
            // Either a component is passed directly
            this.component = aData;
          } else {
            // Otherwise the component may be in the data object
            if (aData && "component" in aData) {
              if (typeof aData.component == "string") {
                // If a string was passed, parse it as a component
                var jCal = ICAL.parse(aData.component);
                this.component = new ICAL.Component(jCal);
              } else if (aData.component instanceof ICAL.Component) {
                // If it was a component already, then just set it
                this.component = aData.component;
              } else {
                // Otherwise just null out the component
                this.component = null;
              }
            }

            // Copy remaining passed properties
            for (var key in OPTIONS) {
              /* istanbul ignore else */
              if (OPTIONS.hasOwnProperty(key)) {
                var prop = OPTIONS[key];
                if (aData && prop in aData) {
                  this[prop] = aData[prop];
                }
              }
            }
          }

          // If we have a component but no TZID, attempt to get it from the
          // component's properties.
          if (this.component instanceof ICAL.Component && !this.tzid) {
            this.tzid = this.component.getFirstPropertyValue('tzid');
          }

          return this;
        },

        /**
         * Finds the utcOffset the given time would occur in this timezone.
         *
         * @param {ICAL.Time} tt        The time to check for
         * @return {Number} utc offset in seconds
         */
        utcOffset: function utcOffset(tt) {
          if (this == ICAL.Timezone.utcTimezone || this == ICAL.Timezone.localTimezone) {
            return 0;
          }

          this._ensureCoverage(tt.year);

          if (!this.changes.length) {
            return 0;
          }

          var tt_change = {
            year: tt.year,
            month: tt.month,
            day: tt.day,
            hour: tt.hour,
            minute: tt.minute,
            second: tt.second
          };

          var change_num = this._findNearbyChange(tt_change);
          var change_num_to_use = -1;
          var step = 1;

          // TODO: replace with bin search?
          for (;;) {
            var change = ICAL.helpers.clone(this.changes[change_num], true);
            if (change.utcOffset < change.prevUtcOffset) {
              ICAL.Timezone.adjust_change(change, 0, 0, 0, change.utcOffset);
            } else {
              ICAL.Timezone.adjust_change(change, 0, 0, 0,
                                              change.prevUtcOffset);
            }

            var cmp = ICAL.Timezone._compare_change_fn(tt_change, change);

            if (cmp >= 0) {
              change_num_to_use = change_num;
            } else {
              step = -1;
            }

            if (step == -1 && change_num_to_use != -1) {
              break;
            }

            change_num += step;

            if (change_num < 0) {
              return 0;
            }

            if (change_num >= this.changes.length) {
              break;
            }
          }

          var zone_change = this.changes[change_num_to_use];
          var utcOffset_change = zone_change.utcOffset - zone_change.prevUtcOffset;

          if (utcOffset_change < 0 && change_num_to_use > 0) {
            var tmp_change = ICAL.helpers.clone(zone_change, true);
            ICAL.Timezone.adjust_change(tmp_change, 0, 0, 0,
                                            tmp_change.prevUtcOffset);

            if (ICAL.Timezone._compare_change_fn(tt_change, tmp_change) < 0) {
              var prev_zone_change = this.changes[change_num_to_use - 1];

              var want_daylight = false; // TODO

              if (zone_change.is_daylight != want_daylight &&
                  prev_zone_change.is_daylight == want_daylight) {
                zone_change = prev_zone_change;
              }
            }
          }

          // TODO return is_daylight?
          return zone_change.utcOffset;
        },

        _findNearbyChange: function icaltimezone_find_nearby_change(change) {
          // find the closest match
          var idx = ICAL.helpers.binsearchInsert(
            this.changes,
            change,
            ICAL.Timezone._compare_change_fn
          );

          if (idx >= this.changes.length) {
            return this.changes.length - 1;
          }

          return idx;
        },

        _ensureCoverage: function(aYear) {
          if (ICAL.Timezone._minimumExpansionYear == -1) {
            var today = ICAL.Time.now();
            ICAL.Timezone._minimumExpansionYear = today.year;
          }

          var changesEndYear = aYear;
          if (changesEndYear < ICAL.Timezone._minimumExpansionYear) {
            changesEndYear = ICAL.Timezone._minimumExpansionYear;
          }

          changesEndYear += ICAL.Timezone.EXTRA_COVERAGE;

          if (changesEndYear > ICAL.Timezone.MAX_YEAR) {
            changesEndYear = ICAL.Timezone.MAX_YEAR;
          }

          if (!this.changes.length || this.expandedUntilYear < aYear) {
            var subcomps = this.component.getAllSubcomponents();
            var compLen = subcomps.length;
            var compIdx = 0;

            for (; compIdx < compLen; compIdx++) {
              this._expandComponent(
                subcomps[compIdx], changesEndYear, this.changes
              );
            }

            this.changes.sort(ICAL.Timezone._compare_change_fn);
            this.expandedUntilYear = changesEndYear;
          }
        },

        _expandComponent: function(aComponent, aYear, changes) {
          if (!aComponent.hasProperty("dtstart") ||
              !aComponent.hasProperty("tzoffsetto") ||
              !aComponent.hasProperty("tzoffsetfrom")) {
            return null;
          }

          var dtstart = aComponent.getFirstProperty("dtstart").getFirstValue();
          var change;

          function convert_tzoffset(offset) {
            return offset.factor * (offset.hours * 3600 + offset.minutes * 60);
          }

          function init_changes() {
            var changebase = {};
            changebase.is_daylight = (aComponent.name == "daylight");
            changebase.utcOffset = convert_tzoffset(
              aComponent.getFirstProperty("tzoffsetto").getFirstValue()
            );

            changebase.prevUtcOffset = convert_tzoffset(
              aComponent.getFirstProperty("tzoffsetfrom").getFirstValue()
            );

            return changebase;
          }

          if (!aComponent.hasProperty("rrule") && !aComponent.hasProperty("rdate")) {
            change = init_changes();
            change.year = dtstart.year;
            change.month = dtstart.month;
            change.day = dtstart.day;
            change.hour = dtstart.hour;
            change.minute = dtstart.minute;
            change.second = dtstart.second;

            ICAL.Timezone.adjust_change(change, 0, 0, 0,
                                            -change.prevUtcOffset);
            changes.push(change);
          } else {
            var props = aComponent.getAllProperties("rdate");
            for (var rdatekey in props) {
              /* istanbul ignore if */
              if (!props.hasOwnProperty(rdatekey)) {
                continue;
              }
              var rdate = props[rdatekey];
              var time = rdate.getFirstValue();
              change = init_changes();

              change.year = time.year;
              change.month = time.month;
              change.day = time.day;

              if (time.isDate) {
                change.hour = dtstart.hour;
                change.minute = dtstart.minute;
                change.second = dtstart.second;

                if (dtstart.zone != ICAL.Timezone.utcTimezone) {
                  ICAL.Timezone.adjust_change(change, 0, 0, 0,
                                                  -change.prevUtcOffset);
                }
              } else {
                change.hour = time.hour;
                change.minute = time.minute;
                change.second = time.second;

                if (time.zone != ICAL.Timezone.utcTimezone) {
                  ICAL.Timezone.adjust_change(change, 0, 0, 0,
                                                  -change.prevUtcOffset);
                }
              }

              changes.push(change);
            }

            var rrule = aComponent.getFirstProperty("rrule");

            if (rrule) {
              rrule = rrule.getFirstValue();
              change = init_changes();

              if (rrule.until && rrule.until.zone == ICAL.Timezone.utcTimezone) {
                rrule.until.adjust(0, 0, 0, change.prevUtcOffset);
                rrule.until.zone = ICAL.Timezone.localTimezone;
              }

              var iterator = rrule.iterator(dtstart);

              var occ;
              while ((occ = iterator.next())) {
                change = init_changes();
                if (occ.year > aYear || !occ) {
                  break;
                }

                change.year = occ.year;
                change.month = occ.month;
                change.day = occ.day;
                change.hour = occ.hour;
                change.minute = occ.minute;
                change.second = occ.second;
                change.isDate = occ.isDate;

                ICAL.Timezone.adjust_change(change, 0, 0, 0,
                                                -change.prevUtcOffset);
                changes.push(change);
              }
            }
          }

          return changes;
        },

        /**
         * The string representation of this timezone.
         * @return {String}
         */
        toString: function toString() {
          return (this.tznames ? this.tznames : this.tzid);
        }
      };

      ICAL.Timezone._compare_change_fn = function icaltimezone_compare_change_fn(a, b) {
        if (a.year < b.year) return -1;
        else if (a.year > b.year) return 1;

        if (a.month < b.month) return -1;
        else if (a.month > b.month) return 1;

        if (a.day < b.day) return -1;
        else if (a.day > b.day) return 1;

        if (a.hour < b.hour) return -1;
        else if (a.hour > b.hour) return 1;

        if (a.minute < b.minute) return -1;
        else if (a.minute > b.minute) return 1;

        if (a.second < b.second) return -1;
        else if (a.second > b.second) return 1;

        return 0;
      };

      /**
       * Convert the date/time from one zone to the next.
       *
       * @param {ICAL.Time} tt                  The time to convert
       * @param {ICAL.Timezone} from_zone       The source zone to convert from
       * @param {ICAL.Timezone} to_zone         The target zone to convert to
       * @return {ICAL.Time}                    The converted date/time object
       */
      ICAL.Timezone.convert_time = function icaltimezone_convert_time(tt, from_zone, to_zone) {
        if (tt.isDate ||
            from_zone.tzid == to_zone.tzid ||
            from_zone == ICAL.Timezone.localTimezone ||
            to_zone == ICAL.Timezone.localTimezone) {
          tt.zone = to_zone;
          return tt;
        }

        var utcOffset = from_zone.utcOffset(tt);
        tt.adjust(0, 0, 0, - utcOffset);

        utcOffset = to_zone.utcOffset(tt);
        tt.adjust(0, 0, 0, utcOffset);

        return null;
      };

      /**
       * Creates a new ICAL.Timezone instance from the passed data object.
       *
       * @param {ICAL.Component|Object} aData options for class
       * @param {String|ICAL.Component} aData.component
       *        If aData is a simple object, then this member can be set to either a
       *        string containing the component data, or an already parsed
       *        ICAL.Component
       * @param {String} aData.tzid      The timezone identifier
       * @param {String} aData.location  The timezone locationw
       * @param {String} aData.tznames   An alternative string representation of the
       *                                  timezone
       * @param {Number} aData.latitude  The latitude of the timezone
       * @param {Number} aData.longitude The longitude of the timezone
       */
      ICAL.Timezone.fromData = function icaltimezone_fromData(aData) {
        var tt = new ICAL.Timezone();
        return tt.fromData(aData);
      };

      /**
       * The instance describing the UTC timezone
       * @type {ICAL.Timezone}
       * @constant
       * @instance
       */
      ICAL.Timezone.utcTimezone = ICAL.Timezone.fromData({
        tzid: "UTC"
      });

      /**
       * The instance describing the local timezone
       * @type {ICAL.Timezone}
       * @constant
       * @instance
       */
      ICAL.Timezone.localTimezone = ICAL.Timezone.fromData({
        tzid: "floating"
      });

      /**
       * Adjust a timezone change object.
       * @private
       * @param {Object} change     The timezone change object
       * @param {Number} days       The extra amount of days
       * @param {Number} hours      The extra amount of hours
       * @param {Number} minutes    The extra amount of minutes
       * @param {Number} seconds    The extra amount of seconds
       */
      ICAL.Timezone.adjust_change = function icaltimezone_adjust_change(change, days, hours, minutes, seconds) {
        return ICAL.Time.prototype.adjust.call(
          change,
          days,
          hours,
          minutes,
          seconds,
          change
        );
      };

      ICAL.Timezone._minimumExpansionYear = -1;
      ICAL.Timezone.MAX_YEAR = 2035; // TODO this is because of time_t, which we don't need. Still usefull?
      ICAL.Timezone.EXTRA_COVERAGE = 5;
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.TimezoneService = (function() {
      var zones;

      /**
       * @classdesc
       * Singleton class to contain timezones.  Right now it is all manual registry in
       * the future we may use this class to download timezone information or handle
       * loading pre-expanded timezones.
       *
       * @namespace
       * @alias ICAL.TimezoneService
       */
      var TimezoneService = {
        get count() {
          return Object.keys(zones).length;
        },

        reset: function() {
          zones = Object.create(null);
          var utc = ICAL.Timezone.utcTimezone;

          zones.Z = utc;
          zones.UTC = utc;
          zones.GMT = utc;
        },

        /**
         * Checks if timezone id has been registered.
         *
         * @param {String} tzid     Timezone identifier (e.g. America/Los_Angeles)
         * @return {Boolean}        False, when not present
         */
        has: function(tzid) {
          return !!zones[tzid];
        },

        /**
         * Returns a timezone by its tzid if present.
         *
         * @param {String} tzid     Timezone identifier (e.g. America/Los_Angeles)
         * @return {?ICAL.Timezone} The timezone, or null if not found
         */
        get: function(tzid) {
          return zones[tzid];
        },

        /**
         * Registers a timezone object or component.
         *
         * @param {String=} name
         *        The name of the timezone. Defaults to the component's TZID if not
         *        passed.
         * @param {ICAL.Component|ICAL.Timezone} zone
         *        The initialized zone or vtimezone.
         */
        register: function(name, timezone) {
          if (name instanceof ICAL.Component) {
            if (name.name === 'vtimezone') {
              timezone = new ICAL.Timezone(name);
              name = timezone.tzid;
            }
          }

          if (timezone instanceof ICAL.Timezone) {
            zones[name] = timezone;
          } else {
            throw new TypeError('timezone must be ICAL.Timezone or ICAL.Component');
          }
        },

        /**
         * Removes a timezone by its tzid from the list.
         *
         * @param {String} tzid     Timezone identifier (e.g. America/Los_Angeles)
         * @return {?ICAL.Timezone} The removed timezone, or null if not registered
         */
        remove: function(tzid) {
          return (delete zones[tzid]);
        }
      };

      // initialize defaults
      TimezoneService.reset();

      return TimezoneService;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */



    (function() {

      /**
       * @classdesc
       * iCalendar Time representation (similar to JS Date object).  Fully
       * independent of system (OS) timezone / time.  Unlike JS Date, the month
       * January is 1, not zero.
       *
       * @example
       * var time = new ICAL.Time({
       *   year: 2012,
       *   month: 10,
       *   day: 11
       *   minute: 0,
       *   second: 0,
       *   isDate: false
       * });
       *
       *
       * @alias ICAL.Time
       * @class
       * @param {Object} data           Time initialization
       * @param {Number=} data.year     The year for this date
       * @param {Number=} data.month    The month for this date
       * @param {Number=} data.day      The day for this date
       * @param {Number=} data.hour     The hour for this date
       * @param {Number=} data.minute   The minute for this date
       * @param {Number=} data.second   The second for this date
       * @param {Boolean=} data.isDate  If true, the instance represents a date (as
       *                                  opposed to a date-time)
       * @param {ICAL.Timezone} zone timezone this position occurs in
       */
      ICAL.Time = function icaltime(data, zone) {
        this.wrappedJSObject = this;
        var time = this._time = Object.create(null);

        /* time defaults */
        time.year = 0;
        time.month = 1;
        time.day = 1;
        time.hour = 0;
        time.minute = 0;
        time.second = 0;
        time.isDate = false;

        this.fromData(data, zone);
      };

      ICAL.Time._dowCache = {};
      ICAL.Time._wnCache = {};

      ICAL.Time.prototype = {

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "icaltime"
         */
        icalclass: "icaltime",
        _cachedUnixTime: null,

        /**
         * The type name, to be used in the jCal object. This value may change and
         * is strictly defined by the {@link ICAL.Time#isDate isDate} member.
         * @readonly
         * @type {String}
         * @default "date-time"
         */
        get icaltype() {
          return this.isDate ? 'date' : 'date-time';
        },

        /**
         * The timezone for this time.
         * @type {ICAL.Timezone}
         */
        zone: null,

        /**
         * Internal uses to indicate that a change has been made and the next read
         * operation must attempt to normalize the value (for example changing the
         * day to 33).
         *
         * @type {Boolean}
         * @private
         */
        _pendingNormalization: false,

        /**
         * Returns a clone of the time object.
         *
         * @return {ICAL.Time}              The cloned object
         */
        clone: function() {
          return new ICAL.Time(this._time, this.zone);
        },

        /**
         * Reset the time instance to epoch time
         */
        reset: function icaltime_reset() {
          this.fromData(ICAL.Time.epochTime);
          this.zone = ICAL.Timezone.utcTimezone;
        },

        /**
         * Reset the time instance to the given date/time values.
         *
         * @param {Number} year             The year to set
         * @param {Number} month            The month to set
         * @param {Number} day              The day to set
         * @param {Number} hour             The hour to set
         * @param {Number} minute           The minute to set
         * @param {Number} second           The second to set
         * @param {ICAL.Timezone} timezone  The timezone to set
         */
        resetTo: function icaltime_resetTo(year, month, day,
                                           hour, minute, second, timezone) {
          this.fromData({
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute,
            second: second,
            zone: timezone
          });
        },

        /**
         * Set up the current instance from the Javascript date value.
         *
         * @param {?Date} aDate     The Javascript Date to read, or null to reset
         * @param {Boolean} useUTC  If true, the UTC values of the date will be used
         */
        fromJSDate: function icaltime_fromJSDate(aDate, useUTC) {
          if (!aDate) {
            this.reset();
          } else {
            if (useUTC) {
              this.zone = ICAL.Timezone.utcTimezone;
              this.year = aDate.getUTCFullYear();
              this.month = aDate.getUTCMonth() + 1;
              this.day = aDate.getUTCDate();
              this.hour = aDate.getUTCHours();
              this.minute = aDate.getUTCMinutes();
              this.second = aDate.getUTCSeconds();
            } else {
              this.zone = ICAL.Timezone.localTimezone;
              this.year = aDate.getFullYear();
              this.month = aDate.getMonth() + 1;
              this.day = aDate.getDate();
              this.hour = aDate.getHours();
              this.minute = aDate.getMinutes();
              this.second = aDate.getSeconds();
            }
          }
          this._cachedUnixTime = null;
          return this;
        },

        /**
         * Sets up the current instance using members from the passed data object.
         *
         * @param {Object} aData            Time initialization
         * @param {Number=} aData.year      The year for this date
         * @param {Number=} aData.month     The month for this date
         * @param {Number=} aData.day       The day for this date
         * @param {Number=} aData.hour      The hour for this date
         * @param {Number=} aData.minute    The minute for this date
         * @param {Number=} aData.second    The second for this date
         * @param {Boolean=} aData.isDate   If true, the instance represents a date
         *                                    (as opposed to a date-time)
         * @param {ICAL.Timezone=} aZone    Timezone this position occurs in
         */
        fromData: function fromData(aData, aZone) {
          if (aData) {
            for (var key in aData) {
              /* istanbul ignore else */
              if (Object.prototype.hasOwnProperty.call(aData, key)) {
                // ical type cannot be set
                if (key === 'icaltype') continue;
                this[key] = aData[key];
              }
            }
          }

          if (aZone) {
            this.zone = aZone;
          }

          if (aData && !("isDate" in aData)) {
            this.isDate = !("hour" in aData);
          } else if (aData && ("isDate" in aData)) {
            this.isDate = aData.isDate;
          }

          if (aData && "timezone" in aData) {
            var zone = ICAL.TimezoneService.get(
              aData.timezone
            );

            this.zone = zone || ICAL.Timezone.localTimezone;
          }

          if (aData && "zone" in aData) {
            this.zone = aData.zone;
          }

          if (!this.zone) {
            this.zone = ICAL.Timezone.localTimezone;
          }

          this._cachedUnixTime = null;
          return this;
        },

        /**
         * Calculate the day of week.
         * @param {ICAL.Time.weekDay=} aWeekStart
         *        The week start weekday, defaults to SUNDAY
         * @return {ICAL.Time.weekDay}
         */
        dayOfWeek: function icaltime_dayOfWeek(aWeekStart) {
          var firstDow = aWeekStart || ICAL.Time.SUNDAY;
          var dowCacheKey = (this.year << 12) + (this.month << 8) + (this.day << 3) + firstDow;
          if (dowCacheKey in ICAL.Time._dowCache) {
            return ICAL.Time._dowCache[dowCacheKey];
          }

          // Using Zeller's algorithm
          var q = this.day;
          var m = this.month + (this.month < 3 ? 12 : 0);
          var Y = this.year - (this.month < 3 ? 1 : 0);

          var h = (q + Y + ICAL.helpers.trunc(((m + 1) * 26) / 10) + ICAL.helpers.trunc(Y / 4));
          /* istanbul ignore else */
          {
            h += ICAL.helpers.trunc(Y / 100) * 6 + ICAL.helpers.trunc(Y / 400);
          }

          // Normalize to 1 = wkst
          h = ((h + 7 - firstDow) % 7) + 1;
          ICAL.Time._dowCache[dowCacheKey] = h;
          return h;
        },

        /**
         * Calculate the day of year.
         * @return {Number}
         */
        dayOfYear: function dayOfYear() {
          var is_leap = (ICAL.Time.isLeapYear(this.year) ? 1 : 0);
          var diypm = ICAL.Time.daysInYearPassedMonth;
          return diypm[is_leap][this.month - 1] + this.day;
        },

        /**
         * Returns a copy of the current date/time, rewound to the start of the
         * week. The resulting ICAL.Time instance is of icaltype date, even if this
         * is a date-time.
         *
         * @param {ICAL.Time.weekDay=} aWeekStart
         *        The week start weekday, defaults to SUNDAY
         * @return {ICAL.Time}      The start of the week (cloned)
         */
        startOfWeek: function startOfWeek(aWeekStart) {
          var firstDow = aWeekStart || ICAL.Time.SUNDAY;
          var result = this.clone();
          result.day -= ((this.dayOfWeek() + 7 - firstDow) % 7);
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * Returns a copy of the current date/time, shifted to the end of the week.
         * The resulting ICAL.Time instance is of icaltype date, even if this is a
         * date-time.
         *
         * @param {ICAL.Time.weekDay=} aWeekStart
         *        The week start weekday, defaults to SUNDAY
         * @return {ICAL.Time}      The end of the week (cloned)
         */
        endOfWeek: function endOfWeek(aWeekStart) {
          var firstDow = aWeekStart || ICAL.Time.SUNDAY;
          var result = this.clone();
          result.day += (7 - this.dayOfWeek() + firstDow - ICAL.Time.SUNDAY) % 7;
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * Returns a copy of the current date/time, rewound to the start of the
         * month. The resulting ICAL.Time instance is of icaltype date, even if
         * this is a date-time.
         *
         * @return {ICAL.Time}      The start of the month (cloned)
         */
        startOfMonth: function startOfMonth() {
          var result = this.clone();
          result.day = 1;
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * Returns a copy of the current date/time, shifted to the end of the
         * month.  The resulting ICAL.Time instance is of icaltype date, even if
         * this is a date-time.
         *
         * @return {ICAL.Time}      The end of the month (cloned)
         */
        endOfMonth: function endOfMonth() {
          var result = this.clone();
          result.day = ICAL.Time.daysInMonth(result.month, result.year);
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * Returns a copy of the current date/time, rewound to the start of the
         * year. The resulting ICAL.Time instance is of icaltype date, even if
         * this is a date-time.
         *
         * @return {ICAL.Time}      The start of the year (cloned)
         */
        startOfYear: function startOfYear() {
          var result = this.clone();
          result.day = 1;
          result.month = 1;
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * Returns a copy of the current date/time, shifted to the end of the
         * year.  The resulting ICAL.Time instance is of icaltype date, even if
         * this is a date-time.
         *
         * @return {ICAL.Time}      The end of the year (cloned)
         */
        endOfYear: function endOfYear() {
          var result = this.clone();
          result.day = 31;
          result.month = 12;
          result.isDate = true;
          result.hour = 0;
          result.minute = 0;
          result.second = 0;
          return result;
        },

        /**
         * First calculates the start of the week, then returns the day of year for
         * this date. If the day falls into the previous year, the day is zero or negative.
         *
         * @param {ICAL.Time.weekDay=} aFirstDayOfWeek
         *        The week start weekday, defaults to SUNDAY
         * @return {Number}     The calculated day of year
         */
        startDoyWeek: function startDoyWeek(aFirstDayOfWeek) {
          var firstDow = aFirstDayOfWeek || ICAL.Time.SUNDAY;
          var delta = this.dayOfWeek() - firstDow;
          if (delta < 0) delta += 7;
          return this.dayOfYear() - delta;
        },

        /**
         * Get the dominical letter for the current year. Letters range from A - G
         * for common years, and AG to GF for leap years.
         *
         * @param {Number} yr           The year to retrieve the letter for
         * @return {String}             The dominical letter.
         */
        getDominicalLetter: function() {
          return ICAL.Time.getDominicalLetter(this.year);
        },

        /**
         * Finds the nthWeekDay relative to the current month (not day).  The
         * returned value is a day relative the month that this month belongs to so
         * 1 would indicate the first of the month and 40 would indicate a day in
         * the following month.
         *
         * @param {Number} aDayOfWeek   Day of the week see the day name constants
         * @param {Number} aPos         Nth occurrence of a given week day values
         *        of 1 and 0 both indicate the first weekday of that type. aPos may
         *        be either positive or negative
         *
         * @return {Number} numeric value indicating a day relative
         *                   to the current month of this time object
         */
        nthWeekDay: function icaltime_nthWeekDay(aDayOfWeek, aPos) {
          var daysInMonth = ICAL.Time.daysInMonth(this.month, this.year);
          var weekday;
          var pos = aPos;

          var start = 0;

          var otherDay = this.clone();

          if (pos >= 0) {
            otherDay.day = 1;

            // because 0 means no position has been given
            // 1 and 0 indicate the same day.
            if (pos != 0) {
              // remove the extra numeric value
              pos--;
            }

            // set current start offset to current day.
            start = otherDay.day;

            // find the current day of week
            var startDow = otherDay.dayOfWeek();

            // calculate the difference between current
            // day of the week and desired day of the week
            var offset = aDayOfWeek - startDow;


            // if the offset goes into the past
            // week we add 7 so it goes into the next
            // week. We only want to go forward in time here.
            if (offset < 0)
              // this is really important otherwise we would
              // end up with dates from in the past.
              offset += 7;

            // add offset to start so start is the same
            // day of the week as the desired day of week.
            start += offset;

            // because we are going to add (and multiply)
            // the numeric value of the day we subtract it
            // from the start position so not to add it twice.
            start -= aDayOfWeek;

            // set week day
            weekday = aDayOfWeek;
          } else {

            // then we set it to the last day in the current month
            otherDay.day = daysInMonth;

            // find the ends weekday
            var endDow = otherDay.dayOfWeek();

            pos++;

            weekday = (endDow - aDayOfWeek);

            if (weekday < 0) {
              weekday += 7;
            }

            weekday = daysInMonth - weekday;
          }

          weekday += pos * 7;

          return start + weekday;
        },

        /**
         * Checks if current time is the nth weekday, relative to the current
         * month.  Will always return false when rule resolves outside of current
         * month.
         *
         * @param {ICAL.Time.weekDay} aDayOfWeek       Day of week to check
         * @param {Number} aPos                        Relative position
         * @return {Boolean}                           True, if it is the nth weekday
         */
        isNthWeekDay: function(aDayOfWeek, aPos) {
          var dow = this.dayOfWeek();

          if (aPos === 0 && dow === aDayOfWeek) {
            return true;
          }

          // get pos
          var day = this.nthWeekDay(aDayOfWeek, aPos);

          if (day === this.day) {
            return true;
          }

          return false;
        },

        /**
         * Calculates the ISO 8601 week number. The first week of a year is the
         * week that contains the first Thursday. The year can have 53 weeks, if
         * January 1st is a Friday.
         *
         * Note there are regions where the first week of the year is the one that
         * starts on January 1st, which may offset the week number. Also, if a
         * different week start is specified, this will also affect the week
         * number.
         *
         * @see ICAL.Time.weekOneStarts
         * @param {ICAL.Time.weekDay} aWeekStart        The weekday the week starts with
         * @return {Number}                             The ISO week number
         */
        weekNumber: function weekNumber(aWeekStart) {
          var wnCacheKey = (this.year << 12) + (this.month << 8) + (this.day << 3) + aWeekStart;
          if (wnCacheKey in ICAL.Time._wnCache) {
            return ICAL.Time._wnCache[wnCacheKey];
          }
          // This function courtesty of Julian Bucknall, published under the MIT license
          // http://www.boyet.com/articles/publishedarticles/calculatingtheisoweeknumb.html
          // plus some fixes to be able to use different week starts.
          var week1;

          var dt = this.clone();
          dt.isDate = true;
          var isoyear = this.year;

          if (dt.month == 12 && dt.day > 25) {
            week1 = ICAL.Time.weekOneStarts(isoyear + 1, aWeekStart);
            if (dt.compare(week1) < 0) {
              week1 = ICAL.Time.weekOneStarts(isoyear, aWeekStart);
            } else {
              isoyear++;
            }
          } else {
            week1 = ICAL.Time.weekOneStarts(isoyear, aWeekStart);
            if (dt.compare(week1) < 0) {
              week1 = ICAL.Time.weekOneStarts(--isoyear, aWeekStart);
            }
          }

          var daysBetween = (dt.subtractDate(week1).toSeconds() / 86400);
          var answer = ICAL.helpers.trunc(daysBetween / 7) + 1;
          ICAL.Time._wnCache[wnCacheKey] = answer;
          return answer;
        },

        /**
         * Adds the duration to the current time. The instance is modified in
         * place.
         *
         * @param {ICAL.Duration} aDuration         The duration to add
         */
        addDuration: function icaltime_add(aDuration) {
          var mult = (aDuration.isNegative ? -1 : 1);

          // because of the duration optimizations it is much
          // more efficient to grab all the values up front
          // then set them directly (which will avoid a normalization call).
          // So we don't actually normalize until we need it.
          var second = this.second;
          var minute = this.minute;
          var hour = this.hour;
          var day = this.day;

          second += mult * aDuration.seconds;
          minute += mult * aDuration.minutes;
          hour += mult * aDuration.hours;
          day += mult * aDuration.days;
          day += mult * 7 * aDuration.weeks;

          this.second = second;
          this.minute = minute;
          this.hour = hour;
          this.day = day;

          this._cachedUnixTime = null;
        },

        /**
         * Subtract the date details (_excluding_ timezone).  Useful for finding
         * the relative difference between two time objects excluding their
         * timezone differences.
         *
         * @param {ICAL.Time} aDate     The date to substract
         * @return {ICAL.Duration}      The difference as a duration
         */
        subtractDate: function icaltime_subtract(aDate) {
          var unixTime = this.toUnixTime() + this.utcOffset();
          var other = aDate.toUnixTime() + aDate.utcOffset();
          return ICAL.Duration.fromSeconds(unixTime - other);
        },

        /**
         * Subtract the date details, taking timezones into account.
         *
         * @param {ICAL.Time} aDate  The date to subtract
         * @return {ICAL.Duration}  The difference in duration
         */
        subtractDateTz: function icaltime_subtract_abs(aDate) {
          var unixTime = this.toUnixTime();
          var other = aDate.toUnixTime();
          return ICAL.Duration.fromSeconds(unixTime - other);
        },

        /**
         * Compares the ICAL.Time instance with another one.
         *
         * @param {ICAL.Duration} aOther        The instance to compare with
         * @return {Number}                     -1, 0 or 1 for less/equal/greater
         */
        compare: function icaltime_compare(other) {
          var a = this.toUnixTime();
          var b = other.toUnixTime();

          if (a > b) return 1;
          if (b > a) return -1;
          return 0;
        },

        /**
         * Compares only the date part of this instance with another one.
         *
         * @param {ICAL.Duration} other         The instance to compare with
         * @param {ICAL.Timezone} tz            The timezone to compare in
         * @return {Number}                     -1, 0 or 1 for less/equal/greater
         */
        compareDateOnlyTz: function icaltime_compareDateOnlyTz(other, tz) {
          function cmp(attr) {
            return ICAL.Time._cmp_attr(a, b, attr);
          }
          var a = this.convertToZone(tz);
          var b = other.convertToZone(tz);
          var rc = 0;

          if ((rc = cmp("year")) != 0) return rc;
          if ((rc = cmp("month")) != 0) return rc;
          if ((rc = cmp("day")) != 0) return rc;

          return rc;
        },

        /**
         * Convert the instance into another timezone. The returned ICAL.Time
         * instance is always a copy.
         *
         * @param {ICAL.Timezone} zone      The zone to convert to
         * @return {ICAL.Time}              The copy, converted to the zone
         */
        convertToZone: function convertToZone(zone) {
          var copy = this.clone();
          var zone_equals = (this.zone.tzid == zone.tzid);

          if (!this.isDate && !zone_equals) {
            ICAL.Timezone.convert_time(copy, this.zone, zone);
          }

          copy.zone = zone;
          return copy;
        },

        /**
         * Calculates the UTC offset of the current date/time in the timezone it is
         * in.
         *
         * @return {Number}     UTC offset in seconds
         */
        utcOffset: function utc_offset() {
          if (this.zone == ICAL.Timezone.localTimezone ||
              this.zone == ICAL.Timezone.utcTimezone) {
            return 0;
          } else {
            return this.zone.utcOffset(this);
          }
        },

        /**
         * Returns an RFC 5545 compliant ical representation of this object.
         *
         * @return {String} ical date/date-time
         */
        toICALString: function() {
          var string = this.toString();

          if (string.length > 10) {
            return ICAL.design.icalendar.value['date-time'].toICAL(string);
          } else {
            return ICAL.design.icalendar.value.date.toICAL(string);
          }
        },

        /**
         * The string representation of this date/time, in jCal form
         * (including : and - separators).
         * @return {String}
         */
        toString: function toString() {
          var result = this.year + '-' +
                       ICAL.helpers.pad2(this.month) + '-' +
                       ICAL.helpers.pad2(this.day);

          if (!this.isDate) {
              result += 'T' + ICAL.helpers.pad2(this.hour) + ':' +
                        ICAL.helpers.pad2(this.minute) + ':' +
                        ICAL.helpers.pad2(this.second);

            if (this.zone === ICAL.Timezone.utcTimezone) {
              result += 'Z';
            }
          }

          return result;
        },

        /**
         * Converts the current instance to a Javascript date
         * @return {Date}
         */
        toJSDate: function toJSDate() {
          if (this.zone == ICAL.Timezone.localTimezone) {
            if (this.isDate) {
              return new Date(this.year, this.month - 1, this.day);
            } else {
              return new Date(this.year, this.month - 1, this.day,
                              this.hour, this.minute, this.second, 0);
            }
          } else {
            return new Date(this.toUnixTime() * 1000);
          }
        },

        _normalize: function icaltime_normalize() {
          var isDate = this._time.isDate;
          if (this._time.isDate) {
            this._time.hour = 0;
            this._time.minute = 0;
            this._time.second = 0;
          }
          this.adjust(0, 0, 0, 0);

          return this;
        },

        /**
         * Adjust the date/time by the given offset
         *
         * @param {Number} aExtraDays       The extra amount of days
         * @param {Number} aExtraHours      The extra amount of hours
         * @param {Number} aExtraMinutes    The extra amount of minutes
         * @param {Number} aExtraSeconds    The extra amount of seconds
         * @param {Number=} aTime           The time to adjust, defaults to the
         *                                    current instance.
         */
        adjust: function icaltime_adjust(aExtraDays, aExtraHours,
                                         aExtraMinutes, aExtraSeconds, aTime) {

          var minutesOverflow, hoursOverflow,
              daysOverflow = 0, yearsOverflow = 0;

          var second, minute, hour, day;
          var daysInMonth;

          var time = aTime || this._time;

          if (!time.isDate) {
            second = time.second + aExtraSeconds;
            time.second = second % 60;
            minutesOverflow = ICAL.helpers.trunc(second / 60);
            if (time.second < 0) {
              time.second += 60;
              minutesOverflow--;
            }

            minute = time.minute + aExtraMinutes + minutesOverflow;
            time.minute = minute % 60;
            hoursOverflow = ICAL.helpers.trunc(minute / 60);
            if (time.minute < 0) {
              time.minute += 60;
              hoursOverflow--;
            }

            hour = time.hour + aExtraHours + hoursOverflow;

            time.hour = hour % 24;
            daysOverflow = ICAL.helpers.trunc(hour / 24);
            if (time.hour < 0) {
              time.hour += 24;
              daysOverflow--;
            }
          }


          // Adjust month and year first, because we need to know what month the day
          // is in before adjusting it.
          if (time.month > 12) {
            yearsOverflow = ICAL.helpers.trunc((time.month - 1) / 12);
          } else if (time.month < 1) {
            yearsOverflow = ICAL.helpers.trunc(time.month / 12) - 1;
          }

          time.year += yearsOverflow;
          time.month -= 12 * yearsOverflow;

          // Now take care of the days (and adjust month if needed)
          day = time.day + aExtraDays + daysOverflow;

          if (day > 0) {
            for (;;) {
              daysInMonth = ICAL.Time.daysInMonth(time.month, time.year);
              if (day <= daysInMonth) {
                break;
              }

              time.month++;
              if (time.month > 12) {
                time.year++;
                time.month = 1;
              }

              day -= daysInMonth;
            }
          } else {
            while (day <= 0) {
              if (time.month == 1) {
                time.year--;
                time.month = 12;
              } else {
                time.month--;
              }

              day += ICAL.Time.daysInMonth(time.month, time.year);
            }
          }

          time.day = day;

          this._cachedUnixTime = null;
          return this;
        },

        /**
         * Sets up the current instance from unix time, the number of seconds since
         * January 1st, 1970.
         *
         * @param {Number} seconds      The seconds to set up with
         */
        fromUnixTime: function fromUnixTime(seconds) {
          this.zone = ICAL.Timezone.utcTimezone;
          var epoch = ICAL.Time.epochTime.clone();
          epoch.adjust(0, 0, 0, seconds);

          this.year = epoch.year;
          this.month = epoch.month;
          this.day = epoch.day;
          this.hour = epoch.hour;
          this.minute = epoch.minute;
          this.second = Math.floor(epoch.second);

          this._cachedUnixTime = null;
        },

        /**
         * Converts the current instance to seconds since January 1st 1970.
         *
         * @return {Number}         Seconds since 1970
         */
        toUnixTime: function toUnixTime() {
          if (this._cachedUnixTime !== null) {
            return this._cachedUnixTime;
          }
          var offset = this.utcOffset();

          // we use the offset trick to ensure
          // that we are getting the actual UTC time
          var ms = Date.UTC(
            this.year,
            this.month - 1,
            this.day,
            this.hour,
            this.minute,
            this.second - offset
          );

          // seconds
          this._cachedUnixTime = ms / 1000;
          return this._cachedUnixTime;
        },

        /**
         * Converts time to into Object which can be serialized then re-created
         * using the constructor.
         *
         * @example
         * // toJSON will automatically be called
         * var json = JSON.stringify(mytime);
         *
         * var deserialized = JSON.parse(json);
         *
         * var time = new ICAL.Time(deserialized);
         *
         * @return {Object}
         */
        toJSON: function() {
          var copy = [
            'year',
            'month',
            'day',
            'hour',
            'minute',
            'second',
            'isDate'
          ];

          var result = Object.create(null);

          var i = 0;
          var len = copy.length;
          var prop;

          for (; i < len; i++) {
            prop = copy[i];
            result[prop] = this[prop];
          }

          if (this.zone) {
            result.timezone = this.zone.tzid;
          }

          return result;
        }

      };

      (function setupNormalizeAttributes() {
        // This needs to run before any instances are created!
        function defineAttr(attr) {
          Object.defineProperty(ICAL.Time.prototype, attr, {
            get: function getTimeAttr() {
              if (this._pendingNormalization) {
                this._normalize();
                this._pendingNormalization = false;
              }

              return this._time[attr];
            },
            set: function setTimeAttr(val) {
              // Check if isDate will be set and if was not set to normalize date.
              // This avoids losing days when seconds, minutes and hours are zeroed
              // what normalize will do when time is a date.
              if (attr === "isDate" && val && !this._time.isDate) {
                this.adjust(0, 0, 0, 0);
              }
              this._cachedUnixTime = null;
              this._pendingNormalization = true;
              this._time[attr] = val;

              return val;
            }
          });

        }

        /* istanbul ignore else */
        if ("defineProperty" in Object) {
          defineAttr("year");
          defineAttr("month");
          defineAttr("day");
          defineAttr("hour");
          defineAttr("minute");
          defineAttr("second");
          defineAttr("isDate");
        }
      })();

      /**
       * Returns the days in the given month
       *
       * @param {Number} month      The month to check
       * @param {Number} year       The year to check
       * @return {Number}           The number of days in the month
       */
      ICAL.Time.daysInMonth = function icaltime_daysInMonth(month, year) {
        var _daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        var days = 30;

        if (month < 1 || month > 12) return days;

        days = _daysInMonth[month];

        if (month == 2) {
          days += ICAL.Time.isLeapYear(year);
        }

        return days;
      };

      /**
       * Checks if the year is a leap year
       *
       * @param {Number} year       The year to check
       * @return {Boolean}          True, if the year is a leap year
       */
      ICAL.Time.isLeapYear = function isLeapYear(year) {
        if (year <= 1752) {
          return ((year % 4) == 0);
        } else {
          return (((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0));
        }
      };

      /**
       * Create a new ICAL.Time from the day of year and year. The date is returned
       * in floating timezone.
       *
       * @param {Number} aDayOfYear     The day of year
       * @param {Number} aYear          The year to create the instance in
       * @return {ICAL.Time}            The created instance with the calculated date
       */
      ICAL.Time.fromDayOfYear = function icaltime_fromDayOfYear(aDayOfYear, aYear) {
        var year = aYear;
        var doy = aDayOfYear;
        var tt = new ICAL.Time();
        tt.auto_normalize = false;
        var is_leap = (ICAL.Time.isLeapYear(year) ? 1 : 0);

        if (doy < 1) {
          year--;
          is_leap = (ICAL.Time.isLeapYear(year) ? 1 : 0);
          doy += ICAL.Time.daysInYearPassedMonth[is_leap][12];
          return ICAL.Time.fromDayOfYear(doy, year);
        } else if (doy > ICAL.Time.daysInYearPassedMonth[is_leap][12]) {
          is_leap = (ICAL.Time.isLeapYear(year) ? 1 : 0);
          doy -= ICAL.Time.daysInYearPassedMonth[is_leap][12];
          year++;
          return ICAL.Time.fromDayOfYear(doy, year);
        }

        tt.year = year;
        tt.isDate = true;

        for (var month = 11; month >= 0; month--) {
          if (doy > ICAL.Time.daysInYearPassedMonth[is_leap][month]) {
            tt.month = month + 1;
            tt.day = doy - ICAL.Time.daysInYearPassedMonth[is_leap][month];
            break;
          }
        }

        tt.auto_normalize = true;
        return tt;
      };

      /**
       * Returns a new ICAL.Time instance from a date string, e.g 2015-01-02.
       *
       * @deprecated                Use {@link ICAL.Time.fromDateString} instead
       * @param {String} str        The string to create from
       * @return {ICAL.Time}        The date/time instance
       */
      ICAL.Time.fromStringv2 = function fromString(str) {
        return new ICAL.Time({
          year: parseInt(str.substr(0, 4), 10),
          month: parseInt(str.substr(5, 2), 10),
          day: parseInt(str.substr(8, 2), 10),
          isDate: true
        });
      };

      /**
       * Returns a new ICAL.Time instance from a date string, e.g 2015-01-02.
       *
       * @param {String} aValue     The string to create from
       * @return {ICAL.Time}        The date/time instance
       */
      ICAL.Time.fromDateString = function(aValue) {
        // Dates should have no timezone.
        // Google likes to sometimes specify Z on dates
        // we specifically ignore that to avoid issues.

        // YYYY-MM-DD
        // 2012-10-10
        return new ICAL.Time({
          year: ICAL.helpers.strictParseInt(aValue.substr(0, 4)),
          month: ICAL.helpers.strictParseInt(aValue.substr(5, 2)),
          day: ICAL.helpers.strictParseInt(aValue.substr(8, 2)),
          isDate: true
        });
      };

      /**
       * Returns a new ICAL.Time instance from a date-time string, e.g
       * 2015-01-02T03:04:05. If a property is specified, the timezone is set up
       * from the property's TZID parameter.
       *
       * @param {String} aValue         The string to create from
       * @param {ICAL.Property=} prop   The property the date belongs to
       * @return {ICAL.Time}            The date/time instance
       */
      ICAL.Time.fromDateTimeString = function(aValue, prop) {
        if (aValue.length < 19) {
          throw new Error(
            'invalid date-time value: "' + aValue + '"'
          );
        }

        var zone;

        if (aValue[19] && aValue[19] === 'Z') {
          zone = 'Z';
        } else if (prop) {
          zone = prop.getParameter('tzid');
        }

        // 2012-10-10T10:10:10(Z)?
        var time = new ICAL.Time({
          year: ICAL.helpers.strictParseInt(aValue.substr(0, 4)),
          month: ICAL.helpers.strictParseInt(aValue.substr(5, 2)),
          day: ICAL.helpers.strictParseInt(aValue.substr(8, 2)),
          hour: ICAL.helpers.strictParseInt(aValue.substr(11, 2)),
          minute: ICAL.helpers.strictParseInt(aValue.substr(14, 2)),
          second: ICAL.helpers.strictParseInt(aValue.substr(17, 2)),
          timezone: zone
        });

        return time;
      };

      /**
       * Returns a new ICAL.Time instance from a date or date-time string,
       *
       * @param {String} aValue         The string to create from
       * @param {ICAL.Property=} prop   The property the date belongs to
       * @return {ICAL.Time}            The date/time instance
       */
      ICAL.Time.fromString = function fromString(aValue, aProperty) {
        if (aValue.length > 10) {
          return ICAL.Time.fromDateTimeString(aValue, aProperty);
        } else {
          return ICAL.Time.fromDateString(aValue);
        }
      };

      /**
       * Creates a new ICAL.Time instance from the given Javascript Date.
       *
       * @param {?Date} aDate     The Javascript Date to read, or null to reset
       * @param {Boolean} useUTC  If true, the UTC values of the date will be used
       */
      ICAL.Time.fromJSDate = function fromJSDate(aDate, useUTC) {
        var tt = new ICAL.Time();
        return tt.fromJSDate(aDate, useUTC);
      };

      /**
       * Creates a new ICAL.Time instance from the the passed data object.
       *
       * @param {Object} aData            Time initialization
       * @param {Number=} aData.year      The year for this date
       * @param {Number=} aData.month     The month for this date
       * @param {Number=} aData.day       The day for this date
       * @param {Number=} aData.hour      The hour for this date
       * @param {Number=} aData.minute    The minute for this date
       * @param {Number=} aData.second    The second for this date
       * @param {Boolean=} aData.isDate   If true, the instance represents a date
       *                                    (as opposed to a date-time)
       * @param {ICAL.Timezone=} aZone    Timezone this position occurs in
       */
      ICAL.Time.fromData = function fromData(aData, aZone) {
        var t = new ICAL.Time();
        return t.fromData(aData, aZone);
      };

      /**
       * Creates a new ICAL.Time instance from the current moment.
       * The instance is “floating” - has no timezone relation.
       * To create an instance considering the time zone, call
       * ICAL.Time.fromJSDate(new Date(), true)
       * @return {ICAL.Time}
       */
      ICAL.Time.now = function icaltime_now() {
        return ICAL.Time.fromJSDate(new Date(), false);
      };

      /**
       * Returns the date on which ISO week number 1 starts.
       *
       * @see ICAL.Time#weekNumber
       * @param {Number} aYear                  The year to search in
       * @param {ICAL.Time.weekDay=} aWeekStart The week start weekday, used for calculation.
       * @return {ICAL.Time}                    The date on which week number 1 starts
       */
      ICAL.Time.weekOneStarts = function weekOneStarts(aYear, aWeekStart) {
        var t = ICAL.Time.fromData({
          year: aYear,
          month: 1,
          day: 1,
          isDate: true
        });

        var dow = t.dayOfWeek();
        var wkst = aWeekStart || ICAL.Time.DEFAULT_WEEK_START;
        if (dow > ICAL.Time.THURSDAY) {
          t.day += 7;
        }
        if (wkst > ICAL.Time.THURSDAY) {
          t.day -= 7;
        }

        t.day -= dow - wkst;

        return t;
      };

      /**
       * Get the dominical letter for the given year. Letters range from A - G for
       * common years, and AG to GF for leap years.
       *
       * @param {Number} yr           The year to retrieve the letter for
       * @return {String}             The dominical letter.
       */
      ICAL.Time.getDominicalLetter = function(yr) {
        var LTRS = "GFEDCBA";
        var dom = (yr + (yr / 4 | 0) + (yr / 400 | 0) - (yr / 100 | 0) - 1) % 7;
        var isLeap = ICAL.Time.isLeapYear(yr);
        if (isLeap) {
          return LTRS[(dom + 6) % 7] + LTRS[dom];
        } else {
          return LTRS[dom];
        }
      };

      /**
       * January 1st, 1970 as an ICAL.Time.
       * @type {ICAL.Time}
       * @constant
       * @instance
       */
      ICAL.Time.epochTime = ICAL.Time.fromData({
        year: 1970,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        isDate: false,
        timezone: "Z"
      });

      ICAL.Time._cmp_attr = function _cmp_attr(a, b, attr) {
        if (a[attr] > b[attr]) return 1;
        if (a[attr] < b[attr]) return -1;
        return 0;
      };

      /**
       * The days that have passed in the year after a given month. The array has
       * two members, one being an array of passed days for non-leap years, the
       * other analog for leap years.
       * @example
       * var isLeapYear = ICAL.Time.isLeapYear(year);
       * var passedDays = ICAL.Time.daysInYearPassedMonth[isLeapYear][month];
       * @type {Array.<Array.<Number>>}
       */
      ICAL.Time.daysInYearPassedMonth = [
        [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365],
        [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366]
      ];

      /**
       * The weekday, 1 = SUNDAY, 7 = SATURDAY. Access via
       * ICAL.Time.MONDAY, ICAL.Time.TUESDAY, ...
       *
       * @typedef {Number} weekDay
       * @memberof ICAL.Time
       */

      ICAL.Time.SUNDAY = 1;
      ICAL.Time.MONDAY = 2;
      ICAL.Time.TUESDAY = 3;
      ICAL.Time.WEDNESDAY = 4;
      ICAL.Time.THURSDAY = 5;
      ICAL.Time.FRIDAY = 6;
      ICAL.Time.SATURDAY = 7;

      /**
       * The default weekday for the WKST part.
       * @constant
       * @default ICAL.Time.MONDAY
       */
      ICAL.Time.DEFAULT_WEEK_START = ICAL.Time.MONDAY;
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2015 */



    (function() {

      /**
       * Describes a vCard time, which has slight differences to the ICAL.Time.
       * Properties can be null if not specified, for example for dates with
       * reduced accuracy or truncation.
       *
       * Note that currently not all methods are correctly re-implemented for
       * VCardTime. For example, comparison will have undefined results when some
       * members are null.
       *
       * Also, normalization is not yet implemented for this class!
       *
       * @alias ICAL.VCardTime
       * @class
       * @extends {ICAL.Time}
       * @param {Object} data                           The data for the time instance
       * @param {Number=} data.year                     The year for this date
       * @param {Number=} data.month                    The month for this date
       * @param {Number=} data.day                      The day for this date
       * @param {Number=} data.hour                     The hour for this date
       * @param {Number=} data.minute                   The minute for this date
       * @param {Number=} data.second                   The second for this date
       * @param {ICAL.Timezone|ICAL.UtcOffset} zone     The timezone to use
       * @param {String} icaltype                       The type for this date/time object
       */
      ICAL.VCardTime = function(data, zone, icaltype) {
        this.wrappedJSObject = this;
        var time = this._time = Object.create(null);

        time.year = null;
        time.month = null;
        time.day = null;
        time.hour = null;
        time.minute = null;
        time.second = null;

        this.icaltype = icaltype || "date-and-or-time";

        this.fromData(data, zone);
      };
      ICAL.helpers.inherits(ICAL.Time, ICAL.VCardTime, /** @lends ICAL.VCardTime */ {

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "vcardtime"
         */
        icalclass: "vcardtime",

        /**
         * The type name, to be used in the jCal object.
         * @type {String}
         * @default "date-and-or-time"
         */
        icaltype: "date-and-or-time",

        /**
         * The timezone. This can either be floating, UTC, or an instance of
         * ICAL.UtcOffset.
         * @type {ICAL.Timezone|ICAL.UtcOFfset}
         */
        zone: null,

        /**
         * Returns a clone of the vcard date/time object.
         *
         * @return {ICAL.VCardTime}     The cloned object
         */
        clone: function() {
          return new ICAL.VCardTime(this._time, this.zone, this.icaltype);
        },

        _normalize: function() {
          return this;
        },

        /**
         * @inheritdoc
         */
        utcOffset: function() {
          if (this.zone instanceof ICAL.UtcOffset) {
            return this.zone.toSeconds();
          } else {
            return ICAL.Time.prototype.utcOffset.apply(this, arguments);
          }
        },

        /**
         * Returns an RFC 6350 compliant representation of this object.
         *
         * @return {String}         vcard date/time string
         */
        toICALString: function() {
          return ICAL.design.vcard.value[this.icaltype].toICAL(this.toString());
        },

        /**
         * The string representation of this date/time, in jCard form
         * (including : and - separators).
         * @return {String}
         */
        toString: function toString() {
          var p2 = ICAL.helpers.pad2;
          var y = this.year, m = this.month, d = this.day;
          var h = this.hour, mm = this.minute, s = this.second;

          var hasYear = y !== null, hasMonth = m !== null, hasDay = d !== null;
          var hasHour = h !== null, hasMinute = mm !== null, hasSecond = s !== null;

          var datepart = (hasYear ? p2(y) + (hasMonth || hasDay ? '-' : '') : (hasMonth || hasDay ? '--' : '')) +
                         (hasMonth ? p2(m) : '') +
                         (hasDay ? '-' + p2(d) : '');
          var timepart = (hasHour ? p2(h) : '-') + (hasHour && hasMinute ? ':' : '') +
                         (hasMinute ? p2(mm) : '') + (!hasHour && !hasMinute ? '-' : '') +
                         (hasMinute && hasSecond ? ':' : '') +
                         (hasSecond ? p2(s) : '');

          var zone;
          if (this.zone === ICAL.Timezone.utcTimezone) {
            zone = 'Z';
          } else if (this.zone instanceof ICAL.UtcOffset) {
            zone = this.zone.toString();
          } else if (this.zone === ICAL.Timezone.localTimezone) {
            zone = '';
          } else if (this.zone instanceof ICAL.Timezone) {
            var offset = ICAL.UtcOffset.fromSeconds(this.zone.utcOffset(this));
            zone = offset.toString();
          } else {
            zone = '';
          }

          switch (this.icaltype) {
            case "time":
              return timepart + zone;
            case "date-and-or-time":
            case "date-time":
              return datepart + (timepart == '--' ? '' : 'T' + timepart + zone);
            case "date":
              return datepart;
          }
          return null;
        }
      });

      /**
       * Returns a new ICAL.VCardTime instance from a date and/or time string.
       *
       * @param {String} aValue     The string to create from
       * @param {String} aIcalType  The type for this instance, e.g. date-and-or-time
       * @return {ICAL.VCardTime}   The date/time instance
       */
      ICAL.VCardTime.fromDateAndOrTimeString = function(aValue, aIcalType) {
        function part(v, s, e) {
          return v ? ICAL.helpers.strictParseInt(v.substr(s, e)) : null;
        }
        var parts = aValue.split('T');
        var dt = parts[0], tmz = parts[1];
        var splitzone = tmz ? ICAL.design.vcard.value.time._splitZone(tmz) : [];
        var zone = splitzone[0], tm = splitzone[1];

        var stoi = ICAL.helpers.strictParseInt;
        var dtlen = dt ? dt.length : 0;
        var tmlen = tm ? tm.length : 0;

        var hasDashDate = dt && dt[0] == '-' && dt[1] == '-';
        var hasDashTime = tm && tm[0] == '-';

        var o = {
          year: hasDashDate ? null : part(dt, 0, 4),
          month: hasDashDate && (dtlen == 4 || dtlen == 7) ? part(dt, 2, 2) : dtlen == 7 ? part(dt, 5, 2) : dtlen == 10 ? part(dt, 5, 2) : null,
          day: dtlen == 5 ? part(dt, 3, 2) : dtlen == 7 && hasDashDate ? part(dt, 5, 2) : dtlen == 10 ? part(dt, 8, 2) : null,

          hour: hasDashTime ? null : part(tm, 0, 2),
          minute: hasDashTime && tmlen == 3 ? part(tm, 1, 2) : tmlen > 4 ? hasDashTime ? part(tm, 1, 2) : part(tm, 3, 2) : null,
          second: tmlen == 4 ? part(tm, 2, 2) : tmlen == 6 ? part(tm, 4, 2) : tmlen == 8 ? part(tm, 6, 2) : null
        };

        if (zone == 'Z') {
          zone = ICAL.Timezone.utcTimezone;
        } else if (zone && zone[3] == ':') {
          zone = ICAL.UtcOffset.fromString(zone);
        } else {
          zone = null;
        }

        return new ICAL.VCardTime(o, zone, aIcalType);
      };
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */



    (function() {
      var DOW_MAP = {
        SU: ICAL.Time.SUNDAY,
        MO: ICAL.Time.MONDAY,
        TU: ICAL.Time.TUESDAY,
        WE: ICAL.Time.WEDNESDAY,
        TH: ICAL.Time.THURSDAY,
        FR: ICAL.Time.FRIDAY,
        SA: ICAL.Time.SATURDAY
      };

      var REVERSE_DOW_MAP = {};
      for (var key in DOW_MAP) {
        /* istanbul ignore else */
        if (DOW_MAP.hasOwnProperty(key)) {
          REVERSE_DOW_MAP[DOW_MAP[key]] = key;
        }
      }

      /**
       * @classdesc
       * This class represents the "recur" value type, with various calculation
       * and manipulation methods.
       *
       * @class
       * @alias ICAL.Recur
       * @param {Object} data                               An object with members of the recurrence
       * @param {ICAL.Recur.frequencyValues=} data.freq     The frequency value
       * @param {Number=} data.interval                     The INTERVAL value
       * @param {ICAL.Time.weekDay=} data.wkst              The week start value
       * @param {ICAL.Time=} data.until                     The end of the recurrence set
       * @param {Number=} data.count                        The number of occurrences
       * @param {Array.<Number>=} data.bysecond             The seconds for the BYSECOND part
       * @param {Array.<Number>=} data.byminute             The minutes for the BYMINUTE part
       * @param {Array.<Number>=} data.byhour               The hours for the BYHOUR part
       * @param {Array.<String>=} data.byday                The BYDAY values
       * @param {Array.<Number>=} data.bymonthday           The days for the BYMONTHDAY part
       * @param {Array.<Number>=} data.byyearday            The days for the BYYEARDAY part
       * @param {Array.<Number>=} data.byweekno             The weeks for the BYWEEKNO part
       * @param {Array.<Number>=} data.bymonth              The month for the BYMONTH part
       * @param {Array.<Number>=} data.bysetpos             The positionals for the BYSETPOS part
       */
      ICAL.Recur = function icalrecur(data) {
        this.wrappedJSObject = this;
        this.parts = {};

        if (data && typeof(data) === 'object') {
          this.fromData(data);
        }
      };

      ICAL.Recur.prototype = {
        /**
         * An object holding the BY-parts of the recurrence rule
         * @type {Object}
         */
        parts: null,

        /**
         * The interval value for the recurrence rule.
         * @type {Number}
         */
        interval: 1,

        /**
         * The week start day
         *
         * @type {ICAL.Time.weekDay}
         * @default ICAL.Time.MONDAY
         */
        wkst: ICAL.Time.MONDAY,

        /**
         * The end of the recurrence
         * @type {?ICAL.Time}
         */
        until: null,

        /**
         * The maximum number of occurrences
         * @type {?Number}
         */
        count: null,

        /**
         * The frequency value.
         * @type {ICAL.Recur.frequencyValues}
         */
        freq: null,

        /**
         * The class identifier.
         * @constant
         * @type {String}
         * @default "icalrecur"
         */
        icalclass: "icalrecur",

        /**
         * The type name, to be used in the jCal object.
         * @constant
         * @type {String}
         * @default "recur"
         */
        icaltype: "recur",

        /**
         * Create a new iterator for this recurrence rule. The passed start date
         * must be the start date of the event, not the start of the range to
         * search in.
         *
         * @example
         * var recur = comp.getFirstPropertyValue('rrule');
         * var dtstart = comp.getFirstPropertyValue('dtstart');
         * var iter = recur.iterator(dtstart);
         * for (var next = iter.next(); next; next = iter.next()) {
         *   if (next.compare(rangeStart) < 0) {
         *     continue;
         *   }
         *   console.log(next.toString());
         * }
         *
         * @param {ICAL.Time} aStart        The item's start date
         * @return {ICAL.RecurIterator}     The recurrence iterator
         */
        iterator: function(aStart) {
          return new ICAL.RecurIterator({
            rule: this,
            dtstart: aStart
          });
        },

        /**
         * Returns a clone of the recurrence object.
         *
         * @return {ICAL.Recur}      The cloned object
         */
        clone: function clone() {
          return new ICAL.Recur(this.toJSON());
        },

        /**
         * Checks if the current rule is finite, i.e. has a count or until part.
         *
         * @return {Boolean}        True, if the rule is finite
         */
        isFinite: function isfinite() {
          return !!(this.count || this.until);
        },

        /**
         * Checks if the current rule has a count part, and not limited by an until
         * part.
         *
         * @return {Boolean}        True, if the rule is by count
         */
        isByCount: function isbycount() {
          return !!(this.count && !this.until);
        },

        /**
         * Adds a component (part) to the recurrence rule. This is not a component
         * in the sense of {@link ICAL.Component}, but a part of the recurrence
         * rule, i.e. BYMONTH.
         *
         * @param {String} aType            The name of the component part
         * @param {Array|String} aValue     The component value
         */
        addComponent: function addPart(aType, aValue) {
          var ucname = aType.toUpperCase();
          if (ucname in this.parts) {
            this.parts[ucname].push(aValue);
          } else {
            this.parts[ucname] = [aValue];
          }
        },

        /**
         * Sets the component value for the given by-part.
         *
         * @param {String} aType        The component part name
         * @param {Array} aValues       The component values
         */
        setComponent: function setComponent(aType, aValues) {
          this.parts[aType.toUpperCase()] = aValues.slice();
        },

        /**
         * Gets (a copy) of the requested component value.
         *
         * @param {String} aType        The component part name
         * @return {Array}              The component part value
         */
        getComponent: function getComponent(aType) {
          var ucname = aType.toUpperCase();
          return (ucname in this.parts ? this.parts[ucname].slice() : []);
        },

        /**
         * Retrieves the next occurrence after the given recurrence id. See the
         * guide on {@tutorial terminology} for more details.
         *
         * NOTE: Currently, this method iterates all occurrences from the start
         * date. It should not be called in a loop for performance reasons. If you
         * would like to get more than one occurrence, you can iterate the
         * occurrences manually, see the example on the
         * {@link ICAL.Recur#iterator iterator} method.
         *
         * @param {ICAL.Time} aStartTime        The start of the event series
         * @param {ICAL.Time} aRecurrenceId     The date of the last occurrence
         * @return {ICAL.Time}                  The next occurrence after
         */
        getNextOccurrence: function getNextOccurrence(aStartTime, aRecurrenceId) {
          var iter = this.iterator(aStartTime);
          var next;

          do {
            next = iter.next();
          } while (next && next.compare(aRecurrenceId) <= 0);

          if (next && aRecurrenceId.zone) {
            next.zone = aRecurrenceId.zone;
          }

          return next;
        },

        /**
         * Sets up the current instance using members from the passed data object.
         *
         * @param {Object} data                               An object with members of the recurrence
         * @param {ICAL.Recur.frequencyValues=} data.freq     The frequency value
         * @param {Number=} data.interval                     The INTERVAL value
         * @param {ICAL.Time.weekDay=} data.wkst              The week start value
         * @param {ICAL.Time=} data.until                     The end of the recurrence set
         * @param {Number=} data.count                        The number of occurrences
         * @param {Array.<Number>=} data.bysecond             The seconds for the BYSECOND part
         * @param {Array.<Number>=} data.byminute             The minutes for the BYMINUTE part
         * @param {Array.<Number>=} data.byhour               The hours for the BYHOUR part
         * @param {Array.<String>=} data.byday                The BYDAY values
         * @param {Array.<Number>=} data.bymonthday           The days for the BYMONTHDAY part
         * @param {Array.<Number>=} data.byyearday            The days for the BYYEARDAY part
         * @param {Array.<Number>=} data.byweekno             The weeks for the BYWEEKNO part
         * @param {Array.<Number>=} data.bymonth              The month for the BYMONTH part
         * @param {Array.<Number>=} data.bysetpos             The positionals for the BYSETPOS part
         */
        fromData: function(data) {
          for (var key in data) {
            var uckey = key.toUpperCase();

            if (uckey in partDesign) {
              if (Array.isArray(data[key])) {
                this.parts[uckey] = data[key];
              } else {
                this.parts[uckey] = [data[key]];
              }
            } else {
              this[key] = data[key];
            }
          }

          if (this.interval && typeof this.interval != "number") {
            optionDesign.INTERVAL(this.interval, this);
          }

          if (this.wkst && typeof this.wkst != "number") {
            this.wkst = ICAL.Recur.icalDayToNumericDay(this.wkst);
          }

          if (this.until && !(this.until instanceof ICAL.Time)) {
            this.until = ICAL.Time.fromString(this.until);
          }
        },

        /**
         * The jCal representation of this recurrence type.
         * @return {Object}
         */
        toJSON: function() {
          var res = Object.create(null);
          res.freq = this.freq;

          if (this.count) {
            res.count = this.count;
          }

          if (this.interval > 1) {
            res.interval = this.interval;
          }

          for (var k in this.parts) {
            /* istanbul ignore if */
            if (!this.parts.hasOwnProperty(k)) {
              continue;
            }
            var kparts = this.parts[k];
            if (Array.isArray(kparts) && kparts.length == 1) {
              res[k.toLowerCase()] = kparts[0];
            } else {
              res[k.toLowerCase()] = ICAL.helpers.clone(this.parts[k]);
            }
          }

          if (this.until) {
            res.until = this.until.toString();
          }
          if ('wkst' in this && this.wkst !== ICAL.Time.DEFAULT_WEEK_START) {
            res.wkst = ICAL.Recur.numericDayToIcalDay(this.wkst);
          }
          return res;
        },

        /**
         * The string representation of this recurrence rule.
         * @return {String}
         */
        toString: function icalrecur_toString() {
          // TODO retain order
          var str = "FREQ=" + this.freq;
          if (this.count) {
            str += ";COUNT=" + this.count;
          }
          if (this.interval > 1) {
            str += ";INTERVAL=" + this.interval;
          }
          for (var k in this.parts) {
            /* istanbul ignore else */
            if (this.parts.hasOwnProperty(k)) {
              str += ";" + k + "=" + this.parts[k];
            }
          }
          if (this.until) {
            str += ';UNTIL=' + this.until.toICALString();
          }
          if ('wkst' in this && this.wkst !== ICAL.Time.DEFAULT_WEEK_START) {
            str += ';WKST=' + ICAL.Recur.numericDayToIcalDay(this.wkst);
          }
          return str;
        }
      };

      function parseNumericValue(type, min, max, value) {
        var result = value;

        if (value[0] === '+') {
          result = value.substr(1);
        }

        result = ICAL.helpers.strictParseInt(result);

        if (min !== undefined && value < min) {
          throw new Error(
            type + ': invalid value "' + value + '" must be > ' + min
          );
        }

        if (max !== undefined && value > max) {
          throw new Error(
            type + ': invalid value "' + value + '" must be < ' + min
          );
        }

        return result;
      }

      /**
       * Convert an ical representation of a day (SU, MO, etc..)
       * into a numeric value of that day.
       *
       * @param {String} string     The iCalendar day name
       * @param {ICAL.Time.weekDay=} aWeekStart
       *        The week start weekday, defaults to SUNDAY
       * @return {Number}           Numeric value of given day
       */
      ICAL.Recur.icalDayToNumericDay = function toNumericDay(string, aWeekStart) {
        //XXX: this is here so we can deal
        //     with possibly invalid string values.
        var firstDow = aWeekStart || ICAL.Time.SUNDAY;
        return ((DOW_MAP[string] - firstDow + 7) % 7) + 1;
      };

      /**
       * Convert a numeric day value into its ical representation (SU, MO, etc..)
       *
       * @param {Number} num        Numeric value of given day
       * @param {ICAL.Time.weekDay=} aWeekStart
       *        The week start weekday, defaults to SUNDAY
       * @return {String}           The ICAL day value, e.g SU,MO,...
       */
      ICAL.Recur.numericDayToIcalDay = function toIcalDay(num, aWeekStart) {
        //XXX: this is here so we can deal with possibly invalid number values.
        //     Also, this allows consistent mapping between day numbers and day
        //     names for external users.
        var firstDow = aWeekStart || ICAL.Time.SUNDAY;
        var dow = (num + firstDow - ICAL.Time.SUNDAY);
        if (dow > 7) {
          dow -= 7;
        }
        return REVERSE_DOW_MAP[dow];
      };

      var VALID_DAY_NAMES = /^(SU|MO|TU|WE|TH|FR|SA)$/;
      var VALID_BYDAY_PART = /^([+-])?(5[0-3]|[1-4][0-9]|[1-9])?(SU|MO|TU|WE|TH|FR|SA)$/;

      /**
       * Possible frequency values for the FREQ part
       * (YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY, MINUTELY, SECONDLY)
       *
       * @typedef {String} frequencyValues
       * @memberof ICAL.Recur
       */

      var ALLOWED_FREQ = ['SECONDLY', 'MINUTELY', 'HOURLY',
                          'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

      var optionDesign = {
        FREQ: function(value, dict, fmtIcal) {
          // yes this is actually equal or faster then regex.
          // upside here is we can enumerate the valid values.
          if (ALLOWED_FREQ.indexOf(value) !== -1) {
            dict.freq = value;
          } else {
            throw new Error(
              'invalid frequency "' + value + '" expected: "' +
              ALLOWED_FREQ.join(', ') + '"'
            );
          }
        },

        COUNT: function(value, dict, fmtIcal) {
          dict.count = ICAL.helpers.strictParseInt(value);
        },

        INTERVAL: function(value, dict, fmtIcal) {
          dict.interval = ICAL.helpers.strictParseInt(value);
          if (dict.interval < 1) {
            // 0 or negative values are not allowed, some engines seem to generate
            // it though. Assume 1 instead.
            dict.interval = 1;
          }
        },

        UNTIL: function(value, dict, fmtIcal) {
          if (value.length > 10) {
            dict.until = ICAL.design.icalendar.value['date-time'].fromICAL(value);
          } else {
            dict.until = ICAL.design.icalendar.value.date.fromICAL(value);
          }
          if (!fmtIcal) {
            dict.until = ICAL.Time.fromString(dict.until);
          }
        },

        WKST: function(value, dict, fmtIcal) {
          if (VALID_DAY_NAMES.test(value)) {
            dict.wkst = ICAL.Recur.icalDayToNumericDay(value);
          } else {
            throw new Error('invalid WKST value "' + value + '"');
          }
        }
      };

      var partDesign = {
        BYSECOND: parseNumericValue.bind(this, 'BYSECOND', 0, 60),
        BYMINUTE: parseNumericValue.bind(this, 'BYMINUTE', 0, 59),
        BYHOUR: parseNumericValue.bind(this, 'BYHOUR', 0, 23),
        BYDAY: function(value) {
          if (VALID_BYDAY_PART.test(value)) {
            return value;
          } else {
            throw new Error('invalid BYDAY value "' + value + '"');
          }
        },
        BYMONTHDAY: parseNumericValue.bind(this, 'BYMONTHDAY', -31, 31),
        BYYEARDAY: parseNumericValue.bind(this, 'BYYEARDAY', -366, 366),
        BYWEEKNO: parseNumericValue.bind(this, 'BYWEEKNO', -53, 53),
        BYMONTH: parseNumericValue.bind(this, 'BYMONTH', 1, 12),
        BYSETPOS: parseNumericValue.bind(this, 'BYSETPOS', -366, 366)
      };


      /**
       * Creates a new {@link ICAL.Recur} instance from the passed string.
       *
       * @param {String} string         The string to parse
       * @return {ICAL.Recur}           The created recurrence instance
       */
      ICAL.Recur.fromString = function(string) {
        var data = ICAL.Recur._stringToData(string, false);
        return new ICAL.Recur(data);
      };

      /**
       * Creates a new {@link ICAL.Recur} instance using members from the passed
       * data object.
       *
       * @param {Object} aData                              An object with members of the recurrence
       * @param {ICAL.Recur.frequencyValues=} aData.freq    The frequency value
       * @param {Number=} aData.interval                    The INTERVAL value
       * @param {ICAL.Time.weekDay=} aData.wkst             The week start value
       * @param {ICAL.Time=} aData.until                    The end of the recurrence set
       * @param {Number=} aData.count                       The number of occurrences
       * @param {Array.<Number>=} aData.bysecond            The seconds for the BYSECOND part
       * @param {Array.<Number>=} aData.byminute            The minutes for the BYMINUTE part
       * @param {Array.<Number>=} aData.byhour              The hours for the BYHOUR part
       * @param {Array.<String>=} aData.byday               The BYDAY values
       * @param {Array.<Number>=} aData.bymonthday          The days for the BYMONTHDAY part
       * @param {Array.<Number>=} aData.byyearday           The days for the BYYEARDAY part
       * @param {Array.<Number>=} aData.byweekno            The weeks for the BYWEEKNO part
       * @param {Array.<Number>=} aData.bymonth             The month for the BYMONTH part
       * @param {Array.<Number>=} aData.bysetpos            The positionals for the BYSETPOS part
       */
      ICAL.Recur.fromData = function(aData) {
        return new ICAL.Recur(aData);
      };

      /**
       * Converts a recurrence string to a data object, suitable for the fromData
       * method.
       *
       * @param {String} string     The string to parse
       * @param {Boolean} fmtIcal   If true, the string is considered to be an
       *                              iCalendar string
       * @return {ICAL.Recur}       The recurrence instance
       */
      ICAL.Recur._stringToData = function(string, fmtIcal) {
        var dict = Object.create(null);

        // split is slower in FF but fast enough.
        // v8 however this is faster then manual split?
        var values = string.split(';');
        var len = values.length;

        for (var i = 0; i < len; i++) {
          var parts = values[i].split('=');
          var ucname = parts[0].toUpperCase();
          var lcname = parts[0].toLowerCase();
          var name = (fmtIcal ? lcname : ucname);
          var value = parts[1];

          if (ucname in partDesign) {
            var partArr = value.split(',');
            var partArrIdx = 0;
            var partArrLen = partArr.length;

            for (; partArrIdx < partArrLen; partArrIdx++) {
              partArr[partArrIdx] = partDesign[ucname](partArr[partArrIdx]);
            }
            dict[name] = (partArr.length == 1 ? partArr[0] : partArr);
          } else if (ucname in optionDesign) {
            optionDesign[ucname](value, dict, fmtIcal);
          } else {
            // Don't swallow unknown values. Just set them as they are.
            dict[lcname] = value;
          }
        }

        return dict;
      };
    })();
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.RecurIterator = (function() {

      /**
       * @classdesc
       * An iterator for a single recurrence rule. This class usually doesn't have
       * to be instanciated directly, the convenience method
       * {@link ICAL.Recur#iterator} can be used.
       *
       * @description
       * The options object may contain additional members when resuming iteration from a previous run
       *
       * @description
       * The options object may contain additional members when resuming iteration
       * from a previous run.
       *
       * @class
       * @alias ICAL.RecurIterator
       * @param {Object} options                The iterator options
       * @param {ICAL.Recur} options.rule       The rule to iterate.
       * @param {ICAL.Time} options.dtstart     The start date of the event.
       * @param {Boolean=} options.initialized  When true, assume that options are
       *        from a previously constructed iterator. Initialization will not be
       *        repeated.
       */
      function icalrecur_iterator(options) {
        this.fromData(options);
      }

      icalrecur_iterator.prototype = {

        /**
         * True when iteration is finished.
         * @type {Boolean}
         */
        completed: false,

        /**
         * The rule that is being iterated
         * @type {ICAL.Recur}
         */
        rule: null,

        /**
         * The start date of the event being iterated.
         * @type {ICAL.Time}
         */
        dtstart: null,

        /**
         * The last occurrence that was returned from the
         * {@link ICAL.RecurIterator#next} method.
         * @type {ICAL.Time}
         */
        last: null,

        /**
         * The sequence number from the occurrence
         * @type {Number}
         */
        occurrence_number: 0,

        /**
         * The indices used for the {@link ICAL.RecurIterator#by_data} object.
         * @type {Object}
         * @private
         */
        by_indices: null,

        /**
         * If true, the iterator has already been initialized
         * @type {Boolean}
         * @private
         */
        initialized: false,

        /**
         * The initializd by-data.
         * @type {Object}
         * @private
         */
        by_data: null,

        /**
         * The expanded yeardays
         * @type {Array}
         * @private
         */
        days: null,

        /**
         * The index in the {@link ICAL.RecurIterator#days} array.
         * @type {Number}
         * @private
         */
        days_index: 0,

        /**
         * Initialize the recurrence iterator from the passed data object. This
         * method is usually not called directly, you can initialize the iterator
         * through the constructor.
         *
         * @param {Object} options                The iterator options
         * @param {ICAL.Recur} options.rule       The rule to iterate.
         * @param {ICAL.Time} options.dtstart     The start date of the event.
         * @param {Boolean=} options.initialized  When true, assume that options are
         *        from a previously constructed iterator. Initialization will not be
         *        repeated.
         */
        fromData: function(options) {
          this.rule = ICAL.helpers.formatClassType(options.rule, ICAL.Recur);

          if (!this.rule) {
            throw new Error('iterator requires a (ICAL.Recur) rule');
          }

          this.dtstart = ICAL.helpers.formatClassType(options.dtstart, ICAL.Time);

          if (!this.dtstart) {
            throw new Error('iterator requires a (ICAL.Time) dtstart');
          }

          if (options.by_data) {
            this.by_data = options.by_data;
          } else {
            this.by_data = ICAL.helpers.clone(this.rule.parts, true);
          }

          if (options.occurrence_number)
            this.occurrence_number = options.occurrence_number;

          this.days = options.days || [];
          if (options.last) {
            this.last = ICAL.helpers.formatClassType(options.last, ICAL.Time);
          }

          this.by_indices = options.by_indices;

          if (!this.by_indices) {
            this.by_indices = {
              "BYSECOND": 0,
              "BYMINUTE": 0,
              "BYHOUR": 0,
              "BYDAY": 0,
              "BYMONTH": 0,
              "BYWEEKNO": 0,
              "BYMONTHDAY": 0
            };
          }

          this.initialized = options.initialized || false;

          if (!this.initialized) {
            this.init();
          }
        },

        /**
         * Intialize the iterator
         * @private
         */
        init: function icalrecur_iterator_init() {
          this.initialized = true;
          this.last = this.dtstart.clone();
          var parts = this.by_data;

          if ("BYDAY" in parts) {
            // libical does this earlier when the rule is loaded, but we postpone to
            // now so we can preserve the original order.
            this.sort_byday_rules(parts.BYDAY);
          }

          // If the BYYEARDAY appares, no other date rule part may appear
          if ("BYYEARDAY" in parts) {
            if ("BYMONTH" in parts || "BYWEEKNO" in parts ||
                "BYMONTHDAY" in parts || "BYDAY" in parts) {
              throw new Error("Invalid BYYEARDAY rule");
            }
          }

          // BYWEEKNO and BYMONTHDAY rule parts may not both appear
          if ("BYWEEKNO" in parts && "BYMONTHDAY" in parts) {
            throw new Error("BYWEEKNO does not fit to BYMONTHDAY");
          }

          // For MONTHLY recurrences (FREQ=MONTHLY) neither BYYEARDAY nor
          // BYWEEKNO may appear.
          if (this.rule.freq == "MONTHLY" &&
              ("BYYEARDAY" in parts || "BYWEEKNO" in parts)) {
            throw new Error("For MONTHLY recurrences neither BYYEARDAY nor BYWEEKNO may appear");
          }

          // For WEEKLY recurrences (FREQ=WEEKLY) neither BYMONTHDAY nor
          // BYYEARDAY may appear.
          if (this.rule.freq == "WEEKLY" &&
              ("BYYEARDAY" in parts || "BYMONTHDAY" in parts)) {
            throw new Error("For WEEKLY recurrences neither BYMONTHDAY nor BYYEARDAY may appear");
          }

          // BYYEARDAY may only appear in YEARLY rules
          if (this.rule.freq != "YEARLY" && "BYYEARDAY" in parts) {
            throw new Error("BYYEARDAY may only appear in YEARLY rules");
          }

          this.last.second = this.setup_defaults("BYSECOND", "SECONDLY", this.dtstart.second);
          this.last.minute = this.setup_defaults("BYMINUTE", "MINUTELY", this.dtstart.minute);
          this.last.hour = this.setup_defaults("BYHOUR", "HOURLY", this.dtstart.hour);
          this.last.day = this.setup_defaults("BYMONTHDAY", "DAILY", this.dtstart.day);
          this.last.month = this.setup_defaults("BYMONTH", "MONTHLY", this.dtstart.month);

          if (this.rule.freq == "WEEKLY") {
            if ("BYDAY" in parts) {
              var bydayParts = this.ruleDayOfWeek(parts.BYDAY[0], this.rule.wkst);
              var pos = bydayParts[0];
              var dow = bydayParts[1];
              var wkdy = dow - this.last.dayOfWeek(this.rule.wkst);
              if ((this.last.dayOfWeek(this.rule.wkst) < dow && wkdy >= 0) || wkdy < 0) {
                // Initial time is after first day of BYDAY data
                this.last.day += wkdy;
              }
            } else {
              var dayName = ICAL.Recur.numericDayToIcalDay(this.dtstart.dayOfWeek());
              parts.BYDAY = [dayName];
            }
          }

          if (this.rule.freq == "YEARLY") {
            for (;;) {
              this.expand_year_days(this.last.year);
              if (this.days.length > 0) {
                break;
              }
              this.increment_year(this.rule.interval);
            }

            this._nextByYearDay();
          }

          if (this.rule.freq == "MONTHLY" && this.has_by_data("BYDAY")) {
            var tempLast = null;
            var initLast = this.last.clone();
            var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);

            // Check every weekday in BYDAY with relative dow and pos.
            for (var i in this.by_data.BYDAY) {
              /* istanbul ignore if */
              if (!this.by_data.BYDAY.hasOwnProperty(i)) {
                continue;
              }
              this.last = initLast.clone();
              var bydayParts = this.ruleDayOfWeek(this.by_data.BYDAY[i]);
              var pos = bydayParts[0];
              var dow = bydayParts[1];
              var dayOfMonth = this.last.nthWeekDay(dow, pos);

              // If |pos| >= 6, the byday is invalid for a monthly rule.
              if (pos >= 6 || pos <= -6) {
                throw new Error("Malformed values in BYDAY part");
              }

              // If a Byday with pos=+/-5 is not in the current month it
              // must be searched in the next months.
              if (dayOfMonth > daysInMonth || dayOfMonth <= 0) {
                // Skip if we have already found a "last" in this month.
                if (tempLast && tempLast.month == initLast.month) {
                  continue;
                }
                while (dayOfMonth > daysInMonth || dayOfMonth <= 0) {
                  this.increment_month();
                  daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
                  dayOfMonth = this.last.nthWeekDay(dow, pos);
                }
              }

              this.last.day = dayOfMonth;
              if (!tempLast || this.last.compare(tempLast) < 0) {
                tempLast = this.last.clone();
              }
            }
            this.last = tempLast.clone();

            //XXX: This feels like a hack, but we need to initialize
            //     the BYMONTHDAY case correctly and byDayAndMonthDay handles
            //     this case. It accepts a special flag which will avoid incrementing
            //     the initial value without the flag days that match the start time
            //     would be missed.
            if (this.has_by_data('BYMONTHDAY')) {
              this._byDayAndMonthDay(true);
            }

            if (this.last.day > daysInMonth || this.last.day == 0) {
              throw new Error("Malformed values in BYDAY part");
            }

          } else if (this.has_by_data("BYMONTHDAY")) {
            if (this.last.day < 0) {
              var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
              this.last.day = daysInMonth + this.last.day + 1;
            }
          }

        },

        /**
         * Retrieve the next occurrence from the iterator.
         * @return {ICAL.Time}
         */
        next: function icalrecur_iterator_next() {
          var before = (this.last ? this.last.clone() : null);

          if ((this.rule.count && this.occurrence_number >= this.rule.count) ||
              (this.rule.until && this.last.compare(this.rule.until) > 0)) {

            //XXX: right now this is just a flag and has no impact
            //     we can simplify the above case to check for completed later.
            this.completed = true;

            return null;
          }

          if (this.occurrence_number == 0 && this.last.compare(this.dtstart) >= 0) {
            // First of all, give the instance that was initialized
            this.occurrence_number++;
            return this.last;
          }


          var valid;
          do {
            valid = 1;

            switch (this.rule.freq) {
            case "SECONDLY":
              this.next_second();
              break;
            case "MINUTELY":
              this.next_minute();
              break;
            case "HOURLY":
              this.next_hour();
              break;
            case "DAILY":
              this.next_day();
              break;
            case "WEEKLY":
              this.next_week();
              break;
            case "MONTHLY":
              valid = this.next_month();
              break;
            case "YEARLY":
              this.next_year();
              break;

            default:
              return null;
            }
          } while (!this.check_contracting_rules() ||
                   this.last.compare(this.dtstart) < 0 ||
                   !valid);

          // TODO is this valid?
          if (this.last.compare(before) == 0) {
            throw new Error("Same occurrence found twice, protecting " +
                            "you from death by recursion");
          }

          if (this.rule.until && this.last.compare(this.rule.until) > 0) {
            this.completed = true;
            return null;
          } else {
            this.occurrence_number++;
            return this.last;
          }
        },

        next_second: function next_second() {
          return this.next_generic("BYSECOND", "SECONDLY", "second", "minute");
        },

        increment_second: function increment_second(inc) {
          return this.increment_generic(inc, "second", 60, "minute");
        },

        next_minute: function next_minute() {
          return this.next_generic("BYMINUTE", "MINUTELY",
                                   "minute", "hour", "next_second");
        },

        increment_minute: function increment_minute(inc) {
          return this.increment_generic(inc, "minute", 60, "hour");
        },

        next_hour: function next_hour() {
          return this.next_generic("BYHOUR", "HOURLY", "hour",
                                   "monthday", "next_minute");
        },

        increment_hour: function increment_hour(inc) {
          this.increment_generic(inc, "hour", 24, "monthday");
        },

        next_day: function next_day() {
          var has_by_day = ("BYDAY" in this.by_data);
          var this_freq = (this.rule.freq == "DAILY");

          if (this.next_hour() == 0) {
            return 0;
          }

          if (this_freq) {
            this.increment_monthday(this.rule.interval);
          } else {
            this.increment_monthday(1);
          }

          return 0;
        },

        next_week: function next_week() {
          var end_of_data = 0;

          if (this.next_weekday_by_week() == 0) {
            return end_of_data;
          }

          if (this.has_by_data("BYWEEKNO")) {
            var idx = ++this.by_indices.BYWEEKNO;

            if (this.by_indices.BYWEEKNO == this.by_data.BYWEEKNO.length) {
              this.by_indices.BYWEEKNO = 0;
              end_of_data = 1;
            }

            // HACK should be first month of the year
            this.last.month = 1;
            this.last.day = 1;

            var week_no = this.by_data.BYWEEKNO[this.by_indices.BYWEEKNO];

            this.last.day += 7 * week_no;

            if (end_of_data) {
              this.increment_year(1);
            }
          } else {
            // Jump to the next week
            this.increment_monthday(7 * this.rule.interval);
          }

          return end_of_data;
        },

        /**
         * Normalize each by day rule for a given year/month.
         * Takes into account ordering and negative rules
         *
         * @private
         * @param {Number} year         Current year.
         * @param {Number} month        Current month.
         * @param {Array}  rules        Array of rules.
         *
         * @return {Array} sorted and normalized rules.
         *                 Negative rules will be expanded to their
         *                 correct positive values for easier processing.
         */
        normalizeByMonthDayRules: function(year, month, rules) {
          var daysInMonth = ICAL.Time.daysInMonth(month, year);

          // XXX: This is probably bad for performance to allocate
          //      a new array for each month we scan, if possible
          //      we should try to optimize this...
          var newRules = [];

          var ruleIdx = 0;
          var len = rules.length;
          var rule;

          for (; ruleIdx < len; ruleIdx++) {
            rule = rules[ruleIdx];

            // if this rule falls outside of given
            // month discard it.
            if (Math.abs(rule) > daysInMonth) {
              continue;
            }

            // negative case
            if (rule < 0) {
              // we add (not subtract it is a negative number)
              // one from the rule because 1 === last day of month
              rule = daysInMonth + (rule + 1);
            } else if (rule === 0) {
              // skip zero: it is invalid.
              continue;
            }

            // only add unique items...
            if (newRules.indexOf(rule) === -1) {
              newRules.push(rule);
            }

          }

          // unique and sort
          return newRules.sort(function(a, b) { return a - b; });
        },

        /**
         * NOTES:
         * We are given a list of dates in the month (BYMONTHDAY) (23, etc..)
         * Also we are given a list of days (BYDAY) (MO, 2SU, etc..) when
         * both conditions match a given date (this.last.day) iteration stops.
         *
         * @private
         * @param {Boolean=} isInit     When given true will not increment the
         *                                current day (this.last).
         */
        _byDayAndMonthDay: function(isInit) {
          var byMonthDay; // setup in initMonth
          var byDay = this.by_data.BYDAY;

          var date;
          var dateIdx = 0;
          var dateLen; // setup in initMonth
          var dayLen = byDay.length;

          // we are not valid by default
          var dataIsValid = 0;

          var daysInMonth;
          var self = this;
          // we need a copy of this, because a DateTime gets normalized
          // automatically if the day is out of range. At some points we
          // set the last day to 0 to start counting.
          var lastDay = this.last.day;

          function initMonth() {
            daysInMonth = ICAL.Time.daysInMonth(
              self.last.month, self.last.year
            );

            byMonthDay = self.normalizeByMonthDayRules(
              self.last.year,
              self.last.month,
              self.by_data.BYMONTHDAY
            );

            dateLen = byMonthDay.length;

            // For the case of more than one occurrence in one month
            // we have to be sure to start searching after the last
            // found date or at the last BYMONTHDAY, unless we are
            // initializing the iterator because in this case we have
            // to consider the last found date too.
            while (byMonthDay[dateIdx] <= lastDay &&
                   !(isInit && byMonthDay[dateIdx] == lastDay) &&
                   dateIdx < dateLen - 1) {
              dateIdx++;
            }
          }

          function nextMonth() {
            // since the day is incremented at the start
            // of the loop below, we need to start at 0
            lastDay = 0;
            self.increment_month();
            dateIdx = 0;
            initMonth();
          }

          initMonth();

          // should come after initMonth
          if (isInit) {
            lastDay -= 1;
          }

          // Use a counter to avoid an infinite loop with malformed rules.
          // Stop checking after 4 years so we consider also a leap year.
          var monthsCounter = 48;

          while (!dataIsValid && monthsCounter) {
            monthsCounter--;
            // increment the current date. This is really
            // important otherwise we may fall into the infinite
            // loop trap. The initial date takes care of the case
            // where the current date is the date we are looking
            // for.
            date = lastDay + 1;

            if (date > daysInMonth) {
              nextMonth();
              continue;
            }

            // find next date
            var next = byMonthDay[dateIdx++];

            // this logic is dependant on the BYMONTHDAYS
            // being in order (which is done by #normalizeByMonthDayRules)
            if (next >= date) {
              // if the next month day is in the future jump to it.
              lastDay = next;
            } else {
              // in this case the 'next' monthday has past
              // we must move to the month.
              nextMonth();
              continue;
            }

            // Now we can loop through the day rules to see
            // if one matches the current month date.
            for (var dayIdx = 0; dayIdx < dayLen; dayIdx++) {
              var parts = this.ruleDayOfWeek(byDay[dayIdx]);
              var pos = parts[0];
              var dow = parts[1];

              this.last.day = lastDay;
              if (this.last.isNthWeekDay(dow, pos)) {
                // when we find the valid one we can mark
                // the conditions as met and break the loop.
                // (Because we have this condition above
                //  it will also break the parent loop).
                dataIsValid = 1;
                break;
              }
            }

            // It is completely possible that the combination
            // cannot be matched in the current month.
            // When we reach the end of possible combinations
            // in the current month we iterate to the next one.
            // since dateIdx is incremented right after getting
            // "next", we don't need dateLen -1 here.
            if (!dataIsValid && dateIdx === dateLen) {
              nextMonth();
              continue;
            }
          }

          if (monthsCounter <= 0) {
            // Checked 4 years without finding a Byday that matches
            // a Bymonthday. Maybe the rule is not correct.
            throw new Error("Malformed values in BYDAY combined with BYMONTHDAY parts");
          }


          return dataIsValid;
        },

        next_month: function next_month() {
          var this_freq = (this.rule.freq == "MONTHLY");
          var data_valid = 1;

          if (this.next_hour() == 0) {
            return data_valid;
          }

          if (this.has_by_data("BYDAY") && this.has_by_data("BYMONTHDAY")) {
            data_valid = this._byDayAndMonthDay();
          } else if (this.has_by_data("BYDAY")) {
            var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
            var setpos = 0;
            var setpos_total = 0;

            if (this.has_by_data("BYSETPOS")) {
              var last_day = this.last.day;
              for (var day = 1; day <= daysInMonth; day++) {
                this.last.day = day;
                if (this.is_day_in_byday(this.last)) {
                  setpos_total++;
                  if (day <= last_day) {
                    setpos++;
                  }
                }
              }
              this.last.day = last_day;
            }

            data_valid = 0;
            for (var day = this.last.day + 1; day <= daysInMonth; day++) {
              this.last.day = day;

              if (this.is_day_in_byday(this.last)) {
                if (!this.has_by_data("BYSETPOS") ||
                    this.check_set_position(++setpos) ||
                    this.check_set_position(setpos - setpos_total - 1)) {

                  data_valid = 1;
                  break;
                }
              }
            }

            if (day > daysInMonth) {
              this.last.day = 1;
              this.increment_month();

              if (this.is_day_in_byday(this.last)) {
                if (!this.has_by_data("BYSETPOS") || this.check_set_position(1)) {
                  data_valid = 1;
                }
              } else {
                data_valid = 0;
              }
            }
          } else if (this.has_by_data("BYMONTHDAY")) {
            this.by_indices.BYMONTHDAY++;

            if (this.by_indices.BYMONTHDAY >= this.by_data.BYMONTHDAY.length) {
              this.by_indices.BYMONTHDAY = 0;
              this.increment_month();
            }

            var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
            var day = this.by_data.BYMONTHDAY[this.by_indices.BYMONTHDAY];

            if (day < 0) {
              day = daysInMonth + day + 1;
            }

            if (day > daysInMonth) {
              this.last.day = 1;
              data_valid = this.is_day_in_byday(this.last);
            } else {
              this.last.day = day;
            }

          } else {
            this.increment_month();
            var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
            if (this.by_data.BYMONTHDAY[0] > daysInMonth) {
              data_valid = 0;
            } else {
              this.last.day = this.by_data.BYMONTHDAY[0];
            }
          }

          return data_valid;
        },

        next_weekday_by_week: function next_weekday_by_week() {
          var end_of_data = 0;

          if (this.next_hour() == 0) {
            return end_of_data;
          }

          if (!this.has_by_data("BYDAY")) {
            return 1;
          }

          for (;;) {
            var tt = new ICAL.Time();
            this.by_indices.BYDAY++;

            if (this.by_indices.BYDAY == Object.keys(this.by_data.BYDAY).length) {
              this.by_indices.BYDAY = 0;
              end_of_data = 1;
            }

            var coded_day = this.by_data.BYDAY[this.by_indices.BYDAY];
            var parts = this.ruleDayOfWeek(coded_day);
            var dow = parts[1];

            dow -= this.rule.wkst;

            if (dow < 0) {
              dow += 7;
            }

            tt.year = this.last.year;
            tt.month = this.last.month;
            tt.day = this.last.day;

            var startOfWeek = tt.startDoyWeek(this.rule.wkst);

            if (dow + startOfWeek < 1) {
              // The selected date is in the previous year
              if (!end_of_data) {
                continue;
              }
            }

            var next = ICAL.Time.fromDayOfYear(startOfWeek + dow,
                                                      this.last.year);

            /**
             * The normalization horrors below are due to
             * the fact that when the year/month/day changes
             * it can effect the other operations that come after.
             */
            this.last.year = next.year;
            this.last.month = next.month;
            this.last.day = next.day;

            return end_of_data;
          }
        },

        next_year: function next_year() {

          if (this.next_hour() == 0) {
            return 0;
          }

          if (++this.days_index == this.days.length) {
            this.days_index = 0;
            do {
              this.increment_year(this.rule.interval);
              this.expand_year_days(this.last.year);
            } while (this.days.length == 0);
          }

          this._nextByYearDay();

          return 1;
        },

        _nextByYearDay: function _nextByYearDay() {
            var doy = this.days[this.days_index];
            var year = this.last.year;
            if (doy < 1) {
                // Time.fromDayOfYear(doy, year) indexes relative to the
                // start of the given year. That is different from the
                // semantics of BYYEARDAY where negative indexes are an
                // offset from the end of the given year.
                doy += 1;
                year += 1;
            }
            var next = ICAL.Time.fromDayOfYear(doy, year);
            this.last.day = next.day;
            this.last.month = next.month;
        },

        /**
         * @param dow (eg: '1TU', '-1MO')
         * @param {ICAL.Time.weekDay=} aWeekStart The week start weekday
         * @return [pos, numericDow] (eg: [1, 3]) numericDow is relative to aWeekStart
         */
        ruleDayOfWeek: function ruleDayOfWeek(dow, aWeekStart) {
          var matches = dow.match(/([+-]?[0-9])?(MO|TU|WE|TH|FR|SA|SU)/);
          if (matches) {
            var pos = parseInt(matches[1] || 0, 10);
            dow = ICAL.Recur.icalDayToNumericDay(matches[2], aWeekStart);
            return [pos, dow];
          } else {
            return [0, 0];
          }
        },

        next_generic: function next_generic(aRuleType, aInterval, aDateAttr,
                                            aFollowingAttr, aPreviousIncr) {
          var has_by_rule = (aRuleType in this.by_data);
          var this_freq = (this.rule.freq == aInterval);
          var end_of_data = 0;

          if (aPreviousIncr && this[aPreviousIncr]() == 0) {
            return end_of_data;
          }

          if (has_by_rule) {
            this.by_indices[aRuleType]++;
            var idx = this.by_indices[aRuleType];
            var dta = this.by_data[aRuleType];

            if (this.by_indices[aRuleType] == dta.length) {
              this.by_indices[aRuleType] = 0;
              end_of_data = 1;
            }
            this.last[aDateAttr] = dta[this.by_indices[aRuleType]];
          } else if (this_freq) {
            this["increment_" + aDateAttr](this.rule.interval);
          }

          if (has_by_rule && end_of_data && this_freq) {
            this["increment_" + aFollowingAttr](1);
          }

          return end_of_data;
        },

        increment_monthday: function increment_monthday(inc) {
          for (var i = 0; i < inc; i++) {
            var daysInMonth = ICAL.Time.daysInMonth(this.last.month, this.last.year);
            this.last.day++;

            if (this.last.day > daysInMonth) {
              this.last.day -= daysInMonth;
              this.increment_month();
            }
          }
        },

        increment_month: function increment_month() {
          this.last.day = 1;
          if (this.has_by_data("BYMONTH")) {
            this.by_indices.BYMONTH++;

            if (this.by_indices.BYMONTH == this.by_data.BYMONTH.length) {
              this.by_indices.BYMONTH = 0;
              this.increment_year(1);
            }

            this.last.month = this.by_data.BYMONTH[this.by_indices.BYMONTH];
          } else {
            if (this.rule.freq == "MONTHLY") {
              this.last.month += this.rule.interval;
            } else {
              this.last.month++;
            }

            this.last.month--;
            var years = ICAL.helpers.trunc(this.last.month / 12);
            this.last.month %= 12;
            this.last.month++;

            if (years != 0) {
              this.increment_year(years);
            }
          }
        },

        increment_year: function increment_year(inc) {
          this.last.year += inc;
        },

        increment_generic: function increment_generic(inc, aDateAttr,
                                                      aFactor, aNextIncrement) {
          this.last[aDateAttr] += inc;
          var nextunit = ICAL.helpers.trunc(this.last[aDateAttr] / aFactor);
          this.last[aDateAttr] %= aFactor;
          if (nextunit != 0) {
            this["increment_" + aNextIncrement](nextunit);
          }
        },

        has_by_data: function has_by_data(aRuleType) {
          return (aRuleType in this.rule.parts);
        },

        expand_year_days: function expand_year_days(aYear) {
          var t = new ICAL.Time();
          this.days = [];

          // We need our own copy with a few keys set
          var parts = {};
          var rules = ["BYDAY", "BYWEEKNO", "BYMONTHDAY", "BYMONTH", "BYYEARDAY"];
          for (var p in rules) {
            /* istanbul ignore else */
            if (rules.hasOwnProperty(p)) {
              var part = rules[p];
              if (part in this.rule.parts) {
                parts[part] = this.rule.parts[part];
              }
            }
          }

          if ("BYMONTH" in parts && "BYWEEKNO" in parts) {
            var valid = 1;
            var validWeeks = {};
            t.year = aYear;
            t.isDate = true;

            for (var monthIdx = 0; monthIdx < this.by_data.BYMONTH.length; monthIdx++) {
              var month = this.by_data.BYMONTH[monthIdx];
              t.month = month;
              t.day = 1;
              var first_week = t.weekNumber(this.rule.wkst);
              t.day = ICAL.Time.daysInMonth(month, aYear);
              var last_week = t.weekNumber(this.rule.wkst);
              for (monthIdx = first_week; monthIdx < last_week; monthIdx++) {
                validWeeks[monthIdx] = 1;
              }
            }

            for (var weekIdx = 0; weekIdx < this.by_data.BYWEEKNO.length && valid; weekIdx++) {
              var weekno = this.by_data.BYWEEKNO[weekIdx];
              if (weekno < 52) {
                valid &= validWeeks[weekIdx];
              } else {
                valid = 0;
              }
            }

            if (valid) {
              delete parts.BYMONTH;
            } else {
              delete parts.BYWEEKNO;
            }
          }

          var partCount = Object.keys(parts).length;

          if (partCount == 0) {
            var t1 = this.dtstart.clone();
            t1.year = this.last.year;
            this.days.push(t1.dayOfYear());
          } else if (partCount == 1 && "BYMONTH" in parts) {
            for (var monthkey in this.by_data.BYMONTH) {
              /* istanbul ignore if */
              if (!this.by_data.BYMONTH.hasOwnProperty(monthkey)) {
                continue;
              }
              var t2 = this.dtstart.clone();
              t2.year = aYear;
              t2.month = this.by_data.BYMONTH[monthkey];
              t2.isDate = true;
              this.days.push(t2.dayOfYear());
            }
          } else if (partCount == 1 && "BYMONTHDAY" in parts) {
            for (var monthdaykey in this.by_data.BYMONTHDAY) {
              /* istanbul ignore if */
              if (!this.by_data.BYMONTHDAY.hasOwnProperty(monthdaykey)) {
                continue;
              }
              var t3 = this.dtstart.clone();
              var day_ = this.by_data.BYMONTHDAY[monthdaykey];
              if (day_ < 0) {
                var daysInMonth = ICAL.Time.daysInMonth(t3.month, aYear);
                day_ = day_ + daysInMonth + 1;
              }
              t3.day = day_;
              t3.year = aYear;
              t3.isDate = true;
              this.days.push(t3.dayOfYear());
            }
          } else if (partCount == 2 &&
                     "BYMONTHDAY" in parts &&
                     "BYMONTH" in parts) {
            for (var monthkey in this.by_data.BYMONTH) {
              /* istanbul ignore if */
              if (!this.by_data.BYMONTH.hasOwnProperty(monthkey)) {
                continue;
              }
              var month_ = this.by_data.BYMONTH[monthkey];
              var daysInMonth = ICAL.Time.daysInMonth(month_, aYear);
              for (var monthdaykey in this.by_data.BYMONTHDAY) {
                /* istanbul ignore if */
                if (!this.by_data.BYMONTHDAY.hasOwnProperty(monthdaykey)) {
                  continue;
                }
                var day_ = this.by_data.BYMONTHDAY[monthdaykey];
                if (day_ < 0) {
                  day_ = day_ + daysInMonth + 1;
                }
                t.day = day_;
                t.month = month_;
                t.year = aYear;
                t.isDate = true;

                this.days.push(t.dayOfYear());
              }
            }
          } else if (partCount == 1 && "BYWEEKNO" in parts) ; else if (partCount == 2 &&
                     "BYWEEKNO" in parts &&
                     "BYMONTHDAY" in parts) ; else if (partCount == 1 && "BYDAY" in parts) {
            this.days = this.days.concat(this.expand_by_day(aYear));
          } else if (partCount == 2 && "BYDAY" in parts && "BYMONTH" in parts) {
            for (var monthkey in this.by_data.BYMONTH) {
              /* istanbul ignore if */
              if (!this.by_data.BYMONTH.hasOwnProperty(monthkey)) {
                continue;
              }
              var month = this.by_data.BYMONTH[monthkey];
              var daysInMonth = ICAL.Time.daysInMonth(month, aYear);

              t.year = aYear;
              t.month = this.by_data.BYMONTH[monthkey];
              t.day = 1;
              t.isDate = true;

              var first_dow = t.dayOfWeek();
              var doy_offset = t.dayOfYear() - 1;

              t.day = daysInMonth;
              var last_dow = t.dayOfWeek();

              if (this.has_by_data("BYSETPOS")) {
                var by_month_day = [];
                for (var day = 1; day <= daysInMonth; day++) {
                  t.day = day;
                  if (this.is_day_in_byday(t)) {
                    by_month_day.push(day);
                  }
                }

                for (var spIndex = 0; spIndex < by_month_day.length; spIndex++) {
                  if (this.check_set_position(spIndex + 1) ||
                      this.check_set_position(spIndex - by_month_day.length)) {
                    this.days.push(doy_offset + by_month_day[spIndex]);
                  }
                }
              } else {
                for (var daycodedkey in this.by_data.BYDAY) {
                  /* istanbul ignore if */
                  if (!this.by_data.BYDAY.hasOwnProperty(daycodedkey)) {
                    continue;
                  }
                  var coded_day = this.by_data.BYDAY[daycodedkey];
                  var bydayParts = this.ruleDayOfWeek(coded_day);
                  var pos = bydayParts[0];
                  var dow = bydayParts[1];
                  var month_day;

                  var first_matching_day = ((dow + 7 - first_dow) % 7) + 1;
                  var last_matching_day = daysInMonth - ((last_dow + 7 - dow) % 7);

                  if (pos == 0) {
                    for (var day = first_matching_day; day <= daysInMonth; day += 7) {
                      this.days.push(doy_offset + day);
                    }
                  } else if (pos > 0) {
                    month_day = first_matching_day + (pos - 1) * 7;

                    if (month_day <= daysInMonth) {
                      this.days.push(doy_offset + month_day);
                    }
                  } else {
                    month_day = last_matching_day + (pos + 1) * 7;

                    if (month_day > 0) {
                      this.days.push(doy_offset + month_day);
                    }
                  }
                }
              }
            }
            // Return dates in order of occurrence (1,2,3,...) instead
            // of by groups of weekdays (1,8,15,...,2,9,16,...).
            this.days.sort(function(a, b) { return a - b; }); // Comparator function allows to sort numbers.
          } else if (partCount == 2 && "BYDAY" in parts && "BYMONTHDAY" in parts) {
            var expandedDays = this.expand_by_day(aYear);

            for (var daykey in expandedDays) {
              /* istanbul ignore if */
              if (!expandedDays.hasOwnProperty(daykey)) {
                continue;
              }
              var day = expandedDays[daykey];
              var tt = ICAL.Time.fromDayOfYear(day, aYear);
              if (this.by_data.BYMONTHDAY.indexOf(tt.day) >= 0) {
                this.days.push(day);
              }
            }
          } else if (partCount == 3 &&
                     "BYDAY" in parts &&
                     "BYMONTHDAY" in parts &&
                     "BYMONTH" in parts) {
            var expandedDays = this.expand_by_day(aYear);

            for (var daykey in expandedDays) {
              /* istanbul ignore if */
              if (!expandedDays.hasOwnProperty(daykey)) {
                continue;
              }
              var day = expandedDays[daykey];
              var tt = ICAL.Time.fromDayOfYear(day, aYear);

              if (this.by_data.BYMONTH.indexOf(tt.month) >= 0 &&
                  this.by_data.BYMONTHDAY.indexOf(tt.day) >= 0) {
                this.days.push(day);
              }
            }
          } else if (partCount == 2 && "BYDAY" in parts && "BYWEEKNO" in parts) {
            var expandedDays = this.expand_by_day(aYear);

            for (var daykey in expandedDays) {
              /* istanbul ignore if */
              if (!expandedDays.hasOwnProperty(daykey)) {
                continue;
              }
              var day = expandedDays[daykey];
              var tt = ICAL.Time.fromDayOfYear(day, aYear);
              var weekno = tt.weekNumber(this.rule.wkst);

              if (this.by_data.BYWEEKNO.indexOf(weekno)) {
                this.days.push(day);
              }
            }
          } else if (partCount == 3 &&
                     "BYDAY" in parts &&
                     "BYWEEKNO" in parts &&
                     "BYMONTHDAY" in parts) ; else if (partCount == 1 && "BYYEARDAY" in parts) {
            this.days = this.days.concat(this.by_data.BYYEARDAY);
          } else {
            this.days = [];
          }
          return 0;
        },

        expand_by_day: function expand_by_day(aYear) {

          var days_list = [];
          var tmp = this.last.clone();

          tmp.year = aYear;
          tmp.month = 1;
          tmp.day = 1;
          tmp.isDate = true;

          var start_dow = tmp.dayOfWeek();

          tmp.month = 12;
          tmp.day = 31;
          tmp.isDate = true;

          var end_dow = tmp.dayOfWeek();
          var end_year_day = tmp.dayOfYear();

          for (var daykey in this.by_data.BYDAY) {
            /* istanbul ignore if */
            if (!this.by_data.BYDAY.hasOwnProperty(daykey)) {
              continue;
            }
            var day = this.by_data.BYDAY[daykey];
            var parts = this.ruleDayOfWeek(day);
            var pos = parts[0];
            var dow = parts[1];

            if (pos == 0) {
              var tmp_start_doy = ((dow + 7 - start_dow) % 7) + 1;

              for (var doy = tmp_start_doy; doy <= end_year_day; doy += 7) {
                days_list.push(doy);
              }

            } else if (pos > 0) {
              var first;
              if (dow >= start_dow) {
                first = dow - start_dow + 1;
              } else {
                first = dow - start_dow + 8;
              }

              days_list.push(first + (pos - 1) * 7);
            } else {
              var last;
              pos = -pos;

              if (dow <= end_dow) {
                last = end_year_day - end_dow + dow;
              } else {
                last = end_year_day - end_dow + dow - 7;
              }

              days_list.push(last - (pos - 1) * 7);
            }
          }
          return days_list;
        },

        is_day_in_byday: function is_day_in_byday(tt) {
          for (var daykey in this.by_data.BYDAY) {
            /* istanbul ignore if */
            if (!this.by_data.BYDAY.hasOwnProperty(daykey)) {
              continue;
            }
            var day = this.by_data.BYDAY[daykey];
            var parts = this.ruleDayOfWeek(day);
            var pos = parts[0];
            var dow = parts[1];
            var this_dow = tt.dayOfWeek();

            if ((pos == 0 && dow == this_dow) ||
                (tt.nthWeekDay(dow, pos) == tt.day)) {
              return 1;
            }
          }

          return 0;
        },

        /**
         * Checks if given value is in BYSETPOS.
         *
         * @private
         * @param {Numeric} aPos position to check for.
         * @return {Boolean} false unless BYSETPOS rules exist
         *                   and the given value is present in rules.
         */
        check_set_position: function check_set_position(aPos) {
          if (this.has_by_data('BYSETPOS')) {
            var idx = this.by_data.BYSETPOS.indexOf(aPos);
            // negative numbers are not false-y
            return idx !== -1;
          }
          return false;
        },

        sort_byday_rules: function icalrecur_sort_byday_rules(aRules) {
          for (var i = 0; i < aRules.length; i++) {
            for (var j = 0; j < i; j++) {
              var one = this.ruleDayOfWeek(aRules[j], this.rule.wkst)[1];
              var two = this.ruleDayOfWeek(aRules[i], this.rule.wkst)[1];

              if (one > two) {
                var tmp = aRules[i];
                aRules[i] = aRules[j];
                aRules[j] = tmp;
              }
            }
          }
        },

        check_contract_restriction: function check_contract_restriction(aRuleType, v) {
          var indexMapValue = icalrecur_iterator._indexMap[aRuleType];
          var ruleMapValue = icalrecur_iterator._expandMap[this.rule.freq][indexMapValue];
          var pass = false;

          if (aRuleType in this.by_data &&
              ruleMapValue == icalrecur_iterator.CONTRACT) {

            var ruleType = this.by_data[aRuleType];

            for (var bydatakey in ruleType) {
              /* istanbul ignore else */
              if (ruleType.hasOwnProperty(bydatakey)) {
                if (ruleType[bydatakey] == v) {
                  pass = true;
                  break;
                }
              }
            }
          } else {
            // Not a contracting byrule or has no data, test passes
            pass = true;
          }
          return pass;
        },

        check_contracting_rules: function check_contracting_rules() {
          var dow = this.last.dayOfWeek();
          var weekNo = this.last.weekNumber(this.rule.wkst);
          var doy = this.last.dayOfYear();

          return (this.check_contract_restriction("BYSECOND", this.last.second) &&
                  this.check_contract_restriction("BYMINUTE", this.last.minute) &&
                  this.check_contract_restriction("BYHOUR", this.last.hour) &&
                  this.check_contract_restriction("BYDAY", ICAL.Recur.numericDayToIcalDay(dow)) &&
                  this.check_contract_restriction("BYWEEKNO", weekNo) &&
                  this.check_contract_restriction("BYMONTHDAY", this.last.day) &&
                  this.check_contract_restriction("BYMONTH", this.last.month) &&
                  this.check_contract_restriction("BYYEARDAY", doy));
        },

        setup_defaults: function setup_defaults(aRuleType, req, deftime) {
          var indexMapValue = icalrecur_iterator._indexMap[aRuleType];
          var ruleMapValue = icalrecur_iterator._expandMap[this.rule.freq][indexMapValue];

          if (ruleMapValue != icalrecur_iterator.CONTRACT) {
            if (!(aRuleType in this.by_data)) {
              this.by_data[aRuleType] = [deftime];
            }
            if (this.rule.freq != req) {
              return this.by_data[aRuleType][0];
            }
          }
          return deftime;
        },

        /**
         * Convert iterator into a serialize-able object.  Will preserve current
         * iteration sequence to ensure the seamless continuation of the recurrence
         * rule.
         * @return {Object}
         */
        toJSON: function() {
          var result = Object.create(null);

          result.initialized = this.initialized;
          result.rule = this.rule.toJSON();
          result.dtstart = this.dtstart.toJSON();
          result.by_data = this.by_data;
          result.days = this.days;
          result.last = this.last.toJSON();
          result.by_indices = this.by_indices;
          result.occurrence_number = this.occurrence_number;

          return result;
        }
      };

      icalrecur_iterator._indexMap = {
        "BYSECOND": 0,
        "BYMINUTE": 1,
        "BYHOUR": 2,
        "BYDAY": 3,
        "BYMONTHDAY": 4,
        "BYYEARDAY": 5,
        "BYWEEKNO": 6,
        "BYMONTH": 7,
        "BYSETPOS": 8
      };

      icalrecur_iterator._expandMap = {
        "SECONDLY": [1, 1, 1, 1, 1, 1, 1, 1],
        "MINUTELY": [2, 1, 1, 1, 1, 1, 1, 1],
        "HOURLY": [2, 2, 1, 1, 1, 1, 1, 1],
        "DAILY": [2, 2, 2, 1, 1, 1, 1, 1],
        "WEEKLY": [2, 2, 2, 2, 3, 3, 1, 1],
        "MONTHLY": [2, 2, 2, 2, 2, 3, 3, 1],
        "YEARLY": [2, 2, 2, 2, 2, 2, 2, 2]
      };
      icalrecur_iterator.UNKNOWN = 0;
      icalrecur_iterator.CONTRACT = 1;
      icalrecur_iterator.EXPAND = 2;
      icalrecur_iterator.ILLEGAL = 3;

      return icalrecur_iterator;

    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.RecurExpansion = (function() {
      function formatTime(item) {
        return ICAL.helpers.formatClassType(item, ICAL.Time);
      }

      function compareTime(a, b) {
        return a.compare(b);
      }

      function isRecurringComponent(comp) {
        return comp.hasProperty('rdate') ||
               comp.hasProperty('rrule') ||
               comp.hasProperty('recurrence-id');
      }

      /**
       * @classdesc
       * Primary class for expanding recurring rules.  Can take multiple rrules,
       * rdates, exdate(s) and iterate (in order) over each next occurrence.
       *
       * Once initialized this class can also be serialized saved and continue
       * iteration from the last point.
       *
       * NOTE: it is intended that this class is to be used
       *       with ICAL.Event which handles recurrence exceptions.
       *
       * @example
       * // assuming event is a parsed ical component
       * var event;
       *
       * var expand = new ICAL.RecurExpansion({
       *   component: event,
       *   dtstart: event.getFirstPropertyValue('dtstart')
       * });
       *
       * // remember there are infinite rules
       * // so it is a good idea to limit the scope
       * // of the iterations then resume later on.
       *
       * // next is always an ICAL.Time or null
       * var next;
       *
       * while (someCondition && (next = expand.next())) {
       *   // do something with next
       * }
       *
       * // save instance for later
       * var json = JSON.stringify(expand);
       *
       * //...
       *
       * // NOTE: if the component's properties have
       * //       changed you will need to rebuild the
       * //       class and start over. This only works
       * //       when the component's recurrence info is the same.
       * var expand = new ICAL.RecurExpansion(JSON.parse(json));
       *
       * @description
       * The options object can be filled with the specified initial values. It can
       * also contain additional members, as a result of serializing a previous
       * expansion state, as shown in the example.
       *
       * @class
       * @alias ICAL.RecurExpansion
       * @param {Object} options
       *        Recurrence expansion options
       * @param {ICAL.Time} options.dtstart
       *        Start time of the event
       * @param {ICAL.Component=} options.component
       *        Component for expansion, required if not resuming.
       */
      function RecurExpansion(options) {
        this.ruleDates = [];
        this.exDates = [];
        this.fromData(options);
      }

      RecurExpansion.prototype = {
        /**
         * True when iteration is fully completed.
         * @type {Boolean}
         */
        complete: false,

        /**
         * Array of rrule iterators.
         *
         * @type {ICAL.RecurIterator[]}
         * @private
         */
        ruleIterators: null,

        /**
         * Array of rdate instances.
         *
         * @type {ICAL.Time[]}
         * @private
         */
        ruleDates: null,

        /**
         * Array of exdate instances.
         *
         * @type {ICAL.Time[]}
         * @private
         */
        exDates: null,

        /**
         * Current position in ruleDates array.
         * @type {Number}
         * @private
         */
        ruleDateInc: 0,

        /**
         * Current position in exDates array
         * @type {Number}
         * @private
         */
        exDateInc: 0,

        /**
         * Current negative date.
         *
         * @type {ICAL.Time}
         * @private
         */
        exDate: null,

        /**
         * Current additional date.
         *
         * @type {ICAL.Time}
         * @private
         */
        ruleDate: null,

        /**
         * Start date of recurring rules.
         *
         * @type {ICAL.Time}
         */
        dtstart: null,

        /**
         * Last expanded time
         *
         * @type {ICAL.Time}
         */
        last: null,

        /**
         * Initialize the recurrence expansion from the data object. The options
         * object may also contain additional members, see the
         * {@link ICAL.RecurExpansion constructor} for more details.
         *
         * @param {Object} options
         *        Recurrence expansion options
         * @param {ICAL.Time} options.dtstart
         *        Start time of the event
         * @param {ICAL.Component=} options.component
         *        Component for expansion, required if not resuming.
         */
        fromData: function(options) {
          var start = ICAL.helpers.formatClassType(options.dtstart, ICAL.Time);

          if (!start) {
            throw new Error('.dtstart (ICAL.Time) must be given');
          } else {
            this.dtstart = start;
          }

          if (options.component) {
            this._init(options.component);
          } else {
            this.last = formatTime(options.last) || start.clone();

            if (!options.ruleIterators) {
              throw new Error('.ruleIterators or .component must be given');
            }

            this.ruleIterators = options.ruleIterators.map(function(item) {
              return ICAL.helpers.formatClassType(item, ICAL.RecurIterator);
            });

            this.ruleDateInc = options.ruleDateInc;
            this.exDateInc = options.exDateInc;

            if (options.ruleDates) {
              this.ruleDates = options.ruleDates.map(formatTime);
              this.ruleDate = this.ruleDates[this.ruleDateInc];
            }

            if (options.exDates) {
              this.exDates = options.exDates.map(formatTime);
              this.exDate = this.exDates[this.exDateInc];
            }

            if (typeof(options.complete) !== 'undefined') {
              this.complete = options.complete;
            }
          }
        },

        /**
         * Retrieve the next occurrence in the series.
         * @return {ICAL.Time}
         */
        next: function() {
          var iter;
          var next;
          var compare;

          var maxTries = 500;
          var currentTry = 0;

          while (true) {
            if (currentTry++ > maxTries) {
              throw new Error(
                'max tries have occured, rule may be impossible to forfill.'
              );
            }

            next = this.ruleDate;
            iter = this._nextRecurrenceIter(this.last);

            // no more matches
            // because we increment the rule day or rule
            // _after_ we choose a value this should be
            // the only spot where we need to worry about the
            // end of events.
            if (!next && !iter) {
              // there are no more iterators or rdates
              this.complete = true;
              break;
            }

            // no next rule day or recurrence rule is first.
            if (!next || (iter && next.compare(iter.last) > 0)) {
              // must be cloned, recur will reuse the time element.
              next = iter.last.clone();
              // move to next so we can continue
              iter.next();
            }

            // if the ruleDate is still next increment it.
            if (this.ruleDate === next) {
              this._nextRuleDay();
            }

            this.last = next;

            // check the negative rules
            if (this.exDate) {
              compare = this.exDate.compare(this.last);

              if (compare < 0) {
                this._nextExDay();
              }

              // if the current rule is excluded skip it.
              if (compare === 0) {
                this._nextExDay();
                continue;
              }
            }

            //XXX: The spec states that after we resolve the final
            //     list of dates we execute exdate this seems somewhat counter
            //     intuitive to what I have seen most servers do so for now
            //     I exclude based on the original date not the one that may
            //     have been modified by the exception.
            return this.last;
          }
        },

        /**
         * Converts object into a serialize-able format. This format can be passed
         * back into the expansion to resume iteration.
         * @return {Object}
         */
        toJSON: function() {
          function toJSON(item) {
            return item.toJSON();
          }

          var result = Object.create(null);
          result.ruleIterators = this.ruleIterators.map(toJSON);

          if (this.ruleDates) {
            result.ruleDates = this.ruleDates.map(toJSON);
          }

          if (this.exDates) {
            result.exDates = this.exDates.map(toJSON);
          }

          result.ruleDateInc = this.ruleDateInc;
          result.exDateInc = this.exDateInc;
          result.last = this.last.toJSON();
          result.dtstart = this.dtstart.toJSON();
          result.complete = this.complete;

          return result;
        },

        /**
         * Extract all dates from the properties in the given component. The
         * properties will be filtered by the property name.
         *
         * @private
         * @param {ICAL.Component} component        The component to search in
         * @param {String} propertyName             The property name to search for
         * @return {ICAL.Time[]}                    The extracted dates.
         */
        _extractDates: function(component, propertyName) {
          function handleProp(prop) {
            idx = ICAL.helpers.binsearchInsert(
              result,
              prop,
              compareTime
            );

            // ordered insert
            result.splice(idx, 0, prop);
          }

          var result = [];
          var props = component.getAllProperties(propertyName);
          var len = props.length;
          var i = 0;

          var idx;

          for (; i < len; i++) {
            props[i].getValues().forEach(handleProp);
          }

          return result;
        },

        /**
         * Initialize the recurrence expansion.
         *
         * @private
         * @param {ICAL.Component} component    The component to initialize from.
         */
        _init: function(component) {
          this.ruleIterators = [];

          this.last = this.dtstart.clone();

          // to provide api consistency non-recurring
          // events can also use the iterator though it will
          // only return a single time.
          if (!isRecurringComponent(component)) {
            this.ruleDate = this.last.clone();
            this.complete = true;
            return;
          }

          if (component.hasProperty('rdate')) {
            this.ruleDates = this._extractDates(component, 'rdate');

            // special hack for cases where first rdate is prior
            // to the start date. We only check for the first rdate.
            // This is mostly for google's crazy recurring date logic
            // (contacts birthdays).
            if ((this.ruleDates[0]) &&
                (this.ruleDates[0].compare(this.dtstart) < 0)) {

              this.ruleDateInc = 0;
              this.last = this.ruleDates[0].clone();
            } else {
              this.ruleDateInc = ICAL.helpers.binsearchInsert(
                this.ruleDates,
                this.last,
                compareTime
              );
            }

            this.ruleDate = this.ruleDates[this.ruleDateInc];
          }

          if (component.hasProperty('rrule')) {
            var rules = component.getAllProperties('rrule');
            var i = 0;
            var len = rules.length;

            var rule;
            var iter;

            for (; i < len; i++) {
              rule = rules[i].getFirstValue();
              iter = rule.iterator(this.dtstart);
              this.ruleIterators.push(iter);

              // increment to the next occurrence so future
              // calls to next return times beyond the initial iteration.
              // XXX: I find this suspicious might be a bug?
              iter.next();
            }
          }

          if (component.hasProperty('exdate')) {
            this.exDates = this._extractDates(component, 'exdate');
            // if we have a .last day we increment the index to beyond it.
            this.exDateInc = ICAL.helpers.binsearchInsert(
              this.exDates,
              this.last,
              compareTime
            );

            this.exDate = this.exDates[this.exDateInc];
          }
        },

        /**
         * Advance to the next exdate
         * @private
         */
        _nextExDay: function() {
          this.exDate = this.exDates[++this.exDateInc];
        },

        /**
         * Advance to the next rule date
         * @private
         */
        _nextRuleDay: function() {
          this.ruleDate = this.ruleDates[++this.ruleDateInc];
        },

        /**
         * Find and return the recurrence rule with the most recent event and
         * return it.
         *
         * @private
         * @return {?ICAL.RecurIterator}    Found iterator.
         */
        _nextRecurrenceIter: function() {
          var iters = this.ruleIterators;

          if (iters.length === 0) {
            return null;
          }

          var len = iters.length;
          var iter;
          var iterTime;
          var iterIdx = 0;
          var chosenIter;

          // loop through each iterator
          for (; iterIdx < len; iterIdx++) {
            iter = iters[iterIdx];
            iterTime = iter.last;

            // if iteration is complete
            // then we must exclude it from
            // the search and remove it.
            if (iter.completed) {
              len--;
              if (iterIdx !== 0) {
                iterIdx--;
              }
              iters.splice(iterIdx, 1);
              continue;
            }

            // find the most recent possible choice
            if (!chosenIter || chosenIter.last.compare(iterTime) > 0) {
              // that iterator is saved
              chosenIter = iter;
            }
          }

          // the chosen iterator is returned but not mutated
          // this iterator contains the most recent event.
          return chosenIter;
        }
      };

      return RecurExpansion;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.Event = (function() {

      /**
       * @classdesc
       * ICAL.js is organized into multiple layers. The bottom layer is a raw jCal
       * object, followed by the component/property layer. The highest level is the
       * event representation, which this class is part of. See the
       * {@tutorial layers} guide for more details.
       *
       * @class
       * @alias ICAL.Event
       * @param {ICAL.Component=} component         The ICAL.Component to base this event on
       * @param {Object} options                    Options for this event
       * @param {Boolean} options.strictExceptions
       *          When true, will verify exceptions are related by their UUID
       * @param {Array<ICAL.Component|ICAL.Event>} options.exceptions
       *          Exceptions to this event, either as components or events. If not
       *            specified exceptions will automatically be set in relation of
       *            component's parent
       */
      function Event(component, options) {
        if (!(component instanceof ICAL.Component)) {
          options = component;
          component = null;
        }

        if (component) {
          this.component = component;
        } else {
          this.component = new ICAL.Component('vevent');
        }

        this._rangeExceptionCache = Object.create(null);
        this.exceptions = Object.create(null);
        this.rangeExceptions = [];

        if (options && options.strictExceptions) {
          this.strictExceptions = options.strictExceptions;
        }

        if (options && options.exceptions) {
          options.exceptions.forEach(this.relateException, this);
        } else if (this.component.parent && !this.isRecurrenceException()) {
          this.component.parent.getAllSubcomponents('vevent').forEach(function(event) {
            if (event.hasProperty('recurrence-id')) {
              this.relateException(event);
            }
          }, this);
        }
      }

      Event.prototype = {

        THISANDFUTURE: 'THISANDFUTURE',

        /**
         * List of related event exceptions.
         *
         * @type {ICAL.Event[]}
         */
        exceptions: null,

        /**
         * When true, will verify exceptions are related by their UUID.
         *
         * @type {Boolean}
         */
        strictExceptions: false,

        /**
         * Relates a given event exception to this object.  If the given component
         * does not share the UID of this event it cannot be related and will throw
         * an exception.
         *
         * If this component is an exception it cannot have other exceptions
         * related to it.
         *
         * @param {ICAL.Component|ICAL.Event} obj       Component or event
         */
        relateException: function(obj) {
          if (this.isRecurrenceException()) {
            throw new Error('cannot relate exception to exceptions');
          }

          if (obj instanceof ICAL.Component) {
            obj = new ICAL.Event(obj);
          }

          if (this.strictExceptions && obj.uid !== this.uid) {
            throw new Error('attempted to relate unrelated exception');
          }

          var id = obj.recurrenceId.toString();

          // we don't sort or manage exceptions directly
          // here the recurrence expander handles that.
          this.exceptions[id] = obj;

          // index RANGE=THISANDFUTURE exceptions so we can
          // look them up later in getOccurrenceDetails.
          if (obj.modifiesFuture()) {
            var item = [
              obj.recurrenceId.toUnixTime(), id
            ];

            // we keep them sorted so we can find the nearest
            // value later on...
            var idx = ICAL.helpers.binsearchInsert(
              this.rangeExceptions,
              item,
              compareRangeException
            );

            this.rangeExceptions.splice(idx, 0, item);
          }
        },

        /**
         * Checks if this record is an exception and has the RANGE=THISANDFUTURE
         * value.
         *
         * @return {Boolean}        True, when exception is within range
         */
        modifiesFuture: function() {
          if (!this.component.hasProperty('recurrence-id')) {
            return false;
          }

          var range = this.component.getFirstProperty('recurrence-id').getParameter('range');
          return range === this.THISANDFUTURE;
        },

        /**
         * Finds the range exception nearest to the given date.
         *
         * @param {ICAL.Time} time usually an occurrence time of an event
         * @return {?ICAL.Event} the related event/exception or null
         */
        findRangeException: function(time) {
          if (!this.rangeExceptions.length) {
            return null;
          }

          var utc = time.toUnixTime();
          var idx = ICAL.helpers.binsearchInsert(
            this.rangeExceptions,
            [utc],
            compareRangeException
          );

          idx -= 1;

          // occurs before
          if (idx < 0) {
            return null;
          }

          var rangeItem = this.rangeExceptions[idx];

          /* istanbul ignore next: sanity check only */
          if (utc < rangeItem[0]) {
            return null;
          }

          return rangeItem[1];
        },

        /**
         * This object is returned by {@link ICAL.Event#getOccurrenceDetails getOccurrenceDetails}
         *
         * @typedef {Object} occurrenceDetails
         * @memberof ICAL.Event
         * @property {ICAL.Time} recurrenceId       The passed in recurrence id
         * @property {ICAL.Event} item              The occurrence
         * @property {ICAL.Time} startDate          The start of the occurrence
         * @property {ICAL.Time} endDate            The end of the occurrence
         */

        /**
         * Returns the occurrence details based on its start time.  If the
         * occurrence has an exception will return the details for that exception.
         *
         * NOTE: this method is intend to be used in conjunction
         *       with the {@link ICAL.Event#iterator iterator} method.
         *
         * @param {ICAL.Time} occurrence time occurrence
         * @return {ICAL.Event.occurrenceDetails} Information about the occurrence
         */
        getOccurrenceDetails: function(occurrence) {
          var id = occurrence.toString();
          var utcId = occurrence.convertToZone(ICAL.Timezone.utcTimezone).toString();
          var item;
          var result = {
            //XXX: Clone?
            recurrenceId: occurrence
          };

          if (id in this.exceptions) {
            item = result.item = this.exceptions[id];
            result.startDate = item.startDate;
            result.endDate = item.endDate;
            result.item = item;
          } else if (utcId in this.exceptions) {
            item = this.exceptions[utcId];
            result.startDate = item.startDate;
            result.endDate = item.endDate;
            result.item = item;
          } else {
            // range exceptions (RANGE=THISANDFUTURE) have a
            // lower priority then direct exceptions but
            // must be accounted for first. Their item is
            // always the first exception with the range prop.
            var rangeExceptionId = this.findRangeException(
              occurrence
            );
            var end;

            if (rangeExceptionId) {
              var exception = this.exceptions[rangeExceptionId];

              // range exception must modify standard time
              // by the difference (if any) in start/end times.
              result.item = exception;

              var startDiff = this._rangeExceptionCache[rangeExceptionId];

              if (!startDiff) {
                var original = exception.recurrenceId.clone();
                var newStart = exception.startDate.clone();

                // zones must be same otherwise subtract may be incorrect.
                original.zone = newStart.zone;
                startDiff = newStart.subtractDate(original);

                this._rangeExceptionCache[rangeExceptionId] = startDiff;
              }

              var start = occurrence.clone();
              start.zone = exception.startDate.zone;
              start.addDuration(startDiff);

              end = start.clone();
              end.addDuration(exception.duration);

              result.startDate = start;
              result.endDate = end;
            } else {
              // no range exception standard expansion
              end = occurrence.clone();
              end.addDuration(this.duration);

              result.endDate = end;
              result.startDate = occurrence;
              result.item = this;
            }
          }

          return result;
        },

        /**
         * Builds a recur expansion instance for a specific point in time (defaults
         * to startDate).
         *
         * @param {ICAL.Time} startTime     Starting point for expansion
         * @return {ICAL.RecurExpansion}    Expansion object
         */
        iterator: function(startTime) {
          return new ICAL.RecurExpansion({
            component: this.component,
            dtstart: startTime || this.startDate
          });
        },

        /**
         * Checks if the event is recurring
         *
         * @return {Boolean}        True, if event is recurring
         */
        isRecurring: function() {
          var comp = this.component;
          return comp.hasProperty('rrule') || comp.hasProperty('rdate');
        },

        /**
         * Checks if the event describes a recurrence exception. See
         * {@tutorial terminology} for details.
         *
         * @return {Boolean}    True, if the event describes a recurrence exception
         */
        isRecurrenceException: function() {
          return this.component.hasProperty('recurrence-id');
        },

        /**
         * Returns the types of recurrences this event may have.
         *
         * Returned as an object with the following possible keys:
         *
         *    - YEARLY
         *    - MONTHLY
         *    - WEEKLY
         *    - DAILY
         *    - MINUTELY
         *    - SECONDLY
         *
         * @return {Object.<ICAL.Recur.frequencyValues, Boolean>}
         *          Object of recurrence flags
         */
        getRecurrenceTypes: function() {
          var rules = this.component.getAllProperties('rrule');
          var i = 0;
          var len = rules.length;
          var result = Object.create(null);

          for (; i < len; i++) {
            var value = rules[i].getFirstValue();
            result[value.freq] = true;
          }

          return result;
        },

        /**
         * The uid of this event
         * @type {String}
         */
        get uid() {
          return this._firstProp('uid');
        },

        set uid(value) {
          this._setProp('uid', value);
        },

        /**
         * The start date
         * @type {ICAL.Time}
         */
        get startDate() {
          return this._firstProp('dtstart');
        },

        set startDate(value) {
          this._setTime('dtstart', value);
        },

        /**
         * The end date. This can be the result directly from the property, or the
         * end date calculated from start date and duration. Setting the property
         * will remove any duration properties.
         * @type {ICAL.Time}
         */
        get endDate() {
          var endDate = this._firstProp('dtend');
          if (!endDate) {
              var duration = this._firstProp('duration');
              endDate = this.startDate.clone();
              if (duration) {
                  endDate.addDuration(duration);
              } else if (endDate.isDate) {
                  endDate.day += 1;
              }
          }
          return endDate;
        },

        set endDate(value) {
          if (this.component.hasProperty('duration')) {
            this.component.removeProperty('duration');
          }
          this._setTime('dtend', value);
        },

        /**
         * The duration. This can be the result directly from the property, or the
         * duration calculated from start date and end date. Setting the property
         * will remove any `dtend` properties.
         * @type {ICAL.Duration}
         */
        get duration() {
          var duration = this._firstProp('duration');
          if (!duration) {
            return this.endDate.subtractDateTz(this.startDate);
          }
          return duration;
        },

        set duration(value) {
          if (this.component.hasProperty('dtend')) {
            this.component.removeProperty('dtend');
          }

          this._setProp('duration', value);
        },

        /**
         * The location of the event.
         * @type {String}
         */
        get location() {
          return this._firstProp('location');
        },

        set location(value) {
          return this._setProp('location', value);
        },

        /**
         * The attendees in the event
         * @type {ICAL.Property[]}
         * @readonly
         */
        get attendees() {
          //XXX: This is way lame we should have a better
          //     data structure for this later.
          return this.component.getAllProperties('attendee');
        },


        /**
         * The event summary
         * @type {String}
         */
        get summary() {
          return this._firstProp('summary');
        },

        set summary(value) {
          this._setProp('summary', value);
        },

        /**
         * The event description.
         * @type {String}
         */
        get description() {
          return this._firstProp('description');
        },

        set description(value) {
          this._setProp('description', value);
        },

        /**
         * The event color from [rfc7986](https://datatracker.ietf.org/doc/html/rfc7986)
         * @type {String}
         */
        get color() {
          return this._firstProp('color');
        },

        set color(value) {
          this._setProp('color', value);
        },

        /**
         * The organizer value as an uri. In most cases this is a mailto: uri, but
         * it can also be something else, like urn:uuid:...
         * @type {String}
         */
        get organizer() {
          return this._firstProp('organizer');
        },

        set organizer(value) {
          this._setProp('organizer', value);
        },

        /**
         * The sequence value for this event. Used for scheduling
         * see {@tutorial terminology}.
         * @type {Number}
         */
        get sequence() {
          return this._firstProp('sequence');
        },

        set sequence(value) {
          this._setProp('sequence', value);
        },

        /**
         * The recurrence id for this event. See {@tutorial terminology} for details.
         * @type {ICAL.Time}
         */
        get recurrenceId() {
          return this._firstProp('recurrence-id');
        },

        set recurrenceId(value) {
          this._setTime('recurrence-id', value);
        },

        /**
         * Set/update a time property's value.
         * This will also update the TZID of the property.
         *
         * TODO: this method handles the case where we are switching
         * from a known timezone to an implied timezone (one without TZID).
         * This does _not_ handle the case of moving between a known
         *  (by TimezoneService) timezone to an unknown timezone...
         *
         * We will not add/remove/update the VTIMEZONE subcomponents
         *  leading to invalid ICAL data...
         * @private
         * @param {String} propName     The property name
         * @param {ICAL.Time} time      The time to set
         */
        _setTime: function(propName, time) {
          var prop = this.component.getFirstProperty(propName);

          if (!prop) {
            prop = new ICAL.Property(propName);
            this.component.addProperty(prop);
          }

          // utc and local don't get a tzid
          if (
            time.zone === ICAL.Timezone.localTimezone ||
            time.zone === ICAL.Timezone.utcTimezone
          ) {
            // remove the tzid
            prop.removeParameter('tzid');
          } else {
            prop.setParameter('tzid', time.zone.tzid);
          }

          prop.setValue(time);
        },

        _setProp: function(name, value) {
          this.component.updatePropertyWithValue(name, value);
        },

        _firstProp: function(name) {
          return this.component.getFirstPropertyValue(name);
        },

        /**
         * The string representation of this event.
         * @return {String}
         */
        toString: function() {
          return this.component.toString();
        }

      };

      function compareRangeException(a, b) {
        if (a[0] > b[0]) return 1;
        if (b[0] > a[0]) return -1;
        return 0;
      }

      return Event;
    }());
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this
     * file, You can obtain one at http://mozilla.org/MPL/2.0/.
     * Portions Copyright (C) Philipp Kewisch, 2011-2015 */


    /**
     * This symbol is further described later on
     * @ignore
     */
    ICAL.ComponentParser = (function() {
      /**
       * @classdesc
       * The ComponentParser is used to process a String or jCal Object,
       * firing callbacks for various found components, as well as completion.
       *
       * @example
       * var options = {
       *   // when false no events will be emitted for type
       *   parseEvent: true,
       *   parseTimezone: true
       * };
       *
       * var parser = new ICAL.ComponentParser(options);
       *
       * parser.onevent(eventComponent) {
       *   //...
       * }
       *
       * // ontimezone, etc...
       *
       * parser.oncomplete = function() {
       *
       * };
       *
       * parser.process(stringOrComponent);
       *
       * @class
       * @alias ICAL.ComponentParser
       * @param {Object=} options        Component parser options
       * @param {Boolean} options.parseEvent        Whether events should be parsed
       * @param {Boolean} options.parseTimezeone    Whether timezones should be parsed
       */
      function ComponentParser(options) {
        if (typeof(options) === 'undefined') {
          options = {};
        }

        var key;
        for (key in options) {
          /* istanbul ignore else */
          if (options.hasOwnProperty(key)) {
            this[key] = options[key];
          }
        }
      }

      ComponentParser.prototype = {

        /**
         * When true, parse events
         *
         * @type {Boolean}
         */
        parseEvent: true,

        /**
         * When true, parse timezones
         *
         * @type {Boolean}
         */
        parseTimezone: true,


        /* SAX like events here for reference */

        /**
         * Fired when parsing is complete
         * @callback
         */
        oncomplete: /* istanbul ignore next */ function() {},

        /**
         * Fired if an error occurs during parsing.
         *
         * @callback
         * @param {Error} err details of error
         */
        onerror: /* istanbul ignore next */ function(err) {},

        /**
         * Fired when a top level component (VTIMEZONE) is found
         *
         * @callback
         * @param {ICAL.Timezone} component     Timezone object
         */
        ontimezone: /* istanbul ignore next */ function(component) {},

        /**
         * Fired when a top level component (VEVENT) is found.
         *
         * @callback
         * @param {ICAL.Event} component    Top level component
         */
        onevent: /* istanbul ignore next */ function(component) {},

        /**
         * Process a string or parse ical object.  This function itself will return
         * nothing but will start the parsing process.
         *
         * Events must be registered prior to calling this method.
         *
         * @param {ICAL.Component|String|Object} ical      The component to process,
         *        either in its final form, as a jCal Object, or string representation
         */
        process: function(ical) {
          //TODO: this is sync now in the future we will have a incremental parser.
          if (typeof(ical) === 'string') {
            ical = ICAL.parse(ical);
          }

          if (!(ical instanceof ICAL.Component)) {
            ical = new ICAL.Component(ical);
          }

          var components = ical.getAllSubcomponents();
          var i = 0;
          var len = components.length;
          var component;

          for (; i < len; i++) {
            component = components[i];

            switch (component.name) {
              case 'vtimezone':
                if (this.parseTimezone) {
                  var tzid = component.getFirstPropertyValue('tzid');
                  if (tzid) {
                    this.ontimezone(new ICAL.Timezone({
                      tzid: tzid,
                      component: component
                    }));
                  }
                }
                break;
              case 'vevent':
                if (this.parseEvent) {
                  this.onevent(new ICAL.Event(component));
                }
                break;
              default:
                continue;
            }
          }

          //XXX: ideally we should do a "nextTick" here
          //     so in all cases this is actually async.
          this.oncomplete();
        }
      };

      return ComponentParser;
    }());
    });

    const uniqueID = factory();

    const mod = {

    	SNPDocumentTypeNote () {
    		return 'TYPE_NOTE';
    	},

    	SNPDocumentTypeSite () {
    		return 'TYPE_SITE';
    	},

    	SNPDocumentTypeEmail () {
    		return 'TYPE_EMAIL';
    	},

    	SNPDocumentTypePhone () {
    		return 'TYPE_PHONE';
    	},

    	SNPDocumentTypeWifi () {
    		return 'TYPE_WIFI';
    	},

    	SNPDocumentTypeContact () {
    		return 'TYPE_CONTACT';
    	},

    	SNPDocumentTypes () {
    		return [
    			mod.SNPDocumentTypeNote(),
    			mod.SNPDocumentTypeSite(),
    			mod.SNPDocumentTypeEmail(),
    			mod.SNPDocumentTypePhone(),
    			mod.SNPDocumentTypeWifi(),
    			mod.SNPDocumentTypeContact(),
    		];
    	},

    	SNPDocumentErrors (inputData, options = {}) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		const errors = {};

    		if (typeof inputData.SNPDocumentID !== 'string') {
    			errors.SNPDocumentID = [
    				'SNPErrorNotString',
    			];
    		} else if (!inputData.SNPDocumentID.trim()) {
    			errors.SNPDocumentID = [
    				'SNPErrorNotFilled',
    			];
    		}

    		if (!(inputData.SNPDocumentCreationDate instanceof Date) || Number.isNaN(inputData.SNPDocumentCreationDate.getTime())) {
    			errors.SNPDocumentCreationDate = [
    				'SNPErrorNotDate',
    			];
    		}

    		if (!(inputData.SNPDocumentModificationDate instanceof Date) || Number.isNaN(inputData.SNPDocumentModificationDate.getTime())) {
    			errors.SNPDocumentModificationDate = [
    				'SNPErrorNotDate',
    			];
    		}

    		if (!mod.SNPDocumentTypes().includes(inputData.SNPDocumentType)) {
    			errors.SNPDocumentType = [
    				'SNPErrorNotValid',
    			];
    		}

    		if (typeof inputData.SNPDocumentData !== 'string') {
    			errors.SNPDocumentData = [
    				'SNPErrorNotString',
    			];
    		} else if (!inputData.SNPDocumentData.trim()) {
    			errors.SNPDocumentData = [
    				'SNPErrorNotFilled',
    			];
    		}

    		if (typeof inputData.SNPDocumentName !== 'string') {
    			errors.SNPDocumentName = [
    				'SNPErrorNotString',
    			];
    		}

    		return Object.entries(errors).length ? errors : null;
    	},

    	SNPDocumentValidateEmail (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		if (!!inputData.match(/^mailto:/)) {
    			return true;
    		}

    		return !!main$5.OLSKEmailValid(inputData);
    	},

    	SNPDocumentValidatePhone (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return !!inputData.match(/^tel:/);
    	},

    	SNPDocumentValidateWifi (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		if (!inputData.match(/^WIFI:/)) {
    			return false;
    		}

    		const item = mod.SNPDocumentExplodeWifi(inputData);

    		if (!item.SNPDocumentWifiNetwork.trim().length) {
    			return false;
    		}

    		if (!item.SNPDocumentWifiSecurity.trim().length) {
    			return false;
    		}

    		return true
    	},

    	SNPDocumentValidateContact (inputData) {
    		if (typeof inputData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		try {
    			const result = ical.parse(inputData);

    			if (result[0] !== 'vcard') {
    				return false;
    			}

    			if (!result[1].filter(function (e) {
    				if (!'fn org email tel url'.split(' ').includes(e[0])) {
    					return false;
    				}

    				if (!e.slice(-1).pop()) {
    					return false;
    				}
    				
    				return true;
    			}, []).length) {
    				return false;
    			}

    			return true;
    		} catch {
    			return false;
    		}

    		return false;
    	},

    	SNPDocumentExplodeEmail (SNPDocumentData) {
    		if (typeof SNPDocumentData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return {
    			SNPDocumentData,
    			SNPDocumentType: mod.SNPDocumentTypeEmail(),
    			SNPDocumentEmail: SNPDocumentData.split(/^mailto:/).filter(function (e) {
    				return e.length;
    			}).shift(),
    		};
    	},

    	SNPDocumentExplodePhone (SNPDocumentData) {
    		if (typeof SNPDocumentData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return {
    			SNPDocumentData,
    			SNPDocumentType: mod.SNPDocumentTypePhone(),
    			SNPDocumentPhone: SNPDocumentData.split(/^tel:/).filter(function (e) {
    				return e.length;
    			}).shift(),
    		};
    	},

    	SNPDocumentExplodeWifi (SNPDocumentData) {
    		if (typeof SNPDocumentData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		const SNPDocumentWifiSecurity = SNPDocumentData.match(/WIFI:T:(.*);S/).pop();
    		const SNPDocumentWifiNetwork = SNPDocumentData.match(/;S:(.*);P/).pop();
    		const SNPDocumentWifiPassword = SNPDocumentData.match(/;P:(.*);H/).pop();
    		const SNPDocumentWifiHidden = !!(SNPDocumentData.match(/;H:(.*);;/) || []).pop();

    		return {
    			SNPDocumentData,
    			SNPDocumentType: mod.SNPDocumentTypeWifi(),
    			SNPDocumentWifiSecurity,
    			SNPDocumentWifiNetwork,
    			SNPDocumentWifiPassword,
    			SNPDocumentWifiHidden,
    		};
    	},

    	SNPDocumentExplodeContact (SNPDocumentData) {
    		if (typeof SNPDocumentData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		const map = {
    			org: 'SNPDocumentContactOrganization',
    			email: 'SNPDocumentContactEmail',
    			tel: 'SNPDocumentContactPhone',
    			url: 'SNPDocumentContactSite',
    		};

    		return ical.parse(SNPDocumentData)[1].reduce(function (coll, item) {
    			const key = map[item[0]];
    			let value = item.pop();

    			if (item[0] === 'n') {
    				const SNPDocumentContactLastName = value.shift();
    				const SNPDocumentContactFirstName = value.shift();

    				if (SNPDocumentContactFirstName) {
    					Object.assign(coll, {
    						SNPDocumentContactFirstName,
    					});
    				}

    				if (SNPDocumentContactLastName) {
    					Object.assign(coll, {
    						SNPDocumentContactLastName,
    					});
    				}
    			}

    			return Object.assign(coll, !key ? {} : {
    				[key]: value,
    			});
    		}, {
    			SNPDocumentData,
    			SNPDocumentType: mod.SNPDocumentTypeContact(),
    		});
    	},

    	SNPDocumentValidateSite: main$5.OLSKLinkValid,

    	SNPDocumentExplode (SNPDocumentData) {
    		if (typeof SNPDocumentData !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		if (mod.SNPDocumentValidateEmail(SNPDocumentData)) {
    			return mod.SNPDocumentExplodeEmail(SNPDocumentData);
    		}

    		if (mod.SNPDocumentValidatePhone(SNPDocumentData)) {
    			return mod.SNPDocumentExplodePhone(SNPDocumentData);
    		}

    		if (mod.SNPDocumentValidateWifi(SNPDocumentData)) {
    			return mod.SNPDocumentExplodeWifi(SNPDocumentData);
    		}

    		if (mod.SNPDocumentValidateContact(SNPDocumentData)) {
    			return mod.SNPDocumentExplodeContact(SNPDocumentData);
    		}

    		return {
    			SNPDocumentData,
    			SNPDocumentType: (function(inputData) {
    				if (mod.SNPDocumentValidateSite(inputData)) {
    					return mod.SNPDocumentTypeSite();
    				}
    				
    				
    				return mod.SNPDocumentTypeNote();
    			})(SNPDocumentData),
    		};
    	},
    	
    	SNPDocumentDirectory () {
    		return 'snp_documents';
    	},

    	SNPDocumentObjectPath (inputData) {
    		return `${ mod.SNPDocumentDirectory() }/${ inputData.SNPDocumentID }`;
    	},

    	SNPDocumentStub (inputData) {
    		return {
    			SNPDocumentID: inputData.split('/').pop(),
    		};
    	},

    	_SNPDocumentProcess (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		delete inputData.__SNPDocumentProcessTest;

    		return inputData;
    	},

    };

    var SNPDocument = Object.assign(mod, {
    	ZDRSchemaKey: 'SNPDocument',
    	ZDRSchemaDispatchValidate: mod.SNPDocumentErrors,
    	ZDRSchemaPath: mod.SNPDocumentObjectPath,
    	ZDRSchemaStub: mod.SNPDocumentStub,
    	ZDRSchemaMethods: {
    		
    		SNPDocumentCreate (inputData) {
    			if (typeof inputData !== 'object' || inputData === null) {
    				throw new Error('SNPErrorInputNotValid');
    			}

    			const SNPDocumentCreationDate = new Date();

    			return this.App.SNPDocument.ZDRModelWriteObject(mod._SNPDocumentProcess(Object.assign(inputData, Object.assign({
    				SNPDocumentID: uniqueID(),
    				SNPDocumentCreationDate,
    				SNPDocumentModificationDate: SNPDocumentCreationDate,
    			}, inputData))));
    		},

    		SNPDocumentUpdate (inputData) {
    			if (typeof inputData !== 'object' || inputData === null) {
    				throw new Error('SNPErrorInputNotValid');
    			}

    			return this.App.SNPDocument.ZDRModelWriteObject(mod._SNPDocumentProcess(Object.assign(inputData, {
    				SNPDocumentModificationDate: new Date(),
    			})));
    		},

    		async SNPDocumentList () {
    			return Object.values(await this.App.SNPDocument.ZDRModelListObjects()).filter(function (e) {
    				return !!e;
    			}).map(main$4.OLSKRemoteStoragePostJSONParse);		},

    	},
    });

    /* os-app/sub-scan/main.svelte generated by Svelte v3.59.2 */

    const { Error: Error_1 } = globals;
    const file = "os-app/sub-scan/main.svelte";

    // (133:0) {#if !mod._ValueScanning }
    function create_if_block_4(ctx) {
    	let button;
    	let t1;
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = `${main_1('SNPScanStartButtonText')}`;
    			t1 = space();
    			input = element("input");
    			attr_dev(button, "class", "SNPScanStartButton");
    			add_location(button, file, 133, 1, 2529);
    			attr_dev(input, "class", "SNPScanFileInput");
    			attr_dev(input, "type", "file");
    			attr_dev(input, "accept", "image/*");
    			add_location(input, file, 134, 1, 2668);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, input, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[3].InterfaceScanStartButtonDidClick)) /*mod*/ ctx[3].InterfaceScanStartButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input,
    						"change",
    						function () {
    							if (is_function(/*mod*/ ctx[3].InterfaceFileInputDidChange)) /*mod*/ ctx[3].InterfaceFileInputDidChange.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(133:0) {#if !mod._ValueScanning }",
    		ctx
    	});

    	return block;
    }

    // (138:0) {#if mod._ValueScanning }
    function create_if_block_3(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = `${main_1('SNPScanStopButtonText')}`;
    			attr_dev(button, "class", "SNPScanStopButton");
    			add_location(button, file, 138, 1, 2812);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*mod*/ ctx[3].InterfaceScanStopButtonDidClick)) /*mod*/ ctx[3].InterfaceScanStopButtonDidClick.apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(138:0) {#if mod._ValueScanning }",
    		ctx
    	});

    	return block;
    }

    // (142:0) {#if OLSK_SPEC_UI() }
    function create_if_block_2(ctx) {
    	let button0;
    	let t0;
    	let button1;
    	let t1;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button0 = element("button");
    			t0 = space();
    			button1 = element("button");
    			t1 = space();
    			button2 = element("button");
    			attr_dev(button0, "id", "TestMessageReadErrorButton");
    			add_location(button0, file, 143, 0, 2977);
    			attr_dev(button1, "id", "TestMessageReadDidParseButton");
    			add_location(button1, file, 144, 0, 3133);
    			attr_dev(button2, "id", "TestMessageParseErrorButton");
    			add_location(button2, file, 145, 0, 3280);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[5], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[6], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[7], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(142:0) {#if OLSK_SPEC_UI() }",
    		ctx
    	});

    	return block;
    }

    // (150:0) {#if mod._ValueReadError }
    function create_if_block_1(ctx) {
    	let div;
    	let t_value = main_1$1(main_1('SNPScanReadErrorTextFormat'), /*mod*/ ctx[3]._ValueReadError) + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(t_value);
    			attr_dev(div, "class", "SNPScanReadError");
    			add_location(div, file, 151, 0, 3476);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*mod*/ 8 && t_value !== (t_value = main_1$1(main_1('SNPScanReadErrorTextFormat'), /*mod*/ ctx[3]._ValueReadError) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(150:0) {#if mod._ValueReadError }",
    		ctx
    	});

    	return block;
    }

    // (156:0) {#if mod._ValueParseError }
    function create_if_block(ctx) {
    	let div;
    	let t_value = main_1$1(main_1('SNPScanParseErrorTextFormat'), /*mod*/ ctx[3]._ValueParseError) + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(t_value);
    			attr_dev(div, "class", "SNPScanParseError");
    			add_location(div, file, 157, 0, 3634);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*mod*/ 8 && t_value !== (t_value = main_1$1(main_1('SNPScanParseErrorTextFormat'), /*mod*/ ctx[3]._ValueParseError) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(156:0) {#if mod._ValueParseError }",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let t2;
    	let show_if = main_1$2();
    	let t3;
    	let t4;
    	let if_block0 = !/*mod*/ ctx[3]._ValueScanning && create_if_block_4(ctx);
    	let if_block1 = /*mod*/ ctx[3]._ValueScanning && create_if_block_3(ctx);
    	let if_block2 = show_if && create_if_block_2(ctx);
    	let if_block3 = /*mod*/ ctx[3]._ValueReadError && create_if_block_1(ctx);
    	let if_block4 = /*mod*/ ctx[3]._ValueParseError && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			t3 = space();
    			if (if_block3) if_block3.c();
    			t4 = space();
    			if (if_block4) if_block4.c();
    			attr_dev(div0, "class", "SNPScanReader");
    			attr_dev(div0, "id", "SNPScanReader");
    			set_style(div0, "width", "300px");
    			add_location(div0, file, 130, 0, 2426);
    			attr_dev(div1, "class", "SNPScan");
    			add_location(div1, file, 128, 0, 2403);
    		},
    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append_dev(div1, t2);
    			if (if_block2) if_block2.m(div1, null);
    			append_dev(div1, t3);
    			if (if_block3) if_block3.m(div1, null);
    			append_dev(div1, t4);
    			if (if_block4) if_block4.m(div1, null);
    		},
    		p: function update(ctx, [dirty]) {
    			if (!/*mod*/ ctx[3]._ValueScanning) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*mod*/ ctx[3]._ValueScanning) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (show_if) if_block2.p(ctx, dirty);

    			if (/*mod*/ ctx[3]._ValueReadError) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block_1(ctx);
    					if_block3.c();
    					if_block3.m(div1, t4);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (/*mod*/ ctx[3]._ValueParseError) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);
    				} else {
    					if_block4 = create_if_block(ctx);
    					if_block4.c();
    					if_block4.m(div1, null);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPScanDidSucceed } = $$props;
    	let { DebugFakeReadErrorMessage = '' } = $$props;
    	let { DebugFakeParseContent = '' } = $$props;
    	let { DebugFakeParseErrorMessage = '' } = $$props;

    	const mod = {
    		// VALUE
    		_ValueScanning: false,
    		// INTERFACE
    		InterfaceScanStartButtonDidClick() {
    			mod.CommandScanStart();
    		},
    		InterfaceScanStopButtonDidClick() {
    			mod.CommandScanStop();
    		},
    		InterfaceFileInputDidChange(event) {
    			if (event.target.files.length == 0) {
    				return;
    			}

    			mod.CommandScanFile(event.target.files[0]);
    		},
    		// COMMAND
    		CommandScanStart() {
    			$$invalidate(3, mod._ValueScanning = true, mod);

    			if (main_1$2()) {
    				return;
    			}

    			Html5Qrcode.getCameras().then(function (devices) {
    				if (!devices || !devices.length) {
    					return mod.MessageReadError(main_1('SNPGenerateReadErrorNoCamerasText'));
    				}

    				return mod._ValueScanReader.start({ facingMode: 'environment' }, {}, mod.MessageReadDidParse).catch(mod.MessageParseError);
    			}).catch(mod.MessageReadError);
    		},
    		async CommandScanStop() {
    			$$invalidate(3, mod._ValueScanning = false, mod);

    			if (main_1$2()) {
    				return;
    			}

    			if (mod._ValueScanReader.isScanning) {
    				await mod._ValueScanReader.stop();
    			}

    			mod._ValueScanReader.clear();
    		},
    		CommandScanFile(imageFile) {
    			mod._ValueScanReader.scanFile(imageFile, true).then(mod.MessageReadDidParse).catch(mod.MessageParseError);
    		},
    		// MESSAGE
    		MessageReadError(error) {
    			$$invalidate(3, mod._ValueReadError = error.message, mod);
    		},
    		MessageReadDidParse(decodedText, decodedResult) {
    			SNPScanDidSucceed(SNPDocument.SNPDocumentExplode(decodedText));

    			if (main_1$2()) {
    				return;
    			}

    			mod.CommandScanStop();
    		},
    		MessageParseError(error) {
    			$$invalidate(3, mod._ValueParseError = error.message, mod);

    			if (main_1$2()) {
    				return;
    			}

    			mod._ValueScanReader.clear();
    		},
    		// SETUP
    		SetupEverything() {
    			if (main_1$2()) {
    				return;
    			}

    			$$invalidate(3, mod._ValueScanReader = new Html5Qrcode('SNPScanReader'), mod);
    		},
    		// LIFECYCLE
    		LifecycleModuleDidLoad() {
    			mod.SetupEverything();
    		},
    		LifecycleModuleDidDestroy() {
    			mod.CommandScanStop();
    		}
    	};

    	onMount(mod.LifecycleModuleDidLoad);
    	onDestroy(mod.LifecycleModuleDidDestroy);

    	$$self.$$.on_mount.push(function () {
    		if (SNPScanDidSucceed === undefined && !('SNPScanDidSucceed' in $$props || $$self.$$.bound[$$self.$$.props['SNPScanDidSucceed']])) {
    			console.warn("<Main> was created without expected prop 'SNPScanDidSucceed'");
    		}
    	});

    	const writable_props = [
    		'SNPScanDidSucceed',
    		'DebugFakeReadErrorMessage',
    		'DebugFakeParseContent',
    		'DebugFakeParseErrorMessage'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => mod.MessageReadError(new Error(DebugFakeReadErrorMessage || Math.random().toString()));
    	const click_handler_1 = () => mod.MessageReadDidParse(DebugFakeParseContent || Math.random().toString());
    	const click_handler_2 = () => mod.MessageParseError(new Error(DebugFakeParseErrorMessage || Math.random().toString()));

    	$$self.$$set = $$props => {
    		if ('SNPScanDidSucceed' in $$props) $$invalidate(4, SNPScanDidSucceed = $$props.SNPScanDidSucceed);
    		if ('DebugFakeReadErrorMessage' in $$props) $$invalidate(0, DebugFakeReadErrorMessage = $$props.DebugFakeReadErrorMessage);
    		if ('DebugFakeParseContent' in $$props) $$invalidate(1, DebugFakeParseContent = $$props.DebugFakeParseContent);
    		if ('DebugFakeParseErrorMessage' in $$props) $$invalidate(2, DebugFakeParseErrorMessage = $$props.DebugFakeParseErrorMessage);
    	};

    	$$self.$capture_state = () => ({
    		SNPScanDidSucceed,
    		DebugFakeReadErrorMessage,
    		DebugFakeParseContent,
    		DebugFakeParseErrorMessage,
    		OLSKLocalized: main_1,
    		OLSKFormatted: main_1$1,
    		OLSK_SPEC_UI: main_1$2,
    		SNPDocument,
    		mod,
    		onMount,
    		onDestroy
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPScanDidSucceed' in $$props) $$invalidate(4, SNPScanDidSucceed = $$props.SNPScanDidSucceed);
    		if ('DebugFakeReadErrorMessage' in $$props) $$invalidate(0, DebugFakeReadErrorMessage = $$props.DebugFakeReadErrorMessage);
    		if ('DebugFakeParseContent' in $$props) $$invalidate(1, DebugFakeParseContent = $$props.DebugFakeParseContent);
    		if ('DebugFakeParseErrorMessage' in $$props) $$invalidate(2, DebugFakeParseErrorMessage = $$props.DebugFakeParseErrorMessage);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		DebugFakeReadErrorMessage,
    		DebugFakeParseContent,
    		DebugFakeParseErrorMessage,
    		mod,
    		SNPScanDidSucceed,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class Main extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			SNPScanDidSucceed: 4,
    			DebugFakeReadErrorMessage: 0,
    			DebugFakeParseContent: 1,
    			DebugFakeParseErrorMessage: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get SNPScanDidSucceed() {
    		throw new Error_1("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPScanDidSucceed(value) {
    		throw new Error_1("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugFakeReadErrorMessage() {
    		throw new Error_1("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugFakeReadErrorMessage(value) {
    		throw new Error_1("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugFakeParseContent() {
    		throw new Error_1("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugFakeParseContent(value) {
    		throw new Error_1("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugFakeParseErrorMessage() {
    		throw new Error_1("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugFakeParseErrorMessage(value) {
    		throw new Error_1("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const mod$1 = {

    	SNPFormBaseChildClass (inputData) {
    		if (!SNPDocument.SNPDocumentTypes().includes(inputData)) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return {
    			[SNPDocument.SNPDocumentTypeNote()]: 'SNPFormNote',
    			[SNPDocument.SNPDocumentTypeSite()]: 'SNPFormSite',
    			[SNPDocument.SNPDocumentTypeEmail()]: 'SNPFormEmail',
    			[SNPDocument.SNPDocumentTypePhone()]: 'SNPFormPhone',
    			[SNPDocument.SNPDocumentTypeContact()]: 'SNPFormContact',
    			[SNPDocument.SNPDocumentTypeWifi()]: 'SNPFormWifi',
    		}[inputData];
    	},

    };

    /* os-app/sub-base/submodules/SNPFormNote/main.svelte generated by Svelte v3.59.2 */
    const file$1 = "os-app/sub-base/submodules/SNPFormNote/main.svelte";

    function create_fragment$1(ctx) {
    	let div;
    	let p;
    	let textarea;
    	let textarea_placeholder_value;
    	let textarea_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			textarea = element("textarea");
    			attr_dev(textarea, "class", "SNPFormNoteField SNPFormDataField svelte-y886rk");
    			attr_dev(textarea, "type", "text");
    			textarea.required = true;
    			textarea.autofocus = true;
    			attr_dev(textarea, "placeholder", textarea_placeholder_value = main_1('SNPFormNoteFieldText'));
    			textarea.value = textarea_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentData || '';
    			add_location(textarea, file$1, 26, 1, 432);
    			add_location(p, file$1, 25, 0, 427);
    			attr_dev(div, "class", "SNPFormNote");
    			add_location(div, file$1, 23, 0, 400);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p);
    			append_dev(p, textarea);
    			textarea.focus();

    			if (!mounted) {
    				dispose = listen_dev(textarea, "input", /*mod*/ ctx[1].InterfaceFieldDidFill, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*SNPFormObject*/ 1 && textarea_value_value !== (textarea_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentData || '')) {
    				prop_dev(textarea, "value", textarea_value_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceFieldDidFill() {
    			const item = { SNPDocumentData: this.value.trim() };
    			SNPFormDidFill(item);

    			item.SNPDocumentData
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLocalized: main_1,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [SNPFormObject, mod, SNPFormDidFill, SNPFormNotValid, SNPFormValid];
    }

    class Main$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			SNPFormObject: 0,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* os-app/sub-base/submodules/SNPFormSite/main.svelte generated by Svelte v3.59.2 */
    const file$2 = "os-app/sub-base/submodules/SNPFormSite/main.svelte";

    function create_fragment$2(ctx) {
    	let div;
    	let p;
    	let input;
    	let input_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			input = element("input");
    			attr_dev(input, "class", "SNPFormSiteField SNPFormDataField");
    			attr_dev(input, "type", "url");
    			input.required = true;
    			input.autofocus = true;
    			attr_dev(input, "placeholder", "https://example.com");
    			input.value = input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentData || '';
    			add_location(input, file$2, 28, 1, 490);
    			add_location(p, file$2, 27, 0, 485);
    			attr_dev(div, "class", "SNPFormSite");
    			add_location(div, file$2, 25, 0, 458);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p);
    			append_dev(p, input);
    			input.focus();

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*mod*/ ctx[1].InterfaceFieldDidFill, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*SNPFormObject*/ 1 && input_value_value !== (input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentData || '') && input.value !== input_value_value) {
    				prop_dev(input, "value", input_value_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceFieldDidFill() {
    			const item = { SNPDocumentData: this.value.trim() };
    			SNPFormDidFill(item);

    			main$5.OLSKLinkValid(item.SNPDocumentData)
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLink: main$5,
    		OLSKLocalized: main_1,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [SNPFormObject, mod, SNPFormDidFill, SNPFormNotValid, SNPFormValid];
    }

    class Main$2 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			SNPFormObject: 0,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const mod$2 = {

    	SNPFormEmailDocument (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		if (typeof inputData.SNPDocumentEmail !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return Object.assign(inputData, {
    			SNPDocumentData: 'mailto:' + inputData.SNPDocumentEmail,
    		});
    	},

    };

    /* os-app/sub-base/submodules/SNPFormEmail/main.svelte generated by Svelte v3.59.2 */
    const file$3 = "os-app/sub-base/submodules/SNPFormEmail/main.svelte";

    function create_fragment$3(ctx) {
    	let div;
    	let p;
    	let input;
    	let input_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			input = element("input");
    			attr_dev(input, "class", "SNPFormEmailField SNPFormDataField");
    			attr_dev(input, "type", "email");
    			input.required = true;
    			input.autofocus = true;
    			attr_dev(input, "placeholder", "hello@example.com");
    			input.value = input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentEmail || '';
    			add_location(input, file$3, 30, 1, 602);
    			add_location(p, file$3, 29, 0, 597);
    			attr_dev(div, "class", "SNPFormEmail");
    			add_location(div, file$3, 27, 0, 569);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p);
    			append_dev(p, input);
    			input.focus();

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*mod*/ ctx[1].InterfaceFieldDidFill, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*SNPFormObject*/ 1 && input_value_value !== (input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentEmail || '') && input.value !== input_value_value) {
    				prop_dev(input, "value", input_value_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceFieldDidFill() {
    			const SNPDocumentEmail = this.value.trim();
    			const item = mod$2.SNPFormEmailDocument({ SNPDocumentEmail });
    			SNPFormDidFill(item);

    			main$5.OLSKEmailValid(SNPDocumentEmail)
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLocalized: main_1,
    		OLSKLink: main$5,
    		SNPFormEmailLogic: mod$2,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [SNPFormObject, mod, SNPFormDidFill, SNPFormNotValid, SNPFormValid];
    }

    class Main$3 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			SNPFormObject: 0,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const mod$3 = {

    	SNPFormPhoneDocument (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		if (typeof inputData.SNPDocumentPhone !== 'string') {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return Object.assign(inputData, {
    			SNPDocumentData: 'tel:' + inputData.SNPDocumentPhone,
    		});
    	},

    };

    /* os-app/sub-base/submodules/SNPFormPhone/main.svelte generated by Svelte v3.59.2 */
    const file$4 = "os-app/sub-base/submodules/SNPFormPhone/main.svelte";

    function create_fragment$4(ctx) {
    	let div;
    	let p;
    	let input;
    	let input_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			input = element("input");
    			attr_dev(input, "class", "SNPFormPhoneField SNPFormDataField");
    			attr_dev(input, "type", "tel");
    			input.required = true;
    			input.autofocus = true;
    			attr_dev(input, "placeholder", "+1-234-567-890");
    			input.value = input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentPhone || '';
    			add_location(input, file$4, 29, 1, 557);
    			add_location(p, file$4, 28, 0, 552);
    			attr_dev(div, "class", "SNPFormPhone");
    			add_location(div, file$4, 26, 0, 524);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p);
    			append_dev(p, input);
    			input.focus();

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*mod*/ ctx[1].InterfaceFieldDidFill, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*SNPFormObject*/ 1 && input_value_value !== (input_value_value = /*SNPFormObject*/ ctx[0].SNPDocumentPhone || '') && input.value !== input_value_value) {
    				prop_dev(input, "value", input_value_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceFieldDidFill() {
    			const SNPDocumentPhone = this.value.trim();
    			const item = mod$3.SNPFormPhoneDocument({ SNPDocumentPhone });
    			SNPFormDidFill(item);

    			item.SNPDocumentPhone.length
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLocalized: main_1,
    		SNPFormPhoneLogic: mod$3,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(0, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [SNPFormObject, mod, SNPFormDidFill, SNPFormNotValid, SNPFormValid];
    }

    class Main$4 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			SNPFormObject: 0,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var vCardFormatter = createCommonjsModule(function (module) {

    /**
     * vCard formatter for formatting vCards in VCF format
     */
    (function vCardFormatter() {
    	var majorVersion = '3';

    	/**
    	 * Encode string
    	 * @param  {String}     value to encode
    	 * @return {String}     encoded string
    	 */
    	function e(value) {
    		if (value) {
    			if (typeof(value) !== 'string') {
    				value = '' + value;
    			}
    			return value.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    		}
    		return '';
    	}

    	/**
    	 * Return new line characters
    	 * @return {String} new line characters
    	 */
    	function nl() {
    		return '\r\n';
    	}

    	/**
    	 * Get formatted photo
    	 * @param  {String} photoType       Photo type (PHOTO, LOGO)
    	 * @param  {String} url             URL to attach photo from
    	 * @param  {String} mediaType       Media-type of photo (JPEG, PNG, GIF)
    	 * @return {String}                 Formatted photo
    	 */
    	function getFormattedPhoto(photoType, url, mediaType, base64) {

    		var params;

    		if (majorVersion >= 4) {
    			params = base64 ? ';ENCODING=b;MEDIATYPE=image/' : ';MEDIATYPE=image/';
    		} else if (majorVersion === 3) {
    			params = base64 ? ';ENCODING=b;TYPE=' : ';TYPE=';
    		} else {
    			params = base64 ? ';ENCODING=BASE64;' : ';';
    		}

    		var formattedPhoto = photoType + params + mediaType + ':' + e(url) + nl();
    		return formattedPhoto;
    	}

    	/**
    	 * Get formatted address
    	 * @param  {object}         address
    	 * @param  {object}         encoding prefix
    	 * @return {String}         Formatted address
    	 */
    	function getFormattedAddress(encodingPrefix, address) {

    		var formattedAddress = '';

    		if (address.details.label ||
    			address.details.street ||
    			address.details.city ||
    			address.details.stateProvince ||
    			address.details.postalCode ||
    			address.details.countryRegion) {

    			if (majorVersion >= 4) {
    				formattedAddress = 'ADR' + encodingPrefix + ';TYPE=' + address.type +
    					(address.details.label ? ';LABEL="' + e(address.details.label) + '"' : '') + ':;;' +
    					e(address.details.street) + ';' +
    					e(address.details.city) + ';' +
    					e(address.details.stateProvince) + ';' +
    					e(address.details.postalCode) + ';' +
    					e(address.details.countryRegion) + nl();
    			} else {
    				if (address.details.label) {
    					formattedAddress = 'LABEL' + encodingPrefix + ';TYPE=' + address.type + ':' + e(address.details.label) + nl();
    				}
    				formattedAddress += 'ADR' + encodingPrefix + ';TYPE=' + address.type + ':;;' +
    					e(address.details.street) + ';' +
    					e(address.details.city) + ';' +
    					e(address.details.stateProvince) + ';' +
    					e(address.details.postalCode) + ';' +
    					e(address.details.countryRegion) + nl();

    			}
    		}

    		return formattedAddress;
    	}

    	/**
    	 * Convert date to YYYYMMDD format
    	 * @param  {Date}       date to encode
    	 * @return {String}     encoded date
    	 */
    	function YYYYMMDD(date) {
    		return date.getFullYear() + ('0' + (date.getMonth()+1)).slice(-2) + ('0' + date.getDate()).slice(-2);
    	}

    	module.exports = {

    		/**
    		 * Get formatted vCard in VCF format
    		 * @param  {object}     vCard object
    		 * @return {String}     Formatted vCard in VCF format
    		 */
    		getFormattedString: function(vCard) {

    			majorVersion = vCard.getMajorVersion();

    			var formattedVCardString = '';
    			formattedVCardString += 'BEGIN:VCARD' + nl();
    			formattedVCardString += 'VERSION:' + vCard.version + nl();

    			var encodingPrefix = majorVersion >= 4 ? '' : ';CHARSET=UTF-8';
    			var formattedName = vCard.formattedName;

    			if (!formattedName) {
    				formattedName = '';

    				[vCard.firstName, vCard.middleName, vCard.lastName]
    					.forEach(function(name) {
    						if (name) {
    							if (formattedName) {
    								formattedName += ' ';
    							}
    						}
    						formattedName += name;
    					});
    			}

    			formattedVCardString += 'FN' + encodingPrefix + ':' + e(formattedName) + nl();
    			formattedVCardString += 'N' + encodingPrefix + ':' +
    				e(vCard.lastName) + ';' +
    				e(vCard.firstName) + ';' +
    				e(vCard.middleName) + ';' +
    				e(vCard.namePrefix) + ';' +
    				e(vCard.nameSuffix) + nl();

    			if (vCard.nickname && majorVersion >= 3) {
    				formattedVCardString += 'NICKNAME' + encodingPrefix + ':' + e(vCard.nickname) + nl();
    			}

    			if (vCard.gender) {
    				formattedVCardString += 'GENDER:' + e(vCard.gender) + nl();
    			}

    			if (vCard.uid) {
    				formattedVCardString += 'UID' + encodingPrefix + ':' + e(vCard.uid) + nl();
    			}

    			if (vCard.birthday) {
    				formattedVCardString += 'BDAY:' + YYYYMMDD(vCard.birthday) + nl();
    			}

    			if (vCard.anniversary) {
    				formattedVCardString += 'ANNIVERSARY:' + YYYYMMDD(vCard.anniversary) + nl();
    			}

    			if (vCard.email) {
    				if(!Array.isArray(vCard.email)){
    					vCard.email = [vCard.email];
    				}
    				vCard.email.forEach(
    					function(address) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=HOME:' + e(address) + nl();
    						} else if (majorVersion >= 3 && majorVersion < 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=HOME,INTERNET:' + e(address) + nl();
    						} else {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';HOME;INTERNET:' + e(address) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.workEmail) {
    				if(!Array.isArray(vCard.workEmail)){
    					vCard.workEmail = [vCard.workEmail];
    				}
    				vCard.workEmail.forEach(
    					function(address) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=WORK:' + e(address) + nl();
    						} else if (majorVersion >= 3 && majorVersion < 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=WORK,INTERNET:' + e(address) + nl();
    						} else {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';WORK;INTERNET:' + e(address) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.otherEmail) {
    				if(!Array.isArray(vCard.otherEmail)){
    					vCard.otherEmail = [vCard.otherEmail];
    				}
    				vCard.otherEmail.forEach(
    					function(address) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=OTHER:' + e(address) + nl();
    						} else if (majorVersion >= 3 && majorVersion < 4) {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';type=OTHER,INTERNET:' + e(address) + nl();
    						} else {
    							formattedVCardString += 'EMAIL' + encodingPrefix + ';OTHER;INTERNET:' + e(address) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.logo.url) {
    				formattedVCardString += getFormattedPhoto('LOGO', vCard.logo.url, vCard.logo.mediaType, vCard.logo.base64);
    			}

    			if (vCard.photo.url) {
    				formattedVCardString += getFormattedPhoto('PHOTO', vCard.photo.url, vCard.photo.mediaType, vCard.photo.base64);
    			}

    			if (vCard.cellPhone) {
    				if(!Array.isArray(vCard.cellPhone)){
    					vCard.cellPhone = [vCard.cellPhone];
    				}
    				vCard.cellPhone.forEach(
    					function(number){
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="voice,cell":tel:' + e(number) + nl();
    						} else {
    							formattedVCardString += 'TEL;TYPE=CELL:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.pagerPhone) {
    				if(!Array.isArray(vCard.pagerPhone)){
    					vCard.pagerPhone = [vCard.pagerPhone];
    				}
    				vCard.pagerPhone.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="pager,cell":tel:' + e(number) + nl();
    						} else {
    							formattedVCardString += 'TEL;TYPE=PAGER:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.homePhone) {
    				if(!Array.isArray(vCard.homePhone)){
    					vCard.homePhone = [vCard.homePhone];
    				}
    				vCard.homePhone.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="voice,home":tel:' + e(number) + nl();
    						} else {
    							formattedVCardString += 'TEL;TYPE=HOME,VOICE:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.workPhone) {
    				if(!Array.isArray(vCard.workPhone)){
    					vCard.workPhone = [vCard.workPhone];
    				}
    				vCard.workPhone.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="voice,work":tel:' + e(number) + nl();

    						} else {
    							formattedVCardString += 'TEL;TYPE=WORK,VOICE:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.homeFax) {
    				if(!Array.isArray(vCard.homeFax)){
    					vCard.homeFax = [vCard.homeFax];
    				}
    				vCard.homeFax.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="fax,home":tel:' + e(number) + nl();

    						} else {
    							formattedVCardString += 'TEL;TYPE=HOME,FAX:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.workFax) {
    				if(!Array.isArray(vCard.workFax)){
    					vCard.workFax = [vCard.workFax];
    				}
    				vCard.workFax.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="fax,work":tel:' + e(number) + nl();

    						} else {
    							formattedVCardString += 'TEL;TYPE=WORK,FAX:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			if (vCard.otherPhone) {
    				if(!Array.isArray(vCard.otherPhone)){
    					vCard.otherPhone = [vCard.otherPhone];
    				}
    				vCard.otherPhone.forEach(
    					function(number) {
    						if (majorVersion >= 4) {
    							formattedVCardString += 'TEL;VALUE=uri;TYPE="voice,other":tel:' + e(number) + nl();

    						} else {
    							formattedVCardString += 'TEL;TYPE=OTHER:' + e(number) + nl();
    						}
    					}
    				);
    			}

    			[{
    				details: vCard.homeAddress,
    				type: 'HOME'
    			}, {
    				details: vCard.workAddress,
    				type: 'WORK'
    			}].forEach(
    				function(address) {
    					formattedVCardString += getFormattedAddress(encodingPrefix, address);
    				}
    			);

    			if (vCard.title) {
    				formattedVCardString += 'TITLE' + encodingPrefix + ':' + e(vCard.title) + nl();
    			}

    			if (vCard.role) {
    				formattedVCardString += 'ROLE' + encodingPrefix + ':' + e(vCard.role) + nl();
    			}

    			if (vCard.organization) {
    				formattedVCardString += 'ORG' + encodingPrefix + ':' + e(vCard.organization) + nl();
    			}

    			if (vCard.url) {
    				formattedVCardString += 'URL' + encodingPrefix + ':' + e(vCard.url) + nl();
    			}

    			if (vCard.workUrl) {
    				formattedVCardString += 'URL;type=WORK' + encodingPrefix + ':' + e(vCard.workUrl) + nl();
    			}

    			if (vCard.note) {
    				formattedVCardString += 'NOTE' + encodingPrefix + ':' + e(vCard.note) + nl();
    			}

    			if (vCard.socialUrls) {
    				for (var key in vCard.socialUrls) {
    					if (vCard.socialUrls.hasOwnProperty(key) &&
    						vCard.socialUrls[key]) {
    						formattedVCardString += 'X-SOCIALPROFILE' + encodingPrefix + ';TYPE=' + key + ':' + e(vCard.socialUrls[key]) + nl();
    					}
    				}
    			}

    			if (vCard.source) {
    				formattedVCardString += 'SOURCE' + encodingPrefix + ':' + e(vCard.source) + nl();
    			}

    			formattedVCardString += 'REV:' + (new Date()).toISOString() + nl();
    			
    			if (vCard.isOrganization) {
    				formattedVCardString += 'X-ABShowAs:COMPANY' + nl();
    			} 
    			
    			formattedVCardString += 'END:VCARD' + nl();
    			return formattedVCardString;
    		}
    	};
    })();
    });
    var vCardFormatter_1 = vCardFormatter.getFormattedString;

    /**
     * Represents a contact that can be imported into Outlook, iOS, Mac OS, Android devices, and more
     */
    var vCard = (function () {
        /**
         * Get photo object for storing photos in vCards
         */
        function getPhoto() {
            return {
                url: '',
                mediaType: '',
                base64: false,

                /**
                 * Attach a photo from a URL
                 * @param  {string} url       URL where photo can be found
                 * @param  {string} mediaType Media type of photo (JPEG, PNG, GIF)
                 */
                attachFromUrl: function(url, mediaType) {
                    this.url = url;
                    this.mediaType = mediaType;
                    this.base64 = false;
                },

                /**
                 * Embed a photo from a file using base-64 encoding (not implemented yet)
                 * @param  {string} filename
                 */
                embedFromFile: function(fileLocation) {
                  var fs   = _require_('fs');
                  var path = _require_('path');
                  this.mediaType = path.extname(fileLocation).toUpperCase().replace(/\./g, "");
                  var imgData = fs.readFileSync(fileLocation);
                  this.url = imgData.toString('base64');
                  this.base64 = true;
                },

                /**
                 * Embed a photo from a base-64 string
                 * @param  {string} base64String
                 */
                embedFromString: function(base64String, mediaType) {
                  this.mediaType = mediaType;
                  this.url = base64String;
                  this.base64 = true;
                }
            };
        }

        /**
         * Get a mailing address to attach to a vCard.
         */
        function getMailingAddress() {
            return {
                /**
                 * Represents the actual text that should be put on the mailing label when delivering a physical package
                 * @type {String}
                 */
                label: '',

                /**
                 * Street address
                 * @type {String}
                 */
                street: '',

                /**
                 * City
                 * @type {String}
                 */
                city: '',

                /**
                 * State or province
                 * @type {String}
                 */
                stateProvince: '',

                /**
                 * Postal code
                 * @type {String}
                 */
                postalCode: '',

                /**
                 * Country or region
                 * @type {String}
                 */
                countryRegion: ''
            };
        }

        /**
         * Get social media URLs
         * @return {object} Social media URL hash group
         */
        function getSocialUrls() {
            return {
                'facebook': '',
                'linkedIn': '',
                'twitter': '',
                'flickr': ''
            };
        }

        /********************************************************************************
         * Public interface for vCard
         ********************************************************************************/
        return {

            /**
             * Specifies a value that represents a persistent, globally unique identifier associated with the vCard
             * @type {String}
             */
            uid: '',

            /**
             * Date of birth
             * @type {Datetime}
             */
            birthday: '',

            /**
             * Cell phone number
             * @type {String}
             */
            cellPhone: '',

            /**
             * Other cell phone number or pager
             * @type {String}
             */
            pagerPhone: '',

            /**
             * The address for private electronic mail communication
             * @type {String}
             */
            email: '',

            /**
             * The address for work-related electronic mail communication
             * @type {String}
             */
            workEmail: '',

            /**
             * First name
             * @type {String}
             */
            firstName: '',

            /**
             * Formatted name string associated with the vCard object (will automatically populate if not set)
             * @type {String}
             */
            formattedName: '',

            /**
             * Gender.
             * @type {String} Must be M or F for Male or Female
             */
            gender: '',

            /**
             * Home mailing address
             * @type {object}
             */
            homeAddress: getMailingAddress(),

            /**
             * Home phone
             * @type {String}
             */
            homePhone: '',

            /**
             * Home facsimile
             * @type {String}
             */
            homeFax: '',

            /**
             * Last name
             * @type {String}
             */
            lastName: '',

            /**
             * Logo
             * @type {object}
             */
            logo: getPhoto(),

            /**
             * Middle name
             * @type {String}
             */
            middleName: '',

            /**
             * Prefix for individual's name
             * @type {String}
             */
            namePrefix: '',

            /**
             * Suffix for individual's name
             * @type {String}
             */
            nameSuffix: '',

            /**
             * Nickname of individual
             * @type {String}
             */
            nickname: '',

            /**
             * Specifies supplemental information or a comment that is associated with the vCard
             * @type {String}
             */
            note: '',

            /**
             * The name and optionally the unit(s) of the organization associated with the vCard object
             * @type {String}
             */
            organization: '',

            /**
             * Individual's photo
             * @type {object}
             */
            photo: getPhoto(),

            /**
             * The role, occupation, or business category of the vCard object within an organization
             * @type {String}
             */
            role: '',

            /**
             * Social URLs attached to the vCard object (ex: Facebook, Twitter, LinkedIn)
             * @type {String}
             */
            socialUrls: getSocialUrls(),

            /**
             * A URL that can be used to get the latest version of this vCard
             * @type {String}
             */
            source: '',

            /**
             * Specifies the job title, functional position or function of the individual within an organization
             * @type {String}
             */
            title: '',

            /**
             * URL pointing to a website that represents the person in some way
             * @type {String}
             */
            url: '',

            /**
             * URL pointing to a website that represents the person's work in some way
             * @type {String}
             */
            workUrl: '',

            /**
             * Work mailing address
             * @type {object}
             */
            workAddress: getMailingAddress(),

            /**
             * Work phone
             * @type {String}
             */
            workPhone: '',

            /**
             * Work facsimile
             * @type {String}
             */
            workFax: '',

            /**
             * vCard version
             * @type {String}
             */
            version: '3.0',

            /**
             * Get major version of the vCard format
             * @return {integer}
             */
            getMajorVersion: function() {
                var majorVersionString = this.version ? this.version.split('.')[0] : '4';
                if (!isNaN(majorVersionString)) {
                    return parseInt(majorVersionString);
                }
                return 4;
            },

            /**
             * Get formatted vCard
             * @return {String} Formatted vCard in VCF format
             */
            getFormattedString: function() {
                var vCardFormatter$1 = vCardFormatter;
                return vCardFormatter$1.getFormattedString(this);
            },

            /**
             * Save formatted vCard to file
             * @param  {String} filename
             */
            saveToFile: function(filename) {
                var vCardFormatter$1 = vCardFormatter;
                var contents = vCardFormatter$1.getFormattedString(this);

                var fs = _require_('fs');
                fs.writeFileSync(filename, contents, { encoding: 'utf8' });
            }
        };
    });

    var vcardsJs = vCard;

    const mod$4 = {

    	SNPFormContactDocument (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return Object.assign(inputData, {
    			SNPDocumentData: Object.assign(vcardsJs(), Object.fromEntries(Object.entries(inputData).map(function ([key, value]) {
    				return [{
    					SNPDocumentContactFirstName: 'firstName',
    					SNPDocumentContactLastName: 'lastName',
    					SNPDocumentContactPhone: 'cellPhone',
    					SNPDocumentContactEmail: 'email',
    					SNPDocumentContactSite: 'url',
    					SNPDocumentContactOrganization: 'organization',
    				}[key], value];
    			}))).getFormattedString(),
    		});
    	},

    };

    /* os-app/sub-base/submodules/SNPFormContact/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1 } = globals;
    const file$5 = "os-app/sub-base/submodules/SNPFormContact/main.svelte";

    function create_fragment$5(ctx) {
    	let div;
    	let p0;
    	let input0;
    	let input0_placeholder_value;
    	let input0_value_value;
    	let t0;
    	let p1;
    	let input1;
    	let input1_placeholder_value;
    	let input1_value_value;
    	let t1;
    	let p2;
    	let input2;
    	let input2_placeholder_value;
    	let input2_value_value;
    	let t2;
    	let p3;
    	let input3;
    	let input3_placeholder_value;
    	let input3_value_value;
    	let t3;
    	let p4;
    	let input4;
    	let input4_placeholder_value;
    	let input4_value_value;
    	let t4;
    	let p5;
    	let input5;
    	let input5_placeholder_value;
    	let input5_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p0 = element("p");
    			input0 = element("input");
    			t0 = space();
    			p1 = element("p");
    			input1 = element("input");
    			t1 = space();
    			p2 = element("p");
    			input2 = element("input");
    			t2 = space();
    			p3 = element("p");
    			input3 = element("input");
    			t3 = space();
    			p4 = element("p");
    			input4 = element("input");
    			t4 = space();
    			p5 = element("p");
    			input5 = element("input");
    			attr_dev(input0, "class", "SNPFormContactFirstNameField SNPFormDataField");
    			attr_dev(input0, "type", "text");
    			input0.autofocus = true;
    			attr_dev(input0, "placeholder", input0_placeholder_value = main_1('SNPFormContactFirstNameFieldText'));
    			input0.value = input0_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactFirstName || '';
    			add_location(input0, file$5, 74, 1, 1544);
    			add_location(p0, file$5, 73, 0, 1539);
    			attr_dev(input1, "class", "SNPFormContactLastNameField");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "placeholder", input1_placeholder_value = main_1('SNPFormContactLastNameFieldText'));
    			input1.value = input1_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactLastName || '';
    			add_location(input1, file$5, 78, 1, 1815);
    			add_location(p1, file$5, 77, 0, 1810);
    			attr_dev(input2, "class", "SNPFormContactPhoneField");
    			attr_dev(input2, "type", "tel");
    			attr_dev(input2, "placeholder", input2_placeholder_value = main_1('SNPFormContactPhoneFieldText'));
    			input2.value = input2_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactPhone || '';
    			add_location(input2, file$5, 82, 1, 2055);
    			add_location(p2, file$5, 81, 0, 2050);
    			attr_dev(input3, "class", "SNPFormContactEmailField");
    			attr_dev(input3, "type", "email");
    			attr_dev(input3, "placeholder", input3_placeholder_value = main_1('SNPFormContactEmailFieldText'));
    			input3.value = input3_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactEmail || '';
    			add_location(input3, file$5, 86, 1, 2282);
    			add_location(p3, file$5, 85, 0, 2277);
    			attr_dev(input4, "class", "SNPFormContactSiteField");
    			attr_dev(input4, "type", "url");
    			attr_dev(input4, "placeholder", input4_placeholder_value = main_1('SNPFormContactSiteFieldText'));
    			input4.value = input4_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactSite || '';
    			add_location(input4, file$5, 90, 1, 2511);
    			add_location(p4, file$5, 89, 0, 2506);
    			attr_dev(input5, "class", "SNPFormContactOrganizationField");
    			attr_dev(input5, "type", "text");
    			attr_dev(input5, "placeholder", input5_placeholder_value = main_1('SNPFormContactOrganizationFieldText'));
    			input5.value = input5_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactOrganization || '';
    			add_location(input5, file$5, 94, 1, 2734);
    			add_location(p5, file$5, 93, 0, 2729);
    			attr_dev(div, "class", "SNPFormContact");
    			add_location(div, file$5, 71, 0, 1509);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p0);
    			append_dev(p0, input0);
    			append_dev(div, t0);
    			append_dev(div, p1);
    			append_dev(p1, input1);
    			append_dev(div, t1);
    			append_dev(div, p2);
    			append_dev(p2, input2);
    			append_dev(div, t2);
    			append_dev(div, p3);
    			append_dev(p3, input3);
    			append_dev(div, t3);
    			append_dev(div, p4);
    			append_dev(p4, input4);
    			append_dev(div, t4);
    			append_dev(div, p5);
    			append_dev(p5, input5);
    			input0.focus();

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						input0,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceFirstNameFieldDidInput)) /*mod*/ ctx[0].InterfaceFirstNameFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input1,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceLastNameFieldDidInput)) /*mod*/ ctx[0].InterfaceLastNameFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input2,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfacePhoneFieldDidInput)) /*mod*/ ctx[0].InterfacePhoneFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input3,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceEmailFieldDidInput)) /*mod*/ ctx[0].InterfaceEmailFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input4,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceSiteFieldDidInput)) /*mod*/ ctx[0].InterfaceSiteFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						input5,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceOrganizationFieldDidInput)) /*mod*/ ctx[0].InterfaceOrganizationFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*mod*/ 1 && input0_value_value !== (input0_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactFirstName || '') && input0.value !== input0_value_value) {
    				prop_dev(input0, "value", input0_value_value);
    			}

    			if (dirty & /*mod*/ 1 && input1_value_value !== (input1_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactLastName || '') && input1.value !== input1_value_value) {
    				prop_dev(input1, "value", input1_value_value);
    			}

    			if (dirty & /*mod*/ 1 && input2_value_value !== (input2_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactPhone || '') && input2.value !== input2_value_value) {
    				prop_dev(input2, "value", input2_value_value);
    			}

    			if (dirty & /*mod*/ 1 && input3_value_value !== (input3_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactEmail || '') && input3.value !== input3_value_value) {
    				prop_dev(input3, "value", input3_value_value);
    			}

    			if (dirty & /*mod*/ 1 && input4_value_value !== (input4_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactSite || '') && input4.value !== input4_value_value) {
    				prop_dev(input4, "value", input4_value_value);
    			}

    			if (dirty & /*mod*/ 1 && input5_value_value !== (input5_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentContactOrganization || '') && input5.value !== input5_value_value) {
    				prop_dev(input5, "value", input5_value_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// VALUE
    		_ValueObject: Object.assign({}, SNPFormObject),
    		ValueSet(key, value) {
    			$$invalidate(0, mod._ValueObject[key] = value, mod);
    		},
    		// INTERFACE
    		InterfaceFirstNameFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactFirstName', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfaceLastNameFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactLastName', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfacePhoneFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactPhone', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfaceEmailFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactEmail', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfaceSiteFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactSite', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfaceOrganizationFieldDidInput() {
    			mod.ValueSet('SNPDocumentContactOrganization', this.value);
    			mod._MessageInputDidChange();
    		},
    		// MESSAGE
    		_MessageInputDidChange() {
    			const item = mod$4.SNPFormContactDocument(mod._ValueObject);
    			SNPFormDidFill(item);

    			SNPDocument.SNPDocumentValidateContact(item.SNPDocumentData)
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(1, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLocalized: main_1,
    		SNPFormContactLogic: mod$4,
    		SNPDocument,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(1, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [mod, SNPFormObject, SNPFormDidFill, SNPFormNotValid, SNPFormValid];
    }

    class Main$5 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			SNPFormObject: 1,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const mod$5 = {

    	SNPFormWifiDocument (inputData) {
    		if (typeof inputData !== 'object' || inputData === null) {
    			throw new Error('SNPErrorInputNotValid');
    		}

    		return Object.assign(inputData, {
    			SNPDocumentData: `WIFI:T:${ inputData.SNPDocumentWifiSecurity || 'WPA' };S:${ inputData.SNPDocumentWifiNetwork || '' };P:${ inputData.SNPDocumentWifiPassword || '' };H:${ inputData.SNPDocumentWifiHidden ? true : ''  };;`,
    		});
    	},

    };

    /* os-app/sub-base/submodules/SNPFormWifi/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$1 } = globals;
    const file$6 = "os-app/sub-base/submodules/SNPFormWifi/main.svelte";

    // (62:0) {#if mod._ValueObject.SNPDocumentWifiSecurity !== 'nopass' }
    function create_if_block$1(ctx) {
    	let p;
    	let input;
    	let input_placeholder_value;
    	let input_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			p = element("p");
    			input = element("input");
    			attr_dev(input, "class", "SNPFormWifiPasswordField");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", input_placeholder_value = main_1('SNPFormWifiPasswordFieldText'));
    			input.value = input_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiPassword || '';
    			add_location(input, file$6, 64, 1, 1485);
    			add_location(p, file$6, 63, 0, 1480);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, input);

    			if (!mounted) {
    				dispose = listen_dev(
    					input,
    					"input",
    					function () {
    						if (is_function(/*mod*/ ctx[0].InterfacePasswordFieldDidInput)) /*mod*/ ctx[0].InterfacePasswordFieldDidInput.apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*mod*/ 1 && input_value_value !== (input_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiPassword || '') && input.value !== input_value_value) {
    				prop_dev(input, "value", input_value_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(62:0) {#if mod._ValueObject.SNPDocumentWifiSecurity !== 'nopass' }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div;
    	let p0;
    	let input0;
    	let input0_placeholder_value;
    	let input0_value_value;
    	let t0;
    	let t1;
    	let p1;
    	let label0;
    	let input1;
    	let t2;
    	let t3_value = main_1('SNPFormWifiSecurityNoneOptionText') + "";
    	let t3;
    	let t4;
    	let label1;
    	let input2;
    	let t5;
    	let t6;
    	let label2;
    	let input3;
    	let t7;
    	let binding_group;
    	let mounted;
    	let dispose;
    	let if_block = /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity !== 'nopass' && create_if_block$1(ctx);
    	binding_group = init_binding_group(/*$$binding_groups*/ ctx[6][0]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			p0 = element("p");
    			input0 = element("input");
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			p1 = element("p");
    			label0 = element("label");
    			input1 = element("input");
    			t2 = space();
    			t3 = text(t3_value);
    			t4 = space();
    			label1 = element("label");
    			input2 = element("input");
    			t5 = text("\n\t\tWPA");
    			t6 = space();
    			label2 = element("label");
    			input3 = element("input");
    			t7 = text("\n\t\tWEP");
    			attr_dev(input0, "class", "SNPFormWifiNetworkField SNPFormDataField");
    			attr_dev(input0, "type", "text");
    			input0.required = true;
    			input0.autofocus = true;
    			attr_dev(input0, "placeholder", input0_placeholder_value = main_1('SNPFormWifiNetworkFieldText'));
    			input0.value = input0_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiNetwork || '';
    			add_location(input0, file$6, 58, 1, 1159);
    			add_location(p0, file$6, 57, 0, 1154);
    			attr_dev(input1, "class", "SNPFormWifiSecurityNoneOptionField");
    			attr_dev(input1, "type", "radio");
    			input1.__value = "nopass";
    			input1.value = input1.__value;
    			add_location(input1, file$6, 71, 2, 1771);
    			attr_dev(label0, "class", "SNPFormWifiSecurityNoneOption");
    			add_location(label0, file$6, 70, 1, 1723);
    			attr_dev(input2, "class", "SNPFormWifiSecurityWPAOptionField");
    			attr_dev(input2, "type", "radio");
    			input2.__value = "WPA";
    			input2.value = input2.__value;
    			add_location(input2, file$6, 76, 2, 2076);
    			attr_dev(label1, "class", "SNPFormWifiSecurityWPAOption");
    			add_location(label1, file$6, 75, 1, 2029);
    			attr_dev(input3, "class", "SNPFormWifiSecurityWEPOptionField");
    			attr_dev(input3, "type", "radio");
    			input3.__value = "WEP";
    			input3.value = input3.__value;
    			add_location(input3, file$6, 81, 2, 2326);
    			attr_dev(label2, "class", "SNPFormWifiSecurityWEPOption");
    			add_location(label2, file$6, 80, 1, 2279);
    			add_location(p1, file$6, 69, 0, 1718);
    			attr_dev(div, "class", "SNPFormWifi");
    			add_location(div, file$6, 55, 0, 1127);
    			binding_group.p(input1, input2, input3);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p0);
    			append_dev(p0, input0);
    			append_dev(div, t0);
    			if (if_block) if_block.m(div, null);
    			append_dev(div, t1);
    			append_dev(div, p1);
    			append_dev(p1, label0);
    			append_dev(label0, input1);
    			input1.checked = input1.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			append_dev(label0, t2);
    			append_dev(label0, t3);
    			append_dev(p1, t4);
    			append_dev(p1, label1);
    			append_dev(label1, input2);
    			input2.checked = input2.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			append_dev(label1, t5);
    			append_dev(p1, t6);
    			append_dev(p1, label2);
    			append_dev(label2, input3);
    			input3.checked = input3.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			append_dev(label2, t7);
    			input0.focus();

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						input0,
    						"input",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceNetworkFieldDidInput)) /*mod*/ ctx[0].InterfaceNetworkFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[5]),
    					listen_dev(
    						input1,
    						"change",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceSecurityFieldDidInput)) /*mod*/ ctx[0].InterfaceSecurityFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(input2, "change", /*input2_change_handler*/ ctx[7]),
    					listen_dev(
    						input2,
    						"change",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceSecurityFieldDidInput)) /*mod*/ ctx[0].InterfaceSecurityFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(input3, "change", /*input3_change_handler*/ ctx[8]),
    					listen_dev(
    						input3,
    						"change",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceSecurityFieldDidInput)) /*mod*/ ctx[0].InterfaceSecurityFieldDidInput.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*mod*/ 1 && input0_value_value !== (input0_value_value = /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiNetwork || '') && input0.value !== input0_value_value) {
    				prop_dev(input0, "value", input0_value_value);
    			}

    			if (/*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity !== 'nopass') {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(div, t1);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*mod*/ 1) {
    				input1.checked = input1.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			}

    			if (dirty & /*mod*/ 1) {
    				input2.checked = input2.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			}

    			if (dirty & /*mod*/ 1) {
    				input3.checked = input3.__value === /*mod*/ ctx[0]._ValueObject.SNPDocumentWifiSecurity;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			binding_group.r();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormObject = {} } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;

    	const mod = {
    		// VALUE
    		_ValueObject: Object.assign({ SNPDocumentWifiSecurity: 'WPA' }, SNPFormObject),
    		ValueSet(key, value) {
    			$$invalidate(0, mod._ValueObject[key] = value, mod);
    		},
    		// INTERFACE
    		InterfaceNetworkFieldDidInput() {
    			mod.ValueSet('SNPDocumentWifiNetwork', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfacePasswordFieldDidInput() {
    			mod.ValueSet('SNPDocumentWifiPassword', this.value);
    			mod._MessageInputDidChange();
    		},
    		InterfaceSecurityFieldDidInput() {
    			mod.ValueSet('SNPDocumentWifiSecurity', this.value);
    			mod._MessageInputDidChange();
    		},
    		// MESSAGE
    		_MessageInputDidChange() {
    			const item = mod$5.SNPFormWifiDocument(mod._ValueObject);
    			SNPFormDidFill(item);

    			SNPDocument.SNPDocumentValidateWifi(item.SNPDocumentData)
    			? SNPFormValid(item)
    			: SNPFormNotValid();
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}
    	});

    	const writable_props = ['SNPFormObject', 'SNPFormDidFill', 'SNPFormNotValid', 'SNPFormValid'];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input1_change_handler() {
    		mod._ValueObject.SNPDocumentWifiSecurity = this.__value;
    		$$invalidate(0, mod);
    	}

    	function input2_change_handler() {
    		mod._ValueObject.SNPDocumentWifiSecurity = this.__value;
    		$$invalidate(0, mod);
    	}

    	function input3_change_handler() {
    		mod._ValueObject.SNPDocumentWifiSecurity = this.__value;
    		$$invalidate(0, mod);
    	}

    	$$self.$$set = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(1, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		OLSKLocalized: main_1,
    		SNPFormWifiLogic: mod$5,
    		SNPDocument,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormObject' in $$props) $$invalidate(1, SNPFormObject = $$props.SNPFormObject);
    		if ('SNPFormDidFill' in $$props) $$invalidate(2, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormNotValid' in $$props) $$invalidate(3, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(4, SNPFormValid = $$props.SNPFormValid);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		mod,
    		SNPFormObject,
    		SNPFormDidFill,
    		SNPFormNotValid,
    		SNPFormValid,
    		input1_change_handler,
    		$$binding_groups,
    		input2_change_handler,
    		input3_change_handler
    	];
    }

    class Main$6 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			SNPFormObject: 1,
    			SNPFormDidFill: 2,
    			SNPFormNotValid: 3,
    			SNPFormValid: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get SNPFormObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* os-app/sub-base/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$2 } = globals;
    const file$7 = "os-app/sub-base/main.svelte";

    // (66:0) {#if mod._ValueChildClass === 'SNPFormNote' }
    function create_if_block_6(ctx) {
    	let snpformnote;
    	let current;

    	snpformnote = new Main$1({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformnote.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformnote, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformnote_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformnote_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformnote_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformnote_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformnote_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformnote.$set(snpformnote_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformnote.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformnote.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformnote, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(66:0) {#if mod._ValueChildClass === 'SNPFormNote' }",
    		ctx
    	});

    	return block;
    }

    // (70:0) {#if mod._ValueChildClass === 'SNPFormSite' }
    function create_if_block_5(ctx) {
    	let snpformsite;
    	let current;

    	snpformsite = new Main$2({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformsite.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformsite, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformsite_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformsite_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformsite_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformsite_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformsite_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformsite.$set(snpformsite_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformsite.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformsite.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformsite, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(70:0) {#if mod._ValueChildClass === 'SNPFormSite' }",
    		ctx
    	});

    	return block;
    }

    // (74:0) {#if mod._ValueChildClass === 'SNPFormEmail' }
    function create_if_block_4$1(ctx) {
    	let snpformemail;
    	let current;

    	snpformemail = new Main$3({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformemail.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformemail, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformemail_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformemail_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformemail_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformemail_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformemail_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformemail.$set(snpformemail_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformemail.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformemail.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformemail, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4$1.name,
    		type: "if",
    		source: "(74:0) {#if mod._ValueChildClass === 'SNPFormEmail' }",
    		ctx
    	});

    	return block;
    }

    // (78:0) {#if mod._ValueChildClass === 'SNPFormPhone' }
    function create_if_block_3$1(ctx) {
    	let snpformphone;
    	let current;

    	snpformphone = new Main$4({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformphone.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformphone, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformphone_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformphone_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformphone_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformphone_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformphone_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformphone.$set(snpformphone_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformphone.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformphone.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformphone, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(78:0) {#if mod._ValueChildClass === 'SNPFormPhone' }",
    		ctx
    	});

    	return block;
    }

    // (82:0) {#if mod._ValueChildClass === 'SNPFormContact' }
    function create_if_block_2$1(ctx) {
    	let snpformcontact;
    	let current;

    	snpformcontact = new Main$5({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformcontact.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformcontact, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformcontact_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformcontact_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformcontact_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformcontact_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformcontact_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformcontact.$set(snpformcontact_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformcontact.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformcontact.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformcontact, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(82:0) {#if mod._ValueChildClass === 'SNPFormContact' }",
    		ctx
    	});

    	return block;
    }

    // (86:0) {#if mod._ValueChildClass === 'SNPFormWifi' }
    function create_if_block_1$1(ctx) {
    	let snpformwifi;
    	let current;

    	snpformwifi = new Main$6({
    			props: {
    				SNPFormDidFill: /*SNPFormDidFill*/ ctx[1],
    				SNPFormNotValid: /*mod*/ ctx[3].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[3].SNPFormValid,
    				SNPFormObject: /*SNPFormBaseObject*/ ctx[0]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpformwifi.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformwifi, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformwifi_changes = {};
    			if (dirty & /*SNPFormDidFill*/ 2) snpformwifi_changes.SNPFormDidFill = /*SNPFormDidFill*/ ctx[1];
    			if (dirty & /*mod*/ 8) snpformwifi_changes.SNPFormNotValid = /*mod*/ ctx[3].SNPFormNotValid;
    			if (dirty & /*mod*/ 8) snpformwifi_changes.SNPFormValid = /*mod*/ ctx[3].SNPFormValid;
    			if (dirty & /*SNPFormBaseObject*/ 1) snpformwifi_changes.SNPFormObject = /*SNPFormBaseObject*/ ctx[0];
    			snpformwifi.$set(snpformwifi_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformwifi.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformwifi.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformwifi, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(86:0) {#if mod._ValueChildClass === 'SNPFormWifi' }",
    		ctx
    	});

    	return block;
    }

    // (90:0) {#if SNPFormDidSubmit }
    function create_if_block$2(ctx) {
    	let p;
    	let button;
    	let t_value = main_1('SNPFormBaseSaveButtonText') + "";
    	let t;
    	let button_disabled_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			p = element("p");
    			button = element("button");
    			t = text(t_value);
    			attr_dev(button, "class", "SNPFormBaseSaveButton");
    			button.disabled = button_disabled_value = /*mod*/ ctx[3].SNPFormBaseSaveButtonDisabled;
    			add_location(button, file$7, 91, 1, 2789);
    			add_location(p, file$7, 90, 0, 2784);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, button);
    			append_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*mod*/ ctx[3].InterfaceSaveButtonDidClick)) /*mod*/ ctx[3].InterfaceSaveButtonDidClick.apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*mod*/ 8 && button_disabled_value !== (button_disabled_value = /*mod*/ ctx[3].SNPFormBaseSaveButtonDisabled)) {
    				prop_dev(button, "disabled", button_disabled_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(90:0) {#if SNPFormDidSubmit }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let current;
    	let if_block0 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormNote' && create_if_block_6(ctx);
    	let if_block1 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormSite' && create_if_block_5(ctx);
    	let if_block2 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormEmail' && create_if_block_4$1(ctx);
    	let if_block3 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormPhone' && create_if_block_3$1(ctx);
    	let if_block4 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormContact' && create_if_block_2$1(ctx);
    	let if_block5 = /*mod*/ ctx[3]._ValueChildClass === 'SNPFormWifi' && create_if_block_1$1(ctx);
    	let if_block6 = /*SNPFormDidSubmit*/ ctx[2] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			t3 = space();
    			if (if_block4) if_block4.c();
    			t4 = space();
    			if (if_block5) if_block5.c();
    			t5 = space();
    			if (if_block6) if_block6.c();
    			attr_dev(div, "class", "SNPFormBase OLSKDecor OLSKDecorBigForm");
    			add_location(div, file$7, 63, 0, 1412);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append_dev(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			append_dev(div, t2);
    			if (if_block3) if_block3.m(div, null);
    			append_dev(div, t3);
    			if (if_block4) if_block4.m(div, null);
    			append_dev(div, t4);
    			if (if_block5) if_block5.m(div, null);
    			append_dev(div, t5);
    			if (if_block6) if_block6.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormNote') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_6(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormSite') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_5(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormEmail') {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_4$1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, t2);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormPhone') {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_3$1(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div, t3);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormContact') {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_2$1(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div, t4);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (/*mod*/ ctx[3]._ValueChildClass === 'SNPFormWifi') {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_1$1(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(div, t5);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*SNPFormDidSubmit*/ ctx[2]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);
    				} else {
    					if_block6 = create_if_block$2(ctx);
    					if_block6.c();
    					if_block6.m(div, null);
    				}
    			} else if (if_block6) {
    				if_block6.d(1);
    				if_block6 = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(if_block5);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(if_block5);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormBaseObject } = $$props;
    	let { SNPFormNotValid } = $$props;
    	let { SNPFormValid } = $$props;
    	let { SNPFormDidFill } = $$props;
    	let { SNPFormDidSubmit = null } = $$props;
    	let { SNPFormBaseSaveButtonDisabled = true } = $$props;
    	const modPublic = {};

    	const mod = {
    		SNPFormBaseSaveButtonDisabled,
    		// INTERFACE
    		InterfaceSaveButtonDidClick() {
    			SNPFormDidSubmit(Object.assign(SNPFormBaseObject, mod._ValueChildObject));
    		},
    		// MESSAGE
    		SNPFormNotValid() {
    			delete mod._ValueChildObject;
    			$$invalidate(3, mod.SNPFormBaseSaveButtonDisabled = true, mod);
    			SNPFormNotValid();
    		},
    		SNPFormValid(inputData) {
    			$$invalidate(3, mod._ValueChildObject = inputData, mod);
    			$$invalidate(3, mod.SNPFormBaseSaveButtonDisabled = false, mod);
    			SNPFormValid(inputData);
    		},
    		// REACT
    		ReactType(inputData) {
    			$$invalidate(3, mod._ValueChildClass = mod$1.SNPFormBaseChildClass(inputData), mod);
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPFormBaseObject === undefined && !('SNPFormBaseObject' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormBaseObject']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormBaseObject'");
    		}

    		if (SNPFormNotValid === undefined && !('SNPFormNotValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormNotValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormNotValid'");
    		}

    		if (SNPFormValid === undefined && !('SNPFormValid' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormValid']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormValid'");
    		}

    		if (SNPFormDidFill === undefined && !('SNPFormDidFill' in $$props || $$self.$$.bound[$$self.$$.props['SNPFormDidFill']])) {
    			console.warn("<Main> was created without expected prop 'SNPFormDidFill'");
    		}
    	});

    	const writable_props = [
    		'SNPFormBaseObject',
    		'SNPFormNotValid',
    		'SNPFormValid',
    		'SNPFormDidFill',
    		'SNPFormDidSubmit',
    		'SNPFormBaseSaveButtonDisabled'
    	];

    	Object_1$2.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormBaseObject' in $$props) $$invalidate(0, SNPFormBaseObject = $$props.SNPFormBaseObject);
    		if ('SNPFormNotValid' in $$props) $$invalidate(4, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(5, SNPFormValid = $$props.SNPFormValid);
    		if ('SNPFormDidFill' in $$props) $$invalidate(1, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormDidSubmit' in $$props) $$invalidate(2, SNPFormDidSubmit = $$props.SNPFormDidSubmit);
    		if ('SNPFormBaseSaveButtonDisabled' in $$props) $$invalidate(6, SNPFormBaseSaveButtonDisabled = $$props.SNPFormBaseSaveButtonDisabled);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormBaseObject,
    		SNPFormNotValid,
    		SNPFormValid,
    		SNPFormDidFill,
    		SNPFormDidSubmit,
    		SNPFormBaseSaveButtonDisabled,
    		modPublic,
    		OLSKLocalized: main_1,
    		SNPFormBaseLogic: mod$1,
    		mod,
    		SNPFormNote: Main$1,
    		SNPFormSite: Main$2,
    		SNPFormEmail: Main$3,
    		SNPFormPhone: Main$4,
    		SNPFormContact: Main$5,
    		SNPFormWifi: Main$6
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormBaseObject' in $$props) $$invalidate(0, SNPFormBaseObject = $$props.SNPFormBaseObject);
    		if ('SNPFormNotValid' in $$props) $$invalidate(4, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(5, SNPFormValid = $$props.SNPFormValid);
    		if ('SNPFormDidFill' in $$props) $$invalidate(1, SNPFormDidFill = $$props.SNPFormDidFill);
    		if ('SNPFormDidSubmit' in $$props) $$invalidate(2, SNPFormDidSubmit = $$props.SNPFormDidSubmit);
    		if ('SNPFormBaseSaveButtonDisabled' in $$props) $$invalidate(6, SNPFormBaseSaveButtonDisabled = $$props.SNPFormBaseSaveButtonDisabled);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*mod, SNPFormBaseObject*/ 9) {
    			$: {
    				mod.ReactType(SNPFormBaseObject.SNPDocumentType);
    			}
    		}
    	};

    	return [
    		SNPFormBaseObject,
    		SNPFormDidFill,
    		SNPFormDidSubmit,
    		mod,
    		SNPFormNotValid,
    		SNPFormValid,
    		SNPFormBaseSaveButtonDisabled,
    		modPublic
    	];
    }

    class Main$7 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			SNPFormBaseObject: 0,
    			SNPFormNotValid: 4,
    			SNPFormValid: 5,
    			SNPFormDidFill: 1,
    			SNPFormDidSubmit: 2,
    			SNPFormBaseSaveButtonDisabled: 6,
    			modPublic: 7
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get SNPFormBaseObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormBaseObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidFill() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidFill(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidSubmit() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidSubmit(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormBaseSaveButtonDisabled() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormBaseSaveButtonDisabled(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get modPublic() {
    		return this.$$.ctx[7];
    	}

    	set modPublic(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var kjua_min = createCommonjsModule(function (module, exports) {
    /*! kjua v0.9.0 - https://larsjung.de/kjua/ */
    !function(t,r){module.exports=r();}("undefined"!=typeof self?self:commonjsGlobal,function(){return n={},o.m=e=[function(t,r,e){function n(t){var r=Object.assign({},o,t),e=i(r.text,r.ecLevel,r.minVersion,r.quiet);return "svg"===r.render?u(e,r):a(e,r,"image"===r.render)}var o=e(1),i=e(2),a=e(4),u=e(8);t.exports=n;try{jQuery.fn.kjua=function(e){return this.each(function(t,r){return r.appendChild(n(e))})};}catch(t){}},function(t,r){t.exports={render:"image",crisp:!0,minVersion:1,ecLevel:"L",size:200,ratio:null,fill:"#333",back:"#fff",text:"no text",rounded:0,quiet:0,mode:"plain",mSize:30,mPosX:50,mPosY:50,label:"no label",fontname:"sans",fontcolor:"#333",image:null};},function(t,r,e){function u(t){return (u="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t})(t)}var f=/code length overflow/i,c=e(3);c.stringToBytes=c.stringToBytesFuncs["UTF-8"];t.exports=function(t,r,e,n){var o,i=3<arguments.length&&void 0!==n?n:0,a=function(t,r,e){for(var n=2<arguments.length&&void 0!==e?e:1,o=n=Math.max(1,n);o<=40;o+=1)try{var i=function(){var e=c(o,r);e.addData(t),e.make();var n=e.getModuleCount();return {v:{text:t,level:r,version:o,module_count:n,is_dark:function(t,r){return 0<=t&&t<n&&0<=r&&r<n&&e.isDark(t,r)}}}}();if("object"===u(i))return i.v}catch(t){if(!(o<40&&f.test(t)))throw new Error(t)}return null}(0<arguments.length&&void 0!==t?t:"",1<arguments.length&&void 0!==r?r:"L",2<arguments.length&&void 0!==e?e:1);return a&&(o=a.is_dark,a.module_count+=2*i,a.is_dark=function(t,r){return o(t-i,r-i)}),a};},function(t,r,e){var n,o,i,a=function(){function i(t,r){function a(t,r){l=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null;}return r}(s=4*u+17),e(0,0),e(s-7,0),e(0,s-7),i(),o(),d(t,r),7<=u&&g(t),null==n&&(n=p(u,f,c)),v(n,r);}var u=t,f=w[r],l=null,s=0,n=null,c=[],h={},e=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||s<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||s<=r+n||(l[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4);},o=function(){for(var t=8;t<s-8;t+=1)null==l[t][6]&&(l[t][6]=t%2==0);for(var r=8;r<s-8;r+=1)null==l[6][r]&&(l[6][r]=r%2==0);},i=function(){for(var t=m.getPatternPosition(u),r=0;r<t.length;r+=1)for(var e=0;e<t.length;e+=1){var n=t[r],o=t[e];if(null==l[n][o])for(var i=-2;i<=2;i+=1)for(var a=-2;a<=2;a+=1)l[n+i][o+a]=-2==i||2==i||-2==a||2==a||0==i&&0==a;}},g=function(t){for(var r=m.getBCHTypeNumber(u),e=0;e<18;e+=1){var n=!t&&1==(r>>e&1);l[Math.floor(e/3)][e%3+s-8-3]=n;}for(e=0;e<18;e+=1){n=!t&&1==(r>>e&1);l[e%3+s-8-3][Math.floor(e/3)]=n;}},d=function(t,r){for(var e=f<<3|r,n=m.getBCHTypeInfo(e),o=0;o<15;o+=1){var i=!t&&1==(n>>o&1);o<6?l[o][8]=i:o<8?l[o+1][8]=i:l[s-15+o][8]=i;}for(o=0;o<15;o+=1){i=!t&&1==(n>>o&1);o<8?l[8][s-o-1]=i:o<9?l[8][15-o-1+1]=i:l[8][15-o-1]=i;}l[s-8][8]=!t;},v=function(t,r){for(var e=-1,n=s-1,o=7,i=0,a=m.getMaskFunction(r),u=s-1;0<u;u-=2)for(6==u&&--u;;){for(var f,c=0;c<2;c+=1){null==l[n][u-c]&&(f=!1,i<t.length&&(f=1==(t[i]>>>o&1)),a(n,u-c)&&(f=!f),l[n][u-c]=f,-1==--o&&(i+=1,o=7));}if((n+=e)<0||s<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=S.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),m.getLengthInBits(a.getMode(),t)),a.write(o);}for(var u=0,i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f,n=Math.max(n,f),o=Math.max(o,c);i[u]=new Array(f);for(var l=0;l<i[u].length;l+=1)i[u][l]=255&t.getBuffer()[l+e];e+=f;var s=m.getErrorCorrectPolynomial(c),g=b(i[u],s.getLength()-1).mod(s);a[u]=new Array(s.getLength()-1);for(l=0;l<a[u].length;l+=1){var h=l+g.getLength()-a[u].length;a[u][l]=0<=h?g.getAt(h):0;}}for(var d=0,l=0;l<r.length;l+=1)d+=r[l].totalCount;for(var v=new Array(d),p=0,l=0;l<n;l+=1)for(u=0;u<r.length;u+=1)l<i[u].length&&(v[p]=i[u][l],p+=1);for(l=0;l<o;l+=1)for(u=0;u<r.length;u+=1)l<a[u].length&&(v[p]=a[u][l],p+=1);return v}(o,n)};h.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=A(t);break;case"Alphanumeric":e=L(t);break;case"Byte":e=D(t);break;case"Kanji":e=_(t);break;default:throw"mode:"+r}c.push(e),n=null;},h.isDark=function(t,r){if(t<0||s<=t||r<0||s<=r)throw t+","+r;return l[t][r]},h.getModuleCount=function(){return s},h.make=function(){if(u<1){for(var t=1;t<40;t++){for(var r=S.getRSBlocks(t,f),e=M(),n=0;n<c.length;n++){var o=c[n];e.put(o.getMode(),4),e.put(o.getLength(),m.getLengthInBits(o.getMode(),t)),o.write(e);}for(var i=0,n=0;n<r.length;n++)i+=r[n].dataCount;if(e.getLengthInBits()<=8*i)break}u=t;}a(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){a(!0,e);var n=m.getLostPoint(h);(0==e||n<t)&&(t=n,r=e);}return r}());},h.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<h.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<h.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=h.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>";}return e+="</tbody>",e+="</table>"},h.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,f=h.getModuleCount()*t+2*r,c="",l="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ";for(c+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',c+=o.scalable?"":' width="'+f+'px" height="'+f+'px"',c+=' viewBox="0 0 '+f+" "+f+'" ',c+=' preserveAspectRatio="xMinYMin meet"',c+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",c+=">",c+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",c+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",c+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',c+='<path d="',a=0;a<h.getModuleCount();a+=1)for(u=a*t+r,i=0;i<h.getModuleCount();i+=1)h.isDark(a,i)&&(c+="M"+(i*t+r)+","+u+l);return c+='" stroke="transparent" fill="black"/>',c+="</svg>"},h.createDataURL=function(o,t){o=o||2,t=void 0===t?4*o:t;var r=h.getModuleCount()*o+2*t,i=t,a=r-t;return P(r,r,function(t,r){if(i<=t&&t<a&&i<=r&&r<a){var e=Math.floor((t-i)/o),n=Math.floor((r-i)/o);return h.isDark(n,e)?0:1}return 1})},h.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=h.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=h.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n;}}return r};return h.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;for(var r,e,n,o,i=+h.getModuleCount()+2*t,a=t,u=i-t,f={"██":"█","█ ":"▀"," █":"▄","  ":" "},c={"██":"▀","█ ":"▀"," █":" ","  ":" "},l="",s=0;s<i;s+=2){for(e=Math.floor(s-a),n=Math.floor(s+1-a),r=0;r<i;r+=1)o="█",a<=r&&r<u&&a<=s&&s<u&&h.isDark(e,Math.floor(r-a))&&(o=" "),a<=r&&r<u&&a<=s+1&&s+1<u&&h.isDark(n,Math.floor(r-a))?o+=" ":o+="█",l+=t<1&&u<=s+1?c[o]:f[o];l+="\n";}return i%2&&0<t?l.substring(0,l.length-i-1)+Array(1+i).join("▀"):l.substring(0,l.length-1)}(r);--t,r=void 0===r?2*t:r;for(var e,n,o,i=h.getModuleCount()*t+2*r,a=r,u=i-r,f=Array(t+1).join("██"),c=Array(t+1).join("  "),l="",s="",g=0;g<i;g+=1){for(n=Math.floor((g-a)/t),s="",e=0;e<i;e+=1)o=1,a<=e&&e<u&&a<=g&&g<u&&h.isDark(n,Math.floor((e-a)/t))&&(o=0),s+=o?f:c;for(n=0;n<t;n+=1)l+=s+"\n";}return l.substring(0,l.length-1)},h.renderTo2dContext=function(t,r){r=r||2;for(var e=h.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=h.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r);},h}i.stringToBytes=(i.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n);}return r}}).default,i.createStringToBytes=function(u,f){var i=function(){function t(){var t=r.read();if(-1==t)throw"eof";return t}for(var r=z(u),e=0,n={};;){var o=r.read();if(-1==o)break;var i=t(),a=t()<<8|t();n[String.fromCharCode(o<<8|i)]=a,e+=1;}if(e!=f)throw e+" != "+f;return n}(),a="?".charCodeAt(0);return function(t){for(var r=[],e=0;e<t.length;e+=1){var n,o=t.charCodeAt(e);o<128?r.push(o):"number"==typeof(n=i[t.charAt(e)])?(255&n)==n?r.push(n):(r.push(n>>>8),r.push(255&n)):r.push(a);}return r}};var r,t,a=1,u=2,o=4,f=8,w={L:1,M:0,Q:3,H:2},e=0,n=1,c=2,l=3,s=4,g=5,h=6,d=7,m=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],(t={}).getBCHTypeInfo=function(t){for(var r=t<<10;0<=v(r)-v(1335);)r^=1335<<v(r)-v(1335);return 21522^(t<<10|r)},t.getBCHTypeNumber=function(t){for(var r=t<<12;0<=v(r)-v(7973);)r^=7973<<v(r)-v(7973);return t<<12|r},t.getPatternPosition=function(t){return r[t-1]},t.getMaskFunction=function(t){switch(t){case e:return function(t,r){return (t+r)%2==0};case n:return function(t,r){return t%2==0};case c:return function(t,r){return r%3==0};case l:return function(t,r){return (t+r)%3==0};case s:return function(t,r){return (Math.floor(t/2)+Math.floor(r/3))%2==0};case g:return function(t,r){return t*r%2+t*r%3==0};case h:return function(t,r){return (t*r%2+t*r%3)%2==0};case d:return function(t,r){return (t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},t.getErrorCorrectPolynomial=function(t){for(var r=b([1],0),e=0;e<t;e+=1)r=r.multiply(b([1,p.gexp(e)],0));return r},t.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case o:case f:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case o:return 16;case f:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case o:return 16;case f:return 12;default:throw"mode:"+t}}},t.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);5<i&&(e+=3+i-5);}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3);}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);for(var l=0,o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(l+=1);return e+=Math.abs(100*l/r/r-50)/5*10},t);function v(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r}var p=function(){for(var r=new Array(256),e=new Array(256),t=0;t<8;t+=1)r[t]=1<<t;for(t=8;t<256;t+=1)r[t]=r[t-4]^r[t-5]^r[t-6]^r[t-8];for(t=0;t<255;t+=1)e[r[t]]=t;var n={glog:function(t){if(t<1)throw"glog("+t+")";return e[t]},gexp:function(t){for(;t<0;)t+=255;for(;256<=t;)t-=255;return r[t]}};return n}();function b(n,o){if(void 0===n.length)throw n.length+"/"+o;var r=function(){for(var t=0;t<n.length&&0==n[t];)t+=1;for(var r=new Array(n.length-t+o),e=0;e<n.length-t;e+=1)r[e]=n[e+t];return r}(),i={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var r=new Array(i.getLength()+t.getLength()-1),e=0;e<i.getLength();e+=1)for(var n=0;n<t.getLength();n+=1)r[e+n]^=p.gexp(p.glog(i.getAt(e))+p.glog(t.getAt(n)));return b(r,0)},mod:function(t){if(i.getLength()-t.getLength()<0)return i;for(var r=p.glog(i.getAt(0))-p.glog(t.getAt(0)),e=new Array(i.getLength()),n=0;n<i.getLength();n+=1)e[n]=i.getAt(n);for(n=0;n<t.getLength();n+=1)e[n]^=p.gexp(p.glog(t.getAt(n))+r);return b(e,0).mod(t)}};return i}function y(){var e=[],o={writeByte:function(t){e.push(255&t);},writeShort:function(t){o.writeByte(t),o.writeByte(t>>>8);},writeBytes:function(t,r,e){r=r||0,e=e||t.length;for(var n=0;n<e;n+=1)o.writeByte(t[n+r]);},writeString:function(t){for(var r=0;r<t.length;r+=1)o.writeByte(t.charCodeAt(r));},toByteArray:function(){return e},toString:function(){var t="";t+="[";for(var r=0;r<e.length;r+=1)0<r&&(t+=","),t+=e[r];return t+="]"}};return o}function x(){function e(t){a+=String.fromCharCode(r(63&t));}var n=0,o=0,i=0,a="",t={},r=function(t){if(!(t<0)){if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return t.writeByte=function(t){for(n=n<<8|255&t,o+=8,i+=1;6<=o;)e(n>>>o-6),o-=6;},t.flush=function(){if(0<o&&(e(n<<6-o),o=n=0),i%3!=0)for(var t=3-i%3,r=0;r<t;r+=1)a+="=";},t.toString=function(){return a},t}function k(t,r){var n=t,o=r,d=new Array(t*r),e={setPixel:function(t,r,e){d[r*n+t]=e;},write:function(t){t.writeString("GIF87a"),t.writeShort(n),t.writeShort(o),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(n),t.writeShort(o),t.writeByte(0);var r=i(2);t.writeByte(2);for(var e=0;255<r.length-e;)t.writeByte(255),t.writeBytes(r,e,255),e+=255;t.writeByte(r.length-e),t.writeBytes(r,e,r.length-e),t.writeByte(0),t.writeString(";");}},i=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,o=v(),i=0;i<r;i+=1)o.add(String.fromCharCode(i));o.add(String.fromCharCode(r)),o.add(String.fromCharCode(e));var a,u,f,c=y(),l=(a=c,f=u=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;8<=u+r;)a.writeByte(255&(t<<u|f)),r-=8-u,t>>>=8-u,u=f=0;f|=t<<u,u+=r;},flush:function(){0<u&&a.writeByte(f);}});l.write(r,n);var s=0,g=String.fromCharCode(d[s]);for(s+=1;s<d.length;){var h=String.fromCharCode(d[s]);s+=1,o.contains(g+h)?g+=h:(l.write(o.indexOf(g),n),o.size()<4095&&(o.size()==1<<n&&(n+=1),o.add(g+h)),g=h);}return l.write(o.indexOf(g),n),l.write(e,n),l.flush(),c.toByteArray()},v=function(){var r={},e=0,n={add:function(t){if(n.contains(t))throw"dup key:"+t;r[t]=e,e+=1;},size:function(){return e},indexOf:function(t){return r[t]},contains:function(t){return void 0!==r[t]}};return n};return e}var B,C,S=(B=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],(C={}).getRSBlocks=function(t,r){var e=function(t,r){switch(r){case w.L:return B[4*(t-1)+0];case w.M:return B[4*(t-1)+1];case w.Q:return B[4*(t-1)+2];case w.H:return B[4*(t-1)+3];default:return}}(t,r);if(void 0===e)throw"bad rs block @ typeNumber:"+t+"/errorCorrectionLevel:"+r;for(var n,o,i=e.length/3,a=[],u=0;u<i;u+=1)for(var f=e[3*u+0],c=e[3*u+1],l=e[3*u+2],s=0;s<f;s+=1)a.push((n=l,o=void 0,(o={}).totalCount=c,o.dataCount=n,o));return a},C),M=function(){var e=[],n=0,o={getBuffer:function(){return e},getAt:function(t){var r=Math.floor(t/8);return 1==(e[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e+=1)o.putBit(1==(t>>>r-e-1&1));},getLengthInBits:function(){return n},putBit:function(t){var r=Math.floor(n/8);e.length<=r&&e.push(0),t&&(e[r]|=128>>>n%8),n+=1;}};return o},A=function(t){var r=a,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+2<r.length;)t.put(o(r.substring(e,e+3)),10),e+=3;e<r.length&&(r.length-e==1?t.put(o(r.substring(e,e+1)),4):r.length-e==2&&t.put(o(r.substring(e,e+2)),7));}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return e},L=function(t){var r=u,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+1<r.length;)t.put(45*o(r.charAt(e))+o(r.charAt(e+1)),11),e+=2;e<r.length&&t.put(o(r.charAt(e)),6);}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return e},D=function(t){var r=o,e=i.stringToBytes(t),n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=0;r<e.length;r+=1)t.put(e[r],8);}};return n},_=function(t){var r=f,e=i.stringToBytesFuncs.SJIS;if(!e)throw"sjis not supported.";!function(){var t=e("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=e(t),n={getMode:function(){return r},getLength:function(t){return ~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472;}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2;}if(e<r.length)throw"illegal char at "+(e+1)}};return n},z=function(t){var e=t,n=0,o=0,i=0,r={read:function(){for(;i<8;){if(n>=e.length){if(0==i)return -1;throw"unexpected end of file./"+i}var t=e.charAt(n);if(n+=1,"="==t)return i=0,-1;t.match(/^\s$/)||(o=o<<6|a(t.charCodeAt(0)),i+=6);}var r=o>>>i-8&255;return i-=8,r}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return r},P=function(t,r,e){for(var n=k(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=y();n.write(a);for(var u=x(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return i}();a.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||57344<=n?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n));}return r}(t)},o=[],void 0===(i="function"==typeof(n=function(){return a})?n.apply(r,o):n)||(t.exports=i);},function(t,r,e){function c(t,r,e,n,o,i){t.is_dark(o,i)&&r.rect(i*n,o*n,n,n);}function a(t,r,e){var n,o;n=r,(o=e).back&&(n.fillStyle=o.back,n.fillRect(0,0,o.size,o.size)),function(t,r,e){if(t){var n=0<e.rounded&&e.rounded<=100?l:c,o=t.module_count,i=e.size/o,a=0;e.crisp&&(i=Math.floor(i),a=Math.floor((e.size-i*o)/2)),r.translate(a,a),r.beginPath();for(var u=0;u<o;u+=1)for(var f=0;f<o;f+=1)n(t,r,e,i,u,f);r.fillStyle=e.fill,r.fill(),r.translate(-a,-a);}}(t,r,e),i(r,e);}var u=e(5),l=e(6),i=e(7);t.exports=function(t,r,e){var n=r.ratio||u.dpr,o=u.create_canvas(r.size,n),i=o.getContext("2d");return i.scale(n,n),a(t,i,r),e?u.canvas_to_img(o):o};},function(t,r){function e(t,r){return t.getAttribute(r)}function n(r,e){return Object.keys(e||{}).forEach(function(t){r.setAttribute(t,e[t]);}),r}function o(t,r){return n(a.createElement(t),r)}var i=window,a=i.document,u=i.devicePixelRatio||1,f="http://www.w3.org/2000/svg";t.exports={dpr:u,SVG_NS:f,get_attr:e,create_el:o,create_svg_el:function(t,r){return n(a.createElementNS(f,t),r)},create_canvas:function(t,r){var e=o("canvas",{width:t*r,height:t*r});return e.style.width="".concat(t,"px"),e.style.height="".concat(t,"px"),e},canvas_to_img:function(t){var r=o("img",{crossOrigin:"anonymous",src:t.toDataURL("image/png"),width:e(t,"width"),height:e(t,"height")});return r.style.width=t.style.width,r.style.height=t.style.height,r}};},function(t,r){t.exports=function(t,r,e,n,o,i){var a,u,f,c,l,s,g,h,d,v,p,y,w,m,b,x,k,B,C,S,M=i*n,A=o*n,L=M+n,D=A+n,_=.005*e.rounded*n,z=t.is_dark,P=o-1,T=o+1,j=i-1,I=i+1,O=z(o,i),R=z(P,j),F=z(P,i),H=z(P,I),N=z(o,I),E=z(T,I),Y=z(T,i),q=z(T,j),U=z(o,j),W=(a=r,{m:function(t,r){return a.moveTo(t,r),this},l:function(t,r){return a.lineTo(t,r),this},a:function(){return a.arcTo.apply(a,arguments),this}});O?(p=W,y=M,w=A,m=L,b=D,x=_,B=!F&&!N,C=!Y&&!N,S=!Y&&!U,(k=!F&&!U)?p.m(y+x,w):p.m(y,w),B?p.l(m-x,w).a(m,w,m,b,x):p.l(m,w),C?p.l(m,b-x).a(m,b,y,b,x):p.l(m,b),S?p.l(y+x,b).a(y,b,y,w,x):p.l(y,b),k?p.l(y,w+x).a(y,w,m,w,x):p.l(y,w)):(u=W,f=M,c=A,l=L,s=D,g=_,h=F&&N&&H,d=Y&&N&&E,v=Y&&U&&q,F&&U&&R&&u.m(f+g,c).l(f,c).l(f,c+g).a(f,c,f+g,c,g),h&&u.m(l-g,c).l(l,c).l(l,c+g).a(l,c,l-g,c,g),d&&u.m(l-g,s).l(l,s).l(l,s-g).a(l,s,l-g,s,g),v&&u.m(f+g,s).l(f,s).l(f,s-g).a(f,s,f+g,s,g));};},function(t,r){t.exports=function(t,r){var e,n,o,i,a,u,f,c,l,s,g,h=r.mode;"label"===h?function(t,r){var e=r.size,n="bold "+.01*r.mSize*e+"px "+r.fontname;t.strokeStyle=r.back,t.lineWidth=.01*r.mSize*e*.1,t.fillStyle=r.fontcolor,t.font=n;var o=t.measureText(r.label).width,i=.01*r.mSize,a=(1-o/e)*r.mPosX*.01*e,u=(1-i)*r.mPosY*.01*e+.75*r.mSize*.01*e;t.strokeText(r.label,a,u),t.fillText(r.label,a,u);}(t,r):"image"===h&&(e=t,o=(n=r).size,i=n.image.naturalWidth||1,a=n.image.naturalHeight||1,u=.01*n.mSize,c=(1-(f=u*i/a))*n.mPosX*.01*o,l=(1-u)*n.mPosY*.01*o,s=f*o,g=u*o,e.drawImage(n.image,c,l,s,g));};},function(t,r,y){function J(n){function o(t){return Math.round(10*t)/10}function i(t){return Math.round(10*t)/10+n.o}return {m:function(t,r){return n.p+="M ".concat(i(t)," ").concat(i(r)," "),this},l:function(t,r){return n.p+="L ".concat(i(t)," ").concat(i(r)," "),this},a:function(t,r,e){return n.p+="A ".concat(o(e)," ").concat(o(e)," 0 0 1 ").concat(i(t)," ").concat(i(r)," "),this}}}var e=y(5),w=e.SVG_NS,m=e.get_attr,b=e.create_svg_el;t.exports=function(t,r){var e,n,o,i,a,u,f,c,l,s,g,h,d=r.size,v=r.mode,p=b("svg",{xmlns:w,width:d,height:d,viewBox:"0 0 ".concat(d," ").concat(d)});return p.style.width="".concat(d,"px"),p.style.height="".concat(d,"px"),r.back&&p.appendChild(b("rect",{x:0,y:0,width:d,height:d,fill:r.back})),p.appendChild(b("path",{d:function(t,r){if(!t)return "";var e={p:"",o:0},n=t.module_count,o=r.size/n;r.crisp&&(o=Math.floor(o),e.o=Math.floor((r.size-o*n)/2));for(var i,a,u,f,c,l,s,g,h,d,v,p,y,w,m,b,x,k,B,C,S,M,A,L,D,_,z,P,T,j,I,O,R,F,H,N,E,Y,q,U,W,X,V,G=J(e),Q=0;Q<n;Q+=1)for(var $=0;$<n;$+=1)i=t,a=G,V=X=W=U=q=Y=E=N=H=F=R=O=I=j=T=P=z=_=D=L=A=M=S=C=B=k=x=b=m=w=y=p=v=d=h=g=s=l=void 0,z=(D=(c=$)*(u=o))+u,P=(_=(f=Q)*u)+u,T=.005*r.rounded*u,j=i.is_dark,I=f-1,O=f+1,R=c-1,F=c+1,H=j(f,c),N=j(I,R),E=j(I,c),Y=j(I,F),q=j(f,F),U=j(O,F),W=j(O,c),X=j(O,R),V=j(f,R),H?(m=a,b=D,x=_,k=z,B=P,C=T,M=!E&&!q,A=!W&&!q,L=!W&&!V,(S=!E&&!V)?m.m(b+C,x):m.m(b,x),M?m.l(k-C,x).a(k,x+C,C):m.l(k,x),A?m.l(k,B-C).a(k-C,B,C):m.l(k,B),L?m.l(b+C,B).a(b,B-C,C):m.l(b,B),S?m.l(b,x+C).a(b+C,x,C):m.l(b,x)):(l=a,s=D,g=_,h=z,d=P,v=T,p=E&&q&&Y,y=W&&q&&U,w=W&&V&&X,E&&V&&N&&l.m(s+v,g).l(s,g).l(s,g+v).a(s+v,g,v),p&&l.m(h,g+v).l(h,g).l(h-v,g).a(h,g+v,v),y&&l.m(h-v,d).l(h,d).l(h,d-v).a(h-v,d,v),w&&l.m(s,d-v).l(s,d).l(s+v,d).a(s,d-v,v));return e.p}(t,r),fill:r.fill})),"label"===v?function(t,r){var e=r.size,n="bold "+.01*r.mSize*e+"px "+r.fontname,o=y(5),i=r.ratio||o.dpr,a=o.create_canvas(e,i).getContext("2d");a.strokeStyle=r.back,a.lineWidth=.01*r.mSize*e*.1,a.fillStyle=r.fontcolor,a.font=n;var u=a.measureText(r.label).width,f=.01*r.mSize,c=(1-u/e)*r.mPosX*.01*e,l=(1-f)*r.mPosY*.01*e+.75*r.mSize*.01*e,s=b("text",{x:c,y:l});Object.assign(s.style,{font:n,fill:r.fontcolor,"paint-order":"stroke",stroke:r.back,"stroke-width":a.lineWidth}),s.textContent=r.label,t.appendChild(s);}(p,r):"image"===v&&(e=p,o=(n=r).size,i=n.image.naturalWidth||1,a=n.image.naturalHeight||1,u=.01*n.mSize,c=(1-(f=u*i/a))*n.mPosX*.01*o,l=(1-u)*n.mPosY*.01*o,s=f*o,g=u*o,h=b("image",{href:m(n.image,"src"),x:c,y:l,width:s,height:g}),e.appendChild(h)),p};}],o.c=n,o.d=function(t,r,e){o.o(t,r)||Object.defineProperty(t,r,{enumerable:!0,get:e});},o.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0});},o.t=function(r,t){if(1&t&&(r=o(r)),8&t)return r;if(4&t&&"object"==typeof r&&r&&r.__esModule)return r;var e=Object.create(null);if(o.r(e),Object.defineProperty(e,"default",{enumerable:!0,value:r}),2&t&&"string"!=typeof r)for(var n in r)o.d(e,n,function(t){return r[t]}.bind(null,n));return e},o.n=function(t){var r=t&&t.__esModule?function(){return t.default}:function(){return t};return o.d(r,"a",r),r},o.o=function(t,r){return Object.prototype.hasOwnProperty.call(t,r)},o.p="",o(o.s=0);function o(t){if(n[t])return n[t].exports;var r=n[t]={i:t,l:!1,exports:{}};return e[t].call(r.exports,r,r.exports,o),r.l=!0,r.exports}var e,n;});
    });

    var kjua = unwrapExports(kjua_min);
    var kjua_min_1 = kjua_min.kjua;

    /* os-app/sub-code/main.svelte generated by Svelte v3.59.2 */
    const file$8 = "os-app/sub-code/main.svelte";

    function create_fragment$8(ctx) {
    	let div1;
    	let div0;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			attr_dev(div0, "class", "svelte-14p4bbm");
    			add_location(div0, file$8, 52, 0, 758);
    			attr_dev(div1, "class", "SNPCode svelte-14p4bbm");
    			add_location(div1, file$8, 50, 0, 735);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			/*div0_binding*/ ctx[2](div0);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			/*div0_binding*/ ctx[2](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPCodeObject } = $$props;

    	const mod = {
    		// REACT
    		ReactData() {
    			if (!mod._ValueContainer) {
    				return;
    			}

    			if (main_1$2()) {
    				return;
    			}

    			mod._ValueContainer.childNodes.forEach(function (e) {
    				mod._ValueContainer.removeChild(e);
    			});

    			mod._ValueContainer.appendChild(kjua({
    				render: 'canvas',
    				ecLevel: 'H',
    				size: 150,
    				rounded: 100,
    				quiet: 1,
    				crisp: false,
    				text: SNPCodeObject.SNPDocumentData
    			}));
    		},
    		// LIFECYCLE
    		LifecycleModuleDidMount() {
    			mod.ReactData();
    		}
    	};

    	onMount(mod.LifecycleModuleDidMount);

    	$$self.$$.on_mount.push(function () {
    		if (SNPCodeObject === undefined && !('SNPCodeObject' in $$props || $$self.$$.bound[$$self.$$.props['SNPCodeObject']])) {
    			console.warn("<Main> was created without expected prop 'SNPCodeObject'");
    		}
    	});

    	const writable_props = ['SNPCodeObject'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			mod._ValueContainer = $$value;
    			$$invalidate(0, mod);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('SNPCodeObject' in $$props) $$invalidate(1, SNPCodeObject = $$props.SNPCodeObject);
    	};

    	$$self.$capture_state = () => ({
    		SNPCodeObject,
    		kjua,
    		OLSK_SPEC_UI: main_1$2,
    		mod,
    		onMount
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPCodeObject' in $$props) $$invalidate(1, SNPCodeObject = $$props.SNPCodeObject);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*mod, SNPCodeObject*/ 3) {
    			$: {
    				mod.ReactData(SNPCodeObject.SNPDocumentData);
    			}
    		}
    	};

    	return [mod, SNPCodeObject, div0_binding];
    }

    class Main$8 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { SNPCodeObject: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get SNPCodeObject() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPCodeObject(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* os-app/sub-make/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$3 } = globals;
    const file$9 = "os-app/sub-make/main.svelte";

    // (163:0) {#if mod._ValueScan }
    function create_if_block_3$2(ctx) {
    	let snpscan;
    	let current;

    	snpscan = new Main({
    			props: {
    				SNPScanDidSucceed: /*mod*/ ctx[1].SNPScanDidSucceed
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpscan.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpscan, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpscan_changes = {};
    			if (dirty & /*mod*/ 2) snpscan_changes.SNPScanDidSucceed = /*mod*/ ctx[1].SNPScanDidSucceed;
    			snpscan.$set(snpscan_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpscan.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpscan.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpscan, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$2.name,
    		type: "if",
    		source: "(163:0) {#if mod._ValueScan }",
    		ctx
    	});

    	return block;
    }

    // (169:0) {#if !mod._ValueScan }
    function create_if_block$3(ctx) {
    	let snpformbase;
    	let t0;
    	let t1;
    	let if_block1_anchor;
    	let current;

    	snpformbase = new Main$7({
    			props: {
    				SNPFormBaseObject: /*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateDocument,
    				SNPFormNotValid: /*mod*/ ctx[1].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[1].SNPFormValid,
    				SNPFormDidFill: /*mod*/ ctx[1].SNPFormDidFill,
    				SNPFormDidSubmit: /*SNPFormDidSubmit*/ ctx[0],
    				SNPFormBaseSaveButtonDisabled: /*mod*/ ctx[1].SNPFormBaseSaveButtonDisabled
    			},
    			$$inline: true
    		});

    	let if_block0 = !/*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateValid && create_if_block_2$2(ctx);
    	let if_block1 = /*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateValid && create_if_block_1$2(ctx);

    	const block = {
    		c: function create() {
    			create_component(snpformbase.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpformbase, target, anchor);
    			insert_dev(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpformbase_changes = {};
    			if (dirty & /*mod*/ 2) snpformbase_changes.SNPFormBaseObject = /*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateDocument;
    			if (dirty & /*mod*/ 2) snpformbase_changes.SNPFormNotValid = /*mod*/ ctx[1].SNPFormNotValid;
    			if (dirty & /*mod*/ 2) snpformbase_changes.SNPFormValid = /*mod*/ ctx[1].SNPFormValid;
    			if (dirty & /*mod*/ 2) snpformbase_changes.SNPFormDidFill = /*mod*/ ctx[1].SNPFormDidFill;
    			if (dirty & /*SNPFormDidSubmit*/ 1) snpformbase_changes.SNPFormDidSubmit = /*SNPFormDidSubmit*/ ctx[0];
    			if (dirty & /*mod*/ 2) snpformbase_changes.SNPFormBaseSaveButtonDisabled = /*mod*/ ctx[1].SNPFormBaseSaveButtonDisabled;
    			snpformbase.$set(snpformbase_changes);

    			if (!/*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateValid) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_2$2(ctx);
    					if_block0.c();
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateValid) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*mod*/ 2) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpformbase.$$.fragment, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpformbase.$$.fragment, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpformbase, detaching);
    			if (detaching) detach_dev(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(169:0) {#if !mod._ValueScan }",
    		ctx
    	});

    	return block;
    }

    // (173:1) {#if !mod._ValueStateMap[mod._ValueType].SNPMakeStateValid }
    function create_if_block_2$2(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "SNPMakeDataNotValid svelte-1fx1yo4");
    			add_location(div, file$9, 174, 1, 5405);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(173:1) {#if !mod._ValueStateMap[mod._ValueType].SNPMakeStateValid }",
    		ctx
    	});

    	return block;
    }

    // (179:1) {#if mod._ValueStateMap[mod._ValueType].SNPMakeStateValid }
    function create_if_block_1$2(ctx) {
    	let snpcode;
    	let current;

    	snpcode = new Main$8({
    			props: {
    				SNPCodeObject: /*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateDocument
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(snpcode.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(snpcode, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpcode_changes = {};
    			if (dirty & /*mod*/ 2) snpcode_changes.SNPCodeObject = /*mod*/ ctx[1]._ValueStateMap[/*mod*/ ctx[1]._ValueType].SNPMakeStateDocument;
    			snpcode.$set(snpcode_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpcode.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpcode.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(snpcode, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(179:1) {#if mod._ValueStateMap[mod._ValueType].SNPMakeStateValid }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let div1;
    	let div0;
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let button2;
    	let t5;
    	let button3;
    	let t7;
    	let button4;
    	let t9;
    	let button5;
    	let t11;
    	let button6;
    	let t13;
    	let t14;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*mod*/ ctx[1]._ValueScan && create_if_block_3$2(ctx);
    	let if_block1 = !/*mod*/ ctx[1]._ValueScan && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			button0.textContent = `${main_1('SNPMakeScanButtonText')}`;
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = `${main_1('SNPMakeTypesNoteButtonText')}`;
    			t3 = space();
    			button2 = element("button");
    			button2.textContent = `${main_1('SNPMakeTypesSiteButtonText')}`;
    			t5 = space();
    			button3 = element("button");
    			button3.textContent = `${main_1('SNPMakeTypesEmailButtonText')}`;
    			t7 = space();
    			button4 = element("button");
    			button4.textContent = `${main_1('SNPMakeTypesPhoneButtonText')}`;
    			t9 = space();
    			button5 = element("button");
    			button5.textContent = `${main_1('SNPMakeTypesContactButtonText')}`;
    			t11 = space();
    			button6 = element("button");
    			button6.textContent = "Wi-Fi";
    			t13 = space();
    			if (if_block0) if_block0.c();
    			t14 = space();
    			if (if_block1) if_block1.c();
    			attr_dev(button0, "class", "SNPMakeScanButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button0, "SNPMakeButtonActive", /*mod*/ ctx[1]._ValueScan);
    			add_location(button0, file$9, 146, 0, 3002);
    			attr_dev(button1, "class", "SNPMakeTypesNoteButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button1, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeNote());
    			add_location(button1, file$9, 148, 0, 3220);
    			attr_dev(button2, "class", "SNPMakeTypesSiteButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button2, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeSite());
    			add_location(button2, file$9, 150, 0, 3505);
    			attr_dev(button3, "class", "SNPMakeTypesEmailButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button3, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeEmail());
    			add_location(button3, file$9, 152, 0, 3790);
    			attr_dev(button4, "class", "SNPMakeTypesPhoneButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button4, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypePhone());
    			add_location(button4, file$9, 154, 0, 4079);
    			attr_dev(button5, "class", "SNPMakeTypesContactButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button5, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeContact());
    			add_location(button5, file$9, 156, 0, 4368);
    			attr_dev(button6, "class", "SNPMakeTypesWifiButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1fx1yo4");
    			toggle_class(button6, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeWifi());
    			add_location(button6, file$9, 158, 0, 4665);
    			attr_dev(div0, "class", "SNPMakeTypes svelte-1fx1yo4");
    			add_location(div0, file$9, 144, 0, 2972);
    			attr_dev(div1, "class", "SNPMake OLSKDecor svelte-1fx1yo4");
    			add_location(div1, file$9, 142, 0, 2939);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, button0);
    			append_dev(div0, t1);
    			append_dev(div0, button1);
    			append_dev(div0, t3);
    			append_dev(div0, button2);
    			append_dev(div0, t5);
    			append_dev(div0, button3);
    			append_dev(div0, t7);
    			append_dev(div0, button4);
    			append_dev(div0, t9);
    			append_dev(div0, button5);
    			append_dev(div0, t11);
    			append_dev(div0, button6);
    			append_dev(div1, t13);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div1, t14);
    			if (if_block1) if_block1.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button0,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceScanButtonDidClick)) /*mod*/ ctx[1].InterfaceScanButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button1,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceTextButtonDidClick)) /*mod*/ ctx[1].InterfaceTextButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button2,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceSiteButtonDidClick)) /*mod*/ ctx[1].InterfaceSiteButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button3,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceEmailButtonDidClick)) /*mod*/ ctx[1].InterfaceEmailButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button4,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfacePhoneButtonDidClick)) /*mod*/ ctx[1].InterfacePhoneButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button5,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceContactButtonDidClick)) /*mod*/ ctx[1].InterfaceContactButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button6,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[1].InterfaceWifiButtonDidClick)) /*mod*/ ctx[1].InterfaceWifiButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (!current || dirty & /*mod*/ 2) {
    				toggle_class(button0, "SNPMakeButtonActive", /*mod*/ ctx[1]._ValueScan);
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button1, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeNote());
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button2, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeSite());
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button3, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeEmail());
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button4, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypePhone());
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button5, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeContact());
    			}

    			if (!current || dirty & /*mod, SNPDocument*/ 2) {
    				toggle_class(button6, "SNPMakeButtonActive", !/*mod*/ ctx[1]._ValueScan && /*mod*/ ctx[1]._ValueType === SNPDocument.SNPDocumentTypeWifi());
    			}

    			if (/*mod*/ ctx[1]._ValueScan) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*mod*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3$2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div1, t14);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!/*mod*/ ctx[1]._ValueScan) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*mod*/ 2) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPFormNotValid = null } = $$props;
    	let { SNPFormValid = null } = $$props;
    	let { SNPFormDidSubmit = null } = $$props;

    	const mod = {
    		// VALUE
    		_ValueStateMap: {},
    		_ValueScan: false,
    		SNPFormBaseSaveButtonDisabled: true,
    		// DATA
    		DataDocumentTemplate(SNPDocumentType) {
    			return { SNPDocumentType, SNPDocumentData: '' };
    		},
    		// INTERFACE
    		InterfaceScanButtonDidClick() {
    			mod.CommandSetType('SCAN');
    			$$invalidate(1, mod._ValueScan = true, mod);
    		},
    		InterfaceTextButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeNote());
    		},
    		InterfaceSiteButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeSite());
    		},
    		InterfaceEmailButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeEmail());
    		},
    		InterfacePhoneButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypePhone());
    		},
    		InterfaceContactButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeContact());
    		},
    		InterfaceWifiButtonDidClick() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeWifi());
    		},
    		// COMMAND
    		CommandSetType(inputData) {
    			$$invalidate(1, mod._ValueScan = false, mod);
    			$$invalidate(1, mod._ValueType = inputData, mod);

    			if (!mod._ValueStateMap[inputData]) {
    				$$invalidate(
    					1,
    					mod._ValueStateMap[inputData] = {
    						SNPMakeStateDocument: mod.DataDocumentTemplate(inputData),
    						SNPMakeStateValid: false
    					},
    					mod
    				);
    			}

    			if (!mod._ValueStateMap[inputData].SNPMakeStateValid) {
    				SNPFormNotValid && SNPFormNotValid();
    			}

    			if (mod._ValueStateMap[inputData].SNPMakeStateValid) {
    				SNPFormValid && SNPFormValid();
    			}
    		},
    		// MESSAGE
    		SNPFormNotValid() {
    			$$invalidate(1, mod._ValueStateMap[mod._ValueType].SNPMakeStateValid = false, mod);
    			SNPFormNotValid && SNPFormNotValid();
    		},
    		SNPFormValid(inputData) {
    			$$invalidate(1, mod._ValueStateMap[mod._ValueType].SNPMakeStateValid = true, mod);
    			SNPFormValid && SNPFormValid(inputData);
    		},
    		SNPFormDidFill(inputData) {
    			$$invalidate(1, mod._ValueStateMap[mod._ValueType].SNPMakeStateDocument = Object.assign(inputData, { SNPDocumentType: mod._ValueType }), mod);
    		},
    		SNPScanDidSucceed(SNPMakeStateDocument) {
    			$$invalidate(1, mod._ValueStateMap[SNPMakeStateDocument.SNPDocumentType] = { SNPMakeStateDocument }, mod);
    			mod.CommandSetType(SNPMakeStateDocument.SNPDocumentType);
    			mod.SNPFormValid(SNPMakeStateDocument);
    			$$invalidate(1, mod.SNPFormBaseSaveButtonDisabled = null, mod);
    		},
    		// SETUP
    		SetupEverything() {
    			mod.CommandSetType(SNPDocument.SNPDocumentTypeNote());
    			const params = Object.fromEntries(Array.from(new URLSearchParams(window.location.search)));

    			if (!params.data) {
    				return;
    			}

    			mod.SNPScanDidSucceed(SNPDocument.SNPDocumentExplode(params.data));
    		},
    		// LIFECYCLE
    		LifecycleModuleDidLoad() {
    			mod.SetupEverything();
    		}
    	};

    	mod.LifecycleModuleDidLoad();
    	const writable_props = ['SNPFormNotValid', 'SNPFormValid', 'SNPFormDidSubmit'];

    	Object_1$3.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('SNPFormNotValid' in $$props) $$invalidate(2, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(3, SNPFormValid = $$props.SNPFormValid);
    		if ('SNPFormDidSubmit' in $$props) $$invalidate(0, SNPFormDidSubmit = $$props.SNPFormDidSubmit);
    	};

    	$$self.$capture_state = () => ({
    		SNPFormNotValid,
    		SNPFormValid,
    		SNPFormDidSubmit,
    		OLSKLocalized: main_1,
    		SNPDocument,
    		mod,
    		SNPScan: Main,
    		SNPFormBase: Main$7,
    		SNPCode: Main$8
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPFormNotValid' in $$props) $$invalidate(2, SNPFormNotValid = $$props.SNPFormNotValid);
    		if ('SNPFormValid' in $$props) $$invalidate(3, SNPFormValid = $$props.SNPFormValid);
    		if ('SNPFormDidSubmit' in $$props) $$invalidate(0, SNPFormDidSubmit = $$props.SNPFormDidSubmit);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [SNPFormDidSubmit, mod, SNPFormNotValid, SNPFormValid];
    }

    class Main$9 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			SNPFormNotValid: 2,
    			SNPFormValid: 3,
    			SNPFormDidSubmit: 0
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$9.name
    		});
    	}

    	get SNPFormNotValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormNotValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormValid() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormValid(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPFormDidSubmit() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPFormDidSubmit(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var main$6 = createCommonjsModule(function (module, exports) {
    const mod = {

    	OLSKTransportExportBasename (debug = {}) {
    		return (debug.DebugWindow || window).location.hostname + '-' + (debug.DebugDate || Date).now();
    	},

    	OLSKTransportExportJSONFilename (debug = {}) {
    		return this.OLSKTransportExportBasename(debug) + '.json';
    	},

    	OLSKTransportExportTXTFilename (debug = {}) {
    		return this.OLSKTransportExportBasename(debug) + '.txt';
    	},

    	OLSKTransportLauncherFakeItemProxy () {
    		return {
    			LCHRecipeName: 'OLSKTransportLauncherFakeItemProxy',
    			LCHRecipeCallback () {},
    		};
    	},

    	_AlertIfNotValid (text, params, debug = {}) {
    		if (!text.trim()) {
    			return (debug.DebugWindow || window).alert(params.OLSKLocalized('OLSKTransportLauncherItemImportJSONErrorNotFilledAlertText'));
    		}

    		if (!text.startsWith('{') || !text.endsWith('}')) {
    			return (debug.DebugWindow || window).alert(params.OLSKLocalized('OLSKTransportLauncherItemImportJSONErrorNotValidAlertText'));
    		}

    		try {
    			return params.OLSKTransportDispatchImportJSON(JSON.parse(text));
    		} catch {
    			return (debug.DebugWindow || window).alert(params.OLSKLocalized('OLSKTransportLauncherItemImportJSONErrorNotValidAlertText'));
    		}
    	},

    	OLSKTransportLauncherItemImportJSON (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof params.OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof params.OLSKTransportDispatchImportJSON !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKTransportLauncherItemImportJSON',
    			LCHRecipeName: params.OLSKLocalized('OLSKTransportLauncherItemImportJSONText'),
    			async LCHRecipeCallback () {
    				const text = await this.api.LCHReadTextFile({
    					accept: '.json',
    				});

    				return mod._AlertIfNotValid(text, params, debug);
    			},
    		};
    	},

    	OLSKTransportLauncherItemExportJSON (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof params.OLSKLocalized !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}
    		
    		if (typeof params.OLSKTransportDispatchExportInput !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKTransportLauncherItemExportJSON',
    			LCHRecipeName: params.OLSKLocalized('OLSKTransportLauncherItemExportJSONText'),
    			async LCHRecipeCallback (inputData) {
    				return this.api.LCHSaveFile(JSON.stringify(inputData || await params.OLSKTransportDispatchExportInput()), mod.OLSKTransportExportJSONFilename(debug));
    			},
    		};
    	},

    	OLSKTransportLauncherFakeItemImportSerialized (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKTransportDispatchImportJSON !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeName: 'OLSKTransportLauncherFakeItemImportSerialized',
    			LCHRecipeCallback () {
    				return mod._AlertIfNotValid((debug.DebugWindow || window).prompt(), params);
    			},
    		};
    	},

    	OLSKTransportLauncherFakeItemExportSerialized (params, debug = {}) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.OLSKTransportDispatchExportInput !== 'function') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return {
    			LCHRecipeSignature: 'OLSKTransportLauncherFakeItemExportSerialized',
    			LCHRecipeName: 'OLSKTransportLauncherFakeItemExportSerialized',
    			async LCHRecipeCallback (inputData) {
    				return (debug.DebugWindow || window).alert(JSON.stringify({
    					OLSKDownloadName: mod.OLSKTransportExportJSONFilename(debug),
    					OLSKDownloadData: JSON.stringify(inputData || await params.OLSKTransportDispatchExportInput()),
    				}));
    			},
    		};
    	},

    	OLSKTransportFakeExportPlaintext (inputData, debug = {}) {
    		if (typeof inputData !== 'string') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return (debug.DebugWindow || window).alert(JSON.stringify({
    			OLSKDownloadName: mod.OLSKTransportExportTXTFilename(debug),
    			OLSKDownloadData: inputData,
    		}));
    	},

    	OLSKTransportRecipes (params) {
    		if (typeof params !== 'object' || params === null) {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		if (typeof params.ParamSpecUI !== 'boolean') {
    			throw new Error('OLSKErrorInputNotValid');
    		}

    		return [
    			mod.OLSKTransportLauncherFakeItemProxy(),
    			mod.OLSKTransportLauncherItemImportJSON(params),
    			mod.OLSKTransportLauncherItemExportJSON(params),
    			mod.OLSKTransportLauncherFakeItemImportSerialized(params),
    			mod.OLSKTransportLauncherFakeItemExportSerialized(params),
    		].filter(function (e) {
    			if (params.ParamSpecUI) {
    				return true;
    			}

    			return !(e.LCHRecipeSignature || e.LCHRecipeName).match(/Fake/);
    		});
    	},

    };

    Object.assign(exports, mod);
    });

    var _OLSKInputClear = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKInputClear\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <circle id=\"_OLSKInputClear-oval2\" stroke=\"rgb(170, 170, 170)\" stroke-width=\"1.5\" fill=\"rgb(170, 170, 170)\" cx=\"8\" cy=\"8\" r=\"5.5\" />\n    <path id=\"_OLSKInputClear-bezier\" stroke=\"rgb(255, 255, 255)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 6,6 L 10,10\" />\n    <path id=\"_OLSKInputClear-bezier2\" stroke=\"rgb(255, 255, 255)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 6,10 L 10,6\" />\n</svg>\n";

    var _OLSKSharedAndroidMore = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedAndroidMore\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <circle id=\"_OLSKSharedAndroidMore-oval\" stroke=\"none\" fill=\"rgb(0, 0, 0)\" cx=\"8\" cy=\"8\" r=\"1.5\" />\n    <circle id=\"_OLSKSharedAndroidMore-oval2\" stroke=\"none\" fill=\"rgb(0, 0, 0)\" cx=\"8\" cy=\"3.5\" r=\"1.5\" />\n    <circle id=\"_OLSKSharedAndroidMore-oval3\" stroke=\"none\" fill=\"rgb(0, 0, 0)\" cx=\"8\" cy=\"12.5\" r=\"1.5\" />\n</svg>\n";

    var _OLSKSharedApropos = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedApropos\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    \n    <text  fill=\"rgb(0, 0, 0)\" font-family=\"Georgia, Times, 'Times New Roman', serif\" font-size=\"17\" x=\"5.51\" y=\"-0\" text-anchor=\"middle\"><tspan x=\"8\" y=\"14\">i</tspan></text>\n</svg>\n";

    var _OLSKSharedArchive = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedArchive\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedArchive-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2,14 L 14,14 14,5 2,5 2,14 Z M 2,14\" />\n    <path id=\"_OLSKSharedArchive-rectangle2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1,5 L 15,5 15,2 1,2 1,5 Z M 1,5\" />\n    <path id=\"_OLSKSharedArchive-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"rgb(255, 255, 255)\" d=\"M 5.38,8.95 L 10.62,8.95\" />\n</svg>\n";

    var _OLSKSharedBack = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedBack\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedBack-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 11,1 L 4,8 11,15\" />\n</svg>\n";

    var _OLSKSharedClone = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedClone\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedClone-group2\" clip-path=\"url(#_OLSKSharedClone-clip)\">\n        <clipPath id=\"_OLSKSharedClone-clip\">\n            <path d=\"M 12,0.44 C 12.51,0.61 12.87,0.95 13.04,1.41 13.06,1.47 13.06,1.47 13.07,1.51 13.14,1.78 13.15,1.95 13.15,2.53 13.15,2.72 13.15,2.72 13.15,3.5 L 13.15,4.15 12.5,4.15 5.03,4.15 C 4.57,4.15 4.47,4.16 4.35,4.19 4.34,4.19 4.34,4.19 4.33,4.19 4.28,4.21 4.21,4.28 4.19,4.35 4.19,4.34 4.19,4.34 4.19,4.35 4.16,4.47 4.15,4.57 4.15,5.03 4.15,6.08 4.15,6.08 4.15,9.25 4.15,11.08 4.15,11.08 4.15,12.5 L 4.15,13.15 3.5,13.15 2.53,13.15 C 1.9,13.15 1.73,13.14 1.47,13.05 0.98,12.88 0.63,12.54 0.46,12.09 0.36,11.77 0.35,11.59 0.35,10.97 L 0.35,2.53 0.35,2.53 C 0.35,1.9 0.36,1.73 0.45,1.47 0.62,0.98 0.96,0.63 1.41,0.46 1.73,0.36 1.91,0.35 2.52,0.35 L 10.97,0.35 10.97,0.35 C 11.6,0.35 12,0.44 12,0.44 Z M 12,0.44\" />\n        </clipPath>\n        <rect id=\"_OLSKSharedClone-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" fill=\"none\" x=\"1\" y=\"1\" width=\"11.5\" height=\"11.5\" rx=\"1\" />\n    </g>\n    <rect id=\"_OLSKSharedClone-rectangle2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" fill=\"none\" x=\"3.5\" y=\"3.5\" width=\"11.5\" height=\"11.5\" rx=\"1\" />\n    <g id=\"_OLSKSharedClone-group\">\n        <path id=\"_OLSKSharedClone-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 9.5,6.5 L 9.5,12.5\" />\n        <path id=\"_OLSKSharedClone-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 6.5,9.5 L 12.5,9.5\" />\n    </g>\n</svg>\n";

    var _OLSKSharedCloud = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedCloud\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedCloud-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 9.44,3.25 C 8.04,3.25 7.01,4.06 6.52,5.03 L 6.53,5.03 C 6.44,5.21 6.22,5.28 6.05,5.19 5.44,4.89 4.72,4.92 4.15,5.26 3.58,5.61 3.15,6.24 3.15,7.21 L 3.15,7.21 C 3.15,7.38 3.03,7.53 2.86,7.56 1.78,7.75 1,8.83 1,9.91 1,11.21 2.02,12.25 3.69,12.25 L 12.49,12.25 C 13.88,12.25 15,11.13 15,9.73 15,8.5 14.13,7.48 12.98,7.25 L 12.97,7.25 C 12.79,7.21 12.66,7.04 12.68,6.86 12.86,5.08 11.46,3.25 9.44,3.25 Z M 9.44,3.25\" />\n</svg>\n";

    var _OLSKSharedCloudError = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedCloudError\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedCloudError-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 11.31,12 L 12.49,12 C 13.88,12 15,10.88 15,9.48 15,8.25 14.13,7.23 12.98,7 L 12.97,7 C 12.79,6.96 12.66,6.79 12.68,6.61 12.86,4.83 11.46,3 9.44,3 8.04,3 7.01,3.81 6.52,4.78 L 6.53,4.78 C 6.44,4.96 6.22,5.03 6.05,4.94 5.44,4.64 4.72,4.67 4.15,5.01 3.58,5.36 3.15,5.99 3.15,6.96 L 3.15,6.96 C 3.15,7.13 3.03,7.28 2.86,7.31 1.78,7.5 1,8.58 1,9.66 1,10.96 2.02,12 3.69,12 L 4.86,12\" />\n    <g id=\"_OLSKSharedCloudError-group\">\n    </g>\n    <path id=\"_OLSKSharedCloudError-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,8 L 8,11\" />\n    <path id=\"_OLSKSharedCloudError-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,13.5 L 8,13.5\" />\n</svg>\n";

    var _OLSKSharedCloudOffline = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedCloudOffline\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedCloudOffline-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 11.81,12 L 12.49,12 C 13.88,12 15,10.88 15,9.48 15,8.25 14.13,7.23 12.98,7 L 12.97,7 C 12.79,6.96 12.66,6.79 12.68,6.61 12.86,4.83 11.46,3 9.44,3 8.04,3 7.01,3.81 6.52,4.78 L 6.53,4.78 C 6.44,4.96 6.22,5.03 6.05,4.94 5.44,4.64 4.72,4.67 4.15,5.01 3.58,5.36 3.15,5.99 3.15,6.96 L 3.15,6.96 C 3.15,7.13 3.03,7.28 2.86,7.31 1.78,7.5 1,8.58 1,9.66 1,10.96 2.02,12 3.69,12 L 4.86,12\" />\n    <g id=\"_OLSKSharedCloudOffline-group\" transform=\"translate(8.3, 12.11) rotate(90)\" >\n        <path id=\"_OLSKSharedCloudOffline-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1.68,-1.68 L -1.68,1.68\" />\n        <path id=\"_OLSKSharedCloudOffline-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.35,-0 L 0,3.35\" transform=\"translate(-1.68, 1.68) rotate(-90)\"  />\n    </g>\n</svg>\n";

    var _OLSKSharedCreate = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedCreate\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedCreate-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,1 L 8,15\" />\n    <path id=\"_OLSKSharedCreate-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1,8 L 15,8\" />\n</svg>\n";

    var _OLSKSharedDiscard = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedDiscard\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedDiscard-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" fill=\"none\" d=\"M 4.53,6 L 13,6 13,13.47 C 13,13.91 13,14.13 12.93,14.33 L 12.93,14.37 C 12.83,14.63 12.63,14.83 12.37,14.93 12.13,15 11.91,15 11.47,15 L 4.53,15 C 4.09,15 3.87,15 3.67,14.93 L 3.63,14.93 C 3.37,14.83 3.17,14.63 3.07,14.37 3,14.13 3,13.91 3,13.47 L 3,6 Z M 4.53,6\" />\n    <path id=\"_OLSKSharedDiscard-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1,3.5 L 15,3.5\" />\n    <path id=\"_OLSKSharedDiscard-rectangle2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" fill=\"none\" d=\"M 8,1 L 8,1 C 9.75,1 9.75,1 9.75,1 L 9.75,1 C 10.44,1 11,1.56 11,2.25 11,2.25 11,2.25 11,2.25 11,2.25 11,2.25 11,2.25 L 11,2.25 C 11,2.25 11,2.25 11,2.25 L 11,3.5 5,3.5 5,2.25 C 5,1.56 5.56,1 6.25,1 6.25,1 6.25,1 6.25,1 L 8,1 Z M 8,1\" />\n    <path id=\"_OLSKSharedDiscard-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 5.5,5.5 L 5.5,15\" />\n    <path id=\"_OLSKSharedDiscard-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,6 L 8,15\" />\n    <path id=\"_OLSKSharedDiscard-bezier4\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 10.5,5.5 L 10.5,15\" />\n</svg>\n";

    var _OLSKSharedDismiss = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedDismiss\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedDismiss-group\" transform=\"translate(8, 8) rotate(-45)\" >\n        <path id=\"_OLSKSharedDismiss-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 0,-7 L 0,7\" />\n        <path id=\"_OLSKSharedDismiss-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M -7,0 L 7,0\" />\n    </g>\n</svg>\n";

    var _OLSKSharedEdit = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedEdit\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedEdit-group\">\n        <path id=\"_OLSKSharedEdit-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13.12,10.17 L 13.12,12.43 C 13.12,13.05 13.12,13.37 13.03,13.65 L 13.01,13.7 C 12.88,14.07 12.58,14.36 12.2,14.49 11.86,14.6 11.54,14.6 10.9,14.6 L 3.72,14.6 C 3.08,14.6 2.76,14.6 2.47,14.5 L 2.42,14.49 C 2.04,14.36 1.75,14.07 1.61,13.7 1.5,13.37 1.5,13.05 1.5,12.43 L 1.5,5.42 C 1.5,4.79 1.5,4.48 1.6,4.2 L 1.61,4.14 C 1.75,3.78 2.04,3.49 2.42,3.35 2.76,3.25 3.08,3.25 3.72,3.25 L 8.01,3.25\" />\n        <path id=\"_OLSKSharedEdit-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1.09,-8.67 C 1.13,-8.55 1.13,-8.43 1.13,-8.21 L 1.58,0.46 C 1.58,0.53 1.58,0.61 1.58,0.73 1.58,1.5 0.89,2.54 0.21,2.54 -0.48,2.54 -1.16,1.5 -1.16,0.73 -1.16,0.63 -1.16,0.46 -1.16,0.46 L -1.61,-8.21 C -1.61,-8.43 -1.61,-8.55 -1.58,-8.65 -1.52,-8.81 -1.41,-8.91 -1.27,-8.96 -1.14,-9 0.29,-9 0.29,-9 0.53,-9 0.65,-9 0.76,-8.97 0.76,-8.97 1.04,-8.81 1.09,-8.67 Z M 1.09,-8.67\" transform=\"translate(7.76, 8.79) rotate(45)\"  />\n    </g>\n</svg>\n";

    var _OLSKSharediOSA2HS = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharediOSA2HS\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <rect id=\"_OLSKSharediOSA2HS-rectangle2\" stroke=\"rgb(0, 0, 0)\" fill=\"rgb(255, 255, 255)\" x=\"1\" y=\"1\" width=\"14\" height=\"14\" rx=\"1\" />\n    <g id=\"_OLSKSharediOSA2HS-group\">\n        <path id=\"_OLSKSharediOSA2HS-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,5 L 8,11\" />\n        <path id=\"_OLSKSharediOSA2HS-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 5,8 L 11,8\" />\n    </g>\n</svg>\n";

    var _OLSKSharediOSShare = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharediOSShare\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharediOSShare-bezier6\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"4\" fill=\"none\" d=\"M 10.84,5.96 L 12.54,5.96 C 13.18,5.96 13.69,6.46 13.69,7.09 L 13.69,13.98 C 13.69,14.61 13.18,15.11 12.54,15.11 L 3.85,15.11 C 3.21,15.11 2.69,14.61 2.69,13.98 L 2.69,7.09 C 2.69,6.46 3.21,5.96 3.85,5.96 L 5.5,5.96\" />\n    <path id=\"_OLSKSharediOSShare-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 4.94,3.56 L 8.19,0.5 11.44,3.56\" />\n    <path id=\"_OLSKSharediOSShare-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8.19,9.91 L 8.19,1.5\" />\n</svg>\n";

    var _OLSKSharedIconPlaceholder = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"100\" height=\"100\"  xml:space=\"preserve\" id=\"_OLSKSharedIconPlaceholder\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <rect id=\"_OLSKSharedIconPlaceholder-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"2\" stroke-dasharray=\"10,2\" stroke-dashoffset=\"0\" fill=\"none\" x=\"5\" y=\"5\" width=\"90\" height=\"90\" rx=\"20\" />\n</svg>\n";

    var _OLSKSharedLanguage = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedLanguage\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <circle id=\"_OLSKSharedLanguage-oval\" stroke=\"rgb(0, 0, 0)\" fill=\"none\" cx=\"8\" cy=\"8\" r=\"6\" />\n    <path id=\"_OLSKSharedLanguage-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2,8 L 14,8\" />\n    <path id=\"_OLSKSharedLanguage-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,14 L 8,2\" />\n    <path id=\"_OLSKSharedLanguage-bezier4\" stroke=\"rgb(0, 0, 0)\" stroke-linejoin=\"bevel\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 12.24,3.75 C 11.15,4.83 9.65,5.5 8,5.5 6.35,5.5 4.85,4.83 3.76,3.75 4.09,3.42 4.46,3.13 4.86,2.89 5.77,2.32 6.85,2 8,2 9.65,2 11.15,2.67 12.24,3.75 Z M 12.24,3.75\" />\n    <path id=\"_OLSKSharedLanguage-bezier5\" stroke=\"rgb(0, 0, 0)\" stroke-linejoin=\"bevel\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 12.24,12.25 C 11.15,13.33 9.65,14 8,14 6.35,14 4.85,13.33 3.76,12.25 4.09,11.92 4.46,11.63 4.86,11.39 5.77,10.82 6.85,10.5 8,10.5 9.65,10.5 11.15,11.17 12.24,12.25 Z M 12.24,12.25\" />\n    <ellipse id=\"_OLSKSharedLanguage-oval4\" stroke=\"rgb(0, 0, 0)\" fill=\"none\" cx=\"8\" cy=\"8\" rx=\"3\" ry=\"5.75\" />\n</svg>\n";

    var _OLSKSharedLauncher = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedLauncher\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedLauncher-group\" transform=\"scale(1.07, 1.07)\" >\n        <path id=\"_OLSKSharedLauncher-prompt\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8.25,2.5 L 13.25,7.5 8.25,12.5\" />\n        <g id=\"_OLSKSharedLauncher-linesSolid\">\n            <path id=\"_OLSKSharedLauncher-bezier5\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2,5.5 L 8,5.5\" />\n            <path id=\"_OLSKSharedLauncher-bezier6\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 4.5,7.5 L 10,7.5\" />\n            <path id=\"_OLSKSharedLauncher-bezier7\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2.5,9.5 L 7.5,9.5\" />\n        </g>\n    </g>\n</svg>\n";

    var _OLSKSharedLock = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedLock\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedLock-group\">\n        <rect id=\"_OLSKSharedLock-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" fill=\"none\" x=\"2.76\" y=\"7.56\" width=\"10.51\" height=\"6.69\" rx=\"1\" />\n        <path id=\"_OLSKSharedLock-rectangle2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 8,1.72 L 8,1.72 8,1.72 8,1.72 C 9.94,1.72 11.5,3.38 11.5,5.44 L 11.5,5.44 11.5,5.44 11.5,5.7 11.5,7.56 4.5,7.56 4.5,5.7 C 4.5,5.44 4.5,5.44 4.5,5.44 L 4.5,5.44 C 4.5,3.38 6.07,1.72 8,1.72 L 8,1.72 8,1.72 Z M 8,1.72\" />\n    </g>\n</svg>\n";

    var _OLSKSharedReload = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedReload\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedReload-oval2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13,9 C 13,11.76 10.76,14 8,14 5.24,14 3,11.76 3,9 3,6.24 5.24,4 8,4\" />\n    <path id=\"_OLSKSharedReload-bezier8\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"rgb(0, 0, 0)\" d=\"M 8,2 L 8,6 11,4 8,2\" />\n</svg>\n";

    var _OLSKSharedStash = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedStash\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedStash-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 5.79,8.03 L 12.79,8.03\" />\n    <path id=\"_OLSKSharedStash-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 5.79,11.53 L 12.79,11.53\" />\n    <path id=\"_OLSKSharedStash-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 5.79,4.53 L 12.79,4.53\" />\n    <path id=\"_OLSKSharedStash-bezier4\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.29,8.03 L 3.29,8.03\" />\n    <path id=\"_OLSKSharedStash-bezier5\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.29,11.53 L 3.29,11.53\" />\n    <path id=\"_OLSKSharedStash-bezier6\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.29,4.53 L 3.29,4.53\" />\n</svg>\n";

    var _OLSKSharedStashSelected = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedStashSelected\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedStashSelected-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2,9 L 6,13 13,5\" />\n</svg>\n";

    var _OLSKSharedStorageDisconnect = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedStorageDisconnect\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedStorageDisconnect-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 9.44,3.25 C 8.04,3.25 7.01,4.06 6.52,5.03 L 6.53,5.03 C 6.44,5.21 6.22,5.28 6.05,5.19 5.44,4.89 4.72,4.92 4.15,5.26 3.58,5.61 3.15,6.24 3.15,7.21 L 3.15,7.21 C 3.15,7.38 3.03,7.53 2.86,7.56 1.78,7.75 1,8.83 1,9.91 1,11.21 2.02,12.25 3.69,12.25 L 12.49,12.25 C 13.88,12.25 15,11.13 15,9.73 15,8.5 14.13,7.48 12.98,7.25 L 12.97,7.25 C 12.79,7.21 12.66,7.04 12.68,6.86 12.86,5.08 11.46,3.25 9.44,3.25 Z M 9.44,3.25\" />\n    <path id=\"_OLSKSharedStorageDisconnect-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 12,1.5 L 4.5,14.5\" />\n</svg>\n";

    var _OLSKSharedSyncStart = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedSyncStart\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedSyncStart-group\" transform=\"\" >\n        <path id=\"_OLSKSharedSyncStart-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13,6.5 L 10.5,6.5\" />\n        <path id=\"_OLSKSharedSyncStart-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13,6.5 L 14,4.5\" />\n        <path id=\"_OLSKSharedSyncStart-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 4.86,8.83 L 2.83,8.83\" />\n        <path id=\"_OLSKSharedSyncStart-bezier5\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1.83,10.83 L 2.83,8.83\" />\n        <path id=\"_OLSKSharedSyncStart-oval\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 12.85,9.21 C 12.31,11.39 10.34,13 8,13 5.66,13 3.69,11.39 3.15,9.21\" />\n        <path id=\"_OLSKSharedSyncStart-oval3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.25,6.42 C 3.91,4.43 5.79,3 8,3 10.14,3 11.97,4.35 12.68,6.24\" />\n    </g>\n</svg>\n";

    var _OLSKSharedSyncStop = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedSyncStop\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <g id=\"_OLSKSharedSyncStop-group\" transform=\"\" >\n        <path id=\"_OLSKSharedSyncStop-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13,6.5 L 10.5,6.5\" />\n        <path id=\"_OLSKSharedSyncStop-bezier3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 13,6.5 L 14,4.5\" />\n        <path id=\"_OLSKSharedSyncStop-bezier4\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 4.86,8.83 L 2.83,8.83\" />\n        <path id=\"_OLSKSharedSyncStop-bezier5\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1.83,10.83 L 2.83,8.83\" />\n        <path id=\"_OLSKSharedSyncStop-oval\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 12.85,9.21 C 12.31,11.39 10.34,13 8,13 5.66,13 3.69,11.39 3.15,9.21\" />\n        <path id=\"_OLSKSharedSyncStop-oval3\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 3.25,6.42 C 3.91,4.43 5.79,3 8,3 10.14,3 11.97,4.35 12.68,6.24\" />\n    </g>\n    <path id=\"_OLSKSharedSyncStop-bezier\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 11.62,1.66 L 3.96,13.91\" />\n</svg>\n";

    var _OLSKSharedUnarchive = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\"  xml:space=\"preserve\" id=\"_OLSKSharedUnarchive\">\n    <!-- Generated by PaintCode (www.paintcodeapp.com) -->\n    <path id=\"_OLSKSharedUnarchive-rectangle\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 2,14 L 14,14 14,5 2,5 2,14 Z M 2,14\" />\n    <path id=\"_OLSKSharedUnarchive-rectangle2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1,5 L 15,5 15,2 1,2 1,5 Z M 1,5\" />\n    <path id=\"_OLSKSharedUnarchive-bezier2\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\" fill=\"rgb(255, 255, 255)\" d=\"M 5.38,8.95 L 10.62,8.95\" />\n    <path id=\"_OLSKSharedUnarchive-bezier4\" stroke=\"rgb(0, 0, 0)\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" fill=\"none\" d=\"M 1,15 L 15,1\" />\n</svg>\n";

    var OLSKUIAssets = {

    	_OLSKInputClear,
    	_OLSKSharedAndroidMore,
    	_OLSKSharedApropos,
    	_OLSKSharedArchive,
    	_OLSKSharedBack,
    	_OLSKSharedClone,
    	_OLSKSharedCloud,
    	_OLSKSharedCloudError,
    	_OLSKSharedCloudOffline,
    	_OLSKSharedCreate,
    	_OLSKSharedDiscard,
    	_OLSKSharedDismiss,
    	_OLSKSharedEdit,
    	_OLSKSharediOSA2HS,
    	_OLSKSharediOSShare,
    	_OLSKSharedIconPlaceholder,
    	_OLSKSharedLanguage,
    	_OLSKSharedLauncher,
    	_OLSKSharedLock,
    	_OLSKSharedReload,
    	_OLSKSharedStash,
    	_OLSKSharedStashSelected,
    	_OLSKSharedStorageDisconnect,
    	_OLSKSharedSyncStart,
    	_OLSKSharedSyncStop,
    	_OLSKSharedUnarchive,

    };

    /* os-app/sub-download/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$4 } = globals;
    const file$a = "os-app/sub-download/main.svelte";

    function create_fragment$a(ctx) {
    	let div;
    	let h5;
    	let t1;
    	let input0;
    	let t2;
    	let label0;
    	let t4;
    	let input1;
    	let t5;
    	let label1;
    	let t7;
    	let button;
    	let binding_group;
    	let mounted;
    	let dispose;
    	binding_group = init_binding_group(/*$$binding_groups*/ ctx[4][0]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			h5 = element("h5");
    			h5.textContent = `${main_1('SNPDownloadHeadingText')}`;
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			label0 = element("label");
    			label0.textContent = "PNG";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			label1 = element("label");
    			label1.textContent = "SVG";
    			t7 = space();
    			button = element("button");
    			button.textContent = `${main_1('OLSKWordingDownloadText')}`;
    			attr_dev(h5, "class", "SNPDownloadHeading");
    			add_location(h5, file$a, 69, 0, 1415);
    			attr_dev(input0, "id", "SNPDownloadPNGButton");
    			attr_dev(input0, "type", "radio");
    			input0.__value = "PNG";
    			input0.value = input0.__value;
    			add_location(input0, file$a, 71, 0, 1496);
    			attr_dev(label0, "class", "SNPDownloadPNGButton OLSKDecorTappable");
    			attr_dev(label0, "for", "SNPDownloadPNGButton");
    			add_location(label0, file$a, 72, 0, 1589);
    			attr_dev(input1, "id", "SNPDownloadSVGButton");
    			attr_dev(input1, "type", "radio");
    			input1.__value = "SVG";
    			input1.value = input1.__value;
    			add_location(input1, file$a, 73, 0, 1682);
    			attr_dev(label1, "class", "SNPDownloadSVGButton OLSKDecorTappable");
    			attr_dev(label1, "for", "SNPDownloadSVGButton");
    			add_location(label1, file$a, 74, 0, 1775);
    			attr_dev(button, "class", "SNPDownloadButton");
    			add_location(button, file$a, 76, 0, 1869);
    			attr_dev(div, "class", "SNPDownload");
    			add_location(div, file$a, 67, 0, 1388);
    			binding_group.p(input0, input1);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h5);
    			append_dev(div, t1);
    			append_dev(div, input0);
    			input0.checked = input0.__value === /*mod*/ ctx[0]._ValueFormat;
    			append_dev(div, t2);
    			append_dev(div, label0);
    			append_dev(div, t4);
    			append_dev(div, input1);
    			input1.checked = input1.__value === /*mod*/ ctx[0]._ValueFormat;
    			append_dev(div, t5);
    			append_dev(div, label1);
    			append_dev(div, t7);
    			append_dev(div, button);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "change", /*input0_change_handler*/ ctx[3]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[5]),
    					listen_dev(
    						button,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceButtonDidClick)) /*mod*/ ctx[0].InterfaceButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*mod*/ 1) {
    				input0.checked = input0.__value === /*mod*/ ctx[0]._ValueFormat;
    			}

    			if (dirty & /*mod*/ 1) {
    				input1.checked = input1.__value === /*mod*/ ctx[0]._ValueFormat;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			binding_group.r();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { SNPDownloadData } = $$props;
    	let { SNPDownloadBasename = '' } = $$props;

    	const mod = {
    		// VALUE
    		_ValueFormat: 'PNG',
    		// DATA
    		DataExtension() {
    			return mod._ValueFormat.toLowerCase();
    		},
    		DataFilename() {
    			return `${SNPDownloadBasename || main$6.OLSKTransportExportBasename()}.${mod.DataExtension()}`;
    		},
    		// INTERFACE
    		InterfaceButtonDidClick() {
    			mod.CommandDownload({
    				SNPDownloadData,
    				SNPDownloadFilename: mod.DataFilename()
    			});
    		},
    		// COMMAND
    		CommandDownload(inputData) {
    			if (main_1$2()) {
    				return window.alert(JSON.stringify(inputData));
    			}

    			const isCanvas = mod._ValueFormat === 'PNG';

    			const element = kjua({
    				render: isCanvas ? 'canvas' : 'svg',
    				ecLevel: 'H',
    				size: 1000,
    				rounded: 100,
    				quiet: 1,
    				text: SNPDownloadData
    			});

    			const temporaryLink = Object.assign(document.createElement('a'), {
    				download: inputData.SNPDownloadFilename,
    				href: isCanvas
    				? element.toDataURL()
    				: URL.createObjectURL(new Blob([element.outerHTML], { type: 'image/svg+xml' }))
    			});

    			document.body.appendChild(temporaryLink);
    			temporaryLink.click();
    			document.body.removeChild(temporaryLink);
    		}
    	};

    	$$self.$$.on_mount.push(function () {
    		if (SNPDownloadData === undefined && !('SNPDownloadData' in $$props || $$self.$$.bound[$$self.$$.props['SNPDownloadData']])) {
    			console.warn("<Main> was created without expected prop 'SNPDownloadData'");
    		}
    	});

    	const writable_props = ['SNPDownloadData', 'SNPDownloadBasename'];

    	Object_1$4.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_change_handler() {
    		mod._ValueFormat = this.__value;
    		$$invalidate(0, mod);
    	}

    	function input1_change_handler() {
    		mod._ValueFormat = this.__value;
    		$$invalidate(0, mod);
    	}

    	$$self.$$set = $$props => {
    		if ('SNPDownloadData' in $$props) $$invalidate(1, SNPDownloadData = $$props.SNPDownloadData);
    		if ('SNPDownloadBasename' in $$props) $$invalidate(2, SNPDownloadBasename = $$props.SNPDownloadBasename);
    	};

    	$$self.$capture_state = () => ({
    		SNPDownloadData,
    		SNPDownloadBasename,
    		OLSKLocalized: main_1,
    		OLSK_SPEC_UI: main_1$2,
    		OLSKTransport: main$6,
    		kjua,
    		mod,
    		OLSKUIAssets
    	});

    	$$self.$inject_state = $$props => {
    		if ('SNPDownloadData' in $$props) $$invalidate(1, SNPDownloadData = $$props.SNPDownloadData);
    		if ('SNPDownloadBasename' in $$props) $$invalidate(2, SNPDownloadBasename = $$props.SNPDownloadBasename);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		mod,
    		SNPDownloadData,
    		SNPDownloadBasename,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler
    	];
    }

    class Main$a extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			SNPDownloadData: 1,
    			SNPDownloadBasename: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$a.name
    		});
    	}

    	get SNPDownloadData() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPDownloadData(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get SNPDownloadBasename() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set SNPDownloadBasename(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/OLSKReloadButton/main.svelte generated by Svelte v3.59.2 */
    const file$b = "node_modules/OLSKReloadButton/main.svelte";

    function create_fragment$b(ctx) {
    	let button;
    	let div;
    	let button_title_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			div = element("div");
    			attr_dev(div, "class", "OLSKReloadButtonImage");
    			add_location(div, file$b, 7, 1, 329);
    			attr_dev(button, "class", "OLSKReloadButton OLSKToolbarButton OLSKDecorTappable OLSKDecorButtonNoStyle");
    			attr_dev(button, "title", button_title_value = main_1('OLSKReloadButtonText'));
    			add_location(button, file$b, 6, 0, 143);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, div);
    			div.innerHTML = _OLSKSharedReload;

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[0], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => window.location.reload();
    	$$self.$capture_state = () => ({ OLSKLocalized: main_1, _OLSKSharedReload });
    	return [click_handler];
    }

    class Main$b extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$b.name
    		});
    	}
    }

    /* node_modules/OLSKAppToolbar/main.svelte generated by Svelte v3.59.2 */
    const file$c = "node_modules/OLSKAppToolbar/main.svelte";

    // (55:1) {:else}
    function create_else_block(ctx) {
    	let olskreloadbutton;
    	let current;
    	olskreloadbutton = new Main$b({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(olskreloadbutton.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(olskreloadbutton, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(olskreloadbutton.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(olskreloadbutton.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(olskreloadbutton, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(55:1) {:else}",
    		ctx
    	});

    	return block;
    }

    // (51:1) {#if OLSKAppToolbarDispatchApropos }
    function create_if_block_10(ctx) {
    	let button;
    	let div;
    	let raw_value = OLSKUIAssets._OLSKSharedApropos + "";
    	let button_title_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			div = element("div");
    			attr_dev(div, "class", "OLSKAppToolbarAproposButtonImage svelte-1i8pgw");
    			add_location(div, file$c, 52, 3, 1560);
    			attr_dev(button, "class", "OLSKAppToolbarAproposButton OLSKDecorButtonNoStyle OLSKDecorTappable OLSKToolbarButton svelte-1i8pgw");
    			attr_dev(button, "title", button_title_value = main_1('OLSKAppToolbarAproposButtonText'));
    			add_location(button, file$c, 51, 2, 1351);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, div);
    			div.innerHTML = raw_value;

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchApropos*/ ctx[8])) /*OLSKAppToolbarDispatchApropos*/ ctx[8].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_10.name,
    		type: "if",
    		source: "(51:1) {#if OLSKAppToolbarDispatchApropos }",
    		ctx
    	});

    	return block;
    }

    // (59:1) {#if OLSKAppToolbarDispatchTongue }
    function create_if_block_9(ctx) {
    	let button;
    	let div;
    	let raw_value = OLSKUIAssets._OLSKSharedLanguage + "";
    	let button_title_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			div = element("div");
    			attr_dev(div, "class", "OLSKAppToolbarLanguageButtonImage svelte-1i8pgw");
    			add_location(div, file$c, 60, 3, 1954);
    			attr_dev(button, "class", "OLSKAppToolbarLanguageButton OLSKDecorButtonNoStyle OLSKDecorTappable OLSKToolbarButton svelte-1i8pgw");
    			attr_dev(button, "title", button_title_value = main_1('OLSKAppToolbarLanguageButtonText'));
    			add_location(button, file$c, 59, 2, 1744);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, div);
    			div.innerHTML = raw_value;

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchTongue*/ ctx[9])) /*OLSKAppToolbarDispatchTongue*/ ctx[9].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_9.name,
    		type: "if",
    		source: "(59:1) {#if OLSKAppToolbarDispatchTongue }",
    		ctx
    	});

    	return block;
    }

    // (65:1) {#if OLSKAppToolbarGuideURL}
    function create_if_block_8(ctx) {
    	let a;
    	let t_value = main_1('OLSKAppToolbarGuideLinkText') + "";
    	let t;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t = text(t_value);
    			attr_dev(a, "class", "OLSKAppToolbarGuideLink svelte-1i8pgw");
    			attr_dev(a, "href", /*OLSKAppToolbarGuideURL*/ ctx[0]);
    			attr_dev(a, "target", "_blank");
    			attr_dev(a, "rel", "noreferrer");
    			add_location(a, file$c, 65, 2, 2101);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*OLSKAppToolbarGuideURL*/ 1) {
    				attr_dev(a, "href", /*OLSKAppToolbarGuideURL*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(65:1) {#if OLSKAppToolbarGuideURL}",
    		ctx
    	});

    	return block;
    }

    // (72:2) {#if OLSKAppToolbarDispatchFund && !OLSKAppToolbarFundShowProgress }
    function create_if_block_6$1(ctx) {
    	let button;
    	let t1;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*OLSKAppToolbarFundLimitText*/ ctx[2] !== '' && create_if_block_7(ctx);

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = `${main_1('OLSKAppToolbarFundButtonText')}`;
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(button, "class", "OLSKAppToolbarFundButton OLSKDecorPress svelte-1i8pgw");
    			add_location(button, file$c, 72, 3, 2415);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchFund*/ ctx[10])) /*OLSKAppToolbarDispatchFund*/ ctx[10].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (/*OLSKAppToolbarFundLimitText*/ ctx[2] !== '') {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_7(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6$1.name,
    		type: "if",
    		source: "(72:2) {#if OLSKAppToolbarDispatchFund && !OLSKAppToolbarFundShowProgress }",
    		ctx
    	});

    	return block;
    }

    // (75:3) {#if OLSKAppToolbarFundLimitText !== '' }
    function create_if_block_7(ctx) {
    	let button;
    	let t_value = /*OLSKAppToolbarFundLimitText*/ ctx[2].toString() + "";
    	let t;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text(t_value);
    			attr_dev(button, "class", "OLSKAppToolbarFundLimit OLSKDecorButtonNoStyle svelte-1i8pgw");
    			button.disabled = true;
    			add_location(button, file$c, 76, 4, 2686);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*OLSKAppToolbarFundLimitText*/ 4 && t_value !== (t_value = /*OLSKAppToolbarFundLimitText*/ ctx[2].toString() + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7.name,
    		type: "if",
    		source: "(75:3) {#if OLSKAppToolbarFundLimitText !== '' }",
    		ctx
    	});

    	return block;
    }

    // (81:2) {#if OLSKAppToolbarFundShowProgress }
    function create_if_block_5$1(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "…";
    			attr_dev(div, "class", "OLSKAppToolbarFundProgress svelte-1i8pgw");
    			add_location(div, file$c, 81, 3, 2871);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5$1.name,
    		type: "if",
    		source: "(81:2) {#if OLSKAppToolbarFundShowProgress }",
    		ctx
    	});

    	return block;
    }

    // (86:1) {#if OLSKAppToolbarDispatchClub }
    function create_if_block_3$3(ctx) {
    	let button;
    	let t1;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*OLSKAppToolbarClubLimitText*/ ctx[3] !== '' && create_if_block_4$2(ctx);

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = `${main_1('OLSKAppToolbarClubButtonText')}`;
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(button, "class", "OLSKAppToolbarClubButton OLSKDecorPress svelte-1i8pgw");
    			add_location(button, file$c, 86, 2, 2973);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchClub*/ ctx[11])) /*OLSKAppToolbarDispatchClub*/ ctx[11].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (/*OLSKAppToolbarClubLimitText*/ ctx[3] !== '') {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_4$2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$3.name,
    		type: "if",
    		source: "(86:1) {#if OLSKAppToolbarDispatchClub }",
    		ctx
    	});

    	return block;
    }

    // (89:2) {#if OLSKAppToolbarClubLimitText !== '' }
    function create_if_block_4$2(ctx) {
    	let button;
    	let t_value = /*OLSKAppToolbarClubLimitText*/ ctx[3].toString() + "";
    	let t;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text(t_value);
    			attr_dev(button, "class", "OLSKAppToolbarClubLimit OLSKDecorButtonNoStyle svelte-1i8pgw");
    			button.disabled = true;
    			add_location(button, file$c, 90, 3, 3241);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*OLSKAppToolbarClubLimitText*/ 8 && t_value !== (t_value = /*OLSKAppToolbarClubLimitText*/ ctx[3].toString() + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4$2.name,
    		type: "if",
    		source: "(89:2) {#if OLSKAppToolbarClubLimitText !== '' }",
    		ctx
    	});

    	return block;
    }

    // (99:1) {#if OLSKAppToolbarErrorText }
    function create_if_block_2$3(ctx) {
    	let div;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(/*OLSKAppToolbarErrorText*/ ctx[4]);
    			attr_dev(div, "class", "OLSKAppToolbarError OLSKDecorBlink svelte-1i8pgw");
    			add_location(div, file$c, 99, 2, 3476);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*OLSKAppToolbarErrorText*/ 16) set_data_dev(t, /*OLSKAppToolbarErrorText*/ ctx[4]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$3.name,
    		type: "if",
    		source: "(99:1) {#if OLSKAppToolbarErrorText }",
    		ctx
    	});

    	return block;
    }

    // (103:1) {#if OLSKAppToolbarDispatchCloud }
    function create_if_block_1$3(ctx) {
    	let div0;

    	let t0_value = (!/*OLSKAppToolbarCloudConnected*/ ctx[5]
    	? ''
    	: /*OLSKAppToolbarCloudError*/ ctx[7]
    		? main_1('OLSKAppToolbarCloudStatusError')
    		: /*OLSKAppToolbarCloudOffline*/ ctx[6]
    			? main_1('OLSKAppToolbarCloudStatusOffline')
    			: main_1('OLSKAppToolbarCloudStatusOnline')) + "";

    	let t0;
    	let t1;
    	let button;
    	let div1;

    	let raw_value = (/*OLSKAppToolbarCloudError*/ ctx[7]
    	? OLSKUIAssets._OLSKSharedCloudError
    	: /*OLSKAppToolbarCloudOffline*/ ctx[6]
    		? OLSKUIAssets._OLSKSharedCloudOffline
    		: OLSKUIAssets._OLSKSharedCloud) + "";

    	let button_title_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			button = element("button");
    			div1 = element("div");
    			attr_dev(div0, "class", "OLSKAppToolbarCloudStatus svelte-1i8pgw");
    			add_location(div0, file$c, 103, 2, 3604);
    			attr_dev(div1, "class", "OLSKAppToolbarCloudButtonImage svelte-1i8pgw");
    			add_location(div1, file$c, 106, 3, 4107);
    			attr_dev(button, "class", "OLSKAppToolbarCloudButton OLSKDecorButtonNoStyle OLSKDecorTappable OLSKToolbarButton svelte-1i8pgw");
    			attr_dev(button, "title", button_title_value = main_1('OLSKAppToolbarCloudButtonText'));
    			add_location(button, file$c, 105, 2, 3904);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button, anchor);
    			append_dev(button, div1);
    			div1.innerHTML = raw_value;

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchCloud*/ ctx[12])) /*OLSKAppToolbarDispatchCloud*/ ctx[12].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*OLSKAppToolbarCloudConnected, OLSKAppToolbarCloudError, OLSKAppToolbarCloudOffline*/ 224 && t0_value !== (t0_value = (!/*OLSKAppToolbarCloudConnected*/ ctx[5]
    			? ''
    			: /*OLSKAppToolbarCloudError*/ ctx[7]
    				? main_1('OLSKAppToolbarCloudStatusError')
    				: /*OLSKAppToolbarCloudOffline*/ ctx[6]
    					? main_1('OLSKAppToolbarCloudStatusOffline')
    					: main_1('OLSKAppToolbarCloudStatusOnline')) + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*OLSKAppToolbarCloudError, OLSKAppToolbarCloudOffline*/ 192 && raw_value !== (raw_value = (/*OLSKAppToolbarCloudError*/ ctx[7]
    			? OLSKUIAssets._OLSKSharedCloudError
    			: /*OLSKAppToolbarCloudOffline*/ ctx[6]
    				? OLSKUIAssets._OLSKSharedCloudOffline
    				: OLSKUIAssets._OLSKSharedCloud) + "")) div1.innerHTML = raw_value;		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(103:1) {#if OLSKAppToolbarDispatchCloud }",
    		ctx
    	});

    	return block;
    }

    // (111:1) {#if OLSKAppToolbarDispatchLauncher }
    function create_if_block$4(ctx) {
    	let button;
    	let div;
    	let raw_value = OLSKUIAssets._OLSKSharedLauncher + "";
    	let button_title_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			div = element("div");
    			attr_dev(div, "class", "OLSKAppToolbarLauncherButtonImage svelte-1i8pgw");
    			add_location(div, file$c, 112, 3, 4603);
    			attr_dev(button, "class", "OLSKAppToolbarLauncherButton OLSKDecorButtonNoStyle OLSKDecorTappable OLSKToolbarButton svelte-1i8pgw");
    			attr_dev(button, "title", button_title_value = main_1('OLSKAppToolbarLauncherButtonText'));
    			add_location(button, file$c, 111, 2, 4391);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, div);
    			div.innerHTML = raw_value;

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*OLSKAppToolbarDispatchLauncher*/ ctx[13])) /*OLSKAppToolbarDispatchLauncher*/ ctx[13].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(111:1) {#if OLSKAppToolbarDispatchLauncher }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$c(ctx) {
    	let div4;
    	let div0;
    	let current_block_type_index;
    	let if_block0;
    	let t0;
    	let t1;
    	let t2;
    	let div2;
    	let div1;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let div3;
    	let t7;
    	let t8;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_10, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*OLSKAppToolbarDispatchApropos*/ ctx[8]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*OLSKAppToolbarDispatchTongue*/ ctx[9] && create_if_block_9(ctx);
    	let if_block2 = /*OLSKAppToolbarGuideURL*/ ctx[0] && create_if_block_8(ctx);
    	let if_block3 = /*OLSKAppToolbarDispatchFund*/ ctx[10] && !/*OLSKAppToolbarFundShowProgress*/ ctx[1] && create_if_block_6$1(ctx);
    	let if_block4 = /*OLSKAppToolbarFundShowProgress*/ ctx[1] && create_if_block_5$1(ctx);
    	let if_block5 = /*OLSKAppToolbarDispatchClub*/ ctx[11] && create_if_block_3$3(ctx);
    	const default_slot_template = /*#slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);
    	let if_block6 = /*OLSKAppToolbarErrorText*/ ctx[4] && create_if_block_2$3(ctx);
    	let if_block7 = /*OLSKAppToolbarDispatchCloud*/ ctx[12] && create_if_block_1$3(ctx);
    	let if_block8 = /*OLSKAppToolbarDispatchLauncher*/ ctx[13] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			div2 = element("div");
    			div1 = element("div");
    			if (if_block3) if_block3.c();
    			t3 = space();
    			if (if_block4) if_block4.c();
    			t4 = space();
    			if (if_block5) if_block5.c();
    			t5 = space();
    			if (default_slot) default_slot.c();
    			t6 = space();
    			div3 = element("div");
    			if (if_block6) if_block6.c();
    			t7 = space();
    			if (if_block7) if_block7.c();
    			t8 = space();
    			if (if_block8) if_block8.c();
    			attr_dev(div0, "class", "OLSKToolbarElementGroup svelte-1i8pgw");
    			add_location(div0, file$c, 49, 0, 1273);
    			attr_dev(div1, "class", "OLSKAppToolbarFund svelte-1i8pgw");
    			add_location(div1, file$c, 70, 1, 2308);
    			attr_dev(div2, "class", "OLSKToolbarElementGroup svelte-1i8pgw");
    			add_location(div2, file$c, 69, 0, 2269);
    			attr_dev(div3, "class", "OLSKToolbarElementGroup svelte-1i8pgw");
    			add_location(div3, file$c, 97, 0, 3404);
    			attr_dev(div4, "class", "OLSKAppToolbar OLSKToolbar OLSKToolbarJustify OLSKCommonEdgeTop svelte-1i8pgw");
    			add_location(div4, file$c, 47, 0, 1194);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);
    			if_blocks[current_block_type_index].m(div0, null);
    			append_dev(div0, t0);
    			if (if_block1) if_block1.m(div0, null);
    			append_dev(div0, t1);
    			if (if_block2) if_block2.m(div0, null);
    			append_dev(div4, t2);
    			append_dev(div4, div2);
    			append_dev(div2, div1);
    			if (if_block3) if_block3.m(div1, null);
    			append_dev(div1, t3);
    			if (if_block4) if_block4.m(div1, null);
    			append_dev(div2, t4);
    			if (if_block5) if_block5.m(div2, null);
    			append_dev(div2, t5);

    			if (default_slot) {
    				default_slot.m(div2, null);
    			}

    			append_dev(div4, t6);
    			append_dev(div4, div3);
    			if (if_block6) if_block6.m(div3, null);
    			append_dev(div3, t7);
    			if (if_block7) if_block7.m(div3, null);
    			append_dev(div3, t8);
    			if (if_block8) if_block8.m(div3, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(window, "keydown", /*mod*/ ctx[14].InterfaceWindowDidKeydown, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				} else {
    					if_block0.p(ctx, dirty);
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div0, t0);
    			}

    			if (/*OLSKAppToolbarDispatchTongue*/ ctx[9]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_9(ctx);
    					if_block1.c();
    					if_block1.m(div0, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*OLSKAppToolbarGuideURL*/ ctx[0]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_8(ctx);
    					if_block2.c();
    					if_block2.m(div0, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*OLSKAppToolbarDispatchFund*/ ctx[10] && !/*OLSKAppToolbarFundShowProgress*/ ctx[1]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block_6$1(ctx);
    					if_block3.c();
    					if_block3.m(div1, t3);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (/*OLSKAppToolbarFundShowProgress*/ ctx[1]) {
    				if (if_block4) ; else {
    					if_block4 = create_if_block_5$1(ctx);
    					if_block4.c();
    					if_block4.m(div1, null);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}

    			if (/*OLSKAppToolbarDispatchClub*/ ctx[11]) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);
    				} else {
    					if_block5 = create_if_block_3$3(ctx);
    					if_block5.c();
    					if_block5.m(div2, t5);
    				}
    			} else if (if_block5) {
    				if_block5.d(1);
    				if_block5 = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32768)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[15],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[15])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[15], dirty, null),
    						null
    					);
    				}
    			}

    			if (/*OLSKAppToolbarErrorText*/ ctx[4]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);
    				} else {
    					if_block6 = create_if_block_2$3(ctx);
    					if_block6.c();
    					if_block6.m(div3, t7);
    				}
    			} else if (if_block6) {
    				if_block6.d(1);
    				if_block6 = null;
    			}

    			if (/*OLSKAppToolbarDispatchCloud*/ ctx[12]) {
    				if (if_block7) {
    					if_block7.p(ctx, dirty);
    				} else {
    					if_block7 = create_if_block_1$3(ctx);
    					if_block7.c();
    					if_block7.m(div3, t8);
    				}
    			} else if (if_block7) {
    				if_block7.d(1);
    				if_block7 = null;
    			}

    			if (/*OLSKAppToolbarDispatchLauncher*/ ctx[13]) {
    				if (if_block8) {
    					if_block8.p(ctx, dirty);
    				} else {
    					if_block8 = create_if_block$4(ctx);
    					if_block8.c();
    					if_block8.m(div3, null);
    				}
    			} else if (if_block8) {
    				if_block8.d(1);
    				if_block8 = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (default_slot) default_slot.d(detaching);
    			if (if_block6) if_block6.d();
    			if (if_block7) if_block7.d();
    			if (if_block8) if_block8.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, ['default']);
    	let { OLSKAppToolbarGuideURL = '' } = $$props;
    	let { OLSKAppToolbarFundShowProgress = false } = $$props;
    	let { OLSKAppToolbarFundLimitText = '' } = $$props;
    	let { OLSKAppToolbarClubLimitText = '' } = $$props;
    	let { OLSKAppToolbarErrorText = '' } = $$props;
    	let { OLSKAppToolbarCloudConnected = false } = $$props;
    	let { OLSKAppToolbarCloudOffline = false } = $$props;
    	let { OLSKAppToolbarCloudError = false } = $$props;
    	let { OLSKAppToolbarDispatchApropos = null } = $$props;
    	let { OLSKAppToolbarDispatchTongue = null } = $$props;
    	let { OLSKAppToolbarDispatchFund = null } = $$props;
    	let { OLSKAppToolbarDispatchClub = null } = $$props;
    	let { OLSKAppToolbarDispatchCloud = null } = $$props;
    	let { OLSKAppToolbarDispatchLauncher = null } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceWindowDidKeydown(event) {
    			const handlerFunctions = {
    				Space() {
    					if (!event.altKey) {
    						return;
    					}

    					OLSKAppToolbarDispatchLauncher();
    					return event.preventDefault();
    				}
    			};

    			handlerFunctions[event.code] && handlerFunctions[event.code]();
    		}
    	};

    	const writable_props = [
    		'OLSKAppToolbarGuideURL',
    		'OLSKAppToolbarFundShowProgress',
    		'OLSKAppToolbarFundLimitText',
    		'OLSKAppToolbarClubLimitText',
    		'OLSKAppToolbarErrorText',
    		'OLSKAppToolbarCloudConnected',
    		'OLSKAppToolbarCloudOffline',
    		'OLSKAppToolbarCloudError',
    		'OLSKAppToolbarDispatchApropos',
    		'OLSKAppToolbarDispatchTongue',
    		'OLSKAppToolbarDispatchFund',
    		'OLSKAppToolbarDispatchClub',
    		'OLSKAppToolbarDispatchCloud',
    		'OLSKAppToolbarDispatchLauncher'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('OLSKAppToolbarGuideURL' in $$props) $$invalidate(0, OLSKAppToolbarGuideURL = $$props.OLSKAppToolbarGuideURL);
    		if ('OLSKAppToolbarFundShowProgress' in $$props) $$invalidate(1, OLSKAppToolbarFundShowProgress = $$props.OLSKAppToolbarFundShowProgress);
    		if ('OLSKAppToolbarFundLimitText' in $$props) $$invalidate(2, OLSKAppToolbarFundLimitText = $$props.OLSKAppToolbarFundLimitText);
    		if ('OLSKAppToolbarClubLimitText' in $$props) $$invalidate(3, OLSKAppToolbarClubLimitText = $$props.OLSKAppToolbarClubLimitText);
    		if ('OLSKAppToolbarErrorText' in $$props) $$invalidate(4, OLSKAppToolbarErrorText = $$props.OLSKAppToolbarErrorText);
    		if ('OLSKAppToolbarCloudConnected' in $$props) $$invalidate(5, OLSKAppToolbarCloudConnected = $$props.OLSKAppToolbarCloudConnected);
    		if ('OLSKAppToolbarCloudOffline' in $$props) $$invalidate(6, OLSKAppToolbarCloudOffline = $$props.OLSKAppToolbarCloudOffline);
    		if ('OLSKAppToolbarCloudError' in $$props) $$invalidate(7, OLSKAppToolbarCloudError = $$props.OLSKAppToolbarCloudError);
    		if ('OLSKAppToolbarDispatchApropos' in $$props) $$invalidate(8, OLSKAppToolbarDispatchApropos = $$props.OLSKAppToolbarDispatchApropos);
    		if ('OLSKAppToolbarDispatchTongue' in $$props) $$invalidate(9, OLSKAppToolbarDispatchTongue = $$props.OLSKAppToolbarDispatchTongue);
    		if ('OLSKAppToolbarDispatchFund' in $$props) $$invalidate(10, OLSKAppToolbarDispatchFund = $$props.OLSKAppToolbarDispatchFund);
    		if ('OLSKAppToolbarDispatchClub' in $$props) $$invalidate(11, OLSKAppToolbarDispatchClub = $$props.OLSKAppToolbarDispatchClub);
    		if ('OLSKAppToolbarDispatchCloud' in $$props) $$invalidate(12, OLSKAppToolbarDispatchCloud = $$props.OLSKAppToolbarDispatchCloud);
    		if ('OLSKAppToolbarDispatchLauncher' in $$props) $$invalidate(13, OLSKAppToolbarDispatchLauncher = $$props.OLSKAppToolbarDispatchLauncher);
    		if ('$$scope' in $$props) $$invalidate(15, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		OLSKAppToolbarGuideURL,
    		OLSKAppToolbarFundShowProgress,
    		OLSKAppToolbarFundLimitText,
    		OLSKAppToolbarClubLimitText,
    		OLSKAppToolbarErrorText,
    		OLSKAppToolbarCloudConnected,
    		OLSKAppToolbarCloudOffline,
    		OLSKAppToolbarCloudError,
    		OLSKAppToolbarDispatchApropos,
    		OLSKAppToolbarDispatchTongue,
    		OLSKAppToolbarDispatchFund,
    		OLSKAppToolbarDispatchClub,
    		OLSKAppToolbarDispatchCloud,
    		OLSKAppToolbarDispatchLauncher,
    		OLSKLocalized: main_1,
    		mod,
    		OLSKReloadButton: Main$b,
    		OLSKUIAssets
    	});

    	$$self.$inject_state = $$props => {
    		if ('OLSKAppToolbarGuideURL' in $$props) $$invalidate(0, OLSKAppToolbarGuideURL = $$props.OLSKAppToolbarGuideURL);
    		if ('OLSKAppToolbarFundShowProgress' in $$props) $$invalidate(1, OLSKAppToolbarFundShowProgress = $$props.OLSKAppToolbarFundShowProgress);
    		if ('OLSKAppToolbarFundLimitText' in $$props) $$invalidate(2, OLSKAppToolbarFundLimitText = $$props.OLSKAppToolbarFundLimitText);
    		if ('OLSKAppToolbarClubLimitText' in $$props) $$invalidate(3, OLSKAppToolbarClubLimitText = $$props.OLSKAppToolbarClubLimitText);
    		if ('OLSKAppToolbarErrorText' in $$props) $$invalidate(4, OLSKAppToolbarErrorText = $$props.OLSKAppToolbarErrorText);
    		if ('OLSKAppToolbarCloudConnected' in $$props) $$invalidate(5, OLSKAppToolbarCloudConnected = $$props.OLSKAppToolbarCloudConnected);
    		if ('OLSKAppToolbarCloudOffline' in $$props) $$invalidate(6, OLSKAppToolbarCloudOffline = $$props.OLSKAppToolbarCloudOffline);
    		if ('OLSKAppToolbarCloudError' in $$props) $$invalidate(7, OLSKAppToolbarCloudError = $$props.OLSKAppToolbarCloudError);
    		if ('OLSKAppToolbarDispatchApropos' in $$props) $$invalidate(8, OLSKAppToolbarDispatchApropos = $$props.OLSKAppToolbarDispatchApropos);
    		if ('OLSKAppToolbarDispatchTongue' in $$props) $$invalidate(9, OLSKAppToolbarDispatchTongue = $$props.OLSKAppToolbarDispatchTongue);
    		if ('OLSKAppToolbarDispatchFund' in $$props) $$invalidate(10, OLSKAppToolbarDispatchFund = $$props.OLSKAppToolbarDispatchFund);
    		if ('OLSKAppToolbarDispatchClub' in $$props) $$invalidate(11, OLSKAppToolbarDispatchClub = $$props.OLSKAppToolbarDispatchClub);
    		if ('OLSKAppToolbarDispatchCloud' in $$props) $$invalidate(12, OLSKAppToolbarDispatchCloud = $$props.OLSKAppToolbarDispatchCloud);
    		if ('OLSKAppToolbarDispatchLauncher' in $$props) $$invalidate(13, OLSKAppToolbarDispatchLauncher = $$props.OLSKAppToolbarDispatchLauncher);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		OLSKAppToolbarGuideURL,
    		OLSKAppToolbarFundShowProgress,
    		OLSKAppToolbarFundLimitText,
    		OLSKAppToolbarClubLimitText,
    		OLSKAppToolbarErrorText,
    		OLSKAppToolbarCloudConnected,
    		OLSKAppToolbarCloudOffline,
    		OLSKAppToolbarCloudError,
    		OLSKAppToolbarDispatchApropos,
    		OLSKAppToolbarDispatchTongue,
    		OLSKAppToolbarDispatchFund,
    		OLSKAppToolbarDispatchClub,
    		OLSKAppToolbarDispatchCloud,
    		OLSKAppToolbarDispatchLauncher,
    		mod,
    		$$scope,
    		slots
    	];
    }

    class Main$c extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {
    			OLSKAppToolbarGuideURL: 0,
    			OLSKAppToolbarFundShowProgress: 1,
    			OLSKAppToolbarFundLimitText: 2,
    			OLSKAppToolbarClubLimitText: 3,
    			OLSKAppToolbarErrorText: 4,
    			OLSKAppToolbarCloudConnected: 5,
    			OLSKAppToolbarCloudOffline: 6,
    			OLSKAppToolbarCloudError: 7,
    			OLSKAppToolbarDispatchApropos: 8,
    			OLSKAppToolbarDispatchTongue: 9,
    			OLSKAppToolbarDispatchFund: 10,
    			OLSKAppToolbarDispatchClub: 11,
    			OLSKAppToolbarDispatchCloud: 12,
    			OLSKAppToolbarDispatchLauncher: 13
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$c.name
    		});
    	}

    	get OLSKAppToolbarGuideURL() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarGuideURL(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarFundShowProgress() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarFundShowProgress(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarFundLimitText() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarFundLimitText(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarClubLimitText() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarClubLimitText(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarErrorText() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarErrorText(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarCloudConnected() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarCloudConnected(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarCloudOffline() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarCloudOffline(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarCloudError() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarCloudError(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchApropos() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchApropos(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchTongue() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchTongue(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchFund() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchFund(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchClub() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchClub(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchCloud() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchCloud(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAppToolbarDispatchLauncher() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAppToolbarDispatchLauncher(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/OLSKServiceWorker/main.svelte generated by Svelte v3.59.2 */

    const { console: console_1 } = globals;
    const file$d = "node_modules/OLSKServiceWorker/main.svelte";

    // (104:0) {#if mod._ValueUpdateAlertIsVisible }
    function create_if_block$5(ctx) {
    	let div;
    	let span;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			span = element("span");
    			span.textContent = `${main_1('OLSKServiceWorkerUpdateAlertLabelText')}`;
    			t1 = space();
    			button = element("button");
    			button.textContent = `${main_1('OLSKServiceWorkerUpdateAlertReloadButtonText')}`;
    			attr_dev(span, "class", "OLSKServiceWorkerUpdateAlertLabel svelte-o3rgu5");
    			add_location(span, file$d, 105, 1, 2509);
    			attr_dev(button, "class", "OLSKServiceWorkerUpdateAlertReloadButton OLSKDecorPress OLSKDecorPressCall svelte-o3rgu5");
    			add_location(button, file$d, 106, 1, 2624);
    			attr_dev(div, "class", "OLSKServiceWorkerUpdateAlert svelte-o3rgu5");
    			add_location(div, file$d, 104, 0, 2407);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, span);
    			append_dev(div, t1);
    			append_dev(div, button);

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button,
    						"click",
    						function () {
    							if (is_function(/*mod*/ ctx[0].InterfaceReloadButtonDidClick)) /*mod*/ ctx[0].InterfaceReloadButtonDidClick.apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					),
    					listen_dev(div, "click", /*click_handler*/ ctx[5], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(104:0) {#if mod._ValueUpdateAlertIsVisible }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$d(ctx) {
    	let if_block_anchor;
    	let if_block = /*mod*/ ctx[0]._ValueUpdateAlertIsVisible && create_if_block$5(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*mod*/ ctx[0]._ValueUpdateAlertIsVisible) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$d.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { OLSKServiceWorkerRegistrationRoute } = $$props;
    	let { DebugFakeUpdateAlertVisible = false } = $$props;
    	let { DebugEnableLogging = true } = $$props;
    	let { DebugAllowLocalhost = false } = $$props;

    	const mod = {
    		// VALUE
    		_ValueRegistration: undefined,
    		_ValueNextWorker: undefined,
    		_ValueUpdateAlertIsVisible: DebugFakeUpdateAlertVisible,
    		// INTERFACE
    		InterfaceReloadButtonDidClick() {
    			mod.ControlSkipWaiting();
    		},
    		// CONTROL
    		ControlSkipWaiting() {
    			mod._ValueNextWorker.postMessage('OLSKServiceWorker_SkipWaiting');
    		},
    		// MESSAGE
    		MessageUpdateFound(event) {
    			DebugEnableLogging && console.log('updatefound', event);
    			$$invalidate(0, mod._ValueNextWorker = mod._ValueRegistration.installing, mod);
    			mod._ValueNextWorker.addEventListener('statechange', mod.MessageNextWorkerStateChange);
    		},
    		MessageNextWorkerStateChange(event) {
    			DebugEnableLogging && console.log('statechange', mod._ValueNextWorker.state, event, navigator.serviceWorker.controller);

    			if (mod._ValueNextWorker.state !== 'installed') {
    				return;
    			}

    			if (!navigator.serviceWorker.controller) {
    				return;
    			}

    			$$invalidate(0, mod._ValueUpdateAlertIsVisible = true, mod);
    		},
    		MessageControllerChange(event) {
    			DebugEnableLogging && console.log('controllerchange', event);
    			window.location.reload();
    		},
    		// SETUP
    		async SetupEverything() {
    			if (!navigator.serviceWorker) {
    				return DebugEnableLogging && console.info('Service worker not available');
    			}

    			if (!OLSKServiceWorkerRegistrationRoute) {
    				return DebugEnableLogging && console.info('Missing registration route');
    			}

    			if (document.location.hostname === 'localhost' && !DebugAllowLocalhost) {
    				return DebugEnableLogging && console.info('OLSKServiceWorker: Skipping on localhost');
    			}
    			await mod.SetupRegistration();
    			mod.SetupControllerChange();
    		},
    		async SetupRegistration() {
    			$$invalidate(0, mod._ValueRegistration = await navigator.serviceWorker.register(OLSKServiceWorkerRegistrationRoute), mod);
    			DebugEnableLogging && console.info('Service Worker Registered');
    			mod._ValueRegistration.addEventListener('updatefound', mod.MessageUpdateFound);
    		},
    		SetupControllerChange() {
    			navigator.serviceWorker.addEventListener('controllerchange', mod.MessageControllerChange);
    		},
    		// LIFECYCLE
    		LifecycleModuleDidMount() {
    			mod.SetupEverything();
    		}
    	};

    	mod.LifecycleModuleDidMount();

    	$$self.$$.on_mount.push(function () {
    		if (OLSKServiceWorkerRegistrationRoute === undefined && !('OLSKServiceWorkerRegistrationRoute' in $$props || $$self.$$.bound[$$self.$$.props['OLSKServiceWorkerRegistrationRoute']])) {
    			console_1.warn("<Main> was created without expected prop 'OLSKServiceWorkerRegistrationRoute'");
    		}
    	});

    	const writable_props = [
    		'OLSKServiceWorkerRegistrationRoute',
    		'DebugFakeUpdateAlertVisible',
    		'DebugEnableLogging',
    		'DebugAllowLocalhost'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(0, mod._ValueUpdateAlertIsVisible = false, mod);

    	$$self.$$set = $$props => {
    		if ('OLSKServiceWorkerRegistrationRoute' in $$props) $$invalidate(1, OLSKServiceWorkerRegistrationRoute = $$props.OLSKServiceWorkerRegistrationRoute);
    		if ('DebugFakeUpdateAlertVisible' in $$props) $$invalidate(2, DebugFakeUpdateAlertVisible = $$props.DebugFakeUpdateAlertVisible);
    		if ('DebugEnableLogging' in $$props) $$invalidate(3, DebugEnableLogging = $$props.DebugEnableLogging);
    		if ('DebugAllowLocalhost' in $$props) $$invalidate(4, DebugAllowLocalhost = $$props.DebugAllowLocalhost);
    	};

    	$$self.$capture_state = () => ({
    		OLSKServiceWorkerRegistrationRoute,
    		DebugFakeUpdateAlertVisible,
    		DebugEnableLogging,
    		DebugAllowLocalhost,
    		OLSKLocalized: main_1,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('OLSKServiceWorkerRegistrationRoute' in $$props) $$invalidate(1, OLSKServiceWorkerRegistrationRoute = $$props.OLSKServiceWorkerRegistrationRoute);
    		if ('DebugFakeUpdateAlertVisible' in $$props) $$invalidate(2, DebugFakeUpdateAlertVisible = $$props.DebugFakeUpdateAlertVisible);
    		if ('DebugEnableLogging' in $$props) $$invalidate(3, DebugEnableLogging = $$props.DebugEnableLogging);
    		if ('DebugAllowLocalhost' in $$props) $$invalidate(4, DebugAllowLocalhost = $$props.DebugAllowLocalhost);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		mod,
    		OLSKServiceWorkerRegistrationRoute,
    		DebugFakeUpdateAlertVisible,
    		DebugEnableLogging,
    		DebugAllowLocalhost,
    		click_handler
    	];
    }

    class Main$d extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
    			OLSKServiceWorkerRegistrationRoute: 1,
    			DebugFakeUpdateAlertVisible: 2,
    			DebugEnableLogging: 3,
    			DebugAllowLocalhost: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$d.name
    		});
    	}

    	get OLSKServiceWorkerRegistrationRoute() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKServiceWorkerRegistrationRoute(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugFakeUpdateAlertVisible() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugFakeUpdateAlertVisible(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugEnableLogging() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugEnableLogging(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get DebugAllowLocalhost() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set DebugAllowLocalhost(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function e$1(e,t){for(var o=0;o<t.length;o++){var n=t[o];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(e,n.key,n);}}function t(e){return function(e){if(Array.isArray(e))return o(e)}(e)||function(e){if("undefined"!=typeof Symbol&&Symbol.iterator in Object(e))return Array.from(e)}(e)||function(e,t){if(!e)return;if("string"==typeof e)return o(e,t);var n=Object.prototype.toString.call(e).slice(8,-1);"Object"===n&&e.constructor&&(n=e.constructor.name);if("Map"===n||"Set"===n)return Array.from(e);if("Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))return o(e,t)}(e)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function o(e,t){(null==t||t>e.length)&&(t=e.length);for(var o=0,n=new Array(t);o<t;o++)n[o]=e[o];return n}var n,i,a,r,s,l=(n=["a[href]","area[href]",'input:not([disabled]):not([type="hidden"]):not([aria-hidden])',"select:not([disabled]):not([aria-hidden])","textarea:not([disabled]):not([aria-hidden])","button:not([disabled]):not([aria-hidden])","iframe","object","embed","[contenteditable]",'[tabindex]:not([tabindex^="-"])'],i=function(){function o(e){var n=e.targetModal,i=e.triggers,a=void 0===i?[]:i,r=e.onShow,s=void 0===r?function(){}:r,l=e.onClose,c=void 0===l?function(){}:l,d=e.openTrigger,u=void 0===d?"data-micromodal-trigger":d,f=e.closeTrigger,h=void 0===f?"data-micromodal-close":f,v=e.openClass,g=void 0===v?"is-open":v,m=e.disableScroll,b=void 0!==m&&m,y=e.disableFocus,p=void 0!==y&&y,w=e.awaitCloseAnimation,E=void 0!==w&&w,k=e.awaitOpenAnimation,M=void 0!==k&&k,A=e.debugMode,C=void 0!==A&&A;!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,o),this.modal=document.getElementById(n),this.config={debugMode:C,disableScroll:b,openTrigger:u,closeTrigger:h,openClass:g,onShow:s,onClose:c,awaitCloseAnimation:E,awaitOpenAnimation:M,disableFocus:p},a.length>0&&this.registerTriggers.apply(this,t(a)),this.onClick=this.onClick.bind(this),this.onKeydown=this.onKeydown.bind(this);}var i,a;return i=o,(a=[{key:"registerTriggers",value:function(){for(var e=this,t=arguments.length,o=new Array(t),n=0;n<t;n++)o[n]=arguments[n];o.filter(Boolean).forEach((function(t){t.addEventListener("click",(function(t){return e.showModal(t)}));}));}},{key:"showModal",value:function(){var e=this,t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:null;if(this.activeElement=document.activeElement,this.modal.setAttribute("aria-hidden","false"),this.modal.classList.add(this.config.openClass),this.scrollBehaviour("disable"),this.addEventListeners(),this.config.awaitOpenAnimation){var o=function t(){e.modal.removeEventListener("animationend",t,!1),e.setFocusToFirstNode();};this.modal.addEventListener("animationend",o,!1);}else this.setFocusToFirstNode();this.config.onShow(this.modal,this.activeElement,t);}},{key:"closeModal",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:null,t=this.modal;if(this.modal.setAttribute("aria-hidden","true"),this.removeEventListeners(),this.scrollBehaviour("enable"),this.activeElement&&this.activeElement.focus&&this.activeElement.focus(),this.config.onClose(this.modal,this.activeElement,e),this.config.awaitCloseAnimation){var o=this.config.openClass;this.modal.addEventListener("animationend",(function e(){t.classList.remove(o),t.removeEventListener("animationend",e,!1);}),!1);}else t.classList.remove(this.config.openClass);}},{key:"closeModalById",value:function(e){this.modal=document.getElementById(e),this.modal&&this.closeModal();}},{key:"scrollBehaviour",value:function(e){if(this.config.disableScroll){var t=document.querySelector("body");switch(e){case"enable":Object.assign(t.style,{overflow:""});break;case"disable":Object.assign(t.style,{overflow:"hidden"});}}}},{key:"addEventListeners",value:function(){this.modal.addEventListener("touchstart",this.onClick),this.modal.addEventListener("click",this.onClick),document.addEventListener("keydown",this.onKeydown);}},{key:"removeEventListeners",value:function(){this.modal.removeEventListener("touchstart",this.onClick),this.modal.removeEventListener("click",this.onClick),document.removeEventListener("keydown",this.onKeydown);}},{key:"onClick",value:function(e){(e.target.hasAttribute(this.config.closeTrigger)||e.target.parentNode.hasAttribute(this.config.closeTrigger))&&(e.preventDefault(),e.stopPropagation(),this.closeModal(e));}},{key:"onKeydown",value:function(e){27===e.keyCode&&this.closeModal(e),9===e.keyCode&&this.retainFocus(e);}},{key:"getFocusableNodes",value:function(){var e=this.modal.querySelectorAll(n);return Array.apply(void 0,t(e))}},{key:"setFocusToFirstNode",value:function(){var e=this;if(!this.config.disableFocus){var t=this.getFocusableNodes();if(0!==t.length){var o=t.filter((function(t){return !t.hasAttribute(e.config.closeTrigger)}));o.length>0&&o[0].focus(),0===o.length&&t[0].focus();}}}},{key:"retainFocus",value:function(e){var t=this.getFocusableNodes();if(0!==t.length)if(t=t.filter((function(e){return null!==e.offsetParent})),this.modal.contains(document.activeElement)){var o=t.indexOf(document.activeElement);e.shiftKey&&0===o&&(t[t.length-1].focus(),e.preventDefault()),!e.shiftKey&&t.length>0&&o===t.length-1&&(t[0].focus(),e.preventDefault());}else t[0].focus();}}])&&e$1(i.prototype,a),o}(),a=null,r=function(e){if(!document.getElementById(e))return console.warn("MicroModal: ❗Seems like you have missed %c'".concat(e,"'"),"background-color: #f8f9fa;color: #50596c;font-weight: bold;","ID somewhere in your code. Refer example below to resolve it."),console.warn("%cExample:","background-color: #f8f9fa;color: #50596c;font-weight: bold;",'<div class="modal" id="'.concat(e,'"></div>')),!1},s=function(e,t){if(function(e){e.length<=0&&(console.warn("MicroModal: ❗Please specify at least one %c'micromodal-trigger'","background-color: #f8f9fa;color: #50596c;font-weight: bold;","data attribute."),console.warn("%cExample:","background-color: #f8f9fa;color: #50596c;font-weight: bold;",'<a href="#" data-micromodal-trigger="my-modal"></a>'));}(e),!t)return !0;for(var o in t)r(o);return !0},{init:function(e){var o=Object.assign({},{openTrigger:"data-micromodal-trigger"},e),n=t(document.querySelectorAll("[".concat(o.openTrigger,"]"))),r=function(e,t){var o=[];return e.forEach((function(e){var n=e.attributes[t].value;void 0===o[n]&&(o[n]=[]),o[n].push(e);})),o}(n,o.openTrigger);if(!0!==o.debugMode||!1!==s(n,r))for(var l in r){var c=r[l];o.targetModal=l,o.triggers=t(c),a=new i(o);}},show:function(e,t){var o=t||{};o.targetModal=e,!0===o.debugMode&&!1===r(e)||(a&&a.removeEventListeners(),(a=new i(o)).showModal());},close:function(e){e?a.closeModalById(e):a.closeModal();}});"undefined"!=typeof window&&(window.MicroModal=l);

    /* node_modules/OLSKStandardView/main.svelte generated by Svelte v3.59.2 */

    const file$e = "node_modules/OLSKStandardView/main.svelte";
    const get_OLSKStandardViewTail_slot_changes = dirty => ({});
    const get_OLSKStandardViewTail_slot_context = ctx => ({});
    const get_OLSKStandardViewHead_slot_changes = dirty => ({});
    const get_OLSKStandardViewHead_slot_context = ctx => ({});

    // (2:1) {#if $$slots.OLSKStandardViewHead}
    function create_if_block_2$4(ctx) {
    	let div;
    	let current;
    	const OLSKStandardViewHead_slot_template = /*#slots*/ ctx[2].OLSKStandardViewHead;
    	const OLSKStandardViewHead_slot = create_slot(OLSKStandardViewHead_slot_template, ctx, /*$$scope*/ ctx[1], get_OLSKStandardViewHead_slot_context);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (OLSKStandardViewHead_slot) OLSKStandardViewHead_slot.c();
    			attr_dev(div, "class", "OLSKStandardViewHead OLSKDecorFixedHeader svelte-hvaqwn");
    			add_location(div, file$e, 2, 2, 84);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (OLSKStandardViewHead_slot) {
    				OLSKStandardViewHead_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (OLSKStandardViewHead_slot) {
    				if (OLSKStandardViewHead_slot.p && (!current || dirty & /*$$scope*/ 2)) {
    					update_slot_base(
    						OLSKStandardViewHead_slot,
    						OLSKStandardViewHead_slot_template,
    						ctx,
    						/*$$scope*/ ctx[1],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
    						: get_slot_changes(OLSKStandardViewHead_slot_template, /*$$scope*/ ctx[1], dirty, get_OLSKStandardViewHead_slot_changes),
    						get_OLSKStandardViewHead_slot_context
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(OLSKStandardViewHead_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(OLSKStandardViewHead_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (OLSKStandardViewHead_slot) OLSKStandardViewHead_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$4.name,
    		type: "if",
    		source: "(2:1) {#if $$slots.OLSKStandardViewHead}",
    		ctx
    	});

    	return block;
    }

    // (8:1) {#if $$slots.default }
    function create_if_block_1$4(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[2].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr_dev(div, "class", "OLSKStandardViewBody OLSKDecorFixedSecondary svelte-hvaqwn");
    			add_location(div, file$e, 8, 2, 229);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 2)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[1],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$4.name,
    		type: "if",
    		source: "(8:1) {#if $$slots.default }",
    		ctx
    	});

    	return block;
    }

    // (14:1) {#if $$slots.OLSKStandardViewTail}
    function create_if_block$6(ctx) {
    	let div;
    	let current;
    	const OLSKStandardViewTail_slot_template = /*#slots*/ ctx[2].OLSKStandardViewTail;
    	const OLSKStandardViewTail_slot = create_slot(OLSKStandardViewTail_slot_template, ctx, /*$$scope*/ ctx[1], get_OLSKStandardViewTail_slot_context);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (OLSKStandardViewTail_slot) OLSKStandardViewTail_slot.c();
    			attr_dev(div, "class", "OLSKStandardViewTail");
    			add_location(div, file$e, 14, 2, 360);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (OLSKStandardViewTail_slot) {
    				OLSKStandardViewTail_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (OLSKStandardViewTail_slot) {
    				if (OLSKStandardViewTail_slot.p && (!current || dirty & /*$$scope*/ 2)) {
    					update_slot_base(
    						OLSKStandardViewTail_slot,
    						OLSKStandardViewTail_slot_template,
    						ctx,
    						/*$$scope*/ ctx[1],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
    						: get_slot_changes(OLSKStandardViewTail_slot_template, /*$$scope*/ ctx[1], dirty, get_OLSKStandardViewTail_slot_changes),
    						get_OLSKStandardViewTail_slot_context
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(OLSKStandardViewTail_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(OLSKStandardViewTail_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (OLSKStandardViewTail_slot) OLSKStandardViewTail_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(14:1) {#if $$slots.OLSKStandardViewTail}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$e(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let if_block0 = /*$$slots*/ ctx[0].OLSKStandardViewHead && create_if_block_2$4(ctx);
    	let if_block1 = /*$$slots*/ ctx[0].default && create_if_block_1$4(ctx);
    	let if_block2 = /*$$slots*/ ctx[0].OLSKStandardViewTail && create_if_block$6(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			attr_dev(div, "class", "OLSKStandardView OLSKDecorFixed svelte-hvaqwn");
    			add_location(div, file$e, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append_dev(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$$slots*/ ctx[0].OLSKStandardViewHead) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*$$slots*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2$4(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*$$slots*/ ctx[0].default) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*$$slots*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*$$slots*/ ctx[0].OLSKStandardViewTail) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*$$slots*/ 1) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$6(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$e.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, ['OLSKStandardViewHead','default','OLSKStandardViewTail']);
    	const $$slots = compute_slots(slots);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate(1, $$scope = $$props.$$scope);
    	};

    	return [$$slots, $$scope, slots];
    }

    class Main$e extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$e.name
    		});
    	}
    }

    /* node_modules/OLSKModalView/main.svelte generated by Svelte v3.59.2 */
    const file$f = "node_modules/OLSKModalView/main.svelte";
    const get_OLSKStandardViewTail_slot_changes$1 = dirty => ({});
    const get_OLSKStandardViewTail_slot_context$1 = ctx => ({});

    // (84:0) {#if mod._ValueIsVisible }
    function create_if_block$7(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let olskstandardview;
    	let div0_aria_labelledby_value;
    	let div2_id_value;
    	let current;

    	olskstandardview = new Main$e({
    			props: {
    				$$slots: {
    					OLSKStandardViewTail: [create_OLSKStandardViewTail_slot],
    					OLSKStandardViewHead: [create_OLSKStandardViewHead_slot],
    					default: [create_default_slot]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(olskstandardview.$$.fragment);
    			attr_dev(div0, "class", "OLSKModalViewContainer svelte-16rd7qp");
    			attr_dev(div0, "role", "dialog");
    			attr_dev(div0, "aria-modal", "true");
    			attr_dev(div0, "aria-labelledby", div0_aria_labelledby_value = /*mod*/ ctx[3]._DataRandomTitleID);
    			add_location(div0, file$f, 87, 2, 1723);
    			attr_dev(div1, "class", "OLSKModalViewOverlay svelte-16rd7qp");
    			attr_dev(div1, "tabindex", "-1");
    			attr_dev(div1, "data-micromodal-close", "");
    			add_location(div1, file$f, 86, 1, 1650);
    			attr_dev(div2, "class", "OLSKModalView svelte-16rd7qp");
    			attr_dev(div2, "id", div2_id_value = /*mod*/ ctx[3]._DataRandomID);
    			attr_dev(div2, "aria-hidden", "true");
    			toggle_class(div2, "OLSKModalViewCapped", /*OLSKModalViewIsCapped*/ ctx[2]);
    			add_location(div2, file$f, 85, 0, 1525);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			mount_component(olskstandardview, div0, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const olskstandardview_changes = {};

    			if (dirty & /*$$scope, $$slots, mod, OLSKModalViewCloseText, OLSKModalViewTitleText*/ 283) {
    				olskstandardview_changes.$$scope = { dirty, ctx };
    			}

    			olskstandardview.$set(olskstandardview_changes);

    			if (!current || dirty & /*mod*/ 8 && div0_aria_labelledby_value !== (div0_aria_labelledby_value = /*mod*/ ctx[3]._DataRandomTitleID)) {
    				attr_dev(div0, "aria-labelledby", div0_aria_labelledby_value);
    			}

    			if (!current || dirty & /*mod*/ 8 && div2_id_value !== (div2_id_value = /*mod*/ ctx[3]._DataRandomID)) {
    				attr_dev(div2, "id", div2_id_value);
    			}

    			if (!current || dirty & /*OLSKModalViewIsCapped*/ 4) {
    				toggle_class(div2, "OLSKModalViewCapped", /*OLSKModalViewIsCapped*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(olskstandardview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(olskstandardview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(olskstandardview);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$7.name,
    		type: "if",
    		source: "(84:0) {#if mod._ValueIsVisible }",
    		ctx
    	});

    	return block;
    }

    // (89:3) <OLSKStandardView>
    function create_default_slot(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[8],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[8])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[8], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(89:3) <OLSKStandardView>",
    		ctx
    	});

    	return block;
    }

    // (90:4) 
    function create_OLSKStandardViewHead_slot(ctx) {
    	let div3;
    	let div0;
    	let t1;
    	let div1;
    	let span;
    	let t2;
    	let span_id_value;
    	let t3;
    	let div2;
    	let button;
    	let t4_value = (/*OLSKModalViewCloseText*/ ctx[1] || main_1('OLSKModalViewCloseButtonText')) + "";
    	let t4;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div0 = element("div");
    			div0.textContent = " ";
    			t1 = space();
    			div1 = element("div");
    			span = element("span");
    			t2 = text(/*OLSKModalViewTitleText*/ ctx[0]);
    			t3 = space();
    			div2 = element("div");
    			button = element("button");
    			t4 = text(t4_value);
    			attr_dev(div0, "class", "OLSKToolbarElementGroup");
    			add_location(div0, file$f, 90, 5, 1978);
    			attr_dev(span, "class", "OLSKModalViewTitle svelte-16rd7qp");
    			attr_dev(span, "id", span_id_value = /*mod*/ ctx[3]._DataRandomTitleID);
    			add_location(span, file$f, 93, 6, 2078);
    			attr_dev(div1, "class", "OLSKToolbarElementGroup");
    			add_location(div1, file$f, 92, 5, 2034);
    			attr_dev(button, "class", "OLSKModalViewCloseButton OLSKDecorButtonNoStyle OLSKDecorTappable");
    			add_location(button, file$f, 97, 6, 2237);
    			attr_dev(div2, "class", "OLSKToolbarElementGroup");
    			add_location(div2, file$f, 96, 5, 2193);
    			attr_dev(div3, "class", "OLSKModalViewHead OLSKToolbar OLSKCommonEdgeBottom OLSKToolbarJustify svelte-16rd7qp");
    			attr_dev(div3, "slot", "OLSKStandardViewHead");
    			add_location(div3, file$f, 89, 4, 1861);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div0);
    			append_dev(div3, t1);
    			append_dev(div3, div1);
    			append_dev(div1, span);
    			append_dev(span, t2);
    			append_dev(div3, t3);
    			append_dev(div3, div2);
    			append_dev(div2, button);
    			append_dev(button, t4);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*mod*/ ctx[3].ControlClose)) /*mod*/ ctx[3].ControlClose.apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*OLSKModalViewTitleText*/ 1) set_data_dev(t2, /*OLSKModalViewTitleText*/ ctx[0]);

    			if (dirty & /*mod*/ 8 && span_id_value !== (span_id_value = /*mod*/ ctx[3]._DataRandomTitleID)) {
    				attr_dev(span, "id", span_id_value);
    			}

    			if (dirty & /*OLSKModalViewCloseText*/ 2 && t4_value !== (t4_value = (/*OLSKModalViewCloseText*/ ctx[1] || main_1('OLSKModalViewCloseButtonText')) + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_OLSKStandardViewHead_slot.name,
    		type: "slot",
    		source: "(90:4) ",
    		ctx
    	});

    	return block;
    }

    // (104:110) {#if $$slots.OLSKStandardViewTail}
    function create_if_block_1$5(ctx) {
    	let current;
    	const OLSKStandardViewTail_slot_template = /*#slots*/ ctx[7].OLSKStandardViewTail;
    	const OLSKStandardViewTail_slot = create_slot(OLSKStandardViewTail_slot_template, ctx, /*$$scope*/ ctx[8], get_OLSKStandardViewTail_slot_context$1);

    	const block = {
    		c: function create() {
    			if (OLSKStandardViewTail_slot) OLSKStandardViewTail_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (OLSKStandardViewTail_slot) {
    				OLSKStandardViewTail_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (OLSKStandardViewTail_slot) {
    				if (OLSKStandardViewTail_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot_base(
    						OLSKStandardViewTail_slot,
    						OLSKStandardViewTail_slot_template,
    						ctx,
    						/*$$scope*/ ctx[8],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[8])
    						: get_slot_changes(OLSKStandardViewTail_slot_template, /*$$scope*/ ctx[8], dirty, get_OLSKStandardViewTail_slot_changes$1),
    						get_OLSKStandardViewTail_slot_context$1
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(OLSKStandardViewTail_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(OLSKStandardViewTail_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (OLSKStandardViewTail_slot) OLSKStandardViewTail_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$5.name,
    		type: "if",
    		source: "(104:110) {#if $$slots.OLSKStandardViewTail}",
    		ctx
    	});

    	return block;
    }

    // (104:4) 
    function create_OLSKStandardViewTail_slot(ctx) {
    	let div;
    	let current;
    	let if_block = /*$$slots*/ ctx[4].OLSKStandardViewTail && create_if_block_1$5(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div, "slot", "OLSKStandardViewTail");
    			toggle_class(div, "OLSKStandardViewTailHotfixHidden", !/*$$slots*/ ctx[4].OLSKStandardViewTail);
    			add_location(div, file$f, 103, 4, 2481);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*$$slots*/ ctx[4].OLSKStandardViewTail) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$$slots*/ 16) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$5(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*$$slots*/ 16) {
    				toggle_class(div, "OLSKStandardViewTailHotfixHidden", !/*$$slots*/ ctx[4].OLSKStandardViewTail);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_OLSKStandardViewTail_slot.name,
    		type: "slot",
    		source: "(104:4) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$f(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*mod*/ ctx[3]._ValueIsVisible && create_if_block$7(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*mod*/ ctx[3]._ValueIsVisible) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*mod*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$7(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$f.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, ['OLSKStandardViewTail','default']);
    	const $$slots = compute_slots(slots);
    	let { OLSKModalViewTitleText } = $$props;
    	let { OLSKModalViewCloseText = '' } = $$props;
    	let { OLSKModalViewIsCapped = false } = $$props;
    	let { OLSKModalViewDidClose = null } = $$props;

    	const modPublic = {
    		_OLSKModalViewIsVisible() {
    			return mod._ValueIsVisible;
    		},
    		OLSKModalViewShow() {
    			mod.ControlShow();
    		},
    		OLSKModalViewClose() {
    			mod.ControlClose();
    		}
    	};

    	const mod = {
    		// VALUE
    		_ValueIsVisible: false,
    		_ValueUpdateCallback: null,
    		// DATA
    		_DataRandomID: 'OLSKModalView_' + Math.random().toString().slice(2),
    		_DataRandomTitleID: 'OLSKModalViewTitle_' + Math.random().toString().slice(2),
    		// CONTROL
    		ControlShow() {
    			$$invalidate(
    				3,
    				mod._ValueUpdateCallback = function () {
    					l.show(mod._DataRandomID, {
    						openClass: 'OLSKModalViewOpen',
    						awaitOpenAnimation: true,
    						awaitCloseAnimation: true,
    						onClose() {
    							setTimeout(
    								function () {
    									$$invalidate(3, mod._ValueIsVisible = false, mod);
    								},
    								600
    							);

    							OLSKModalViewDidClose && OLSKModalViewDidClose();
    						}
    					});
    				},
    				mod
    			);

    			$$invalidate(3, mod._ValueIsVisible = true, mod);
    		},
    		ControlClose() {
    			l.close(mod._DataRandomID);
    		},
    		// LIFECYCLE
    		LifecycleModuleDidUpdate() {
    			if (!mod._ValueUpdateCallback) {
    				return;
    			}

    			mod._ValueUpdateCallback();
    			delete mod._ValueUpdateCallback;
    		}
    	};

    	afterUpdate(mod.LifecycleModuleDidUpdate);

    	$$self.$$.on_mount.push(function () {
    		if (OLSKModalViewTitleText === undefined && !('OLSKModalViewTitleText' in $$props || $$self.$$.bound[$$self.$$.props['OLSKModalViewTitleText']])) {
    			console.warn("<Main> was created without expected prop 'OLSKModalViewTitleText'");
    		}
    	});

    	const writable_props = [
    		'OLSKModalViewTitleText',
    		'OLSKModalViewCloseText',
    		'OLSKModalViewIsCapped',
    		'OLSKModalViewDidClose'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('OLSKModalViewTitleText' in $$props) $$invalidate(0, OLSKModalViewTitleText = $$props.OLSKModalViewTitleText);
    		if ('OLSKModalViewCloseText' in $$props) $$invalidate(1, OLSKModalViewCloseText = $$props.OLSKModalViewCloseText);
    		if ('OLSKModalViewIsCapped' in $$props) $$invalidate(2, OLSKModalViewIsCapped = $$props.OLSKModalViewIsCapped);
    		if ('OLSKModalViewDidClose' in $$props) $$invalidate(5, OLSKModalViewDidClose = $$props.OLSKModalViewDidClose);
    		if ('$$scope' in $$props) $$invalidate(8, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		OLSKModalViewTitleText,
    		OLSKModalViewCloseText,
    		OLSKModalViewIsCapped,
    		OLSKModalViewDidClose,
    		modPublic,
    		OLSKLocalized: main_1,
    		MicroModal: l,
    		mod,
    		afterUpdate,
    		OLSKStandardView: Main$e
    	});

    	$$self.$inject_state = $$props => {
    		if ('OLSKModalViewTitleText' in $$props) $$invalidate(0, OLSKModalViewTitleText = $$props.OLSKModalViewTitleText);
    		if ('OLSKModalViewCloseText' in $$props) $$invalidate(1, OLSKModalViewCloseText = $$props.OLSKModalViewCloseText);
    		if ('OLSKModalViewIsCapped' in $$props) $$invalidate(2, OLSKModalViewIsCapped = $$props.OLSKModalViewIsCapped);
    		if ('OLSKModalViewDidClose' in $$props) $$invalidate(5, OLSKModalViewDidClose = $$props.OLSKModalViewDidClose);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		OLSKModalViewTitleText,
    		OLSKModalViewCloseText,
    		OLSKModalViewIsCapped,
    		mod,
    		$$slots,
    		OLSKModalViewDidClose,
    		modPublic,
    		slots,
    		$$scope
    	];
    }

    class Main$f extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$f, create_fragment$f, safe_not_equal, {
    			OLSKModalViewTitleText: 0,
    			OLSKModalViewCloseText: 1,
    			OLSKModalViewIsCapped: 2,
    			OLSKModalViewDidClose: 5,
    			modPublic: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$f.name
    		});
    	}

    	get OLSKModalViewTitleText() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKModalViewTitleText(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKModalViewCloseText() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKModalViewCloseText(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKModalViewIsCapped() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKModalViewIsCapped(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKModalViewDidClose() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKModalViewDidClose(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get modPublic() {
    		return this.$$.ctx[6];
    	}

    	set modPublic(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/OLSKApropos/main.svelte generated by Svelte v3.59.2 */
    const file$g = "node_modules/OLSKApropos/main.svelte";

    // (25:0) {#if OLSKAproposFeedbackValue }
    function create_if_block_1$6(ctx) {
    	let a;
    	let t_value = main_1('OLSKAproposFeedbackButtonText') + "";
    	let t;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t = text(t_value);
    			attr_dev(a, "class", "OLSKAproposFeedbackButton svelte-1koztnt");
    			attr_dev(a, "href", /*OLSKAproposFeedbackValue*/ ctx[0]);
    			add_location(a, file$g, 25, 1, 462);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*OLSKAproposFeedbackValue*/ 1) {
    				attr_dev(a, "href", /*OLSKAproposFeedbackValue*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$6.name,
    		type: "if",
    		source: "(25:0) {#if OLSKAproposFeedbackValue }",
    		ctx
    	});

    	return block;
    }

    // (29:0) {#if OLSKAproposShareData }
    function create_if_block$8(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = `${main_1('OLSKAproposShareButtonText')}`;
    			attr_dev(button, "class", "OLSKAproposShareButton OLSKDecorButtonNoStyle OLSKDecorTappable svelte-1koztnt");
    			add_location(button, file$g, 29, 1, 624);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*mod*/ ctx[2].InterfaceShareButtonDidClick, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$8.name,
    		type: "if",
    		source: "(29:0) {#if OLSKAproposShareData }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$g(ctx) {
    	let div;
    	let t;
    	let if_block0 = /*OLSKAproposFeedbackValue*/ ctx[0] && create_if_block_1$6(ctx);
    	let if_block1 = /*OLSKAproposShareData*/ ctx[1] && create_if_block$8(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			attr_dev(div, "class", "OLSKApropos svelte-1koztnt");
    			add_location(div, file$g, 22, 0, 402);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t);
    			if (if_block1) if_block1.m(div, null);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*OLSKAproposFeedbackValue*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$6(ctx);
    					if_block0.c();
    					if_block0.m(div, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*OLSKAproposShareData*/ ctx[1]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$8(ctx);
    					if_block1.c();
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$g.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);
    	let { OLSKAproposFeedbackValue = null } = $$props;
    	let { OLSKAproposShareData = null } = $$props;

    	const mod = {
    		// INTERFACE
    		InterfaceShareButtonDidClick() {
    			if (main_1$2()) {
    				return window.alert(JSON.stringify(OLSKAproposShareData));
    			}

    			navigator.share(OLSKAproposShareData);
    		}
    	};

    	const writable_props = ['OLSKAproposFeedbackValue', 'OLSKAproposShareData'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('OLSKAproposFeedbackValue' in $$props) $$invalidate(0, OLSKAproposFeedbackValue = $$props.OLSKAproposFeedbackValue);
    		if ('OLSKAproposShareData' in $$props) $$invalidate(1, OLSKAproposShareData = $$props.OLSKAproposShareData);
    	};

    	$$self.$capture_state = () => ({
    		OLSKAproposFeedbackValue,
    		OLSKAproposShareData,
    		OLSKLocalized: main_1,
    		OLSK_SPEC_UI: main_1$2,
    		mod
    	});

    	$$self.$inject_state = $$props => {
    		if ('OLSKAproposFeedbackValue' in $$props) $$invalidate(0, OLSKAproposFeedbackValue = $$props.OLSKAproposFeedbackValue);
    		if ('OLSKAproposShareData' in $$props) $$invalidate(1, OLSKAproposShareData = $$props.OLSKAproposShareData);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [OLSKAproposFeedbackValue, OLSKAproposShareData, mod];
    }

    class Main$g extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$g, create_fragment$g, safe_not_equal, {
    			OLSKAproposFeedbackValue: 0,
    			OLSKAproposShareData: 1
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$g.name
    		});
    	}

    	get OLSKAproposFeedbackValue() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAproposFeedbackValue(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get OLSKAproposShareData() {
    		throw new Error("<Main>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set OLSKAproposShareData(value) {
    		throw new Error("<Main>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* os-app/open-generate/main.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$5 } = globals;
    const file$h = "os-app/open-generate/main.svelte";

    // (125:0) {#if mod._ValueIsValid }
    function create_if_block_1$7(ctx) {
    	let hr;
    	let t;
    	let snpdownload;
    	let current;

    	snpdownload = new Main$a({
    			props: {
    				SNPDownloadData: /*mod*/ ctx[0]._ValueData
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			hr = element("hr");
    			t = space();
    			create_component(snpdownload.$$.fragment);
    			add_location(hr, file$h, 126, 0, 3025);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, hr, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(snpdownload, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const snpdownload_changes = {};
    			if (dirty & /*mod*/ 1) snpdownload_changes.SNPDownloadData = /*mod*/ ctx[0]._ValueData;
    			snpdownload.$set(snpdownload_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpdownload.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpdownload.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(hr);
    			if (detaching) detach_dev(t);
    			destroy_component(snpdownload, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$7.name,
    		type: "if",
    		source: "(125:0) {#if mod._ValueIsValid }",
    		ctx
    	});

    	return block;
    }

    // (137:0) <OLSKAppToolbar  OLSKAppToolbarDispatchApropos={ mod.OLSKAppToolbarDispatchApropos }  OLSKAppToolbarDispatchTongue={ mod.OLSKAppToolbarDispatchTongue }  OLSKAppToolbarDispatchLauncher={ mod.OLSKAppToolbarDispatchLauncher }  >
    function create_default_slot_1(ctx) {
    	let a;
    	let small;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			a = element("a");
    			small = element("small");
    			small.textContent = `${main_1$1(main_1('SNPGenerateShareLinkTextFormat'), 'rosano.ca/qr')}`;
    			add_location(small, file$h, 142, 2, 3550);
    			attr_dev(a, "class", "SNPGenerateShareLink OLSKDecorPress OLSKDecorPressCall");
    			attr_dev(a, "href", "https://rosano.ca/qr");
    			attr_dev(a, "target", "_blank");
    			add_location(a, file$h, 141, 1, 3393);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, small);

    			if (!mounted) {
    				dispose = listen_dev(
    					a,
    					"click",
    					function () {
    						if (is_function(/*mod*/ ctx[0].InterfaceShareLinkDidClick)) /*mod*/ ctx[0].InterfaceShareLinkDidClick.apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(137:0) <OLSKAppToolbar  OLSKAppToolbarDispatchApropos={ mod.OLSKAppToolbarDispatchApropos }  OLSKAppToolbarDispatchTongue={ mod.OLSKAppToolbarDispatchTongue }  OLSKAppToolbarDispatchLauncher={ mod.OLSKAppToolbarDispatchLauncher }  >",
    		ctx
    	});

    	return block;
    }

    // (147:0) {#if !OLSK_SPEC_UI()}
    function create_if_block$9(ctx) {
    	let olskserviceworkerview;
    	let current;

    	olskserviceworkerview = new Main$d({
    			props: {
    				OLSKServiceWorkerRegistrationRoute: window.OLSKCanonical('SNPGenerateServiceWorkerRoute')
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(olskserviceworkerview.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(olskserviceworkerview, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(olskserviceworkerview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(olskserviceworkerview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(olskserviceworkerview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$9.name,
    		type: "if",
    		source: "(147:0) {#if !OLSK_SPEC_UI()}",
    		ctx
    	});

    	return block;
    }

    // (153:0) <OLSKModalView OLSKModalViewTitleText={ OLSKLocalized('OLSKAproposHeadingText') } bind:this={ mod._OLSKModalView } OLSKModalViewIsCapped={ true }>
    function create_default_slot$1(ctx) {
    	let olskapropos;
    	let current;

    	olskapropos = new Main$g({
    			props: {
    				OLSKAproposFeedbackValue: `javascript:window.location.href = window.atob('${window.btoa(OLSKString.OLSKStringFormatted(window.atob('bWFpbHRvOmErJUBAcmNyZWF0aXYuY29t'), 'RP_015'))}')`
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(olskapropos.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(olskapropos, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(olskapropos.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(olskapropos.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(olskapropos, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(153:0) <OLSKModalView OLSKModalViewTitleText={ OLSKLocalized('OLSKAproposHeadingText') } bind:this={ mod._OLSKModalView } OLSKModalViewIsCapped={ true }>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$h(ctx) {
    	let div1;
    	let div0;
    	let snpmake;
    	let t0;
    	let t1;
    	let footer;
    	let olskapptoolbar;
    	let t2;
    	let show_if = !main_1$2();
    	let t3;
    	let olskmodalview;
    	let current;

    	snpmake = new Main$9({
    			props: {
    				SNPFormNotValid: /*mod*/ ctx[0].SNPFormNotValid,
    				SNPFormValid: /*mod*/ ctx[0].SNPFormValid
    			},
    			$$inline: true
    		});

    	let if_block0 = /*mod*/ ctx[0]._ValueIsValid && create_if_block_1$7(ctx);

    	olskapptoolbar = new Main$c({
    			props: {
    				OLSKAppToolbarDispatchApropos: /*mod*/ ctx[0].OLSKAppToolbarDispatchApropos,
    				OLSKAppToolbarDispatchTongue: /*mod*/ ctx[0].OLSKAppToolbarDispatchTongue,
    				OLSKAppToolbarDispatchLauncher: /*mod*/ ctx[0].OLSKAppToolbarDispatchLauncher,
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	let if_block1 = show_if && create_if_block$9(ctx);

    	let olskmodalview_props = {
    		OLSKModalViewTitleText: main_1('OLSKAproposHeadingText'),
    		OLSKModalViewIsCapped: true,
    		$$slots: { default: [create_default_slot$1] },
    		$$scope: { ctx }
    	};

    	olskmodalview = new Main$f({
    			props: olskmodalview_props,
    			$$inline: true
    		});

    	/*olskmodalview_binding*/ ctx[1](olskmodalview);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(snpmake.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			footer = element("footer");
    			create_component(olskapptoolbar.$$.fragment);
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			create_component(olskmodalview.$$.fragment);
    			attr_dev(div0, "class", "OLSKViewportContent OLSKDecor");
    			add_location(div0, file$h, 120, 0, 2866);
    			attr_dev(footer, "class", "SNPGenerateViewportFooter OLSKMobileViewFooter");
    			add_location(footer, file$h, 134, 0, 3101);
    			attr_dev(div1, "class", "SNPGenerate OLSKViewport");
    			add_location(div1, file$h, 118, 0, 2826);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(snpmake, div0, null);
    			append_dev(div0, t0);
    			if (if_block0) if_block0.m(div0, null);
    			append_dev(div1, t1);
    			append_dev(div1, footer);
    			mount_component(olskapptoolbar, footer, null);
    			append_dev(footer, t2);
    			if (if_block1) if_block1.m(footer, null);
    			append_dev(div1, t3);
    			mount_component(olskmodalview, div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const snpmake_changes = {};
    			if (dirty & /*mod*/ 1) snpmake_changes.SNPFormNotValid = /*mod*/ ctx[0].SNPFormNotValid;
    			if (dirty & /*mod*/ 1) snpmake_changes.SNPFormValid = /*mod*/ ctx[0].SNPFormValid;
    			snpmake.$set(snpmake_changes);

    			if (/*mod*/ ctx[0]._ValueIsValid) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*mod*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$7(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div0, null);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			const olskapptoolbar_changes = {};
    			if (dirty & /*mod*/ 1) olskapptoolbar_changes.OLSKAppToolbarDispatchApropos = /*mod*/ ctx[0].OLSKAppToolbarDispatchApropos;
    			if (dirty & /*mod*/ 1) olskapptoolbar_changes.OLSKAppToolbarDispatchTongue = /*mod*/ ctx[0].OLSKAppToolbarDispatchTongue;
    			if (dirty & /*mod*/ 1) olskapptoolbar_changes.OLSKAppToolbarDispatchLauncher = /*mod*/ ctx[0].OLSKAppToolbarDispatchLauncher;

    			if (dirty & /*$$scope, mod*/ 5) {
    				olskapptoolbar_changes.$$scope = { dirty, ctx };
    			}

    			olskapptoolbar.$set(olskapptoolbar_changes);
    			if (show_if) if_block1.p(ctx, dirty);
    			const olskmodalview_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				olskmodalview_changes.$$scope = { dirty, ctx };
    			}

    			olskmodalview.$set(olskmodalview_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(snpmake.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(olskapptoolbar.$$.fragment, local);
    			transition_in(if_block1);
    			transition_in(olskmodalview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(snpmake.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(olskapptoolbar.$$.fragment, local);
    			transition_out(if_block1);
    			transition_out(olskmodalview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(snpmake);
    			if (if_block0) if_block0.d();
    			destroy_component(olskapptoolbar);
    			if (if_block1) if_block1.d();
    			/*olskmodalview_binding*/ ctx[1](null);
    			destroy_component(olskmodalview);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$h.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Main', slots, []);

    	const mod = {
    		// VALUE
    		_ValueIsValid: false,
    		// DATA
    		DataGenerateRecipes() {
    			const outputData = [];
    			outputData.push(...main_1$3.OLSKServiceWorkerRecipes(window, mod.DataNavigator(), main_1, main_1$2()));
    			return outputData;
    		},
    		DataNavigator() {
    			return navigator.serviceWorker
    			? navigator
    			: { serviceWorker: {} };
    		},
    		DataIsMobile() {
    			return window.innerWidth <= 760;
    		},
    		// INTERFACE
    		InterfaceShareLinkDidClick(event) {
    			if (!navigator.share) {
    				return;
    			}

    			event.preventDefault();
    			navigator.share({ url: this.href });
    		},
    		// MESSAGE
    		SNPFormNotValid() {
    			$$invalidate(0, mod._ValueIsValid = false, mod);
    		},
    		SNPFormValid(inputData) {
    			$$invalidate(0, mod._ValueIsValid = true, mod);
    			$$invalidate(0, mod._ValueData = inputData.SNPDocumentData, mod);
    		},
    		OLSKAppToolbarDispatchApropos() {
    			mod._OLSKModalView.modPublic.OLSKModalViewShow();
    		},
    		OLSKAppToolbarDispatchTongue() {
    			if (window.Launchlet.LCHSingletonExists()) {
    				return window.Launchlet.LCHSingletonDestroy();
    			}

    			// #hotfix launchlet show all items
    			let selected;

    			window.Launchlet.LCHSingletonCreate({
    				LCHOptionRecipes: main$3.OLSKLanguageSwitcherRecipes({
    					ParamLanguageCodes: window.OLSKPublicConstants('OLSKSharedPageLanguagesAvailable'),
    					ParamCurrentLanguage: window.OLSKPublicConstants('OLSKSharedPageCurrentLanguage'),
    					ParamSpecUI: main_1$2(),
    					ParamRouteConstant: window.OLSKPublicConstants('OLSKSharedActiveRouteConstant'),
    					OLSKCanonical: window.OLSKCanonical
    				}).map(function (e) {
    					const item = e.LCHRecipeCallback;

    					return Object.assign(e, {
    						LCHRecipeCallback() {
    							selected = item;
    						}
    					});
    				}),
    				LCHOptionCompletionHandler() {
    					selected && selected();
    				},
    				LCHOptionMode: Launchlet.LCHModePreview,
    				LCHOptionLanguage: window.OLSKPublicConstants('OLSKSharedPageCurrentLanguage')
    			});
    		},
    		OLSKAppToolbarDispatchLauncher() {
    			if (window.Launchlet.LCHSingletonExists()) {
    				return window.Launchlet.LCHSingletonDestroy();
    			}

    			window.Launchlet.LCHSingletonCreate({
    				LCHOptionRecipes: mod.DataGenerateRecipes(),
    				LCHOptionLanguage: window.OLSKPublicConstants('OLSKSharedPageCurrentLanguage')
    			});
    		}
    	};

    	const writable_props = [];

    	Object_1$5.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Main> was created with unknown prop '${key}'`);
    	});

    	function olskmodalview_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			mod._OLSKModalView = $$value;
    			$$invalidate(0, mod);
    		});
    	}

    	$$self.$capture_state = () => ({
    		OLSKLocalized: main_1,
    		OLSKFormatted: main_1$1,
    		OLSK_SPEC_UI: main_1$2,
    		OLSKLanguageSwitcher: main$3,
    		OLSKServiceWorker: main_1$3,
    		mod,
    		SNPMake: Main$9,
    		SNPDownload: Main$a,
    		OLSKAppToolbar: Main$c,
    		OLSKServiceWorkerView: Main$d,
    		OLSKModalView: Main$f,
    		OLSKApropos: Main$g,
    		OLSKString
    	});

    	return [mod, olskmodalview_binding];
    }

    class Main$h extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Main",
    			options,
    			id: create_fragment$h.name
    		});
    	}
    }

    const SNPGenerate = new Main$h({
    	target: document.body,
    });

    return SNPGenerate;

}());
//# sourceMappingURL=ui-behaviour.js.map
