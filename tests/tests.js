import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tinytest } from "meteor/tinytest";
import { InfiniLoad } from "meteor/zodiase:infinite-load";

// Collection used for testing.
const dataCollection = new Mongo.Collection('test');

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

// Server side resetting for each pass of tests.
if (Meteor.isServer) {
  Tinytest.add('Reset - server', function (test) {
    dataCollection.remove({});
    test.ok();
  });

  Meteor.methods({
    'newlib' (options) {
      check(options, Object);
      options.id = newInstanceId();
      options.verbose = true;
      const infiniServer = new lib(dataCollection, options);
      saveInstance(options.id, infiniServer);
      console.log('new lib ready', options.id);
      return options.id;
    },
    'prepareData' (amount, secret) {
      check(amount, Number);
      check(secret, String);

      // Remove existing data to ensure the count is accurate.
      dataCollection.remove({
        secret
      });

      for (let i = 0; i < amount; ++i) {
        dataCollection.insert({
          secret,
          createTime: Date.now()
        });
      }

      return amount;
    },
    'insert' (docs) {
      if (!Array.isArray(docs)) {
        docs = [docs];
      }
      check(docs, [Object]);

      const docIds = new Array(docs.length);

      for (let i = 0; i < docs.length; ++i) {
        delete docs[i]._id;
        docs[i].createTime = Date.now();
        docIds[i] = dataCollection.insert(docs[i]);
      }

      return docIds;
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
    verbose: true
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
    verbose: true
  });
  saveInstance(id, inst);

  test.throws(function () {
    const inst = new lib(dataCollection, {
      id,
      verbose: true
    });
  });
});

