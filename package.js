Package.describe({
  name: 'zodiase:infinite-load',
  version: '0.2.0',
  // Brief, one-line summary of the package.
  summary: 'A helper library for loading items from a collection incrementally.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/Zodiase/meteor-infinite-load.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.3');
  api.use([
    'ecmascript',
    'underscore',
    'mongo',
    'blaze',
    'tracker',
    'check',
    'reactive-var',
    'reactive-dict'
  ]);
  api.mainModule('src/server.js', 'server');
  api.mainModule('src/client.js', 'client');
});

Package.onTest(function(api) {
  api.use([
    'ecmascript',
    'tinytest',
    'underscore',
    'tracker',
    'check',
    'mongo'
  ]);
  api.use('zodiase:infinite-load');
  api.addFiles('tests/tests.js');
});
