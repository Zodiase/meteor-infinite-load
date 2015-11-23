InfiniLoad = function (collection, options) {
  "use strict";

  var statsCollectionName, contentCollectionName, findOptions, timeFieldName,
      sortOptions, findFields, countingFields;

  check(collection, Mongo.Collection);
  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    findOptions: Match.Optional(Object),
    findFields: Match.Optional(Object),
    timeFieldName: Match.Optional(String)
  })));
  if (options == null) {
    options = {};
  }

  statsCollectionName = '__InfiniLoad-Stats-' + collection._name;
  contentCollectionName = '__InfiniLoad-Content-' + collection._name;
  findOptions = options.findOptions ? options.findOptions : {};
  findFields = options.findFields ? options.findFields : {};
  timeFieldName = options.timeFieldName ? options.timeFieldName : 'createTime';
  sortOptions = {};
  sortOptions[timeFieldName] = -1;
  countingFields = {};
  countingFields[timeFieldName] = 1;

  Meteor.publish(statsCollectionName, function(options) {
    var now, self, initializing,
        totalDocumentCount, totalDocumentCursor, totalDocumentHandle,
        latestDocumentTime, latestDocumentCursor,
        newDocumentCount, newDocumentCursor, newDocumentHandle,
        newDocumentFindOptions,
        GetReturnObject, Changed;

    check(options, Match.Optional(Match.ObjectIncluding({
      lastLoadTime: Match.Optional(Number)
    })));

    now = (new Date).getTime();
    if (options == null) {
      options = {};
    }
    if (options.lastLoadTime == null || options.lastLoadTime === 0) {
      options.lastLoadTime = now;
    }

    self = this;
    initializing = true;

    totalDocumentCount = 0;
    totalDocumentCursor = collection.find(findOptions, {
      sort: sortOptions,
      fields: countingFields
    });

    latestDocumentTime = 0;
    latestDocumentCursor = collection.find(findOptions, {
      sort: sortOptions,
      limit: 1,
      fields: countingFields
    });
    if (latestDocumentCursor.count() === 0) {
      latestDocumentTime = now;
    } else {
      latestDocumentTime = latestDocumentCursor.fetch()[0].createTime;
    }

    newDocumentCount = 0;
    newDocumentFindOptions = {};
    newDocumentFindOptions[timeFieldName] = {
      $gt: options.lastLoadTime
    };
    newDocumentCursor = collection.find({
      $and: [
        findOptions,
        newDocumentFindOptions
      ]
    }, {
      sort: sortOptions,
      fields: countingFields
    });

    GetReturnObject = function() {
      return {
        totalDocumentCount: totalDocumentCount,
        latestDocumentTime: latestDocumentTime,
        newDocumentCount: newDocumentCount
      };
    };
    Changed = function() {
      self.changed(statsCollectionName, 0, GetReturnObject());
    };

    totalDocumentHandle = totalDocumentCursor.observeChanges({
      added: function(id, fields) {
        totalDocumentCount++;
        if (fields.createTime > latestDocumentTime) {
          latestDocumentTime = fields.createTime;
        }
        if (initializing) {
          return;
        }
        Changed();
      },
      removed: function(id) {
        totalDocumentCount--;
        Changed();
      }
    });
    newDocumentHandle = newDocumentCursor.observeChanges({
      added: function(id) {
        newDocumentCount++;
        if (initializing) {
          return;
        }
        Changed();
      },
      removed: function(id) {
        newDocumentCount--;
        Changed();
      }
    });

    initializing = false;
    self.added(statsCollectionName, 0, GetReturnObject());
    self.ready();

    self.onStop(function() {
      totalDocumentHandle.stop();
      newDocumentHandle.stop();
    });

    return;
  });

  Meteor.publish(contentCollectionName, function(options) {
    var oldDocumentFindOptions, oldDocumentCursor;
    
    check(options, Match.Optional(Match.ObjectIncluding({
      limit: Match.Optional(Number),
      lastLoadTime: Match.Optional(Number)
    })));

    if (options == null) {
      options = {};
    }
    if (options.limit == null) {
      options.limit = 0;
    }
    if (options.lastLoadTime == null) {
      options.lastLoadTime = (new Date).getTime();
    }

    oldDocumentFindOptions = {};
    oldDocumentFindOptions[timeFieldName] = {
      $lte: options.lastLoadTime
    };

    oldDocumentCursor = collection.find({
      $and: [
        findOptions,
        oldDocumentFindOptions
      ]
    }, {
      sort: sortOptions,
      limit: options.limit,
      fields: findFields
    });
    
    return oldDocumentCursor;
  });
  return;
};
