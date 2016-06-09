import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tinytest } from "meteor/tinytest";
import { InfiniLoad } from "meteor/zodiase:infinite-load";

// Collection used for testing.
const dataCollection = new Mongo.Collection('test');
const affiliatedCollection = new Mongo.Collection('test_affiliation');

// Export to window for debugging in user-agent.
if (Meteor.isClient) window.dataCollection = dataCollection;

// Alias of the library namespace, make name changing easier.
const lib = InfiniLoad;

// A record of existing instances so we don't run into name collisions unintentionally.
const instances = new Map();
// Helper function for generating an ID that does not exist in `instances`.
function newInstanceId () {
  let id = '';
  do {
    id = 'test_' + Math.random();
  } while (instances.has(id));
  return id;
}
// Helper function for checking if an instance exists.
function hasInstance (key) {
  return instances.has(key);
}
// Helper function for saving instances.
function saveInstance (key, instance) {
  if (instances.has(key)) {
    throw new Error('Instance with id "' + key + '" already exists.');
  }
  instances.set(key, instance);
}

// Basic checks.
check(lib, Function);

const affiliation_docCount = 5;

// Server side resetting for each pass of tests.
if (Meteor.isServer) {
  Tinytest.add('Reset - server', function (test) {
    dataCollection.remove({});

    affiliatedCollection.remove({});
    for (let i = 0; i < affiliation_docCount * 2; ++i) {
      affiliatedCollection.insert({
        refId: i,
        secret: Meteor.uuid()
      });
    }

    test.ok();
  });

  Meteor.methods({
    'newlib' (options) {
      check(options, Object);

      if (typeof options.affiliation !== 'undefined') {
        options.affiliation = function (doc, add) {
          affiliatedCollection.find({
            refId: doc.refId
          }).forEach((affiliatedDocument) => {
            add(affiliatedCollection._name, doc._id, doc);
          });
        };
      }

      const instId = newInstanceId();
      const infiniServer = new lib(dataCollection, {
        verbose: false,
        ...options,
        id: instId
      });
      saveInstance(instId, infiniServer);
      return instId;
    },
    'prepareData' (amount, secret) {
      check(amount, Number);
      check(secret, String);

      const docIds = new Array(amount);

      // Remove existing data to ensure the count is accurate.
      dataCollection.remove({
        secret
      });

      for (let i = 0; i < amount; ++i) {
        const createTime = Date.now();
        const docsWithSameCreateTime = dataCollection.find({ createTime });
        const createTime_id = (docsWithSameCreateTime.count() > 0)
                        ? docsWithSameCreateTime
                          .fetch()
                          .map((doc) => doc.createTime_id)
                          .reduce((a, b) => Math.max(a, b)) + 1
                        : 0;

        const docId = dataCollection.insert({
          secret,
          createTime_id,
          createTime
        });
        docIds.push(docId);
      }

      return docIds;
    },
    'insert' (docs) {
      if (!Array.isArray(docs)) {
        docs = [docs];
      }
      check(docs, [Object]);

      const docIds = new Array(docs.length);

      for (let i = 0; i < docs.length; ++i) {
        const createTime = Date.now();
        const docsWithSameCreateTime = dataCollection.find({ createTime });
        const createTime_id = (docsWithSameCreateTime.count() > 0)
                        ? docsWithSameCreateTime
                          .fetch()
                          .map((doc) => doc.createTime_id)
                          .reduce((a, b) => Math.max(a, b)) + 1
                        : 0;

        delete docs[i]._id;
        docs[i].createTime_id = createTime_id;
        docs[i].createTime = createTime;
        docIds[i] = dataCollection.insert(docs[i]);
      }

      return docIds;
    },
    'update' ({ selector, setObj }) {
      check(selector, Match.OneOf(String, Object));
      check(setObj, Object);
      dataCollection.update(selector, {
        $set: setObj
      })
    }
  });
}

Tinytest.add('Instantiation - can not call InfiniLoad without new', function (test) {
  test.throws(function () {
    lib(dataCollection);
  });
});

Tinytest.add('Instantiation - instantiation', function (test) {
  const id = newInstanceId();
  const inst = new lib(dataCollection, {
    id,
    verbose: false
  });
  saveInstance(id, inst);

  // Instance should have matching property `.id`.
  test.equal(inst.id, id);

  // Instance property `.id` should be read-only.
  const prevId = inst.id;
  inst.id = prevId + '_';
  test.equal(inst.id, prevId);

  // Instance should have property `.originalCollection`.
  test.isNotUndefined(inst.originalCollection);

  // Instance property `.originalCollection` should match the given one.
  test.equal(inst.originalCollection, dataCollection);
});

