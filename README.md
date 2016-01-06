Infinite Load for Meteor
========================
A helper library for loading items from a collection incrementally and also know how many new items are available to be pulled.

Usage
------------------------
```CoffeeScript
# Client Side
Meteor.startup () =>
  collection = new Mongo.Collection('data')

  ###
  InfiniLoad (Client)
  @param Mongo.Collection collection The collection of which we are loading.
  @param Object options Possible options are explained below.
  @return InfiniLoadClient An interface object to get the data and events.
  ###
  infiniCollection = InfiniLoad collection, {
    # A unique identifier for this wrapped collection. Useful when you need to
    #   have two InfiniLoad collections of the same Mongo.Collection.
    # Note that this option has to match on both the client and server side.
    # Optional. Default is 'default'.
    id: String

    # Specify the initial parameters sent to the server.
    # This can be later changed with setter functions.
    # Optional. Default is an empty object.
    serverParameters: Object

    # Specify how many documents to load at first.
    # Optional. Default: 10.
    initialLimit: Number

    # Specify how many documents to load every time using `loadMore`.
    # Optional. Default: Same as `initialLimit`.
    limitIncrement: Number

    # Specify a function to be called when the collection has been loaded for
    #   the first time.
    # Optional.
    onReady: Function

    # Specify a function to be called when the collection has been updated.
    # This typically happens after calling `loadMore` or `loadNew`.
    # Optional.
    onUpdate: Function

    # Set to true to show detailed logs.
    # Optional. Default is false.
    verbose: Boolean
  }

  # `infiniCollection` would have the following interfaces:

  template.onCreated (template) ->
    template = this

    # Starts the autoruns and subscriptions.
    # Optionally pass in a template instance to bind the autoruns and
    #   subscriptions to. Doing so, it is not necessary to call `.stop()`.
    infiniCollection.start(template)

    # A shortcut to the original `collection.find`.
    # Reactive.
    visibleDocumentCursor = infiniCollection.find(filter, options)

    # A shortcut to the original `collection.findOne`.
    # Reactive.
    visibleDocument = infiniCollection.findOne(filter, options)

    # Get the number of documents that have been loaded.
    # Reactive.
    loadedDocumentCount = infiniCollection.count()

    # Get the number of old documents that have not been loaded.
    # Reactive.
    moreToLoadDocumentCount = infiniCollection.countMore()

    # Get the number of new documents that are available to be loaded.
    # Reactive.
    newUnloadedDocumentCount = infiniCollection.countNew()

    # Get the number of all documents.
    # Reactive.
    totalDocumentCount = infiniCollection.countTotal()

    # Check if there are any more old documents to load.
    # Reactive.
    hasOldDocumentToLoad = infiniCollection.hasMore()

    # Check if there are any more new documents to load.
    # Reactive.
    hasNewDocumentToLoad = infiniCollection.hasNew()

    # Load `amount` of old documents. If `amount` is not specified, 
    #   `limitIncrement` in the collection options would be used.
    infiniCollection.loadMore(amount)

    # Load all of the new documents.
    infiniCollection.loadNew()

    return

  template.onDestroyed () ->
    # Stoppeds the autoruns and subscriptions.
    # If the template instance is provided when calling `.start()`, it is not
    #   necessary to do this.
    infiniCollection.stop()

    return

  return
```

```CoffeeScript
# Server Side
Meteor.startup () =>
  ###
  InfiniLoad (Server)
  @param Mongo.Collection collection The collection of which we are publishing.
  @param Object options Possible options are explained below.
  ###
  InfiniLoad collection, {
    # A unique identifier for this wrapped collection. Useful when you need to
    #   have two InfiniLoad collections of the same Mongo.Collection.
    # Note that this option has to match on both the client and server side.
    # Optional. Default is 'default'.
    id: String

    # The selector passed to `collection.find` for publishing.
    # If a function is provided instead of an object, the function will be
    #   called with the user ID as the first argument and the parameters passed
    #   from client as the second argument to generate the selector object.
    # Optional. If omitted, the empty selector will be used.
    selector: Object|Function

    # Sort options passed to `collection.find` for publishing.
    # If a function is provided instead of an object, the function will be
    #   called with the user ID as the first argument and the parameters passed
    #   from client as the second argument to generate the sort object which
    #   will be applied before the basic temporal sort.
    # Optional. If omitted, no extra sorting will be done other than the basic
    #   temporal sort.
    sort: Object|Function

    # Field options passed to `collection.find` for publishing.
    # If a function is provided instead of an object, the function will be
    #   called with the user ID as the first argument and the parameters passed
    #   from client as the second argument to generate the fields object.
    # Optional. If omitted, all fields will be returned.
    fields: Object|Function

    # Configuration for temporal sorting.
    timeField: {
      # Name of the field used for temporal sorting.
      # Optional. Default is 'createTime'.
      name: String
      # Type of the value stored.
      # The only supported values are 'number' and 'date'.
      # Optional. Default is 'number'.
      type: String
    }
    # Shorthand for specifying only the `timeField.name`.
    timeField: String

    # Function for affiliating extra data from other collections to this
    #   subscription. The function will be called with the data cursor to be
    #   published as the first argument and is expected to return another cursor
    #   or an array of cursors which are going to be published at the same time.
    # Optional. If omitted, does nothing.
    # Note that as a limitation still present as of Meteor 1.2, it is not
    #   allowed to return multiple cursors of the same collection.
    affiliation: Function

    # Set to true to show detailed logs.
    # Optional. Default is false.
    verbose: Boolean

    # Simulate slow connection by sleeping the specified amount of time before
    #   returning.
    # Optional. Default is 0 and thus does not sleep.
    slowdown: Number
  }

  return
```
