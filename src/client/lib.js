/**
 * Client side interface for loading collection data incrementally.
 * @extends InfiniLoadBase
 */
class InfiniLoadClient extends InfiniLoadBase {

  /**
   * Configurable options for client side.
   * @typedef {Object} ClientOptions
   * @extends CommonOptions
   */

  /**
   * Creates a new client side InfiniLoad instance for a Mongo.Collection.
   * @inheritdoc
   * @param {Mongo.Collection} collection The collection this InfiniLoad instance belongs to.
   * @param {ClientOptions} [options] Optional configurations.
   */
  constructor (collection, options = {}) {
    super(collection, options);
    const me = this;

    /**
     * Launch sequence:
     *   - Check parameters.
     *   - Initialize variables.
     */

    /**
     * Store callback functions for each event.
     * @private
     * @type {Object.<String, Function>}
     */
    me._eventHandlers = {};

    //!
    me._log('subscribe', me.collectionName);
    Meteor.subscribe(me.collectionName, {requestId: '0'});
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
   * @param {Number} [amount] The amount to load. If omitted, the default amount would be used.
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
   * @param {String} events A list of space separated event names.
   * @param {Function} handler The callback function.
   * @returns {InfiniLoadClient} For chaining.
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
   * @param {String} events A list of space separated event names.
   * @param {Function} handler The matching callback function.
   * @returns {InfiniLoadClient} For chaining.
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
   * @param {String} eventName Name of the event.
   * @param {Object} context Context for the callbacks.
   * @param {Array.<*>} args The arguments to be passed to callbacks.
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

  start () {}

  stop () {}

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
  ]
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