Tinytest.add('Instantiation - multiple identical instantiations throw', function (test) {
  const id = newInstanceId();
  const inst = new lib(dataCollection, {
    id,
    verbose: false
  });
  saveInstance(id, inst);

  test.throws(function () {
    const inst = new lib(dataCollection, {
      id,
      verbose: false
    });
  });
});

if (Meteor.isServer) {
  Tinytest.add('Instantiation - unsupported time field type throws', function (test) {
    const id = newInstanceId();
    test.throws(function () {
      const inst = new lib(dataCollection, {
        id,
        timeField: {
          name: 'foo',
          type: 'unsupported'
        },
        verbose: false
      });
    });
  });
}

if (Meteor.isClient) {
  //! For debugging only.
  window.Meteor = Meteor;
  window.dataCollection = dataCollection;
  window.affiliatedCollection = affiliatedCollection;

  const initialLoadLimit = 3;
  const loadIncrement = 2;
  const oldItemCount = 7;
  const newItemCount = 2;

  // Helper for wrapping `Meteor.call` in a Promise.
  const callPromise = (methodName, ...options) => {
    return new Promise((resolve, reject) => {
      Meteor.apply(methodName, options, false, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  };

  Tinytest.addAsync('Basics - client side methods', function (test, next) {
    callPromise('newlib', {})
    .then((id) => {
      const inst = new lib(dataCollection, {
        id,
        verbose: false
      });
      saveInstance(id, inst);

      const methodNames = [
        'find',
        'findOne',
        'count',
        'countMore',
        'countNew',
        'countTotal',
        'hasMore',
        'hasNew',
        'loadMore',
        'loadNew',
        'setServerParameters',
        'getServerParameters',
        'on',
        'off',
        'start',
        'stop'
      ];
      for (let key of methodNames) {
        test.equal(typeof inst[key], 'function');
      }
    })
    .then(next);
  });

  Tinytest.addAsync('Basics - client side properties', function (test, next) {
    callPromise('newlib', {})
    .then((id) => {
      const inst = new lib(dataCollection, {
        id,
        verbose: false
      });
      saveInstance(id, inst);

      const properties = {
        'originalCollection': Mongo.Collection,
        'id': String,
        'collectionName': String,
        'rawCollection': Mongo.Collection
      };
      for (let key of Object.keys(properties)) {
        test.equal(Match.test(inst[key], properties[key]), true);
      }
    })
    .then(next);
  });

  Tinytest.addAsync('APIs - test state before starting', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement,
      verbose: false
    };

    callPromise('newlib', libOptions)
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      // Check state before starting.
      test.equal(inst.find({}).count(), 0);
      test.equal(inst.find({}).fetch().length, 0);
      test.equal(typeof inst.findOne({}), 'undefined');
      test.equal(inst.count(), 0);
      test.equal(inst.countMore(), 0);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), 0);
      test.equal(inst.hasMore(), false);
      test.equal(inst.hasNew(), false);
    })
    .then(next);
  });

  Tinytest.addAsync('APIs - test start, stop and ready cycle', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement,
      verbose: false
    };

    callPromise('newlib', libOptions)
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      test.ok();

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });

  Tinytest.addAsync('APIs - test stats after started', function (test, next) {
    const secret = Meteor.uuid(),
          libOptions = {
            initialLimit: initialLoadLimit,
            limitIncrement: loadIncrement,
            selector: {
              secret
            },
            sort: {
              createTime: -1,
              createTime_id: -1
            },
            verbose: false
          };
    let preparedItemIds = null;

    callPromise('prepareData', oldItemCount, secret)
    .then((docIds) => {
      preparedItemIds = docIds;

      return callPromise('newlib', libOptions);
    })
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      test.equal(inst.find({}).count(), initialLoadLimit);
      test.equal(inst.find({}).fetch().length, initialLoadLimit);
      test.equal(inst.count(), initialLoadLimit);
      test.equal(inst.limit, initialLoadLimit);
      test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), oldItemCount);
      test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
      test.equal(inst.hasNew(), false);

      // Loaded items should be all be found in prepared data.
      let foundItemCount = 0;
      inst.find({}).fetch().forEach((item, index) => {
        if (preparedItemIds.indexOf(item._id) > -1) {
          foundItemCount++;
        }
      });
      test.equal(foundItemCount, initialLoadLimit);

      // Loaded items should be the latest ones in prepared data.
      inst.find({}).fetch().forEach((item, index) => {
        const expectedIndex = preparedItemIds.length - 1 - index;
        test.equal(preparedItemIds[expectedIndex], item._id);
      });

      return inst;
    })
    .then((inst) => inst.stop())
    .then((inst) => {
      test.equal(inst.find({}).count(), 0);
      test.equal(inst.find({}).fetch().length, 0);
      test.equal(inst.count(), 0);
      test.equal(inst.limit, 0);
      test.equal(inst.countMore(), 0);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), 0);
      test.equal(inst.hasMore(), false);
      test.equal(inst.hasNew(), false);

      return inst;
    })
    .then(next);
  });

  Tinytest.addAsync('APIs - test `.loadMore()`', function (test, next) {
    const secret = Meteor.uuid(),
          libOptions = {
            initialLimit: initialLoadLimit,
            limitIncrement: loadIncrement,
            selector: {
              secret
            },
            sort: {
              createTime: -1,
              createTime_id: -1
            },
            verbose: false
          };
    let preparedItemIds = null,
        itemsBeforeLoadMore = null;

    callPromise('prepareData', oldItemCount, secret)
    .then((docIds) => {
      preparedItemIds = docIds;

      return callPromise('newlib', libOptions);
    })
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      itemsBeforeLoadMore = inst.find({}).fetch().map((item) => item._id);

      return inst;
    })
    .then((inst) => inst.loadMore())
    .then((inst) => {
      test.equal(inst.find({}).count(), initialLoadLimit + loadIncrement);
      test.equal(inst.find({}).fetch().length, initialLoadLimit + loadIncrement);
      test.equal(inst.count(), initialLoadLimit + loadIncrement);
      test.equal(inst.limit, initialLoadLimit + loadIncrement);
      test.equal(inst.countMore(), oldItemCount - (initialLoadLimit + loadIncrement));
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), oldItemCount);
      test.equal(inst.hasMore(), oldItemCount > (initialLoadLimit + loadIncrement));
      test.equal(inst.hasNew(), false);

      inst.find({}).fetch().forEach((item, index) => {
        if (index < initialLoadLimit) {
          // The first ones are items before loadMore.
          test.equal(itemsBeforeLoadMore.indexOf(item._id), index);
        } else {
          // The last ones are newly loaded items.
          test.equal(itemsBeforeLoadMore.indexOf(item._id), -1);
        }
      });

      // Loaded items should be the latest ones in prepared data.
      inst.find({}).fetch().forEach((item, index) => {
        const expectedIndex = preparedItemIds.length - 1 - index;
        test.equal(preparedItemIds[expectedIndex], item._id);
      });

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });

  Tinytest.addAsync('APIs - test stats after added new', function (test, next) {
    const secret = Meteor.uuid(),
          libOptions = {
            initialLimit: initialLoadLimit,
            limitIncrement: loadIncrement,
            selector: {
              secret
            },
            sort: {
              createTime: -1,
              createTime_id: -1
            },
            verbose: false
          };
    let preparedItemIds = null,
        newItemIds = null;

    callPromise('prepareData', oldItemCount, secret)
    .then((docIds) => {
      preparedItemIds = docIds;

      return callPromise('newlib', libOptions);
    })
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      const newItems = [];

      // Use loadIncrement for new item count.
      for (let i = 0; i < newItemCount; ++i) {
        newItems.push({
          secret
        });
      }

      return callPromise('insert', newItems).then((docIds) => {
        newItemIds = docIds;

        return inst.sync();
      });
    })
    .then((inst) => {
      test.equal(inst.find({}).count(), initialLoadLimit);
      test.equal(inst.find({}).fetch().length, initialLoadLimit);
      test.equal(inst.count(), initialLoadLimit);
      test.equal(inst.limit, initialLoadLimit);
      test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
      test.equal(inst.countNew(), newItemCount);
      test.equal(inst.countTotal(), oldItemCount + newItemCount);
      test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
      test.equal(inst.hasNew(), newItemCount > 0);

      // Loaded items should be the latest ones in prepared data.
      inst.find({}).fetch().forEach((item, index) => {
        const expectedIndex = preparedItemIds.length - 1 - index;
        test.equal(preparedItemIds[expectedIndex], item._id);
      });

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });

  Tinytest.addAsync('APIs - test `.loadNew()`', function (test, next) {
    const secret = Meteor.uuid();
          libOptions = {
            initialLimit: initialLoadLimit,
            limitIncrement: loadIncrement,
            selector: {
              secret
            },
            sort: {
              createTime: -1,
              createTime_id: -1
            },
            verbose: false
          };
    let preparedItemIds = null,
        itemsBeforeLoadNew = null,
        newItemIds = null;

    callPromise('prepareData', oldItemCount, secret)
    .then((docIds) => {
      preparedItemIds = docIds;

      return callPromise('newlib', libOptions);
    })
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      itemsBeforeLoadNew = inst.find({}).fetch().map((item) => item._id);

      return inst;
    })
    .then((inst) => {
      const newItems = [];

      // Use loadIncrement for new item count.
      for (let i = 0; i < newItemCount; ++i) {
        newItems.push({
          secret
        });
      }

      return callPromise('insert', newItems).then((docIds) => {
        newItemIds = docIds;

        return inst.sync();
      });
    })
    .then((inst) => inst.loadNew())
    .then((inst) => {
      test.equal(inst.find({}).count(), initialLoadLimit + newItemCount);
      test.equal(inst.find({}).fetch().length, initialLoadLimit + newItemCount);
      test.equal(inst.count(), initialLoadLimit + newItemCount);
      test.equal(inst.limit, initialLoadLimit + newItemCount);
      test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), oldItemCount + newItemCount);
      test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
      test.equal(inst.hasNew(), false);

      // New items should be all be found in loaded data.
      let foundNewItemCount = 0;
      inst.find({}).fetch().forEach((item, index) => {
        if (newItemIds.indexOf(item._id) > -1) {
          foundNewItemCount++;
        }
      });
      test.equal(foundNewItemCount, newItemCount);

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });

  Tinytest.addAsync('APIs - test sync and global ready events', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement,
      verbose: false
    };

    let readyCount = 0;

    callPromise('newlib', libOptions)
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      inst.on('ready', () => {
        readyCount += 1;
      });

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => {
      test.equal(readyCount, 0);

      return inst.sync();
    })
    .then((inst) => {
      test.equal(readyCount, 1);

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });

  Tinytest.addAsync('APIs - test setting and getting server parameters', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement,
      verbose: false
    };

    const secret = {
      secret: Meteor.uuid()
    };

    callPromise('newlib', libOptions)
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    .then((inst) => inst.start())
    .then((inst) => inst.setServerParameters(secret))
    .then((inst) => {
      test.equal(inst.getServerParameters(), secret);

      return inst;
    })
    .then((inst) => inst.stop())
    .then(next);
  });


  Tinytest.addAsync('APIs - test affiliation', function (test, next) {
    const secret = Meteor.uuid();

    const libOptions = {
      // Use a small load limit.
      initialLimit: affiliation_docCount,
      // We don't plan on increasing load limit.
      limitIncrement: 0,
      selector: {
        secret
      },
      // This asks the server method to fill in the test function.
      affiliation: true,
      verbose: false
    };

    // Prepare "old" docs.
    const oldItems = [];

    for (let i = 0; i < affiliation_docCount; ++i) {
      oldItems.push({
        secret,
        refId: i
      });
    }

    callPromise('insert', oldItems)
    .then(() => callPromise('newlib', libOptions))
    .then((id) => {
      // Server side is ready.
      // Instantiate client side.
      const inst = new lib(dataCollection, {
        ...libOptions,
        id
      });
      saveInstance(id, inst);

      return inst;
    })
    // Confirm the affiliated collection is empty before start.
    .then((inst) => {
      test.equal(affiliatedCollection.find().count(), 0);
      return inst;
    })
    .then((inst) => inst.start())
    // Confirm the existance of all affiliated documents.
    .then((inst) => {
      for (let item of oldItems) {
        test.isNotUndefined(affiliatedCollection.findOne({
          refId: item.refId
        }));
      }
      return inst;
    })
    // Ask server to alter data.
    .then((inst) => {
      // Make a randomized change.
      const sourceId = Math.floor(Math.random() * (affiliation_docCount - 1)),
            targetId = affiliation_docCount + Math.floor(Math.random() * (affiliation_docCount - 1));

      // Make the change locally as well.
      oldItems[sourceId].refId = targetId;

      return callPromise('update', {
        selector: {
          secret,
          refId: sourceId
        },
        setObj: {
          refId: targetId
        }
      }).then((result) => {
        return inst.sync();
      });
    })
    // Confirm the existance of all affiliated documents.
    .then((inst) => {
      for (let item of oldItems) {
        test.isNotUndefined(affiliatedCollection.findOne({
          refId: item.refId
        }));
      }
      return inst;
    })
    .then((inst) => inst.stop())
    // Confirm the affiliated collection is empty after stop.
    .then((inst) => {
      test.equal(affiliatedCollection.find().count(), 0);
      return inst;
    })
    .then(next);
  });



  Tinytest.add('Finishing - make sure all instances are stopped', function (test) {
    instances.forEach((inst) => {
      test.equal(inst.started, false);
    });
  });
}
