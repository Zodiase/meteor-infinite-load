import { Mongo } from 'meteor/mongo';
import { check, Match } from 'meteor/check';

/**
 * Common interface shared by both client and server code.
 * For inheritance only, should not be instantiated directly.
 */
class InfiniLoadBase {

  /**
   * Configurable options existing on both client side and server side.
   * @typedef {Object} InfiniLoadBase~CommonOptions
   * @property {String} [id="default"]
   *           The ID of this instance unique within this collection. Case in-sensitive.
   * @property {Boolean} [verbose=false]
   *           Set to `true` to turn on the verbose mode. More logs will be spit out.
   */

  /**
   * Common constructor shared by both client and server code.
   * @param {Mongo.Collection} collection
   *        The collection this InfiniLoad instance belongs to.
   * @param {InfiniLoadBase~CommonOptions} [options]
   *        Optional configurations.
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

    self._registerInstance(this);

    if (!this._verbose) {
      this._log = self._CONST.OP_NOOP;
    }
  }

  /**
   * Static methods.
   */

  /**
   * Returns the name of the dedicated collection for the specified InfiniLoad instance.
   * @param {String} collectionName
   *        Name of the collection this InfiniLoad instance belongs to.
   * @param {String} instanceId
   *        ID of this InfiniLoad instance.
   * @returns {String}
   */
  static getInstanceCollectionName (collectionName, instanceId) {
    check(collectionName, String);
    check(instanceId, String);

    const d = self._CONST.NAMESPACE_DELIMITER;

    return self._CONST.COLLECTION_NAMESPACE +
           d + encodeURIComponent(collectionName) +
           d + encodeURIComponent(instanceId);
  }

  /**
   * Add the instance to the tracking list. Throws if it already exists.
   * @param {InfiniLoadBase} instance
   */
  static _registerInstance (instance) {
    check(instance, self);

    // Shortcut.
    const instances = self._DATA.instances;

    const collectionName = instance.originalCollection._name;
    const instanceId = instance.id;
    const instanceCollectionName = instance.collectionName;

    if (!instances.has(instanceCollectionName)) {
      instances.set(instanceCollectionName, instance);
    } else {
      throw new Error(`There is already an InfiniLoad instance with ID "${instanceId}" for collection "${collectionName}".`);
    }
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
   * Returns the ID of this InfiniLoad instance.
   * IDs are unique for each collection they belong to.
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

  /**
   * Shortcut to `console.log()` for easier disabling.
   * @private
   */
  _log (...args) {
    /*eslint no-console: "off"*/
    console.log('* InfiniLoad >', this.collectionName, '>', ...args);
  }

  /**
   * Create a simple version of the input for displaying.
   * @param {*} val
   * @param {Number} [maxDepth=2]
   * @param {Number} [depth=0]
   * @returns {*}
   * @private
   */
  _inspect (val, maxDepth = 2, depth = 0) {
    check(maxDepth, Number);
    check(depth, Number);

    let result = null;

    switch (typeof val) {
    case 'string':
      result = val.length > self._CONST.INSPECT_STRING_MAX_LEN
               ? `${val.substr(0, self._CONST.INSPECT_STRING_LEFT_KEPT)} ... ${val.substr(-self._CONST.INSPECT_STRING_RIGHT_KEPT)}`
               : val;
      break;
    case 'object':
      if (Array.isArray(val)) {
        result = val.length > self._CONST.INSPECT_ARRAY_MAX_LEN
                 ? val.slice(0, self._CONST.INSPECT_ARRAY_MAX_LEN).concat(' ... ')
                 : val;
      } else if (val === null) {
        result = val;
      } else {
        if (depth > maxDepth) {
          result = '[object Object]';
        } else {
          result = {};
          for (let key of Object.keys(val)) {
            result[key] = this._inspect(val[key], maxDepth, depth + 1);
          }
        }
      }
      break;
    default:
      result = val;
      break;
    }

    return result;
  }
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
  // Document ID must be non-empty string.
  STATS_DOCUMENT_ID: '__zodiase:infinite-load__',
  INSPECT_STRING_MAX_LEN: 255,
  INSPECT_STRING_LEFT_KEPT: 170,
  INSPECT_STRING_RIGHT_KEPT: 80,
  INSPECT_ARRAY_MAX_LEN: 15,
  OP_NOOP: () => { /* NO-OP */ },
  OP_RETURN_THIS: function () {
    return this;
  }
};

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadBase._DATA = {
  /**
    * Given all the requirements, each unique collection-id pair can only have
    *     one instance, just like a `Mongo.Collection`. This applies to both
    *     client side and server side.
    * So store all the instances here for tracking.
    * @type {Map.<String, InfiniLoadBase>}
    */
  instances: new Map()
};

export { InfiniLoadBase };
