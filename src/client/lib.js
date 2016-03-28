/**
 * Client side interface for loading collection data incrementally.
 * @extends InfiniLoadBase
 */
class InfiniLoadClient extends InfiniLoadBase {

  /**
   * Configurable options for client side.
   * @typedef {Object} InfiniLoadClient~ClientOptions
   * @extends InfiniLoadBase~CommonOptions
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
     * @type {Number}
     */
    this._initialLimit = options.initialLimit || 10;
    /**
     * How many more documents to load by default when `.loadMore()` is called.
     * @private
     * @type {Number}
     */
    this._limitIncrement = options.limitIncrement || this._initialLimit;

    /**
     * Indicate whether this instance is started.
     * @private
     * @type {Boolean}
     */
    this._started = false;
    /**
     * Reactive store of the current request Id.
     * Every time any of the request parameters changes and results in a new subscription,
     *     a new request ID is generated and used.
     * Subscription autoruns should monitor this for re-runs.
     * This value should be initialized by `.start()`.
     * @private
     * @type {String}
     */
    this._requestId = new ReactiveVar(null);
    /**
     * Runtime data representing how many documents are requested from server.
     * This value should be initialized by `.start()`.
     * @private
     * @type {Number}
     */
    this._findLimit = 0;
    /**
     * Runtime data representing when was the last request.
     * This value is sent with the subscription to allow server cut between new and old documents.
     * This value should be initialized by `.start()`.
     * This value starts with 0 (infinitely old).
     * @private
     * @type {Number}
     */
    this._lastLoadTime = 0;
    /**
     * Arbitrary data sent with the subscription to be used by server-side callback functions.
     * This value is not initialized or reset by `.start()`.
     * This value should be changed by `.setServerParameters()`.
     * This value is not used by the library at all.
     * @private
     * @type {Object}
     */
    this._serverArgs = {};
    /**
     * Use a collection for easily generating unique request IDs.
     * Each document represents a unique request and stores its related data.
     * This collection is reset on `.start()`.
     * @private
     * @type {Mongo.Collection}
     */
    this._requestDocuments = new Mongo.Collection(null);

    this._log('initializing', {
      'initialLimit': this._initialLimit,
      'limitIncrement': this._limitIncrement
    });

