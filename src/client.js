import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Blaze } from 'meteor/blaze';
import { Tracker } from 'meteor/tracker';
import { check, Match } from 'meteor/check';
import { InfiniLoadBase } from './base.js';

/**
 * Client side interface for loading collection data incrementally.
 * @extends InfiniLoadBase
 */
class InfiniLoadClient extends InfiniLoadBase {

  /**
   * Configurable options for client side.
   * @typedef {Object} InfiniLoadClient~ClientOptions
   * @extends InfiniLoadBase~CommonOptions
   * @property {Number} [initialLimit=10]
   *           The max number of documents to load on start.
   * @property {Number} [limitIncrement=initialLimit]
   *           The number of additional documents to load on `.loadMore()` by default.
   */

  /**
   * Creates a new client side InfiniLoad instance for a Mongo.Collection.
   * @inheritdoc
   * @param {Mongo.Collection} collection
   *        The collection this InfiniLoad instance belongs to.
   * @param {InfiniLoadClient~ClientOptions} [options]
   *        Optional configurations.
   */
  constructor (collection, options = {}) {
    super(collection, options);
    const me = this;

    /*
     * Launch sequence:
     *   - Check parameters.
     *   - Initialize variables.
     */

    check(options, self._CONST.CONSTRUCT_OPTIONS_PATTERN);

    /**
     * How many documents to load on start.
     * @private
     * @readonly
     * @type {Number}
     */
    me._initialLimit = options.initialLimit || 10;
    /**
     * How many more documents to load by default when `.loadMore()` is called.
     * @private
     * @readonly
     * @type {Number}
     */
    me._limitIncrement = options.limitIncrement || me._initialLimit;

    me._log('initializing', {
      'initialLimit': me._initialLimit,
      'limitIncrement': me._limitIncrement
    });

    /**
     * Namespace storing runtime data.
     * @private
     * @type {Object}
     */
    me._runtime = {};

    /**
     * Indicate whether this instance is started.
     * @type {Boolean}
     */
    me._runtime.started = false;
    /**
     * Store the current request ID.
     * Reset on start.
     * @type {String}
     */
    me._runtime.requestId = '';
    /**
     * Store the last request ID received from the stats document.
     * This value is used for checking if the request ID in the stats document has been changed.
     * Reset on start.
     * @type {String}
     */
    me._runtime.lastReceivedRequestId = '';
    /**
     * Represent how many documents are requested from server.
     * This value could be changed by `.loadMore()` or `.loadNew()`.
     * Reset on start.
     * @type {Number}
     */
    me._runtime.findLimit = 0;
    /**
     * Represent when was the last request.
     * This value is sent with the subscription to allow server cut between new and old documents.
     * Reset on start.
     * This value starts with 0 (infinitely old).
     * @type {Number}
     */
    me._runtime.lastLoadTime = 0;
    /**
     * Store computations.
     * @type {Object.<String, Object>}
     */
    me._runtime.computations = null;
    /**
     * Store the active subscription.
     * @type {Object}
     */
    me._runtime.subscription = null;

    /**
     * Arbitrary data sent with the subscription to be used by server-side callback functions.
     * This value is changed by dedicated setters.
     * This value is not consumed by the library at all.
     * @private
     * @type {Object}
     */
    me._serverArgs = {};
    /**
     * Use a collection for easily generating unique request IDs.
     * Each document represents a unique request and stores its related data.
     * Reset on start.
     * @private
     * @type {Mongo.Collection}
     */
    me._requestDocuments = new Mongo.Collection(null);

    /**
     * Store callback functions for each event.
     * @private
     * @type {Object.<String, Function>}
     */
    me._eventHandlers = {};
    /**
     * The dedicated collection storing data for this InfiniLoad instance, including the stats document.
     * @private
     * @type {Mongo.Collection}
     */
    me._rawCollection = self._getRawCollection(me);
  }

  /*****************************************************************************
    Static methods.
  *****************************************************************************/

  /**
   * Helper function for fetching the dedicated collection for the instance.
   * @private
   * @param {InfiniLoadClient} instance
   * @returns {Mongo.Collection}
   */
  static _getRawCollection (instance) {
    check(instance, self);

    // Shortcut.
    const collections = self._DATA.collections;

    const collectionName = instance.originalCollection._name;
    const instanceId = instance.id;
    const instanceCollectionName = instance.collectionName;

    if (!collections.has(collectionName)) {
      collections.set(collectionName, new Map());
    }
    const instancesForCollection = collections.get(collectionName);

    if (!instancesForCollection.has(instanceId)) {
      const newCollection = new Mongo.Collection(instanceCollectionName);
      instancesForCollection.set(instanceId, newCollection);
    }
    return instancesForCollection.get(instanceId);
  }

