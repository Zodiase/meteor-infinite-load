import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { check, Match } from 'meteor/check';
import { InfiniLoadBase } from './base.js';

/**
 * @external Map
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map}
 */
/**
 * @external Set
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set}
 */

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
   * Use the add callback to add affiliated documents.
   * @callback InfiniLoadServer~Affiliation
   * @param {Object} doc
   * @param {Function} add
   *        Same as `this.added` in `Meteor.publish`; pass the collection name as the first parameter, document ID as the second, and the document as the third.
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
   *           Use this function to add more documents to be published alongside.
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

    /***************************************************************************
      Check parameters.
    ***************************************************************************/

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

    if (self._CONST.SUPPORTED_TIME_TYPES.indexOf(timeFieldType) < 0) {
      throw new Error('Error when initializing InfiniLoadServer ' + me.id + '. "' +
        timeFieldType + '" is not a supported time field type.');
    }

    /***************************************************************************
      Initialize variables.
    ***************************************************************************/

    const getFindSelector = (typeof selector === 'function')
                            ? selector
                            : self._CONST.OP_RETURN_THIS.bind(selector);
    const getFindSort = (typeof sort === 'function')
                        ? sort
                        : self._CONST.OP_RETURN_THIS.bind(sort);
    const getFindFields = (typeof fields === 'function')
                          ? fields
                          : self._CONST.OP_RETURN_THIS.bind(fields);

    /***************************************************************************
      Publish data.
    ***************************************************************************/

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
      // When userId changes the connection will be reset.
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

      const initialLoad = options.lastLoadTime === 0;
      me._log('initialLoad', String(initialLoad));

      const serverArgs = options.args || {};
      const findLimit = options.limit || 0;
      const lastLoadTime = initialLoad ? now : options.lastLoadTime;
      // This value is used in selectors.
      const lastLoadTime_typed = self._CONST.CONVERT_TIME[timeFieldType](lastLoadTime);

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
          initializing = true,
          /**
           * Stores records of affiliated documents. Indexed by collection.
           * @ignore
           * @type {Map.<CollectionName, Map.<DocumentId, {BoxedDocument}>>}
           */
          affiliatedDocumentsByCollection = new Map(),
          /**
           * Stores records of affiliated documents. Indexed by core document ID.
           * @ignore
           * @type {Map.<DocumentId, Map.<CollectionName, Set.<DocumentId>>>}
           */
          affiliatedDocumentsByCoreDocId = new Map();

      // This function is passed to affiliation function since in order to add a document, multiple pieces of data are needed.
      const addAffiliatedDocument = (coreDocId, collectionName, docId, doc) => {
        check(coreDocId, String);
        check(collectionName, String);
        check(docId, String);
        check(doc, Object);
        check(doc._id, docId);

        if (!affiliatedDocumentsByCollection.has(collectionName)) {
          affiliatedDocumentsByCollection.set(collectionName, new Map());
        }
        // @type {Map.<DocumentId, {BoxedDocument}>}
        const affiliatedDocumentsInCollection = affiliatedDocumentsByCollection.get(collectionName);

        if (!affiliatedDocumentsInCollection.has(docId)) {
          const boxedDocument = {
            collectionName,
            id: docId,
            document: doc,
            references: new Set([coreDocId])
          };
          affiliatedDocumentsInCollection.set(docId, boxedDocument);
          connection.added(collectionName, docId, doc);
        } else {
          const boxedDocument = affiliatedDocumentsInCollection.get(docId);
          // boxedDocument.collectionName === collectionName
          // boxedDocument.id === docId
          // boxedDocument.references.has(coreDocId) ?
          if (!boxedDocument.references.has(coreDocId)) {
            boxedDocument.references.add(coreDocId);
          }
          // boxedDocument.document === doc ?
          if (!_.isEqual(boxedDocument.document, doc)) {
            boxedDocument.document = doc;
            connection.changed(collectionName, docId, doc);
          }
        }

        // Save index by core document ID for fast searching.

        if (!affiliatedDocumentsByCoreDocId.has(coreDocId)) {
          affiliatedDocumentsByCoreDocId.set(coreDocId, new Map());
        }
        // @type {Map.<CollectionName, Set.<DocumentId>>}
        const affiliatedDocumentsOfCoreDoc = affiliatedDocumentsByCoreDocId.get(coreDocId);

        if (!affiliatedDocumentsOfCoreDoc.has(collectionName)) {
          affiliatedDocumentsOfCoreDoc.set(collectionName, new Set());
        }
        // @type {Set.<DocumentId>}
        const affiliatedDocumentsOfCoreDocInCollection = affiliatedDocumentsOfCoreDoc.get(collectionName);
        affiliatedDocumentsOfCoreDocInCollection.add(docId);
      };

      // Removes all affiliated documents of a core document, used when the core document is being removed from the client.
      const removeAffiliatedDocuments = (coreDocId) => {
        if (affiliatedDocumentsByCoreDocId.has(coreDocId)) {
          // @type {Map.<CollectionName, Set.<DocumentId>>}
          const affiliatedDocumentsOfCoreDoc = affiliatedDocumentsByCoreDocId.get(coreDocId);

          affiliatedDocumentsOfCoreDoc.forEach((/* @type {Set.<DocumentId>} */affiliatedDocIds, /* @type {String} */collectionName) => {
            if (affiliatedDocumentsByCollection.has(collectionName)) {
              // @type {Map.<DocumentId, {BoxedDocument}>}
              const affiliatedDocumentsInCollection = affiliatedDocumentsByCollection.get(collectionName);

              affiliatedDocIds.forEach((docId) => {
                if (affiliatedDocumentsInCollection.has(docId)) {
                  const boxedDocument = affiliatedDocumentsInCollection.get(docId);

                  // Delete a reference.
                  if (boxedDocument.references.has(coreDocId)) {
                    boxedDocument.references.delete(coreDocId);
                  }

                  // If the affiliated document has no references, delete it.
                  if (boxedDocument.references.size === 0) {
                    affiliatedDocumentsInCollection.delete(docId);
                    connection.removed(boxedDocument.collectionName, boxedDocument.id);
                  }
                }
              });

              // If the collection has no document in it, delete it.
              if (affiliatedDocumentsInCollection.size === 0) {
                affiliatedDocumentsByCollection.delete(collectionName);
              }
            }
          });

          // In the end, delete this index.
          affiliatedDocumentsByCoreDocId.delete(coreDocId);
        }
      };

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
         * @property {Object} serverArgs
         *           A copy of the server parameters received from client.
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
          limit: findLimit,
          serverArgs
        };
      }

      const addStatsDocumentToClient = () => {
        const newStatsDoc = GenerateStatsDocument();
        me._log('newStatsDoc', newStatsDoc);
        connection.added(me.collectionName, self._CONST.STATS_DOCUMENT_ID, newStatsDoc);
      };

      const changeStatsDocumentOnClient = () => {
        const newStatsDoc = GenerateStatsDocument();
        me._log('newStatsDoc', newStatsDoc);
        connection.changed(me.collectionName, self._CONST.STATS_DOCUMENT_ID, newStatsDoc);
      };

      // Queue up items to be sent to client.
      // @type {Array.<Object>}
      const itemsToSend = [],
            sortingFields = Object.keys(findSort),
            sortFunc = (a, b) => {
              // Start with the first sorting field and calculate the result.
              // If the result is inconclusive (=== 0), use the next sorting field
              //     until the result is conclusive or the sorting fields run out.

              let sortingFieldIndex = 0,
                  sortingFieldName,
                  sortingCondition,
                  result;
              do {
                sortingFieldName = sortingFields[sortingFieldIndex];
                sortingCondition = findSort[sortingFieldName];

                result = (a[sortingFieldName] - b[sortingFieldName]) * sortingCondition;

                sortingFieldIndex++;
              } while (result === 0 && sortingFieldIndex < sortingFields.length);

              return result;
            };

      // Important: the order in which observer goes over docs does NOT depend
      //     on findSort. In fact it's the insertion order.
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

            if (initializing) {
              // When initializing, queue up all old docs in itemsToSend.
              itemsToSend.push(doc);
              // Sort right now and do a quick cut-off to avoid queuing up too many items.
              itemsToSend.sort(sortFunc);
              itemsToSend.length = Math.min(itemsToSend.length, findLimit);
            } else {
              // When not initializing, do not send old docs.
            }
          }

          if (!initializing) {
            changeStatsDocumentOnClient();
          }
        },
        'changed': (newDoc, oldDoc) => {
          me._log('changed', oldDoc._id, newDoc, oldDoc);

          // Should not happen when initializing. But if it does, ignore it.
          if (initializing) {
            return;
          }

          // Assume the time field never changes so we don't need to worry about documents jumping around in the list.

          //! Need to handle the time field changes in the future.
          if (loadedDocuments.has(oldDoc._id)) {
            const cachedDoc = loadedDocuments.get(oldDoc._id);
            if (_.isEqual(cachedDoc, newDoc)) {
              me._log('no change needed for client', oldDoc._id);
            } else {
              // Send affiliated documents first.
              if (affiliation) {
                // Affiliation should use the second parameter to add documents.
                affiliation(newDoc, addAffiliatedDocument.bind(me, oldDoc._id));
              }

              me._log('updating to client', oldDoc._id);
              loadedDocuments.set(oldDoc._id, newDoc);
              connection.changed(me.collectionName, oldDoc._id, newDoc);
            }
          }
        },
        'removed': (doc) => {
          me._log('removed', doc._id, doc);

          // Should not happen when initializing. But if it does, ignore it.
          if (initializing) {
            return;
          }

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
              // Send affiliated documents first.
              if (affiliation) {
                removeAffiliatedDocuments(doc._id);
              }

              me._log('removing from client', doc._id);
              loadedDocuments.delete(doc._id);
              connection.removed(me.collectionName, doc._id);
            }
          }

          changeStatsDocumentOnClient();
        }
      });

      me._log('items to send', itemsToSend.map((doc) => doc._id));
      // Send documents.
      for (let i = 0, n = itemsToSend.length; i < n; ++i) {
        const doc = itemsToSend[i];

        // Send affiliated documents first.
        if (affiliation) {
          // Affiliation should use the second parameter to add documents.
          affiliation(doc, addAffiliatedDocument.bind(me, doc._id));
        }

        me._log('sending to client', doc._id);
        loadedDocuments.set(doc._id, doc);
        connection.added(me.collectionName, doc._id, doc);
      }

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
  }),
  SUPPORTED_TIME_TYPES: [
    'number', 'date'
  ],
  CONVERT_TIME: {
    'number' (numValue) {
      return numValue;
    },
    'date' (numValue) {
      return new Date(numValue);
    }
  }
});

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadServer._DATA = _.extend({}, InfiniLoadBase._DATA, /** @lends InfiniLoadServer._DATA */{
});

export const InfiniLoad = InfiniLoadServer;
