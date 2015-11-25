Package.describe({
  name: 'zodiase:infinite-load',
  version: '0.0.3',
  // Brief, one-line summary of the package.
  summary: 'A helper library for loading items from a collection incrementally.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/Zodiase/meteor-infinite-load.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'check',
    'blaze-html-templates',
    'tracker',
    'reactive-var'
  ]);
  api.addFiles('infinite-load.client.js', 'client');
  api.addFiles('infinite-load.server.js', 'server');
  api.export('InfiniLoad');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('zodiase:infinite-load');
  api.addFiles('infinite-load-tests.js');
});
