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

    /**
     * Launch sequence:
     *   - Check parameters.
     *   - Initialize variables.
     *   - Publish data.
     */

    check(options, Match.ObjectIncluding({
      'selector': Match.Optional(Match.OneOf(Object, Function)),
      'sort': Match.Optional(Match.OneOf(Object, Function)),
      'fields': Match.Optional(Match.OneOf(Object, Function)),
      'timeField': Match.Optional(Match.OneOf(String, {
        'name': Match.Optional(String),
        'type': Match.Optional(String)
      })),
      'affiliation': Match.Optional(Function),
      'slowdown': Match.Optional(Number)
    }));

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

    this._selectorGenerator = (typeof options.selector === 'function')
                              ? options.selector
                              : self._CONST.OP_RETURN_THIS.bind(options.selector);

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
  }
});

/**
 * Store runtime data.
 * @private
 * @type {Object}
 */
InfiniLoadServer._DATA = _.extend({}, InfiniLoadBase._DATA, /** @lends InfiniLoadServer._DATA */{
});

module.exports = InfiniLoadServer;
