const Rae = require('rae-lite')
const rae = new Rae()

rae.create()
	.search('casa')
	.then(console.log)