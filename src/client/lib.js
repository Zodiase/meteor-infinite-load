class InfiniLoad extends BaseClass {
  constructor (collection, options) {
    super(collection, options);
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
    const collections = InfiniLoad._DATA.collections;

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
    return this.rawCollection.findOne(InfiniLoad._CONST.STATS_DOCUMENT_ID);
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
        InfiniLoad._CONST.FILTER_STATS_DOCUMENT,
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

  loadMore () {}

  loadNew () {}

  setServerParameters () {}

  getServerParameters () {}

  on () {}

  off () {}

  start () {}

  stop () {}

}

// Gather all constants here for easier management.
InfiniLoad._CONST = _.extend({}, BaseClass._CONST, {
  FILTER_STATS_DOCUMENT: {
    _id: {
      $ne: BaseClass._CONST.STATS_DOCUMENT_ID
    }
  }
});

// Store runtime data.
InfiniLoad._DATA = _.extend({}, BaseClass._DATA, {
  /**
    * Each unique instance for a unique collection would have a dedicated
    *     collection for its data. So this is a map of map of collections.
    * I.e. A instance with ID "foo" for collection "bar" would have its
    *     collection at `collections.bar.foo`.
    * These collections are only needed on client side.
    */
  collections: new Map()
});

module.exports = InfiniLoad;
