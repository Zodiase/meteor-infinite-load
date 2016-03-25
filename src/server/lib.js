/**
 * Server side interface for loading collection data incrementally.
 * @extends InfiniLoadBase
 */
class InfiniLoadServer extends InfiniLoadBase {

  /**
   * Configurable options for server side.
   * @typedef {Object} ServerOptions
   * @extends CommonOptions
   * @property {Object|Function} [selector={}]
   * @property {Object|Function} [sort={}]
   * @property {Object|Function} [fields={}]
   * @property {String|{name: String, type: String}} [timeField]
   * @property {Function} [affiliation]
   * @property {Number} [slowdown=0] How much time to wait before publishing data.
   */

  /**
   * Creates a new server side InfiniLoad instance for a Mongo.Collection.
   * @param {Mongo.Collection} collection The collection this InfiniLoad instance belongs to.
   * @param {ServerOptions} [options] Optional configurations.
   */
  constructor (collection, options = {}) {
    super(collection, options);
    const me = this;

    /**
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

    me._log('publish', me.collectionName);
    Meteor.publish(me.collectionName, function (options = {}) {
      check(options, self._CONST.PUBLISH_OPTIONS_PATTERN);

      // `Date.now()` is faster than `new Date().getTime()`.
      const now = Date.now();

      const requestId = options.requestId;
      const serverArgs = options.args || {};
      const findLimit = options.limit || 0;
      // If `lastLoadTime` is not specified, it is `now`.
      const lastLoadTime = options.lastLoadTime || now;

      const findSelector = getFindSelector(this.userId, serverArgs);
      const findSort = getFindSort(this.userId, serverArgs);
      findSort[timeFieldName] = -1;
      const findFields = getFindFields(this.userId, serverArgs);

      const cursor = collection.find(findSelector, {
        'sort': findSort,
        'limit': findLimit,
        'fields': findFields
      });

      let latestDocTime = 0,
          totalDocCount = 0,
          newDocCount = 0,
          oldDocCount = 0,
          loadedDocument = new Map(),
          initializing = true;

      const GenerateStatsDocument = () => {
        return {
          requestId,
          latestDocTime,
          totalDocCount,
          newDocCount,
          oldDocCount,
          loadedDocCount: loadedDocument.size,
          selector: findSelector,
          sort: findSort,
          fields: findFields,
          limit: findLimit
        };
      }

      const addStatsDocumentToClient = () => {
        this.added(me.collectionName, self._CONST.STATS_DOCUMENT_ID, GenerateStatsDocument());
      };

      const changeStatsDocumentOnClient = () => {
        this.changed(me.collectionName, self._CONST.STATS_DOCUMENT_ID, GenerateStatsDocument());
      };

      const observer = cursor.observe({
        'added': (doc) => {
          me._log('added', doc._id, doc);

          // An added document always counts towards total document count.
          totalDocCount++;

          // Time field value must be able to be converted to a number.
          let timeValue = Number(doc[timeFieldName]);

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
            if (loadedDocument.size < findLimit) {
              me._log('sending to client', doc._id);
              loadedDocument.set(doc._id, doc);
              this.added(me.collectionName, doc._id, doc);
            }
          }

          if (!initializing) {
            changeStatsDocumentOnClient();
          }
        },
        'changed': (newDoc, oldDoc) => {
          me._log('changed', oldDoc._id, newDoc, oldDoc);
          // Assume the time field never changes so we don't need to worry about documents jumping around in the list.

          if (loadedDocument.has(oldDoc._id)) {
            me._log('updating to client', oldDoc._id);
            loadedDocument.set(oldDoc._id, newDoc);
            this.changed(me.collectionName, oldDoc._id, newDoc);
          }
        },
        'removed': (doc) => {
          me._log('removed', doc._id, doc);

          // An removed document always counts towards total document count.
          totalDocCount--;

          // Time field value must be able to be converted to a number.
          let timeValue = Number(doc[timeFieldName]);

          // If this doc is new to the client, update new document count. Otherwise update old document count.
          if (timeValue > lastLoadTime) {
            newDocCount--;
          } else {
            oldDocCount--;
            if (loadedDocument.has(doc._id)) {
              me._log('removing from client', doc._id);
              loadedDocument.delete(doc._id);
              this.removed(me.collectionName, doc._id);
            }
          }

          if (!initializing) {
            changeStatsDocumentOnClient();
          }
        }
      });

      initializing = false;

      addStatsDocumentToClient();

      this.ready();
      this.onStop(() => {
        observer.stop();
      });
    });
  }

  /**
   * Static methods.
   */

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

module.exports = InfiniLoadServer;
