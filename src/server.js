import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { InfiniLoadBase } from './base.js';

/**
 * Server side interface for loading collection data incrementally.
 * @extends InfiniLoadBase
 */
class InfiniLoadServer extends InfiniLoadBase {

  /**
   * Return dynamic selector object based on user info and client parameters.
   * @callback InfiniLoadServer~SelectorFactory
   * @param {String} userId
   *        The ID of the current user.
   * @param {Object} params
   *        Parameters set by client.
   * @returns {Object}
   */

  /**
   * Return dynamic sort object based on user info and client parameters.
   * @callback InfiniLoadServer~SortFactory
   * @param {String} userId
   *        The ID of the current user.
   * @param {Object} params
   *        Parameters set by client.
   * @returns {Object}
   */

  /**
   * Return dynamic fields object based on user info and client parameters.
   * @callback InfiniLoadServer~FieldsFactory
   * @param {String} userId
   *        The ID of the current user.
   * @param {Object} params
   *        Parameters set by client.
   * @returns {Object}
   */

  /**
   * Return affiliated cursors.
   * @callback InfiniLoadServer~Affiliation
   * @param {Mongo.Cursor} cursor
   * @returns {Mongo.Cursor|Array.<Mongo.Cursor>}
   */

  /**
   * Configurable options for server side.
   * @typedef {Object} InfiniLoadServer~ServerOptions
   * @extends InfiniLoadBase~CommonOptions
   * @property {Object|InfiniLoadServer~SelectorFactory} [selector={}]
   *           The selector object or a factory function for generating the selector object.
   * @property {Object|InfiniLoadServer~SortFactory} [sort={}]
   *           The sort object or a factory function for generating the sort object.
   * @property {Object|InfiniLoadServer~FieldsFactory} [fields={}]
   *           The fields object or a factory function for generating the fields object.
   * @property {String|{name: String, type: String}} [timeField={name: "createTime", type: "number"}]
   *           The name and type of the field used for temporal sorting.
   *           If a `string` is provided, it is considered the name of the field and type is the default value `"number"`.
   * @property {InfiniLoadServer~Affiliation} [affiliation=null]
   *           Use this function to return more cursors to be published alongside.
   * @property {Number} [slowdown=0]
   *           How much time in milliseconds to wait before publishing data.
   */

