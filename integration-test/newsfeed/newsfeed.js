var newsfeed = new Mongo.Collection('newsfeed');

if (Meteor.isClient) {
  window.newsfeed = newsfeed;

  var expectingNewItem = false;

  var infiniNewsFeed = InfiniLoad(newsfeed, {
    'onReady': function (collection) {
      console.warn('newsfeed ready');
    },
    'onUpdate': function (collection) {
      console.warn('newsfeed update');
    },
    'verbose': true
  });

  Router.route('/', function () {
    this.layout('layout', {
      'data': {
        'showNewsfeed': true
      }
    });
    this.render('newsfeed');
  });

  Router.route('/about', function () {
    this.layout('layout', {
      'data': {
        'showAbout': true
      }
    });
    this.render('about');
  });

  Template.layout.events({
    'click .trigger-go2newsfeed': function (event, tpl) {
      Router.go('/');
    },
    'click .trigger-go2about': function (event, tpl) {
      Router.go('/about');
    }
  });

  Template.newsfeed.onCreated(function () {
    infiniNewsFeed.start(this);
    this.autorun(function () {
      var newItemCount = infiniNewsFeed.countNew();
      console.warn('newItemCount changed!');
      if (expectingNewItem && newItemCount > 0) {
        console.warn('try to load the new item!');
        infiniNewsFeed.loadNew();
      }
    });
  });
  Template.newsfeed.helpers({
    'hasNew': function () {
      return infiniNewsFeed.hasNew();
    },
    'hasMore': function () {
      return infiniNewsFeed.hasMore();
    },
    'items': function () {
      return infiniNewsFeed.find({}, {
        'sort': {
          'createTime': -1
        }
      });
    }
  });
  Template.newsfeed.events({
    'click .trigger-loadNew': function (event, tpl) {
      infiniNewsFeed.loadNew();
    },
    'click .trigger-loadMore': function (event, tpl) {
      infiniNewsFeed.loadMore();
    },
    'click .trigger-delete-item': function (event, tpl) {
      var target = event.currentTarget,
          _id = target.getAttribute('data-id');
      newsfeed.remove({
        '_id': _id
      });
    },
    'submit form#form-list__add': function (event, tpl) {
      event.preventDefault();
      var $input = tpl.$('#input-add-message'),
          msg = $input.val().trim();
      if (msg) {
        $input.val('');
        expectingNewItem = true;
        newsfeed.insert({
          'content': msg
        }, function (error, docId) {
          console.warn('insert done!');
          if (error) {
            expectingNewItem = false;
          }
        });
      }
      $input.focus();
    }
  });
}

if (Meteor.isServer) {
  newsfeed.before.insert(function (userId, doc) {
    doc.createTime = Date.now();
  });
  InfiniLoad(newsfeed, {
    'selector': {},
    'sort': {},
    'fields': {
      'content': 1,
      'createTime': 1
    },
    'timeFieldName': 'createTime',
    'verbose': true
  });
  Meteor.methods({
    'reset': function () {
      newsfeed.remove({});
    }
  });
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