  /**
   * Helper function for calling event handlers.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} eventName
   *        Name of the event.
   * @param {Object} context
   *        Context for the callbacks.
   * @param {Array.<*>} args
   *        The arguments to be passed to callbacks.
   */
  static _callEventHandlers (instance, eventName, context, args) {
    check(instance, self);
    check(eventName, String);
    check(context, Object);
    check(args, Array);

    // Shortcut.
    const eList = self._CONST.SUPPORTED_EVENTS;

    if (eList.indexOf(eventName) === -1) {
      return;
    }
    //else
    for (let handler of instance._eventHandlers[eventName]) {
      handler.apply(context, args);
    }
  }

  /**
   * Helper function for creating a new request document.
   * @private
   * @param {InfiniLoadClient} instance
   * @returns {String}
   *          The ID of the new request document.
   */
  static _newRequest (instance) {
    check(instance, self);

    const newRequestDocument = {
      createdAt: Date.now(),
      params: null,
      startAt: 0,
      confirmedAt: 0,
      readyAt: 0,
      onReady: []
    };
    const newRequestId = instance._requestDocuments.insert(newRequestDocument);
    return newRequestId;
  }

  /**
   * Helper function for saving request parameters into the collection.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   * @param {Object} params
   */
  static _saveRequestParameters (instance, requestId, params) {
    check(instance, self);
    check(requestId, String);
    check(params, Object);

    instance._requestDocuments.update(requestId, {
      $set: {
        params
      }
    });
  }

  /**
   * Helper function for loading parameters of a request document from the collection.
   * Returns null if the request document doesn't exist or it doesn't have the data.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   * @returns {Object|null}
   */
  static _loadRequestParameters (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    const requestDoc = instance._requestDocuments.findOne(requestId);
    return (!requestDoc) ? null : (requestDoc.params || null);
  }

  /**
   * Helper function for adding a callback function to be called when the request is ready.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   * @param {Function} callback
   */
  static _registerRequestReadyCallback (instance, requestId, callback) {
    check(instance, self);
    check(requestId, String);
    check(callback, Function);

    instance._requestDocuments.update(requestId, {
      $push: {
        onReady: callback
      }
    });
  }

  /**
   * Helper function for triggering all ready callback functions for the request.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   */
  static _triggerRequestReadyCallbacks (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    const requestDoc = instance._requestDocuments.findOne(requestId);
    if (!requestDoc) {
      return;
    }

    const callbacks = requestDoc.onReady || [];
    for (let cb of callbacks) {
      cb();
    }
  }

  /**
   * Helper function for marking the start time of a request in its request document.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   */
  static _markRequestStart (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    instance._requestDocuments.update(requestId, {
      $set: {
        startAt: Date.now()
      }
    });
  }

  /**
   * Helper function for marking the confirm time of a request in its request document.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   */
  static _markRequestConfirmed (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    instance._requestDocuments.update(requestId, {
      $set: {
        confirmedAt: Date.now()
      }
    });
  }

  /**
   * Helper function for marking the ready time of a request in its request document.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   */
  static _markRequestReady (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    instance._requestDocuments.update(requestId, {
      $set: {
        readyAt: Date.now()
      }
    });
  }

  /**
   * Callback when a subscription call returns.
   * Never use directly and always use `.bind()` to set `this`.
   * @private
   * @param {String} requestId
   */
  static _onSubscriptionReady (requestId) {
    check(this, self);
    check(requestId, String);

    this._log('request confirmed', requestId);
    self._markRequestConfirmed(this, requestId);
  }

  /**
   * @typedef {Object} InfiniLoadClient~ActionHandle
   * @property {Function} ready
   *           Pass a callback to be executed when the action is ready.
   */

  /**
   * Helper function for generating action handles.
   * @private
   * @param {InfiniLoadClient} instance
   * @param {String} requestId
   * @returns {InfiniLoadClient~ActionHandle}
   */
  static _getActionHandle (instance, requestId) {
    check(instance, self);
    check(requestId, String);

    return {
      ready: self._registerRequestReadyCallback.bind(self, instance, requestId)
    };
  }

  /**
   * Use the latest parameters to start a new subscription.
   * @private
   * @param {InfiniLoadClient} instance
   * @returns {InfiniLoadClient~ActionHandle}
   */
  static _newSubscription (instance) {
    check(instance, self);

    const requestId = instance._runtime.requestId = self._newRequest(instance);

    /**
     * @typedef {Object} InfiniLoadServer~SubscribeOptions
     * @property {String} requestId
     *           A unique identifier for each subscription request.
     * @property {Object} args
     *           Arguments passed to find option factories.
     * @property {Number} limit
     *           How many documents to return.
     * @property {Number} lastLoadTime
     *           Cut-off time between new and old documents.
     *           This is tracked by the client so other parameters can be changed without moving the cut-off line.
     */
    const parameters = {
      requestId,
      args: instance._serverArgs,
      limit: instance._runtime.findLimit,
      lastLoadTime: instance._runtime.lastLoadTime
    };
    instance._log('new request', requestId, parameters);
    self._saveRequestParameters(instance, requestId, parameters);
    self._markRequestStart(instance, requestId);
    instance._runtime.subscription = instance._subscribe(instance.collectionName, parameters, self._onSubscriptionReady.bind(instance, requestId));

    return self._getActionHandle(instance, requestId);
  }

