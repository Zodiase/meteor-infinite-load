/**
 * Common interface shared by both client and server code.
 * For inheritance only, should not be instantiated directly.
 */
InfiniLoadBase = class InfiniLoadBase {

  /**
   * Configurable options existing on both client side and server side.
   * @typedef {Object} CommonOptions
   * @property {String} [id="default"] The ID of this instance unique within this collection. Case in-sensitive.
   * @property {Boolean} [verbose=false] Set to `true` to turn on the verbose mode. More logs will be spit out.
   */

  /**
   * Common constructor shared by both client and server code.
   * @param {Mongo.Collection} collection The collection this InfiniLoad instance belongs to.
   * @param {CommonOptions} [options] Optional configurations.
   */
  constructor (collection, options = {}) {
    check(collection, Mongo.Collection, 'Invalid collection.');
    check(options, Match.ObjectIncluding({
      'id': Match.Optional(String),
      'verbose': Match.Optional(Boolean)
    }));

    this._originalCollection = collection;
    this._id = (options.id || self._CONST.DEFAULT_ID).toLowerCase();
    this._verbose = options.verbose || false;

    this._collectionName = self.getInstanceCollectionName(this._originalCollection._name, this._id);
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
    const d = self._CONST.NAMESPACE_DELIMITER;

    return self._CONST.COLLECTION_NAMESPACE +
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
const self = InfiniLoadBase;

/**
 * Gather all constants here for easier management.
 * @private
 * @type {Object}
 */
InfiniLoadBase._CONST = {
  DEFAULT_ID: 'default',
  COLLECTION_NAMESPACE: '__InfiniLoad',
  NAMESPACE_DELIMITER: '/',
  STATS_DOCUMENT_ID: 0
};

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadBase._DATA = {
};