if (Meteor.isClient) {
  //! For debugging only.
  window.Meteor = Meteor;

  const initialLoadLimit = 3;
  const loadIncrement = 5;
  const oldItemCount = 37;
  const newItemCount = 7;

  Tinytest.addAsync('Basics - client side methods', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }

      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

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

      next();
    };

    Meteor.call('newlib', {}, onLibReady);
  });

  Tinytest.addAsync('Basics - client side properties', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }

      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

      const properties = {
        'originalCollection': Mongo.Collection,
        'id': String,
        'collectionName': String,
        'rawCollection': Mongo.Collection
      };
      for (let key of Object.keys(properties)) {
        test.equal(Match.test(inst[key], properties[key]), true);
      }

      next();
    };

    Meteor.call('newlib', {}, onLibReady);
  });

  Tinytest.addAsync('APIs - test state before starting', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement
    };

    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }

      // Server side is ready.

      const id = result;

      // Instantiate client side.
      const inst = new lib(dataCollection, {
        id,
        verbose: true,
        ...libOptions
      });

      // Check state before starting.
      test.equal(inst.find({}).count(), 0);
      test.equal(typeof inst.findOne({}), 'undefined');
      test.equal(inst.count(), 0);
      test.equal(inst.countMore(), 0);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), 0);
      test.equal(inst.hasMore(), false);
      test.equal(inst.hasNew(), false);

      next();
    };

    Meteor.call('newlib', libOptions, onLibReady);
  });

  Tinytest.addAsync('APIs - test start, stop and ready cycle', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement
    };

    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }

      // Server side is ready.

      const id = result;

      // Instantiate client side.
      const inst = new lib(dataCollection, {
        id,
        verbose: true,
        ...libOptions
      });

      inst.start().ready(() => {
        test.ok();

        inst.stop().ready(next);
      });
    };

    Meteor.call('newlib', libOptions, onLibReady);
  });

  Tinytest.addAsync('APIs - test stats after started', function (test, next) {
    const secret = Meteor.uuid();

    Meteor.call('prepareData', oldItemCount, secret, (error, result) => {
      if (error) {
        throw error;
      }

      const libOptions = {
        initialLimit: initialLoadLimit,
        limitIncrement: loadIncrement,
        selector: {
          secret
        }
      };
      Meteor.call('newlib', libOptions, (error, result) => {
        if (error) {
          throw error;
        }

        // Server side is ready.

        const id = result;

        // Instantiate client side.
        const inst = new lib(dataCollection, {
          id,
          verbose: true,
          ...libOptions
        });

        inst.start().ready(() => {
          test.equal(inst.find({}).count(), initialLoadLimit);
          test.equal(inst.count(), initialLoadLimit);
          test.equal(inst.limit, initialLoadLimit);
          test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
          test.equal(inst.countNew(), 0);
          test.equal(inst.countTotal(), oldItemCount);
          test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
          test.equal(inst.hasNew(), false);

          inst.stop().ready(next);
        });
      });
    });
  });

  Tinytest.addAsync('APIs - test `.loadMore()`', function (test, next) {
    const secret = Meteor.uuid();

    Meteor.call('prepareData', oldItemCount, secret, (error, result) => {
      if (error) {
        throw error;
      }

      const libOptions = {
        initialLimit: initialLoadLimit,
        limitIncrement: loadIncrement,
        selector: {
          secret
        }
      };

      Meteor.call('newlib', libOptions, (error, result) => {
        if (error) {
          throw error;
        }

        // Server side is ready.

        const id = result;

        // Instantiate client side.
        const inst = new lib(dataCollection, {
          id,
          verbose: true,
          ...libOptions
        });

        inst.start().ready(() => {
          inst.loadMore().ready(() => {
            test.equal(inst.find({}).count(), initialLoadLimit + loadIncrement);
            test.equal(inst.count(), initialLoadLimit + loadIncrement);
            test.equal(inst.limit, initialLoadLimit + loadIncrement);
            test.equal(inst.countMore(), oldItemCount - (initialLoadLimit + loadIncrement));
            test.equal(inst.countNew(), 0);
            test.equal(inst.countTotal(), oldItemCount);
            test.equal(inst.hasMore(), oldItemCount > (initialLoadLimit + loadIncrement));
            test.equal(inst.hasNew(), false);

            inst.stop().ready(next);
          });
        });
      });
    });
  });

  Tinytest.addAsync('APIs - test stats after added new', function (test, next) {
    const secret = Meteor.uuid();

    Meteor.call('prepareData', oldItemCount, secret, (error, result) => {
      if (error) {
        throw error;
      }

      const libOptions = {
        initialLimit: initialLoadLimit,
        limitIncrement: loadIncrement,
        selector: {
          secret
        }
      };

      Meteor.call('newlib', libOptions, (error, result) => {
        if (error) {
          throw error;
        }

        // Server side is ready.

        const id = result;

        // Instantiate client side.
        const inst = new lib(dataCollection, {
          id,
          verbose: true,
          ...libOptions
        });

        inst.start().ready(() => {

          const newItems = [];

          // Use loadIncrement for new item count.
          for (let i = 0; i < newItemCount; ++i) {
            newItems.push({
              secret
            });
          }

          Meteor.call('insert', newItems, (error, result) => {
            if (error) {
              throw error;
            }

            inst.sync().ready(() => {
              test.equal(inst.find({}).count(), initialLoadLimit);
              test.equal(inst.count(), initialLoadLimit);
              test.equal(inst.limit, initialLoadLimit);
              test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
              test.equal(inst.countNew(), newItemCount);
              test.equal(inst.countTotal(), oldItemCount + newItemCount);
              test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
              test.equal(inst.hasNew(), newItemCount > 0);

              inst.stop().ready(next);
            });
          });
        });
      });
    });
  });

  Tinytest.addAsync('APIs - test `.loadNew()`', function (test, next) {
    const secret = Meteor.uuid();

    Meteor.call('prepareData', oldItemCount, secret, (error, result) => {
      if (error) {
        throw error;
      }

      const libOptions = {
        initialLimit: initialLoadLimit,
        limitIncrement: loadIncrement,
        selector: {
          secret
        }
      };

      Meteor.call('newlib', libOptions, (error, result) => {
        if (error) {
          throw error;
        }

        // Server side is ready.

        const id = result;

        // Instantiate client side.
        const inst = new lib(dataCollection, {
          id,
          verbose: true,
          ...libOptions
        });

        inst.start().ready(() => {

          const newItems = [];

          // Use loadIncrement for new item count.
          for (let i = 0; i < newItemCount; ++i) {
            newItems.push({
              secret
            });
          }

          Meteor.call('insert', newItems, (error, result) => {
            if (error) {
              throw error;
            }

            inst.sync().ready(() => {

              inst.loadNew().ready(() => {
                test.equal(inst.find({}).count(), initialLoadLimit + newItemCount);
                test.equal(inst.count(), initialLoadLimit + newItemCount);
                test.equal(inst.limit, initialLoadLimit + newItemCount);
                test.equal(inst.countMore(), oldItemCount - initialLoadLimit);
                test.equal(inst.countNew(), 0);
                test.equal(inst.countTotal(), oldItemCount + newItemCount);
                test.equal(inst.hasMore(), oldItemCount > initialLoadLimit);
                test.equal(inst.hasNew(), false);

                inst.stop().ready(next);
              });
            });
          });
        });
      });
    });
  });

  Tinytest.addAsync('APIs - subscribe, sync and test global ready events', function (test, next) {
    const libOptions = {
      initialLimit: initialLoadLimit,
      limitIncrement: loadIncrement
    };

    Meteor.call('newlib', libOptions, (error, result) => {
      if (error) {
        throw error;
      }

      // Server side is ready.

      const id = result;

      // Instantiate client side.
      const inst = new lib(dataCollection, {
        id,
        verbose: true,
        ...libOptions
      });

      let readyCount = 0;
      inst.on('ready', () => {
        readyCount += 1;
      });

      inst.start().ready(() => {
        test.equal(readyCount, 0);

        inst.sync().ready(() => {
          test.equal(readyCount, 1);

          inst.stop().ready(next);
        });
      });
    });


  });

}
