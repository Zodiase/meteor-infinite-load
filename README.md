Infinite Load for Meteor
========================
A helper library for loading items from a collection incrementally and also know how many new items are available to be pulled.

Usage
------------------------
```CoffeeScript
# Client Side
template.onCreated (template) ->
	template = this
	###
	InfiniLoad
		@param Mongo.Collection collection The collection of which we are loading.
		@param Object options Possible options are explained below.
		@return WrappedCollection An interface object to get the data and events.
	###
	wrappedCollection = InfiniLoad collection, {
		# Specify how many documents to load at first.
		# Optional. Default: 10.
		initialLimit: Number
		# Specify how many documents to load every time using `loadMore`.
		# Optional. Default: Same as `initialLimit`.
		limitIncrement: Number
		# Specify a template instance to be associated with all the computations and
		#   subscriptions.
		# Optional. If not specified, `Tracker` and `Meteor` will be used, which means
		#   some clean-up needs to be done. See more details below.
		tpl: template
	}
	
	# `wrappedCollection` would have the following interfaces:
	
	# A shortcut to the original `collection.find`.
	# Reactive.
	visibleDocumentCursor = wrappedCollection.find(filter, options)
	# Get the number of documents that have been loaded.
	# Reactive.
	loadedDocumentCount = wrappedCollection.count()
	# Get the number of new documents that are available to be loaded.
	# Reactive.
	newUnloadedDocumentCount = wrappedCollection.countNew()
	# Check if there are any more old documents to load.
	# Reactive.
	hasOldDocumentToLoad = wrappedCollection.hasMore()
	# Load `amount` of old documents. If `amount` is not specified, `limitIncrement` in
	# the collection options would be used.
	wrappedCollection.loadMore(amount)
	# Load all of the new documents.
	wrappedCollection.loadNew()
	# Get the number of all documents.
	totalDocumentCount = wrappedCollection.countTotal()
	
	# If the `tpl` was not specified in the collection options, `wrappedCollection` would
	# have oen more interface:
	
	# Stoppeds the autoruns and subscriptions.
	wrappedCollection.stop()
	
	return
```