  /**
   * Autorun when stats are changed.
   * It checks what requests are ready by fetching the stats document, from
   *     which it gets the latest request ID and triggers its callbacks.
   * Never use directly and always use `.bind()` to set `this`.
   * @private
   */
  static _statsChangedAutorun (comp) {
    check(this, self);

    const stats = this.stats;
    // stats is undefined when the connection is not ready.
    if (!stats) {
      return;
    }

    // Check if lastLoadTime is changed (likely by server).
    if (stats.lastLoadTime > this._runtime.lastLoadTime) {
      this._runtime.lastLoadTime = stats.lastLoadTime;
    }

    // Check if requestId is changed.
    if (stats.requestId !== this._runtime.lastReceivedRequestId) {
      this._runtime.lastReceivedRequestId = stats.requestId;

      self._markRequestReady(this, stats.requestId);
      this._log('request ready', stats.requestId, stats);

      // Trigger callbacks outside of the autorun to avoid issues with Tracker.
      Meteor._setImmediate(self._triggerRequestReadyCallbacks.bind(self, this, stats.requestId));
    }
  }


  /*****************************************************************************
    Getters and Setters.
  *****************************************************************************/

  /**
   * Get the dedicated collection for this instance for this collection.
   * @returns {Mongo.Collection}
   */
  get rawCollection () {
    return this._rawCollection;
  }

  /**
   * Get the stats document.
   * @returns {InfiniLoadServer~StatsDocument}
   */
  get stats () {
    return this.rawCollection.findOne(self._CONST.STATS_DOCUMENT_ID);
  }

  /*****************************************************************************
    Instance methods.
  *****************************************************************************/

  /**
   * Same as `Mongo.Collection.prototype.find`.
   * A reactive data source.
   */
  find (selector = {}, options = {}) {
    const realSelector = {
      // 'And' with `FILTER_STATS_DOCUMENT` to filter out the stats document.
      $and: [
        self._CONST.FILTER_STATS_DOCUMENT,
        selector
      ]
    };
    return this.rawCollection.find(realSelector, options);
  }

  /**
   * Same as `Mongo.Collection.prototype.findOne`.
   * A reactive data source.
   */
  findOne (selector = {}, options = {}) {
    options.limit = 1;
    return this.find(selector, options).fetch()[0];
  }

