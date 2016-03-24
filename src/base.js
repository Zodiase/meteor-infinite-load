class InfiniLoadBase {

  /**
   * @param {Mongo.Collection} collection The collection this InfiniLoad instance belongs to.
   * @param {Object} [options] Optional settings.
   */
  constructor (collection, options = {}) {
    check(collection, Mongo.Collection, 'Invalid collection.');
    check(options, Match.ObjectIncluding({
      'id': Match.Optional(String),
      'verbose': Match.Optional(Boolean)
    }));

    this._originalCollection = collection;
    this._id = options.id || InfiniLoadBase._CONST.DEFAULT_ID;
    this._collectionName = InfiniLoadBase.getInstanceCollectionName(this._originalCollection._name, this._id);
  }

  /**
   * Static methods.
   */

  /**
   * Returns the name of the dedicated collection for the specified InfiniLoad instance.
   * @param {String} collectionName Name of the collection this InfiniLoad instance belongs to.
   * @param {String} instanceId Id of this InfiniLoad instance.
   * @returns {String}
   */
  static getInstanceCollectionName (collectionName, instanceId) {
    const d = InfiniLoadBase._CONST.NAMESPACE_DELIMITER;

    return InfiniLoadBase._CONST.COLLECTION_NAMESPACE +
           d + encodeURIComponent(collectionName) +
           d + encodeURIComponent(instanceId);
  }

  /**
   * Getters and Setters.
   */

  /**
   * Returns the collection this InfiniLoad instance belongs to.
   * @returns {Mongo.Collection}
   */
  get originalCollection () {
    return this._originalCollection;
  }

  /**
   * Returns the Id of this InfiniLoad instance.
   * Ids are unique for each collection they belong to.
   * @returns {String}
   */
  get id () {
    return this._id;
  }

  /**
   * Returns the name of the dedicated collection for this InfiniLoad instance.
   * @returns {String}
   */
  get collectionName () {
    return this._collectionName;
  }

  /**
   * Instance methods.
   */

}
// Gather all constants here for easier management.
InfiniLoadBase._CONST = {
  DEFAULT_ID: 'default',
  COLLECTION_NAMESPACE: '__InfiniLoad',
  NAMESPACE_DELIMITER: '/',
  STATS_DOCUMENT_ID: 0
};
// Store runtime data.
InfiniLoadBase._DATA = {
};

BaseClass = InfiniLoadBase;
