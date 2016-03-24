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
   * Instance methods.
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

  findOne () {}

  count () {}

  countMore () {}

  countNew () {}

  countTotal () {}

  hasMore () {}

  hasNew () {}

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