  /**
   * Return the number of documents that have been loaded.
   * A reactive data source.
   * @returns {Number}
   */
  count () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.loadedDocumentCount;
  }

  /**
   * Return the number of old documents that have not been loaded yet.
   * A reactive data source.
   * @returns {Number}
   */
  countMore () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.moreDocumentToLoadCount;
  }

  /**
   * Return the number of new documents that have not been loaded yet.
   * A reactive data source.
   * @returns {Number}
   */
  countNew () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.newDocumentToLoadCount;
  }

  /**
   * Return the number of all documents in the collection.
   * A reactive data source.
   * @returns {Number}
   */
  countTotal () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.totalDocumentCount;
  }

  /**
   * Returns `true` if there are more old documents to load.
   * A reactive data source.
   * @returns {Boolean}
   */
  hasMore () {
    return this.countMore() > 0;
  }

  /**
   * Returns `true` if there are more new documents to load.
   * A reactive data source.
   * @returns {Boolean}
   */
  hasNew () {
    return this.countNew() > 0;
  }

  /**
   * Load more old documents from server.
   * @param {Number} [amount]
   *        The amount to load. If omitted, the default amount would be used.
   *! @returns {Object} An interface to add `onReady` handlers to this specific action.
   */
  loadMore (amount) {}

  /**
   * Load all new documents from server.
   */
  loadNew () {}

  setServerParameters () {}

  getServerParameters () {}

  /**
   * Attach an event handler function for one or more events.
   * @param {String} events
   *        A list of space separated event names.
   * @param {Function} handler
   *        The callback function.
   * @returns {InfiniLoadClient}
   *          For chaining.
   */
  on (events, handler) {
    check(events, String);
    check(handler, Function);

    // Shortcut.
    const eList = self._CONST.SUPPORTED_EVENTS;

    let eventsAry = events.split(' ')
                          .filter((x) => x.length > 0 && eList.indexOf(x) > -1);
    for (let eventName of eventsAry) {
      this._eventHandlers[eventName].push(handler);
    }
    return this;
  }

  /**
   * Remove an event handler.
   * @param {String} events
   *        A list of space separated event names.
   * @param {Function} handler
   *        The matching callback function.
   * @returns {InfiniLoadClient}
   *          For chaining.
   */
  off (events, handler) {
    check(events, Match.Optional(String));
    check(handler, Match.Optional(Function));

    // Shortcut.
    const eList = self._CONST.SUPPORTED_EVENTS;

    let eventsAry;

    if (typeof events === 'undefined') {
      // Remove all handlers.
      eventsAry = eList;
    } else {
      // Remove handlers of events.
      eventsAry = events.split(' ')
                        .filter((x) => x.length > 0 && eList.indexOf(x) > -1);
    }
    eventsAry.forEach((x) => {
      if (typeof handler === 'undefined') {
        this._eventHandlers[x] = [];
      } else {
        let handlerIndex = this._eventHandlers[x].indexOf(handler);
        if (handlerIndex > -1) {
          this._eventHandlers[x].splice(handlerIndex, 1);
        }
      }
    });
    return this;
  }

  /**
   * Start all the automations. If a template instance is provided, all the automations will be attached to it so they will be terminated automatically.
   * @param {Blaze.TemplateInstance} [template]
   * @returns {InfiniLoadClient~ActionHandle}
   */
  start (template) {
    check(template, Match.Optional(Blaze.TemplateInstance));

    if (this._runtime.started) {
      throw new Error('InfiniLoadClient ' + this.collectionName + ' already started.');
    }

    this._log('starting...');

    this._runtime.started = true;

    // Initialize variables.
    this._runtime.requestId = '';
    this._runtime.lastReceivedRequestId = '';
    this._runtime.findLimit = this._initialLimit;
    this._runtime.lastLoadTime = 0;
    this._runtime.computations = {};
    this._runtime.subscription = null;
    this._requestDocuments.remove({});

    if (template) {
      this._log('autorun/subscribe with template');
      this._autorun = template.autorun.bind(template);
      this._subscribe = template.subscribe.bind(template);
      template.view.onViewDestroyed(this.stop.bind(this));
    } else {
      this._autorun = Tracker.autorun.bind(Tracker);
      this._subscribe = Meteor.subscribe.bind(Meteor);
    }

    this._runtime.computations['checkRequestReady'] = this._autorun(self._statsChangedAutorun.bind(this));

    const handle = self._newSubscription(this);

    this._log('started');

    return handle;
  }

  /**
   * Stop all the automations.
   */
  stop () {
    if (!this._runtime.started) {
      return;
    }

    this._log('stopping...');

    // Stop all computations.
    for (let name of Object.keys(this._runtime.computations)) {
      let comp = this._runtime.computations[name];
      if (!comp.stopped) {
        comp.stop();
      }
    }
    this._runtime.computations = {};
    // Stop all subscriptions.
    if (this._runtime.subscription) {
      // It's OK to call `stop` multiple times.
      this._runtime.subscription.stop();
      this._runtime.subscription = null;
    }

    // Reset variables.
    delete this._autorun;
    delete this._subscribe;

    this._runtime.requestId = '';
    this._runtime.lastReceivedRequestId = '';
    this._runtime.findLimit = 0;
    this._runtime.lastLoadTime = 0;
    this._requestDocuments.remove({});

    this._runtime.started = false;

    this._log('stopped');
  }

}
const self = InfiniLoadClient;

/**
 * Gather all constants here for easier management.
 * @private
 * @type {Object}
 */
InfiniLoadClient._CONST = _.extend({}, InfiniLoadBase._CONST, /** @lends InfiniLoadClient._CONST */{
  FILTER_STATS_DOCUMENT: {
    _id: {
      $ne: InfiniLoadBase._CONST.STATS_DOCUMENT_ID
    }
  },
  SUPPORTED_EVENTS: [
    'ready',
    'update'
  ],
  CONSTRUCT_OPTIONS_PATTERN: Match.ObjectIncluding({
    'initialLimit': Match.Optional(Number),
    'limitIncrement': Match.Optional(Number)
  })
});

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadClient._DATA = _.extend({}, InfiniLoadBase._DATA, /** @lends InfiniLoadClient._DATA */{
  /**
    * Each unique instance for a unique collection would have a dedicated
    *     collection for its data. So this is a map of map of collections.
    * I.e. An instance with ID "foo" for collection "bar" would have its
    *     collection at `collections.bar.foo`.
    * These collections are only needed on client side.
    * @type {Map.<String, Map.<String, Mongo.Collection>>}
    */
  collections: new Map()
});

export const InfiniLoad = InfiniLoadClient;