    /**
     * Store callback functions for each event.
     * @private
     * @type {Object.<String, Function>}
     */
    this._eventHandlers = {};
    /**
     * Store computations.
     * @private
     * @type {Object.<String, Object>}
     */
    this._computations = {};
    /**
     * Store subscriptions.
     * @private
     * @type {Object.<String, Object>}
     */
    this._subscriptions = {};
    /**
     * The dedicated collection storing data for this InfiniLoad instance, including the stats document.
     * @private
     * @type {Mongo.Collection}
     */
    this._rawCollection = this._getRawCollection();
  }

  /**
   * Static methods.
   */

  /**
   * Getters and Setters.
   */

  /**
   * Get the dedicated collection for this instance for this collection.
   * @returns {Mongo.Collection}
   */
  get rawCollection () {
    return this._rawCollection;
  }

  /**
   * Get the stats document.
   * @returns {Object}
   */
  get stats () {
    return this.rawCollection.findOne(self._CONST.STATS_DOCUMENT_ID);
  }

  /**
   * Instance methods.
   */

  /**
   * Get the dedicated collection for this instance for this collection.
   * @returns {Mongo.Collection}
   */
  _getRawCollection () {
    // Shortcut.
    const collections = self._DATA.collections;

    const collectionName = this.originalCollection._name;
    const instanceId = this.id;
    const instanceCollectionName = this.collectionName;

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
   * Same as `Mongo.Collection.prototype.find`.
   */
  find (selector = {}, options = {}) {
    const realSelector = {
      $and: [
        self._CONST.FILTER_STATS_DOCUMENT,
        selector
      ]
    };
    return this.rawCollection.find(realSelector, options);
  }

  /**
   * Same as `Mongo.Collection.prototype.findOne`.
   */
  findOne (selector = {}, options = {}) {
    options.limit = 1;
    return this.find(selector, options).fetch()[0];
  }

  /**
   * Return the number of documents that have been loaded.
   * @returns {Number}
   */
  count () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.loadedDocumentCount;
  }

  /**
   * Return the number of old documents that have not been loaded yet.
   * @returns {Number}
   */
  countMore () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.moreDocumentToLoadCount;
  }

  /**
   * Return the number of new documents that have not been loaded yet.
   * @returns {Number}
   */
  countNew () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.newDocumentToLoadCount;
  }

  /**
   * Return the number of all documents in the collection.
   * @returns {Number}
   */
  countTotal () {
    const stats = this.stats;
    return (!stats) ? 0 : stats.totalDocumentCount;
  }

  /**
   * Returns `true` if there are more old documents to load.
   * @returns {Boolean}
   */
  hasMore () {
    return this.countMore() > 0;
  }

  /**
   * Returns `true` if there are more new documents to load.
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
   * Helper function for calling event handlers.
   * @private
   * @param {String} eventName
   *        Name of the event.
   * @param {Object} context
   *        Context for the callbacks.
   * @param {Array.<*>} args
   *        The arguments to be passed to callbacks.
   */
  _callEventHandlers (eventName, context, args) {
    check(eventName, String);
    check(context, Object);
    check(args, Array);

    // Shortcut.
    const eList = self._CONST.SUPPORTED_EVENTS;

    if (eList.indexOf(eventName) === -1) {
      return;
    }
    //else
    for (let handler of this._eventHandlers[eventName]) {
      handler.apply(context, args);
    }
  }

  /**
   * Helper function for creating a new request document.
   * @private
   * @returns {String}
   *          The ID of the new request document.
   */
  _newRequest () {
    const newRequestDocument = {
      createdAt: Date.now()
    };
    const newRequestId = this._requestDocuments.insert(newRequestDocument);
    return newRequestId;
  }

  /**
   * Helper function for creating a new request document and apply its ID to trigger autoruns.
   * @returns {String}
   *          The ID of the new request.
   */
  _useNewRequest () {
    const requestId = this._newRequest();
    this._requestId.set(requestId);
    return requestId;
  }

  /**
   * Helper function for saving request parameters into the collection.
   * @private
   * @param {String} requestId
   * @param {Object} params
   */
  _saveRequestParameters (requestId, params) {
    check(requestId, String);
    check(params, Object);

    this._requestDocuments.update(requestId, {
      $set: {
        params
      }
    });
  }

  /**
   * Helper function for loading parameters of a request document from the collection.
   * Returns null if the request document doesn't exist or it doesn't have the data.
   * @private
   * @param {String} requestId
   * @returns {Object|null}
   */
  _loadRequestParameters (requestId) {
    check(requestId, String);

    const requestDoc = this._requestDocuments.findOne(requestId);
    return (!requestDoc) ? null : (requestDoc.params || null);
  }

  /**
   * Helper function for marking the start time of a request in its request document.
   * @private
   * @param {String} requestId
   */
  _markRequestStart (requestId) {
    check(requestId, String);

    this._requestDocuments.update(requestId, {
      $set: {
        startAt: Date.now()
      }
    });
  }

  /**
   * Helper function for marking the ready time of a request in its request document.
   * @private
   * @param {String} requestId
   */
  _markRequestReady (requestId) {
    check(requestId, String);

    this._requestDocuments.update(requestId, {
      $set: {
        readyAt: Date.now()
      }
    });
  }

  _onSubscriptionReady (requestId) {
    this._log('subscription ready');
    this._markRequestReady(requestId);
  }

  /**
   * Update the subscription when the request ID changes.
   * Reacts to `this._requestId`.
   * @private
   */
  _subscriptionAutorun (comp) {
    const requestId = this._requestId.get();

    if (!requestId) {
      this._log('void subscription autorun', requestId);
      return;
    }

    this._log('subscription autorun', requestId);

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
      args: this._serverArgs,
      limit: this._findLimit,
      lastLoadTime: this._lastLoadTime
    };

    this._log('subscribe', parameters);
    this._saveRequestParameters(requestId, parameters);
    this._markRequestStart(requestId);
    this._subscriptions['content'] = this._subscribe(this.collectionName, parameters, this._onSubscriptionReady.bind(this, requestId));
  }

  /**
   * Start all the automations. If a template instance is provided, all the automations will be attached to it so they will be terminated automatically.
   * @param {Blaze.TemplateInstance} [template]
   */
  start (template) {
    check(template, Match.Optional(Blaze.TemplateInstance));

    if (this._started) {
      throw new Error('InfiniLoadClient ' + this.collectionName + ' already started.');
    }

    this._log('starting...');

    this._started = true;

    // Initialize variables.
/*
    this._requestId.set(null);
    this._findLimit = this._initialLimit;
    this._lastLoadTime = 0;
    this._requestDocuments.remove({});
*/

    if (template) {
      this._log('autorun/subscribe with template');
      this._autorun = template.autorun.bind(template);
      this._subscribe = template.subscribe.bind(template);
      template.view.onViewDestroyed(this.stop.bind(this));
    } else {
      this._autorun = Tracker.autorun.bind(Tracker);
      this._subscribe = Meteor.subscribe.bind(Meteor);
    }

    this._computations['subscription'] = this._autorun(this._subscriptionAutorun.bind(this));

    this._useNewRequest();

    this._log('started');
  }

  /**
   * Stop all the automations.
   */
  stop () {
    if (!this._started) {
      return;
    }

    this._log('stopping...');

    // Stop all computations.
    for (let name of Object.keys(this._computations)) {
      let comp = this._computations[name];
      if (!comp.stopped) {
        comp.stop();
      }
    }
    // Stop all subscriptions.
    for (let name of Object.keys(this._subscriptions)) {
      let sub = this._subscriptions[name];
      // It's OK to call `stop` multiple times.
      sub.stop();
    }

    // Reset variables.
    delete this._autorun;
    delete this._subscribe;

    this._requestId.set(null);
    this._findLimit = this._initialLimit;
    this._lastLoadTime = 0;
    this._requestDocuments.remove({});

    this._started = false;

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

module.exports = InfiniLoadClient;