  /**
   * Creates a new server side InfiniLoad instance for a Mongo.Collection.
   * @param {Mongo.Collection} collection
   *        The collection this InfiniLoad instance belongs to.
   * @param {InfiniLoadServer~ServerOptions} [options]
   *        Optional configurations.
   */
  constructor (collection, options = {}) {
    super(collection, options);
    const me = this;

    me._log('construct', options);

    /*
     * Launch sequence:
     *   - Check parameters.
     *   - Initialize variables.
     *   - Publish data.
     */

    check(options, self._CONST.CONSTRUCT_OPTIONS_PATTERN);

    const selector = options.selector || {};
    const sort = options.sort || {};
    const fields = options.fields || {};
    const timeField = (typeof options.timeField === 'string')
                      ? {name: options.timeField}
                      : options.timeField || {};
    const timeFieldName = timeField.name || 'createTime';
    const timeFieldType = timeField.type || 'number';
    /*
     * Issues with supporting affiliation:
     *   RootCollectionCursor ==(affiliation)==> AffiliatedCollectionCursors
     *   Does this process auto-rerun?
     *   How to update AffiliatedCollectionCursors when RootCollectionCursor changes?
     */
    const affiliation = options.affiliation || null;
    const slowdown = options.slowdown || 0;

    const getFindSelector = (typeof selector === 'function')
                            ? selector
                            : self._CONST.OP_RETURN_THIS.bind(selector);
    const getFindSort = (typeof sort === 'function')
                        ? sort
                        : self._CONST.OP_RETURN_THIS.bind(sort);
    const getFindFields = (typeof fields === 'function')
                          ? fields
                          : self._CONST.OP_RETURN_THIS.bind(fields);

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

    Meteor.publish(me.collectionName, function (options = {}) {
      const connection = this;
      const subscriptionId = connection._subscriptionId;
      const userId = connection.userId;
      // `Date.now()` is faster than `new Date().getTime()`.
      const now = Date.now();

      me._log('subscribe', subscriptionId, options);

      check(options, self._CONST.PUBLISH_OPTIONS_PATTERN);

      const requestId = options.requestId;

      if (options.quit || !requestId) {
        connection.ready();
        return;
      }

      const serverArgs = options.args || {};
      const findLimit = options.limit || 0;
      // If `lastLoadTime` is not specified, it is `now`.
      const lastLoadTime = options.lastLoadTime || now;

      const findSelector = getFindSelector(userId, serverArgs);
      //! Current only support Object style sort options. Need to support array style.
      const findSort = getFindSort(userId, serverArgs);
      // Enforce sort by time field.
      findSort[timeFieldName] = -1;
      const findFields = getFindFields(userId, serverArgs);

      const findOptions = {
        'sort': findSort,
        'fields': findFields
      };

      me._log('find', findSelector, findOptions);

      const cursor = collection.find(findSelector, findOptions);

      me._log('find.count', cursor.count());

      let latestDocTime = 0,
          totalDocCount = 0,
          newDocCount = 0,
          oldDocCount = 0,
          loadedDocuments = new Map(),
          initializing = true;

      const GenerateStatsDocument = () => {
        /**
         * @typedef {Object} InfiniLoadServer~StatsDocument
         * @property {String} subscriptionId
         *           The ID of the subscription.
         * @property {String} requestId
         *           The unique identifier for the subscription request.
         * @property {Number} lastLoadTime
         *           Cut-off time between new and old documents.
         * @property {Number} latestDocTime
         *           The time field value of the latest document.
         * @property {Number} totalDocCount
         *           How many documents in the collection that match the find options.
         * @property {Number} newDocCount
         *           How many documents are above than the cut-off line.
         * @property {Number} oldDocCount
         *           How many documents are below than the cut-off line.
         * @property {Number} loadedDocCount
         *           How many documents are sent to the client. This value is never larger than the find limit.
         * @property {Object} selector
         *           The final selector object used in find.
         * @property {Object} sort
         *           The final sort object used in find.
         * @property {Object} fields
         *           The final fields object used in find.
         * @property {Number} limit
         *           The find limit.
         */
        return {
          subscriptionId,
          requestId,
          lastLoadTime,
          latestDocTime,
          totalDocCount,
          newDocCount,
          oldDocCount,
          loadedDocCount: loadedDocuments.size,
          selector: findSelector,
          sort: findSort,
          fields: findFields,
          limit: findLimit
        };
      }

      const addStatsDocumentToClient = () => {
        connection.added(me.collectionName, self._CONST.STATS_DOCUMENT_ID, GenerateStatsDocument());
      };

      const changeStatsDocumentOnClient = () => {
        connection.changed(me.collectionName, self._CONST.STATS_DOCUMENT_ID, GenerateStatsDocument());
      };

      const observer = cursor.observe({
        'added': (doc) => {
          me._log('added', doc._id, doc);

          // An added document always counts towards total document count.
          totalDocCount++;

          // Time field value must be able to be converted to a number.
          let timeValue = self._getDocumentTimeValue(doc, timeFieldName, timeFieldType);

          // See if this doc is the latest on server.
          if (timeValue > latestDocTime) {
            me._log('latest document', doc._id, timeValue);
            latestDocTime = timeValue;
          }

          // If this doc is new to the client, update new document count. Otherwise update old document count.
          if (timeValue > lastLoadTime) {
            me._log('newer than client', doc._id);
            newDocCount++;
          } else {
            oldDocCount++;
            if (loadedDocuments.size < findLimit) {
              me._log('sending to client', doc._id);
              loadedDocuments.set(doc._id, doc);
              connection.added(me.collectionName, doc._id, doc);
            }
          }

          if (!initializing) {
            changeStatsDocumentOnClient();
          }
        },
        'changed': (newDoc, oldDoc) => {
          me._log('changed', oldDoc._id, newDoc, oldDoc);
          // Assume the time field never changes so we don't need to worry about documents jumping around in the list.

          //! Need to handle the time field changes in the future.
          if (loadedDocuments.has(oldDoc._id)) {
            me._log('updating to client', oldDoc._id);
            loadedDocuments.set(oldDoc._id, newDoc);
            connection.changed(me.collectionName, oldDoc._id, newDoc);
          }
        },
        'removed': (doc) => {
          me._log('removed', doc._id, doc);

          // An removed document always counts towards total document count.
          totalDocCount--;

          // Time field value must be able to be converted to a number.
          let timeValue = self._getDocumentTimeValue(doc, timeFieldName, timeFieldType);

          // If this doc is new to the client, update new document count. Otherwise update old document count.
          if (timeValue > lastLoadTime) {
            newDocCount--;
          } else {
            oldDocCount--;
            if (loadedDocuments.has(doc._id)) {
              me._log('removing from client', doc._id);
              loadedDocuments.delete(doc._id);
              connection.removed(me.collectionName, doc._id);
            }
          }

          if (!initializing) {
            changeStatsDocumentOnClient();
          }
        }
      });

      initializing = false;

      addStatsDocumentToClient();

      connection.ready();
      connection.onStop(() => {
        observer.stop();
      });
    });
    me._log('published');
  }

  /**
   * Static methods.
   */

  /**
   * Helper function for getting the time value from a document.
   * @private
   * @param {Object} doc
   * @param {String} fieldName
   * @param {String} fieldType
   * @returns {Number}
   */
  static _getDocumentTimeValue (doc, fieldName, fieldType) {
    return Number(doc[fieldName]);
  }

  /**
   * Getters and Setters.
   */

  /**
   * Instance methods.
   */

}
const self = InfiniLoadServer;

/**
 * Gather all constants here for easier management.
 * @private
 * @type {Object}
 */
InfiniLoadServer._CONST = _.extend({}, InfiniLoadBase._CONST, /** @lends InfiniLoadServer._CONST */{
  OP_RETURN_THIS: function () {
    return this;
  },
  CONSTRUCT_OPTIONS_PATTERN: Match.ObjectIncluding({
    'selector': Match.Optional(Match.OneOf(Object, Function)),
    'sort': Match.Optional(Match.OneOf(Object, Function)),
    'fields': Match.Optional(Match.OneOf(Object, Function)),
    'timeField': Match.Optional(Match.OneOf(String, {
      'name': Match.Optional(String),
      'type': Match.Optional(String)
    })),
    'affiliation': Match.Optional(Function),
    'slowdown': Match.Optional(Number)
  }),
  PUBLISH_OPTIONS_PATTERN: Match.ObjectIncluding({
    requestId: String,
    args: Match.Optional(Object),
    lastLoadTime: Match.Optional(Number)
  })
});

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadServer._DATA = _.extend({}, InfiniLoadBase._DATA, /** @lends InfiniLoadServer._DATA */{
});

export const InfiniLoad = InfiniLoadServer;
